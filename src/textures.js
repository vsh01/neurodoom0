// Every wall and flat in the game is generated procedurally at boot, so the
// build ships with zero binary assets.

import { makeRng, buildShades, clamp } from './util.js';

export const TEX_SIZE = 64;

export const T = {
  STONE: 1,
  BRICK: 2,
  TECH: 3,
  BLOOD: 4,
  DOOR: 5,
  DOOR_RED: 6,
  EXIT: 7,
  EXIT_ON: 8,
  SUPPORT: 9,
  F_CONCRETE: 10,
  F_METAL: 11,
  F_BLOOD: 12,
  C_DARK: 13,
  C_LIGHT: 14,
};

// --- noise helpers -------------------------------------------------------
function valueNoise(size, cells, rng) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(size * size);
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const y0 = iy % cells;
    const y1 = (iy + 1) % cells;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const x0 = ix % cells;
      const x1 = (ix + 1) % cells;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * sx;
      const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

function fbm(size, rng) {
  const a = valueNoise(size, 4, rng);
  const b = valueNoise(size, 8, rng);
  const c = valueNoise(size, 16, rng);
  const d = valueNoise(size, 32, rng);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    out[i] = a[i] * 0.5 + b[i] * 0.26 + c[i] * 0.16 + d[i] * 0.08;
  }
  return out;
}

// Runs `fn(x, y, put)` over the texture and returns RGBA bytes.
function paint(fn) {
  const s = TEX_SIZE;
  const data = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const rgb = fn(x, y);
      const i = (y * s + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

// --- individual textures -------------------------------------------------
function brickTexture(seed, base, mortar, brickW, brickH) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  const grain = fbm(TEX_SIZE, makeRng(seed + 77));
  return paint((x, y) => {
    const row = Math.floor(y / brickH);
    const off = (row % 2) * (brickW / 2);
    const bx = (x + off) % brickW;
    const by = y % brickH;
    const isMortar = bx < 2 || by < 2;
    const noise = (n[y * TEX_SIZE + x] - 0.5) * 46 + (grain[y * TEX_SIZE + x] - 0.5) * 20;
    if (isMortar) {
      const m = noise * 0.4;
      return [mortar[0] + m, mortar[1] + m, mortar[2] + m];
    }
    // Light from the top-left of each brick, shadow bottom-right.
    const bevel = (by < 4 ? 16 : 0) + (bx < 5 ? 10 : 0) -
      (by > brickH - 4 ? 18 : 0) - (bx > brickW - 4 ? 12 : 0);
    return [base[0] + noise + bevel, base[1] + noise + bevel, base[2] + noise + bevel];
  });
}

function techTexture(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const g = (n[y * TEX_SIZE + x] - 0.5) * 26;
    let r = 74 + g, gg = 82 + g, b = 96 + g;
    // Recessed panel outline.
    const px = x % 32, py = y % 64;
    const edge = px < 2 || px > 29 || py < 2 || py > 61;
    if (edge) { r -= 26; gg -= 26; b -= 24; }
    // Horizontal seam with a lit lip.
    if (y === 31) { r += 30; gg += 34; b += 40; }
    if (y === 32 || y === 33) { r -= 26; gg -= 26; b -= 22; }
    // Rivets in the panel corners.
    for (const [cx, cy] of [[6, 6], [25, 6], [6, 57], [25, 57]]) {
      const dx = px - cx, dy = py - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 2.6) {
        const l = 26 - d * 12 + (dx + dy < 0 ? 22 : -10);
        r += l; gg += l; b += l;
      }
    }
    // Faint indicator strip.
    if (x % 32 > 12 && x % 32 < 20 && y % 64 > 40 && y % 64 < 44) {
      r -= 20; gg += 46; b += 6;
    }
    return [r, gg, b];
  });
}

