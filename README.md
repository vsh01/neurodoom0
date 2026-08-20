# NEURODOOM

A DOOM-style raycasting first-person shooter that runs in a browser tab.
No engine, no framework, no build step, **no asset files at all** - every wall
texture, monster sprite, weapon, sound effect and the music are generated in
JavaScript when the page loads.

**Play it: https://vsh01.github.io/neurodoom0/**

![three levels, three weapons, no assets](https://img.shields.io/badge/levels-3-red)
![vanilla js](https://img.shields.io/badge/dependencies-0-brightgreen)

## Controls

| Action | Key |
| --- | --- |
| Move / strafe | `W` `A` `S` `D` |
| Turn | mouse, or `←` `→` |
| Fire | left mouse button, or `Ctrl` |
| Open doors, press switches | `E`, `Space` or right mouse button |
| Run | `Shift` |
| Weapons | `1` pistol, `2` shotgun, `3` chaingun, or mouse wheel |
| Automap | `Tab` |
| Pause | `P` or `Esc` |
| Restart the level | `R` |
| Music on/off | `M` |

On phones and tablets: drag on the left half of the screen to move, drag on the
right half to look, tap to shoot, and use the `FIRE` / `USE` / `WPN` buttons.

## The game

Three levels - *Hangar Zero*, *Toxin Refinery* and *Hell's Gate*. Each one is
locked behind a red keycard and ends at an exit switch you have to find and
press. Health, armour and ammo carry over between levels.

- **Three weapons.** Pistol, pump shotgun (8 pellets per shell) and a chaingun
  that fires 10 rounds a second.
- **Three monsters.** Former humans shoot back, hellspawn lob fireballs, and
  demons close the distance fast and bite. All of them wake on sight or gunfire,
  flinch when hurt, and open doors to reach you.
- **Explosive barrels** that chain-react and hurt whoever is standing nearby -
  including you.
- Sliding doors, keycards, an automap that fills in as you explore, a status bar
  with a face that gets more beaten up as you do, and a difficulty curve that
  ends with six demons in a blood-soaked arena.

## How it works

The renderer is a textured raycaster in the tradition of Wolfenstein 3D and
DOOM, writing 32-bit pixels straight into an `ImageData` buffer that is then
point-scaled to the display canvas.

| File | Responsibility |
| --- | --- |
| `src/renderer.js` | Floor/ceiling casting, DDA wall casting with sliding doors, z-buffered billboard sprites |
| `src/textures.js` | Procedural 64x64 wall and flat textures (brick, tech panels, blood, doors, hazard supports) |
| `src/sprites.js` | Procedural monster, pickup, prop and effect sprites drawn on an off-screen canvas |
| `src/weapons.js` | First-person weapon art and weapon stats |
| `src/entities.js` | Monster AI, pickups, barrels, projectiles, effects |
| `src/levels.js` | ASCII level maps compiled into typed arrays |
| `src/game.js` | Player, combat, doors, keys, scoring, frame update |
| `src/hud.js` | Status bar, messages, automap, menu screens |
| `src/audio.js` | Web Audio synthesis for every sound effect plus a 16-step music loop |
| `src/input.js` | Keyboard, pointer-lock mouse look, touch controls |

Some implementation notes:

- **Lighting without per-pixel maths.** Each texture is pre-shaded into 32
  brightness steps at boot, so the inner loops only do an array lookup. Muzzle
  flashes push the light level above 1:1 for an over-bright frame.
- **Doors are real geometry.** A door occupies the centre plane of its cell; the
  ray is advanced to that plane and passes through the part that has already
  slid open, which is what makes doors look recessed and open smoothly.
- **Adaptive resolution.** The internal framebuffer starts at 480px wide and
  steps down if the frame time slips, so slower devices trade pixels for 60fps.

## Running it locally

Any static file server works - the game is plain ES modules:

```bash
git clone https://github.com/vsh01/neurodoom0.git
cd neurodoom0
npx http-server -p 8080 -c-1 .     # then open http://localhost:8080
```

`node scripts/verify.mjs` parses every module and checks each level for holes in
the border, unreachable rooms, unreachable pickups, and locked doors with no
matching keycard. CI runs it before every deploy.

## Deployment

`.github/workflows/deploy.yml` verifies the game data and publishes the
repository root to GitHub Pages on every push. There is nothing to build.

## Legal

NEURODOOM contains no id Software code, art, audio or WAD data. It is an
original game inspired by DOOM; the name is a nod, not a claim. All code and
generated art here are MIT licensed - see [LICENSE](LICENSE).

---

## По-русски

NEURODOOM - шутер от первого лица в стиле DOOM, который работает прямо в
браузере. Ни одного файла с ресурсами: все текстуры, спрайты монстров, оружие,
звуки и музыка генерируются кодом при загрузке страницы.

Играть: **https://vsh01.github.io/neurodoom0/**

Управление: `WASD` - движение, мышь - обзор, левая кнопка - огонь, `E` или
пробел - открыть дверь / нажать рубильник, `Shift` - бег, `1` `2` `3` - оружие,
`Tab` - карта, `P` - пауза, `R` - перезапуск уровня, `M` - музыка.

Три уровня, три вида монстров, три ствола, взрывающиеся бочки, красная
ключ-карта и рубильник выхода на каждом уровне.
