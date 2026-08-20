// Textured raycaster: floor/ceiling casting, DDA wall casting with sliding
// doors, and z-buffered billboard sprites. Everything is rasterised into a
// small 32-bit framebuffer which is then point-scaled to the display canvas.

import { SHADES, FULL_LIGHT, lightForDist, clamp } from './util.js';
import { TEX_SIZE } from './textures.js';

const FOV_SCALE = 0.82; // half-width of the camera plane -> ~78 degree FOV

export class Renderer {
  constructor(canvas, textures) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.textures = textures;
    this.baseWidth = 480;
    this.view = document.createElement('canvas');
    this.vctx = this.view.getContext('2d', { alpha: false, willReadFrequently: true });
    this.w = 0;
    this.h = 0;
    this.resize(canvas.clientWidth || 640, canvas.clientHeight || 360);
  }

  setQuality(baseWidth) {
    this.baseWidth = baseWidth;
    this.resize(this.displayW, this.displayH);
  }

  resize(displayW, displayH) {
    this.displayW = Math.max(1, displayW);
    this.displayH = Math.max(1, displayH);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.displayW * dpr);
    this.canvas.height = Math.floor(this.displayH * dpr);
    this.ctx.imageSmoothingEnabled = false;

    // The view is letterboxed into a sane aspect range: a very tall window
    // would otherwise mean either stretched pixels or a keyhole-narrow FOV.
    const viewAspect = clamp(this.displayW / this.displayH, 1.05, 2.6);
    let w = this.baseWidth;
    let h = Math.round(w / viewAspect);
    const budget = 160000; // pixels per frame the inner loops have to fill
    if (w * h > budget) {
      const s = Math.sqrt(budget / (w * h));
      w = Math.round((w * s) / 2) * 2;
      h = Math.round(h * s);
    }
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.view.width = w;
      this.view.height = h;
      this.vctx.imageSmoothingEnabled = false;
      this.image = this.vctx.createImageData(w, h);
      this.buf = new Uint32Array(this.image.data.buffer);
      this.zbuf = new Float32Array(w);
    }
  }

  // --- world ---------------------------------------------------------------
  renderWorld(level, cam, sprites, lightBoost = 0) {
    const { w, h, buf, zbuf, textures } = this;
    const { walls, floors, ceils, doors, w: mw, h: mh } = level;
    const dirX = Math.cos(cam.angle);
    const dirY = Math.sin(cam.angle);
    const planeX = -dirY * FOV_SCALE;
    const planeY = dirX * FOV_SCALE;
    const posX = cam.x;
    const posY = cam.y;
    const horizon = Math.round(h * 0.5 + cam.pitch);
    const posZ = 0.5 * h;
    const boost = lightBoost | 0;

    // --- floors and ceilings (per scanline) ---
    const rdx0 = dirX - planeX;
    const rdy0 = dirY - planeY;
    const rdx1 = dirX + planeX;
    const rdy1 = dirY + planeY;

    for (let y = 0; y < h; y++) {
      const isFloor = y > horizon;
      const p = isFloor ? y - horizon : horizon - y;
      if (p <= 0) {
        // Exactly on the horizon: fill with the darkest shade of the flat.
        const row = y * w;
        for (let x = 0; x < w; x++) buf[row + x] = 0xff000000;
        continue;
      }
      const rowDist = posZ / p;
      const stepX = (rowDist * (rdx1 - rdx0)) / w;
      const stepY = (rowDist * (rdy1 - rdy0)) / w;
      let fx = posX + rowDist * rdx0;
      let fy = posY + rowDist * rdy0;
      let light = lightForDist(rowDist) + boost;
      if (light > SHADES - 1) light = SHADES - 1;
      const map = isFloor ? floors : ceils;
      const row = y * w;
      let cachedTex = -1;
      let shade = null;
      for (let x = 0; x < w; x++) {
        const cx = Math.floor(fx);
        const cy = Math.floor(fy);
        let px = 0xff000000;
        if (cx >= 0 && cy >= 0 && cx < mw && cy < mh) {
          const texId = map[cy * mw + cx];
          if (texId !== cachedTex) {
            cachedTex = texId;
            const t = textures[texId];
            shade = t ? t.shades[light] : null;
          }
          if (shade) {
            const tx = ((fx - cx) * TEX_SIZE) & (TEX_SIZE - 1);
            const ty = ((fy - cy) * TEX_SIZE) & (TEX_SIZE - 1);
            px = shade[(ty << 6) + tx];
          }
        }
        buf[row + x] = px;
        fx += stepX;
        fy += stepY;
      }
    }

    // --- walls (per column) ---
    for (let x = 0; x < w; x++) {
      const cameraX = (2 * x) / w - 1;
      const rayX = dirX + planeX * cameraX;
      const rayY = dirY + planeY * cameraX;
      let mapX = Math.floor(posX);
      let mapY = Math.floor(posY);
      const deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
      const deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
      let stepX, stepY, sideDistX, sideDistY;
      if (rayX < 0) { stepX = -1; sideDistX = (posX - mapX) * deltaX; }
      else { stepX = 1; sideDistX = (mapX + 1 - posX) * deltaX; }
      if (rayY < 0) { stepY = -1; sideDistY = (posY - mapY) * deltaY; }
      else { stepY = 1; sideDistY = (mapY + 1 - posY) * deltaY; }

      let side = 0;
      let hit = 0;
      let dist = 0;
      let wallU = 0;
      let texId = 0;
      for (let guard = 0; guard < 256 && !hit; guard++) {
        if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
        else { sideDistY += deltaY; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) break;
        const cell = mapY * mw + mapX;
        const t = walls[cell];
        if (!t) continue;
        const door = doors.get(cell);
        if (door) {
          // Doors sit on the centre plane of their cell and slide sideways.
          let d, u;
          if (side === 0) {
            d = (mapX + 0.5 - posX) / rayX;
            if (d < 0) continue;
            const hy = posY + d * rayY;
            if (Math.floor(hy) !== mapY) continue;
            u = hy - Math.floor(hy);
          } else {
            d = (mapY + 0.5 - posY) / rayY;
            if (d < 0) continue;
            const hx = posX + d * rayX;
            if (Math.floor(hx) !== mapX) continue;
            u = hx - Math.floor(hx);
          }
          if (u < door.open) continue; // ray slips through the open part
          hit = 1;
          dist = d;
          wallU = u - door.open;
          texId = t;
        } else {
          hit = 1;
          dist = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
          wallU = side === 0 ? posY + dist * rayY : posX + dist * rayX;
          wallU -= Math.floor(wallU);
          texId = t;
        }
      }

      if (!hit || dist <= 0.0001) {
        zbuf[x] = 1e30;
        continue;
      }
      zbuf[x] = dist;

      const lineH = h / dist;
      const startF = horizon - lineH * 0.5;
      let y0 = Math.ceil(startF);
      let y1 = Math.floor(startF + lineH);
      if (y0 < 0) y0 = 0;
      if (y1 > h - 1) y1 = h - 1;
      if (y1 < y0) continue;

      const tex = textures[texId];
      if (!tex) continue;
      let light = lightForDist(dist) + boost - (side === 1 ? 3 : 0);
      if (light > SHADES - 1) light = SHADES - 1;
      if (light < 0) light = 0;
      const shade = tex.shades[light];

      let tx = (wallU * TEX_SIZE) | 0;
      if (tx < 0) tx = 0; else if (tx > TEX_SIZE - 1) tx = TEX_SIZE - 1;
      if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) tx = TEX_SIZE - 1 - tx;

      const texStep = TEX_SIZE / lineH;
      let texPos = (y0 - startF) * texStep;
      let idx = y0 * w + x;
      for (let y = y0; y <= y1; y++) {
        const ty = texPos & (TEX_SIZE - 1);
        buf[idx] = shade[((ty | 0) << 6) + tx];
        texPos += texStep;
        idx += w;
      }
    }

    // --- sprites (back to front) ---
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      const relX = s.x - posX;
      const relY = s.y - posY;
      s._ty = invDet * (-planeY * relX + planeX * relY);
      s._tx = invDet * (dirY * relX - dirX * relY);
    }
    sprites.sort((a, b) => b._ty - a._ty);

    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      const ty = s._ty;
      if (ty < 0.12) continue;
      const frame = s.frame;
      if (!frame) continue;
      const screenX = (w * 0.5) * (1 + s._tx / ty);
      const yTop = horizon + ((0.5 - (s.base + s.height)) * h) / ty;
      const yBot = horizon + ((0.5 - s.base) * h) / ty;
      const spriteH = yBot - yTop;
      if (spriteH < 0.5) continue;
      const spriteW = spriteH * (frame.w / frame.h);
      const x0 = Math.max(0, Math.ceil(screenX - spriteW / 2));
      const x1 = Math.min(w - 1, Math.floor(screenX + spriteW / 2));
      if (x1 < x0) continue;
      const drawY0 = Math.max(0, Math.ceil(yTop));
      const drawY1 = Math.min(h - 1, Math.floor(yBot));
      if (drawY1 < drawY0) continue;

      let light = s.glow ? FULL_LIGHT + 6 : lightForDist(ty) + boost + (s.lightBias || 0);
      if (light > SHADES - 1) light = SHADES - 1;
      if (light < 0) light = 0;
      const shade = frame.shades[light];
      const sw = frame.w;
      const sh = frame.h;
      const uStep = sw / spriteW;
      const vStep = sh / spriteH;
      const uStart = (x0 - (screenX - spriteW / 2)) * uStep;

      let u = uStart;
      for (let x = x0; x <= x1; x++, u += uStep) {
        if (zbuf[x] <= ty) continue;
        const texX = u | 0;
        if (texX < 0 || texX >= sw) continue;
        let v = (drawY0 - yTop) * vStep;
        let idx = drawY0 * w + x;
        for (let y = drawY0; y <= drawY1; y++, v += vStep, idx += w) {
          const texY = v | 0;
          if (texY < 0 || texY >= sh) continue;
          const px = shade[texY * sw + texX];
          if (px !== 0) buf[idx] = px;
        }
      }
    }

    this.vctx.putImageData(this.image, 0, 0);
  }

  // Blit the framebuffer (plus anything drawn on top of it) to the display,
  // centred, with black bars when the window aspect does not match the view.
  present() {
    const { ctx, canvas } = this;
    ctx.imageSmoothingEnabled = false;
    const scale = Math.min(canvas.width / this.w, canvas.height / this.h);
    const dw = Math.round(this.w * scale);
    const dh = Math.round(this.h * scale);
    const dx = Math.floor((canvas.width - dw) / 2);
    const dy = Math.floor((canvas.height - dh) / 2);
    if (dx > 0 || dy > 0) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(this.view, dx, dy, dw, dh);
  }
}
