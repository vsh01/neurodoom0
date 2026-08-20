// Procedural sprite art. Everything is drawn once into an off-screen canvas
// at its native (small) resolution, hard-cut to 1-bit alpha so it stays crisp
// when the raycaster scales it, then pre-shaded like the wall textures.

import { makeCanvas, buildShades, makeRng, TAU } from './util.js';

function shadeCanvas(canvas, ctx) {
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    p[i + 3] = p[i + 3] < 140 ? 0 : 255;
  }
  return buildShades(p, canvas.width, canvas.height);
}

function S(w, h, draw) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  return shadeCanvas(canvas, ctx);
}

function tint(ctx, w, h, color, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function box(ctx, x, y, w, h, fill, shade) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (shade) {
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 2, y, 2, h);
  }
}

function ellipse(ctx, cx, cy, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// --- enemies -------------------------------------------------------------
// Former human: rifle-toting grunt in a torn uniform.
function drawZombie(ctx, w, h, o) {
  const cx = w / 2;
  const swing = Math.sin(o.phase * TAU) * 3;
  // Legs
  box(ctx, cx - 9, 36, 8, 20 + swing, '#39432a', '#232a19');
  box(ctx, cx + 1, 36, 8, 20 - swing, '#39432a', '#232a19');
  box(ctx, cx - 9, 52 + swing, 8, 4, '#241f1a');
  box(ctx, cx + 1, 52 - swing, 8, 4, '#241f1a');
  // Torso + webbing
  box(ctx, cx - 11, 16, 22, 22, '#4c5a35', '#303a20');
  box(ctx, cx - 11, 30, 22, 3, '#2b2018');
  box(ctx, cx - 3, 16, 5, 16, '#3d4a2b');
  // Arms
  const raise = o.attack ? 1 : 0;
  const ay = 20 - raise * 4;
  box(ctx, cx - 16, ay, 6, 15 - raise * 4, '#4c5a35', '#303a20');
  box(ctx, cx + 10, ay + swing * 0.4, 6, 15 - raise * 4, '#4c5a35', '#303a20');
  // Rifle
  ctx.save();
  ctx.translate(cx - 14, ay + 8);
  ctx.rotate(o.attack ? -0.25 : 0.12);
  box(ctx, 0, 0, 26, 4, '#33383c', '#1b1e21');
  box(ctx, 4, 3, 8, 5, '#4a3524');
  if (o.attack) {
    ellipse(ctx, 30, 2, 8, 5, '#ffe9a0');
    ellipse(ctx, 28, 2, 5, 3, '#fffdf0');
  }
  ctx.restore();
  // Head
  ellipse(ctx, cx, 10, 7, 8, '#b9a488');
  ellipse(ctx, cx, 5, 7, 5, '#4a3b28');
  ctx.fillStyle = '#1a1010';
  ctx.fillRect(cx - 5, 9, 3, 2);
  ctx.fillRect(cx + 2, 9, 3, 2);
  ctx.fillStyle = '#5e1616';
  ctx.fillRect(cx - 3, 14, 6, 2);
  ctx.fillRect(cx + 3, 11, 3, 5);
  if (o.pain) tint(ctx, w, h, '#c01818', 0.45);
}

// Hellspawn: horned biped that lobs fireballs.
function drawImp(ctx, w, h, o) {
  const cx = w / 2;
  const swing = Math.sin(o.phase * TAU) * 4;
  const skin = '#7d4526';
  const dark = '#542c15';
  // Legs (digitigrade)
  box(ctx, cx - 10, 38, 8, 14 + swing, skin, dark);
  box(ctx, cx + 2, 38, 8, 14 - swing, skin, dark);
  box(ctx, cx - 12, 50 + swing, 11, 5, dark);
  box(ctx, cx + 1, 50 - swing, 11, 5, dark);
  // Torso
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(cx - 12, 40);
  ctx.lineTo(cx - 10, 17);
  ctx.lineTo(cx + 10, 17);
  ctx.lineTo(cx + 12, 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#96593a';
  ctx.fillRect(cx - 5, 22, 10, 14);
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 12, 36, 24, 3);
  // Shoulder spikes
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#d8cbae';
    ctx.beginPath();
    ctx.moveTo(cx + sx * 10, 20);
    ctx.lineTo(cx + sx * 17, 12);
    ctx.lineTo(cx + sx * 12, 23);
    ctx.closePath();
    ctx.fill();
  }
  // Arms
  const ay = o.attack ? 12 : 22;
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + sx * 11, ay);
    ctx.rotate(sx * (o.attack ? -0.9 : 0.25 + Math.sin(o.phase * TAU) * 0.15 * sx));
    box(ctx, -3, 0, 6, 17, skin, dark);
    ctx.fillStyle = '#d8cbae';
    ctx.fillRect(-4, 16, 2, 4);
    ctx.fillRect(-1, 16, 2, 5);
    ctx.fillRect(2, 16, 2, 4);
    ctx.restore();
  }
  if (o.attack) {
    const g = ctx.createRadialGradient(cx, 8, 1, cx, 8, 11);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.4, '#ffab2e');
    g.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, 8, 11, 0, TAU);
    ctx.fill();
  }
  // Head
  ellipse(ctx, cx, 12, 9, 9, skin);
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 9, 12, 18, 3);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#e6dcc0';
    ctx.beginPath();
    ctx.moveTo(cx + sx * 5, 5);
    ctx.lineTo(cx + sx * 11, -3);
    ctx.lineTo(cx + sx * 8, 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = o.pain ? '#fff' : '#ffd21e';
  ctx.fillRect(cx - 6, 9, 4, 3);
  ctx.fillRect(cx + 2, 9, 4, 3);
  ctx.fillStyle = '#2a0d06';
  ctx.fillRect(cx - 5, 16, 10, 3);
  ctx.fillStyle = '#e6dcc0';
  ctx.fillRect(cx - 4, 16, 2, 2);
  ctx.fillRect(cx + 1, 16, 2, 2);
  if (o.pain) tint(ctx, w, h, '#e01414', 0.4);
}

