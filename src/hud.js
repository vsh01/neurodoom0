// Status bar, messages, overlays and the automap. Everything is drawn into the
// low-resolution framebuffer so the text is as chunky as the world.

import { makeCanvas, clamp, TAU } from './util.js';

const RED = '#d63a2a';
const DIM = '#8a8a92';
const BAR_H = 38;

// The status-bar portrait: you, the thing holding the guns. It loses eyes and
// leaks as the health drops, which is the same read as DOOM's beaten-up face.
function buildFace(bucket, hurt, dead) {
  const { canvas, ctx } = makeCanvas(26, 30);
  const skin = dead ? '#241c22' : '#17141d';
  const lit = dead ? '#33262c' : '#2e2639';

  // head tentacles, drooping further as health falls
  ctx.strokeStyle = lit;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const droop = dead ? 9 : (4 - bucket) * 1.8;
  for (let i = 0; i < 5; i++) {
    const sx = 4 + i * 4.5;
    const dir = i < 2 ? -1 : (i > 2 ? 1 : 0);
    ctx.beginPath();
    ctx.moveTo(sx, 9);
    ctx.quadraticCurveTo(sx + dir * 4, 3 + droop * 0.4, sx + dir * 7, 6 + droop);
    ctx.stroke();
  }

  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(13, 17, 11, 12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.ellipse(9, 12, 5, 4, -0.5, 0, TAU);
  ctx.fill();

  // eyes: all three lit at full health, going dark as it drops
  const eyes = [[8, 15], [18, 15], [13, 21]];
  const alive = dead ? 0 : Math.max(1, Math.round(bucket * 0.75));
  const glow = hurt ? '#ff4a2a' : '#c85aff';
  for (let i = 0; i < eyes.length; i++) {
    const [ex, ey] = eyes[i];
    const on = i < alive;
    ctx.fillStyle = on ? glow : '#2a2130';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3, 2.4, 0, 0, TAU);
    ctx.fill();
    if (on) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex - 1, ey - 1, 2, 2);
    }
  }

  // maw
  ctx.fillStyle = '#0c0a10';
  ctx.beginPath();
  ctx.ellipse(13, 26, dead ? 8 : 5 + (4 - bucket), dead ? 4 : 2.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d8cfc0';
  for (let i = 0; i < 4; i++) ctx.fillRect(10 + i * 2.4, 24.5, 1.4, 2);

  // wounds
  ctx.fillStyle = '#8c1414';
  const cuts = dead ? 8 : (4 - bucket) * 2 + (hurt ? 2 : 0);
  for (let i = 0; i < cuts; i++) {
    const x = 4 + ((i * 7 + bucket * 3) % 17);
    const y = 9 + ((i * 11 + bucket * 5) % 17);
    ctx.fillRect(x, y, 2 + (i % 2), 2);
  }
  if (dead) {
    ctx.fillStyle = '#6e0f0f';
    ctx.fillRect(2, 27, 22, 3);
  }
  return canvas;
}

export class Hud {
  constructor() {
    this.faces = [];
    for (let b = 0; b < 5; b++) {
      this.faces.push({ calm: buildFace(b, false, false), hurt: buildFace(b, true, false) });
    }
    this.dead = buildFace(0, false, true);
  }

  faceFor(game) {
    const p = game.player;
    if (!p.alive) return this.dead;
    const b = clamp(Math.floor(p.health / 20.001), 0, 4);
    const f = this.faces[b];
    return game.painFlash > 0.12 ? f.hurt : f.calm;
  }

