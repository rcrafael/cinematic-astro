# Cinematic Astro App 🌌🎬

> **Transform deep-sky astrophotography into immersive 3D cinematic video flybys with realistic depth, star fields, and motion.**

[![Web App](https://img.shields.io/badge/Live%20Demo-cinematicastro.web.app-brightgreen?style=flat-square)](https://cinematicastro.web.app/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%208-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![JavaScript](https://img.shields.io/badge/Language-JavaScript%20(ES6+)-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-blueviolet?style=flat-square)](https://web.dev/progressive-web-apps/)

---

## 📽️ Sample Output

See the application in action with a sample deep-sky object animation:

🎬 **[Eagle Nebula through Cinematic Astro App](https://www.youtube.com/watch?v=4GBs23ZA1EA)**

---

## 📖 Application Purpose

**Cinematic Astro App** is a specialized browser-based application designed for astrophotographers, astronomy enthusiasts, and digital artists. While conventional astrophotography produces stunning but static 2D images, this tool brings deep-sky objects (DSOs) such as nebulae, galaxies, supernova remnants, and star clusters to life.

By separating or synthesizing the starless nebula structure and foreground/midground star layers, the app simulates realistic 3D perspective projection, optical flow, camera zoom, rotation, and translational parallax. Everything runs directly in the browser—with zero server uploads required—delivering instant previews and exporting production-grade MP4 video files ready for social media (Shorts, Reels, TikTok, Instagram) or widescreen displays.

---

## ✨ Features

### 🔭 Astronomical & Multi-Format Image Support
- **FITS & Astronomical Data Parsing:** Custom in-browser parser for scientific `.fit` and `.fits` files supporting `BITPIX` formats (8, 16, 32, -32 float, -64 double) with `BZERO` and `BSCALE` scaling.
- **Auto-Stretch Capabilities:** Built-in histogram auto-stretching for raw linear FITS/TIFF frames with adjustable stretch strength sliders.
- **Universal Formats:** Supports `.png`, `.jpg`, `.jpeg`, `.tiff`, and `.tif` image files.
- **Dedicated Star Mask Support:** Upload a custom star mask extracted from tools like StarXTerminator, Starnet++, or PixInsight, or allow the app to procedurally generate a realistic star field.
- **Orientation & Framing Controls:** Rotate (0°, 90°, 180°, 270°), flip horizontally/vertically, and zoom/pan framing with quick actions (`Fit`, `Fill`, `Safe (Rec.)`, `Reset`) to prevent black borders during rotational animation.

### 🚀 3D Animation & Parallax Engine
- **3D Perspective Projection:** Realistic optical flow with continuous depth stratification where foreground stars move faster than background structures.
- **Camera Zoom:** Smooth Zoom In and Zoom Out controls with configurable speeds.
- **Camera Rotation:** Continuous Clockwise and Counter-Clockwise roll with fine angular velocity adjustments (°/s).
- **Directional Pan:** 8-directional panning (Left, Right, Up, Down, and Diagonals).
- **Flyby & Depth Warp:** Fine-tune 3D flyby speed and parallax intensity.
- **Stellar Twinkle:** Dynamic star twinkle simulation with customizable intensity and phase variation.
- **Cinematic Vignette:** Subtle vignette shading to highlight the central deep-sky target.

### 🌟 Realistic Star Field Generation & Extraction
- **Star Extraction:** Automatic thresholding and Point Spread Function (PSF) modeling from uploaded star masks.
- **Poisson Disk Sampling:** Non-uniform, natural star distribution avoiding artificial clustering.
- **Astronomical PSF Rendering:** Natural Moffat/Gaussian point-spread functions that preserve star sharpness without unnatural bloating.
- **Stellar Color Temperature:** Kelvin-based color temperature scale ranging from cool blue (O/B stars) to warm red/orange (K/M stars).
- **Power-Law Luminosity:** Brightness distributions conforming to astronomical stellar populations.

### 🎬 Professional Video Export & Media Settings
- **Hardware-Accelerated In-Browser Export:** Encodes true `.mp4` video files using the modern **WebCodecs API** (`VideoEncoder`) with H.264/AVC, falling back gracefully to `MediaRecorder`.
- **Pure Client-Side Muxing:** Packages frames into standard MP4 containers directly in-memory via `mp4-muxer` without backend processing.
- **Resolution Options:** 
  - **1080p** Full HD (1920×1080)
  - **1440p** QHD (2560×1440)
  - **4K** Ultra HD (3840×2160)
- **Aspect Ratio Presets with Auto-Detection:**
  - `16:9` Landscape (YouTube, Desktop, TV)
  - `9:16` Vertical (YouTube Shorts, Instagram Reels, TikTok, Stories)
  - `4:3` Standard (Classic astrophotography camera sensors)
  - `1:1` Square (Instagram feed)
  - Auto-detection feature matching the uploaded image's native sensor aspect ratio.
- **Frame Rate Selection:** 24 fps (Cinematic), 30 fps, and 60 fps (Smooth).
- **Customizable Duration:** Animation duration from 10 to 30 seconds.
- **Cinematic Easing Curves:** Linear, Ease In/Out Cubic, Ease In Cubic, Ease Out Cubic, and Ease In/Out Sine.

### 🖥️ User Experience & Progressive Web App (PWA)
- **Real-Time Interactive Preview:** Instant scrubbing with timeline bar and real-time canvas rendering.
- **Immersive Fullscreen HUD:** Borderless fullscreen mode with on-screen playback controls, time display, scrubbing, and keyboard shortcuts (`Space` to play/pause, `F` for fullscreen, `Esc` to exit).
- **Installable PWA:** Full offline and standalone support on Android, iOS (Add to Home Screen modal guide), and Desktop.

---

## 🛠️ Tech Stack

| Category | Technologies / Libraries |
| :--- | :--- |
| **Language & Runtime** | Vanilla Modern JavaScript (ES6+ Modules), HTML5, CSS3 |
| **Graphics & Rendering** | HTML5 2D Canvas API, OffscreenCanvas, Poisson Disk Sampling algorithms |
| **Astronomical Processing**| Custom lightweight FITS binary parser (`fits-parser.js`), TIFF decoder (`image-loader.js`) |
| **Video Encoding** | [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) (`VideoEncoder` H.264 / AVC), [mp4-muxer](https://github.com/Vanilagy/mp4-muxer), MediaRecorder API (fallback) |
| **Build & Tooling** | [Vite 8](https://vitejs.dev/), [Terser](https://terser.org/), [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator), [html-minifier-terser](https://github.com/terser/html-minifier-terser) |
| **PWA & Offline** | Service Workers (`sw.js`), Web App Manifest |
| **Deployment & Hosting**| [Firebase Hosting](https://firebase.google.com/docs/hosting) |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18 or higher recommended) installed.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Rcrafael/cinematic-astro.git
   cd cinematic-astro
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

### Development

To start the local development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

Open your browser and navigate to the local address displayed in the terminal (usually `http://localhost:5173`).

### Production Build

To build the project for production (minified, obfuscated, and bundled):

```bash
npm run build
```

The output will be generated inside the `dist/` directory.

### Preview Production Build

To preview the production bundle locally:

```bash
npm run preview
```

---

## 🌐 Deployment

The project is configured for seamless deployment to **Firebase Hosting**:

```bash
# Build the project
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

---

## 📄 License

This project is privately maintained for astrophotography animation workflows. All rights reserved.
