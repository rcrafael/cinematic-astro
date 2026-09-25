/**
 * Astronimation — Main Application
 * Orchestrates UI, state management, image loading, 3D flyby animation, and video export.
 */

import './style.css';
import { clamp } from './utils.js';
import { loadImageWithFallback } from './image-loader.js';
import { generateStarField, extractStarsFromMask } from './star-generator.js';
import { AnimationEngine } from './animation-engine.js';
import { VideoRecorder } from './video-recorder.js';

// ═══════════════════════════════════════════════════════════════════
// Aspect Ratio Definitions
// ═══════════════════════════════════════════════════════════════════
const ASPECT_RATIOS = {
  '16:9': {
    name: '16:9',
    sub: 'Landscape',
    ratio: 16 / 9,
    cssRatio: '16 / 9',
    resolutions: [
      { label: '1080p (1920×1080)', value: '1920x1080', tier: '1080p' },
      { label: '1440p (2560×1440)', value: '2560x1440', tier: '1440p' },
      { label: '4K (3840×2160)', value: '3840x2160', tier: '4K' },
    ],
  },
  '9:16': {
    name: '9:16',
    sub: 'Vertical',
    ratio: 9 / 16,
    cssRatio: '9 / 16',
    resolutions: [
      { label: '1080p Vertical (1080×1920)', value: '1080x1920', tier: '1080p' },
      { label: '1440p Vertical (1440×2560)', value: '1440x2560', tier: '1440p' },
      { label: '4K Vertical (2160×3840)', value: '2160x3840', tier: '4K' },
    ],
  },
  '4:3': {
    name: '4:3',
    sub: 'Standard',
    ratio: 4 / 3,
    cssRatio: '4 / 3',
    resolutions: [
      { label: '1080p (1440×1080)', value: '1440x1080', tier: '1080p' },
      { label: '1440p (1920×1440)', value: '1920x1440', tier: '1440p' },
      { label: '4K (2880×2160)', value: '2880x2160', tier: '4K' },
    ],
  },
  '1:1': {
    name: '1:1',
    sub: 'Square',
    ratio: 1 / 1,
    cssRatio: '1 / 1',
    resolutions: [
      { label: '1080p Square (1080×1080)', value: '1080x1080', tier: '1080p' },
      { label: '1440p Square (1440×1440)', value: '1440x1440', tier: '1440p' },
      { label: '4K Square (2160×2160)', value: '2160x2160', tier: '4K' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════
const state = {
  starlessCanvas: null,        // HTMLCanvasElement with loaded DSO image
  starlessFile: null,          // File reference for re-processing
  starlessStretch: 'none',     // 'none' (Original) or 'auto' (Auto-Stretch)
  starlessStretchLevel: 0.5,   // 0.05 to 1.0 (midtone strength)
  starmaskCanvas: null,        // HTMLCanvasElement with loaded star mask (or null)
  starmaskFile: null,          // File reference for re-processing
  starmaskStretch: 'none',     // 'none' (Original) or 'auto' (Auto-Stretch)
  starmaskStretchLevel: 0.5,   // 0.05 to 1.0 (midtone strength)
  starData: null,              // { stars: Star3D[], layers, baseMaskCanvas }
  engine: null,                // AnimationEngine instance
  recorder: null,              // VideoRecorder instance
  isPreviewing: false,
  isExporting: false,
  resultUrl: null,

  aspectRatio: '16:9',
  qualityTier: '1080p',
  framing: {
    scale: 1.0,                // User zoom in preview (1.0 = base cover scale)
    offsetX: 0,                // Pan offset X in canvas pixels
    offsetY: 0,                // Pan offset Y in canvas pixels
  },
};

// ═══════════════════════════════════════════════════════════════════
// DOM Elements
// ═══════════════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);
const el = {
  // Upload zones
  uploadStarless: $('#upload-starless'),
  inputStarless: $('#input-starless'),
  previewStarless: $('#preview-starless'),
  thumbStarless: $('#thumb-starless'),
  filenameStarless: $('#filename-starless'),
  removeStarless: $('#remove-starless'),
  ctrlStarlessStretch: $('#ctrl-starless-stretch'),
  groupStarlessLevel: $('#group-starless-level'),
  ctrlStarlessStretchLevel: $('#ctrl-starless-stretch-level'),
  valStarlessStretch: $('#val-starless-stretch'),

  uploadStarmask: $('#upload-starmask'),
  inputStarmask: $('#input-starmask'),
  previewStarmask: $('#preview-starmask'),
  thumbStarmask: $('#thumb-starmask'),
  filenameStarmask: $('#filename-starmask'),
  removeStarmask: $('#remove-starmask'),
  ctrlStarmaskStretch: $('#ctrl-starmask-stretch'),
  groupStarmaskLevel: $('#group-starmask-level'),
  ctrlStarmaskStretchLevel: $('#ctrl-starmask-stretch-level'),
  valStarmaskStretch: $('#val-starmask-stretch'),

  starGenControls: $('#star-gen-controls'),

  // Canvas & Preview
  previewCanvas: $('#preview-canvas'),
  previewPlaceholder: $('#preview-placeholder'),
  previewStatus: $('#preview-status'),
  previewStatusText: $('#preview-status-text'),
  previewContainer: $('#preview-container'),
  loadingOverlay: $('#loading-overlay'),
  loadingMessage: $('#loading-message'),

  // Aspect Ratio & Framing Elements
  ctrlAspectRatio: $('#ctrl-aspect-ratio'),
  badgeAspectRatio: $('#badge-aspect-ratio'),
  ctrlStarlessScale: $('#ctrl-starless-scale'),
  valStarlessScale: $('#val-starless-scale'),
  btnScaleFit: $('#btn-scale-fit'),
  btnScaleFill: $('#btn-scale-fill'),
  btnScaleReset: $('#btn-scale-reset'),

  previewFramingBar: $('#preview-framing-bar'),
  previewFramingHint: $('#preview-framing-hint'),
  btnPreviewZoomOut: $('#btn-preview-zoom-out'),
  btnPreviewZoomIn: $('#btn-preview-zoom-in'),
  badgePreviewZoom: $('#badge-preview-zoom'),
  btnPreviewFit: $('#btn-preview-fit'),
  btnPreviewFill: $('#btn-preview-fill'),
  btnPreviewReset: $('#btn-preview-reset'),

  // Controls
  ctrlDuration: $('#ctrl-duration'),
  ctrlResolution: $('#ctrl-resolution'),
  ctrlFps: $('#ctrl-fps'),
  ctrlEasing: $('#ctrl-easing'),

  ctrlZoomEnable: $('#ctrl-zoom-enable'),
  zoomControls: $('#zoom-controls'),
  ctrlZoomDir: $('#ctrl-zoom-dir'),
  ctrlZoomSpeed: $('#ctrl-zoom-speed'),

  ctrlRotEnable: $('#ctrl-rot-enable'),
  rotationControls: $('#rotation-controls'),
  ctrlRotDir: $('#ctrl-rot-dir'),
  ctrlRotSpeed: $('#ctrl-rot-speed'),

  ctrlPanEnable: $('#ctrl-pan-enable'),
  panControls: $('#pan-controls'),
  ctrlPanDir: $('#ctrl-pan-dir'),
  ctrlPanSpeed: $('#ctrl-pan-speed'),

  ctrlFlybySpeed: $('#ctrl-flyby-speed'),
  valFlybySpeed: $('#val-flyby-speed'),
  ctrlParallax: $('#ctrl-parallax'),
  ctrlTwinkleEnable: $('#ctrl-twinkle-enable'),
  twinkleControls: $('#twinkle-controls'),
  ctrlTwinkle: $('#ctrl-twinkle'),
  ctrlVignette: $('#ctrl-vignette'),

  ctrlDensity: $('#ctrl-density'),
  ctrlColortemp: $('#ctrl-colortemp'),
  ctrlBrightness: $('#ctrl-brightness'),

  // Values
  valDuration: $('#val-duration'),
  valZoomSpeed: $('#val-zoom-speed'),
  valRotSpeed: $('#val-rot-speed'),
  valPanSpeed: $('#val-pan-speed'),
  valParallax: $('#val-parallax'),
  valTwinkle: $('#val-twinkle'),
  valDensity: $('#val-density'),
  valColortemp: $('#val-colortemp'),
  valBrightness: $('#val-brightness'),

  // Timeline
  timeline: $('#timeline'),
  timelineScrubber: $('#timeline-scrubber'),
  timeCurrent: $('#time-current'),
  timeTotal: $('#time-total'),

  // Buttons
  btnPreview: $('#btn-preview'),
  btnStop: $('#btn-stop'),
  btnExport: $('#btn-export'),
  btnDownload: $('#btn-download'),

  // Progress
  progressContainer: $('#progress-container'),
  progressBar: $('#progress-bar'),
  progressText: $('#progress-text'),

  // Result
  downloadResult: $('#download-result'),
  resultVideo: $('#result-video'),
  resultInfo: $('#result-info'),
};

// ═══════════════════════════════════════════════════════════════════
// Loading State Helpers
// ═══════════════════════════════════════════════════════════════════

function showLoading(message = 'Processing image...') {
  if (el.loadingMessage) el.loadingMessage.textContent = message;
  if (el.loadingOverlay) el.loadingOverlay.classList.add('visible');
}

function hideLoading() {
  if (el.loadingOverlay) el.loadingOverlay.classList.remove('visible');
}

async function withLoading(message, asyncFn) {
  showLoading(message);
  // Yield to browser to guarantee the spinner paints before CPU-intensive work begins
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));
  try {
    await asyncFn();
  } finally {
    hideLoading();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Configuration Builder
// ═══════════════════════════════════════════════════════════════════
function getConfig() {
  return {
    duration: parseInt(el.ctrlDuration.value),
    fps: parseInt(el.ctrlFps.value),
    easing: el.ctrlEasing.value,

    zoomEnabled: el.ctrlZoomEnable.checked,
    zoomDirection: getButtonGroupValue(el.ctrlZoomDir),
    zoomSpeed: parseInt(el.ctrlZoomSpeed.value) / 100,

    rotationEnabled: el.ctrlRotEnable.checked,
    rotationDirection: getButtonGroupValue(el.ctrlRotDir),
    rotationSpeed: parseInt(el.ctrlRotSpeed.value),

    panEnabled: el.ctrlPanEnable.checked,
    panDirection: el.ctrlPanDir.value,
    panSpeed: parseInt(el.ctrlPanSpeed.value) / 100,

    flybySpeed: parseInt(el.ctrlFlybySpeed.value) / 100,
    parallaxIntensity: parseInt(el.ctrlParallax.value) / 100,
    twinkleEnabled: el.ctrlTwinkleEnable.checked,
    twinkleIntensity: parseInt(el.ctrlTwinkle.value) / 100,
    vignetteEnabled: el.ctrlVignette.checked,
  };
}

function getResolution() {
  if (el.ctrlResolution && el.ctrlResolution.value) {
    const parts = el.ctrlResolution.value.split('x').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { width: parts[0], height: parts[1] };
    }
  }
  const currentRatio = ASPECT_RATIOS[state.aspectRatio] || ASPECT_RATIOS['16:9'];
  const res = currentRatio.resolutions[0];
  const [w, h] = res.value.split('x').map(Number);
  return { width: w, height: h };
}

// ═══════════════════════════════════════════════════════════════════
// Aspect Ratio & Auto-Detection
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect the best matching aspect ratio for an uploaded image.
 * Supported aspect ratios: 9:16, 4:3, 16:9, 1:1.
 */
function detectBestAspectRatio(width, height) {
  const imageRatio = width / height;
  if (imageRatio < 0.82) {
    return '9:16';
  } else if (imageRatio <= 1.18) {
    return '1:1';
  } else if (imageRatio < 1.55) {
    return '4:3';
  } else {
    return '16:9';
  }
}

function updateResolutionOptions(ratioKey) {
  const arConfig = ASPECT_RATIOS[ratioKey];
  if (!arConfig || !el.ctrlResolution) return;

  const currentTier = state.qualityTier || '1080p';
  el.ctrlResolution.innerHTML = '';

  let matchedOption = null;
  arConfig.resolutions.forEach((r, idx) => {
    const opt = document.createElement('option');
    opt.value = r.value;
    opt.textContent = r.label;
    opt.dataset.tier = r.tier;
    if (r.tier === currentTier || (!matchedOption && idx === 0)) {
      opt.selected = true;
      matchedOption = opt;
    }
    el.ctrlResolution.appendChild(opt);
  });
}

function setAspectRatio(ratioKey, isAuto = false) {
  if (!ASPECT_RATIOS[ratioKey]) ratioKey = '16:9';
  state.aspectRatio = ratioKey;

  // Update Aspect Ratio UI pill buttons
  if (el.ctrlAspectRatio) {
    el.ctrlAspectRatio.querySelectorAll('.aspect-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === ratioKey);
    });
  }

  // Auto-detected badge feedback
  if (el.badgeAspectRatio) {
    if (isAuto && state.starlessCanvas) {
      el.badgeAspectRatio.textContent = `Auto: ${ratioKey} (${state.starlessCanvas.width}×${state.starlessCanvas.height})`;
      el.badgeAspectRatio.style.display = 'inline-block';
    } else if (!isAuto) {
      el.badgeAspectRatio.style.display = 'none';
    }
  }

  // Update container CSS aspect ratio variables
  const arConfig = ASPECT_RATIOS[ratioKey];
  if (el.previewContainer) {
    el.previewContainer.style.setProperty('--aspect-ratio', arConfig.cssRatio);
    el.previewContainer.style.setProperty('--aspect-factor', arConfig.ratio);
  }

  // Update Resolution select dropdown options (preserving quality tier if possible)
  updateResolutionOptions(ratioKey);

  // Update canvas resolution dimensions
  const res = getResolution();
  el.previewCanvas.width = res.width;
  el.previewCanvas.height = res.height;

  // Rebuild engine if image loaded
  if (state.starlessCanvas) {
    initEngine();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Image Framing & Zoom in Preview
// ═══════════════════════════════════════════════════════════════════

function onFramingChanged() {
  const pct = Math.round(state.framing.scale * 100);
  if (el.valStarlessScale) el.valStarlessScale.textContent = `${pct}%`;
  if (el.ctrlStarlessScale) el.ctrlStarlessScale.value = pct;
  if (el.badgePreviewZoom) el.badgePreviewZoom.textContent = `${pct}%`;

  if (state.engine) {
    state.engine.updateFraming(state.framing);
    if (!state.isPreviewing) {
      const progress = parseInt(el.timelineScrubber?.value || 0) / 1000;
      state.engine.renderAt(progress);
    }
  }
}

function setFramingScale(scale, resetOffsets = false) {
  state.framing.scale = clamp(scale, 0.25, 4.0);
  if (resetOffsets) {
    state.framing.offsetX = 0;
    state.framing.offsetY = 0;
  }
  onFramingChanged();
}

function fitImageInFrame() {
  if (!state.starlessCanvas) return;
  const { width: outW, height: outH } = getResolution();
  const dsoW = state.starlessCanvas.width;
  const dsoH = state.starlessCanvas.height;

  const coverScale = Math.max(outW / dsoW, outH / dsoH);
  const containScale = Math.min(outW / dsoW, outH / dsoH);

  const scale = containScale / coverScale;
  setFramingScale(scale, true);
}

function fillImageInFrame() {
  setFramingScale(1.0, true);
}

function resetFraming() {
  setFramingScale(1.0, true);
}

function setupPreviewInteractions() {
  const container = el.previewContainer;
  if (!container) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialOffsetX = 0;
  let initialOffsetY = 0;

  // Mouse wheel to zoom image in preview
  container.addEventListener('wheel', (e) => {
    if (!state.starlessCanvas) return;
    e.preventDefault();

    const zoomStep = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newScale = clamp(state.framing.scale * zoomStep, 0.25, 4.0);

    const rect = container.getBoundingClientRect();
    const mouseNormX = (e.clientX - rect.left) / rect.width - 0.5;
    const mouseNormY = (e.clientY - rect.top) / rect.height - 0.5;
    const scaleRatio = newScale / state.framing.scale;

    state.framing.offsetX = state.framing.offsetX * scaleRatio + mouseNormX * el.previewCanvas.width * (1 - scaleRatio) * 0.25;
    state.framing.offsetY = state.framing.offsetY * scaleRatio + mouseNormY * el.previewCanvas.height * (1 - scaleRatio) * 0.25;
    state.framing.scale = newScale;

    onFramingChanged();
  }, { passive: false });

  // Pointer drag to pan image in preview
  container.addEventListener('pointerdown', (e) => {
    if (!state.starlessCanvas) return;
    if (e.target.closest('#preview-framing-bar') || e.target.closest('button')) return;

    isDragging = true;
    container.classList.add('is-dragging');
    container.setPointerCapture(e.pointerId);

    startX = e.clientX;
    startY = e.clientY;
    initialOffsetX = state.framing.offsetX;
    initialOffsetY = state.framing.offsetY;
  });

  container.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    const rect = container.getBoundingClientRect();
    const scaleCanvasX = el.previewCanvas.width / rect.width;
    const scaleCanvasY = el.previewCanvas.height / rect.height;

    const dx = (e.clientX - startX) * scaleCanvasX;
    const dy = (e.clientY - startY) * scaleCanvasY;

    state.framing.offsetX = initialOffsetX + dx;
    state.framing.offsetY = initialOffsetY + dy;

    onFramingChanged();
  });

  const stopDrag = (e) => {
    if (isDragging) {
      isDragging = false;
      container.classList.remove('is-dragging');
      try { container.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  container.addEventListener('pointerup', stopDrag);
  container.addEventListener('pointercancel', stopDrag);

  // Double-click resets framing
  container.addEventListener('dblclick', (e) => {
    if (!state.starlessCanvas) return;
    if (e.target.closest('#preview-framing-bar') || e.target.closest('button')) return;
    resetFraming();
  });
}

function getStarGenConfig() {
  return {
    density: parseInt(el.ctrlDensity.value) / 100,
    colorTemp: parseInt(el.ctrlColortemp.value) / 100,
    maxBrightness: parseInt(el.ctrlBrightness.value) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════
// File Upload Handling
// ═══════════════════════════════════════════════════════════════════

function setupUploadZone(zone, input, previewEl, thumbCanvas, filenameEl, removeBtn, getOptions, onLoad, onRemove) {
  // Click to open file dialog
  zone.addEventListener('click', (e) => {
    if (e.target === removeBtn || e.target.closest('.upload-remove') || e.target.closest('select') || e.target.closest('input[type="range"]')) return;
    input.click();
  });

  // Drag & drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // File input change
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) handleFile(file);
  });

  // Remove button
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    zone.classList.remove('has-file');
    previewEl.classList.remove('visible');
    input.value = '';
    if (onRemove) onRemove();
  });

  async function handleFile(file) {
    await withLoading(`Loading ${file.name}...`, async () => {
      try {
        zone.classList.add('has-file');
        filenameEl.textContent = file.name;
        previewEl.classList.add('visible');

        const opts = getOptions ? getOptions() : { autoStretch: false, stretchLevel: 0.5 };
        const canvas = await loadImageWithFallback(file, opts);

        // Draw thumbnail
        const maxSize = 200;
        const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height, 1);
        thumbCanvas.width = Math.round(canvas.width * scale);
        thumbCanvas.height = Math.round(canvas.height * scale);
        const ctx = thumbCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

        if (onLoad) await onLoad(canvas, file);
      } catch (err) {
        console.error('Failed to load image:', err);
        zone.classList.remove('has-file');
        previewEl.classList.remove('visible');
        alert(`Failed to load image: ${err.message}`);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Star Field Generation / Extraction
// ═══════════════════════════════════════════════════════════════════

function buildStarData() {
  const { width, height } = getResolution();

  if (state.starmaskCanvas) {
    // Extract stars accurately from user-provided star mask
    state.starData = extractStarsFromMask(state.starmaskCanvas);
  } else {
    // Generate 3D procedural stars
    const genConfig = getStarGenConfig();
    state.starData = generateStarField({
      width,
      height,
      density: genConfig.density,
      maxBrightness: genConfig.maxBrightness,
      colorTemp: genConfig.colorTemp,
      seed: 42,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Engine Setup
// ═══════════════════════════════════════════════════════════════════

function initEngine() {
  if (!state.starlessCanvas) return;

  stopPreview();

  const { width, height } = getResolution();
  el.previewCanvas.width = width;
  el.previewCanvas.height = height;

  buildStarData();

  const config = getConfig();
  state.engine = new AnimationEngine(
    el.previewCanvas,
    state.starlessCanvas,
    state.starData,
    config,
    state.framing
  );

  // Render first frame (at progress=0, stars are registered 100% with the DSO)
  state.engine.renderAt(0);
  el.previewPlaceholder.style.display = 'none';
  el.previewStatus.classList.add('visible');
  el.previewStatusText.textContent = 'Ready';
  if (el.previewFramingBar) el.previewFramingBar.style.display = 'flex';

  updateButtons();
  updateTimeline();
}

function rebuildEngine() {
  if (state.starlessCanvas) {
    initEngine();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Preview Controls
// ═══════════════════════════════════════════════════════════════════

function startPreview() {
  if (!state.engine) return;

  state.isPreviewing = true;
  el.btnPreview.style.display = 'none';
  el.btnStop.style.display = 'inline-flex';
  el.btnStop.disabled = false; // Ensure clickable!
  el.previewStatusText.textContent = 'Previewing (3D Flyby)';
  el.previewStatus.classList.add('visible');

  const dur = parseInt(el.ctrlDuration.value);
  const startTime = performance.now();

  function onFrame() {
    if (!state.isPreviewing) return;
    const elapsed = (performance.now() - startTime) / 1000;
    const progress = (elapsed % dur) / dur;
    el.timelineScrubber.value = Math.round(progress * 1000);
    el.timeCurrent.textContent = formatTime(elapsed % dur);
    requestAnimationFrame(onFrame);
  }

  state.engine.startPreview();
  requestAnimationFrame(onFrame);
}

function stopPreview() {
  state.isPreviewing = false;
  if (state.engine) {
    state.engine.stopPreview();
  }
  el.btnPreview.style.display = 'inline-flex';
  el.btnStop.style.display = 'none';
  el.btnStop.disabled = false;
  el.previewStatusText.textContent = 'Ready';
}

// ═══════════════════════════════════════════════════════════════════
// Video Export
// ═══════════════════════════════════════════════════════════════════

async function exportVideo() {
  if (!state.starlessCanvas || state.isExporting) return;

  stopPreview();
  state.isExporting = true;
  updateButtons();

  // Show progress
  el.progressContainer.classList.add('visible');
  el.progressBar.style.width = '0%';
  el.progressText.textContent = 'Rendering 3D flyby frames: 0%';
  el.previewStatusText.textContent = 'Rendering...';

  // Hide previous result
  el.downloadResult.classList.remove('visible');

  // Set up export canvas
  const { width, height } = getResolution();
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;

  buildStarData();

  const config = getConfig();
  const exportEngine = new AnimationEngine(
    exportCanvas,
    state.starlessCanvas,
    state.starData,
    config,
    state.framing
  );

  const maxDim = Math.max(width, height);
  // Initialize recorder
  state.recorder = new VideoRecorder(exportCanvas, {
    width,
    height,
    fps: config.fps,
    duration: config.duration,
    videoBitrate: maxDim >= 3840 ? 40_000_000 : maxDim >= 2560 ? 25_000_000 : 15_000_000,
  });

  try {
    await state.recorder.start();

    // Render frames locked to FPS
    await exportEngine.renderForRecording(async (progress, frame) => {
      const pct = Math.round(progress * 100);
      el.progressBar.style.width = `${pct}%`;
      el.progressText.textContent = `Rendering frames: ${pct}%`;

      // Pass rendered frame to video encoder
      if (state.recorder.addFrame) {
        await state.recorder.addFrame(frame);
      }

      // Also show current frame in preview
      state.engine.renderAt(progress);
      el.timelineScrubber.value = Math.round(progress * 1000);
      el.timeCurrent.textContent = formatTime(progress * config.duration);
    });

    el.progressText.textContent = 'Encoding MP4 video...';
    const blob = await state.recorder.stop();

    // Revoke previous URL
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);

    // Show result
    el.resultVideo.src = state.resultUrl;
    el.resultInfo.textContent = `${width}×${height} • ${config.fps}fps • ${config.duration}s • ${(blob.size / 1024 / 1024).toFixed(1)}MB (MP4)`;
    el.downloadResult.classList.add('visible');

    // Auto-play the result video in loop
    el.resultVideo.play().catch(() => {});

    // AUTO-DOWNLOAD: Trigger automatic download in .mp4 format immediately after rendering
    const mp4Filename = `cinematic-astro-${config.duration}s.mp4`;
    VideoRecorder.download(state.resultUrl, mp4Filename);

  } catch (err) {
    console.error('Export failed:', err);
    alert(`Video export failed: ${err.message}`);
  } finally {
    state.isExporting = false;
    el.progressContainer.classList.remove('visible');
    el.previewStatusText.textContent = 'Ready';
    updateButtons();
  }
}

// ═══════════════════════════════════════════════════════════════════
// UI Helpers
// ═══════════════════════════════════════════════════════════════════

function updateButtons() {
  const hasImage = !!state.starlessCanvas;
  el.btnPreview.disabled = !hasImage || state.isExporting;
  el.btnStop.disabled = state.isExporting;
  el.btnExport.disabled = !hasImage || state.isExporting;
}

function updateTimeline() {
  if (!state.starlessCanvas) {
    el.timeline.style.display = 'none';
    return;
  }
  el.timeline.style.display = 'flex';
  const dur = parseInt(el.ctrlDuration.value);
  el.timeTotal.textContent = formatTime(dur);
  el.timeCurrent.textContent = '0:00';
  el.timelineScrubber.value = 0;
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getButtonGroupValue(container) {
  const active = container.querySelector('.active');
  return active ? active.dataset.value : null;
}

function setupButtonGroup(container) {
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rebuildEngine();
    });
  });
}

function setupToggle(checkbox, controlsEl) {
  checkbox.addEventListener('change', () => {
    if (controlsEl) {
      controlsEl.classList.toggle('visible', checkbox.checked);
    }
    rebuildEngine();
  });
}

// ═══════════════════════════════════════════════════════════════════
// Initialize
// ═══════════════════════════════════════════════════════════════════

function init() {
  // ── Upload zone: Starless Image ──
  setupUploadZone(
    el.uploadStarless, el.inputStarless, el.previewStarless,
    el.thumbStarless, el.filenameStarless, el.removeStarless,
    () => ({ autoStretch: state.starlessStretch === 'auto', stretchLevel: state.starlessStretchLevel }),
    (canvas, file) => {
      state.starlessCanvas = canvas;
      state.starlessFile = file;

      // Auto-detect resolution and select the best aspect ratio!
      const bestRatio = detectBestAspectRatio(canvas.width, canvas.height);
      setAspectRatio(bestRatio, true);

      // Reset framing to default cover fit
      resetFraming();

      if (el.previewFramingBar) el.previewFramingBar.style.display = 'flex';
      if (el.previewFramingHint) {
        el.previewFramingHint.style.display = 'block';
        el.previewFramingHint.style.opacity = '1';
        clearTimeout(el.previewFramingHint._hideTimer);
        el.previewFramingHint._hideTimer = setTimeout(() => {
          if (el.previewFramingHint) el.previewFramingHint.style.opacity = '0';
        }, 4000);
      }

      initEngine();
    },
    () => {
      state.starlessCanvas = null;
      state.starlessFile = null;
      stopPreview();
      el.previewPlaceholder.style.display = '';
      el.previewStatus.classList.remove('visible');
      el.timeline.style.display = 'none';
      if (el.previewFramingBar) el.previewFramingBar.style.display = 'none';
      if (el.previewFramingHint) el.previewFramingHint.style.display = 'none';
      if (el.badgeAspectRatio) el.badgeAspectRatio.style.display = 'none';
      updateButtons();
    }
  );

  // ── Upload zone: Star Mask ──
  setupUploadZone(
    el.uploadStarmask, el.inputStarmask, el.previewStarmask,
    el.thumbStarmask, el.filenameStarmask, el.removeStarmask,
    () => ({ autoStretch: state.starmaskStretch === 'auto', stretchLevel: state.starmaskStretchLevel }),
    async (canvas, file) => {
      state.starmaskCanvas = canvas;
      state.starmaskFile = file;
      el.starGenControls.classList.remove('visible');
      await withLoading('Extracting stars from mask for 3D flyby...', async () => {
        rebuildEngine();
      });
    },
    () => {
      state.starmaskCanvas = null;
      state.starmaskFile = null;
      el.starGenControls.classList.add('visible');
      rebuildEngine();
    }
  );

  // ── Starless Stretch Selector & Slider Listeners ──
  if (el.ctrlStarlessStretch) {
    el.ctrlStarlessStretch.addEventListener('change', async () => {
      state.starlessStretch = el.ctrlStarlessStretch.value;
      if (el.groupStarlessLevel) {
        el.groupStarlessLevel.style.display = state.starlessStretch === 'auto' ? 'block' : 'none';
      }
      if (state.starlessFile) {
        await reloadStarless();
      }
    });
  }

  if (el.ctrlStarlessStretchLevel) {
    el.ctrlStarlessStretchLevel.addEventListener('input', () => {
      const val = parseInt(el.ctrlStarlessStretchLevel.value);
      state.starlessStretchLevel = val / 100;
      if (el.valStarlessStretch) {
        el.valStarlessStretch.textContent = val === 0 ? '0% (Linear)' : `${val}%`;
      }
      clearTimeout(el.ctrlStarlessStretchLevel._debounce);
      el.ctrlStarlessStretchLevel._debounce = setTimeout(() => {
        if (state.starlessFile && state.starlessStretch === 'auto') {
          reloadStarless();
        }
      }, 250);
    });
  }

  async function reloadStarless() {
    await withLoading('Updating Starless DSO stretch...', async () => {
      try {
        const newCanvas = await loadImageWithFallback(state.starlessFile, {
          autoStretch: state.starlessStretch === 'auto',
          stretchLevel: state.starlessStretchLevel,
        });
        state.starlessCanvas = newCanvas;
        const maxSize = 200;
        const scale = Math.min(maxSize / newCanvas.width, maxSize / newCanvas.height, 1);
        el.thumbStarless.width = Math.round(newCanvas.width * scale);
        el.thumbStarless.height = Math.round(newCanvas.height * scale);
        el.thumbStarless.getContext('2d').drawImage(newCanvas, 0, 0, el.thumbStarless.width, el.thumbStarless.height);
        rebuildEngine();
      } catch (e) {
        console.error('Failed to reload starless image:', e);
      }
    });
  }

  // ── Star Mask Stretch Selector & Slider Listeners ──
  if (el.ctrlStarmaskStretch) {
    el.ctrlStarmaskStretch.addEventListener('change', async () => {
      state.starmaskStretch = el.ctrlStarmaskStretch.value;
      if (el.groupStarmaskLevel) {
        el.groupStarmaskLevel.style.display = state.starmaskStretch === 'auto' ? 'block' : 'none';
      }
      if (state.starmaskFile) {
        await reloadStarmask();
      }
    });
  }

  if (el.ctrlStarmaskStretchLevel) {
    el.ctrlStarmaskStretchLevel.addEventListener('input', () => {
      const val = parseInt(el.ctrlStarmaskStretchLevel.value);
      state.starmaskStretchLevel = val / 100;
      if (el.valStarmaskStretch) {
        el.valStarmaskStretch.textContent = val === 0 ? '0% (Linear)' : `${val}%`;
      }
      clearTimeout(el.ctrlStarmaskStretchLevel._debounce);
      el.ctrlStarmaskStretchLevel._debounce = setTimeout(() => {
        if (state.starmaskFile && state.starmaskStretch === 'auto') {
          reloadStarmask();
        }
      }, 250);
    });
  }

  async function reloadStarmask() {
    await withLoading('Updating Star Mask stretch...', async () => {
      try {
        const newCanvas = await loadImageWithFallback(state.starmaskFile, {
          autoStretch: state.starmaskStretch === 'auto',
          stretchLevel: state.starmaskStretchLevel,
        });
        state.starmaskCanvas = newCanvas;
        const maxSize = 200;
        const scale = Math.min(maxSize / newCanvas.width, maxSize / newCanvas.height, 1);
        el.thumbStarmask.width = Math.round(newCanvas.width * scale);
        el.thumbStarmask.height = Math.round(newCanvas.height * scale);
        el.thumbStarmask.getContext('2d').drawImage(newCanvas, 0, 0, el.thumbStarmask.width, el.thumbStarmask.height);
        rebuildEngine();
      } catch (e) {
        console.error('Failed to reload starmask image:', e);
      }
    });
  }

  // ── Button groups ──
  setupButtonGroup(el.ctrlZoomDir);
  setupButtonGroup(el.ctrlRotDir);

  // ── Toggles ──
  setupToggle(el.ctrlZoomEnable, el.zoomControls);
  setupToggle(el.ctrlRotEnable, el.rotationControls);
  setupToggle(el.ctrlPanEnable, el.panControls);
  setupToggle(el.ctrlTwinkleEnable, el.twinkleControls);

  // ── Sliders with value display ──
  const sliderBindings = [
    [el.ctrlDuration, el.valDuration, v => `${v}s`],
    [el.ctrlZoomSpeed, el.valZoomSpeed, v => `${v}%`],
    [el.ctrlRotSpeed, el.valRotSpeed, v => `${v}°/s`],
    [el.ctrlPanSpeed, el.valPanSpeed, v => `${v}%`],
    [el.ctrlFlybySpeed, el.valFlybySpeed, v => `${v}%`],
    [el.ctrlParallax, el.valParallax, v => `${v}%`],
    [el.ctrlTwinkle, el.valTwinkle, v => `${v}%`],
    [el.ctrlDensity, el.valDensity, v => `${v}%`],
    [el.ctrlColortemp, el.valColortemp, v => {
      if (v < 30) return 'Cool';
      if (v > 70) return 'Warm';
      return 'Neutral';
    }],
    [el.ctrlBrightness, el.valBrightness, v => v > 100 ? `${v}% (+${v - 100}%)` : `${v}%`],
  ];

  for (const [slider, display, fmt] of sliderBindings) {
    if (!slider || !display) continue;
    slider.addEventListener('input', () => {
      display.textContent = fmt(parseInt(slider.value));
      // Debounce engine rebuild for star gen controls
      if ([el.ctrlDensity, el.ctrlColortemp, el.ctrlBrightness].includes(slider)) {
        clearTimeout(slider._debounce);
        slider._debounce = setTimeout(() => rebuildEngine(), 250);
      } else {
        rebuildEngine();
      }
    });
  }

  // Duration also updates timeline
  el.ctrlDuration.addEventListener('input', updateTimeline);

  // ── Aspect Ratio Pills & Resolution Options ──
  updateResolutionOptions(state.aspectRatio);
  setupPreviewInteractions();

  if (el.ctrlAspectRatio) {
    el.ctrlAspectRatio.querySelectorAll('.aspect-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        setAspectRatio(btn.dataset.ratio, false);
      });
    });
  }

  // ── Floating Framing Bar & Sidebar Framing Actions ──
  if (el.btnPreviewZoomIn) {
    el.btnPreviewZoomIn.addEventListener('click', (e) => {
      e.stopPropagation();
      setFramingScale(state.framing.scale * 1.15);
    });
  }
  if (el.btnPreviewZoomOut) {
    el.btnPreviewZoomOut.addEventListener('click', (e) => {
      e.stopPropagation();
      setFramingScale(state.framing.scale / 1.15);
    });
  }
  if (el.btnPreviewFit) {
    el.btnPreviewFit.addEventListener('click', (e) => {
      e.stopPropagation();
      fitImageInFrame();
    });
  }
  if (el.btnPreviewFill) {
    el.btnPreviewFill.addEventListener('click', (e) => {
      e.stopPropagation();
      fillImageInFrame();
    });
  }
  if (el.btnPreviewReset) {
    el.btnPreviewReset.addEventListener('click', (e) => {
      e.stopPropagation();
      resetFraming();
    });
  }

  if (el.ctrlStarlessScale) {
    el.ctrlStarlessScale.addEventListener('input', () => {
      const val = parseInt(el.ctrlStarlessScale.value);
      state.framing.scale = val / 100;
      onFramingChanged();
    });
  }
  if (el.btnScaleFit) el.btnScaleFit.addEventListener('click', fitImageInFrame);
  if (el.btnScaleFill) el.btnScaleFill.addEventListener('click', fillImageInFrame);
  if (el.btnScaleReset) el.btnScaleReset.addEventListener('click', resetFraming);

  // Resolution change rebuilds
  el.ctrlResolution.addEventListener('change', () => {
    const selectedOpt = el.ctrlResolution.selectedOptions[0];
    if (selectedOpt && selectedOpt.dataset.tier) {
      state.qualityTier = selectedOpt.dataset.tier;
    }
    withLoading('Rebuilding resolution...', async () => rebuildEngine());
  });
  el.ctrlFps.addEventListener('change', rebuildEngine);
  el.ctrlEasing.addEventListener('change', rebuildEngine);
  el.ctrlPanDir.addEventListener('change', rebuildEngine);
  el.ctrlVignette.addEventListener('change', rebuildEngine);

  // ── Action buttons ──
  el.btnPreview.addEventListener('click', startPreview);
  el.btnStop.addEventListener('click', stopPreview);
  el.btnExport.addEventListener('click', exportVideo);

  el.btnDownload.addEventListener('click', () => {
    if (state.resultUrl) {
      VideoRecorder.download(state.resultUrl, `cinematic-astro-${parseInt(el.ctrlDuration.value)}s.mp4`);
    }
  });

  // ── Timeline scrubber ──
  el.timelineScrubber.addEventListener('input', () => {
    if (state.isPreviewing) stopPreview();
    if (state.engine) {
      const progress = parseInt(el.timelineScrubber.value) / 1000;
      state.engine.renderAt(progress);
      const dur = parseInt(el.ctrlDuration.value);
      el.timeCurrent.textContent = formatTime(progress * dur);
    }
  });

  updateButtons();
}

// Boot
init();
