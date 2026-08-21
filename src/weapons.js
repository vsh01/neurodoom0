// First-person weapon art + stats. You are the thing with the tentacles: each
// gun is gripped by a limb reaching in from a bottom corner, and the pair is
// drawn at the left and right edges of the view pointing forward.

import { makeCanvas, TAU } from './util.js';
import { tentacle, coil, FLESH, FLESH_LIT } from './tentacles.js';

// Guns are authored on a 200x150 grid (the right-hand one; the left is a
// mirror) and rasterised at whatever scale the current view calls for, so a
// weapon always covers the same slice of the screen on any window shape.
const GW = 200;
const GH = 150;
const VIEW_FRACTION = 0.5;

let SCALE = 0.7; // set by buildWeapons() before the frames are drawn

export function weaponScaleForView(viewHeight) {
  return Math.max(0.3, Math.min(1.4, (viewHeight * VIEW_FRACTION) / GH));
}

export function weaponSink() {
  return Math.round(GH * SCALE * 0.03);
}

export function weaponBobScale() {
  return SCALE;
}

function frame(draw) {
  const { canvas, ctx } = makeCanvas(Math.round(GW * SCALE), Math.round(GH * SCALE));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(SCALE, SCALE);
  draw(ctx, GW, GH);
  ctx.restore();
  return canvas;
}

function mirror(src) {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.save();
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  return canvas;
}

// A quad that narrows along its axis - the whole reason these guns read as
// pointing away from the viewer.
function taper(ctx, x0, y0, x1, y1, w0, w1, fill) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  ctx.beginPath();
  ctx.moveTo(x0 + px * w0 / 2, y0 + py * w0 / 2);
  ctx.lineTo(x1 + px * w1 / 2, y1 + py * w1 / 2);
  ctx.lineTo(x1 - px * w1 / 2, y1 - py * w1 / 2);
  ctx.lineTo(x0 - px * w0 / 2, y0 - py * w0 / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// Lit strip down one flank of a tapered body.
function taperEdge(ctx, x0, y0, x1, y1, w0, w1, fill, side = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * side;
  const py = (dx / len) * side;
  ctx.beginPath();
  ctx.moveTo(x0 + px * w0 / 2, y0 + py * w0 / 2);
  ctx.lineTo(x1 + px * w1 / 2, y1 + py * w1 / 2);
  ctx.lineTo(x1 + px * w1 * 0.24, y1 + py * w1 * 0.24);
  ctx.lineTo(x0 + px * w0 * 0.24, y0 + py * w0 * 0.24);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ring(ctx, x, y, rx, ry, outer, inner) {
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.52, ry * 0.52, 0, 0, TAU);
  ctx.fill();
}

function flash(ctx, x, y, scale) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, 30 * scale);
  g.addColorStop(0, '#fffdf2');
  g.addColorStop(0.26, '#ffe07a');
  g.addColorStop(0.58, '#ff9c22');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 30 * scale, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff6d8';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    const d = 12 * scale;
    ctx.fillRect(x + Math.cos(a) * d - 2, y + Math.sin(a) * d - 2, 3.5, 3.5);
  }
}

// The limb is drawn in two passes so the gun sits inside the grip rather than
// behind it: the thick arm comes up from the corner first, the gun goes on top,
// then a coil and a thin curl wrap back over the receiver and barrel.
function gripBack(ctx, bx, by, thickness, phase = 0) {
  tentacle(ctx, {
    x0: GW + 2, y0: GH + 18,
    cx: GW - 34, cy: by + 26,
    x1: bx + 2, y1: by - 10,
    w0: thickness * 1.5, w1: thickness * 0.85,
    wobble: 2, phase,
    suckers: true,
  });
  tentacle(ctx, {
    x0: GW + 18, y0: GH - 4,
    cx: GW - 8, cy: by - 40,
    x1: bx - 30, y1: by - 74,
    w0: thickness * 0.8, w1: thickness * 0.3,
    wobble: 3, phase: phase + 2.1,
    suckers: true,
  });
}

function gripFront(ctx, bx, by, thickness, phase = 0) {
  coil(ctx, bx - 6, by - 26, thickness * 0.66, thickness * 0.34, -0.5, thickness * 0.38, FLESH);
  tentacle(ctx, {
    x0: bx + 14, y0: by - 6,
    cx: bx - 12, cy: by - 44,
    x1: bx - 30, y1: by - 58,
    w0: thickness * 0.5, w1: thickness * 0.2,
    wobble: 2, phase: phase + 1.3,
    suckers: true,
  });
}

// --- pistol --------------------------------------------------------------
function pistol(kick, fired) {
  return frame((ctx) => {
    ctx.translate(kick * 0.4, kick);
    const bx = 124;
    const by = 140;
    const mx = 80;
    const my = 30;
    gripBack(ctx, bx, by, 26);
    taper(ctx, bx, by, mx + 4, my + 16, 42, 22, '#333940');
    taperEdge(ctx, bx, by, mx + 4, my + 16, 42, 22, '#4e565f', -1);
    // slide rails
    ctx.fillStyle = '#1b1f24';
    taper(ctx, bx - 6, by - 24, mx + 3, my + 20, 6, 3, '#1b1f24');
    // barrel + muzzle
    taper(ctx, mx + 4, my + 16, mx, my, 20, 15, '#3d444c');
    taperEdge(ctx, mx + 4, my + 16, mx, my, 20, 15, '#59626b', -1);
    ring(ctx, mx, my - 1, 8, 6, '#4a525b', '#0d0f12');
    // magazine hanging out of the grip end
    taper(ctx, bx + 6, by + 6, bx - 2, by - 26, 20, 14, '#262b31');
    gripFront(ctx, bx, by, 26);
    if (fired) flash(ctx, mx, my - 3, 0.9);
  });
}

