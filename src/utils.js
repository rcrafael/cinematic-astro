/**
 * Astronimation — Utility Functions
 * Easing curves, math helpers, color conversion
 */

// ── Easing Functions ──────────────────────────────────────────────
export const Easing = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => (--t) * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

// ── Math Helpers ──────────────────────────────────────────────────
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function degToRad(deg) {
  return deg * (Math.PI / 180);
}

export function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

/**
 * Attempt to get a seeded pseudo-random number generator.
 * Uses a simple mulberry32 PRNG.
 */
export function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic pseudo-random 2D coordinate in [0, 1) for a star at a given wrap cycle.
 */
export function getCycleOffset(seed, cycle) {
  let h = ((seed * 1597334677) ^ (cycle * 3812015801)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  const r1 = ((h ^ (h >>> 16)) >>> 0) / 4294967296;

  let h2 = (h ^ 0x9e3779b9) >>> 0;
  h2 = Math.imul(h2 ^ (h2 >>> 15), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  const r2 = ((h2 ^ (h2 >>> 16)) >>> 0) / 4294967296;

  return [r1, r2];
}

// ── Color Helpers ─────────────────────────────────────────────────

/**
 * Convert a star temperature (Kelvin) to approximate RGB.
 * Uses Tanner Helland's algorithm.
 */
export function kelvinToRGB(kelvin) {
  const temp = clamp(kelvin, 1000, 40000) / 100;
  let r, g, b;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = clamp(r, 0, 255);
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    g = clamp(g, 0, 255);
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    g = clamp(g, 0, 255);
  }

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    b = clamp(b, 0, 255);
  }

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

/**
 * Convert RGBA to CSS string.
 */
export function rgbaString(r, g, b, a = 1) {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

// ── Canvas Helpers ────────────────────────────────────────────────

/**
 * Create an offscreen canvas of given dimensions.
 */
export function createOffscreenCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Draw an image (or canvas) scaled to cover the target canvas (like CSS background-size: cover).
 */
export function drawCover(ctx, img, canvasW, canvasH) {
  const imgW = img.width || img.naturalWidth;
  const imgH = img.height || img.naturalHeight;
  const scale = Math.max(canvasW / imgW, canvasH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  const x = (canvasW - w) / 2;
  const y = (canvasH - h) / 2;
  ctx.drawImage(img, x, y, w, h);
}
