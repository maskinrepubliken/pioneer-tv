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
// A raycaster on a small canvas (320 by 180, scaled up smoothly, not
// pixelated), twenty frames a second: the walls one column at a time
// (a cut corner's diagonal met within its tile), the floor and ceiling a
// row at a time, the pictures over the walls. The maze comes in chunks of
// 8 by 8 cells, each a perfect maze of its own (a seeded backtracker) with
// a few doors to the chunks west and north of it, so the whole is one
// maze, made as it is walked into and forgotten behind. The stone textures
// are Screaming Brain Studios' Tiny Texture Pack (CC0), made 64 px
// smoothly, every colour kept (maze/textures.png, dev/maze-textures.py);
// the pale ones are drawn here.
//
//   M.maze(canvas, hud) -> { start, stop, visit, swap, debug }   (visit, swap, debug: the catalogue's, tests')
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const W = 320, H = 180;                // the picture, in pixels (scaled up smoothly)
  const PIC = 64;                        // a picture on a wall, drawn this many pixels square
  const FPS = 20;
  const TEX = 64;                        // a texture's side
  const SHADES = 32;                     // steps of darkness (or of white, far off in the pale parts)
  const CHUNK = 8, SIDE = CHUNK * 2;     // cells, tiles to a chunk
  const FOV = 0.7;                       // the camera plane's half width
  // Floating: an even, unhurried glide, round the corners too, eased only
  // into a stop and out of it; a turn on the spot slow and eased.
  const SPEED = 0.85;                    // tiles a second, kept but where it stops
  const EASE = 0.7;                      // tiles to come up to speed, and to slow
  const TURN_S = 2.3;                    // seconds a right angle takes

  // The textures: the stones (maze/textures.png, one under the other:
  // Screaming Brain Studios' Tiny Texture Pack, CC0, made 64 px smoothly by
  // dev/maze-textures.py), then the pale ones, drawn here (paleTextures).
  const T = {
    stone: 0, moss: 1, dirt: 2, sand: 3, flags: 4, blocks: 5, wood: 6, slate: 7, brick: 8,
    tiles: 9, planks: 10, marble: 11, grass: 12, hedge: 13, sky: 14, beams: 15, checker: 16,
    white: 17, paper: 18, red: 19, blue: 20, yellow: 21, black: 22, day: 23,
  };
  const STONES = 17;                     // the stones (textures.png), darkening to black
  // Parts of the maze, each in one style and its own light (how far one
  // sees: 1 a torch's, 4 and more a bright day): its walls, its floor and
  // its ceiling. A part is 3 by 3 chunks (24 by 24 cells), come into and
  // left through doors, so a change of style is always at a door. The pale ones
  // are Antichamber's: white (or blue, or black) drawn round in a line.
  const THEMES = [
    { wall: T.brick, floor: T.flags, ceil: T.blocks, light: 2.0 },     // Windows' 3D Maze: red brick, grey stone
    { wall: T.stone, floor: T.flags, ceil: T.blocks, light: 1.1 },
    { wall: T.sand, floor: T.tiles, ceil: T.beams, light: 2.8 },
    { wall: T.slate, floor: T.flags, ceil: T.slate, light: 1.4 },
    { wall: T.planks, floor: T.planks, ceil: T.beams, light: 2.0 },
    { wall: T.marble, floor: T.checker, ceil: T.day, light: 4.0 },
    { wall: T.moss, floor: T.grass, ceil: T.day, light: 3.4 },
    { wall: T.dirt, floor: T.flags, ceil: T.beams, light: 1.2 },
    { wall: T.white, floor: T.paper, ceil: T.paper, light: 4.5, pale: true },
    { wall: T.blue, floor: T.paper, ceil: T.paper, light: 4.5, pale: true },
    { wall: T.black, floor: T.paper, ceil: T.black, light: 3.6, pale: true },
  ];

  // Rooms that turn up now and then, a chunk's open middle: a hall of
  // pillars, a garden under the stars with hedges round it, a ballroom
  // floored in marble, a treasury, a long gallery of great pictures, a crypt
  // of pillars in slate, a library in wood, a cellar of earth; Antichamber's
  // red room, a white hall of black pillars, a courtyard under the day's
  // sky. Each its walls, floor, ceiling and light; some with pillars; some
  // with their corners cut at 45 degrees, now and then (CUT).
  const ROOMS = ['hall', 'garden', 'ballroom', 'treasury', 'gallery', 'crypt', 'library', 'cellar', 'red', 'white', 'courtyard'];
  const ROOM_WALL = { garden: T.hedge, ballroom: T.sand, hall: T.stone, treasury: T.brick, gallery: T.brick, crypt: T.slate, library: T.wood, cellar: T.dirt, red: T.red, white: T.white, courtyard: T.stone };
  const ROOM_FLOOR = { garden: T.grass, ballroom: T.checker, hall: T.flags, treasury: T.tiles, gallery: T.marble, crypt: T.flags, library: T.planks, cellar: T.flags, red: T.paper, white: T.paper, courtyard: T.grass };
  const ROOM_CEIL = { garden: T.sky, ballroom: T.beams, hall: T.blocks, treasury: T.blocks, gallery: T.beams, crypt: T.blocks, library: T.beams, cellar: T.beams, red: T.paper, white: T.paper, courtyard: T.day };
  const ROOM_LIGHT = { garden: 1.3, ballroom: 2.8, hall: 1.6, treasury: 2.0, gallery: 3.0, crypt: 0.9, library: 1.8, cellar: 1.0, red: 4.5, white: 5, courtyard: 4.5 };
  const PILLARS = { hall: T.stone, crypt: T.slate, white: T.black };
  const CUT = new Set(['hall', 'ballroom', 'treasury', 'red', 'white', 'courtyard', 'library']);
  const PALE_ROOMS = new Set(['red', 'white']);
  // Every style, the parts' and then the rooms': a tile's style is an
  // index into these. A wall is drawn in the style of the space it is seen
  // from (a room's inside, the way outside it), so each space is one style.
  const STYLES = [...THEMES, ...ROOMS.map((k) => ({ wall: ROOM_WALL[k], floor: ROOM_FLOOR[k], ceil: ROOM_CEIL[k], light: ROOM_LIGHT[k], pale: PALE_ROOMS.has(k) }))];
  const roomStyle = (kind) => THEMES.length + ROOMS.indexOf(kind);
  // Every way from one style to another (into a room, from one part to
  // another) is a door: a portal across the middle of the doorway, drawn
  // over what is behind it, which wobbles through it as through water in a
  // shimmer of violet and blue; floated through.
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

  // ------------------------------------------------------------ the maze
  // A chunk: per tile its wall (0 open, 1 a wall in the style of the space
  // before it, else a texture of its own + 2: a pillar, a door's frame),
  // its diagonal (a cut corner: its way, '/' 1 or '\' 2, times 32, plus its
  // texture + 1) and its style (STYLES); its room, if it has one, and the
  // cells cut off by its corners. Its west column and north row are its
  // borders, with its doors to the chunks west and north.
  const chunks = new Map();
  const keyOf = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
  let lastKey = NaN, lastChunk = null;
  // Tiles kept as they were through a change of world (the dead end one
  // stands in): tile key -> { wall, style }.
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
  // A chunk's part: its style among THEMES, the same for 3 by 3 chunks.
  const themeAt = (cx, cy) => Math.floor(wh(Math.floor(cx / 3), Math.floor(cy / 3), 3) * THEMES.length);
  function make(cx, cy) {
    const wall = new Uint8Array(SIDE * SIDE).fill(1), diag = new Uint8Array(SIDE * SIDE), door = new Uint8Array(SIDE * SIDE);
    const style = new Uint8Array(SIDE * SIDE).fill(themeAt(cx, cy));
    const rand = rng(Math.floor(wh(cx, cy, 2) * 4294967295));
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
    // Walls knocked through, so there are loops and fewer dead ends.
    for (let i = 0; i < 14; i++) {
      const x = 1 + Math.floor(rand() * (SIDE - 2)), y = 1 + Math.floor(rand() * (SIDE - 2));
      if ((x + y) % 2 === 1) wall[y * SIDE + x] = 0;
    }
    // Now and then a room in the middle, its walls inside taken away, in a
    // style of its own, its ways in framed as doors.
    let room = null;
    const cut = new Set();
    if (!(cx === 0 && cy === 0) && wh(cx, cy, 6) < 0.3) {
      const kind = ROOMS[Math.floor(wh(cx, cy, 7) * ROOMS.length)];
      // A gallery long, the rest 3 or 4 cells a side.
      const w = kind === 'gallery' ? 5 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 2);
      const h = kind === 'gallery' ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 2);
      const x0 = 1 + Math.floor(rand() * (CHUNK - w - 1)), y0 = 1 + Math.floor(rand() * (CHUNK - h - 1));
      room = { kind, x0: cx * CHUNK + x0, y0: cy * CHUNK + y0, x1: cx * CHUNK + x0 + w - 1, y1: cy * CHUNK + y0 + h - 1 };
      const L = x0 * 2, R = (x0 + w - 1) * 2 + 2, U = y0 * 2, D = (y0 + h - 1) * 2 + 2;
      for (let ly = U; ly <= D; ly++) {
        for (let lx = L; lx <= R; lx++) {
          const i = ly * SIDE + lx;
          if (lx > L && ly > U && lx < R && ly < D) {
            const pillar = lx % 2 === 0 && ly % 2 === 0;
            wall[i] = PILLARS[kind] != null && pillar ? PILLARS[kind] + 2 : 0;
          }
          style[i] = roomStyle(kind);
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
          if (!get(X + sx, Y)) {               // a way in from the side: one cell along
            set(X + sx, Y, 1);
            set(X + 2 * sx, Y - sy, 0);
            set(X + sx, Y - 2 * sy, 0);
          }
          if (!get(X, Y + sy)) {               // a way in from above or below
            set(X, Y + sy, 1);
            set(X - sx, Y + 2 * sy, 0);
            set(X - 2 * sx, Y + sy, 0);
          }
        }
      }
      // Each way in, a door: its portal across it (1: a way east and west,
      // the portal north to south; 2: the other way).
      for (let ly = U; ly <= D; ly++) {
        for (let lx = L; lx <= R; lx++) {
          if ((lx !== L && lx !== R && ly !== U && ly !== D) || wall[ly * SIDE + lx]) continue;
          door[ly * SIDE + lx] = lx === L || lx === R ? 1 : 2;
        }
      }
    }
    // Doors to the chunk west and the chunk north: two each, each with its
    // portal where that chunk is of another part.
    for (const side of [0, 1]) {
      for (let d = 0; d < 2; d++) {
        const at = Math.floor(wh(cx, cy, 10 + side * 2 + d) * CHUNK) * 2 + 1;
        // A portal only where the part changes; within one, a plain way.
        if (side === 0) { wall[at * SIDE] = 0; if (themeAt(cx - 1, cy) !== themeAt(cx, cy)) door[at * SIDE] = 1; }
        else { wall[at] = 0; if (themeAt(cx, cy - 1) !== themeAt(cx, cy)) door[at] = 2; }
      }
    }
    // What was kept through a change of world, as it was.
    for (const [k, v] of kept) {
      const [tx, ty] = k.split(',').map(Number);
      if (tx >> 4 !== cx || ty >> 4 !== cy) continue;
      const i = (ty & 15) * SIDE + (tx & 15);
      wall[i] = v.wall; style[i] = v.style; diag[i] = 0;
    }
    if (uncut && (uncut[0] * 2 + 1) >> 4 === cx && (uncut[1] * 2 + 1) >> 4 === cy) {
      cut.delete((uncut[1] & 7) * CHUNK + (uncut[0] & 7));
      diag[((uncut[1] * 2 + 1) & 15) * SIDE + ((uncut[0] * 2 + 1) & 15)] = 0;
    }
    return { wall, diag, style, door, room, cut };
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
  // A tile's wall, diagonal, style, floor or ceiling (tx, ty whole
  // numbers: >> 4 is a chunk, & 15 a tile in it, negative ones too).
  const tile = (tx, ty) => chunk(tx >> 4, ty >> 4).wall[(ty & 15) * SIDE + (tx & 15)];
  const diagAt = (tx, ty) => chunk(tx >> 4, ty >> 4).diag[(ty & 15) * SIDE + (tx & 15)];
  const styleAt = (tx, ty) => chunk(tx >> 4, ty >> 4).style[(ty & 15) * SIDE + (tx & 15)];
  const doorAt = (tx, ty) => chunk(tx >> 4, ty >> 4).door[(ty & 15) * SIDE + (tx & 15)];
  // A point's style (x, y in tiles): its tile's, but in a doorway each half
  // the side's it lies on, so a style changes just where the portal is.
  function styleHere(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    const c = chunk(tx >> 4, ty >> 4), i = (ty & 15) * SIDE + (tx & 15);
    const o = c.door[i];
    if (!o) return c.style[i];
    return o === 1 ? styleAt(x - tx < 0.5 ? tx - 1 : tx + 1, ty) : styleAt(tx, y - ty < 0.5 ? ty - 1 : ty + 1);
  }
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
  const lightAt = (ci, cj) => STYLES[styleAt(ci * 2 + 1, cj * 2 + 1)].light;
  const paleAt = (ci, cj) => !!STYLES[styleAt(ci * 2 + 1, cj * 2 + 1)].pale;

  // ------------------------------------------------------------ the pictures on the walls
  // Few, and every one looked at: a picture is hung only on a wall along
  // the way the walker is going (every few cells, as the way is planned,
  // well before it can be seen), one to a wall, and the walker stops at
  // each and looks at it, once. Its frame is liberty-quests' carved wood
  // with a gem at each corner (maze/carved-frame.png, its spelläge's
  // window), drawn into the picture. A size is a share of the wall's
  // height, the frame's included.
  const SIZES = { medium: { h: 0.46 }, large: { h: 0.6 }, epic: { h: 0.8 }, sign: { h: 0.32 } };
  const LOOK_S = 7;                      // seconds a picture is looked at
  const EVERY = [2, 4];                  // cells between pictures, at least and at most
  const PHOTO_CALLS = 2;                 // Immich's random pictures, 800 a call
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
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, PIC - 3, PIC - 3);
    return { data: new Uint32Array(g.getImageData(0, 0, PIC, PIC).data.buffer.slice(0)), w: PIC, h: PIC, ratio: 1.3 };
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
    const wallPics = new Map();          // url -> { data, w, h, ratio } | null while loading
    // The carved frame, a 9-slice of 10 at its own scale (sharp, as
    // liberty-quests draws it), round a picture PIC high in its own shape.
    const carved = new Image();
    carved.src = new URL('maze/carved-frame.png', document.baseURI).href;
    const FR = 10;
    function framed(im) {
      const iw = Math.round(PIC * Math.max(0.55, Math.min(1.6, im.naturalWidth / im.naturalHeight)));
      const w = iw + 2 * FR, h = PIC + 2 * FR, m = carved.width - FR;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, FR, FR, iw, PIC);
      g.imageSmoothingEnabled = false;
      const part = (sx, sy, sw, sh, dx, dy, dw, dh) => g.drawImage(carved, sx, sy, sw, sh, dx, dy, dw, dh);
      part(0, 0, FR, FR, 0, 0, FR, FR); part(m, 0, FR, FR, w - FR, 0, FR, FR);
      part(0, m, FR, FR, 0, h - FR, FR, FR); part(m, m, FR, FR, w - FR, h - FR, FR, FR);
      part(FR, 0, m - FR, FR, FR, 0, w - 2 * FR, FR); part(FR, m, m - FR, FR, FR, h - FR, w - 2 * FR, FR);
      part(0, FR, FR, m - FR, 0, FR, FR, h - 2 * FR); part(m, FR, FR, m - FR, w - FR, FR, FR, h - 2 * FR);
      return { data: new Uint32Array(g.getImageData(0, 0, w, h).data.buffer.slice(0)), w, h, ratio: w / h };
    }
    function wallPicture(f) {
      if (wallPics.has(f.url)) return wallPics.get(f.url);
      if (f.sign) { const s = signPicture(f.sign); wallPics.set(f.url, s); return s; }
      if (!carved.complete || !carved.width) return null;   // the frame first
      wallPics.set(f.url, null);
      const im = new Image();
      im.onload = () => {
        try { wallPics.set(f.url, framed(im)); } catch { /* a picture that may not be read: the wall stays bare */ }
      };
      im.src = f.url;
      if (wallPics.size > 500) wallPics.delete(wallPics.keys().next().value);
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
    let pool = [], next = 0;             // what hangs: the finds, or Immich's; the next not yet hung
    let finds = [];
    // What hangs, by face (its tile, and which way it looks: 0 east, 1
    // west, 2 south, 3 north): { item, size, style }, and the faces looked at.
    let hung = new Map();
    const looked = new Set();
    // The faces of the cell a change of world happened in, hung as they
    // were.
    let held = new Map();
    const faceKey = (mx, my, face) => `${mx},${my},${face}`;
    const hungAt = (mx, my, face) => { const k = faceKey(mx, my, face); return held.get(k) || hung.get(k) || null; };
    // A picture on a wall of a cell on the way: the next of the pool, a
    // sign now and then in the pale parts; larger in a room, great in a
    // gallery.
    function hang(ci, cj) {
      const walls = DIRS.filter(([dx, dy]) => !open(ci, cj, dx, dy) && !isCut(ci + dx, cj + dy));
      if (!walls.length) return false;
      const [dx, dy] = walls[Math.floor(Math.random() * walls.length)];
      const room = roomAt(ci, cj);
      if (room && (room.kind === 'garden' || room.kind === 'courtyard')) return false;
      let item, size;
      if (paleAt(ci, cj) && Math.random() < 0.35) {
        const n = Math.floor(Math.random() * SIGNS.length);
        item = { sign: SIGNS[n], url: `sign:${n}` }; size = 'sign';
      } else if (pool.length) {
        item = pool[next++ % pool.length];
        size = room ? (room.kind === 'gallery' ? 'epic' : 'large') : Math.random() < 0.6 ? 'medium' : 'large';
      } else return false;
      const face = dx === 1 ? 1 : dx === -1 ? 0 : dy === 1 ? 3 : 2;
      hung.set(faceKey(ci * 2 + 1 + dx, cj * 2 + 1 + dy, face), { item, size });
      return true;
    }
    function painting(mx, my, face) {
      const h = hungAt(mx, my, face);
      const pic = h && wallPicture(h.item);
      if (!pic) return null;
      const size = SIZES[h.size], vc = size.h > 0.7 ? 0.5 : 0.44;
      const w = Math.min(0.9, size.h * pic.ratio);
      return { pic, u0: 0.5 - w / 2, u1: 0.5 + w / 2, v0: vc - size.h / 2, v1: vc + size.h / 2 };
    }

    // ---------------------------------------------------------- floating
    let path = [];                       // cells still to go to, planned ahead
    const visited = new Set();           // cells been to, or on the way laid out
    let look = null;                     // { a, items } while turning to a wall or looking at it
    let pause = 0;                       // seconds left looking
    let gap = EVERY[0];                  // cells on the way still to go before the next picture
    let light = 1.5, flash = 0;          // how far one sees now; a change of world's breath of light
    // The way ahead as it will be floated, laid out a few tiles before one
    // gets there: straight lines from cell to cell and, at a corner, a
    // quarter circle a tile across through it, so the speed never drops;
    // each piece { s0, len, at(s) -> [x, y, a] } from the distance floated
    // (odo). The cells come to on it, at their distances (marks). It ends
    // only where one stops: at a wall to look at, or a dead end to turn
    // back from (ending).
    let pieces = [], marks = [], odo = 0, laid = 0, v = 0;
    let tail = null;                     // where it ends: { ci, cj, dx, dy, rest, look } (rest: from standing)
    let ending = null;                   // { look } | { back } | { rest }
    let turning = null;                  // a turn on the spot: { a0, by, t, dur, then, swap }
    const A = (SPEED * SPEED) / (2 * EASE); // the speeding up and slowing down

    // A way to the nearest cell not yet been to, breadth first from a cell,
    // no further than `far` steps.
    function route(fi, fj, wanted, far) {
      const from = `${fi},${fj}`;
      const back = new Map([[from, null]]);
      const queue = [[fi, fj, 0]];
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
    // More of the way, from where it ends now; a picture hung on a wall
    // along it every few cells.
    function extendPath() {
      const [fi, fj] = path.length ? path[path.length - 1] : [tail ? tail.ci : me.ci, tail ? tail.cj : me.cj];
      // Not into a dead end, mostly (a quarter of them: where the world may
      // change behind one): it means stopping and turning back.
      const wanted = (i, j) => !visited.has(`${i},${j}`)
        && (DIRS.filter(([dx, dy]) => open(i, j, dx, dy)).length > 1 || wh(i, j, 50) < 0.25);
      const more = route(fi, fj, wanted, 40) || route(fi, fj, (i, j) => !visited.has(`${i},${j}`), 40)
        || DIRS.filter(([dx, dy]) => open(fi, fj, dx, dy)).slice(0, 1).map(([dx, dy]) => [fi + dx, fj + dy]);
      for (const [i, j] of more) {
        visited.add(`${i},${j}`);
        if (--gap <= 0 && hang(i, j)) gap = EVERY[0] + Math.floor(Math.random() * (EVERY[1] - EVERY[0] + 1));
      }
      path.push(...more);
      return more.length > 0;
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
    // A picture on a wall of a cell, not looked at yet: to stop at.
    function lookAt(ci, cj) {
      for (const [dx, dy] of DIRS) {
        if (open(ci, cj, dx, dy)) continue;
        const face = dx === 1 ? 1 : dx === -1 ? 0 : dy === 1 ? 3 : 2;
        const k = faceKey(ci * 2 + 1 + dx, cj * 2 + 1 + dy, face);
        const h = held.get(k) || hung.get(k);
        if (h && !looked.has(k)) return { a: Math.atan2(dy, dx), items: [h.item], key: k };
      }
      return null;
    }
    const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const easeTurn = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
    // A turn on the spot (to look at a wall, or out of a dead end), eased
    // in and out; then(), when done; swap: the world behind changes halfway.
    function turn(to, then, swap) {
      const by = angleTo(me.a, to);
      turning = { a0: me.a, by, t: 0, dur: TURN_S * Math.max(0.3, Math.abs(by) / (Math.PI / 2)) ** 0.8, then, swap };
    }

    // The pieces of the way.
    function push(len, at) { pieces.push({ s0: laid, len, at }); laid += len; }
    function line(x0, y0, x1, y1) {
      const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
      push(len, (s) => [x0 + ((x1 - x0) * s) / len, y0 + ((y1 - y0) * s) / len, a]);
    }
    function arc(cx, cy, from, sweep) {           // a quarter of a circle a tile across, from the angle `from` round its middle
      const len = Math.abs(sweep);
      push(len, (s) => { const t = from + (sweep * s) / len; return [cx + Math.cos(t), cy + Math.sin(t), t + (Math.sign(sweep) * Math.PI) / 2]; });
    }
    // Off from standing in a cell, facing the way on.
    function begin() {
      pieces = []; marks = []; laid = odo; ending = null;
      tail = { ci: me.ci, cj: me.cj, dx: Math.round(Math.cos(me.a)), dy: Math.round(Math.sin(me.a)), rest: true };
    }
    // Laid out a few tiles ahead: from one tile before a cell's middle on
    // to one tile before the next one's, straight on or round the corner;
    // into a cell's middle where it stops.
    function lay() {
      while (!ending && laid - odo < 5) {
        while (path.length < 10 && extendPath());   // planned (and hung) well ahead of what can be seen
        const { ci, cj, dx, dy } = tail;
        const x = ci * 2 + 1.5, y = cj * 2 + 1.5;
        if (tail.look) { line(x - dx, y - dy, x, y); ending = { look: tail.look }; break; }
        if (!path.length) { if (!tail.rest) line(x - dx, y - dy, x, y); ending = { rest: true }; break; }
        const [ni, nj] = path[0];
        const ox = ni - ci, oy = nj - cj;
        if (tail.rest) {
          if (ox !== dx || oy !== dy) { ending = { rest: true }; break; }
          line(x, y, x + dx, y + dy);
        } else if (ox === dx && oy === dy) {
          line(x - dx, y - dy, x + dx, y + dy);
        } else if (ox === -dx && oy === -dy) {   // back the way it came: stop, and turn
          line(x - dx, y - dy, x, y);
          ending = { back: true };
          break;
        } else {
          const from = Math.atan2(-oy, -ox);
          arc(x - dx + ox, y - dy + oy, from, angleTo(from, Math.atan2(dy, dx)));
        }
        path.shift();
        marks.push({ s: laid + 0.8, ci: ni, cj: nj });
        visited.add(`${ni},${nj}`);
        tail = { ci: ni, cj: nj, dx: ox, dy: oy, look: lookAt(ni, nj) };
      }
    }
    // Standing still: on, turned to the way first (out of a dead end, now
    // and then the world behind changes while one turns).
    function onward() {
      if (!path.length) extendPath();
      if (!path.length) { wander(); return; }   // shut in (never yet): somewhere else
      const [ni, nj] = path[0];
      const want = Math.atan2(nj - me.cj, ni - me.ci);
      if (Math.abs(angleTo(me.a, want)) < 0.01) { begin(); return; }
      const dead = DIRS.filter(([ex, ey]) => open(me.ci, me.cj, ex, ey)).length === 1;
      turn(want, begin, dead && Math.abs(angleTo(me.a, want)) > 2.5 && Math.random() < 0.55);
    }
    // At the end of the way laid out: in the cell's middle, and what it was for.
    function stopped() {
      const e = ending;
      for (const m of marks) arrive(m.ci, m.cj);
      pieces = []; marks = []; ending = null; v = 0;
      me.x = me.ci * 2 + 1.5; me.y = me.cj * 2 + 1.5;
      if (e.look) { look = e.look; looked.add(look.key); turn(look.a, () => { hud.look(look.items); pause = LOOK_S; }); return; }
      onward();
    }
    function walk(dt) {
      if (turning) {
        const m = turning;
        m.t += dt;
        const p = Math.min(1, m.t / m.dur);
        me.a = m.a0 + m.by * easeTurn(p);
        if (m.swap && p >= 0.5) { m.swap = false; swapWorld(); }
        if (p >= 1) {
          me.a = Math.atan2(Math.sin(m.a0 + m.by), Math.cos(m.a0 + m.by));
          turning = null;
          if (m.then) m.then();
        }
        return;
      }
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) { if (look) { look = null; hud.leave(); } onward(); }
        return;
      }
      if (!tail) { onward(); return; }
      lay();
      // Up to speed and on at it, down only where the way laid out ends.
      v = Math.min(SPEED, v + A * dt);
      if (ending) v = Math.min(v, Math.max(0.05, Math.sqrt(2 * A * Math.max(0, laid - odo))));
      odo = Math.min(laid, odo + v * dt);
      while (pieces.length > 1 && odo >= pieces[0].s0 + pieces[0].len) pieces.shift();
      const p = pieces[0];
      if (p) { [me.x, me.y, me.a] = p.at(Math.min(p.len, odo - p.s0)); }
      while (marks.length && odo >= marks[0].s) { const m = marks.shift(); arrive(m.ci, m.cj); }
      if (ending && odo >= laid - 1e-6) stopped();
    }
    // The world behind gone and another there, the cell one stands in (and
    // the tiles round it, and what hangs on its walls) kept as they were.
    function swapWorld() {
      const keep = new Map(), hold = new Map();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = me.ci * 2 + 1 + dx, ty = me.cj * 2 + 1 + dy;
          keep.set(tileKey(tx, ty), { wall: tile(tx, ty), style: styleAt(tx, ty) });
        }
      }
      let back = null;
      for (const [dx, dy] of DIRS) {
        if (open(me.ci, me.cj, dx, dy)) { back = [me.ci + dx, me.cj + dy]; continue; }
        const face = dx === 1 ? 1 : dx === -1 ? 0 : dy === 1 ? 3 : 2;
        const tx = me.ci * 2 + 1 + dx, ty = me.cj * 2 + 1 + dy;
        const h = hungAt(tx, ty, face);
        if (h) hold.set(faceKey(tx, ty, face), h);
      }
      epoch++;
      kept = keep; held = hold; uncut = back; hung = new Map();
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

    // A door's portal where a ray crosses it: the middle of the doorway's
    // tile, across the way (its distance as the walls', and where along it).
    function portalIn(tx, ty, rx, ry) {
      const o = doorAt(tx, ty);
      if (!o) return null;
      const d = o === 1 ? (tx + 0.5 - me.x) / rx : (ty + 0.5 - me.y) / ry;
      const along = o === 1 ? me.y + d * ry - ty : me.x + d * rx - tx;
      return d > 0.05 && along >= 0 && along <= 1 ? { d, u: along } : null;
    }
    // The portal over a column: what is behind it wobbling up and down as
    // through water, a shimmer of violet, blue and cyan over it (three slow
    // waves across and down), brighter at its edges; faint far off.
    const behind = new Uint32Array(H);
    function drawPortal(x, p, horizon, t) {
      const lh = H / p.d, y0 = horizon - lh / 2;
      const top = Math.max(0, Math.floor(y0)), bottom = Math.min(H, Math.ceil(y0 + lh));
      for (let y = 0; y < H; y++) behind[y] = px[y * W + x];
      const near = Math.max(0.25, 1 - p.d / 14);
      const edgeU = Math.min(p.u, 1 - p.u);
      for (let y = top; y < bottom; y++) {
        const v = (y - y0) / lh;
        const wob = Math.round(Math.sin(v * 13 + t * 2.6 + p.u * 8) * 2.2);
        const src = behind[Math.min(H - 1, Math.max(0, y + wob))];
        const s = (Math.sin(p.u * 7 + t * 1.6) + Math.sin(v * 9 - t * 2.1) + Math.sin((p.u + v) * 5 + t * 0.9) + 3) / 6;
        const edge = Math.max(0, 1 - Math.min(edgeU, v, 1 - v) * 8);
        const a = Math.min(0.85, (0.32 + 0.18 * s + 0.4 * edge) * near);
        const r = 140 - 60 * s, g = 90 + 130 * s, b = 255;
        const sr = src & 255, sg = (src >>> 8) & 255, sb = (src >>> 16) & 255;
        px[y * W + x] = 0xff000000 | ((sb + (b - sb) * a) << 16) | ((sg + (g - sg) * a) << 8) | (sr + (r - sr) * a);
      }
    }

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
        const part = below ? 'floor' : 'ceil';
        let fx = me.x + rowDist * (dirX - planeX), fy = me.y + rowDist * (dirY - planeY);
        const sx = (rowDist * 2 * planeX) / W, sy = (rowDist * 2 * planeY) / W;
        const row = y * W;
        let lastT = -1, levels = null;
        for (let x = 0; x < W; x++) {
          const k = STYLES[styleHere(fx, fy)][part];
          if (k !== lastT) { lastT = k; levels = tex[k][k === T.sky ? Math.min(shade, 8) : k === T.day ? Math.min(shade, 4) : shade]; }
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
        let side = 0, hit = 0, dist = 0, wx = 0, slant = false, which = T.stone;
        let portal = portalIn(mx, my, rx, ry);    // the first door's portal on the way, if any
        for (let i = 0; i < 64 && !hit; i++) {
          if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
          hit = tile(mx, my);
          if (hit) {
            // A plain wall in the style of the space it is seen from.
            // (Seen from a doorway, in the style of the half it is met in.)
            const d = side === 0 ? sdx - ddx : sdy - ddy;
            const fx = side === 0 ? mx - stepX + 0.5 : me.x + d * rx, fy = side === 0 ? me.y + d * ry : my - stepY + 0.5;
            which = hit === 1 ? STYLES[styleHere(fx, fy)].wall : hit - 2;
          } else {
            if (!portal) portal = portalIn(mx, my, rx, ry);
            const d = diagAt(mx, my);
            if (d) {
              // '/': x + y = mx + my + 1; '\': x - y = mx - my.
              const t = d >> 5 === 1 ? (mx + my + 1 - me.x - me.y) / (rx + ry) : (mx - my - me.x + me.y) / (rx - ry);
              const hx = me.x + t * rx;
              if (t > 0 && hx >= mx && hx <= mx + 1) { hit = 1; which = (d & 31) - 1; dist = t; wx = hx - mx; slant = true; }
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
        const pale = paleTex(which);
        // The sides facing north and south a little darker (or whiter), as
        // walls in the old games were; a diagonal between.
        const shade = Math.min(SHADES - 1, shadeOf(dist, seen) + (slant ? 1 : side * 2));
        const levels = tex[which][shade];
        const step = TEX / lineH;
        let v = 0;
        if (top < 0) { v = -top * step; top = 0; }
        if (bottom > H) bottom = H;
        // A picture on this face (not on a hedge, a diagonal), and
        // whether this column crosses it.
        const face = side === 0 ? (stepX > 0 ? 1 : 0) : (stepY > 0 ? 3 : 2);
        const one = !slant && which !== T.hedge && dist < 9 ? painting(mx, my, face) : null;
        const uf = (u + 0.5) / TEX;
        if (one && uf >= one.u0 && uf <= one.u1) {
          // The picture (its frame drawn into it) where this column crosses it.
          const { pic } = one;
          const pu = Math.min(pic.w - 1, Math.floor(((uf - one.u0) / (one.u1 - one.u0)) * pic.w));
          for (let y = top; y < bottom; y++) {
            const vf = v / TEX;
            const p = vf < one.v0 || vf > one.v1 ? 0
              : pic.data[Math.min(pic.h - 1, Math.floor(((vf - one.v0) / (one.v1 - one.v0)) * pic.h)) * pic.w + pu];
            px[y * W + x] = p >>> 24 ? lit(p, shade, pale) : levels[(Math.floor(v) & (TEX - 1)) * TEX + u];
            v += step;
          }
        } else {
          for (let y = top; y < bottom; y++) {
            px[y * W + x] = levels[(Math.floor(v) & (TEX - 1)) * TEX + u];
            v += step;
          }
        }
        if (portal && portal.d < dist) drawPortal(x, portal, horizon, t);
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
      if (once.length) { pool = once; next = 0; return; }
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
      path = []; pause = 0; look = null; gap = EVERY[0]; turning = null;
      pieces = []; marks = []; ending = null; tail = null; v = 0; laid = odo;
      light = lightAt(me.ci, me.cj);
    }
    // Somewhere new each time: a cell far off in the maze without end, in a
    // new world (every cell is open but a cut corner's; the chunks are made
    // as they are walked into).
    function wander() {
      const far = () => Math.floor((Math.random() * 2 - 1) * 60000);
      epoch = Math.floor(Math.random() * 1000);
      kept = new Map(); held = new Map(); uncut = null; hung = new Map(); looked.clear();
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
    return { start, stop, visit, swap: swapWorld, debug: () => ({ ...me, path: path.slice(0, 4), move: turning ? 'turn' : pieces.length ? 'glide' : null, v, pause, cost, light, epoch }) };
  };
})(window.PioneerTV);
