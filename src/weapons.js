// First-person weapon art + stats. The sprites are drawn straight onto the
// low-resolution framebuffer canvas so they share the chunky look of the world.

import { makeCanvas, TAU } from './util.js';

// Guns are authored on a 200x150 grid and drawn at SCALE so they fill a
// satisfying chunk of the screen. The bottom ~17px sit behind the status bar.
const GW = 200;
const GH = 150;
const SCALE = 1.2;
export const WEAPON_SINK = Math.round(14 * SCALE);

function frame(draw) {
  const { canvas, ctx } = makeCanvas(Math.round(GW * SCALE), Math.round(GH * SCALE));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(SCALE, SCALE);
  draw(ctx, GW, GH);
  ctx.restore();
  return canvas;
}

function r(ctx, x, y, w, h, fill, shade) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (shade) {
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 2, y, 2, h);
  }
}

function round(ctx, x, y, w, h, rad) {
  const k = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function flash(ctx, x, y, scale) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, 34 * scale);
  g.addColorStop(0, '#fffdf2');
  g.addColorStop(0.28, '#ffe07a');
  g.addColorStop(0.6, '#ff9c22');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 34 * scale, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff6d8';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.4;
    const d = 13 * scale;
    ctx.fillRect(x + Math.cos(a) * d - 2, y + Math.sin(a) * d - 2, 4, 4);
  }
}

// A gloved fist wrapped around a grip. `flip` puts the fingers on the left.
function hand(ctx, x, y, w, h, flip) {
  ctx.fillStyle = '#2f343a';
  ctx.fillRect(x - 1, y + h - 12, w + 2, 16); // sleeve
  ctx.fillStyle = '#c49a6e';
  round(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#a37d55';
  ctx.fillRect(flip ? x : x + w - 7, y + 5, 7, h - 12);
  const fw = Math.round(w * 0.52);
  const fx = flip ? x + 1 : x + w - fw - 1;
  const fh = (h - 14) / 4;
  for (let i = 0; i < 4; i++) {
    const fy = y + 4 + i * fh;
    ctx.fillStyle = i % 2 ? '#cda87e' : '#c09468';
    round(ctx, fx, fy, fw, fh - 1.5, 3);
    ctx.fill();
    ctx.fillStyle = '#8a6642';
    ctx.fillRect(fx, fy + fh - 2, fw, 1.5);
  }
  ctx.fillStyle = '#b98e62';
  round(ctx, flip ? x + w - 11 : x, y + h * 0.42, 11, h * 0.4, 4);
  ctx.fill();
}

function tilt(ctx, cx, cy, angle) {
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-cx, -cy);
}

function rotPoint(cx, cy, x, y, a) {
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

// --- pistol --------------------------------------------------------------
function pistol(kick, fired) {
  const cx = GW / 2 + 10;
  const ang = -0.1;
  return frame((ctx) => {
    ctx.translate(0, kick);
    ctx.save();
    tilt(ctx, cx, 150, ang);
    // barrel + slide
    r(ctx, cx - 3, 42, 6, 6, '#4c545d');
    r(ctx, cx - 12, 48, 24, 8, '#2c3138', '#15181c');
    r(ctx, cx - 14, 54, 28, 46, '#414851', '#20252a');
    ctx.fillStyle = '#5d666f';
    ctx.fillRect(cx - 14, 54, 5, 46);
    ctx.fillStyle = '#1b1f23';
    ctx.fillRect(cx - 1, 64, 11, 6);
    ctx.fillRect(cx - 12, 84, 24, 2);
    // frame + trigger guard
    r(ctx, cx - 16, 100, 32, 22, '#333941', '#191d21');
    ctx.strokeStyle = '#262b31';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx - 2, 122, 11, 0, Math.PI);
    ctx.stroke();
    // grip
    r(ctx, cx - 13, 118, 25, 34, '#2a2f36', '#14171a');
    ctx.fillStyle = '#1d2126';
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - 12, 122 + i * 6, 23, 2);
    ctx.restore();
    hand(ctx, cx - 26, 112, 34, 44, false);
    if (fired) {
      const [fx, fy] = rotPoint(cx, 150, cx, 40, ang);
      flash(ctx, fx, fy, 0.85);
    }
  });
}

