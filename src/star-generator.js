/**
 * Astronimation — Star Field Generator & Extractor
 * Generates realistic 3D star fields and extracts authentic stars from user star masks.
 * Implements Poisson Disk Sampling, power-law stellar brightness, continuous 3D depth,
 * and realistic astronomical Point Spread Function (PSF) rendering without bloating.
 */

import { seededRandom, kelvinToRGB, clamp } from './utils.js';

/**
 * @typedef {Object} Star3D
 * @property {number} x - Normalized X position (0 to 1)
 * @property {number} y - Normalized Y position (0 to 1)
 * @property {number} z - Initial depth Z0 (typically 1.1 to 4.5; smaller = closer to viewer)
 * @property {number} brightness - Normalized peak brightness (0.05 to 1.0)
 * @property {number} radius - Star radius in pixels
 * @property {number} r - Red channel (0-255)
 * @property {number} g - Green channel (0-255)
 * @property {number} b - Blue channel (0-255)
 * @property {number} layer - Depth layer (0=far, 1=mid, 2=near)
 * @property {number} twinklePhase - Phase offset for twinkle animation
 * @property {number} twinkleSpeed - Twinkle frequency multiplier
 * @property {HTMLCanvasElement} [sprite] - Optional pre-rendered or extracted sprite
 */

/**
 * Generate a complete 3D star field.
 * @param {Object} options
 * @param {number} options.width - Canvas width
 * @param {number} options.height - Canvas height
 * @param {number} [options.density=0.5] - Star density 0-1
 * @param {number} [options.minBrightness=0.15] - Minimum brightness
 * @param {number} [options.maxBrightness=0.9] - Maximum brightness
 * @param {number} [options.colorTemp=0.5] - Color temperature (0=cool blue, 1=warm red)
 * @param {number} [options.seed=42] - Random seed
 * @returns {{ stars: Star3D[], layers: Star3D[][] }}
 */
