// Tentacle rendering shared by the first-person grips and the crush attack.
// Everything is a tapered ribbon along a quadratic bezier: cheap to draw,
// and it reads as a limb rather than a tube because of the taper and the
// suckers along the inner edge.

import { TAU } from './util.js';

export const FLESH = '#17141d';
export const FLESH_LIT = '#2e2639';
export const RIM = '#7a479040';
export const SUCKER = '#8f6aa0';

function bezPoint(a, c, b, t) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * c + t * t * b;
}

// o: { x0, y0, cx, cy, x1, y1, w0, w1, phase, wobble, fill, rim, suckers }
export function tentacle(ctx, o) {
  const steps = o.steps || 20;
  const left = [];
  const right = [];
  const mid = [];
  const widths = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x = bezPoint(o.x0, o.cx, o.x1, t);
    let y = bezPoint(o.y0, o.cy, o.y1, t);
    let dx = 2 * (1 - t) * (o.cx - o.x0) + 2 * t * (o.x1 - o.cx);
    let dy = 2 * (1 - t) * (o.cy - o.y0) + 2 * t * (o.y1 - o.cy);
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    if (o.wobble) {
      const wob = Math.sin(t * 7 + (o.phase || 0)) * o.wobble * t;
      x += px * wob;
      y += py * wob;
    }
    // narrow the last stretch to a point so the limb ends in a tip, not a stump
    const tip = t > 0.84 ? Math.max(0.1, 1 - (t - 0.84) / 0.16) : 1;
    const w = ((o.w0 + (o.w1 - o.w0) * t) / 2) * tip;
    widths.push(w);
    mid.push([x, y]);
    left.push([x + px * w, y + py * w]);
    right.push([x - px * w, y - py * w]);
  }

  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  // rounded tip
  ctx.lineTo(right[right.length - 1][0], right[right.length - 1][1]);
  for (let i = right.length - 2; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = o.fill || FLESH;
  ctx.fill();

  // Lit edge down the outer side gives the limb some volume.
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  ctx.strokeStyle = o.rim || FLESH_LIT;
  ctx.lineWidth = o.rimWidth || 2;
  ctx.stroke();

  if (o.suckers !== false) {
    ctx.fillStyle = o.sucker || SUCKER;
    for (let i = 2; i < steps; i += 2) {
      const w = widths[i];
      if (w < 2) continue;
      const [mx, my] = mid[i];
      const [rx, ry] = right[i];
      const sx = mx + (rx - mx) * 0.55;
      const sy = my + (ry - my) * 0.55;
      ctx.beginPath();
      ctx.ellipse(sx, sy, Math.max(0.8, w * 0.24), Math.max(0.6, w * 0.17), 0, 0, TAU);
      ctx.fill();
    }
  }
}

// A curl of tentacle wrapped around something (the gun bodies use this).
export function coil(ctx, cx, cy, rx, ry, angle, thickness, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = fill || FLESH;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, -0.4, Math.PI + 0.5);
  ctx.stroke();
  ctx.strokeStyle = FLESH_LIT;
  ctx.lineWidth = Math.max(1, thickness * 0.22);
  ctx.beginPath();
  ctx.ellipse(0, -thickness * 0.22, rx, ry, 0, -0.2, Math.PI + 0.2);
  ctx.stroke();
  ctx.restore();
}