// --- shotgun -------------------------------------------------------------
function shotgun(kick, fired, pump) {
  const cx = GW / 2 + 6;
  const ang = -0.13;
  return frame((ctx) => {
    ctx.translate(0, kick);
    ctx.save();
    tilt(ctx, cx, 150, ang);
    // barrel with a magazine tube under it
    r(ctx, cx - 13, 26, 26, 8, '#2c3138', '#15181c');
    r(ctx, cx - 11, 32, 22, 72, '#3f464d', '#22272d');
    ctx.fillStyle = '#5a636c';
    ctx.fillRect(cx - 11, 32, 5, 72);
    ctx.fillStyle = '#1b1f23';
    ctx.fillRect(cx + 2, 32, 2, 72);
    // fore-end (slides back while pumping)
    r(ctx, cx - 21, 96 + pump, 42, 20, '#7a5228', '#41290e');
    ctx.fillStyle = '#9a6a36';
    ctx.fillRect(cx - 21, 98 + pump, 42, 3);
    ctx.fillStyle = '#4e3212';
    for (let i = 0; i < 5; i++) ctx.fillRect(cx - 18 + i * 8, 100 + pump, 2, 13);
    // receiver + stock
    r(ctx, cx - 17, 118, 36, 32, '#343a41', '#191d21');
    ctx.fillStyle = '#485058';
    ctx.fillRect(cx - 17, 118, 36, 3);
    ctx.fillStyle = '#16191d';
    ctx.fillRect(cx - 12, 130, 22, 6);
    ctx.restore();
    hand(ctx, cx - 40, 100 + pump, 32, 40, true);
    hand(ctx, cx + 6, 124, 32, 34, false);
    if (fired) {
      const [fx, fy] = rotPoint(cx, 150, cx, 24, ang);
      flash(ctx, fx, fy, 1.05);
    }
  });
}

// --- chaingun ------------------------------------------------------------
function chaingun(kick, fired, spin) {
  const cx = GW / 2;
  return frame((ctx) => {
    ctx.translate(0, kick);
    // rotating barrel cluster
    for (let i = 0; i < 6; i++) {
      const a = spin + (i / 6) * TAU;
      const bx = cx + Math.cos(a) * 15;
      const front = Math.sin(a) > 0;
      r(ctx, bx - 5, 48, 10, 56, front ? '#5f6870' : '#2f343a', '#1b1f23');
    }
    r(ctx, cx - 22, 42, 44, 9, '#454c53', '#252a30');
    ctx.fillStyle = '#5d666f';
    ctx.fillRect(cx - 22, 42, 44, 2);
    // housing
    r(ctx, cx - 30, 100, 60, 32, '#3a4046', '#20242a');
    ctx.fillStyle = '#4f575f';
    ctx.fillRect(cx - 30, 100, 60, 4);
    ctx.fillStyle = '#1e2227';
    ctx.fillRect(cx - 24, 112, 48, 5);
    ctx.fillStyle = '#8e2b20';
    ctx.fillRect(cx + 16, 106, 8, 4);
    r(ctx, cx - 36, 130, 72, 20, '#2a2e34', '#16191d');
    // ammo belt feeding in from the right
    for (let i = 0; i < 5; i++) r(ctx, cx + 26 + (i % 2) * 6, 122 + i * 6, 7, 9, '#a8842e', '#5e4a18');
    hand(ctx, cx - 52, 104, 32, 42, true);
    hand(ctx, cx + 20, 104, 32, 42, false);
    if (fired) flash(ctx, cx + Math.cos(spin) * 15, 40, 0.95);
  });
}

// Frame lists are built once at boot; `fireSeq` is [frameIndex, seconds].
export function buildWeapons() {
  return [
    {
      id: 'pistol',
      name: 'PISTOL',
      ammo: 'bullets',
      ammoUse: 1,
      damage: [9, 15],
      pellets: 1,
      spread: 0.014,
      cooldown: 0.42,
      auto: false,
      range: 40,
      sound: 'pistol',
      frames: [pistol(0, false), pistol(-6, true), pistol(4, false), pistol(1, false)],
      fireSeq: [[1, 0.06], [2, 0.09], [3, 0.08], [0, 0]],
    },
    {
      id: 'shotgun',
      name: 'SHOTGUN',
      ammo: 'shells',
      ammoUse: 1,
      damage: [5, 9],
      pellets: 8,
      spread: 0.10,
      cooldown: 0.92,
      auto: false,
      range: 26,
      sound: 'shotgun',
      frames: [
        shotgun(0, false, 0), shotgun(-10, true, 0), shotgun(6, false, 0),
        shotgun(3, false, 16), shotgun(1, false, 8),
      ],
      fireSeq: [[1, 0.08], [2, 0.12], [3, 0.24], [4, 0.16], [0, 0]],
    },
    {
      id: 'chaingun',
      name: 'CHAINGUN',
      ammo: 'bullets',
      ammoUse: 1,
      damage: [7, 12],
      pellets: 1,
      spread: 0.05,
      cooldown: 0.1,
      auto: true,
      range: 40,
      sound: 'chaingun',
      frames: [
        chaingun(0, false, 0), chaingun(-4, true, 0.5), chaingun(-2, true, 1.6),
        chaingun(0, false, 2.6),
      ],
      fireSeq: [[1, 0.05], [2, 0.05], [3, 0.02], [0, 0]],
    },
  ];
}