// Pinky: low, wide, all teeth.
function drawDemon(ctx, w, h, o) {
  const cx = w / 2;
  const swing = Math.sin(o.phase * TAU) * 3;
  const skin = '#a85f66';
  const dark = '#75373f';
  // Legs
  box(ctx, cx - 16, h - 16, 9, 15 + swing, dark);
  box(ctx, cx + 7, h - 16, 9, 15 - swing, dark);
  box(ctx, cx - 18, h - 5, 12, 5, '#3a1c1f');
  box(ctx, cx + 6, h - 5, 12, 5, '#3a1c1f');
  // Body
  ellipse(ctx, cx, h - 24, 20, 15, skin);
  ellipse(ctx, cx, h - 30, 17, 11, '#bd7078');
  // Head
  ellipse(ctx, cx, 16, 17, 14, skin);
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 17, 16, 34, 4);
  // Horns
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#ddd0b4';
    ctx.beginPath();
    ctx.moveTo(cx + sx * 12, 6);
    ctx.lineTo(cx + sx * 20, -2);
    ctx.lineTo(cx + sx * 14, 9);
    ctx.closePath();
    ctx.fill();
  }
  // Eyes
  ctx.fillStyle = o.pain ? '#fff' : '#ff3020';
  ctx.fillRect(cx - 10, 10, 5, 4);
  ctx.fillRect(cx + 5, 10, 5, 4);
  // Maw
  const gape = o.attack ? 12 : 6;
  ctx.fillStyle = '#2c0c10';
  ctx.fillRect(cx - 13, 20, 26, gape);
  ctx.fillStyle = '#f0e7d0';
  for (let i = 0; i < 7; i++) {
    const tx = cx - 12 + i * 4;
    ctx.beginPath();
    ctx.moveTo(tx, 20);
    ctx.lineTo(tx + 3, 20);
    ctx.lineTo(tx + 1.5, 25);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx, 20 + gape);
    ctx.lineTo(tx + 3, 20 + gape);
    ctx.lineTo(tx + 1.5, 15 + gape);
    ctx.closePath();
    ctx.fill();
  }
  if (o.pain) tint(ctx, w, h, '#e01414', 0.4);
}

function deathFrames(w, h, draw, blood = '#7d0d0d') {
  const steps = [0.16, 0.42, 0.68, 0.88, 1];
  return steps.map((t) => S(w, h, (ctx) => {
    ctx.globalAlpha = 0.9;
    const pw = w * (0.25 + 0.55 * t);
    const ph = 3 + 6 * t;
    ellipse(ctx, w / 2, h - ph / 2 - 1, pw / 2, ph / 2, blood);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(w / 2, h);
    ctx.scale(1 + t * 0.55, Math.max(0.14, 1 - t * 0.88));
    ctx.rotate(t * 0.22);
    ctx.translate(-w / 2, -h);
    draw(ctx, w, h, { phase: 0.5, attack: false, pain: false });
    ctx.restore();
    tint(ctx, w, h, '#6b0c0c', 0.16 + 0.34 * t);
  }));
}

