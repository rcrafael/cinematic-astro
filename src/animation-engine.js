/**
 * Astronimation — 3D Flyby Animation Engine
 * Cinematic 3D space flight through stars towards a Deep Sky Object.
 * Implements continuous 3D perspective projection, radial optical flow,
 * rotational roll parallax, translational pan parallax, and natural Point Spread Functions.
 */

import { Easing, degToRad, lerp, clamp, createOffscreenCanvas, getCycleOffset } from './utils.js';
import { renderStarPSF } from './star-generator.js';

/**
 * @typedef {Object} AnimationConfig
 * @property {number} duration - Total duration in seconds (10 to 30)
 * @property {number} fps - Frames per second (24, 30, 60)
 * @property {string} easing - Easing function name
 * @property {boolean} zoomEnabled
 * @property {string} zoomDirection - 'in' or 'out'
 * @property {number} zoomSpeed - 0-1
 * @property {boolean} rotationEnabled
 * @property {string} rotationDirection - 'cw' or 'ccw'
 * @property {number} rotationSpeed - degrees per second
 * @property {boolean} panEnabled
 * @property {string} panDirection - 'left','right','up','down','upleft','upright','downleft','downright'
 * @property {number} panSpeed - 0-1
 * @property {number} parallaxIntensity - 0-1 (controls 3D flyby depth and warp speed)
 * @property {boolean} twinkleEnabled
 * @property {number} twinkleIntensity - 0-1
 * @property {boolean} vignetteEnabled
 */

export class AnimationEngine {
  /**
   * @param {HTMLCanvasElement} outputCanvas - The visible canvas
   * @param {HTMLCanvasElement} dsoCanvas - The starless DSO image as canvas
   * @param {Object|Array} starData - { stars: Star3D[], baseMaskCanvas?: HTMLCanvasElement } or Star3D[][]
   * @param {AnimationConfig} config
   * @param {Object} [framing] - User framing { scale: 1.0, offsetX: 0, offsetY: 0 }
   */
  constructor(outputCanvas, dsoCanvas, starData, config, framing = {}) {
    this.canvas = outputCanvas;
    this.ctx = outputCanvas.getContext('2d');
    this.dsoCanvas = dsoCanvas;
    this.config = config;
    this.framing = {
      scale: framing.scale ?? 1.0,
      offsetX: framing.offsetX ?? 0,
      offsetY: framing.offsetY ?? 0,
    };

    this.width = outputCanvas.width;
    this.height = outputCanvas.height;

    // Normalize star data
    if (starData && starData.stars) {
      this.stars = starData.stars;
      this.baseMaskCanvas = starData.baseMaskCanvas || null;
      this.isProcedural = !starData.baseMaskCanvas;
    } else if (Array.isArray(starData)) {
      if (Array.isArray(starData[0])) {
        this.stars = starData.flat();
      } else {
        this.stars = starData;
      }
      this.baseMaskCanvas = null;
      this.isProcedural = true;
    } else {
      this.stars = [];
      this.baseMaskCanvas = null;
      this.isProcedural = true;
    }

    // Animation state
    this.isPlaying = false;
    this.isPreviewing = false;
    this.animationId = null;
    this.startTime = 0;
    this.onFrame = null;
    this.onComplete = null;

    // Easing function
    this.easingFn = Easing[config.easing] || Easing.easeInOutCubic;
  }

  /**
   * Dynamically update image framing (scale, offset) without recreating engine.
   */
  updateFraming(framing) {
    this.framing = { ...this.framing, ...framing };
  }

  /**
   * Render a single frame at the given progress (0-1).
   * Generates a 3D perspective flyby towards the DSO.
   */
  /**
   * Render a single frame at the given progress (0-1).
   * Generates a 3D perspective flyby towards the DSO.
   */
  renderFrame(progress) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2;

    const p = clamp(progress, 0, 1);
    const config = this.config;

    // Clear background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // ── 1. Calculate camera transforms ───────────────────────
    // Elapsed physical time in seconds (p * duration)
    // Zoom and flyby speeds are constant physical rates per second, NOT locked to video duration!
    const elapsedSec = p * config.duration;
    const time = elapsedSec;
    const flybyIntensity = config.parallaxIntensity !== undefined ? config.parallaxIntensity : 0.7;
    const flybySpeed = config.flybySpeed !== undefined ? config.flybySpeed : 0.5;

    // DSO Zoom: cinematic dynamic zoom on background nebula and star field
    let dsoZoom = 1.0;
    if (config.zoomEnabled) {
      // Dynamic range from gentle (1.5%/s) up to fast, dramatic zoom (28%/s at 100%)
      const zoomRatePerSec = 0.015 + Math.pow(config.zoomSpeed, 1.25) * 0.265;
      if (config.zoomDirection === 'in') {
        dsoZoom = 1.0 + elapsedSec * zoomRatePerSec;
      } else {
        const totalZoom = config.duration * zoomRatePerSec;
        dsoZoom = Math.max(0.3, (1.0 + totalZoom) - elapsedSec * zoomRatePerSec);
      }
    } else {
      const naturalZoomRate = 0.005 * flybyIntensity;
      dsoZoom = 1.0 + elapsedSec * naturalZoomRate;
    }