export function generateStarField(options) {
  const {
    width,
    height,
    density = 0.5,
    minBrightness = 0.15,
    maxBrightness = 0.85,
    colorTemp = 0.5,
    seed = 42,
  } = options;

  const rng = seededRandom(seed);

  // Spacing scales smoothly with density
  // Generates ~400 stars at 0%, ~1,300 stars at 30%, ~2,200 stars at 50%, up to ~3,800 stars at 100%
  const baseDist = Math.min(width, height);
  const minDist = baseDist * (0.016 + 0.038 * Math.pow(1 - density, 1.2));

  // Generate positions for Wave 0 using Poisson Disk Sampling
  let positions = poissonDiskSampling(width, height, minDist, rng);
  // Cap max Wave 0 count to prevent performance bottlenecks
  const maxWave0 = Math.round(500 + density * 1800);
  if (positions.length > maxWave0) {
    positions = positions.slice(0, maxWave0);
  }

  // Maximum star brightness with +25% additional brightness boost
  const effectiveMaxBrightness = maxBrightness * 1.25;

  const stars = [];

  // ── Wave 0: Base Foreground & Midground Stars (0s - 9s) ──
  // Prominent stars distributed across the DSO image at start
  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[i];
    const u = rng();
    const brightness = clamp(
      minBrightness + (effectiveMaxBrightness - minBrightness) * Math.pow(u, 4.2),
      minBrightness,
      effectiveMaxBrightness
    );

    // Individual random base size: broad natural distribution from delicate pinpoints to large stellar giants
    const baseRadius = 0.42 + Math.min(1.0, brightness / 1.25) * 1.8;
    const sizeVariation = 0.55 + Math.pow(rng(), 2.2) * 2.5 + (rng() - 0.5) * 0.3;
    const radius = clamp(baseRadius * sizeVariation, 0.4, 5.0);

    const baseKelvin = 3200 + Math.min(1.0, brightness / 1.25) * 10000;
    const tempShift = (colorTemp - 0.5) * -6000;
    const kelvin = clamp(baseKelvin + tempShift + (rng() - 0.5) * 2500, 2600, 26000);
    const color = kelvinToRGB(kelvin);

    // Initial depth Z: 1.15 to 2.7
    const zBase = 1.15 + (1 - Math.pow(Math.min(1.0, brightness / 1.25), 0.4)) * 1.5;
    const z = clamp(zBase + (rng() - 0.5) * 0.4, 1.15, 2.7);

    // Individual random speed factor: diverse parallax flow from slow drifting stars (0.25x) to fast flyby stars (1.0x)
    const speedFactor = clamp(0.25 + Math.pow(rng(), 1.1) * 0.75, 0.25, 1.0);
    const layer = z < 2.0 ? 2 : 1;

    stars.push({
      x: x / width,
      y: y / height,
      z,
      brightness,
      radius,
      r: color.r,
      g: color.g,
      b: color.b,
      speedFactor,
      seed: Math.floor(rng() * 1000000),
      layer,
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.8 + rng() * 1.8,
    });
  }

  // ── Wave 1: Overlapping Mid-Stream Stars (6s - 16s) ──
  // Starts deeper in background; reaches foreground around 8s-10s to guarantee NO gap!
  const wave1Count = Math.min(Math.round(positions.length * 0.70), 1200);
  for (let i = 0; i < wave1Count; i++) {
    const u = rng();
    const brightness = clamp(
      minBrightness + (effectiveMaxBrightness * 0.85 - minBrightness) * Math.pow(u, 4.4),
      minBrightness,
      effectiveMaxBrightness * 0.85
    );

    const baseRadius = 0.4 + Math.min(1.0, brightness / 1.25) * 1.6;
    const sizeVariation = 0.55 + Math.pow(rng(), 2.2) * 2.5 + (rng() - 0.5) * 0.3;
    const radius = clamp(baseRadius * sizeVariation, 0.4, 4.6);

    const baseKelvin = 3500 + Math.min(1.0, brightness / 1.25) * 9000;
    const kelvin = clamp(baseKelvin + (rng() - 0.5) * 3000, 2800, 24000);
    const color = kelvinToRGB(kelvin);

    // Initial depth Z: 2.5 to 4.4
    const z = 2.5 + rng() * 1.9;
    const speedFactor = clamp(0.25 + Math.pow(rng(), 1.1) * 0.75, 0.25, 1.0);

    stars.push({
      x: rng(),
      y: rng(),
      z,
      brightness,
      radius,
      r: color.r,
      g: color.g,
      b: color.b,
      speedFactor,
      seed: Math.floor(rng() * 1000000),
      layer: 1,
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.8 + rng() * 1.8,
    });
  }

  // ── Wave 2: Deep Cosmic Inflow Stars (12s - 30s+) ──
  // Sustains dense, full-screen starfield throughout long video durations
  const wave2Count = Math.min(Math.round(positions.length * 0.50), 900);
  for (let i = 0; i < wave2Count; i++) {
    const u = rng();
    const brightness = clamp(
      minBrightness + (effectiveMaxBrightness * 0.7 - minBrightness) * Math.pow(u, 4.8),
      minBrightness,
      effectiveMaxBrightness * 0.7
    );

    const baseRadius = 0.38 + Math.min(1.0, brightness / 1.25) * 1.4;
    const sizeVariation = 0.55 + Math.pow(rng(), 2.2) * 2.5 + (rng() - 0.5) * 0.3;
    const radius = clamp(baseRadius * sizeVariation, 0.38, 4.2);

    const kelvin = clamp(4000 + (rng() - 0.5) * 4000, 3000, 22000);
    const color = kelvinToRGB(kelvin);

    // Initial depth Z: 4.2 to 6.2
    const z = 4.2 + rng() * 2.0;
    const speedFactor = clamp(0.25 + Math.pow(rng(), 1.1) * 0.75, 0.25, 1.0);

    stars.push({
      x: rng(),
      y: rng(),
      z,
      brightness,
      radius,
      r: color.r,
      g: color.g,
      b: color.b,
      speedFactor,
      seed: Math.floor(rng() * 1000000),
      layer: 0,
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.8 + rng() * 1.8,
    });
  }

  const layers = [[], [], []];
  for (const star of stars) {
    layers[star.layer].push(star);
  }

  return { stars, layers };
}

/**
 * Extract authentic star data from a user-provided star mask image.
 * Detects actual stars, measures their real centroid, radius, intensity, and RGB color,
 * and assigns them realistic 3D depth for the cinematic flyby effect.
 * Does NOT bloat or distort the stars.
 * @param {HTMLCanvasElement} maskCanvas - Star mask canvas
 * @returns {{ stars: Star3D[], layers: Star3D[][], baseMaskCanvas: HTMLCanvasElement }}
 */