function enemySet(w, h, draw, blood) {
  const walk = [0, 0.25, 0.5, 0.75].map((phase) =>
    S(w, h, (ctx, cw, ch) => draw(ctx, cw, ch, { phase, attack: false, pain: false })));
  return {
    walk,
    attack: [S(w, h, (ctx, cw, ch) => draw(ctx, cw, ch, { phase: 0, attack: true, pain: false }))],
    pain: [S(w, h, (ctx, cw, ch) => draw(ctx, cw, ch, { phase: 0, attack: false, pain: true }))],
    die: deathFrames(w, h, draw, blood),
  };
}

// --- pickups -------------------------------------------------------------
function medkit(w, h) {
  return S(w, h, (ctx) => {
    box(ctx, 2, 6, w - 4, h - 8, '#e8e4dc', '#a8a49c');
    box(ctx, 2, 6, w - 4, 3, '#ffffff');
    ctx.fillStyle = '#c81c1c';
    ctx.fillRect(w / 2 - 2, 10, 4, h - 15);
    ctx.fillRect(5, h / 2 - 1, w - 10, 4);
  });
}

function stimpack(w, h) {
  return S(w, h, (ctx) => {
    box(ctx, 3, h - 11, w - 6, 9, '#d8d4cc', '#98948c');
    box(ctx, 5, 3, w - 10, h - 12, '#5aa0d8', '#2f6c9c');
    ctx.fillStyle = '#c81c1c';
    ctx.fillRect(w / 2 - 1, h - 9, 3, 5);
    ctx.fillRect(w / 2 - 3, h - 7, 7, 2);
  });
}

function armorVest(w, h) {
  return S(w, h, (ctx) => {
    ctx.fillStyle = '#2f9c48';
    ctx.beginPath();
    ctx.moveTo(w / 2, 1);
    ctx.lineTo(w - 2, 8);
    ctx.lineTo(w - 4, h - 3);
    ctx.lineTo(4, h - 3);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7de89a';
    ctx.fillRect(w / 2 - 1, 6, 3, h - 12);
    ctx.fillStyle = '#1d6e32';
    ctx.fillRect(4, h - 7, w - 8, 3);
  });
}

function ammoBox(w, h, base, hi, label) {
  return S(w, h, (ctx) => {
    box(ctx, 1, 4, w - 2, h - 6, base, '#00000055');
    ctx.fillStyle = hi;
    ctx.fillRect(3, 6, w - 6, 3);
    ctx.fillStyle = '#e0d8a0';
    for (let i = 0; i < 4; i++) ctx.fillRect(4 + i * 5, h - 9, 3, 5);
    ctx.fillStyle = '#00000088';
    ctx.fillRect(2, h - 4, w - 4, 2);
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(w / 2 - 4, 11, 8, 2);
    }
  });
}

function shotgunPickup(w, h) {
  return S(w, h, (ctx) => {
    box(ctx, 2, h / 2 - 4, w - 12, 5, '#3c4247', '#22262a');
    box(ctx, 2, h / 2 + 1, w - 14, 3, '#2c3236');
    box(ctx, w - 14, h / 2 - 2, 12, 7, '#6d4a28', '#432c16');
    ctx.fillStyle = '#8f6432';
    ctx.fillRect(w - 20, h / 2 + 4, 7, 5);
  });
}

function chaingunPickup(w, h) {
  return S(w, h, (ctx) => {
    box(ctx, w - 15, h / 2 - 5, 13, 11, '#4a5055', '#282c30');
    for (let i = 0; i < 3; i++) box(ctx, 2, h / 2 - 5 + i * 4, w - 14, 3, '#5c6268', '#303438');
    ctx.fillStyle = '#8a6a2a';
    ctx.fillRect(w - 12, h / 2 + 5, 8, 5);
  });
}

function keycard(w, h, color, dark) {
  return S(w, h, (ctx) => {
    box(ctx, 3, 4, w - 6, h - 8, color, dark);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 7, w - 10, 3);
    ctx.fillStyle = dark;
    ctx.fillRect(5, h - 12, w - 10, 4);
  });
}

// --- props ---------------------------------------------------------------
function barrel(w, h) {
  return S(w, h, (ctx) => {
    ctx.fillStyle = '#3f6a2c';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 4, w / 2 - 2, 4, 0, 0, TAU);
    ctx.fill();
    box(ctx, 2, 5, w - 4, h - 9, '#4a7c33', '#2c4d1e');
    ctx.fillStyle = '#5f9642';
    ctx.fillRect(4, 5, 4, h - 9);
    ctx.fillStyle = '#2c4d1e';
    ctx.fillRect(2, 12, w - 4, 3);
    ctx.fillRect(2, h - 16, w - 4, 3);
    ctx.fillStyle = '#d8c22a';
    ctx.fillRect(2, h / 2 - 3, w - 4, 7);
    ctx.fillStyle = '#1c1c14';
    for (let i = 0; i < 4; i++) ctx.fillRect(3 + i * 7, h / 2 - 3, 3, 7);
    ctx.fillStyle = '#5f9642';
    ctx.beginPath();
    ctx.ellipse(w / 2, 5, w / 2 - 2, 4, 0, 0, TAU);
    ctx.fill();
  });
}