    // Rotation (applies to camera roll)
    let rotation = 0;
    if (config.rotationEnabled) {
      const totalDeg = config.rotationSpeed * config.duration;
      const dir = config.rotationDirection === 'ccw' ? -1 : 1;
      rotation = degToRad(p * totalDeg * dir);
    }

    // ── 3D Camera Trajectory (Organic cinematic float & lateral parallax) ──
    const driftAmp = 32 * flybyIntensity;
    const camDriftX = Math.sin(time * 0.28) * driftAmp;
    const camDriftY = Math.cos(time * 0.20) * (driftAmp * 0.6);

    let manualPanX = 0, manualPanY = 0;
    if (config.panEnabled) {
      const maxPan = w * 0.15 * config.panSpeed;
      const dirs = {
        'left': [-1, 0], 'right': [1, 0],
        'up': [0, -1], 'down': [0, 1],
        'upleft': [-1, -1], 'upright': [1, -1],
        'downleft': [-1, 1], 'downright': [1, 1],
      };
      const [dx, dy] = dirs[config.panDirection] || [0, 0];
      const norm = Math.hypot(dx, dy) || 1;
      manualPanX = (dx / norm) * maxPan * p;
      manualPanY = (dy / norm) * maxPan * p;
    }

    const camX = camDriftX + manualPanX;
    const camY = camDriftY + manualPanY;

    // ── 2. Render DSO (Deep Sky Object) background ───────────
    // DSO in the ultra-deep background experiences minimal parallax shift (0.15x)
    const dsoShiftX = -camX * 0.15;
    const dsoShiftY = -camY * 0.15;

    const dsoW = this.dsoCanvas.width;
    const dsoH = this.dsoCanvas.height;
    const baseScale = Math.max(w / dsoW, h / dsoH);
    const userScale = this.framing.scale || 1.0;
    const effectiveScale = baseScale * userScale;
    const userOffsetX = this.framing.offsetX || 0;
    const userOffsetY = this.framing.offsetY || 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(dsoZoom, dsoZoom);
    ctx.translate(
      -cx + dsoShiftX,
      -cy + dsoShiftY
    );

    const drawW = dsoW * effectiveScale;
    const drawH = dsoH * effectiveScale;
    const drawX = cx + userOffsetX - drawW / 2;
    const drawY = cy + userOffsetY - drawH / 2;

    ctx.drawImage(this.dsoCanvas, drawX, drawY, drawW, drawH);
    ctx.restore();

    // ── 3. 3D Stars Flyby Parallax ───────────────────────────
    // Physical forward velocity per second: 0.18 base velocity gives exciting, true 3D star flight!
    const speedMult = 0.35 + flybySpeed * 1.65;
    const flybyVelocity = 0.18 * speedMult * flybyIntensity;
    const dZ = elapsedSec * flybyVelocity;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
    ctx.globalCompositeOperation = 'screen';

    const minZ = 0.15;
    const maxZ = 3.80; // depth ceiling for stars entering from deep background
    const depthSpan = maxZ - minZ; // 3.65

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      const z0 = star.z || 2.2;

      // Individual star speed: each star travels at its own natural velocity
      const starSpeed = star.speedFactor !== undefined ? star.speedFactor : 1.0;
      const starDZ = dZ * starSpeed;

      let zEff, scale, sx, sy, nearFade, farFade;

      // Parallax disparity: close stars shift significantly more than distant stars!
      // At t=0, camX = 0, so starShift = 0.
      let starShiftX, starShiftY;

      // Initial base position
      let origX, origY;
      if (!this.isProcedural) {
        // Star mask: mapped accurately to DSO image framing
        origX = cx + userOffsetX + (star.x - 0.5) * dsoW * effectiveScale;
        origY = cy + userOffsetY + (star.y - 0.5) * dsoH * effectiveScale;
      } else {
        // Procedural star field: spans the full output canvas frame
        origX = star.x * w;
        origY = star.y * h;
      }