function bloodTexture(seed) {
  const rng = makeRng(seed);
  const base = brickTexture(seed + 3, [86, 84, 88], [46, 44, 48], 32, 16);
  const streak = fbm(TEX_SIZE, rng);
  const data = new Uint8ClampedArray(base);
  for (let x = 0; x < TEX_SIZE; x++) {
    // Vertical smear: a column bleeds downward while the source is strong.
    let flow = 0;
    for (let y = 0; y < TEX_SIZE; y++) {
      const v = streak[y * TEX_SIZE + x];
      if (v > 0.62 && y < 40) flow = Math.max(flow, (v - 0.62) * 5);
      flow *= 0.965;
      if (flow > 0.05) {
        const i = (y * TEX_SIZE + x) * 4;
        const t = Math.min(1, flow);
        data[i] = data[i] * (1 - t) + 118 * t;
        data[i + 1] = data[i + 1] * (1 - t) + 14 * t;
        data[i + 2] = data[i + 2] * (1 - t) + 16 * t;
      }
    }
  }
  return data;
}

function doorTexture(seed, trim, withSlot, slotColor) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const g = (n[y * TEX_SIZE + x] - 0.5) * 16;
    let r = 96 + g, gg = 100 + g, b = 110 + g;
    // Outer frame.
    const border = Math.min(x, y, 63 - x, 63 - y);
    if (border < 3) { r = trim[0] + g; gg = trim[1] + g; b = trim[2] + g; }
    else if (border < 5) { r -= 30; gg -= 30; b -= 28; }
    // Horizontal ribs.
    if (border >= 5 && (y % 8 === 0)) { r += 22; gg += 24; b += 26; }
    if (border >= 5 && (y % 8 === 1)) { r -= 22; gg -= 22; b -= 20; }
    // Centre seam where the two halves meet.
    const dc = Math.abs(x - 32);
    if (dc < 1.5) { r -= 46; gg -= 46; b -= 44; }
    else if (dc < 3.5) { r += 14; gg += 16; b += 18; }
    if (withSlot) {
      // Keycard reader panel.
      if (x > 12 && x < 22 && y > 26 && y < 38) {
        const lit = (x > 14 && x < 20 && y > 28 && y < 36);
        r = lit ? slotColor[0] : 40;
        gg = lit ? slotColor[1] : 42;
        b = lit ? slotColor[2] : 46;
      }
      if (x > 42 && x < 52 && y > 26 && y < 38) {
        const lit = (x > 44 && x < 50 && y > 28 && y < 36);
        r = lit ? slotColor[0] : 40;
        gg = lit ? slotColor[1] : 42;
        b = lit ? slotColor[2] : 46;
      }
    }
    return [r, gg, b];
  });
}

function exitTexture(seed, on) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const g = (n[y * TEX_SIZE + x] - 0.5) * 22;
    let r = 68 + g, gg = 74 + g, b = 84 + g;
    if (y % 16 < 2) { r -= 24; gg -= 24; b -= 22; }
    // Switch housing.
    if (x > 20 && x < 44 && y > 14 && y < 50) {
      r = 44 + g; gg = 46 + g; b = 52 + g;
      if (x > 23 && x < 41 && y > 17 && y < 47) {
        const lit = on ? [40, 230, 90] : [200, 40, 36];
        const band = Math.floor((y - 17) / 6) % 2 === 0;
        r = lit[0] * (band ? 1 : 0.7) + g;
        gg = lit[1] * (band ? 1 : 0.7) + g;
        b = lit[2] * (band ? 1 : 0.7) + g;
      }
      // Housing bevel.
      if (x === 21 || y === 15) { r += 40; gg += 40; b += 40; }
      if (x === 43 || y === 49) { r -= 20; gg -= 20; b -= 20; }
    }
    return [r, gg, b];
  });
}

function supportTexture(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const g = (n[y * TEX_SIZE + x] - 0.5) * 20;
    let r = 58 + g, gg = 60 + g, b = 66 + g;
    // Hazard stripes across the middle band.
    if (y > 22 && y < 42) {
      const s = ((x + y) % 16) < 8;
      r = s ? 196 + g : 34 + g;
      gg = s ? 160 + g : 34 + g;
      b = s ? 30 + g : 38 + g;
    }
    if (y === 22 || y === 42) { r = 20; gg = 20; b = 24; }
    // Vertical ribs elsewhere.
    if ((y < 22 || y > 42) && x % 8 === 0) { r += 26; gg += 26; b += 26; }
    return [r, gg, b];
  });
}

