// Keyboard + mouse-look + touch controls.

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'strafeLeft', KeyD: 'strafeRight',
  ArrowLeft: 'turnLeft', ArrowRight: 'turnRight',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'use', KeyE: 'use', KeyF: 'use', Enter: 'use',
  ControlLeft: 'fire', ControlRight: 'fire',
  Digit1: 'weapon1', Digit2: 'weapon2', Digit3: 'weapon3',
  Tab: 'map', KeyM: 'music', KeyP: 'pause', Escape: 'pause',
  KeyR: 'restart',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.presses = new Set();
    this.mouseDX = 0;
    this.wheel = 0;
    this.touchMove = { x: 0, y: 0 };
    this.pointerLocked = false;
    this.sensitivity = 0.0022;
    this.touchActive = false;
    this._bind();
  }

  _press(action) {
    if (!action) return;
    if (!this.down.has(action)) this.presses.add(action);
    this.down.add(action);
  }

  _release(action) {
    if (action) this.down.delete(action);
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (!e.repeat) this._press(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        this._release(a);
      }
    });
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) this.down.delete('fire');
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) this.mouseDX += e.movementX * this.sensitivity;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      e.preventDefault();
      if (e.button === 0) this._press('fire');
      if (e.button === 2) this._press('use');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._release('fire');
      if (e.button === 2) this._release('use');
    });
    window.addEventListener('contextmenu', (e) => {
      if (this.pointerLocked) e.preventDefault();
    });
    window.addEventListener('wheel', (e) => {
      if (this.pointerLocked) {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      }
    }, { passive: false });

    this._bindTouch();
  }

  _bindTouch() {
    const stick = { id: null, ox: 0, oy: 0 };
    const look = { id: null, x: 0, moved: 0, t: 0 };

    const onStart = (e) => {
      this.touchActive = true;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.42) {
          if (stick.id === null) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; }
        } else if (look.id === null) {
          look.id = t.identifier;
          look.x = t.clientX;
          look.moved = 0;
          look.t = performance.now();
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) {
          const dx = (t.clientX - stick.ox) / 60;
          const dy = (t.clientY - stick.oy) / 60;
          this.touchMove.x = Math.max(-1, Math.min(1, dx));
          this.touchMove.y = Math.max(-1, Math.min(1, -dy));
        } else if (t.identifier === look.id) {
          const dx = t.clientX - look.x;
          look.x = t.clientX;
          look.moved += Math.abs(dx);
          this.mouseDX += dx * 0.005;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) {
          stick.id = null;
          this.touchMove.x = 0;
          this.touchMove.y = 0;
        } else if (t.identifier === look.id) {
          // A quick tap that did not drag counts as a trigger pull.
          if (look.moved < 14 && performance.now() - look.t < 260) {
            this._press('fire');
            setTimeout(() => this._release('fire'), 60);
          }
          look.id = null;
        }
      }
    };

    const c = this.canvas;
    c.addEventListener('touchstart', onStart, { passive: true });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onEnd, { passive: true });
    c.addEventListener('touchcancel', onEnd, { passive: true });

    for (const [id, action] of [['btn-fire', 'fire'], ['btn-use', 'use'], ['btn-weapon', 'nextWeapon']]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchActive = true; this._press(action); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this._release(action); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); this._press(action); });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); this._release(action); });
    }
  }

  requestLock() {
    if (!this.pointerLocked && this.canvas.requestPointerLock) {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  exitLock() {
    if (this.pointerLocked && document.exitPointerLock) document.exitPointerLock();
  }

  isDown(a) { return this.down.has(a); }
  wasPressed(a) { return this.presses.has(a); }

  // Movement axes combining keyboard and the touch stick.
  get moveForward() {
    let v = 0;
    if (this.isDown('forward')) v += 1;
    if (this.isDown('back')) v -= 1;
    return Math.max(-1, Math.min(1, v + this.touchMove.y));
  }

  get moveStrafe() {
    let v = 0;
    if (this.isDown('strafeRight')) v += 1;
    if (this.isDown('strafeLeft')) v -= 1;
    return Math.max(-1, Math.min(1, v + this.touchMove.x));
  }

  get turnKeys() {
    let v = 0;
    if (this.isDown('turnRight')) v += 1;
    if (this.isDown('turnLeft')) v -= 1;
    return v;
  }

  takeMouseDX() {
    const d = this.mouseDX;
    this.mouseDX = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.presses.clear();
  }
}