      if (starDZ < z0 - minZ) {
        // ── Cycle 0: Initial flight from original coordinates ──
        zEff = z0 - starDZ;
        scale = z0 / zEff;

        starShiftX = -camX * (1.6 / zEff);
        starShiftY = -camY * (1.6 / zEff);

        const dx = (origX - cx) * scale * dsoZoom;
        const dy = (origY - cy) * scale * dsoZoom;

        sx = cx + dx + starShiftX;
        sy = cy + dy + starShiftY;

        nearFade = clamp((zEff - minZ) / 0.35, 0, 1);
        farFade = 1.0;
      } else {
        // ── Cycle >= 1: Continuous unlimited star flyby wrapping from deep space ──
        const excessDZ = starDZ - (z0 - minZ);
        const cycle = Math.floor(excessDZ / depthSpan) + 1;
        const cycleOffset = excessDZ % depthSpan;

        zEff = maxZ - cycleOffset;
        scale = maxZ / zEff;

        starShiftX = -camX * (1.6 / zEff);
        starShiftY = -camY * (1.6 / zEff);

        const [rx, ry] = getCycleOffset(star.seed || i, cycle);
        let wrapX, wrapY;
        if (!this.isProcedural) {
          wrapX = cx + userOffsetX + (rx - 0.5) * dsoW * effectiveScale;
          wrapY = cy + userOffsetY + (ry - 0.5) * dsoH * effectiveScale;
        } else {
          wrapX = rx * w;
          wrapY = ry * h;
        }

        const dx = (wrapX - cx) * scale * dsoZoom;
        const dy = (wrapY - cy) * scale * dsoZoom;

        sx = cx + dx + starShiftX;
        sy = cy + dy + starShiftY;

        nearFade = clamp((zEff - minZ) / 0.35, 0, 1);
        farFade = clamp((maxZ - zEff) / 0.5, 0, 1);
      }

      // Culling with margin
      const margin = 35;
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
        continue;
      }

      // Smooth edge fade
      const edgeDist = Math.min(sx, w - sx, sy, h - sy);
      const edgeFade = clamp(edgeDist / 40, 0, 1);

      // Twinkle calculation
      let twinkleAlpha = 1.0;
      if (config.twinkleEnabled) {
        const tw = 0.8 + 0.2 * Math.sin(time * star.twinkleSpeed * 3 + star.twinklePhase);
        twinkleAlpha = lerp(1.0, tw, config.twinkleIntensity);
      }

      // Distance-based brightness intensity: stars become more radiant as they fly towards viewer
      const distBright = clamp(Math.pow(1.6 / zEff, 0.35), 0.7, 1.35);
      const finalAlpha = star.brightness * distBright * edgeFade * nearFade * farFade * twinkleAlpha;
      if (finalAlpha <= 0.01) continue;

      // 3D Perspective size scaling:
      let sizeFactor;
      if (this.isProcedural) {
        sizeFactor = clamp(Math.pow(1.6 / zEff, 0.88), 0.40, 5.2);
      } else {
        const baseRatio = (starDZ < z0 - minZ) ? (z0 / zEff) : (1.6 / zEff);
        sizeFactor = clamp(Math.pow(baseRatio, 0.88), 0.40, 5.2);
      }

      const starScaleFactor = !this.isProcedural ? clamp(Math.pow(userScale, 0.5), 0.6, 2.5) : 1.0;
      const apparentRadius = star.radius * sizeFactor * starScaleFactor * Math.sqrt(dsoZoom);

      renderStarPSF(ctx, sx, sy, apparentRadius, star.r, star.g, star.b, finalAlpha);
    }

    ctx.restore();

    // ── 5. Vignette Overlay ──────────────────────────────────
    if (config.vignetteEnabled) {
      const vignette = ctx.createRadialGradient(
        cx, cy, w * 0.3,
        cx, cy, w * 0.82
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /**
   * Start the live preview loop.
   */
  startPreview() {
    this.isPreviewing = true;
    this.isPlaying = true;
    this.startTime = performance.now();

    const loop = () => {
      if (!this.isPreviewing) return;

      const elapsed = (performance.now() - this.startTime) / 1000;
      const duration = this.config.duration;
      // Loop the preview
      const progress = (elapsed % duration) / duration;

      this.renderFrame(progress);
      this.animationId = requestAnimationFrame(loop);
    };

    loop();
  }

  /**
   * Stop the preview.
   */
  stopPreview() {
    this.isPreviewing = false;
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Render all frames for recording (frame-locked, not real-time).
   * Calls onFrame callback with progress for each frame.
   * @param {function} onFrame - Called with (progress: 0-1) for each frame
   * @param {function} onComplete - Called when all frames are rendered
   */
  async renderForRecording(onFrame, onComplete) {
    const totalFrames = Math.ceil(this.config.duration * this.config.fps);

    for (let frame = 0; frame <= totalFrames; frame++) {
      const progress = frame / totalFrames;
      this.renderFrame(progress);

      if (onFrame) await onFrame(progress, frame, totalFrames);

      // Yield to browser for frame capture
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    if (onComplete) onComplete();
  }

  /**
   * Update config and rebuild if needed.
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.easingFn = Easing[this.config.easing] || Easing.easeInOutCubic;
  }

  /**
   * Render a single preview frame at a specific position (for scrubbing).
   */
  renderAt(progress) {
    this.renderFrame(clamp(progress, 0, 1));
  }
}
