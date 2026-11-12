// Pioneer TV screensaver: a maze without end, walked by itself, in the
// manner of the old dungeon games (Ultima Underworld) and of Antichamber:
// parts of it in their own stones (walls, floors, ceilings) and their own
// light, from a torch's dark to broad day, and parts pale as paper, white
// walls drawn round in black with now and then a coloured one, fading to
// white in the distance instead of to black. Now and then a room (a hall of
// pillars, a garden under the stars, a ballroom, a treasury, a red room, a
// white one, a courtyard under the sky), some of them with their corners
// cut at 45 degrees. It starts somewhere new each time.
//
// The walker floats rather than walks: it glides from cell to cell, easing
// into the way and out of it, and turns on the spot, always a right angle
// (or two), eased too. Its walls are hung with pictures in frames, one kind
// only: Bilder's photos (Immich's, some 1600 at random each time), else the
// covers kept on the box (the daemon's /api/finds); fewer along the ways,
// more in the rooms; on the pale walls now and then a sign with a line on
// it. Often the walker stops at a wall, turns to it and looks a while:
// hud.look(items) is told what hangs there (saver.js shows it, sharp, and
// what it is, or the sign's line), hud.leave() when it floats on. And
// sometimes, come to a dead end and turning back, it finds the world behind
// it gone and another there instead (the cell it stands in kept as it was,
// so the change is never seen happen), with a breath of light.
//
// A raycaster on a small canvas (320 by 180, scaled up with its pixels
// kept square), twenty frames a second: the walls one column at a time
// (a cut corner's diagonal met within its tile), the floor and ceiling a
// row at a time, the pictures over the walls. The maze comes in chunks of
// 8 by 8 cells, each a perfect maze of its own (a seeded backtracker) with
// a few doors to the chunks west and north of it, so the whole is one
// maze, made as it is walked into and forgotten behind. The stone textures
// are Screaming Brain Studios' Tiny Texture Pack (CC0), made small
// (maze/textures.png); the pale ones are drawn here.
//
//   M.maze(canvas, hud) -> { start, stop, visit, swap, debug }   (visit, swap, debug: the catalogue's, tests')
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const W = 320, H = 180;                // the picture, in pixels
  const FPS = 20;
  const TEX = 64;                        // a texture's side
  const SHADES = 24;                     // steps of darkness (or of white, far off in the pale parts)
  const CHUNK = 8, SIDE = CHUNK * 2;     // cells, tiles to a chunk
  const FOV = 0.7;                       // the camera plane's half width
  // Floating: an unhurried glide, eased in and out; a turn of a right
  // angle in about a second, eased too.
  const SPEED = 0.95;                    // tiles a second, at most
  const EASE = 0.7;                      // tiles to come up to speed, and to slow
  const TURN_S = 1.15;                   // seconds a right angle takes

  // The textures: the stones (maze/textures.png, one under the other),
  // then the pale ones drawn here (paleTextures).
  const T = {
    stone: 0, moss: 1, dirt: 2, sand: 3, flags: 4, blocks: 5, door: 6, slate: 7, brick: 8,
    tiles: 9, planks: 10, marble: 11, grass: 12, hedge: 13, sky: 14, beams: 15,
    white: 16, paper: 17, red: 18, blue: 19, yellow: 20, black: 21, day: 22,
  };
  const STONES = 16;                     // those in textures.png
  // Parts of the maze, each in its own stones and its own light (how far
  // one sees: 1 a torch's, 4 and more a bright day): walls (one of these
  // per wall), its floor and its ceiling. A zone is 5 by 5 cells. The pale
  // ones are Antichamber's: white, drawn round in black, a colour here and
  // there.
  const THEMES = [
    { walls: [T.stone, T.brick], floor: T.flags, ceil: T.blocks, light: 1.0 },
    { walls: [T.moss, T.dirt], floor: T.flags, ceil: T.beams, light: 1.5 },
    { walls: [T.sand], floor: T.planks, ceil: T.beams, light: 2.8 },
    { walls: [T.slate, T.brick], floor: T.tiles, ceil: T.blocks, light: 1.2 },
    { walls: [T.dirt, T.stone], floor: T.planks, ceil: T.blocks, light: 1.0 },
    { walls: [T.brick], floor: T.marble, ceil: T.beams, light: 2.2 },
    { walls: [T.stone, T.moss], floor: T.dirt, ceil: T.day, light: 3.6 },
    { walls: [T.planks], floor: T.planks, ceil: T.beams, light: 2.0 },
    { walls: [T.marble, T.sand], floor: T.tiles, ceil: T.day, light: 4.2 },
    { walls: [T.slate], floor: T.flags, ceil: T.slate, light: 1.4 },
    { walls: [T.white], floor: T.paper, ceil: T.paper, light: 4.5, pale: true },
    { walls: [T.white, T.white, T.white, T.blue], floor: T.paper, ceil: T.paper, light: 4.5, pale: true },
    { walls: [T.white, T.white, T.yellow], floor: T.paper, ceil: T.paper, light: 4.5, pale: true },
    { walls: [T.black, T.white], floor: T.paper, ceil: T.black, light: 3.6, pale: true },
  ];
  // Rooms that turn up now and then, a chunk's open middle: a hall of
  // pillars, a garden under the stars with hedges round it, a ballroom
  // floored in marble, a treasury, a long gallery of great pictures, a crypt
  // of pillars in slate, a library in wood, a cellar of earth; Antichamber's
  // red room, a white hall of black pillars, a courtyard under the day's
  // sky. Each its walls, floor, ceiling and light; some with pillars; some
  // with their corners cut at 45 degrees, now and then (CUT).
  const ROOMS = ['hall', 'garden', 'ballroom', 'treasury', 'gallery', 'crypt', 'library', 'cellar', 'red', 'white', 'courtyard'];
  const ROOM_WALL = { garden: T.hedge, ballroom: T.sand, hall: T.stone, treasury: T.brick, gallery: T.brick, crypt: T.slate, library: T.planks, cellar: T.dirt, red: T.red, white: T.white, courtyard: T.stone };
  const ROOM_FLOOR = { garden: T.grass, ballroom: T.marble, hall: T.flags, treasury: T.tiles, gallery: T.marble, crypt: T.flags, library: T.planks, cellar: T.dirt, red: T.paper, white: T.paper, courtyard: T.grass };
  const ROOM_CEIL = { garden: T.sky, ballroom: T.beams, hall: T.blocks, treasury: T.blocks, gallery: T.beams, crypt: T.blocks, library: T.beams, cellar: T.beams, red: T.paper, white: T.paper, courtyard: T.day };
  const ROOM_LIGHT = { garden: 1.3, ballroom: 2.8, hall: 1.6, treasury: 2.0, gallery: 3.0, crypt: 0.9, library: 1.8, cellar: 1.0, red: 4.5, white: 5, courtyard: 4.5 };
  const PILLARS = { hall: T.stone, crypt: T.slate, white: T.black };
  const CUT = new Set(['hall', 'ballroom', 'treasury', 'red', 'white', 'courtyard', 'library']);
  const PALE_ROOMS = new Set(['red', 'white']);
  // The pale textures fade to white with distance (the stones to black).
  const paleTex = (t) => t >= STONES;

  // ------------------------------------------------------------ chance
  // A number from a few others, the same every time (in this world: a
  // dead end's change makes another, epoch).
  function hash(a, b, c = 0) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  let epoch = 0;
  const wh = (a, b, c) => hash(a, b, c + epoch * 1000);
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }
  const themeOf = (ci, cj) => THEMES[Math.floor(wh(Math.floor(ci / 5), Math.floor(cj / 5), 3) * THEMES.length)];

  // ------------------------------------------------------------ the maze
  // A chunk: per tile its wall (0 open, else a texture + 1), its diagonal
  // (a cut corner: its way, '/' 1 or '\' 2, times 32, plus its texture +
  // 1), its floor and its ceiling; its room, if it has one, and the cells
  // cut off by its corners. Its west column and north row are its borders.
  const chunks = new Map();
  const keyOf = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
  let lastKey = NaN, lastChunk = null;
  // Tiles kept as they were through a change of world (the dead end one
  // stands in): tile key -> { wall, floor, ceil }.
  let kept = new Map();
  // And the cell one comes to through the way back, never a cut corner.
  let uncut = null;                      // [ci, cj] or null
  const tileKey = (tx, ty) => `${tx},${ty}`;
  function chunk(cx, cy) {
    const k = keyOf(cx, cy);
    if (k === lastKey) return lastChunk;
    let c = chunks.get(k);
    if (!c) { c = make(cx, cy); chunks.set(k, c); if (chunks.size > 64) forget(); }
    lastKey = k; lastChunk = c;
    return c;
  }
  function make(cx, cy) {
    const wall = new Uint8Array(SIDE * SIDE), diag = new Uint8Array(SIDE * SIDE);
    const floor = new Uint8Array(SIDE * SIDE), ceil = new Uint8Array(SIDE * SIDE);
    const cut = new Set();
    const rand = rng(Math.floor(wh(cx, cy, 2) * 4294967295));
    // Every tile in its zone's stones.
    for (let ly = 0; ly < SIDE; ly++) {
      for (let lx = 0; lx < SIDE; lx++) {
        const tx = cx * SIDE + lx, ty = cy * SIDE + ly;
        const th = themeOf(Math.floor(tx / 2), Math.floor(ty / 2));
        const i = ly * SIDE + lx;
        wall[i] = 1 + th.walls[Math.floor(wh(tx, ty, 4) * th.walls.length)];
        floor[i] = th.floor; ceil[i] = th.ceil;
      }
    }
    // A perfect maze over its cells (tiles 1, 3 .. 15).
    const seen = new Uint8Array(CHUNK * CHUNK);
    const start = [Math.floor(rand() * CHUNK), Math.floor(rand() * CHUNK)];
    const stack = [start];
    seen[start[1] * CHUNK + start[0]] = 1;
    wall[(start[1] * 2 + 1) * SIDE + start[0] * 2 + 1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const next = DIRS.filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < CHUNK && ny < CHUNK && !seen[ny * CHUNK + nx];
      });
      if (!next.length) { stack.pop(); continue; }
      const [dx, dy] = next[Math.floor(rand() * next.length)];
      const nx = x + dx, ny = y + dy;
      seen[ny * CHUNK + nx] = 1;
      wall[(ny * 2 + 1) * SIDE + nx * 2 + 1] = 0;
      wall[(y * 2 + 1 + dy) * SIDE + x * 2 + 1 + dx] = 0;
      stack.push([nx, ny]);
    }
    // A few walls knocked through, so there are loops and not only dead ends.
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(rand() * (SIDE - 2)), y = 1 + Math.floor(rand() * (SIDE - 2));
      if ((x + y) % 2 === 1) wall[y * SIDE + x] = 0;
    }
    // Now and then a room in the middle, its walls inside taken away.
    let room = null;
    if (!(cx === 0 && cy === 0) && wh(cx, cy, 6) < 0.45) {
      const kind = ROOMS[Math.floor(wh(cx, cy, 7) * ROOMS.length)];
      // A gallery long, the rest 3 or 4 cells a side.
      const w = kind === 'gallery' ? 5 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 2);
      const h = kind === 'gallery' ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 2);
      const x0 = 1 + Math.floor(rand() * (CHUNK - w - 1)), y0 = 1 + Math.floor(rand() * (CHUNK - h - 1));
      room = { kind, x0: cx * CHUNK + x0, y0: cy * CHUNK + y0, x1: cx * CHUNK + x0 + w - 1, y1: cy * CHUNK + y0 + h - 1 };
      // Its tiles, and the ring of wall round it.
      for (let ly = y0 * 2; ly <= (y0 + h - 1) * 2 + 2; ly++) {
        for (let lx = x0 * 2; lx <= (x0 + w - 1) * 2 + 2; lx++) {
          const i = ly * SIDE + lx;
          const inside = lx > x0 * 2 && ly > y0 * 2 && lx < (x0 + w - 1) * 2 + 2 && ly < (y0 + h - 1) * 2 + 2;
          if (inside) {
            const pillar = lx % 2 === 0 && ly % 2 === 0;
            wall[i] = PILLARS[kind] != null && pillar ? 1 + PILLARS[kind] : 0;
          } else if (wall[i]) {
            wall[i] = 1 + ROOM_WALL[kind];
          }
          floor[i] = ROOM_FLOOR[kind];
          ceil[i] = ROOM_CEIL[kind];
        }
      }
      // Its corners cut at 45 degrees, now and then: a diagonal across
      // each corner cell, the cell left out of the ways; a way that came
      // in there comes in one cell along instead.
      if (CUT.has(kind) && w >= 3 && h >= 3 && rand() < 0.65) {
        const set = (x, y, v) => { wall[y * SIDE + x] = v; };
        const get = (x, y) => wall[y * SIDE + x];
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const ci = sx < 0 ? x0 : x0 + w - 1, cj = sy < 0 ? y0 : y0 + h - 1;
          const X = ci * 2 + 1, Y = cj * 2 + 1;
          diag[Y * SIDE + X] = ((sx === sy ? 1 : 2) << 5) | (1 + ROOM_WALL[kind]);
          cut.add(cj * CHUNK + ci);
          const ring = 1 + ROOM_WALL[kind];
          if (!get(X + sx, Y)) {               // a way in from the side: one cell along
            set(X + sx, Y, ring);
            set(X + 2 * sx, Y - sy, 0);
            set(X + sx, Y - 2 * sy, 0);
          }
          if (!get(X, Y + sy)) {               // a way in from above or below
            set(X, Y + sy, ring);
            set(X - sx, Y + 2 * sy, 0);
            set(X - 2 * sx, Y + sy, 0);
          }
        }
      }
    }
    // Doors to the chunk west and the chunk north: two each.
    for (const side of [0, 1]) {
      for (let d = 0; d < 2; d++) {
        const at = Math.floor(wh(cx, cy, 10 + side * 2 + d) * CHUNK) * 2 + 1;
        if (side === 0) wall[at * SIDE] = 0; else wall[at] = 0;
      }
    }
    // Here and there a wooden door in a stone wall, for the look of it.
    for (let i = 0; i < SIDE * SIDE; i++) if (wall[i] && wall[i] !== 1 + T.hedge && !paleTex(wall[i] - 1) && rand() < 0.02) wall[i] = 1 + T.door;
    // What was kept through a change of world, as it was.
    for (const [k, v] of kept) {
      const [tx, ty] = k.split(',').map(Number);
      if (tx >> 4 !== cx || ty >> 4 !== cy) continue;
      const i = (ty & 15) * SIDE + (tx & 15);
      wall[i] = v.wall; floor[i] = v.floor; ceil[i] = v.ceil; diag[i] = 0;
    }
    if (uncut && (uncut[0] * 2 + 1) >> 4 === cx && (uncut[1] * 2 + 1) >> 4 === cy) {
      cut.delete((uncut[1] & 7) * CHUNK + (uncut[0] & 7));
      diag[((uncut[1] * 2 + 1) & 15) * SIDE + ((uncut[0] * 2 + 1) & 15)] = 0;
    }
    return { wall, diag, floor, ceil, room, cut };
  }
  // The chunks far behind go.
  let here = [0, 0];
  function forget() {
    for (const k of chunks.keys()) {
      const x = Math.floor(k / 65536) - 32768, y = (k % 65536) - 32768;
      if (Math.abs(x - here[0]) > 3 || Math.abs(y - here[1]) > 3) chunks.delete(k);
    }
    lastKey = NaN;
  }
  // A tile's wall, diagonal, floor or ceiling (tx, ty whole numbers: >> 4
  // is a chunk, & 15 a tile in it, negative ones too).
  const tile = (tx, ty) => chunk(tx >> 4, ty >> 4).wall[(ty & 15) * SIDE + (tx & 15)];
  const diagAt = (tx, ty) => chunk(tx >> 4, ty >> 4).diag[(ty & 15) * SIDE + (tx & 15)];
  const floorAt = (tx, ty) => chunk(tx >> 4, ty >> 4).floor[(ty & 15) * SIDE + (tx & 15)];
  const ceilAt = (tx, ty) => chunk(tx >> 4, ty >> 4).ceil[(ty & 15) * SIDE + (tx & 15)];
  // Cells are the odd tiles; two cells meet where the tile between is open
  // (and neither is a corner cut off).
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const isCut = (ci, cj) => {
    const c = chunk((ci * 2 + 1) >> 4, (cj * 2 + 1) >> 4);
    return c.cut.size > 0 && c.cut.has((cj & 7) * CHUNK + (ci & 7));
  };
  const open = (ci, cj, dx, dy) => tile(ci * 2 + 1 + dx, cj * 2 + 1 + dy) === 0 && !isCut(ci + dx, cj + dy);
  const roomAt = (ci, cj) => {
    const r = chunk((ci * 2 + 1) >> 4, (cj * 2 + 1) >> 4).room;
    return r && ci >= r.x0 && ci <= r.x1 && cj >= r.y0 && cj <= r.y1 ? r : null;
  };
  // How far one sees in a cell, and whether it is one of the pale parts.
  const lightAt = (ci, cj) => { const r = roomAt(ci, cj); return r ? ROOM_LIGHT[r.kind] : themeOf(ci, cj).light; };
  const paleAt = (ci, cj) => { const r = roomAt(ci, cj); return r ? PALE_ROOMS.has(r.kind) : !!themeOf(ci, cj).pale; };

  // ------------------------------------------------------------ the pictures on the walls
  // A wall's face (its tile, and which way it looks: 0 east, 1 west, 2
  // south, 3 north) carries its pictures, the same every time in a world:
  // along the ways about a third of the faces, mostly one picture; in a
  // room more, larger, and great ones in gilded frames. A size is a share
  // of the wall's height; its frame's width the same.
  const SIZES = {
    tiny: { h: 0.2, frame: 0.02 },
    small: { h: 0.26, frame: 0.025 },
    medium: { h: 0.4, frame: 0.03 },
    large: { h: 0.56, frame: 0.045 },
    epic: { h: 0.8, frame: 0.065 },
  };
  // A way of hanging: its pictures' sizes, where their middles are on the
  // face (u across, v down) and how wide one may be (a place's own, else
  // the hanging's).
  const one = (size) => ({ w: 0.9, slots: [[size, 0.5, SIZES[size].h > 0.7 ? 0.5 : 0.44]] });
  const HANGINGS = {
    small: one('small'), medium: one('medium'), large: one('large'), epic: one('epic'),
    pair: { w: 0.42, slots: [['small', 0.27, 0.44], ['small', 0.73, 0.44]] },
    row: { w: 0.28, slots: [['small', 0.18, 0.44], ['small', 0.5, 0.44], ['small', 0.82, 0.44]] },
    square: { w: 0.38, slots: [['tiny', 0.29, 0.31], ['tiny', 0.71, 0.31], ['tiny', 0.29, 0.6], ['tiny', 0.71, 0.6]] },
    gallery: { w: 0.42, slots: [['medium', 0.27, 0.44], ['medium', 0.73, 0.44]] },
    tall: { w: 0.5, slots: [['small', 0.5, 0.3], ['small', 0.5, 0.62]] },
    triptych: { w: 0.24, slots: [['tiny', 0.15, 0.44], ['medium', 0.5, 0.44, 0.36], ['tiny', 0.85, 0.44]] },
    salon: { w: 0.26, slots: [['tiny', 0.19, 0.31], ['tiny', 0.5, 0.31], ['tiny', 0.81, 0.31], ['tiny', 0.19, 0.6], ['tiny', 0.5, 0.6], ['tiny', 0.81, 0.6]] },
    sign: { w: 0.5, sign: true, slots: [['small', 0.5, 0.42, 0.42]] },
  };
  const pick = (k, table) => { for (const [name, upTo] of table) if (k < upTo) return HANGINGS[name]; return null; };
  const LOOK_S = 7;                      // seconds a wall is looked at
  const PHOTO_CALLS = 2;                 // Immich's random pictures, 800 a call
  // How the ways are hung, and each kind of room (the garden's hedges bare);
  // on the pale walls now and then a sign instead.
  const WAYS = [['small', 0.1], ['medium', 0.2], ['pair', 0.25], ['large', 0.29], ['tall', 0.32], ['row', 0.34], ['triptych', 0.36]];
  const ROOMS_HUNG = {
    gallery: [['epic', 0.3], ['large', 0.55], ['gallery', 0.65], ['triptych', 0.72]],
    crypt: [['small', 0.2], ['medium', 0.3]],
    library: [['salon', 0.15], ['square', 0.3], ['medium', 0.5]],
    cellar: [['small', 0.25]],
    red: [['epic', 0.2], ['large', 0.35]],
    white: [['sign', 0.12], ['large', 0.3], ['medium', 0.45]],
    other: [['epic', 0.15], ['large', 0.3], ['medium', 0.42], ['gallery', 0.5], ['triptych', 0.56]],
  };
  function hangs(tx, ty, face, room, pale) {
    const k = wh(tx * 4 + face, ty, 22);
    if (room) return room.kind === 'garden' || room.kind === 'courtyard' ? null : pick(k, ROOMS_HUNG[room.kind] || ROOMS_HUNG.other);
    if (pale && k < 0.08) return HANGINGS.sign;
    return pick(pale ? k - 0.08 : k, WAYS);
  }
  // Antichamber's way: a line on a sign, now and then, on the pale walls.
  const SIGNS = [
    'Det du letar efter finns ofta bakom dig.',
    'En återvändsgränd är bara en plats du inte förstått än.',
    'Den som vänder sig om ser en annan väg.',
    'Det som syns behöver inte vara det som är.',
    'Gå vidare, även när allt ser likadant ut.',
    'Vissa dörrar öppnas bara när du inte tittar.',
    'Kartan är inte labyrinten.',
    'Den som stannar ser mer.',
    'Allt kan ändras när du ser bort.',
    'Du har varit här förut. Eller inte.',
    'Varje vägg har en baksida.',
    'Att gå vilse är också att gå.',
    'Det finns inget slut, bara fler rum.',
    'Ibland är vägen tillbaka en ny väg.',
  ];
  // Frames of many kinds: dark wood, black, silver, white (a wide mat),
  // gilt, and gilt with a dark rim within (the great ones'); the smaller a
  // picture, the plainer its frame may be. [body, edge] as ABGR.
  const FRAMES = {
    wood: { body: 0xff22344f, edge: 0xff142233 },
    black: { body: 0xff1a1c1e, edge: 0xff3c4246 },
    silver: { body: 0xffc4c0be, edge: 0xff767066 },
    white: { body: 0xffdee8ec, edge: 0xff8a9296, wide: 1.8 },
    gold: { body: 0xff3aa4d8, edge: 0xff1d6a9a },
    ornate: { body: 0xff3aa4d8, edge: 0xff123a5a, inner: true, wide: 1.3 },
  };
  const FRAMED = {
    tiny: ['wood', 'black', 'white', 'silver'], small: ['wood', 'black', 'white', 'silver', 'gold'],
    medium: ['wood', 'black', 'silver', 'gold', 'white'], large: ['gold', 'silver', 'black', 'ornate'], epic: ['gold', 'ornate'],
  };

  // ------------------------------------------------------------ textures
  // Each texture at SHADES distances, as rows of 32-bit pixels: the
  // stones darkening to black in a warm light, the pale ones whitening.
  const FOG = [236, 233, 226];
  function shadeTables(source, pale) {
    const c = document.createElement('canvas');
    c.width = TEX; c.height = source.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0);
    const data = new Uint32Array(g.getImageData(0, 0, TEX, source.height).data.buffer);
    const count = Math.floor(source.height / TEX);
    const tables = [];
    for (let t = 0; t < count; t++) {
      const levels = [];
      for (let s = 0; s < SHADES; s++) {
        const k = (1 - s / SHADES) ** 1.6;
        const out = new Uint32Array(TEX * TEX);
        for (let i = 0; i < TEX * TEX; i++) {
          const p = data[t * TEX * TEX + i];
          const r = p & 255, gg = (p >>> 8) & 255, b = (p >>> 16) & 255;
          out[i] = pale
            ? 0xff000000 | ((b * k + FOG[2] * (1 - k)) << 16) | ((gg * k + FOG[1] * (1 - k)) << 8) | (r * k + FOG[0] * (1 - k))
            // A warm torchlight: a little more red, a little less blue.
            : 0xff000000 | (Math.min(255, b * k * 0.82) << 16) | (Math.min(255, gg * k * 0.95) << 8) | Math.min(255, r * k * 1.08);
        }
        levels.push(out);
      }
      tables.push(levels);
    }
    return tables;
  }
  // The pale ones, drawn: white walls drawn round in black (each tile's
  // edges, Antichamber's lines), a paper floor, red, blue and yellow
  // walls, a black one drawn round in white, the day's sky.
  function paleTextures() {
    const c = document.createElement('canvas');
    const kinds = [
      ['#ece9e2', '#222222', 2], ['#f3f0ea', '#b8b2a8', 1], ['#c3362b', '#4a120d', 2], ['#2f6fd6', '#122e66', 2],
      ['#f0c53a', '#6b5410', 2], ['#1c1c1e', '#e9e6df', 2], null,
    ];
    c.width = TEX; c.height = TEX * kinds.length;
    const g = c.getContext('2d');
    kinds.forEach((k, i) => {
      const y = i * TEX;
      if (!k) {                            // the sky: a soft blue, a cloud or two
        const sky = g.createLinearGradient(0, y, TEX, y + TEX);
        sky.addColorStop(0, '#a9cdf2'); sky.addColorStop(1, '#cfe3f7');
        g.fillStyle = sky; g.fillRect(0, y, TEX, TEX);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        for (const [x, cy, r] of [[18, 20, 9], [28, 18, 11], [40, 22, 8], [46, 46, 7], [54, 44, 9]]) { g.beginPath(); g.arc(x, y + cy, r, 0, Math.PI * 2); g.fill(); }
        return;
      }
      const [fill, line, wide] = k;
      g.fillStyle = fill; g.fillRect(0, y, TEX, TEX);
      g.fillStyle = line;
      g.fillRect(0, y, TEX, wide); g.fillRect(0, y + TEX - wide, TEX, wide);
      g.fillRect(0, y, wide, TEX); g.fillRect(TEX - wide, y, wide, TEX);
    });
    return c;
  }
  // A sign: a white card with its line, small (the walker's look shows it large).
  function signPicture(text) {
    const PIC = 64;
    const c = document.createElement('canvas');
    c.width = PIC; c.height = PIC;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, PIC, PIC);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 11px sans-serif'; g.textBaseline = 'top';
    const words = text.split(' ');
    let line = '', y = 8;
    for (const w of words) {
      if (g.measureText(`${line} ${w}`).width > PIC - 10 && line) { g.fillText(line, 5, y); line = w; y += 13; } else line = line ? `${line} ${w}` : w;
    }
    g.fillText(line, 5, y);
    return { data: new Uint32Array(g.getImageData(0, 0, PIC, PIC).data.buffer.slice(0)), ratio: 1.3 };
  }

  M.maze = function (canvas, hud) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const frame = ctx.createImageData(W, H);
    const px = new Uint32Array(frame.data.buffer);
    const zbuf = new Float32Array(W);
    let tex = null;
    const img = new Image();
    img.onload = () => { tex = [...shadeTables(img, false).slice(0, STONES), ...shadeTables(paleTextures(), true)]; };
    img.src = new URL('maze/textures.png', document.baseURI).href;

    // Where one is: in tiles, facing a, at a cell (ci, cj).
    const me = { x: 1.5, y: 1.5, a: 0, ci: 0, cj: 0 };

    // The pictures for the walls: the finds' covers and the pictures of
    // Immich (Bilder's library, a fresh handful each time it starts), each
    // drawn small (PIC by PIC, stretched; its own shape kept as the
    // frame's), once it has loaded; a sign at once.
    const PIC = 64;
    const wallPics = new Map();          // url -> { data, ratio } | null while loading
    function wallPicture(f) {
      if (wallPics.has(f.url)) return wallPics.get(f.url);
      if (f.sign) { const s = signPicture(f.sign); wallPics.set(f.url, s); return s; }
      wallPics.set(f.url, null);
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = PIC; c.height = PIC;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(im, 0, 0, PIC, PIC);
          wallPics.set(f.url, { data: new Uint32Array(g.getImageData(0, 0, PIC, PIC).data.buffer.slice(0)),
            ratio: Math.max(0.55, Math.min(1.6, im.naturalWidth / im.naturalHeight)) });
        } catch { /* a picture that may not be read: the wall stays bare */ }
      };
      im.src = f.url;
      if (wallPics.size > 700) wallPics.delete(wallPics.keys().next().value);
      return null;
    }
    // A pixel at a distance, as the textures are (shadeTables): to black in
    // the stones, to white in the pale parts.
    const K = Array.from({ length: SHADES }, (_, s) => (1 - s / SHADES) ** 1.6);
    const lit = (p, shade, pale) => {
      const k = K[shade];
      const r = p & 255, g = (p >>> 8) & 255, b = (p >>> 16) & 255;
      if (pale) return 0xff000000 | ((b * k + FOG[2] * (1 - k)) << 16) | ((g * k + FOG[1] * (1 - k)) << 8) | (r * k + FOG[0] * (1 - k));
      return 0xff000000 | (Math.min(255, b * k * 0.82) << 16) | (Math.min(255, g * k * 0.95) << 8) | Math.min(255, r * k * 1.08);
    };
    let pool = [];                       // what hangs: the finds, or Immich's
    let finds = [];
    // The faces of the cell a change of world happened in, hung as they
    // were: face key -> what hung there.
    let held = new Map();
    // What hangs on a face: its way of hanging and, for each place in it,
    // the one from the pool (or the sign), or null.
    function hungAt(mx, my, face, front) {
      const k = `${mx},${my},${face}`;
      if (held.has(k)) return held.get(k);
      const ci = Math.floor(front[0] / 2), cj = Math.floor(front[1] / 2);
      const hanging = hangs(mx, my, face, roomAt(ci, cj), paleAt(ci, cj));
      if (!hanging) return null;
      if (hanging.sign) {
        const n = Math.floor(wh(mx * 4 + face, my, 40) * SIGNS.length);
        return { hanging, items: [{ sign: SIGNS[n], url: `sign:${n}` }] };
      }
      if (!pool.length) return null;
      return { hanging, items: hanging.slots.map((_, i) => pool[Math.floor(wh(mx * 4 + face, my, 23 + i) * pool.length)]) };
    }
    function painting(mx, my, face, front) {
      const hung = hungAt(mx, my, face, front);
      if (!hung) return null;
      const { hanging, items } = hung;
      const out = [];
      hanging.slots.forEach(([name, uc, vc, most], i) => {
        const pic = wallPicture(items[i]);
        if (!pic) return;
        const size = SIZES[name], h = size.h, w = Math.min(most || hanging.w, h * pic.ratio);
        const kinds = hanging.sign ? ['black'] : FRAMED[name];
        const style = FRAMES[kinds[Math.floor(wh(mx * 4 + face, my, 30 + i) * kinds.length)]];
        out.push({ pic, size, style, frame: size.frame * (style.wide || 1), u0: uc - w / 2, u1: uc + w / 2, v0: vc - h / 2, v1: vc + h / 2 });
      });
      return out.length ? out : null;
    }

    // ---------------------------------------------------------- floating
    let path = [];                       // cells still to go to
    const visited = new Set();
    let move = null;                     // the glide or the turn under way
    let look = null;                     // { a, items } while turning to a wall or looking at it
    let pause = 0;                       // seconds left looking
    let since = 0;                       // cells passed since the last look
    let light = 1.5, flash = 0;          // how far one sees now; a change of world's breath of light

    // A way to the nearest cell not yet been to, breadth first, no further
    // than `far` steps.
    function route(wanted, far) {
      const from = `${me.ci},${me.cj}`;
      const back = new Map([[from, null]]);
      const queue = [[me.ci, me.cj, 0]];
      while (queue.length) {
        const [i, j, d] = queue.shift();
        if (d > 0 && wanted(i, j)) {
          const out = [];
          for (let k = `${i},${j}`; k !== from; k = back.get(k)) out.unshift(k.split(',').map(Number));
          return out;
        }
        if (d >= far) continue;
        for (const [dx, dy] of DIRS) {
          if (!open(i, j, dx, dy)) continue;
          const k = `${i + dx},${j + dy}`;
          if (back.has(k)) continue;
          back.set(k, `${i},${j}`);
          queue.push([i + dx, j + dy, d + 1]);
        }
      }
      return null;
    }
    function plan() {
      path = route((i, j) => !visited.has(`${i},${j}`), 40)
        || DIRS.filter(([dx, dy]) => open(me.ci, me.cj, dx, dy)).slice(0, 1).map(([dx, dy]) => [me.ci + dx, me.cj + dy]);
    }
    // Come to a cell: been there; and the chunks round it kept.
    function arrive(ci, cj) {
      me.ci = ci; me.cj = cj;
      visited.add(`${ci},${cj}`);
      if (visited.size > 4000) {
        for (const k of visited) { const [i, j] = k.split(',').map(Number); if (Math.abs(i - ci) + Math.abs(j - cj) > 60) visited.delete(k); }
      }
      here = [Math.floor((ci * 2 + 1) / SIDE), Math.floor((cj * 2 + 1) / SIDE)];
    }
    // A wall of a cell with something on it, to stop at and look at: often
    // (most cells but the one after a look), a sign always.
    function lookIn(ci, cj) {
      since++;
      const walls = DIRS.filter(([dx, dy]) => !open(ci, cj, dx, dy)).map(([dx, dy]) => {
        const face = dx === 1 ? 1 : dx === -1 ? 0 : dy === 1 ? 3 : 2;
        const hung = hungAt(ci * 2 + 1 + dx, cj * 2 + 1 + dy, face, [ci * 2 + 1, cj * 2 + 1]);
        return hung && hung.items.some(Boolean) ? { a: Math.atan2(dy, dx), items: hung.items.filter(Boolean), sign: !!hung.hanging.sign } : null;
      }).filter(Boolean);
      const sign = walls.find((w) => w.sign);
      if (!sign && (since < 2 || Math.random() > 0.8 || !walls.length)) return null;
      since = 0;
      return sign || walls[Math.floor(Math.random() * walls.length)];
    }
    const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const easeTurn = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
    // A turn on the spot to a right angle (or two), eased in and out;
    // then(), when it is done; swap: the world behind changes halfway.
    function turn(to, then, swap) {
      const by = angleTo(me.a, to);
      move = { kind: 'turn', a0: me.a, by, t: 0, dur: TURN_S * Math.max(0.4, Math.abs(by) / (Math.PI / 2)) ** 0.8, then, swap };
    }
    // A glide straight on, from cell to cell, up to speed and down again:
    // the distance as time goes (speed up over EASE tiles, along, down).
    function glide(cells, then) {
      const [li, lj] = cells[cells.length - 1];
      const x1 = li * 2 + 1.5, y1 = lj * 2 + 1.5;
      const len = Math.hypot(x1 - me.x, y1 - me.y);
      const ease = Math.min(EASE, len / 2), ta = (2 * ease) / SPEED, tc = (len - 2 * ease) / SPEED;
      move = { kind: 'glide', x0: me.x, y0: me.y, ux: (x1 - me.x) / len, uy: (y1 - me.y) / len, len, cells: cells.slice(), t: 0,
        dur: 2 * ta + tc, s: (t) => {
          if (t < ta) return 0.5 * (SPEED / ta) * t * t;
          if (t < ta + tc) return ease + SPEED * (t - ta);
          const r = Math.max(0, 2 * ta + tc - t);
          return len - 0.5 * (SPEED / ta) * r * r;
        }, then };
    }
    // What comes next, when standing still: the way on, straight as far as
    // it goes (or to a wall to look at on the way), turned to first.
    function next() {
      if (!path.length) plan();
      if (!path.length) { wander(); return; }   // shut in (never yet): somewhere else
      const [ni, nj] = path[0];
      const dx = ni - me.ci, dy = nj - me.cj;
      const want = Math.atan2(dy, dx);
      if (Math.abs(angleTo(me.a, want)) > 0.01) {
        // Back out of a dead end: now and then the world behind changes
        // while one turns.
        const dead = DIRS.filter(([ex, ey]) => open(me.ci, me.cj, ex, ey)).length === 1;
        turn(want, null, dead && Math.abs(angleTo(me.a, want)) > 2.5 && Math.random() < 0.55);
        return;
      }
      const run = [];
      let stop = null;
      let [ci, cj] = [me.ci, me.cj];
      while (path.length && path[0][0] - ci === dx && path[0][1] - cj === dy) {
        [ci, cj] = path.shift();
        run.push([ci, cj]);
        if ((stop = lookIn(ci, cj))) break;
      }
      glide(run, stop ? () => { look = stop; turn(stop.a, () => { hud.look(look.items); pause = LOOK_S; }); } : null);
    }
    function walk(dt) {
      if (move) {
        move.t += dt;
        const p = Math.min(1, move.t / move.dur);
        if (move.kind === 'turn') {
          me.a = move.a0 + move.by * easeTurn(p);
          if (move.swap && p >= 0.5) { move.swap = false; swapWorld(); }
        } else {
          const s = move.s(Math.min(move.t, move.dur));
          me.x = move.x0 + move.ux * s;
          me.y = move.y0 + move.uy * s;
          // Each cell passed, been to.
          while (move.cells.length) {
            const [i, j] = move.cells[0];
            if (Math.hypot(i * 2 + 1.5 - move.x0, j * 2 + 1.5 - move.y0) > s + 0.01) break;
            move.cells.shift();
            arrive(i, j);
          }
        }
        if (p >= 1) {
          const done = move;
          move = null;
          if (done.kind === 'turn') me.a = Math.atan2(Math.sin(done.a0 + done.by), Math.cos(done.a0 + done.by));
          if (done.then) done.then();
        }
        return;
      }
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0 && look) { look = null; hud.leave(); }
        return;
      }
      next();
    }
    // The world behind gone and another there, the cell one stands in (and
    // the tiles round it, and what hangs on its walls) kept as they were.
    function swapWorld() {
      const keep = new Map(), hold = new Map();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = me.ci * 2 + 1 + dx, ty = me.cj * 2 + 1 + dy;
          keep.set(tileKey(tx, ty), { wall: tile(tx, ty), floor: floorAt(tx, ty), ceil: ceilAt(tx, ty) });
        }
      }
      let back = null;
      for (const [dx, dy] of DIRS) {
        if (open(me.ci, me.cj, dx, dy)) { back = [me.ci + dx, me.cj + dy]; continue; }
        const face = dx === 1 ? 1 : dx === -1 ? 0 : dy === 1 ? 3 : 2;
        const tx = me.ci * 2 + 1 + dx, ty = me.cj * 2 + 1 + dy;
        hold.set(`${tx},${ty},${face}`, hungAt(tx, ty, face, [me.ci * 2 + 1, me.cj * 2 + 1]));
      }
      epoch++;
      kept = keep; held = hold; uncut = back;
      chunks.clear(); lastKey = NaN;
      visited.clear(); visited.add(`${me.ci},${me.cj}`);
      path = [];
      flash = 1;
    }

    // ---------------------------------------------------------- drawing
    // A torch in the dark parts: brighter and darker in slow waves, never
    // a blink; steady in the light ones.
    const torch = (t) => 1 + (0.03 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 3.1 + 1.7)) * Math.max(0, 2 - light);
    const shadeOf = (dist, seen) => Math.min(SHADES - 1, Math.max(0, Math.floor((dist * 0.95 / seen) ** 1.1 * SHADES / 6)));

    function draw(t) {
      const seen = light * torch(t) + flash * 3;
      const dirX = Math.cos(me.a), dirY = Math.sin(me.a);
      const planeX = -dirY * FOV, planeY = dirX * FOV;
      const half = H / 2;
      const horizon = half;
      // Floor and ceiling, a row at a time, each tile its own (a room's
      // marble or grass; the stars over a garden and the day's sky lit by
      // themselves).
      for (let y = 0; y < H; y++) {
        const below = y > horizon;
        const p = below ? y - horizon : horizon - y;
        if (p < 1) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000; continue; }
        const rowDist = half / p;
        const shade = shadeOf(rowDist, seen);
        const at = below ? floorAt : ceilAt;
        let fx = me.x + rowDist * (dirX - planeX), fy = me.y + rowDist * (dirY - planeY);
        const sx = (rowDist * 2 * planeX) / W, sy = (rowDist * 2 * planeY) / W;
        const row = y * W;
        let lastT = -1, levels = null;
        for (let x = 0; x < W; x++) {
          const k = at(Math.floor(fx), Math.floor(fy));
          if (k !== lastT) { lastT = k; levels = tex[k][k === T.sky ? Math.min(shade, 6) : k === T.day ? Math.min(shade, 3) : shade]; }
          const u = (fx * TEX) & (TEX - 1), v = (fy * TEX) & (TEX - 1);
          px[row + x] = levels[v * TEX + u];
          fx += sx; fy += sy;
        }
      }
      // The walls, a column at a time (DDA through the tiles; a cut
      // corner's diagonal met within its tile, or passed by).
      for (let x = 0; x < W; x++) {
        const cam = (2 * x) / W - 1;
        const rx = dirX + planeX * cam, ry = dirY + planeY * cam;
        let mx = Math.floor(me.x), my = Math.floor(me.y);
        const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
        const stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
        let sdx = (rx < 0 ? me.x - mx : mx + 1 - me.x) * ddx;
        let sdy = (ry < 0 ? me.y - my : my + 1 - me.y) * ddy;
        let side = 0, hit = 0, dist = 0, wx = 0, slant = false;
        for (let i = 0; i < 64 && !hit; i++) {
          if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
          hit = tile(mx, my);
          if (!hit) {
            const d = diagAt(mx, my);
            if (d) {
              // '/': x + y = mx + my + 1; '\': x - y = mx - my.
              const t = d >> 5 === 1 ? (mx + my + 1 - me.x - me.y) / (rx + ry) : (mx - my - me.x + me.y) / (rx - ry);
              const hx = me.x + t * rx;
              if (t > 0 && hx >= mx && hx <= mx + 1) { hit = d & 31; dist = t; wx = hx - mx; slant = true; }
            }
          }
        }
        if (!slant) {
          dist = side === 0 ? sdx - ddx : sdy - ddy;
          wx = side === 0 ? me.y + dist * ry : me.x + dist * rx;
          wx -= Math.floor(wx);
        }
        zbuf[x] = dist;
        const lineH = Math.floor(H / dist);
        let top = Math.floor(horizon - lineH / 2), bottom = top + lineH;
        let u = Math.floor(wx * TEX);
        if (!slant && ((side === 0 && rx > 0) || (side === 1 && ry < 0))) u = TEX - 1 - u;
        const which = (hit || 1) - 1;
        const pale = paleTex(which);
        // The sides facing north and south a little darker (or whiter), as
        // walls in the old games were; a diagonal between.
        const shade = Math.min(SHADES - 1, shadeOf(dist, seen) + (slant ? 1 : side * 2));
        const levels = tex[which][shade];
        const step = TEX / lineH;
        let v = 0;
        if (top < 0) { v = -top * step; top = 0; }
        if (bottom > H) bottom = H;
        // A picture on this face (not on a door, a hedge, a diagonal), and
        // whether this column crosses it.
        const face = side === 0 ? (stepX > 0 ? 1 : 0) : (stepY > 0 ? 3 : 2);
        const front = side === 0 ? [mx - stepX, my] : [mx, my - stepY];
        const all = !slant && which !== T.door && which !== T.hedge && dist < 9 ? painting(mx, my, face, front) : null;
        const uf = (u + 0.5) / TEX;
        const here = all && all.filter((a) => uf >= a.u0 && uf <= a.u1);
        if (here && here.length) {
          // Each picture this column crosses: where across it, and its frame's sides.
          for (const a of here) {
            const fw = a.frame;
            a.inX = uf > a.u0 + fw && uf < a.u1 - fw;
            a.pu = Math.min(PIC - 1, Math.floor(((uf - a.u0 - fw) / (a.u1 - a.u0 - 2 * fw)) * PIC));
            a.edgeX = uf < a.u0 + fw * 0.35 || uf > a.u1 - fw * 0.35
              || (a.style.inner && ((uf > a.u0 + fw * 0.7 && uf < a.u0 + fw) || (uf < a.u1 - fw * 0.7 && uf > a.u1 - fw)));
          }
          for (let y = top; y < bottom; y++) {
            const vf = v / TEX;
            let p = 0;
            for (const a of here) {
              if (vf < a.v0 || vf > a.v1) continue;
              const fh = a.frame;
              if (a.inX && vf > a.v0 + fh && vf < a.v1 - fh) {
                p = lit(a.pic.data[Math.min(PIC - 1, Math.floor(((vf - a.v0 - fh) / (a.v1 - a.v0 - 2 * fh)) * PIC)) * PIC + a.pu], shade, pale);
              } else {
                const edge = a.edgeX || vf < a.v0 + fh * 0.35 || vf > a.v1 - fh * 0.35
                  || (a.style.inner && ((vf > a.v0 + fh * 0.7 && vf < a.v0 + fh) || (vf < a.v1 - fh * 0.7 && vf > a.v1 - fh)));
                p = lit(edge ? a.style.edge : a.style.body, shade, pale);
              }
              break;
            }
            px[y * W + x] = p || levels[(Math.floor(v) & (TEX - 1)) * TEX + u];
            v += step;
          }
        } else {
          for (let y = top; y < bottom; y++) {
            px[y * W + x] = levels[(Math.floor(v) & (TEX - 1)) * TEX + u];
            v += step;
          }
        }
      }
      ctx.putImageData(frame, 0, 0);
    }

    // ---------------------------------------------------------- running
    let timer = null, last = 0, begun = performance.now();
    let cost = 0;                        // ms a frame takes, smoothed (debug)
    // What hangs, one kind only: Bilder's photos (Immich's, a fresh lot
    // each time the screensaver starts, through the daemon's /immich/),
    // else, with no Immich, the covers kept on the box.
    async function load() {
      const photos = [];
      for (let i = 0; i < PHOTO_CALLS; i++) {
        try {
          const r = await fetch('/immich/api/search/random', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ size: 800, type: 'IMAGE' }) });
          const list = r.ok ? await r.json() : [];
          photos.push(...(Array.isArray(list) ? list : []).map((a) => ({
            url: `/immich/api/assets/${encodeURIComponent(a.id)}/thumbnail?size=thumbnail`,
            big: `/immich/api/assets/${encodeURIComponent(a.id)}/thumbnail?size=preview`,
            photo: true, taken: a.localDateTime || a.fileCreatedAt || null, city: (a.exifInfo && a.exifInfo.city) || '',
          })));
        } catch { break; }                 // no Immich
      }
      const seenUrl = new Set();
      const once = photos.filter((p) => !seenUrl.has(p.url) && seenUrl.add(p.url));
      if (once.length) { pool = once; return; }
      try {
        const r = await fetch('/api/finds?n=600');
        const d = await r.json();
        if (Array.isArray(d.finds) && d.finds.length) finds = d.finds;
      } catch { /* no covers either: the maze bare but for its signs */ }
      pool = [...finds];
    }
    function tick() {
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (!tex) return;
      walk(dt);
      // The light comes and goes with the parts one floats through.
      light += (lightAt(me.ci, me.cj) - light) * Math.min(1, dt * 0.7);
      flash = Math.max(0, flash - dt * 0.8);
      draw((now - begun) / 1000);
      cost = cost * 0.95 + (performance.now() - now) * 0.05;
    }
    // Facing a way open, squarely.
    function faceOpen() {
      const ways = DIRS.filter(([dx, dy]) => open(me.ci, me.cj, dx, dy));
      const [dx, dy] = ways[Math.floor(Math.random() * ways.length)] || DIRS[0];
      me.a = Math.atan2(dy, dx);
    }
    function settle() {
      if (look) hud.leave();
      path = []; pause = 0; look = null; since = 0; move = null;
      light = lightAt(me.ci, me.cj);
    }
    // Somewhere new each time: a cell far off in the maze without end, in a
    // new world (every cell is open but a cut corner's; the chunks are made
    // as they are walked into).
    function wander() {
      const far = () => Math.floor((Math.random() * 2 - 1) * 60000);
      epoch = Math.floor(Math.random() * 1000);
      kept = new Map(); held = new Map(); uncut = null;
      chunks.clear(); lastKey = NaN;
      me.ci = far(); me.cj = far();
      if (isCut(me.ci, me.cj)) me.ci += me.ci > 0 ? -1 : 1;
      me.x = me.ci * 2 + 1.5; me.y = me.cj * 2 + 1.5;
      visited.clear();
      arrive(me.ci, me.cj);
      settle();
      faceOpen();
    }
    function start() {
      if (timer) return;
      last = performance.now();
      wander();
      load();                            // a fresh lot of Immich's each time
      timer = setInterval(tick, 1000 / FPS);
    }
    function stop() { clearInterval(timer); timer = null; if (look) { look = null; pause = 0; hud.leave(); } }
    start();
    // Straight into a room of a kind (the catalogue of views, tests): the
    // nearest chunk that has one, in its middle; cut: one with its corners
    // cut, looking at one of them.
    function visit(kind, { cut = false } = {}) {
      for (let r = 1; r < 12; r++) {
        for (let cy = -r; cy <= r; cy++) {
          for (let cx = -r; cx <= r; cx++) {
            const c = chunk(cx, cy), room = c.room;
            if (!room || room.kind !== kind || (cut && !c.cut.size)) continue;
            me.ci = cut ? room.x0 + 1 : Math.floor((room.x0 + room.x1) / 2);
            me.cj = cut ? room.y0 + 1 : Math.floor((room.y0 + room.y1) / 2);
            me.x = me.ci * 2 + 1.5; me.y = me.cj * 2 + 1.5;
            arrive(me.ci, me.cj);
            settle();
            if (cut) { me.a = -0.75 * Math.PI; pause = 6; } else faceOpen();
            return true;
          }
        }
      }
      return false;
    }
    return { start, stop, visit, swap: swapWorld, debug: () => ({ ...me, path: path.slice(0, 4), move: move && move.kind, pause, cost, light, epoch }) };
  };
})(window.PioneerTV);