function concreteFloor(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  const cracks = fbm(TEX_SIZE, makeRng(seed + 19));
  return paint((x, y) => {
    const v = (n[y * TEX_SIZE + x] - 0.5) * 40;
    let c = 78 + v;
    const cr = cracks[y * TEX_SIZE + x];
    if (cr > 0.55 && cr < 0.585) c -= 34;
    // Tile grid.
    if (x % 32 === 0 || y % 32 === 0) c -= 18;
    return [c, c * 0.98, c * 0.94];
  });
}

function metalFloor(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const v = (n[y * TEX_SIZE + x] - 0.5) * 18;
    const gx = x % 16, gy = y % 16;
    let r = 60 + v, g = 66 + v, b = 74 + v;
    if (gx < 3 || gy < 3) { r += 20; g += 22; b += 24; }
    else if (gx > 12 || gy > 12) { r -= 16; g -= 16; b -= 14; }
    else { r -= 22; g -= 22; b -= 20; }
    if ((gx === 8 || gx === 9) && (gy === 8 || gy === 9)) { r += 30; g += 30; b += 30; }
    return [r, g, b];
  });
}

function bloodFloor(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  const pool = fbm(TEX_SIZE, makeRng(seed + 5));
  return paint((x, y) => {
    const v = (n[y * TEX_SIZE + x] - 0.5) * 30;
    const p = pool[y * TEX_SIZE + x];
    const deep = clamp((p - 0.4) * 3, 0, 1);
    const r = 60 + v + deep * 74;
    const g = 26 + v * 0.5 + deep * 4;
    const b = 26 + v * 0.5 + deep * 6;
    return [r, g, b];
  });
}

function darkCeiling(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const v = (n[y * TEX_SIZE + x] - 0.5) * 34;
    let c = 44 + v;
    if (x % 16 === 0 || y % 16 === 0) c -= 12;
    return [c, c, c * 1.08];
  });
}

function litCeiling(seed) {
  const rng = makeRng(seed);
  const n = fbm(TEX_SIZE, rng);
  return paint((x, y) => {
    const v = (n[y * TEX_SIZE + x] - 0.5) * 20;
    let r = 50 + v, g = 54 + v, b = 62 + v;
    const px = x % 32, py = y % 32;
    if (px > 8 && px < 24 && py > 8 && py < 24) {
      // Recessed light panel.
      const edge = px === 9 || px === 23 || py === 9 || py === 23;
      r = edge ? 90 : 208; g = edge ? 94 : 214; b = edge ? 100 : 190;
    }
    return [r, g, b];
  });
}

// --- public API ----------------------------------------------------------
export function buildTextures() {
  const raw = [];
  raw[T.STONE] = brickTexture(1, [104, 104, 112], [58, 58, 64], 32, 16);
  raw[T.BRICK] = brickTexture(2, [118, 62, 44], [52, 34, 30], 32, 16);
  raw[T.TECH] = techTexture(3);
  raw[T.BLOOD] = bloodTexture(4);
  raw[T.DOOR] = doorTexture(5, [150, 128, 44], false, null);
  raw[T.DOOR_RED] = doorTexture(6, [150, 40, 36], true, [235, 60, 50]);
  raw[T.EXIT] = exitTexture(7, false);
  raw[T.EXIT_ON] = exitTexture(7, true);
  raw[T.SUPPORT] = supportTexture(8);
  raw[T.F_CONCRETE] = concreteFloor(9);
  raw[T.F_METAL] = metalFloor(10);
  raw[T.F_BLOOD] = bloodFloor(11);
  raw[T.C_DARK] = darkCeiling(12);
  raw[T.C_LIGHT] = litCeiling(13);

  const textures = [];
  for (let i = 0; i < raw.length; i++) {
    textures[i] = raw[i] ? buildShades(raw[i], TEX_SIZE, TEX_SIZE) : null;
  }
  return textures;
}
