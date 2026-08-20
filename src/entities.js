// Actors: monsters, pickups, props, projectiles and short-lived effects.
// Every actor exposes `update(dt)` and `spriteInfo()` for the renderer.

import { rand, randInt, clamp, TAU } from './util.js';

export const ENEMY_TYPES = {
  zombie: {
    name: 'FORMER HUMAN', hp: 30, speed: 1.5, radius: 0.3, spriteHeight: 1.0,
    attack: 'hitscan', damage: [3, 9], range: 16, cooldown: 1.25, windup: 0.32,
    painChance: 0.72, painTime: 0.34, score: 100,
  },
  imp: {
    name: 'HELLSPAWN', hp: 60, speed: 1.95, radius: 0.32, spriteHeight: 1.12,
    attack: 'fireball', damage: [9, 17], range: 18, cooldown: 1.7, windup: 0.44,
    painChance: 0.5, painTime: 0.3, score: 200,
  },
  demon: {
    name: 'DEMON', hp: 110, speed: 3.3, radius: 0.42, spriteHeight: 0.95,
    attack: 'melee', damage: [8, 17], range: 1.6, cooldown: 0.85, windup: 0.3,
    painChance: 0.3, painTime: 0.26, score: 300,
  },
};

export const ITEM_TYPES = {
  medkit: { sprite: 'medkit', height: 0.36, give: 'health', amount: 25, msg: 'PICKED UP A MEDIKIT' },
  stimpack: { sprite: 'stimpack', height: 0.3, give: 'health', amount: 10, msg: 'PICKED UP A STIMPACK' },
  armor: { sprite: 'armor', height: 0.4, give: 'armor', amount: 50, msg: 'PICKED UP ARMOUR' },
  clip: { sprite: 'clip', height: 0.24, give: 'bullets', amount: 15, msg: 'PICKED UP A CLIP' },
  shells: { sprite: 'shells', height: 0.26, give: 'shells', amount: 8, msg: 'PICKED UP SHELLS' },
  shotgun: { sprite: 'shotgun', height: 0.28, give: 'weapon', weapon: 1, amount: 8, msg: 'YOU GOT THE SHOTGUN!', big: true },
  chaingun: { sprite: 'chaingun', height: 0.3, give: 'weapon', weapon: 2, amount: 30, msg: 'YOU GOT THE CHAINGUN!', big: true },
  redkey: { sprite: 'redkey', height: 0.32, give: 'key', msg: 'PICKED UP A RED KEYCARD', big: true },
};

let nextId = 1;

class Actor {
  constructor(game, x, y) {
    this.id = nextId++;
    this.game = game;
    this.x = x;
    this.y = y;
    this.remove = false;
  }
}

export class Enemy extends Actor {
  constructor(game, typeName, x, y) {
    super(game, x, y);
    this.kind = 'enemy';
    this.typeName = typeName;
    this.type = ENEMY_TYPES[typeName];
    this.hp = this.type.hp;
    this.state = 'idle';
    this.timer = 0;
    this.cooldown = rand(0, 0.6);
    this.anim = rand(0, 4);
    this.deathTimer = 0;
    this.radius = this.type.radius;
    this.strafe = 0;
    this.strafeTimer = 0;
  }

