// Pioneer TV screensaver: a maze without end, walked by itself, in the
// manner of the old dungeon games (Ultima Underworld): parts of it in
// their own stones (walls, floors, ceilings), now and then a room (a hall
// of pillars, a garden under the stars, a ballroom, a treasury), all of it
// dark but for the torch one carries, which flickers. Along the way lie the covers kept on the
// box, games', films', series' and albums' (the daemon's /api/finds); the
// walker goes and picks each up, and the screen says what was found.
//
// A raycaster on a small canvas (320 by 180, scaled up with its pixels
// kept square), twenty frames a second: the walls one column at a time,
// the floor and ceiling a row at a time, the covers as columns drawn over
// them where no wall is nearer. The maze comes in chunks of 8 by 8 cells,
// each a perfect maze of its own (a seeded backtracker) with a few doors
// to the chunks west and north of it, so the whole is one maze, made as
// it is walked into and forgotten behind. The textures are Screaming
// Brain Studios' Tiny Texture Pack (CC0), made small (maze/textures.png).
//
//   M.maze(canvas, hud) -> { start, stop }
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const W = 320, H = 180;                // the picture, in pixels
  const FPS = 20;
  const TEX = 64;                        // a texture's side
  const SHADES = 24;                     // steps of darkness
  const CHUNK = 8, SIDE = CHUNK * 2;     // cells, tiles to a chunk
  const FOV = 0.7;                       // the camera plane's half width
  // Unhurried: a slow stroll, slow turns, now and then a find.
  const SPEED = 0.8;                     // tiles a second
  const TURN = 1.1;                      // radians a second

  // The textures (maze/textures.png, one under the other).
  const T = {
    stone: 0, moss: 1, dirt: 2, sand: 3, flags: 4, blocks: 5, door: 6, slate: 7, brick: 8,
    tiles: 9, planks: 10, marble: 11, grass: 12, hedge: 13, sky: 14, beams: 15,
  };
  // Parts of the maze, each in its own stones: walls (one of these per
  // wall), its floor and its ceiling. A zone is 5 by 5 cells.
  const THEMES = [
    { walls: [T.stone, T.brick], floor: T.flags, ceil: T.blocks },
    { walls: [T.moss, T.dirt], floor: T.flags, ceil: T.beams },
    { walls: [T.sand], floor: T.planks, ceil: T.beams },
    { walls: [T.slate, T.brick], floor: T.tiles, ceil: T.blocks },
    { walls: [T.dirt, T.stone], floor: T.planks, ceil: T.blocks },
  ];
  // Rooms that turn up now and then, a chunk's open middle: a hall of
  // pillars, a garden under the stars with hedges round it, a ballroom
  // floored in marble, a treasury with many things lying about.
  const ROOMS = ['hall', 'garden', 'ballroom', 'treasury'];

  // ------------------------------------------------------------ chance
  // A number from a few others, the same every time.
  function hash(a, b, c = 0) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  }
  const themeOf = (ci, cj) => THEMES[Math.floor(hash(Math.floor(ci / 5), Math.floor(cj / 5), 3) * THEMES.length)];

  // ------------------------------------------------------------ the maze
  // A chunk: per tile its wall (0 open, else a texture + 1), its floor and
  // its ceiling; and its room, if it has one. Its west column and north
  // row are its borders.
  const chunks = new Map();
  const keyOf = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
  let lastKey = NaN, lastChunk = null;
  function chunk(cx, cy) {
    const k = keyOf(cx, cy);
    if (k === lastKey) return lastChunk;
    let c = chunks.get(k);
    if (!c) { c = make(cx, cy); chunks.set(k, c); if (chunks.size > 64) forget(); }
    lastKey = k; lastChunk = c;
    return c;
  }
  function make(cx, cy) {
    const wall = new Uint8Array(SIDE * SIDE), floor = new Uint8Array(SIDE * SIDE), ceil = new Uint8Array(SIDE * SIDE);
    const rand = rng(Math.floor(hash(cx, cy, 2) * 4294967295));
    // Every tile in its zone's stones.
    for (let ly = 0; ly < SIDE; ly++) {
      for (let lx = 0; lx < SIDE; lx++) {
        const tx = cx * SIDE + lx, ty = cy * SIDE + ly;
        const th = themeOf(Math.floor(tx / 2), Math.floor(ty / 2));
        const i = ly * SIDE + lx;
        wall[i] = 1 + th.walls[Math.floor(hash(tx, ty, 4) * th.walls.length)];
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
    if (!(cx === 0 && cy === 0) && hash(cx, cy, 6) < 0.45) {
      const kind = ROOMS[Math.floor(hash(cx, cy, 7) * ROOMS.length)];
      const w = 3 + Math.floor(rand() * 2), h = 3 + Math.floor(rand() * 2);
      const x0 = 1 + Math.floor(rand() * (CHUNK - w - 1)), y0 = 1 + Math.floor(rand() * (CHUNK - h - 1));
      room = { kind, x0: cx * CHUNK + x0, y0: cy * CHUNK + y0, x1: cx * CHUNK + x0 + w - 1, y1: cy * CHUNK + y0 + h - 1 };
      // Its tiles, and the ring of wall round it.
      for (let ly = y0 * 2; ly <= (y0 + h - 1) * 2 + 2; ly++) {
        for (let lx = x0 * 2; lx <= (x0 + w - 1) * 2 + 2; lx++) {
          const i = ly * SIDE + lx;
          const inside = lx > x0 * 2 && ly > y0 * 2 && lx < (x0 + w - 1) * 2 + 2 && ly < (y0 + h - 1) * 2 + 2;
          if (inside) {
            const pillar = lx % 2 === 0 && ly % 2 === 0;
            wall[i] = kind === 'hall' && pillar ? 1 + T.stone : 0;
          } else if (wall[i]) {
            wall[i] = 1 + ({ garden: T.hedge, ballroom: T.sand, hall: T.stone, treasury: T.brick })[kind];
          }
          floor[i] = ({ garden: T.grass, ballroom: T.marble, hall: T.flags, treasury: T.tiles })[kind];
          ceil[i] = ({ garden: T.sky, ballroom: T.beams, hall: T.blocks, treasury: T.blocks })[kind];
        }
      }
    }
    // Doors to the chunk west and the chunk north: two each.
    for (const side of [0, 1]) {
      for (let d = 0; d < 2; d++) {
        const at = Math.floor(hash(cx, cy, 10 + side * 2 + d) * CHUNK) * 2 + 1;
        if (side === 0) wall[at * SIDE] = 0; else wall[at] = 0;
      }
    }
    // Here and there a wooden door in a wall, for the look of it.
    for (let i = 0; i < SIDE * SIDE; i++) if (wall[i] && wall[i] !== 1 + T.hedge && rand() < 0.02) wall[i] = 1 + T.door;
    return { wall, floor, ceil, room };
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
  // A tile's wall, floor or ceiling (tx, ty whole numbers: >> 4 is a
  // chunk, & 15 a tile in it, negative ones too).
  const tile = (tx, ty) => chunk(tx >> 4, ty >> 4).wall[(ty & 15) * SIDE + (tx & 15)];
  const floorAt = (tx, ty) => chunk(tx >> 4, ty >> 4).floor[(ty & 15) * SIDE + (tx & 15)];
  const ceilAt = (tx, ty) => chunk(tx >> 4, ty >> 4).ceil[(ty & 15) * SIDE + (tx & 15)];
  // Cells are the odd tiles; two cells meet where the tile between is open.
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const open = (ci, cj, dx, dy) => tile(ci * 2 + 1 + dx, cj * 2 + 1 + dy) === 0;
  const roomAt = (ci, cj) => {
    const r = chunk((ci * 2 + 1) >> 4, (cj * 2 + 1) >> 4).room;
    return r && ci >= r.x0 && ci <= r.x1 && cj >= r.y0 && cj <= r.y1 ? r : null;
  };

  // ------------------------------------------------------------ the finds
  // About one cell in thirty has something lying in it, and many in a
  // treasury; what, comes from the list in turn as the cell is first seen
  // (what was played or watched lately comes first in it).
  const hasFind = (ci, cj) => {
    if (ci === 0 && cj === 0) return false;
    const r = roomAt(ci, cj);
    return hash(ci, cj, 5) < (r && r.kind === 'treasury' ? 0.5 : 0.033);
  };
  const placed = new Map();              // "ci,cj" -> find (or null: taken)
  let finds = [], nextFind = 0;
  function findAt(ci, cj) {
    const k = `${ci},${cj}`;
    if (placed.has(k)) return placed.get(k);
    if (!finds.length) return null;
    const f = finds[nextFind++ % finds.length];
    placed.set(k, f);
    return f;
  }

  // ------------------------------------------------------------ textures
  // Each texture at SHADES darknesses, as rows of 32-bit pixels.
  function shadeTables(img) {
    const c = document.createElement('canvas');
    c.width = TEX; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = new Uint32Array(g.getImageData(0, 0, TEX, img.height).data.buffer);
    const count = Math.floor(img.height / TEX);
    const tables = [];
    for (let t = 0; t < count; t++) {
      const levels = [];
      for (let s = 0; s < SHADES; s++) {
        const k = (1 - s / SHADES) ** 1.6;
        const out = new Uint32Array(TEX * TEX);
        for (let i = 0; i < TEX * TEX; i++) {
          const p = data[t * TEX * TEX + i];
          const r = (p & 255) * k, gg = ((p >>> 8) & 255) * k, b = ((p >>> 16) & 255) * k;
          // A warm torchlight: a little more red, a little less blue.
          out[i] = 0xff000000 | (Math.min(255, b * 0.82) << 16) | (Math.min(255, gg * 0.95) << 8) | Math.min(255, r * 1.08);
        }
        levels.push(out);
      }
      tables.push(levels);
    }
    return tables;
  }

  M.maze = function (canvas, hud) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const frame = ctx.createImageData(W, H);
    const px = new Uint32Array(frame.data.buffer);
    const zbuf = new Float32Array(W);
    let tex = null;
    const img = new Image();
    img.onload = () => { tex = shadeTables(img); };
    img.src = new URL('maze/textures.png', document.baseURI).href;

    // Where one is: in tiles, facing a, walking from cell to cell.
    const me = { x: 1.5, y: 1.5, a: 0, ci: 0, cj: 0 };
    let path = [];                       // cells still to walk to
    let pause = 0;                       // seconds standing still
    const visited = new Set(['0,0']);
    let found = [];                      // what was picked up, newest last

    // ---------------------------------------------------------- walking
    // A way to the nearest cell wanted (a find, else a cell not yet
    // walked), breadth first, no further than `far` steps.
    // (A find is gone for further away than a few cells: it is come upon,
    // not hunted.)
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
      const wantFind = (i, j) => hasFind(i, j) && findAt(i, j);
      path = route(wantFind, 4)
        || route((i, j) => !visited.has(`${i},${j}`), 40)
        || [DIRS.map(([dx, dy]) => [me.ci + dx, me.cj + dy, dx, dy]).filter(([, , dx, dy]) => open(me.ci, me.cj, dx, dy))[0]].filter(Boolean);
    }
    function arrive() {
      visited.add(`${me.ci},${me.cj}`);
      if (visited.size > 4000) {
        for (const k of visited) { const [i, j] = k.split(',').map(Number); if (Math.abs(i - me.ci) + Math.abs(j - me.cj) > 60) visited.delete(k); }
      }
      here = [Math.floor((me.ci * 2 + 1) / SIDE), Math.floor((me.cj * 2 + 1) / SIDE)];
      const k = `${me.ci},${me.cj}`;
      const f = hasFind(me.ci, me.cj) ? findAt(me.ci, me.cj) : null;
      if (f) {
        placed.set(k, null);
        found.push(f);
        if (found.length > 6) found = found.slice(-6);
        hud.found(f, found);
        pause = 3;
      }
    }
    const turnTo = (a, want, dt) => {
      let d = Math.atan2(Math.sin(want - a), Math.cos(want - a));
      const step = TURN * dt;
      return Math.abs(d) <= step ? want : a + Math.sign(d) * step;
    };
    // Steering by a point a little way ahead along the way (the cells'
    // centres one after the other): the corners are rounded, not turned
    // on the spot facing a wall; a way back is turned to first, slowing.
    const AHEAD = 0.8;
    function carrot() {
      let px = me.x, py = me.y, left = AHEAD;
      for (const [i, j] of path) {
        const tx = i * 2 + 1.5, ty = j * 2 + 1.5;
        const d = Math.hypot(tx - px, ty - py);
        if (d >= left) return [px + ((tx - px) / d) * left, py + ((ty - py) / d) * left];
        left -= d; px = tx; py = ty;
      }
      return [px, py];
    }
    function walk(dt) {
      if (pause > 0) { pause -= dt; return; }
      if (!path.length) plan();
      if (!path.length) return;
      const [cx, cy] = carrot();
      const want = Math.atan2(cy - me.y, cx - me.x);
      me.a = turnTo(me.a, want, dt);
      const off = Math.abs(Math.atan2(Math.sin(want - me.a), Math.cos(want - me.a)));
      const pace = off > 1.2 ? 0 : Math.cos(off) ** 2;
      const step = Math.min(Math.hypot(cx - me.x, cy - me.y), SPEED * dt * pace);
      me.x += Math.cos(want) * step;
      me.y += Math.sin(want) * step;
      // At a cell when near its centre (a rounded corner passes it by a
      // little; the last cell of the way is stood in).
      const [ni, nj] = path[0];
      const near = path.length > 1 ? 0.6 : 0.08;
      if (Math.hypot(ni * 2 + 1.5 - me.x, nj * 2 + 1.5 - me.y) < near) {
        me.ci = ni; me.cj = nj;
        path.shift();
        arrive();
      }
    }

    // ---------------------------------------------------------- drawing
    // The torch: brighter and darker in slow waves, never a blink.
    const torch = (t) => 0.94 + 0.03 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 3.1 + 1.7);
    const shadeOf = (dist, light) => Math.min(SHADES - 1, Math.max(0, Math.floor((dist * 0.95 / light) ** 1.1 * SHADES / 6)));

    function draw(t) {
      const light = torch(t);
      const dirX = Math.cos(me.a), dirY = Math.sin(me.a);
      const planeX = -dirY * FOV, planeY = dirX * FOV;
      const half = H / 2;
      // A little bob as one walks.
      const bob = Math.round(Math.sin(t * 4) * (path.length && pause <= 0 ? 0.6 : 0));
      const horizon = half + bob;
      // Floor and ceiling, a row at a time, each tile its own (a room's
      // marble or grass; the stars over a garden lit by themselves).
      for (let y = 0; y < H; y++) {
        const below = y > horizon;
        const p = below ? y - horizon : horizon - y;
        if (p < 1) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000; continue; }
        const rowDist = half / p;
        const shade = shadeOf(rowDist, light);
        const at = below ? floorAt : ceilAt;
        let fx = me.x + rowDist * (dirX - planeX), fy = me.y + rowDist * (dirY - planeY);
        const sx = (rowDist * 2 * planeX) / W, sy = (rowDist * 2 * planeY) / W;
        const row = y * W;
        let lastT = -1, levels = null;
        for (let x = 0; x < W; x++) {
          const t = at(Math.floor(fx), Math.floor(fy));
          if (t !== lastT) { lastT = t; levels = tex[t][t === T.sky ? Math.min(shade, 6) : shade]; }
          const u = (fx * TEX) & (TEX - 1), v = (fy * TEX) & (TEX - 1);
          px[row + x] = levels[v * TEX + u];
          fx += sx; fy += sy;
        }
      }
      // The walls, a column at a time (DDA through the tiles).
      for (let x = 0; x < W; x++) {
        const cam = (2 * x) / W - 1;
        const rx = dirX + planeX * cam, ry = dirY + planeY * cam;
        let mx = Math.floor(me.x), my = Math.floor(me.y);
        const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
        const stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
        let sdx = (rx < 0 ? me.x - mx : mx + 1 - me.x) * ddx;
        let sdy = (ry < 0 ? me.y - my : my + 1 - me.y) * ddy;
        let side = 0, hit = 0;
        for (let i = 0; i < 64 && !hit; i++) {
          if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
          hit = tile(mx, my);
        }
        const dist = side === 0 ? sdx - ddx : sdy - ddy;
        zbuf[x] = dist;
        const lineH = Math.floor(H / dist);
        let top = Math.floor(horizon - lineH / 2), bottom = top + lineH;
        let wx = side === 0 ? me.y + dist * ry : me.x + dist * rx;
        wx -= Math.floor(wx);
        let u = Math.floor(wx * TEX);
        if ((side === 0 && rx > 0) || (side === 1 && ry < 0)) u = TEX - 1 - u;
        const which = (hit || 1) - 1;
        // The sides facing north and south a little darker, as walls in the old games were.
        const levels = tex[which][Math.min(SHADES - 1, shadeOf(dist, light) + side * 2)];
        const step = TEX / lineH;
        let v = 0;
        if (top < 0) { v = -top * step; top = 0; }
        if (bottom > H) bottom = H;
        for (let y = top; y < bottom; y++) {
          px[y * W + x] = levels[(Math.floor(v) & (TEX - 1)) * TEX + u];
          v += step;
        }
      }
      ctx.putImageData(frame, 0, 0);
      sprites(dirX, dirY, planeX, planeY, horizon, light, t);
    }

    // The finds near enough to see, as columns where no wall is nearer:
    // the cover standing on the floor, a little way up, bobbing gently.
    const images = new Map();
    function picture(f) {
      let im = images.get(f.url);
      if (!im) {
        im = new Image();
        im.src = f.url;
        images.set(f.url, im);
        if (images.size > 120) images.delete(images.keys().next().value);
      }
      return im.complete && im.naturalWidth ? im : null;
    }
    function sprites(dirX, dirY, planeX, planeY, horizon, light, t) {
      const near = [];
      for (let dj = -6; dj <= 6; dj++) {
        for (let di = -6; di <= 6; di++) {
          const i = me.ci + di, j = me.cj + dj;
          if (!hasFind(i, j)) continue;
          const f = findAt(i, j);
          if (!f) continue;
          const sx = i * 2 + 1.5 - me.x, sy = j * 2 + 1.5 - me.y;
          near.push({ f, sx, sy, d: sx * sx + sy * sy, i, j });
        }
      }
      near.sort((a, b) => b.d - a.d);
      const inv = 1 / (planeX * dirY - dirX * planeY);
      for (const s of near) {
        const im = picture(s.f);
        if (!im) continue;
        const tx = inv * (dirY * s.sx - dirX * s.sy);
        const ty = inv * (-planeY * s.sx + planeX * s.sy);
        if (ty <= 0.2) continue;
        const screenX = Math.floor((W / 2) * (1 + tx / ty));
        const ratio = im.naturalWidth / im.naturalHeight;
        const h = Math.floor((H / ty) * 0.7);
        const w = Math.floor(h * ratio);
        const lift = (H / ty) * (0.04 + 0.01 * Math.sin(t * 0.9 + s.i * 1.3 + s.j));
        const y0 = Math.floor(horizon + (H / ty) / 2 - h - lift);
        const x0 = screenX - Math.floor(w / 2);
        const dark = 1 - Math.min(1, (1 - shadeOf(ty, light) / SHADES) ** 1.4);
        ctx.fillStyle = `rgba(0,0,0,${dark.toFixed(2)})`;
        for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
          if (ty >= zbuf[x]) continue;
          const srcX = Math.floor(((x - x0) / w) * im.naturalWidth);
          ctx.drawImage(im, srcX, 0, 1, im.naturalHeight, x, y0, 1, h);
          if (dark > 0.02) ctx.fillRect(x, y0, 1, h);
        }
      }
    }

    // ---------------------------------------------------------- running
    let timer = null, last = 0, begun = performance.now();
    let cost = 0;                        // ms a frame takes, smoothed (debug)
    async function load() {
      try {
        const r = await fetch('/api/finds?n=60');
        const d = await r.json();
        if (Array.isArray(d.finds) && d.finds.length) { finds = d.finds; nextFind = 0; }
      } catch { /* no finds: the maze alone */ }
    }
    function tick() {
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (!tex) return;
      walk(dt);
      draw((now - begun) / 1000);
      cost = cost * 0.95 + (performance.now() - now) * 0.05;
    }
    function start() {
      if (timer) return;
      last = performance.now();
      if (!finds.length) load();
      timer = setInterval(tick, 1000 / FPS);
    }
    function stop() { clearInterval(timer); timer = null; }
    // Facing the first open way.
    const first = DIRS.find(([dx, dy]) => open(0, 0, dx, dy));
    if (first) me.a = Math.atan2(first[1], first[0]);
    load();
    start();
    // Straight into a room of a kind (the catalogue of views, tests): the
    // nearest chunk that has one, in its middle.
    function visit(kind) {
      for (let r = 1; r < 12; r++) {
        for (let cy = -r; cy <= r; cy++) {
          for (let cx = -r; cx <= r; cx++) {
            const room = chunk(cx, cy).room;
            if (!room || room.kind !== kind) continue;
            me.ci = Math.floor((room.x0 + room.x1) / 2); me.cj = Math.floor((room.y0 + room.y1) / 2);
            me.x = me.ci * 2 + 1.5; me.y = me.cj * 2 + 1.5; me.a = 0.4;
            path = []; pause = 0;
            arrive();
            return true;
          }
        }
      }
      return false;
    }
    return { start, stop, visit, debug: () => ({ ...me, path: path.slice(0, 4), pause, cost }) };
  };
})(window.PioneerTV);
