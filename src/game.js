// Game rules: the player (a thing made of tentacles), doors, pickups,
// the strike/crush attack and the frame loop.

import { clamp, rand, randInt, angleDiff } from './util.js';
import { buildLevel, levelCount } from './levels.js';
import { T } from './textures.js';
import { Enemy, Item, Prop, Projectile, Effect, Gib } from './entities.js';
import { Hud } from './hud.js';
import { tentacle } from './tentacles.js';

const PLAYER_RADIUS = 0.26;
const WALK_SPEED = 3.4;
const RUN_SPEED = 6.0;
const BAR_H = 38;

// You have no guns. You have tentacles: they take hold of anything that walks
// into reach on their own, and the fire button throws them a little further at
// whatever you are looking at. Either way the target comes apart.
const CRUSH_RANGE = 2.5;    // automatic grab
const STRIKE_RANGE = 3.6;   // deliberate lash on the fire button
const CRUSH_ARC = 1.4;      // radians either side of where you are looking
const STRIKE_ARC = 1.0;
const CRUSH_DAMAGE = 58;
const STRIKE_DAMAGE = 76;
const CRUSH_DURATION = 0.62;
const STRIKE_DURATION = 0.44;
const CRUSH_STRIKE = 0.22;  // when in the animation the squeeze lands
const CRUSH_COOLDOWN = 0.7;
const STRIKE_COOLDOWN = 0.24;
const MAX_GIBS = 140;

export class Game {
  constructor({ renderer, art, audio, input }) {
    this.renderer = renderer;
    this.art = art;
    this.audio = audio;
    this.input = input;
    this.hud = new Hud();
    this.state = 'title';
    this.time = 0;
    this.actors = [];
    this.spriteList = [];
    this.message = '';
    this.messageTime = 0;
    this.painFlash = 0;
    this.pickupFlash = 0;
    this.lightBoost = 0;
    this.shake = 0;
    this.recoil = 0;
    this.showMap = false;
    this.crush = null;
    this.crushCooldown = 0;
    this.camera = { x: 0, y: 0, angle: 0, pitch: 0 };
    this.totals = { kills: 0, time: 0, deaths: 0 };
    this.player = this.freshPlayer();
    this.levelIndex = 0;
    this.loadLevel(0);
  }

  freshPlayer() {
    return {
      x: 0, y: 0, angle: 0,
      health: 100, armor: 0,
      keys: { red: false },
      alive: true,
      bob: 0,
      vx: 0, vy: 0,
    };
  }

  // --- level management ----------------------------------------------------
  loadLevel(index, keepPlayer = false) {
    this.levelIndex = index;
    this.level = buildLevel(index);
    this.actors = [];
    this.stats = { kills: 0, totalKills: 0, items: 0, totalItems: 0, time: 0 };
    this.explored = new Uint8Array(this.level.w * this.level.h);
    this.revealTimer = 0;
    this.crush = null;
    this.crushCooldown = 0;
    this.showMap = false;
    this.painFlash = 0;
    this.pickupFlash = 0;
    this.recoil = 0;
    this.shake = 0;

    for (const t of this.level.things) {
      if (t.kind === 'enemy') {
        this.actors.push(new Enemy(this, t.type, t.x, t.y));
        this.stats.totalKills++;
      } else if (t.kind === 'item') {
        this.actors.push(new Item(this, t.type, t.x, t.y));
        this.stats.totalItems++;
      } else if (t.kind === 'prop') {
        this.actors.push(new Prop(this, t.type, t.x, t.y));
      }
    }

    const p = this.player;
    if (!keepPlayer) {
      p.health = Math.max(p.health, 100);
      p.armor = Math.max(p.armor, 0);
    }
    p.keys.red = false;
    p.alive = true;
    p.x = this.level.start.x;
    p.y = this.level.start.y;
    p.angle = this.level.start.angle;
    p.vx = 0;
    p.vy = 0;
    this.camera.pitch = 0;
    this.setMessage(this.level.name);
  }

