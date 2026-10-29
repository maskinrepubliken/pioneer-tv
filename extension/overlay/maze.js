// Pioneer TV screensaver: a maze without end, walked by itself, in the
// manner of the old dungeon games (Ultima Underworld): stone walls, a
// flagstone floor, a ceiling of blocks, all of it dark but for the torch
// one carries, which flickers. Along the way lie the covers kept on the
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
  const T_WALLS = 4, T_FLOOR = 4, T_CEIL = 5, T_DOOR = 6;
  const SHADES = 24;                     // steps of darkness
  const CHUNK = 8, SIDE = CHUNK * 2;     // cells, tiles to a chunk
  const FOV = 0.7;                       // the camera plane's half width
  const SPEED = 1.35;                    // tiles a second
  const TURN = 2.4;                      // radians a second

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

  // ------------------------------------------------------------ the maze
  // A chunk's tiles: 0 open, 1-4 a wall of that stone, 7 a wooden door
  // set in a wall. Its west column and north row are its borders.
  const chunks = new Map();
  function chunk(cx, cy) {
    const k = `${cx},${cy}`;
    let c = chunks.get(k);
    if (c) return c;
    c = new Uint8Array(SIDE * SIDE);
    const stone = 1 + Math.floor(hash(cx, cy, 1) * T_WALLS);
    c.fill(stone);
    const rand = rng(Math.floor(hash(cx, cy, 2) * 4294967295));
    // A perfect maze over its cells (tiles 1, 3 .. 15).
    const seen = new Uint8Array(CHUNK * CHUNK);
    const stack = [[Math.floor(rand() * CHUNK), Math.floor(rand() * CHUNK)]];
    seen[stack[0][1] * CHUNK + stack[0][0]] = 1;
    c[(stack[0][1] * 2 + 1) * SIDE + stack[0][0] * 2 + 1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < CHUNK && ny < CHUNK && !seen[ny * CHUNK + nx];
      });
      if (!next.length) { stack.pop(); continue; }
      const [dx, dy] = next[Math.floor(rand() * next.length)];
      const nx = x + dx, ny = y + dy;
      seen[ny * CHUNK + nx] = 1;
      c[(ny * 2 + 1) * SIDE + nx * 2 + 1] = 0;
      c[(y * 2 + 1 + dy) * SIDE + x * 2 + 1 + dx] = 0;
      stack.push([nx, ny]);
    }
    // A few walls knocked through, so there are loops and not only dead ends.
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(rand() * (SIDE - 2)), y = 1 + Math.floor(rand() * (SIDE - 2));
      if ((x + y) % 2 === 1) c[y * SIDE + x] = 0;
    }
    // Doors to the chunk west and the chunk north: two each.
    for (const side of [0, 1]) {
      for (let d = 0; d < 2; d++) {
        const at = Math.floor(hash(cx, cy, 10 + side * 2 + d) * CHUNK) * 2 + 1;
        if (side === 0) c[at * SIDE] = 0; else c[at] = 0;
      }
    }
    // Here and there a wooden door in a wall, for the look of it.
    for (let i = 0; i < SIDE * SIDE; i++) if (c[i] && rand() < 0.025) c[i] = 7;
    chunks.set(k, c);
    if (chunks.size > 64) forget();
    return c;
  }
  // The chunks far behind go.
  let here = [0, 0];
  function forget() {
    for (const k of chunks.keys()) {
      const [x, y] = k.split(',').map(Number);
      if (Math.abs(x - here[0]) > 3 || Math.abs(y - here[1]) > 3) chunks.delete(k);
    }
  }
  function tile(tx, ty) {
    const cx = Math.floor(tx / SIDE), cy = Math.floor(ty / SIDE);
    return chunk(cx, cy)[(ty - cy * SIDE) * SIDE + (tx - cx * SIDE)];
  }
  // Cells are the odd tiles; two cells meet where the tile between is open.
  const open = (ci, cj, dx, dy) => tile(ci * 2 + 1 + dx, cj * 2 + 1 + dy) === 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ------------------------------------------------------------ the finds
  // About one cell in eleven has something lying in it; what, comes from
  // the list in turn as the cell is first seen.
  const hasFind = (ci, cj) => !(ci === 0 && cj === 0) && hash(ci, cj, 5) < 0.09;
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
      path = route(wantFind, 7)
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
        pause = 1.4;
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
    const torch = (t) => 0.92 + 0.05 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 5.3 + 1.7);
    const shadeOf = (dist, light) => Math.min(SHADES - 1, Math.max(0, Math.floor((dist * 0.95 / light) ** 1.1 * SHADES / 6)));

    function draw(t) {
      const light = torch(t);
      const dirX = Math.cos(me.a), dirY = Math.sin(me.a);
      const planeX = -dirY * FOV, planeY = dirX * FOV;
      const half = H / 2;
      // A little bob as one walks.
      const bob = Math.round(Math.sin(t * 7) * (path.length && pause <= 0 ? 1.2 : 0));
      const horizon = half + bob;
      // Floor and ceiling, a row at a time.
      const floorT = tex[T_FLOOR], ceilT = tex[T_CEIL];
      for (let y = 0; y < H; y++) {
        const below = y > horizon;
        const p = below ? y - horizon : horizon - y;
        if (p < 1) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000; continue; }
        const rowDist = half / p;
        const levels = (below ? floorT : ceilT)[shadeOf(rowDist, light)];
        let fx = me.x + rowDist * (dirX - planeX), fy = me.y + rowDist * (dirY - planeY);
        const sx = (rowDist * 2 * planeX) / W, sy = (rowDist * 2 * planeY) / W;
        const row = y * W;
        for (let x = 0; x < W; x++) {
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
        const which = hit === 7 ? T_DOOR : (hit || 1) - 1;
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
        const h = Math.floor((H / ty) * 0.5);
        const w = Math.floor(h * ratio);
        const lift = (H / ty) * (0.06 + 0.02 * Math.sin(t * 1.6 + s.i * 1.3 + s.j));
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
    return { start, stop, debug: () => ({ ...me, path: path.slice(0, 4), pause, cost }) };
  };
})(window.PioneerTV);