export function extractStarsFromMask(maskCanvas) {
  const ctx = maskCanvas.getContext('2d');
  const w = maskCanvas.width;
  const h = maskCanvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const rng = seededRandom(54321);
  const stars = [];

  // Determine background noise floor
  let totalLuminance = 0;
  const sampleStep = Math.max(1, Math.floor((w * h) / 10000));
  let samplesCount = 0;
  for (let i = 0; i < data.length; i += sampleStep * 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    totalLuminance += lum;
    samplesCount++;
  }
  const avgBg = samplesCount > 0 ? totalLuminance / samplesCount : 0.01;
  const detectionThreshold = Math.max(0.035, avgBg * 2.5);

  // Scan on a fine grid to detect star peaks
  const step = 2;
  const visited = new Uint8Array(Math.ceil(w / step) * Math.ceil(h / step));
  const gridW = Math.ceil(w / step);

  for (let y = 1; y < h - 1; y += step) {
    const gy = Math.floor(y / step);
    for (let x = 1; x < w - 1; x += step) {
      const gx = Math.floor(x / step);
      const vIdx = gy * gridW + gx;
      if (visited[vIdx]) continue;

      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

      if (lum > detectionThreshold) {
        // Check if local peak compared to direct neighbors
        const up = ((y - 1) * w + x) * 4;
        const down = ((y + 1) * w + x) * 4;
        const left = (y * w + (x - 1)) * 4;
        const right = (y * w + (x + 1)) * 4;
        const lumUp = (data[up] * 0.299 + data[up + 1] * 0.587 + data[up + 2] * 0.114) / 255;
        const lumDown = (data[down] * 0.299 + data[down + 1] * 0.587 + data[down + 2] * 0.114) / 255;
        const lumLeft = (data[left] * 0.299 + data[left + 1] * 0.587 + data[left + 2] * 0.114) / 255;
        const lumRight = (data[right] * 0.299 + data[right + 1] * 0.587 + data[right + 2] * 0.114) / 255;

        // Candidate peak
        if (lum >= lumUp && lum >= lumDown && lum >= lumLeft && lum >= lumRight) {
          // Measure star radius and centroid by moment
          let sumWeight = 0;
          let sumX = 0;
          let sumY = 0;
          const maxRadius = Math.min(24, Math.floor(2 + lum * 18));
          let radius = 1;

          for (let dy = -maxRadius; dy <= maxRadius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -maxRadius; dx <= maxRadius; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              const distSq = dx * dx + dy * dy;
              if (distSq > maxRadius * maxRadius) continue;

              const ni = (ny * w + nx) * 4;
              const nlum = (data[ni] * 0.299 + data[ni + 1] * 0.587 + data[ni + 2] * 0.114) / 255;
              if (nlum > detectionThreshold * 0.7) {
                sumWeight += nlum;
                sumX += nx * nlum;
                sumY += ny * nlum;
                const d = Math.sqrt(distSq);
                if (d > radius) radius = d;
              }
            }
          }

          const cx = sumWeight > 0 ? sumX / sumWeight : x;
          const cy = sumWeight > 0 ? sumY / sumWeight : y;

          // Mark neighboring grid cells as visited so we don't duplicate this star
          const markRadius = Math.ceil(radius / step) + 1;
          for (let my = Math.max(0, gy - markRadius); my <= Math.min(Math.ceil(h / step) - 1, gy + markRadius); my++) {
            for (let mx = Math.max(0, gx - markRadius); mx <= Math.min(gridW - 1, gx + markRadius); mx++) {
              visited[my * gridW + mx] = 1;
            }
          }

          // Assign realistic 3D depth Z for base mask stars:
          const zBase = 1.15 + (1 - Math.pow(clamp(lum, 0, 1), 0.35)) * 1.5;
          const z = clamp(zBase + (rng() - 0.5) * 0.4, 1.15, 2.7);
          const layer = z < 2.0 ? 2 : 1;

          // Accurate star radius without bloat
          const actualRadius = clamp(radius * 0.55, 0.6, 6.0);

          // Individual random speed factor: diverse parallax flow from slow drift to fast flyby
          const speedFactor = clamp(0.25 + Math.pow(rng(), 1.1) * 0.75, 0.25, 1.0);

          stars.push({
            x: cx / w,
            y: cy / h,
            z,
            brightness: clamp(lum, 0.1, 1.0),
            radius: actualRadius,
            r,
            g,
            b,
            speedFactor,
            seed: Math.floor(rng() * 1000000),
            layer,
            twinklePhase: rng() * Math.PI * 2,
            twinkleSpeed: 0.8 + rng() * 1.5,
          });
        }
      }
    }
  }

  // ── Wave 1: Complementary Mid-Stream Stars (6s - 16s) ──
  // Overlaps seamlessly with the star mask stars between 8s-10s so there is NO gap!
  const maskCount = stars.length;
  const wave1Count = Math.max(120, Math.round(maskCount * 0.75));
  for (let i = 0; i < wave1Count; i++) {
    const u = rng();
    const brightness = clamp(0.12 + 0.7 * Math.pow(u, 4.4), 0.12, 0.82);
    const baseRadius = 0.4 + brightness * 1.6;
    const sizeVariation = 0.55 + Math.pow(rng(), 2.2) * 2.5 + (rng() - 0.5) * 0.3;
    const radius = clamp(baseRadius * sizeVariation, 0.45, 4.6);
    const kelvin = clamp(3500 + rng() * 9000, 3000, 22000);
    const color = kelvinToRGB(kelvin);
    const z = 2.5 + rng() * 1.9;
    const speedFactor = clamp(0.25 + Math.pow(rng(), 1.1) * 0.75, 0.25, 1.0);

    stars.push({
      x: rng(),
      y: rng(),
      z,
      brightness,
      radius,
      r: color.r,
      g: color.g,
      b: color.b,
      speedFactor,
      seed: Math.floor(rng() * 1000000),
      layer: 1,
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.8 + rng() * 1.8,
    });
  }

  // ── Wave 2: Deep Cosmic Inflow Stars (12s - 30s+) ──
  // Keeps starfield dense, continuous, and full-screen through long video durations
  const wave2Count = Math.max(90, Math.round(maskCount * 0.55));
  for (let i = 0; i < wave2Count; i++) {
    const u = rng();
    const brightness = clamp(0.1 + 0.55 * Math.pow(u, 4.8), 0.1, 0.65);
    const baseRadius = 0.38 + brightness * 1.4;
    const sizeVariation = 0.55 + Math.pow(rng(), 2.2) * 2.5 + (rng() - 0.5) * 0.3;
    const radius = clamp(baseRadius * sizeVariation, 0.4, 4.2);
    const kelvin = clamp(4000 + rng() * 8000, 3200, 20000);
    const color = kelvinToRGB(kelvin);
    const z = 4.2 + rng() * 2.0;
    const speedFactor = clamp(0.25 + Math.pow(rng(), 1.1) * 0.75, 0.25, 1.0);

    stars.push({
      x: rng(),
      y: rng(),
      z,
      brightness,
      radius,
      r: color.r,
      g: color.g,
      b: color.b,
      speedFactor,
      seed: Math.floor(rng() * 1000000),
      layer: 0,
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.8 + rng() * 1.8,
    });
  }

  // Sort into layers
  const layers = [[], [], []];
  for (const star of stars) {
    layers[star.layer].push(star);
  }

  return { stars, layers, baseMaskCanvas: maskCanvas };
}