  newGame() {
    this.player = this.freshPlayer();
    this.totals = { kills: 0, time: 0, deaths: 0 };
    this.loadLevel(0);
    this.state = 'playing';
  }

  restartLevel() {
    const p = this.player;
    p.health = 100;
    p.armor = 0;
    this.loadLevel(this.levelIndex, true);
    this.state = 'playing';
  }

  nextLevel() {
    if (this.levelIndex + 1 >= levelCount()) {
      this.state = 'victory';
      this.input.exitLock();
      return;
    }
    this.loadLevel(this.levelIndex + 1, true);
    this.state = 'playing';
  }

  // --- map queries ---------------------------------------------------------
  cellAt(x, y) {
    const { level } = this;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= level.w || cy >= level.h) return -1;
    return cy * level.w + cx;
  }

  isWall(x, y) {
    const i = this.cellAt(x, y);
    if (i < 0) return true;
    const t = this.level.walls[i];
    if (!t) return false;
    const door = this.level.doors.get(i);
    if (door) return door.open < 0.62;
    return true;
  }

  blocked(x, y, self) {
    if (this.isWall(x, y)) return true;
    for (const a of this.actors) {
      if (a === self || a.remove) continue;
      if (a.kind === 'prop' && a.alive) {
        if (Math.hypot(a.x - x, a.y - y) < a.radius + 0.2) return true;
      } else if (a.kind === 'enemy' && a.alive && a !== self) {
        if (Math.hypot(a.x - x, a.y - y) < a.radius + 0.22) return true;
      }
    }
    if (self && self.kind === 'enemy' && this.player.alive) {
      if (Math.hypot(this.player.x - x, this.player.y - y) < 0.45) return true;
    }
    return false;
  }

  // Distance to the first solid cell along a ray (DDA).
  castRay(x0, y0, dx, dy, maxDist) {
    let mapX = Math.floor(x0);
    let mapY = Math.floor(y0);
    const deltaX = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const deltaY = dy === 0 ? 1e30 : Math.abs(1 / dy);
    let stepX, stepY, sideX, sideY;
    if (dx < 0) { stepX = -1; sideX = (x0 - mapX) * deltaX; }
    else { stepX = 1; sideX = (mapX + 1 - x0) * deltaX; }
    if (dy < 0) { stepY = -1; sideY = (y0 - mapY) * deltaY; }
    else { stepY = 1; sideY = (mapY + 1 - y0) * deltaY; }
    const { level } = this;
    for (let guard = 0; guard < 256; guard++) {
      let dist;
      if (sideX < sideY) { dist = sideX; sideX += deltaX; mapX += stepX; }
      else { dist = sideY; sideY += deltaY; mapY += stepY; }
      if (dist > maxDist) return maxDist;
      if (mapX < 0 || mapY < 0 || mapX >= level.w || mapY >= level.h) return dist;
      const i = mapY * level.w + mapX;
      if (level.walls[i]) {
        const door = level.doors.get(i);
        if (!door || door.open < 0.5) return dist;
      }
    }
    return maxDist;
  }

  canSee(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return true;
    return this.castRay(x0, y0, dx / d, dy / d, d) >= d - 0.02;
  }

  volumeAt(dist) {
    return clamp(1 - dist / 20, 0.06, 1);
  }

  // --- doors and switches --------------------------------------------------
  openDoor(i) {
    const door = this.level.doors.get(i);
    if (!door) return false;
    if (door.locked && !this.player.keys.red) {
      this.setMessage('YOU NEED A RED KEYCARD');
      this.audio.play('locked');
      return true;
    }
    if (door.target !== 1) {
      door.target = 1;
      this.audio.play('door', { volume: 0.8 });
    }
    door.hold = 5;
    return true;
  }

  tryEnemyDoor(x, y) {
    const i = this.cellAt(x, y);
    if (i < 0) return;
    const door = this.level.doors.get(i);
    if (door && !door.locked && door.target !== 1) {
      door.target = 1;
      door.hold = 4;
      const d = Math.hypot(this.player.x - x, this.player.y - y);
      this.audio.play('door', { volume: this.volumeAt(d) * 0.7 });
    }
  }

  updateDoors(dt) {
    for (const [i, door] of this.level.doors) {
      if (door.target > door.open) {
        door.open = Math.min(1, door.open + dt * 1.7);
      } else if (door.open > 0) {
        if (this.cellOccupied(i)) door.hold = 1.2;
        else door.open = Math.max(0, door.open - dt * 1.4);
      }
      if (door.open >= 1 && door.target === 1) {
        door.hold -= dt;
        if (door.hold <= 0) door.target = 0;
      }
    }
  }

  cellOccupied(i) {
    const { level } = this;
    const cx = i % level.w;
    const cy = Math.floor(i / level.w);
    const p = this.player;
    if (Math.floor(p.x) === cx && Math.floor(p.y) === cy) return true;
    for (const a of this.actors) {
      if ((a.kind === 'enemy' && a.alive) || (a.kind === 'prop' && a.alive)) {
        if (Math.floor(a.x) === cx && Math.floor(a.y) === cy) return true;
      }
    }
    return false;
  }

  useAction() {
    const p = this.player;
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    for (let t = 0.3; t <= 1.7; t += 0.2) {
      const i = this.cellAt(p.x + dx * t, p.y + dy * t);
      if (i < 0) continue;
      if (this.level.doors.has(i)) {
        if (this.openDoor(i)) return;
      }
      if (this.level.exits.has(i)) {
        this.finishLevel();
        return;
      }
      if (this.level.walls[i]) return; // solid wall blocks the reach
    }
  }

  finishLevel() {
    if (this.state !== 'playing') return;
    this.state = 'levelComplete';
    this.audio.play('switch');
    this.audio.play('levelClear');
    this.totals.time += this.stats.time;
    this.input.exitLock();
    for (const i of this.level.exits) this.level.walls[i] = T.EXIT_ON; // switch lights up green
  }

  // --- combat --------------------------------------------------------------
  // The fire button: throw the limbs at whatever is in front. Missing is
  // allowed - they lash out into empty air and you lose the moment.
  strike() {
    const p = this.player;
    this.crushCooldown = STRIKE_COOLDOWN;
    const target = this.findVictim(STRIKE_RANGE, STRIKE_ARC);
    this.crush = {
      t: 0,
      target,
      manual: true,
      damage: STRIKE_DAMAGE,
      duration: STRIKE_DURATION,
      damaged: false,
      phases: [rand(0, 6), rand(0, 6), rand(0, 6)],
    };
    this.audio.play('lash');
    this.recoil = 2;
    this.alertEnemies(9);
    if (!target) this.shake = Math.max(this.shake, 0.12);
  }

  findVictim(range, arc) {
    const p = this.player;
    let best = null;
    let bestD = range;
    for (const a of this.actors) {
      if (a.kind !== 'enemy' || !a.alive) continue;
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > bestD) continue;
      if (Math.abs(angleDiff(p.angle, Math.atan2(dy, dx))) > arc) continue;
      if (!this.canSee(p.x, p.y, a.x, a.y)) continue; // no reaching through walls
      bestD = d;
      best = a;
    }
    return best;
  }

  // Tearing something apart: chunks of it fly out of the grip and land nearby.
  gibEnemy(enemy) {
    this.audio.play('gib', { volume: this.volumeAt(Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y)) });
    const count = enemy.typeName === 'demon' ? 13 : 9;
    let gibs = 0;
    for (const a of this.actors) if (a.kind === 'gib') gibs++;
    for (let i = 0; i < count; i++) {
      if (gibs++ > MAX_GIBS) break;
      const a = rand(0, Math.PI * 2);
      const speed = rand(0.8, 4.2);
      this.actors.push(new Gib(
        this, enemy.typeName, enemy.x, enemy.y, rand(0.3, 0.8),
        Math.cos(a) * speed, Math.sin(a) * speed, rand(1.6, 5),
      ));
    }
    this.spawnEffect('blood', enemy.x, enemy.y, 0.36, 1.1, 0.5);
    this.spawnEffect('blood', enemy.x + rand(-0.3, 0.3), enemy.y + rand(-0.3, 0.3), 0.3, 0.7, 0.75);
  }

  alertEnemies(radius) {
    for (const a of this.actors) {
      if (a.kind === 'enemy' && a.state === 'idle') {
        if (Math.hypot(a.x - this.player.x, a.y - this.player.y) < radius) a.state = 'chase';
      }
    }
  }

  explosion(x, y, radius, damage, source) {
    this.spawnEffect('explosion', x, y, 0.5, 2.4, 0.5);
    this.audio.play('explosion', { volume: this.volumeAt(Math.hypot(this.player.x - x, this.player.y - y)) });
    this.shake = Math.max(this.shake, 1.1);
    for (const a of this.actors) {
      if (a === source || a.remove) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      if (a.kind === 'enemy' && a.alive) a.hurt(Math.round(damage * falloff));
      else if (a.kind === 'prop' && a.alive && a.typeName === 'barrel') a.hurt(Math.round(damage * falloff));
    }
    const pd = Math.hypot(this.player.x - x, this.player.y - y);
    if (pd < radius && this.player.alive) this.hurtPlayer(Math.round(damage * (1 - pd / radius) * 0.7));
  }

  updateCrush(dt) {
    const p = this.player;
    this.crushCooldown -= dt;
    if (this.crush) {
      const c = this.crush;
      c.t += dt;
      if (!c.damaged && c.t >= CRUSH_STRIKE * (c.duration / CRUSH_DURATION)) {
        c.damaged = true;
        const e = c.target;
        if (e && e.alive) {
          this.audio.play('crush');
          e.hurt(c.damage);
          if (e.alive) this.spawnEffect('blood', e.x, e.y, 0.32, 0.7, 0.5);
          this.shake = Math.max(this.shake, 0.7);
        }
      }
      if (c.t >= c.duration) {
        this.crush = null;
        this.crushCooldown = Math.max(this.crushCooldown, c.manual ? STRIKE_COOLDOWN : CRUSH_COOLDOWN);
      }
      return;
    }
    if (this.crushCooldown > 0 || !p.alive) return;

    // nothing deliberate happening: grab whatever wandered into reach
    const victim = this.findVictim(CRUSH_RANGE, CRUSH_ARC);
    if (!victim) return;
    this.crush = {
      t: 0,
      target: victim,
      manual: false,
      damage: CRUSH_DAMAGE,
      duration: CRUSH_DURATION,
      damaged: false,
      phases: [rand(0, 6), rand(0, 6), rand(0, 6)],
    };
    this.audio.play('lash');
  }

  // The limbs themselves. At rest they sway in the bottom corners; during an
  // attack they stretch to the target (or to the crosshair on a miss) and
  // squeeze. Drawn in framebuffer space, over the world.
  drawLimbs(ctx, w, h) {
    const viewH = h - BAR_H;
    const s = viewH / 232;
    const p = this.player;
    const c = this.crush;
    const bobX = Math.sin(p.bob * 1.2) * 7 * s;
    const bobY = Math.abs(Math.cos(p.bob * 2.4)) * 6 * s;

    let aim = null;
    let reach = 0;
    let squeeze = 0;
    if (c) {
      const t = c.t / c.duration;
      reach = t < 0.32 ? t / 0.32 : (t > 0.68 ? 1 - (t - 0.68) / 0.32 : 1);
      squeeze = t >= 0.28 && t <= 0.8 ? Math.sin(((t - 0.28) / 0.52) * Math.PI) : 0;
      const proj = c.target
        ? this.renderer.projectToScreen(this.camera, c.target.x, c.target.y, 0.45)
        : null;
      aim = proj
        ? { x: clamp(proj.x, -w * 0.2, w * 1.2), y: clamp(proj.y, 0, viewH) }
        : { x: w * 0.5, y: Math.round(h * 0.5 + this.camera.pitch) };
    }

    const limbs = [
      { ox: -18 * s, oy: viewH * 1.04, rest: [w * 0.24, viewH * 0.56], bend: -w * 0.17, delay: 0 },
      { ox: w + 18 * s, oy: viewH * 1.04, rest: [w * 0.76, viewH * 0.56], bend: w * 0.17, delay: 0.05 },
      { ox: w * 0.5, oy: h + 16, rest: [w * 0.5, h + 30], bend: 0, delay: 0.1 },
    ];

    for (let i = 0; i < limbs.length; i++) {
      const L = limbs[i];
      const wave = this.time * 1.7 + i * 2.1;
      const idleX = L.rest[0] + Math.sin(wave) * 11 * s + bobX;
      const idleY = L.rest[1] + Math.cos(wave * 0.8) * 8 * s + bobY;
      const ext = aim ? clamp(reach - L.delay, 0, 1) : 0;
      const tipX = idleX + (aim ? (aim.x - idleX) * ext : 0);
      const tipY = idleY + (aim ? (aim.y - idleY) * ext : 0);
      if (i === 2 && ext <= 0.05) continue; // the third limb only shows for a strike
      tentacle(ctx, {
        x0: L.ox, y0: L.oy,
        cx: (L.ox + tipX) / 2 + L.bend * (1 - ext * 0.5),
        cy: (L.oy + tipY) / 2 - viewH * (0.12 + 0.14 * ext + 0.08 * squeeze),
        x1: tipX, y1: tipY,
        w0: (38 + squeeze * 6) * s,
        w1: (13 + squeeze * 7) * s,
        wobble: 3.2 * s,
        phase: (c ? c.phases[i] : i * 2) + this.time * (c ? 10 : 2.4),
      });
    }

    if (c && c.damaged && squeeze > 0.3 && c.target) {
      ctx.fillStyle = 'rgba(168,18,18,0.85)';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + c.phases[0];
        const r = (10 + squeeze * 18) * s;
        ctx.fillRect(aim.x + Math.cos(a) * r, aim.y + Math.sin(a) * r * 0.7, 3 * s, 3 * s);
      }
    }
  }

  hurtPlayer(amount) {
    const p = this.player;
    if (!p.alive || amount <= 0) return;
    let dmg = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, dmg / 3);
      p.armor -= absorbed;
      dmg -= absorbed;
    }
    p.health -= dmg;
    this.painFlash = Math.min(1, 0.35 + dmg / 45);
    this.shake = Math.max(this.shake, Math.min(1.4, dmg / 22));
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      this.state = 'dead';
      this.showMap = false;
      this.totals.deaths++;
      this.audio.play('playerDie');
      this.input.exitLock();
    } else {
      this.audio.play('playerPain');
    }
  }

  onEnemyKilled() {
    this.stats.kills++;
    this.totals.kills++;
  }

  tryPickup(item) {
    const p = this.player;
    const t = item.type;
    let took = false;
    if (t.give === 'health') {
      if (p.health < 100) { p.health = Math.min(100, p.health + t.amount); took = true; }
    } else if (t.give === 'armor') {
      if (p.armor < 100) { p.armor = Math.min(100, p.armor + t.amount); took = true; }
    } else if (t.give === 'key') {
      p.keys.red = true;
      took = true;
    }
    if (!took) return;
    item.remove = true;
    this.stats.items++;
    this.setMessage(t.msg);
    this.pickupFlash = 0.5;
    this.audio.play(t.big ? 'bigPickup' : 'pickup');
  }

  spawnEffect(name, x, y, duration, size = 0.5, base = 0.45) {
    this.actors.push(new Effect(this, name, x, y, duration, size, base));
  }

  spawnProjectile(x, y, angle, owner) {
    this.actors.push(new Projectile(this, x, y, angle, owner));
  }

  setMessage(text) {
    this.message = text;
    this.messageTime = 3.2;
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // --- movement ------------------------------------------------------------
  movePlayer(dt) {
    const p = this.player;
    const input = this.input;
    const run = input.isDown('run');
    const speed = run ? RUN_SPEED : WALK_SPEED;
    const fwd = input.moveForward;
    const strafe = input.moveStrafe;

    let tx = 0;
    let ty = 0;
    if (fwd || strafe) {
      const len = Math.min(1, Math.hypot(fwd, strafe));
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      const nx = (cos * fwd + Math.cos(p.angle + Math.PI / 2) * strafe);
      const ny = (sin * fwd + Math.sin(p.angle + Math.PI / 2) * strafe);
      const nlen = Math.hypot(nx, ny) || 1;
      tx = (nx / nlen) * speed * len;
      ty = (ny / nlen) * speed * len;
    }
    // Smooth acceleration / friction.
    const accel = 14;
    p.vx += (tx - p.vx) * Math.min(1, accel * dt);
    p.vy += (ty - p.vy) * Math.min(1, accel * dt);

    const dx = p.vx * dt;
    const dy = p.vy * dt;
    if (!this.playerBlocked(p.x + dx + Math.sign(dx) * PLAYER_RADIUS, p.y)) p.x += dx;
    else p.vx *= 0.2;
    if (!this.playerBlocked(p.x, p.y + dy + Math.sign(dy) * PLAYER_RADIUS)) p.y += dy;
    else p.vy *= 0.2;

    const moved = Math.hypot(p.vx, p.vy);
    p.bob += dt * moved * 1.9;
  }

  playerBlocked(x, y) {
    if (this.isWall(x, y)) return true;
    for (const a of this.actors) {
      if (a.remove) continue;
      if (a.kind === 'prop' && a.alive && Math.hypot(a.x - x, a.y - y) < a.radius + PLAYER_RADIUS) return true;
      if (a.kind === 'enemy' && a.alive && Math.hypot(a.x - x, a.y - y) < a.radius + PLAYER_RADIUS * 0.7) return true;
    }
    return false;
  }

  reveal() {
    const p = this.player;
    const { level } = this;
    const rays = 100;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const maxD = 11;
      const d = this.castRay(p.x, p.y, dx, dy, maxD);
      for (let t = 0; t <= d + 0.5; t += 0.34) {
        const cx = Math.floor(p.x + dx * t);
        const cy = Math.floor(p.y + dy * t);
        if (cx < 0 || cy < 0 || cx >= level.w || cy >= level.h) break;
        this.explored[cy * level.w + cx] = 1;
      }
    }
  }

  // --- frame ---------------------------------------------------------------
  // A click anywhere counts as "confirm" on the menu screens, which is what
  // players expect on a page they just opened.
  click() {
    if (this.state === 'paused') { this.resume(); return; }
    if (this.state === 'playing') { this.input.requestLock(); return; }
    this.confirm();
  }

  confirm() {
    const input = this.input;
    if (this.state === 'title') {
      this.audio.init();
      this.audio.resume();
      if (this.audio.musicOn) this.audio.startMusic();
      this.newGame();
      input.requestLock();
    } else if (this.state === 'dead') {
      this.restartLevel();
      input.requestLock();
    } else if (this.state === 'levelComplete') {
      this.nextLevel();
      if (this.state === 'playing') input.requestLock();
    } else if (this.state === 'victory') {
      this.newGame();
      input.requestLock();
    }
  }

  handleMenuInput() {
    const input = this.input;
    const confirm = input.wasPressed('use') || input.wasPressed('fire');
    if (this.state === 'paused') {
      if (input.wasPressed('pause') || confirm) this.resume();
      else if (input.wasPressed('restart')) this.restartLevel();
      return;
    }
    if (confirm || (this.state === 'dead' && input.wasPressed('restart'))) this.confirm();
  }

  update(dt) {
    this.time += dt;
    const input = this.input;

    if (input.wasPressed('music')) {
      this.audio.init();
      this.audio.setMusic(!this.audio.musicOn);
      this.setMessage(this.audio.musicOn ? 'MUSIC ON' : 'MUSIC OFF');
    }

    if (this.state !== 'playing') {
      this.handleMenuInput();
      if (this.state === 'title') {
        // slow attract-mode pan across the first room
        this.player.angle += dt * 0.12;
        for (const a of this.actors) if (a.kind === 'prop') a.update(dt);
      }
      this.messageTime -= dt;
      this.painFlash = Math.max(0, this.painFlash - dt * 1.6);
      if (this.state === 'dead') {
        // camera sinks to the floor
        this.camera.pitch = Math.min(this.camera.pitch + dt * 60, 42);
        for (const a of this.actors) a.update(dt);
        this.actors = this.actors.filter((a) => !a.remove);
      }
      this.syncCamera(false);
      return;
    }

    if (input.wasPressed('pause')) {
      this.state = 'paused';
      this.input.exitLock();
      return;
    }
    if (input.wasPressed('restart')) {
      this.restartLevel();
      return;
    }
    if (input.wasPressed('map')) this.showMap = !this.showMap;

    input.takeWheel();

    // look
    const p = this.player;
    p.angle += input.takeMouseDX() + input.turnKeys * 2.6 * dt;
    p.angle = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    if (input.wasPressed('use')) this.useAction();

    this.movePlayer(dt);

    // lashing out
    if (input.isDown('fire') && !this.crush && this.crushCooldown <= 0 && p.alive) this.strike();

    this.updateDoors(dt);
    this.updateCrush(dt);

    for (const a of this.actors) a.update(dt);
    this.actors = this.actors.filter((a) => !a.remove);

    this.revealTimer -= dt;
    if (this.revealTimer <= 0) {
      this.revealTimer = 0.25;
      this.reveal();
    }

    this.stats.time += dt;
    this.messageTime -= dt;
    this.painFlash = Math.max(0, this.painFlash - dt * 1.5);
    this.pickupFlash = Math.max(0, this.pickupFlash - dt * 1.8);
    this.lightBoost = Math.max(0, this.lightBoost - dt * 90);
    this.recoil = Math.max(0, this.recoil - dt * 26);
    this.shake = Math.max(0, this.shake - dt * 3.4);
    this.syncCamera(true);
  }

  syncCamera(bob) {
    const p = this.player;
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.camera.angle = p.angle;
    if (bob) {
      const bobAmount = Math.sin(p.bob * 2.4) * 1.7;
      const shake = this.shake > 0 ? (Math.random() * 2 - 1) * this.shake * 3 : 0;
      this.camera.pitch = bobAmount + this.recoil + shake;
    }
  }

  buildSprites() {
    const list = this.spriteList;
    list.length = 0;
    for (const a of this.actors) {
      const info = a.spriteInfo();
      if (info && info.frame) list.push(info);
    }
    return list;
  }

  render() {
    const r = this.renderer;
    const ctx = r.vctx;
    const w = r.w;
    const h = r.h;

    r.renderWorld(this.level, this.camera, this.buildSprites(), this.lightBoost);

    if (this.state === 'playing' || this.state === 'paused') this.drawLimbs(ctx, w, h);

    this.hud.draw(ctx, w, h, this);

    if (this.state === 'title') this.hud.title(ctx, w, h, this);
    else if (this.state === 'paused') this.hud.paused(ctx, w, h);
    else if (this.state === 'dead') this.hud.gameOver(ctx, w, h, this);
    else if (this.state === 'levelComplete') this.hud.levelComplete(ctx, w, h, this);
    else if (this.state === 'victory') this.hud.victory(ctx, w, h, this);

    r.present();
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.input.requestLock();
    }
  }
}
