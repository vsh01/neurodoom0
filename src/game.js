// Game rules: player, weapons, doors, pickups, combat and the frame loop.

import { clamp, randInt } from './util.js';
import { buildLevel, levelCount } from './levels.js';
import { T } from './textures.js';
import { Enemy, Item, Prop, Projectile, Effect } from './entities.js';
import { Hud } from './hud.js';
import { WEAPON_SINK } from './weapons.js';

const PLAYER_RADIUS = 0.26;
const WALK_SPEED = 3.05;
const RUN_SPEED = 5.35;
const AMMO_MAX = { bullets: 220, shells: 60 };
const BAR_H = 38;

export class Game {
  constructor({ renderer, art, audio, input, weapons }) {
    this.renderer = renderer;
    this.art = art;
    this.audio = audio;
    this.input = input;
    this.weapons = weapons;
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
      weapon: 0,
      hasWeapon: [true, false, false],
      ammo: { bullets: 50, shells: 0 },
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
    this.weaponAnim = null;
    this.fireCooldown = 0;
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
    p.ammo.bullets = Math.max(p.ammo.bullets, 50);
    if (p.hasWeapon[1]) p.ammo.shells = Math.max(p.ammo.shells, 8);
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
  fire() {
    const p = this.player;
    const w = this.weapons[p.weapon];
    if (p.ammo[w.ammo] < w.ammoUse) {
      this.audio.play('noammo');
      this.fireCooldown = 0.25;
      return;
    }
    p.ammo[w.ammo] -= w.ammoUse;
    this.fireCooldown = w.cooldown;
    this.weaponAnim = { seq: w.fireSeq, i: 0, t: w.fireSeq[0][1] };
    this.audio.play(w.sound);
    this.lightBoost = 7;
    this.recoil = w.id === 'shotgun' ? 5 : 3;
    this.shake = Math.max(this.shake, w.id === 'shotgun' ? 0.5 : 0.22);

    for (let i = 0; i < w.pellets; i++) {
      const spread = (Math.random() * 2 - 1) * w.spread;
      this.hitscan(p.angle + spread, w.range, w.damage[0], w.damage[1]);
    }
    this.alertEnemies(11);
  }

  hitscan(angle, range, dmgMin, dmgMax) {
    const p = this.player;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const wallDist = this.castRay(p.x, p.y, dx, dy, range);
    let best = null;
    let bestT = wallDist;
    for (const a of this.actors) {
      const isTarget = (a.kind === 'enemy' && a.alive) ||
        (a.kind === 'prop' && a.typeName === 'barrel' && a.alive);
      if (!isTarget) continue;
      const rx = a.x - p.x;
      const ry = a.y - p.y;
      const t = rx * dx + ry * dy;
      if (t <= 0.25 || t >= bestT) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < (a.radius || 0.32) + 0.12) { bestT = t; best = a; }
    }
    const hx = p.x + dx * bestT;
    const hy = p.y + dy * bestT;
    if (best) {
      const dmg = randInt(dmgMin, dmgMax);
      best.hurt(dmg);
      if (best.kind === 'enemy') {
        this.spawnEffect('blood', hx, hy, 0.24, 0.42, 0.55);
        this.audio.play('flesh', { volume: this.volumeAt(bestT) * 0.7 });
      }
    } else {
      this.spawnEffect('spark', hx - dx * 0.05, hy - dy * 0.05, 0.18, 0.3, 0.5);
      this.audio.play('impact', { volume: this.volumeAt(bestT) * 0.5 });
    }
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
    } else if (t.give === 'bullets' || t.give === 'shells') {
      const key = t.give;
      if (p.ammo[key] < AMMO_MAX[key]) {
        p.ammo[key] = Math.min(AMMO_MAX[key], p.ammo[key] + t.amount);
        took = true;
      }
    } else if (t.give === 'weapon') {
      const w = this.weapons[t.weapon];
      const ammoFull = p.ammo[w.ammo] >= AMMO_MAX[w.ammo];
      if (!p.hasWeapon[t.weapon]) {
        p.hasWeapon[t.weapon] = true;
        p.weapon = t.weapon;
        this.weaponAnim = null;
        took = true;
      } else if (!ammoFull) {
        took = true;
      }
      if (took) p.ammo[w.ammo] = Math.min(AMMO_MAX[w.ammo], p.ammo[w.ammo] + t.amount);
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

    // weapon selection
    for (let i = 0; i < 3; i++) {
      if (input.wasPressed(`weapon${i + 1}`) && this.player.hasWeapon[i]) {
        this.player.weapon = i;
        this.weaponAnim = null;
      }
    }
    const wheel = input.takeWheel();
    if (wheel || input.wasPressed('nextWeapon')) {
      const dir = wheel > 0 ? -1 : 1;
      for (let n = 1; n <= 3; n++) {
        const idx = (this.player.weapon + dir * n + 3) % 3;
        if (this.player.hasWeapon[idx]) { this.player.weapon = idx; this.weaponAnim = null; break; }
      }
    }

    // look
    const p = this.player;
    p.angle += input.takeMouseDX() + input.turnKeys * 2.6 * dt;
    p.angle = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    if (input.wasPressed('use')) this.useAction();

    this.movePlayer(dt);

    // shooting
    this.fireCooldown -= dt;
    const weapon = this.weapons[p.weapon];
    const wantFire = weapon.auto ? input.isDown('fire') : input.wasPressed('fire');
    if (wantFire && this.fireCooldown <= 0 && p.alive) this.fire();

    if (this.weaponAnim) {
      const anim = this.weaponAnim;
      anim.t -= dt;
      while (anim.t <= 0 && anim.i < anim.seq.length - 1) {
        anim.i++;
        anim.t += anim.seq[anim.i][1];
        if (anim.seq[anim.i][1] === 0) { this.weaponAnim = null; break; }
      }
    }

    this.updateDoors(dt);

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

    // weapon
    if (this.state === 'playing' || this.state === 'paused') {
      const p = this.player;
      const weapon = this.weapons[p.weapon];
      const frameIdx = this.weaponAnim ? this.weaponAnim.seq[this.weaponAnim.i][0] : 0;
      const img = weapon.frames[frameIdx] || weapon.frames[0];
      const bobX = Math.sin(p.bob * 1.2) * 7;
      const bobY = Math.abs(Math.cos(p.bob * 2.4)) * 5;
      const x = Math.round(w / 2 - img.width / 2 + bobX);
      const y = Math.round(h - BAR_H - img.height + WEAPON_SINK + bobY + this.recoil * 0.8);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y);
    }

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
