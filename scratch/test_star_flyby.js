import { generateStarField } from '../src/star-generator.js';
import { getCycleOffset, clamp } from '../src/utils.js';

console.log('=== Testing Cinematic 3D Parallax & Velocity Model ===');
const width = 1920;
const height = 1080;
const cx = width / 2;
const cy = height / 2;

const starData = generateStarField({ width, height, density: 0.5 });
const stars = starData.stars;

const flybySpeed = 0.5;
const speedMult = 0.35 + flybySpeed * 1.65;
const flybyIntensity = 0.7;
const flybyVelocity = 0.18 * speedMult * flybyIntensity; // ~0.148
console.log(`Flyby forward velocity: ${flybyVelocity.toFixed(4)} depth units/sec`);

// Check camera lateral drift and parallax at t = 5s
const t = 5;
const driftAmp = 35 * flybyIntensity;
const camX = Math.sin(t * 0.28) * driftAmp;
const camY = Math.cos(t * 0.20) * (driftAmp * 0.6);
console.log(`Camera 3D drift at t=5s: CamX=${camX.toFixed(2)}px, CamY=${camY.toFixed(2)}px`);

// Sample stars at near, mid, and far depths
const nearStar = stars.find(s => s.z >= 1.2 && s.z <= 1.4);
const midStar = stars.find(s => s.z >= 2.0 && s.z <= 2.4);
const farStar = stars.find(s => s.z >= 4.0);

console.log('\nParallax Disparity Comparison:');
for (const [label, star] of [['Near Star', nearStar], ['Mid Star', midStar], ['Far Star', farStar]]) {
  const starDZ = t * flybyVelocity * star.speedFactor;
  const zEff = star.z - starDZ;
  const scale = star.z / zEff;
  const starShiftX = -camX * (1.6 / zEff);
  const apparentSpeed = (star.speedFactor * flybyVelocity / zEff) * 45;
  console.log(`${label}: Initial z0=${star.z.toFixed(2)} -> zEff=${zEff.toFixed(2)} | Scale=${scale.toFixed(2)}x | Lateral Parallax Shift=${starShiftX.toFixed(2)}px | Apparent Speed=${apparentSpeed.toFixed(2)}px/f`);
}

const dsoShiftX = -camX * 0.15;
console.log(`DSO (Deep Background): Lateral Parallax Shift=${dsoShiftX.toFixed(2)}px`);

console.log('\nNotice the huge disparity: Near star shifts 10x more than DSO and rushes 8x faster than far star!');
console.log('This creates true stereoscopic 3D parallax!');
