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
    // H.264 requires dimensions divisible by 2
    const encWidth = this.width % 2 === 0 ? this.width : this.width - 1;
    const encHeight = this.height % 2 === 0 ? this.height : this.height - 1;

    // Try WebCodecs VideoEncoder first for true standard MP4 (H.264/AVC)
    if (typeof VideoEncoder !== 'undefined') {
      try {
        const codec = 'avc1.4d002a'; // H.264 Main Profile level 4.2
        const config = {
          codec,
          width: encWidth,
          height: encHeight,
          bitrate: this.videoBitrate,
          framerate: this.fps,
        };

        const support = await VideoEncoder.isConfigSupported(config);
        if (support && support.supported) {
          this.muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
              codec: 'avc',
              width: encWidth,
              height: encHeight,
            },
            fastStart: 'in-memory',
          });

          this.videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
              this.muxer.addVideoChunk(chunk, meta);
            },
            error: (e) => {
              console.error('VideoEncoder error:', e);
            },
          });

          this.videoEncoder.configure(config);
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
    this.stream = this.canvas.captureStream(this.fps);
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
      // Timestamp in microseconds (1,000,000 / fps per frame)
      const timestamp = Math.round(frameIndex * (1_000_000 / this.fps));
      const videoFrame = new VideoFrame(this.canvas, { timestamp });
      const keyFrame = frameIndex % (this.fps * 2) === 0;
      this.videoEncoder.encode(videoFrame, { keyFrame });
      videoFrame.close();
    } catch (err) {
      console.error('Error encoding video frame:', err);
    }
  }

  /**
   * Stop recording and finalize video into an MP4 Blob.
   * @returns {Promise<Blob>}
   */
  async stop() {
    if (this.useWebCodecs && this.videoEncoder && this.muxer) {
      try {
        await this.videoEncoder.flush();
        this.videoEncoder.close();
        this.muxer.finalize();
        const buffer = this.muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        this.isRecording = false;
        return blob;
      } catch (err) {
        console.error('Failed to finalize WebCodecs muxer:', err);
      }
    }

    // Fallback MediaRecorder stop
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const blob = new Blob(this.chunks, { type: 'video/mp4' });
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
   * Download the recorded video as an MP4 file.
   * @param {string} url - Blob URL
   * @param {string} [filename='cinematic-astro.mp4'] - Download filename
   */
  static download(url, filename = 'cinematic-astro.mp4') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.mp4') ? filename : `${filename}.mp4`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) document.body.removeChild(a);
    }, 100);
  }
}
