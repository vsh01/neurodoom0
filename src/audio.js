// All sound is synthesised with the Web Audio API - no audio files to ship.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noise = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.musicTimer = null;
    this.step = 0;
    this.nextNoteTime = 0;
    this.bpm = 148;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.22 : 0;
    this.musicGain.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 1.2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get time() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // --- primitives --------------------------------------------------------
  burst({ dur = 0.2, type = 'lowpass', f0 = 2000, f1 = 200, q = 1, gain = 0.6, delay = 0 }) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tone({ type = 'square', f0 = 300, f1 = 80, dur = 0.2, gain = 0.3, delay = 0, detune = 0 }) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // --- game sounds -------------------------------------------------------
  play(name, opt = {}) {
    if (!this.ctx) return;
    const v = opt.volume === undefined ? 1 : opt.volume;
    switch (name) {
      case 'pistol':
        this.burst({ dur: 0.16, f0: 4200, f1: 320, gain: 0.5 * v });
        this.tone({ type: 'square', f0: 420, f1: 60, dur: 0.09, gain: 0.22 * v });
        break;
      case 'chaingun':
        this.burst({ dur: 0.1, f0: 3600, f1: 400, gain: 0.4 * v });
        this.tone({ type: 'sawtooth', f0: 300, f1: 70, dur: 0.06, gain: 0.16 * v });
        break;
      case 'shotgun':
        this.burst({ dur: 0.38, f0: 3000, f1: 120, gain: 0.75 * v });
        this.tone({ type: 'sawtooth', f0: 180, f1: 34, dur: 0.3, gain: 0.3 * v });
        this.burst({ dur: 0.1, f0: 900, f1: 300, gain: 0.2 * v, delay: 0.42 });
        break;
      case 'impact':
        this.burst({ dur: 0.08, f0: 2600, f1: 800, gain: 0.22 * v });
        break;
      case 'flesh':
        this.burst({ dur: 0.14, type: 'bandpass', f0: 700, f1: 180, q: 2, gain: 0.4 * v });
        break;
      case 'enemyPain':
        this.tone({ type: 'sawtooth', f0: 260 + Math.random() * 60, f1: 110, dur: 0.22, gain: 0.28 * v });
        this.burst({ dur: 0.2, type: 'bandpass', f0: 900, f1: 300, q: 1.5, gain: 0.25 * v });
        break;
      case 'enemyDie':
        this.tone({ type: 'sawtooth', f0: 220, f1: 46, dur: 0.65, gain: 0.34 * v });
        this.burst({ dur: 0.6, type: 'lowpass', f0: 1400, f1: 120, gain: 0.34 * v });
        break;
      case 'sight':
        this.tone({ type: 'sawtooth', f0: 140, f1: 300, dur: 0.34, gain: 0.3 * v });
        this.tone({ type: 'square', f0: 90, f1: 190, dur: 0.36, gain: 0.16 * v, detune: 20 });
        break;
      case 'lash':
        this.burst({ dur: 0.22, type: 'bandpass', f0: 2600, f1: 500, q: 1.6, gain: 0.28 * v });
        this.tone({ type: 'sine', f0: 520, f1: 140, dur: 0.2, gain: 0.12 * v });
        break;
      case 'crush':
        this.burst({ dur: 0.34, type: 'lowpass', f0: 1400, f1: 90, gain: 0.7 * v });
        this.burst({ dur: 0.22, type: 'bandpass', f0: 620, f1: 180, q: 2.4, gain: 0.5 * v, delay: 0.04 });
        this.tone({ type: 'sine', f0: 130, f1: 34, dur: 0.32, gain: 0.4 * v });
        break;
      case 'melee':
        this.burst({ dur: 0.18, type: 'bandpass', f0: 500, f1: 120, q: 2, gain: 0.5 * v });
        break;
      case 'playerPain':
        this.tone({ type: 'square', f0: 340, f1: 120, dur: 0.26, gain: 0.3 * v });
        this.burst({ dur: 0.22, type: 'bandpass', f0: 800, f1: 200, q: 1.2, gain: 0.3 * v });
        break;
      case 'playerDie':
        this.tone({ type: 'sawtooth', f0: 300, f1: 40, dur: 1.4, gain: 0.4 * v });
        this.burst({ dur: 1.2, f0: 1200, f1: 80, gain: 0.35 * v });
        break;
      case 'fireball':
        this.burst({ dur: 0.4, type: 'bandpass', f0: 1800, f1: 500, q: 3, gain: 0.3 * v });
        this.tone({ type: 'sawtooth', f0: 700, f1: 200, dur: 0.35, gain: 0.16 * v });
        break;
      case 'explosion':
        this.burst({ dur: 0.9, f0: 1800, f1: 60, gain: 0.85 * v });
        this.tone({ type: 'sine', f0: 160, f1: 28, dur: 0.8, gain: 0.5 * v });
        break;
      case 'pickup':
        this.tone({ type: 'square', f0: NOTE(76), f1: NOTE(76), dur: 0.07, gain: 0.2 * v });
        this.tone({ type: 'square', f0: NOTE(83), f1: NOTE(83), dur: 0.1, gain: 0.2 * v, delay: 0.07 });
        break;
      case 'bigPickup':
        this.tone({ type: 'square', f0: NOTE(64), f1: NOTE(64), dur: 0.08, gain: 0.22 * v });
        this.tone({ type: 'square', f0: NOTE(71), f1: NOTE(71), dur: 0.08, gain: 0.22 * v, delay: 0.08 });
        this.tone({ type: 'square', f0: NOTE(76), f1: NOTE(76), dur: 0.18, gain: 0.24 * v, delay: 0.16 });
        break;
      case 'door':
        this.burst({ dur: 0.7, type: 'bandpass', f0: 260, f1: 900, q: 4, gain: 0.32 * v });
        break;
      case 'locked':
        this.tone({ type: 'square', f0: 150, f1: 90, dur: 0.16, gain: 0.24 * v });
        this.tone({ type: 'square', f0: 150, f1: 90, dur: 0.16, gain: 0.24 * v, delay: 0.18 });
        break;
      case 'noammo':
        this.tone({ type: 'square', f0: 200, f1: 150, dur: 0.06, gain: 0.16 * v });
        break;
      case 'switch':
        this.tone({ type: 'square', f0: 120, f1: 400, dur: 0.2, gain: 0.3 * v });
        this.burst({ dur: 0.3, type: 'bandpass', f0: 1200, f1: 400, q: 3, gain: 0.25 * v });
        break;
      case 'levelClear':
        [64, 68, 71, 76].forEach((n, i) => this.tone({
          type: 'square', f0: NOTE(n), f1: NOTE(n), dur: 0.22, gain: 0.24 * v, delay: i * 0.13,
        }));
        break;
      default:
        break;
    }
  }

  // --- music -------------------------------------------------------------
  // A short, driving 16-step loop: kick, hats and a chugging bass riff.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    const tick = () => {
      const spb = 60 / this.bpm / 4; // sixteenth notes
      while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
        this.scheduleStep(this.step, this.nextNoteTime, spb);
        this.nextNoteTime += spb;
        this.step = (this.step + 1) % 32;
      }
      this.musicTimer = setTimeout(tick, 40);
    };
    tick();
  }

  stopMusic() {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
    if (on) this.startMusic();
  }

  scheduleStep(step, t, spb) {
    const ctx = this.ctx;
    const riff = [28, 28, 35, 28, 31, 28, 34, 33, 28, 28, 35, 28, 31, 33, 34, 35];
    const n = riff[step % 16] + (step >= 16 ? 3 : 0);
    // bass
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = NOTE(n);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, t);
    filt.frequency.exponentialRampToValueAtTime(240, t + spb * 0.9);
    filt.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + spb * 0.95);
    osc.connect(filt).connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + spb);

    // kick on the quarter notes
    if (step % 4 === 0) {
      const k = ctx.createOscillator();
      k.type = 'sine';
      k.frequency.setValueAtTime(150, t);
      k.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      k.connect(kg).connect(this.musicGain);
      k.start(t);
      k.stop(t + 0.18);
    }
    // hat
    if (step % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 1.8;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.16, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(hp).connect(hg).connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.06);
    }
    // snare backbeat
    if (step % 8 === 4) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 0.8;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.4, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      src.connect(bp).connect(sg).connect(this.musicGain);
      src.start(t);
      src.stop(t + 0.2);
    }
  }
}