// Pre-rendered PSF Sprite Cache (Texture Atlas / Offscreen Sprites)
// Eliminates repetitive createRadialGradient() calls per frame for 100x rendering speedup
const psfSpriteCache = new Map();

function getStarSprite(r, g, b, hasCore) {
  // Quantize RGB to 16-step bins to limit cache size while preserving colors
  const qr = Math.round(r / 16) * 16;
  const qg = Math.round(g / 16) * 16;
  const qb = Math.round(b / 16) * 16;
  const key = `${qr}_${qg}_${qb}_${hasCore ? 1 : 0}`;

  let sprite = psfSpriteCache.get(key);
  if (sprite) return sprite;

  // Render 64x64 master PSF sprite with 1:1 astronomical radial gradient
  const size = 64;
  const center = size / 2;
  const maxR = size * 0.46; // ~29.4px radius

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Halo gradient
  const grad = ctx.createRadialGradient(center, center, 0, center, center, maxR);
  grad.addColorStop(0, `rgba(${qr},${qg},${qb},1.0)`);
  grad.addColorStop(0.35, `rgba(${qr},${qg},${qb},0.75)`);
  grad.addColorStop(0.70, `rgba(${qr},${qg},${qb},0.25)`);
  grad.addColorStop(1.0, `rgba(${qr},${qg},${qb},0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(center, center, maxR, 0, Math.PI * 2);
  ctx.fill();

  // Sharp pinpoint core for bright stars
  if (hasCore) {
    const coreR = maxR * 0.38;
    const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, coreR);
    coreGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    coreGrad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(center, center, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  psfSpriteCache.set(key, canvas);
  return canvas;
}

/**
 * Render a single star with realistic Gaussian Point Spread Function (PSF).
 * Uses GPU-accelerated pre-rendered sprites for lag-free 60fps playback.
 * Pinpoint core, natural soft halo, absolutely NO cartoonish 3x/5x ballooning.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - Center X in pixels
 * @param {number} cy - Center Y in pixels
 * @param {number} radius - Star radius in pixels
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @param {number} alpha - Alpha transparency (0 to 1)
 */
export function renderStarPSF(ctx, cx, cy, radius, r, g, b, alpha) {
  if (alpha <= 0.005 || radius <= 0.1) return;

  const haloRadius = Math.max(radius * 1.4, radius + 1.2);

  // Fast path for microscopic pinpoint stars: direct fillRect
  if (haloRadius <= 1.4) {
    ctx.globalAlpha = Math.min(1.0, alpha);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(cx - 0.75, cy - 0.75, 1.5, 1.5);
    return;
  }

  const hasCore = (alpha > 0.4 && radius > 0.8);
  const sprite = getStarSprite(r, g, b, hasCore);

  ctx.globalAlpha = Math.min(1.0, alpha);
  const drawDiam = haloRadius * 2;
  ctx.drawImage(sprite, cx - haloRadius, cy - haloRadius, drawDiam, drawDiam);

  // Center core boost for stars reaching +25% maximum brightness (alpha > 1.0)
  if (alpha > 1.0) {
    const boostR = Math.max(0.7, radius * 0.5);
    ctx.globalAlpha = Math.min(1.0, (alpha - 1.0) * 1.8);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, boostR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Legacy compatibility helper: render stars to a canvas.
 */
export function renderStarsToCanvas(canvas, stars, globalBrightness = 1) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  for (const star of stars) {
    const cx = star.x * w;
    const cy = star.y * h;
    renderStarPSF(ctx, cx, cy, star.radius, star.r, star.g, star.b, star.brightness * globalBrightness);
  }
}

// ── Poisson Disk Sampling (Bridson's Algorithm) ──────────────────

function poissonDiskSampling(width, height, minDist, rng, maxAttempts = 30) {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid = new Array(gridW * gridH).fill(-1);
  const points = [];
  const activeList = [];

  function gridIndex(x, y) {
    return Math.floor(y / cellSize) * gridW + Math.floor(x / cellSize);
  }

  const startX = rng() * width;
  const startY = rng() * height;
  points.push([startX, startY]);
  activeList.push(0);
  grid[gridIndex(startX, startY)] = 0;

  while (activeList.length > 0) {
    const randIdx = Math.floor(rng() * activeList.length);
    const pointIdx = activeList[randIdx];
    const [px, py] = points[pointIdx];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = rng() * Math.PI * 2;
      const dist = minDist + rng() * minDist;
      const nx = px + Math.cos(angle) * dist;
      const ny = py + Math.sin(angle) * dist;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const gx = Math.floor(nx / cellSize);
      const gy = Math.floor(ny / cellSize);
      let tooClose = false;

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const checkX = gx + dx;
          const checkY = gy + dy;
          if (checkX < 0 || checkX >= gridW || checkY < 0 || checkY >= gridH) continue;
          const neighborIdx = grid[checkY * gridW + checkX];
          if (neighborIdx >= 0) {
            const [npx, npy] = points[neighborIdx];
            const d = Math.hypot(nx - npx, ny - npy);
            if (d < minDist) {
              tooClose = true;
              break;
            }
          }
        }
        if (tooClose) break;
      }

      if (!tooClose) {
        const newIdx = points.length;
        points.push([nx, ny]);
        activeList.push(newIdx);
        grid[gy * gridW + gx] = newIdx;
        found = true;
        break;
      }
    }

    if (!found) {
      activeList.splice(randIdx, 1);
    }
  }

  return points;
}
