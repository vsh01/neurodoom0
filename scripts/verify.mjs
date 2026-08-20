// Pre-deploy checks: every module must parse, and every level must be a sane,
// fully connected map whose exit and items can actually be reached.

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildLevel, levelCount } from '../src/levels.js';

let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures++; };

// --- syntax ---
for (const file of readdirSync('src').filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', `src/${file}`], { stdio: 'pipe' });
  } catch (err) {
    fail(`src/${file} does not parse\n${err.stderr}`);
  }
}
console.log('checked syntax of every module in src/');

// --- levels ---
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

for (let i = 0; i < levelCount(); i++) {
  const level = buildLevel(i);
  const { w, h, walls, doors, exits } = level;
  const label = `level ${i} (${level.name})`;

  for (let x = 0; x < w; x++) {
    if (!walls[x] || !walls[(h - 1) * w + x]) fail(`${label}: open top/bottom border at x=${x}`);
  }
  for (let y = 0; y < h; y++) {
    if (!walls[y * w] || !walls[y * w + w - 1]) fail(`${label}: open side border at y=${y}`);
  }

  const sx = Math.floor(level.start.x);
  const sy = Math.floor(level.start.y);
  if (walls[sy * w + sx]) fail(`${label}: player starts inside a wall`);

  // Flood fill from the start. `keys` decides whether locked doors count as
  // passable, which is how we tell "needs the keycard" from "unwinnable".
  const flood = (keys) => {
    const seen = new Uint8Array(w * h);
    const stack = [sy * w + sx];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % w;
      const cy = (c / w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen[n]) continue;
        const door = doors.get(n);
        if (walls[n] && !door) continue;
        if (door && door.locked && !keys) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    return seen;
  };
  const seen = flood(true);
  const seenWithoutKey = flood(false);

  let orphans = 0;
  for (let c = 0; c < w * h; c++) if (!walls[c] && !seen[c]) orphans++;
  if (orphans) fail(`${label}: ${orphans} floor cells are walled off from the start`);

  for (const t of level.things) {
    if (!seen[Math.floor(t.y) * w + Math.floor(t.x)]) {
      fail(`${label}: ${t.type} at ${t.x},${t.y} cannot be reached`);
    }
  }

  if (!exits.size) fail(`${label}: no exit switch`);
  for (const e of exits) {
    const ex = e % w;
    const ey = (e / w) | 0;
    const reachable = DIRS.some(([dx, dy]) => {
      const nx = ex + dx;
      const ny = ey + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && seen[ny * w + nx];
    });
    if (!reachable) fail(`${label}: the exit switch cannot be reached`);
  }

  const keys = level.things.filter((t) => t.type === 'redkey');
  const lockedDoors = [...doors.values()].filter((d) => d.locked).length;
  if (lockedDoors && !keys.length) fail(`${label}: has ${lockedDoors} locked door(s) but no red keycard`);
  for (const k of keys) {
    // A keycard locked behind the door it opens makes the level unwinnable.
    if (!seenWithoutKey[Math.floor(k.y) * w + Math.floor(k.x)]) {
      fail(`${label}: the red keycard at ${k.x},${k.y} sits behind a locked door`);
    }
  }

  console.log(`${label}: ${w}x${h}, ${level.things.length} things, ${doors.size} doors, ${exits.size} exit(s) - ok`);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
