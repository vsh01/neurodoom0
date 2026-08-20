// Shared math, RNG and colour helpers used by the whole engine.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

// Shortest signed angle from a to b.
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Deterministic RNG so generated art looks the same on every machine.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- pixel packing -------------------------------------------------------
const probeBuf = new ArrayBuffer(4);
new Uint32Array(probeBuf)[0] = 0x11223344;
const LITTLE_ENDIAN = new Uint8Array(probeBuf)[0] === 0x44;

export function pack(r, g, b, a = 255) {
  return LITTLE_ENDIAN
    ? (((a << 24) | (b << 16) | (g << 8) | r) >>> 0)
    : (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
}

// --- light / shading -----------------------------------------------------
// A texture is pre-shaded into SHADES brightness steps so the inner render
// loops only ever do an array lookup. FULL_LIGHT is 1:1 with the source
// colours; everything above it is over-bright (muzzle flashes, fireballs).
export const SHADES = 32;
export const FULL_LIGHT = 24;

export function shadeFactor(level) {
  return 0.05 + (level / FULL_LIGHT) * 0.95;
}

// Builds the shade ladder for one RGBA image.
export function buildShades(rgba, w, h) {
  const n = w * h;
  const shades = [];
  for (let l = 0; l < SHADES; l++) {
    const f = shadeFactor(l);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rgba[i * 4 + 3];
      if (a === 0) { out[i] = 0; continue; }
      const r = Math.min(255, rgba[i * 4] * f) | 0;
      const g = Math.min(255, rgba[i * 4 + 1] * f) | 0;
      const b = Math.min(255, rgba[i * 4 + 2] * f) | 0;
      out[i] = pack(r, g, b, a);
    }
    shades.push(out);
  }
  return { w, h, shades };
}

// Distance -> light level lookup, quantised to 1/8 of a world unit.
const LUT_STEP = 8;
const LUT_MAX = 64 * LUT_STEP;
const LIGHT_LUT = new Uint8Array(LUT_MAX);
for (let i = 0; i < LUT_MAX; i++) {
  const d = i / LUT_STEP;
  const intensity = 1 / (1 + d * 0.128 + d * d * 0.0034);
  LIGHT_LUT[i] = Math.max(4, Math.round(FULL_LIGHT * intensity));
}

export function lightForDist(dist) {
  const i = (dist * LUT_STEP) | 0;
  return i >= LUT_MAX ? 2 : LIGHT_LUT[i < 0 ? 0 : i];
}

// Off-screen canvas used by the procedural art generators.
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

export function canvasToShaded(canvas, ctx) {
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  return buildShades(data, w, h);
}