function lampFrames(w, h) {
  const rng = makeRng(99);
  return [0, 1, 2].map(() => S(w, h, (ctx) => {
    box(ctx, w / 2 - 4, 14, 8, h - 16, '#4c5258', '#2a2e32');
    box(ctx, w / 2 - 8, h - 5, 16, 4, '#3a3e42', '#202428');
    const fh = 12 + rng() * 6;
    const g = ctx.createRadialGradient(w / 2, 12, 1, w / 2, 12, fh);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.35, '#ffc93c');
    g.addColorStop(0.7, '#ff7a12');
    g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, 12, 7 + rng() * 2, fh, 0, 0, TAU);
    ctx.fill();
  }));
}

// --- effects -------------------------------------------------------------
function fireballFrames(size) {
  const rng = makeRng(7);
  return [0, 1, 2].map(() => S(size, size, (ctx) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 1, c, c, c);
    g.addColorStop(0, '#fffbe6');
    g.addColorStop(0.3, '#ffd24a');
    g.addColorStop(0.62, '#ff6a10');
    g.addColorStop(1, 'rgba(140,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff9a20';
    for (let i = 0; i < 5; i++) {
      const a = rng() * TAU;
      const r = c * (0.6 + rng() * 0.45);
      ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 2);
    }
  }));
}

function explosionFrames(size) {
  const rng = makeRng(21);
  const steps = [0.25, 0.5, 0.72, 0.88, 1];
  return steps.map((t) => S(size, size, (ctx) => {
    const c = size / 2;
    const r = c * (0.35 + 0.65 * t);
    const g = ctx.createRadialGradient(c, c, 1, c, c, r);
    if (t < 0.75) {
      g.addColorStop(0, '#fffdf0');
      g.addColorStop(0.35, '#ffcf3c');
      g.addColorStop(0.7, '#ff5a08');
      g.addColorStop(1, 'rgba(60,30,20,0)');
    } else {
      g.addColorStop(0, '#8a7a70');
      g.addColorStop(0.6, '#4a423e');
      g.addColorStop(1, 'rgba(30,26,24,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = t < 0.75 ? '#ffb020' : '#6a605a';
    for (let i = 0; i < 10; i++) {
      const a = rng() * TAU;
      const rr = r * (0.7 + rng() * 0.5);
      const s = 2 + rng() * 3;
      ctx.fillRect(c + Math.cos(a) * rr, c + Math.sin(a) * rr, s, s);
    }
  }));
}

function puffFrames(size, color) {
  const rng = makeRng(33);
  return [0, 1, 2].map((i) => S(size, size, (ctx) => {
    const c = size / 2;
    const n = 7 - i * 2;
    ctx.fillStyle = color;
    for (let k = 0; k < n; k++) {
      const a = rng() * TAU;
      const r = (1 + i) * 2 + rng() * 3;
      const s = 3 - i * 0.6;
      ctx.fillRect(c + Math.cos(a) * r - s / 2, c + Math.sin(a) * r - s / 2, s, s);
    }
  }));
}

export function buildSprites() {
  return {
    enemies: {
      zombie: enemySet(40, 56, drawZombie, '#7d0d0d'),
      imp: enemySet(44, 60, drawImp, '#6d0a12'),
      demon: enemySet(58, 52, drawDemon, '#7d0d0d'),
    },
    items: {
      medkit: medkit(26, 24),
      stimpack: stimpack(18, 22),
      armor: armorVest(24, 26),
      clip: ammoBox(22, 18, '#6d4a1e', '#a2762f', false),
      shells: ammoBox(24, 18, '#7c2020', '#b03434', true),
      shotgun: shotgunPickup(38, 20),
      chaingun: chaingunPickup(38, 22),
      redkey: keycard(16, 20, '#cf2020', '#7a0e0e'),
    },
    props: {
      barrel: barrel(30, 42),
      lamp: lampFrames(22, 46),
    },
    fx: {
      fireball: fireballFrames(20),
      explosion: explosionFrames(56),
      blood: puffFrames(18, '#a51414'),
      spark: puffFrames(14, '#c8c0a8'),
    },
  };
}