// --- shotgun -------------------------------------------------------------
function shotgun(kick, fired, pump) {
  return frame((ctx) => {
    ctx.translate(kick * 0.4, kick);
    const bx = 128;
    const by = 146;
    const mx = 82;
    const my = 26;
    gripBack(ctx, bx, by, 30, 1.1);
    taper(ctx, bx, by, mx + 6, my + 22, 52, 30, '#343b43');
    taperEdge(ctx, bx, by, mx + 6, my + 22, 52, 30, '#525b64', -1);
    // twin tubes running to the muzzle
    taper(ctx, bx - 12, by - 30, mx + 2, my + 6, 30, 22, '#3f474f');
    taperEdge(ctx, bx - 12, by - 30, mx + 2, my + 6, 30, 22, '#5d666f', -1);
    ring(ctx, mx - 3, my + 2, 7, 5, '#4a525b', '#0b0d10');
    ring(ctx, mx + 8, my + 6, 7, 5, '#4a525b', '#0b0d10');
    // wooden fore-end, slides back when pumping
    const px = -pump * 0.34;
    const py = pump;
    taper(ctx, bx - 26 + px, by - 56 + py, bx - 40 + px, by - 88 + py, 40, 34, '#6f4a25');
    taperEdge(ctx, bx - 26 + px, by - 56 + py, bx - 40 + px, by - 88 + py, 40, 34, '#9a6a36', -1);
    ctx.fillStyle = '#3d270f';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(bx - 46 + px + i * 7, by - 84 + py + i * 2, 3, 22);
    }
    gripFront(ctx, bx, by, 30, 1.1);
    if (fired) flash(ctx, mx + 2, my, 1.15);
  });
}

// --- chaingun ------------------------------------------------------------
function chaingun(kick, fired, spin) {
  return frame((ctx) => {
    ctx.translate(kick * 0.4, kick);
    const bx = 132;
    const by = 150;
    const mx = 88;
    const my = 34;
    gripBack(ctx, bx, by, 32, 2.2);
    taper(ctx, bx, by, mx + 6, my + 30, 58, 40, '#333940');
    taperEdge(ctx, bx, by, mx + 6, my + 30, 58, 40, '#4f575f', -1);
    ctx.fillStyle = '#1c2025';
    taper(ctx, bx - 10, by - 40, mx + 6, my + 34, 34, 24, '#252a30');
    // barrel cluster seen nearly end-on
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * TAU;
      const ox = Math.cos(a) * 11;
      const oy = Math.sin(a) * 7;
      const front = Math.sin(a) > 0;
      taper(ctx, mx + 8 + ox * 1.5, my + 30 + oy * 1.5, mx + ox, my + oy, 11, 8,
        front ? '#5c646c' : '#2c3138');
    }
    ctx.fillStyle = '#12151a';
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * TAU;
      ctx.beginPath();
      ctx.ellipse(mx + Math.cos(a) * 11, my + Math.sin(a) * 7, 3, 2.2, 0, 0, TAU);
      ctx.fill();
    }
    // ammo belt spilling toward the corner
    ctx.fillStyle = '#a8842e';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(bx + 6 + (i % 2) * 7, by - 26 + i * 6, 7, 9);
    }
    gripFront(ctx, bx, by, 32, 2.2);
    if (fired) flash(ctx, mx + Math.cos(spin) * 11, my + Math.sin(spin) * 7, 1.0);
  });
}

function pair(canvas) {
  return { right: canvas, left: mirror(canvas) };
}

// Frame lists are rebuilt whenever the view size changes; `fireSeq` entries
// are [frameIndex, seconds].
export function buildWeapons(scale) {
  if (scale) SCALE = scale;
  return [
    {
      id: 'pistol',
      name: 'PISTOL',
      ammo: 'bullets',
      ammoUse: 1,
      damage: [9, 15],
      pellets: 1,
      spread: 0.014,
      cooldown: 0.34,
      auto: false,
      range: 40,
      sound: 'pistol',
      frames: [pistol(0, false), pistol(8, true), pistol(5, false), pistol(2, false)].map(pair),
      fireSeq: [[1, 0.06], [2, 0.08], [3, 0.07], [0, 0]],
    },
    {
      id: 'shotgun',
      name: 'SHOTGUN',
      ammo: 'shells',
      ammoUse: 1,
      damage: [5, 9],
      pellets: 8,
      spread: 0.10,
      cooldown: 0.82,
      auto: false,
      range: 26,
      sound: 'shotgun',
      frames: [
        shotgun(0, false, 0), shotgun(12, true, 0), shotgun(7, false, 0),
        shotgun(4, false, 16), shotgun(2, false, 8),
      ].map(pair),
      fireSeq: [[1, 0.08], [2, 0.1], [3, 0.22], [4, 0.14], [0, 0]],
    },
    {
      id: 'chaingun',
      name: 'CHAINGUN',
      ammo: 'bullets',
      ammoUse: 1,
      damage: [7, 12],
      pellets: 1,
      spread: 0.05,
      cooldown: 0.09,
      auto: true,
      range: 40,
      sound: 'chaingun',
      frames: [
        chaingun(0, false, 0), chaingun(5, true, 0.6), chaingun(3, true, 1.7),
        chaingun(1, false, 2.7),
      ].map(pair),
      fireSeq: [[1, 0.05], [2, 0.04], [3, 0.02], [0, 0]],
    },
  ];
}
