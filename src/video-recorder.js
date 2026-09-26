/**
 * Astronimation — Video Recorder
 * Exports animations as genuine .mp4 video files using WebCodecs + mp4-muxer,
 * with fallback to MediaRecorder for broader compatibility.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export class VideoRecorder {
  /**
   * @param {HTMLCanvasElement} canvas - The canvas to record
   * @param {Object} options
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.fps=30] - Frames per second
   * @param {number} [options.duration=10] - Duration in seconds
   * @param {number} [options.videoBitrate=15000000] - Video bitrate in bps
   * @param {function} [options.onProgress] - Progress callback (0-1)
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.width = options.width || canvas.width;
    this.height = options.height || canvas.height;
    this.fps = options.fps || 30;
    this.duration = options.duration || 10;
    this.videoBitrate = options.videoBitrate || 15_000_000;
    this.onProgress = options.onProgress || null;

    this.muxer = null;
    this.videoEncoder = null;
    this.useWebCodecs = false;
    this.encoderError = null;
    this.lastDecoderConfig = null;
    this.encodedChunksCount = 0;

    // Fallback MediaRecorder state
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.isRecording = false;
  }

  /**
   * Start recording.
   * Configures WebCodecs H.264 encoder if available, or falls back to MediaRecorder.
   */
  async start() {
    this.chunks = [];
    this.encoderError = null;
    this.lastDecoderConfig = null;
    this.encodedChunksCount = 0;

    // H.264 requires dimensions divisible by 2
    const encWidth = this.width % 2 === 0 ? this.width : this.width - 1;
    const encHeight = this.height % 2 === 0 ? this.height : this.height - 1;

    // Ensure canvas dimensions match encoding dimensions
    if (this.canvas.width !== encWidth || this.canvas.height !== encHeight) {
      this.canvas.width = encWidth;
      this.canvas.height = encHeight;
    }

    // Try WebCodecs VideoEncoder first for true standard MP4 (H.264/AVC)
    if (typeof VideoEncoder !== 'undefined') {
      try {
        const maxDim = Math.max(encWidth, encHeight);
        let candidateCodecs = [];
        if (maxDim >= 3840) {
          // 4K: Prioritize Baseline / Constrained Baseline (strictly disallows B-frames)
          candidateCodecs = [
            'avc1.420033', // Baseline Profile Level 5.1
            'avc1.42e033', // Constrained Baseline Profile Level 5.1
            'avc1.420034', // Baseline Profile Level 5.2
            'avc1.4d0033', // Main Profile Level 5.1
            'avc1.640033', // High Profile Level 5.1
            'avc1.4d0034', // Main Profile Level 5.2
            'avc1.640034', // High Profile Level 5.2
          ];
        } else if (maxDim >= 2560) {
          // 1440p: Prioritize Baseline / Constrained Baseline Level 5.0
          candidateCodecs = [
            'avc1.420032', // Baseline Profile Level 5.0
            'avc1.42e032', // Constrained Baseline Profile Level 5.0
            'avc1.420033', // Baseline Profile Level 5.1
            'avc1.4d0032', // Main Profile Level 5.0
            'avc1.640032', // High Profile Level 5.0
          ];
        } else if (maxDim >= 1920) {
          // 1080p: Prioritize Baseline / Constrained Baseline Level 4.0 / 4.2
          candidateCodecs = [
            'avc1.420028', // Baseline Profile Level 4.0 (No B-frames, maximum compatibility)
            'avc1.42e028', // Constrained Baseline Profile Level 4.0
            'avc1.42002a', // Baseline Profile Level 4.2
            'avc1.42001f', // Baseline Profile Level 3.1
            'avc1.4d0028', // Main Profile Level 4.0
            'avc1.4d002a', // Main Profile Level 4.2
            'avc1.640028', // High Profile Level 4.0
            'avc1.64002a', // High Profile Level 4.2
          ];
        } else {
          // <= 720p
          candidateCodecs = [
            'avc1.42001f', // Baseline Profile Level 3.1
            'avc1.42e01f', // Constrained Baseline Profile Level 3.1
            'avc1.420028', // Baseline Profile Level 4.0
            'avc1.4d001f', // Main Profile Level 3.1
            'avc1.64001f', // High Profile Level 3.1
          ];
        }

        let selectedConfig = null;
        for (const codec of candidateCodecs) {
          const configVariations = [
            {
              codec,
              width: encWidth,
              height: encHeight,
              bitrate: this.videoBitrate,
              framerate: this.fps,
              latencyMode: 'realtime',
              avc: { format: 'avc' },
            },
            {
              codec,
              width: encWidth,
              height: encHeight,
              bitrate: this.videoBitrate,
              framerate: this.fps,
              avc: { format: 'avc' },
            },
            {
              codec,
              width: encWidth,
              height: encHeight,
              bitrate: this.videoBitrate,
              framerate: this.fps,
            },
            // Lower bitrate fallback if hardware encoder on mobile rejects high bitrates
            {
              codec,
              width: encWidth,
              height: encHeight,
              bitrate: Math.min(this.videoBitrate, 10_000_000),
              framerate: this.fps,
            },
          ];

          for (const testConfig of configVariations) {
            try {
              const support = await VideoEncoder.isConfigSupported(testConfig);
              if (support && support.supported) {
                selectedConfig = support.config || testConfig;
                break;
              }
            } catch {
              // Try next variation
            }
          }
          if (selectedConfig) break;
        }

        if (selectedConfig) {
          this.muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
              codec: 'avc',
              width: encWidth,
              height: encHeight,
              frameRate: this.fps,
            },
            fastStart: 'in-memory',
            // Crucial for Firefox & Safari: offset any non-zero initial DTS/PTS so DTS starts at 0
            firstTimestampBehavior: 'offset',
          });

          this.videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
              try {
                // Track decoderConfig if provided in metadata
                if (meta?.decoderConfig) {
                  this.lastDecoderConfig = meta.decoderConfig;
                }

                // In frame-locked canvas recording, each output chunk corresponds to a sequential frame.
                // Using synthetic monotonically increasing timestamps ensures that any browser-internal
                // timestamp jitter, B-frame reordering, or floating point rounding issues never cause
                // "Timestamps must be monotonically increasing" errors in mp4-muxer.
                const frameDurationMicros = 1_000_000 / this.fps;
                const chunkIndex = this.encodedChunksCount;
                this.encodedChunksCount++;

                const timestamp = Math.round(chunkIndex * frameDurationMicros);
                const duration = Math.round(frameDurationMicros);

                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);

                // Pass cached decoderConfig if current chunk meta omits it
                let metaToPass = meta;
                if (!metaToPass?.decoderConfig && this.lastDecoderConfig) {
                  metaToPass = { ...metaToPass, decoderConfig: this.lastDecoderConfig };
                }

                this.muxer.addVideoChunkRaw(data, chunk.type, timestamp, duration, metaToPass);
              } catch (err) {
                console.error('Error writing video chunk to muxer:', err);
                this.encoderError = err;
              }
            },
            error: (e) => {
              console.error('VideoEncoder error:', e);
              this.encoderError = e;
            },
          });

          this.videoEncoder.configure(selectedConfig);
          this.useWebCodecs = true;
          this.isRecording = true;
          return;
        }
      } catch (err) {
        console.warn('WebCodecs VideoEncoder unavailable, falling back to MediaRecorder:', err);
      }
    }

    // Fallback: MediaRecorder
    this.useWebCodecs = false;
    const captureStream = this.canvas.captureStream
      ? this.canvas.captureStream.bind(this.canvas)
      : this.canvas.mozCaptureStream
        ? this.canvas.mozCaptureStream.bind(this.canvas)
        : null;

    if (!captureStream) {
      throw new Error('Video recording is not supported in this browser. Please use Chrome, Safari (iOS 16.4+), Firefox, or Edge.');
    }

    this.stream = captureStream(this.fps);
    const mimeType = VideoRecorder.getSupportedMimeType();

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: this.videoBitrate,
      });
    } catch {
      this.mediaRecorder = new MediaRecorder(this.stream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  /**
   * Add a single rendered canvas frame to the video encoder.
   * @param {number} frameIndex
   */
  async addFrame(frameIndex) {
    if (!this.useWebCodecs || !this.videoEncoder || this.videoEncoder.state !== 'configured') {
      return;
    }

    try {
      while (this.videoEncoder && this.videoEncoder.encodeQueueSize > 6) {
        await new Promise(resolve => setTimeout(resolve, 15));
      }

      // Timestamp & duration in microseconds (1,000,000 / fps per frame)
      const frameDuration = Math.round(1_000_000 / this.fps);
      const timestamp = Math.round(frameIndex * frameDuration);
      const videoFrame = new VideoFrame(this.canvas, { timestamp, duration: frameDuration });
      const keyFrame = frameIndex % (this.fps * 2) === 0;
      this.videoEncoder.encode(videoFrame, { keyFrame });
      videoFrame.close();
    } catch (err) {
      console.error('Error encoding video frame:', err);
      this.encoderError = err;
    }
  }

  /**
   * Stop recording and finalize video into an MP4 Blob.
   * @returns {Promise<Blob>}
   */
  async stop() {
    if (this.useWebCodecs && this.videoEncoder && this.muxer) {
      try {
        if (this.encoderError) {
          throw this.encoderError;
        }
        await this.videoEncoder.flush();
        this.videoEncoder.close();

        if (this.encoderError) {
          throw this.encoderError;
        }

        if (this.encodedChunksCount === 0) {
          throw new Error('VideoEncoder completed without producing any encoded frames.');
        }

        this.muxer.finalize();
        const buffer = this.muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        this.isRecording = false;
        return blob;
      } catch (err) {
        console.error('Failed to finalize WebCodecs muxer:', err);
        throw err;
      }
    }

    // Fallback MediaRecorder stop
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const mime = this.mediaRecorder?.mimeType || 'video/mp4';
        const blob = new Blob(this.chunks, { type: mime.includes('mp4') ? 'video/mp4' : mime });
        this.isRecording = false;
        resolve(blob);
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
        const mime = this.mediaRecorder.mimeType || 'video/mp4';
        const blob = new Blob(this.chunks, { type: mime.includes('mp4') ? 'video/mp4' : mime });
        resolve(blob);
      };

      this.mediaRecorder.onerror = (e) => {
        this.isRecording = false;
        reject(e);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Get the best supported MediaRecorder mime type.
   */
  static getSupportedMimeType() {
    const types = [
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/mp4';
  }

  /**
   * Download the recorded video as a video file with the correct extension.
   * @param {string} url - Blob URL
   * @param {string} [filename='cinematic-astro.mp4'] - Download filename
   */
  static download(url, filename = 'cinematic-astro.mp4') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
    }, 100);
  }
}