  get alive() { return this.state !== 'dead'; }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.state === 'dead') {
      this.deathTimer += dt;
      return;
    }

    this.cooldown -= dt;
    const sees = dist < 24 && g.canSee(this.x, this.y, p.x, p.y);

    if (this.state === 'idle') {
      if (sees && p.alive) {
        this.state = 'chase';
        g.audio.play('sight', { volume: g.volumeAt(dist) });
      }
      return;
    }

    if (this.state === 'pain') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'chase';
      return;
    }

    if (this.state === 'attack') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.performAttack(dist, sees);
        this.state = 'chase';
        this.cooldown = this.type.cooldown * rand(0.85, 1.2);
      }
      return;
    }

    // chase
    if (!p.alive) return;
    if (sees && this.cooldown <= 0 && dist <= this.type.range) {
      this.state = 'attack';
      this.timer = this.type.windup;
      return;
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(0.5, 1.6);
      this.strafe = rand(-0.55, 0.55);
    }
    const target = Math.atan2(dy, dx) + this.strafe;
    const speed = this.type.speed * (sees ? 1 : 0.7);
    const step = speed * dt;
    const keepAway = this.type.attack === 'melee' ? 0.9 : 2.2;
    if (dist > keepAway) {
      this.moveWithSlide(Math.cos(target) * step, Math.sin(target) * step);
    }
    this.anim += dt * speed * 1.6;
  }

  moveWithSlide(dx, dy) {
    const g = this.game;
    const r = this.radius;
    if (!g.blocked(this.x + dx + Math.sign(dx) * r, this.y, this)) this.x += dx;
    else g.tryEnemyDoor(this.x + Math.sign(dx) * (r + 0.6), this.y);
    if (!g.blocked(this.x, this.y + dy + Math.sign(dy) * r, this)) this.y += dy;
    else g.tryEnemyDoor(this.x, this.y + Math.sign(dy) * (r + 0.6));
  }

  performAttack(dist, sees) {
    const g = this.game;
    const p = g.player;
    if (!p.alive || !sees) return;
    const t = this.type;
    if (t.attack === 'melee') {
      if (dist <= t.range) {
        g.audio.play('melee', { volume: g.volumeAt(dist) });
        g.hurtPlayer(randInt(t.damage[0], t.damage[1]));
      }
    } else if (t.attack === 'hitscan') {
      g.audio.play('pistol', { volume: g.volumeAt(dist) * 0.8 });
      const accuracy = clamp(1 - dist / 26, 0.25, 0.8);
      if (Math.random() < accuracy) {
        g.hurtPlayer(randInt(t.damage[0], t.damage[1]));
      } else {
        g.spawnEffect('spark', p.x + rand(-0.4, 0.4), p.y + rand(-0.4, 0.4), 0.6);
      }
    } else if (t.attack === 'fireball') {
      const a = Math.atan2(p.y - this.y, p.x - this.x) + rand(-0.05, 0.05);
      g.spawnProjectile(this.x + Math.cos(a) * 0.5, this.y + Math.sin(a) * 0.5, a, this);
      g.audio.play('fireball', { volume: g.volumeAt(dist) });
    }
  }

  hurt(amount) {
    if (this.state === 'dead') return;
    this.hp -= amount;
    const g = this.game;
    const dist = Math.hypot(g.player.x - this.x, g.player.y - this.y);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathTimer = 0;
      g.audio.play('enemyDie', { volume: g.volumeAt(dist) });
      g.onEnemyKilled(this);
      return;
    }
    if (this.state === 'idle') this.state = 'chase';
    if (Math.random() < this.type.painChance) {
      this.state = 'pain';
      this.timer = this.type.painTime;
      g.audio.play('enemyPain', { volume: g.volumeAt(dist) });
    }
  }

  spriteInfo() {
    const set = this.game.art.enemies[this.typeName];
    let frame;
    if (this.state === 'dead') {
      const i = Math.min(set.die.length - 1, Math.floor(this.deathTimer / 0.11));
      frame = set.die[i];
    } else if (this.state === 'attack') {
      frame = set.attack[0];
    } else if (this.state === 'pain') {
      frame = set.pain[0];
    } else {
      frame = set.walk[Math.floor(this.anim) % set.walk.length];
    }
    const h = this.type.spriteHeight * (this.state === 'dead' ? 1 : 1);
    return {
      x: this.x, y: this.y, frame, base: 0, height: h, glow: false, lightBias: 0,
    };
  }
}

export class Item extends Actor {
  constructor(game, typeName, x, y) {
    super(game, x, y);
    this.kind = 'item';
    this.typeName = typeName;
    this.type = ITEM_TYPES[typeName];
    this.bob = rand(0, TAU);
  }

  update(dt) {
    this.bob += dt * 2.4;
    const p = this.game.player;
    if (!p.alive) return;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 0.55) {
      this.game.tryPickup(this);
    }
  }

  spriteInfo() {
    const frame = this.game.art.items[this.type.sprite];
    const t = this.type;
    const floatY = t.give === 'key' ? 0.12 + Math.sin(this.bob) * 0.05 : 0.02;
    return {
      x: this.x, y: this.y, frame, base: floatY, height: t.height,
      glow: false, lightBias: t.big ? 4 : 2,
    };
  }
}

