// Maps are authored as ASCII grids and compiled into flat typed arrays.
//
//   #  wall (uses the level's default wall texture)   .  empty floor
//   b  brick     t  tech panel     x  bloodied wall    s  hazard support
//   |  door      R  red keycard door                   E  exit switch
//   @  player start
//   z  former human   i  hellspawn   d  demon
//   +  medkit   p  stimpack   A  armour
//   k  red keycard   o  barrel   L  floor lamp

import { T } from './textures.js';

const LEVEL_DEFS = [
  {
    name: 'HANGAR ZERO',
    wallTex: T.STONE,
    floorTex: T.F_CONCRETE,
    ceilTex: T.C_DARK,
    start: { x: 3.5, y: 3.5, angle: 0 },
    regions: [{ x0: 1, y0: 18, x1: 30, y1: 22, floor: T.F_METAL, ceil: T.C_LIGHT }],
    map: [
      '################################',
      '#..........#...................#',
      '#.......L..#.................+.#',
      '#..@.......#....z..............#',
      '#..........|........s..........#',
      '#..........#.......o......A....#',
      '#.p........#............z......#',
      '#........o.#................i..#',
      '#..........#...................#',
      '#####|##############.###########',
      '#..............#...............#',
      '#...........p..#.........o.....#',
      '#....i.........#..+........z...#',
      '#..............................#',
      '#.A............#......d........#',
      '#............L.#............k..#',
      '#..............#...............#',
      '############R###################',
      '#..............................#',
      '#.........s.........s..........#',
      '#.....+..................A.....#',
      '#...z...........d..........i...#',
      '#............o..............A..#',
      '############################E###',
    ],
  },
  {
    name: 'TOXIN REFINERY',
    wallTex: T.BRICK,
    floorTex: T.F_METAL,
    ceilTex: T.C_LIGHT,
    start: { x: 15.5, y: 21.5, angle: -Math.PI / 2 },
    regions: [{ x0: 18, y0: 14, x1: 30, y1: 22, floor: T.F_BLOOD, ceil: T.C_DARK }],
    map: [
      '################################',
      '#....t.......#..#....t........o#',
      '#............#..#........z.....#',
      '#..z......o..#..#..............#',
      '#............|..#....s....A....#',
      '#.....s......#..#..............#',
      '#........+...#..|..........k...#',
      '#............#..#....i.........#',
      '#...p........#..#.........o....#',
      '#............#..#..............#',
      '#####.########..#######|########',
      '#..............................#',
      '#....o.....i.........z....p....#',
      '#####|########..#######R########',
      '#............#..#..............#',
      '#....+.......#..#....d.........#',
      '#............#..#..........i...#',
      '#...i........#..R..............#',
      '#.......A....#..#....o.....A...#',
      '#............|..#..............#',
      '#.....s......#..#....z.........#',
      '#..........p.#..#..........A...#',
      '#....A.......#..#....d........+#',
      '############################E###',
    ],
  },
  {
    name: "HELL'S GATE",
    wallTex: T.BRICK,
    floorTex: T.F_CONCRETE,
    ceilTex: T.C_DARK,
    start: { x: 16.5, y: 22.5, angle: -Math.PI / 2 },
    regions: [
      { x0: 12, y0: 9, x1: 19, y1: 14, floor: T.F_BLOOD, ceil: T.C_DARK },
      { x0: 4, y0: 4, x1: 27, y1: 19, floor: T.F_BLOOD, ceil: T.C_DARK },
    ],
    map: [
      '################################',
      '#..o.......z..........i.......o#',
      '#..............................#',
      '#..#####.##############.#####..#',
      '#..#....s.........+....s....#..#',
      '#..#...........o............#..#',
      '#..#....d...........d.......#..#',
      '#..#.....A.............p....#..#',
      '#..#.......xxxxRxxxxx.......#..#',
      '#..#.......x........x.......#..#',
      '#.z#...i...x...A....x.......#i.#',
      '#..#.......x........x...d...#..#',
      '#..#.......x...+....x.......#..#',
      '#..#.......x........x..o....#..#',
      '#..#.......xxxxxExxxx.......#..#',
      '#..#....A...................#..#',
      '#..#.........d......i.......#..#',
      '#..#...o.......A........A...#..#',
      '#..#....i..........d....o...#..#',
      '#..#########.######.#########..#',
      '#..............................#',
      '#...k......d..........i....+...#',
      '#..............................#',
      '################################',
    ],
  },
];

const WALL_CHARS = {
  '#': 'default',
  b: T.BRICK,
  t: T.TECH,
  x: T.BLOOD,
  s: T.SUPPORT,
};

const THING_CHARS = {
  z: { kind: 'enemy', type: 'zombie' },
  i: { kind: 'enemy', type: 'imp' },
  d: { kind: 'enemy', type: 'demon' },
  '+': { kind: 'item', type: 'medkit' },
  p: { kind: 'item', type: 'stimpack' },
  A: { kind: 'item', type: 'armor' },
  k: { kind: 'item', type: 'redkey' },
  o: { kind: 'prop', type: 'barrel' },
  L: { kind: 'prop', type: 'lamp' },
};

export function levelCount() {
  return LEVEL_DEFS.length;
}

export function buildLevel(index) {
  const def = LEVEL_DEFS[index];
  const rows = def.map;
  const h = rows.length;
  const w = rows[0].length;
  const walls = new Int16Array(w * h);
  const floors = new Int16Array(w * h);
  const ceils = new Int16Array(w * h);
  const doors = new Map();
  const exits = new Set();
  const things = [];

  floors.fill(def.floorTex);
  ceils.fill(def.ceilTex);
  for (const rg of def.regions || []) {
    for (let y = rg.y0; y <= rg.y1; y++) {
      for (let x = rg.x0; x <= rg.x1; x++) {
        if (rg.floor) floors[y * w + x] = rg.floor;
        if (rg.ceil) ceils[y * w + x] = rg.ceil;
      }
    }
  }

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    if (row.length !== w) throw new Error(`level ${index} row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch in WALL_CHARS) {
        walls[i] = WALL_CHARS[ch] === 'default' ? def.wallTex : WALL_CHARS[ch];
      } else if (ch === 'E') {
        walls[i] = T.EXIT;
        exits.add(i);
      } else if (ch === '|' || ch === 'R') {
        walls[i] = ch === 'R' ? T.DOOR_RED : T.DOOR;
        doors.set(i, { open: 0, target: 0, hold: 0, locked: ch === 'R', x, y });
      } else if (ch === '@') {
        // start position comes from the def so the facing can be authored too
      } else if (ch in THING_CHARS) {
        const t = THING_CHARS[ch];
        things.push({ ...t, x: x + 0.5, y: y + 0.5 });
      }
    }
  }

  return {
    index,
    name: def.name,
    w,
    h,
    walls,
    floors,
    ceils,
    doors,
    exits,
    things,
    start: def.start,
    skyTex: def.ceilTex,
  };
}