  drawText(ctx, text, x, y, size, color, align = 'left') {
    ctx.font = `bold ${size}px "Courier New", ui-monospace, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000000';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  draw(ctx, w, h, game) {
    const p = game.player;
    // --- crosshair ---
    if (p.alive && !game.showMap) {
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2 + game.camera.pitch);
      ctx.fillStyle = 'rgba(230,230,210,0.75)';
      ctx.fillRect(cx - 4, cy, 3, 1);
      ctx.fillRect(cx + 2, cy, 3, 1);
      ctx.fillRect(cx, cy - 4, 1, 3);
      ctx.fillRect(cx, cy + 2, 1, 3);
    }

    // --- damage / pickup tint ---
    if (game.painFlash > 0) {
      ctx.fillStyle = `rgba(180,20,16,${Math.min(0.55, game.painFlash * 0.7)})`;
      ctx.fillRect(0, 0, w, h - BAR_H);
    }
    if (game.pickupFlash > 0) {
      ctx.fillStyle = `rgba(210,170,60,${Math.min(0.3, game.pickupFlash * 0.4)})`;
      ctx.fillRect(0, 0, w, h - BAR_H);
    }

    if (game.showMap) this.drawAutomap(ctx, w, h, game);

    if (game.state === 'title' || game.state === 'victory') return;

    // --- message line ---
    if (game.message && game.messageTime > 0) {
      this.drawText(ctx, game.message, 6, 14, 10, '#e8e2c8');
    }

    this.drawStatusBar(ctx, w, h, game);
  }

  drawStatusBar(ctx, w, h, game) {
    const p = game.player;
    const y0 = h - BAR_H;
    const grad = ctx.createLinearGradient(0, y0, 0, h);
    grad.addColorStop(0, '#3c3f45');
    grad.addColorStop(0.12, '#2a2d33');
    grad.addColorStop(1, '#14161a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, w, BAR_H);
    ctx.fillStyle = '#5a5f68';
    ctx.fillRect(0, y0, w, 1);
    ctx.fillStyle = '#0a0b0d';
    ctx.fillRect(0, y0 + 1, w, 1);

    const weapon = game.weapons[p.weapon];
    const ammo = p.ammo[weapon.ammo];
    const unit = w / 100;

    // ammo
    this.drawText(ctx, 'AMMO', unit * 4, y0 + 13, 8, DIM);
    this.drawText(ctx, String(ammo), unit * 4, y0 + 31, 18, RED);
    // health
    this.drawText(ctx, 'HEALTH', unit * 19, y0 + 13, 8, DIM);
    this.drawText(ctx, `${Math.max(0, Math.round(p.health))}%`, unit * 19, y0 + 31, 18, RED);
    // face
    const face = this.faceFor(game);
    ctx.drawImage(face, Math.round(w / 2 - 13), y0 + 4);
    // armour
    this.drawText(ctx, 'ARMOUR', unit * 62, y0 + 13, 8, DIM);
    this.drawText(ctx, `${Math.round(p.armor)}%`, unit * 62, y0 + 31, 18, RED);
    // keys
    this.drawText(ctx, 'KEYS', unit * 78, y0 + 13, 8, DIM);
    ctx.fillStyle = p.keys.red ? '#e02a1e' : '#3a2020';
    ctx.fillRect(Math.round(unit * 78), y0 + 20, 8, 11);
    ctx.fillStyle = '#00000066';
    ctx.fillRect(Math.round(unit * 78), y0 + 23, 8, 2);

    // weapon slots
    this.drawText(ctx, 'ARMS', unit * 88, y0 + 13, 8, DIM);
    for (let i = 0; i < game.weapons.length; i++) {
      const owned = p.hasWeapon[i];
      const x = Math.round(unit * 88 + i * 10);
      this.drawText(ctx, String(i + 1), x, y0 + 31, 12,
        i === p.weapon ? '#f0e0a0' : (owned ? RED : '#4a4a52'));
    }
  }

  drawAutomap(ctx, w, h, game) {
    const level = game.level;
    const viewH = h - BAR_H;
    ctx.fillStyle = 'rgba(6,8,10,0.93)';
    ctx.fillRect(0, 0, w, viewH);
    const scale = Math.min((w - 20) / level.w, (viewH - 20) / level.h);
    const ox = (w - level.w * scale) / 2;
    const oy = (viewH - level.h * scale) / 2;

    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        const i = y * level.w + x;
        if (!level.walls[i]) continue;
        const seen = game.explored[i];
        if (!seen) continue;
        const door = level.doors.get(i);
        ctx.fillStyle = level.exits.has(i) ? '#2ad24a' : door ? (door.locked ? '#d02a20' : '#c8a02a') : '#7a4a3a';
        ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }

    for (const a of game.actors) {
      if (a.kind === 'item' && game.explored[Math.floor(a.y) * level.w + Math.floor(a.x)]) {
        ctx.fillStyle = a.type.big ? '#e8d24a' : '#4a9ad2';
        ctx.fillRect(ox + a.x * scale - 1, oy + a.y * scale - 1, 2, 2);
      }
    }

    // player arrow
    const px = ox + game.player.x * scale;
    const py = oy + game.player.y * scale;
    ctx.strokeStyle = '#f0f0d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const a = game.player.angle;
    ctx.moveTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5);
    ctx.lineTo(px + Math.cos(a + 2.5) * 5, py + Math.sin(a + 2.5) * 5);
    ctx.lineTo(px + Math.cos(a - 2.5) * 5, py + Math.sin(a - 2.5) * 5);
    ctx.closePath();
    ctx.stroke();

    this.drawText(ctx, `${level.name}  ${game.stats.kills}/${game.stats.totalKills} KILLS`, 6, 12, 9, '#c8c2a8');
  }

  // --- full screen overlays ------------------------------------------------
  panel(ctx, w, h, alpha = 0.72) {
    ctx.fillStyle = `rgba(8,6,8,${alpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  title(ctx, w, h, game) {
    this.panel(ctx, w, h, 0.55);
    const cx = w / 2;
    this.drawText(ctx, 'NEURO', cx, h * 0.3, 44, '#d63a2a', 'center');
    this.drawText(ctx, 'DOOM', cx, h * 0.3 + 38, 44, '#e8b02a', 'center');
    this.drawText(ctx, 'YOU ARE THE THING WITH THE TENTACLES', cx, h * 0.3 + 58, 9, '#c8c2a8', 'center');
    const blink = Math.floor(game.time * 2) % 2 === 0;
    if (blink) this.drawText(ctx, 'CLICK OR PRESS ENTER TO PLAY', cx, h * 0.62, 12, '#f0e8c8', 'center');
    this.drawText(ctx, 'WASD MOVE   MOUSE LOOK   CLICK FIRE   E USE   1-3 WEAPONS   TAB MAP', cx, h - 54, 8, '#8a8a92', 'center');
    this.drawText(ctx, 'SHIFT RUN   M MUSIC   P PAUSE   R RESTART LEVEL', cx, h - 42, 8, '#8a8a92', 'center');
    this.drawText(ctx, 'ANYTHING THAT GETS CLOSE ENOUGH GETS CRUSHED', cx, h - 30, 8, '#8a5aa8', 'center');
  }

  paused(ctx, w, h) {
    this.panel(ctx, w, h, 0.66);
    this.drawText(ctx, 'PAUSED', w / 2, h / 2 - 6, 26, '#e8b02a', 'center');
    this.drawText(ctx, 'PRESS P TO CONTINUE', w / 2, h / 2 + 16, 10, '#c8c2a8', 'center');
  }

  gameOver(ctx, w, h, game) {
    ctx.fillStyle = 'rgba(90,8,6,0.55)';
    ctx.fillRect(0, 0, w, h);
    this.drawText(ctx, 'YOU DIED', w / 2, h / 2 - 10, 32, '#e02a1e', 'center');
    this.drawText(ctx, `${game.level.name}  -  ${game.stats.kills}/${game.stats.totalKills} KILLS`,
      w / 2, h / 2 + 14, 10, '#e8c8a8', 'center');
    this.drawText(ctx, 'PRESS R OR CLICK TO TRY AGAIN', w / 2, h / 2 + 34, 11, '#f0e8c8', 'center');
  }

  levelComplete(ctx, w, h, game) {
    this.panel(ctx, w, h, 0.78);
    const s = game.stats;
    this.drawText(ctx, 'LEVEL CLEARED', w / 2, h * 0.3, 26, '#2ad24a', 'center');
    this.drawText(ctx, game.level.name, w / 2, h * 0.3 + 20, 12, '#e8b02a', 'center');
    const pct = s.totalKills ? Math.round((s.kills / s.totalKills) * 100) : 100;
    const ipct = s.totalItems ? Math.round((s.items / s.totalItems) * 100) : 100;
    this.drawText(ctx, `KILLS   ${s.kills}/${s.totalKills}  (${pct}%)`, w / 2, h * 0.55, 12, '#e8e2c8', 'center');
    this.drawText(ctx, `ITEMS   ${s.items}/${s.totalItems}  (${ipct}%)`, w / 2, h * 0.55 + 18, 12, '#e8e2c8', 'center');
    this.drawText(ctx, `TIME    ${game.formatTime(s.time)}`, w / 2, h * 0.55 + 36, 12, '#e8e2c8', 'center');
    const blink = Math.floor(game.time * 2) % 2 === 0;
    if (blink) this.drawText(ctx, 'PRESS ENTER FOR THE NEXT LEVEL', w / 2, h - 40, 11, '#f0e8c8', 'center');
  }

  victory(ctx, w, h, game) {
    this.panel(ctx, w, h, 0.82);
    const s = game.totals;
    this.drawText(ctx, 'HELL IS CLEAR', w / 2, h * 0.26, 28, '#e8b02a', 'center');
    this.drawText(ctx, 'YOU BEAT ALL THREE LEVELS', w / 2, h * 0.26 + 20, 10, '#c8c2a8', 'center');
    this.drawText(ctx, `TOTAL KILLS   ${s.kills}`, w / 2, h * 0.52, 12, '#e8e2c8', 'center');
    this.drawText(ctx, `TOTAL TIME    ${game.formatTime(s.time)}`, w / 2, h * 0.52 + 18, 12, '#e8e2c8', 'center');
    this.drawText(ctx, `DEATHS        ${s.deaths}`, w / 2, h * 0.52 + 36, 12, '#e8e2c8', 'center');
    const blink = Math.floor(game.time * 2) % 2 === 0;
    if (blink) this.drawText(ctx, 'PRESS ENTER TO PLAY AGAIN', w / 2, h - 40, 11, '#f0e8c8', 'center');
  }
}