export class Prop extends Actor {
  constructor(game, typeName, x, y) {
    super(game, x, y);
    this.kind = 'prop';
    this.typeName = typeName;
    this.hp = typeName === 'barrel' ? 22 : 9999;
    this.radius = typeName === 'barrel' ? 0.34 : 0.24;
    this.solid = true;
    this.anim = rand(0, 3);
    this.fuse = -1;
  }

  get alive() { return this.hp > 0; }

  update(dt) {
    this.anim += dt * 9;
    if (this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) this.explode();
    }
  }

  hurt(amount) {
    if (this.typeName !== 'barrel' || this.hp <= 0 || this.fuse > 0) return;
    this.hp -= amount;
    if (this.hp <= 0) this.fuse = 0.05;
  }

  explode() {
    this.hp = 0;
    this.remove = true;
    this.game.explosion(this.x, this.y, 3.0, 75, this);
  }

  spriteInfo() {
    if (this.typeName === 'lamp') {
      const frames = this.game.art.props.lamp;
      return {
        x: this.x, y: this.y, frame: frames[Math.floor(this.anim) % frames.length],
        base: 0, height: 1.35, glow: true, lightBias: 0,
      };
    }
    return {
      x: this.x, y: this.y, frame: this.game.art.props.barrel,
      base: 0, height: 0.95, glow: false, lightBias: 2,
    };
  }
}

export class Projectile extends Actor {
  constructor(game, x, y, angle, owner) {
    super(game, x, y);
    this.kind = 'projectile';
    this.dx = Math.cos(angle) * 6.4;
    this.dy = Math.sin(angle) * 6.4;
    this.owner = owner;
    this.life = 6;
    this.anim = 0;
  }

  update(dt) {
    this.anim += dt * 14;
    this.life -= dt;
    if (this.life <= 0) { this.remove = true; return; }
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + (this.dx * dt) / steps;
      const ny = this.y + (this.dy * dt) / steps;
      const g = this.game;
      if (g.isWall(nx, ny)) { this.hit(null); return; }
      this.x = nx;
      this.y = ny;
      const p = g.player;
      if (p.alive && Math.hypot(p.x - this.x, p.y - this.y) < 0.42) { this.hit(p); return; }
      for (const e of g.actors) {
        if (e.kind === 'prop' && e.alive && e !== this.owner &&
            Math.hypot(e.x - this.x, e.y - this.y) < e.radius + 0.15) { this.hit(e); return; }
      }
    }
  }

  hit(target) {
    this.remove = true;
    const g = this.game;
    g.spawnEffect('explosion', this.x, this.y, 0.42, 1.3);
    g.audio.play('explosion', { volume: g.volumeAt(Math.hypot(g.player.x - this.x, g.player.y - this.y)) * 0.5 });
    if (target && target.kind === 'prop') target.hurt(40);
    const dmg = this.owner ? randInt(this.owner.type.damage[0], this.owner.type.damage[1]) : 12;
    if (Math.hypot(g.player.x - this.x, g.player.y - this.y) < 0.9) g.hurtPlayer(dmg);
  }

  spriteInfo() {
    const frames = this.game.art.fx.fireball;
    return {
      x: this.x, y: this.y, frame: frames[Math.floor(this.anim) % frames.length],
      base: 0.34, height: 0.32, glow: true, lightBias: 0,
    };
  }
}

export class Effect extends Actor {
  constructor(game, name, x, y, duration, size = 1, base = 0.4) {
    super(game, x, y);
    this.kind = 'effect';
    this.name = name;
    this.t = 0;
    this.duration = duration;
    this.size = size;
    this.base = base;
  }

  update(dt) {
    this.t += dt;
    if (this.t >= this.duration) this.remove = true;
  }

  spriteInfo() {
    const frames = this.game.art.fx[this.name];
    const i = Math.min(frames.length - 1, Math.floor((this.t / this.duration) * frames.length));
    return {
      x: this.x, y: this.y, frame: frames[i], base: this.base, height: this.size,
      glow: this.name === 'explosion', lightBias: 3,
    };
  }
}
