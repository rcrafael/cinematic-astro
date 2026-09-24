/**
 * Astronimation — Unified Image Loader
 * Loads FITS, TIFF, PNG, JPG files and returns a normalized canvas-ready image.
 */

import { parseFITS } from './fits-parser.js';

/**
 * Load an image file and return a canvas element with the image drawn on it.
 * @param {File} file - The file to load
 * @returns {Promise<HTMLCanvasElement>} - Canvas with the image
 */
export async function loadImage(file, options = {}) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'fit' || ext === 'fits') {
    return loadFITS(file, options);
  } else if (ext === 'tiff' || ext === 'tif') {
    return loadTIFF(file);
  } else {
    // PNG, JPG, JPEG — native browser support
    return loadNative(file);
  }
}

/**
 * Load a FITS file and render to canvas.
 */
async function loadFITS(file, options = {}) {
  const arrayBuffer = await file.arrayBuffer();
  const { width, height, rgba } = parseFITS(arrayBuffer, options);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(rgba, width, height);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * Load a TIFF file using a manual decoder.
 * Supports uncompressed and basic TIFF formats.
 */
async function loadTIFF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { width, height, rgba } = decodeTIFF(arrayBuffer);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(rgba, width, height);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * Minimal TIFF decoder for uncompressed 8/16-bit grayscale and RGB TIFFs.
 */
function decodeTIFF(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Check byte order
  const bo = view.getUint16(0);
  const le = bo === 0x4949; // II = little-endian, MM = big-endian

  function getU16(offset) { return view.getUint16(offset, le); }
  function getU32(offset) { return view.getUint32(offset, le); }

  const magic = getU16(2);
  if (magic !== 42) throw new Error('Not a valid TIFF file');

  const ifdOffset = getU32(4);
  const numEntries = getU16(ifdOffset);

  const tags = {};
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = getU16(entryOffset);
    const type = getU16(entryOffset + 2);
    const count = getU32(entryOffset + 4);
    let value;

    if (type === 3 && count === 1) { // SHORT
      value = getU16(entryOffset + 8);
    } else if (type === 4 && count === 1) { // LONG
      value = getU32(entryOffset + 8);
    } else if (type === 3 && count > 1) {
      // Array of shorts — read from offset
      const arrOffset = count * 2 <= 4 ? entryOffset + 8 : getU32(entryOffset + 8);
      value = [];
      for (let j = 0; j < count; j++) {
        value.push(getU16(arrOffset + j * 2));
      }
    } else if (type === 4 && count > 1) {
      const arrOffset = getU32(entryOffset + 8);
      value = [];
      for (let j = 0; j < count; j++) {
        value.push(getU32(arrOffset + j * 4));
      }
    } else {
      value = getU32(entryOffset + 8);
    }
    tags[tag] = value;
  }

  const width = tags[256] || 0;          // ImageWidth
  const height = tags[257] || 0;         // ImageLength
  const bitsPerSample = tags[258] || 8;  // BitsPerSample
  const compression = tags[259] || 1;    // Compression (1=none)
  const samplesPerPixel = tags[277] || 1; // SamplesPerPixel
  const stripOffsets = tags[273];         // StripOffsets
  const stripByteCounts = tags[279];      // StripByteCounts
  const rowsPerStrip = tags[278] || height; // RowsPerStrip

  if (compression !== 1) {
    // Fallback: try to load as native image
    throw new Error('Compressed TIFF not supported — will fallback to native loader');
  }

  // Determine bits per channel (could be array for RGB)
  const bpc = Array.isArray(bitsPerSample) ? bitsPerSample[0] : bitsPerSample;
  const channels = typeof samplesPerPixel === 'number' ? samplesPerPixel : 1;

  // Read strip data
  const offsets = Array.isArray(stripOffsets) ? stripOffsets : [stripOffsets];
  const counts = Array.isArray(stripByteCounts) ? stripByteCounts : [stripByteCounts];

  // Concatenate all strip data
  let totalBytes = 0;
  for (const c of counts) totalBytes += c;
  const pixelData = new Uint8Array(totalBytes);
  let pos = 0;
  for (let s = 0; s < offsets.length; s++) {
    const src = bytes.subarray(offsets[s], offsets[s] + counts[s]);
    pixelData.set(src, pos);
    pos += counts[s];
  }

  // Convert to RGBA
  const rgba = new Uint8ClampedArray(width * height * 4);
  const bytesPerChannel = bpc / 8;
  const pixelView = new DataView(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixIdx = (y * width + x);
      const outIdx = pixIdx * 4;

      if (channels >= 3) {
        if (bpc === 16) {
          const base = pixIdx * channels * 2;
          rgba[outIdx + 0] = pixelView.getUint16(base, le) >> 8;
          rgba[outIdx + 1] = pixelView.getUint16(base + 2, le) >> 8;
          rgba[outIdx + 2] = pixelView.getUint16(base + 4, le) >> 8;
        } else {
          const base = pixIdx * channels;
          rgba[outIdx + 0] = pixelData[base];
          rgba[outIdx + 1] = pixelData[base + 1];
          rgba[outIdx + 2] = pixelData[base + 2];
        }
      } else {
        // Grayscale
        let val;
        if (bpc === 16) {
          val = pixelView.getUint16(pixIdx * 2, le) >> 8;
        } else {
          val = pixelData[pixIdx];
        }
        rgba[outIdx + 0] = val;
        rgba[outIdx + 1] = val;
        rgba[outIdx + 2] = val;
      }
      rgba[outIdx + 3] = 255;
    }
  }

  return { width, height, rgba };
}

/**
 * Load a native browser-supported image (PNG, JPG).
 */
async function loadNative(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Try loading a TIFF natively if our decoder fails (for compressed TIFFs).
 */
export async function loadImageWithFallback(file, options = {}) {
  try {
    return await loadImage(file, options);
  } catch (e) {
    // For TIFF files, try native loading as fallback (some browsers support it)
    if (file.name.match(/\.tiff?$/i)) {
      try {
        return await loadNative(file);
      } catch {
        throw e; // throw the original error
      }
    }
    throw e;
  }
}
