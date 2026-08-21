// Boot sequence: build the procedural art, wire the systems together and run
// the frame loop.

import { buildTextures } from './textures.js';
import { buildSprites } from './sprites.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';

const canvas = document.getElementById('screen');
const loading = document.getElementById('loading');
const touchUi = document.getElementById('touch-ui');

function setLoading(text) {
  if (loading) loading.textContent = text;
}

function fitCanvas(renderer) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  if (renderer) renderer.resize(w, h);
}

async function boot() {
  fitCanvas(null);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  setLoading('GENERATING TEXTURES...');
  await nextFrame();
  const textures = buildTextures();

  setLoading('SUMMONING MONSTERS...');
  await nextFrame();
  const art = buildSprites();

  setLoading('ENTERING HELL...');
  await nextFrame();

  const renderer = new Renderer(canvas, textures);
  const audio = new AudioEngine();
  const input = new Input(canvas);
  const game = new Game({ renderer, art, audio, input });
  fitCanvas(renderer);

  if (loading) loading.style.display = 'none';
  if (touchUi && matchMedia('(pointer: coarse)').matches) touchUi.classList.add('visible');

  window.addEventListener('resize', () => fitCanvas(renderer));
  window.addEventListener('orientationchange', () => setTimeout(() => fitCanvas(renderer), 200));

  canvas.addEventListener('click', () => {
    audio.init();
    audio.resume();
    if (audio.musicOn && game.state !== 'title') audio.startMusic();
    game.click();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') {
      game.state = 'paused';
      input.exitLock();
    }
  });

  // --- main loop ---
  let last = performance.now();
  let frameAcc = 0;
  let frameCount = 0;
  let qualityCheck = 0;
  const QUALITY_STEPS = [480, 400, 336, 280];
  let qualityIndex = 0;

  function loop(now) {
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, Math.max(0.0005, raw));

    game.update(dt);
    input.endFrame();
    game.render();

    // Adaptive resolution: drop the internal buffer if we cannot hold 60fps.
    frameAcc += raw;
    frameCount++;
    qualityCheck += raw;
    if (qualityCheck > 2.5) {
      const avg = frameAcc / frameCount;
      if (avg > 0.026 && qualityIndex < QUALITY_STEPS.length - 1) {
        qualityIndex++;
        renderer.setQuality(QUALITY_STEPS[qualityIndex]);
      } else if (avg < 0.0125 && qualityIndex > 0) {
        qualityIndex--;
        renderer.setQuality(QUALITY_STEPS[qualityIndex]);
      }
      qualityCheck = 0;
      frameAcc = 0;
      frameCount = 0;
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Expose for debugging from the console.
  window.NEURODOOM = { game, renderer, audio, input };
}

boot().catch((err) => {
  console.error(err);
  setLoading(`FAILED TO START: ${err && err.message ? err.message : err}`);
});
