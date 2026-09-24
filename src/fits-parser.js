/**
 * Astronimation — FITS File Parser
 * Lightweight parser for FITS/FIT astronomical image files.
 * Supports BITPIX 8, 16, 32, -32 (float), -64 (double).
 * Applies BZERO/BSCALE and auto-stretches to 0-255 for canvas rendering.
 */

const HEADER_BLOCK_SIZE = 2880;

/**
 * Parse a FITS file from an ArrayBuffer.
 * Returns { width, height, imageData } where imageData is an ImageData-compatible Uint8ClampedArray (RGBA).
 */
export function parseFITS(arrayBuffer, options = {}) {
  const { autoStretch = false, stretchLevel = 0.5 } = options;
  const bytes = new Uint8Array(arrayBuffer);

  // ── Parse header ──────────────────────────────────────────
  const header = {};
  let headerEnd = 0;
  let blockIndex = 0;

  outerLoop:
  while (blockIndex * HEADER_BLOCK_SIZE < bytes.length) {
    const blockStart = blockIndex * HEADER_BLOCK_SIZE;
    const blockBytes = bytes.slice(blockStart, blockStart + HEADER_BLOCK_SIZE);
    const blockText = new TextDecoder('ascii').decode(blockBytes);

    // Each card is 80 characters
    for (let i = 0; i < 36; i++) {
      const card = blockText.substring(i * 80, (i + 1) * 80);
      const keyword = card.substring(0, 8).trim();

      if (keyword === 'END') {
        headerEnd = (blockIndex + 1) * HEADER_BLOCK_SIZE;
        break outerLoop;
      }

      if (card.charAt(8) === '=' && card.charAt(9) === ' ') {
        let valueStr = card.substring(10, 80);
        // Remove comment after /
        const slashIdx = valueStr.indexOf('/');
        if (slashIdx >= 0) {
          const quoteIdx = valueStr.indexOf("'");
          if (quoteIdx < 0 || slashIdx < quoteIdx) {
            valueStr = valueStr.substring(0, slashIdx);
          } else {
            const closeQuote = valueStr.indexOf("'", quoteIdx + 1);
            if (slashIdx > closeQuote) {
              valueStr = valueStr.substring(0, slashIdx);
            }
          }
        }
        valueStr = valueStr.trim();

        // Parse value
        if (valueStr.startsWith("'")) {
          header[keyword] = valueStr.replace(/^'|'$/g, '').trim();
        } else if (valueStr === 'T') {
          header[keyword] = true;
        } else if (valueStr === 'F') {
          header[keyword] = false;
        } else if (valueStr.includes('.') || valueStr.includes('E') || valueStr.includes('e')) {
          header[keyword] = parseFloat(valueStr);
        } else {
          header[keyword] = parseInt(valueStr, 10);
        }
      }
    }
    blockIndex++;
  }

  if (headerEnd === 0) {
    throw new Error('FITS: Could not find END keyword in header');
  }

  // ── Extract dimensions ────────────────────────────────────
  const naxis = header['NAXIS'] || 0;
  const bitpix = header['BITPIX'];
  const naxis1 = header['NAXIS1'] || 0; // width
  const naxis2 = header['NAXIS2'] || 0; // height
  const naxis3 = header['NAXIS3'] || 1; // channels (1 for mono, 3 for RGB)
  const bzero = header['BZERO'] !== undefined ? header['BZERO'] : 0;
  const bscale = header['BSCALE'] !== undefined ? header['BSCALE'] : 1;

  if (naxis < 2 || naxis1 === 0 || naxis2 === 0) {
    throw new Error(`FITS: Invalid dimensions NAXIS=${naxis}, NAXIS1=${naxis1}, NAXIS2=${naxis2}`);
  }

  const width = naxis1;
  const height = naxis2;
  const channels = Math.min(naxis3, 3);

  // ── Read pixel data ───────────────────────────────────────
  const dataStart = headerEnd;
  const dataView = new DataView(arrayBuffer, dataStart);
  const pixelCount = width * height * channels;
  const rawPixels = new Float64Array(pixelCount);

  let bytesPerPixel;
  switch (bitpix) {
    case 8: bytesPerPixel = 1; break;
    case 16: bytesPerPixel = 2; break;
    case 32: bytesPerPixel = 4; break;
    case -32: bytesPerPixel = 4; break;
    case -64: bytesPerPixel = 8; break;
    default: throw new Error(`FITS: Unsupported BITPIX=${bitpix}`);
  }

  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * bytesPerPixel;
    let value;

    switch (bitpix) {
      case 8:
        value = dataView.getUint8(offset);
        break;
      case 16:
        value = dataView.getInt16(offset, false); // big-endian
        break;
      case 32:
        value = dataView.getInt32(offset, false);
        break;
      case -32:
        value = dataView.getFloat32(offset, false);
        break;
      case -64:
        value = dataView.getFloat64(offset, false);
        break;
    }

    const scaled = value * bscale + bzero;
    rawPixels[i] = scaled;
    if (isFinite(scaled)) {
      if (scaled < min) min = scaled;
      if (scaled > max) max = scaled;
    }
  }

  if (!isFinite(min)) min = 0;
  if (!isFinite(max) || max <= min) max = min + 1;

  // ── Scale pixel data to 0-255 ────────────────────────────
  // Define exact linear/original preservation function
  let linearScaleFn;
  if (bitpix === 8) {
    linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, val)));
  } else if (bitpix === 16) {
    // Standard 16-bit FITS with BZERO=32768 maps to 0..65535
    if (max > 255 || bzero === 32768) {
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, (val / 65535) * 255)));
    } else if (min < 0) {
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, ((val + 32768) / 65535) * 255)));
    } else {
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, val)));
    }
  } else if (bitpix === -32 || bitpix === -64) {
    // Float FITS: PixInsight, Siril, DSS save processed 32-bit floats in [0.0, 1.0]
    if (max <= 1.05 && min >= -0.05) {
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, val * 255)));
    } else if (max <= 65536 && max > 1.05) {
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, (val / 65535) * 255)));
    } else {
      const span = max - min || 1;
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, ((val - min) / span) * 255)));
    }
  } else {
    // 32-bit int
    if (max > 65535) {
      const span = max - min || 1;
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, ((val - min) / span) * 255)));
    } else {
      linearScaleFn = (val) => Math.round(Math.max(0, Math.min(255, (val / 65535) * 255)));
    }
  }

  let scaleFn;

  if (autoStretch) {
    const lvl = Math.max(0.0, Math.min(1.0, stretchLevel));
    if (lvl <= 0.005) {
      // Exactly 0%: Strictly the original linear / un-stretched brightness
      scaleFn = linearScaleFn;
    } else {
      const sampleSize = Math.min(pixelCount, 40000);
      const step = Math.max(1, Math.floor(pixelCount / sampleSize));
      const sample = [];
      for (let i = 0; i < pixelCount; i += step) {
        const v = rawPixels[i];
        if (isFinite(v)) sample.push(v);
      }
      sample.sort((a, b) => a - b);
      const median = sample[Math.floor(sample.length * 0.5)] || min;
      const bg = Math.max(min, median);
      const p99 = sample[Math.floor(sample.length * 0.995)] || max;
      const range = (p99 - bg) || (max - min) || 1;
      const m = Math.max(0.035, 0.22 - lvl * 0.17);

      scaleFn = (val) => {
        const linVal = linearScaleFn(val);
        const x = Math.max(0, Math.min(1, (val - bg) / range));
        const stretched = Math.round(Math.max(0, Math.min(255, (((m - 1) * x) / ((2 * m - 1) * x - m)) * 255)));
        // Smoothly blend from 100% linear at lvl=0 to full MTF stretch at lvl=1
        const blendWeight = Math.pow(lvl, 1.8);
        const blended = linVal * (1 - blendWeight) + stretched * blendWeight;
        return Math.round(Math.max(0, Math.min(255, blended)));
      };
    }
  } else {
    // Non-stretched / original
    scaleFn = linearScaleFn;
  }

  // ── Build RGBA ImageData ──────────────────────────────────
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // FITS stores bottom-to-top, so flip vertically
      const fitsRow = height - 1 - y;
      const outIdx = (y * width + x) * 4;

      if (channels >= 3) {
        // RGB FITS (NAXIS3=3): data is stored as [R plane][G plane][B plane]
        const planeSize = width * height;
        const r = rawPixels[0 * planeSize + fitsRow * width + x];
        const g = rawPixels[1 * planeSize + fitsRow * width + x];
        const b = rawPixels[2 * planeSize + fitsRow * width + x];
        rgba[outIdx + 0] = scaleFn(r);
        rgba[outIdx + 1] = scaleFn(g);
        rgba[outIdx + 2] = scaleFn(b);
      } else {
        // Monochrome
        const val = rawPixels[fitsRow * width + x];
        const scaledVal = scaleFn(val);
        rgba[outIdx + 0] = scaledVal;
        rgba[outIdx + 1] = scaledVal;
        rgba[outIdx + 2] = scaledVal;
      }
      rgba[outIdx + 3] = 255;
    }
  }

  return { width, height, rgba, header };
}
