// Pioneer TV: stand-ins for a missing cover, drawn here as empty packaging
// with the name on it, so a shelf without a picture still looks like a
// shelf of things. A game's after its console's own box, as near the real
// one as a drawing gets (a home project: the makers' marks are drawn too):
// the NES's black box with its seal, the SNES's and the N64's lying down,
// the Mega Drive's grid, the Master System's white grid, a PC big box,
// the Game Boys' cartons, PlayStation's black spine, a Saturn's or a
// Dreamcast's case, a Neo Geo's. Else a record sleeve, a film's case, a
// still's frame, in the system's own colours.
//
//   M.mockups.svg(kind, name) -> an <svg> as a string (its width and height
//   its shape; CSS sizes it)
//   M.mockups.forConsole(slug) -> the kind for a console of RomM's
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const INK = '#1c1613', PAPER = '#f4efe4', SUNKEN = '#e9e3d4', LINE = '#7b756f';
  const RUST = '#7a4e33', OCHRE = '#e8b23a', RED = '#a8352a', GREEN = '#2f6b4f', BLUE = '#33557a', GREY = '#cfcac1';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // The name in lines that fit a label w wide, at most three, as large as
  // that allows up to size; Rubik capitals, as every title of the box's.
  function title(name, x, y, w, h, size, fill) {
    const words = String(name || '').toUpperCase().split(/\s+/).filter(Boolean);
    const per = Math.max(6, Math.round(w / (size * 0.74)));
    const lines = [];
    for (const word of words) {
      const last = lines[lines.length - 1];
      if (last && (last + ' ' + word).length <= per) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    // More than three: the rest on the third, smaller, cut only when very long.
    if (lines.length > 3) {
      let rest = lines.splice(2).join(' ');
      if (rest.length > per * 2) rest = rest.slice(0, per * 2 - 1).replace(/\s*\S*$/, '') + '…';
      lines.push(rest);
    }
    const longest = Math.max(1, ...lines.map((l) => l.length));
    const fs = Math.min(size, w / (longest * 0.74), h / (lines.length * 1.05));
    const top = y + (h - lines.length * fs * 1.05) / 2 + fs * 0.85;
    return `<text x="${x + w / 2}" text-anchor="middle" fill="${fill}" font-size="${fs.toFixed(1)}" font-weight="900" `
      + `style="font-family: var(--pioneertv-font-display), sans-serif; letter-spacing: -0.01em">`
      + lines.map((l, i) => `<tspan x="${x + w / 2}" y="${(top + i * fs * 1.05).toFixed(1)}">${esc(l)}</tspan>`).join('') + '</text>';
  }
  const svg = (w, h, body) => `<svg class="mockup" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
  const lines = (x, y, w, h, gap, stroke) => {
    let out = '';
    for (let yy = y; yy <= y + h; yy += gap) out += `<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${stroke}" stroke-width="2"/>`;
    return out;
  };
  const grid = (x, y, w, h, gap, stroke) => {
    let out = lines(x, y, w, h, gap, stroke);
    for (let xx = x; xx <= x + w; xx += gap) out += `<line x1="${xx}" y1="${y}" x2="${xx}" y2="${y + h}" stroke="${stroke}" stroke-width="2"/>`;
    return out;
  };

  // A maker's mark in plain heavy type: x, y its start (or middle, anchor).
  const word = (text, x, y, size, fill, { anchor = 'start', italic = false, weight = 900, spacing = 0, rotate = 0 } = {}) =>
    `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"`
    + `${italic ? ' font-style="italic"' : ''}${rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : ''}`
    + ` style="font-family: Arial, Helvetica, sans-serif; letter-spacing: ${spacing}em">${esc(text)}</text>`;
  // Nintendo's oval: the name in a pill.
  const nintendo = (x, y, h, fill) => `<rect x="${x}" y="${y}" width="${h * 3.4}" height="${h}" rx="${h / 2}" fill="none" stroke="${fill}" stroke-width="${h * 0.09}"/>`
    + word('Nintendo', x + h * 1.7, y + h * 0.7, h * 0.58, fill, { anchor: 'middle', weight: 700 });
  // The Seal of Quality: a gold oval, a starburst round it.
  const seal = (cx, cy, r) => {
    let rays = '';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, b = a + Math.PI / 24;
      rays += `${(cx + Math.cos(a) * r * 1.25).toFixed(1)},${(cy + Math.sin(a) * r * 0.95).toFixed(1)} ${(cx + Math.cos(b) * r).toFixed(1)},${(cy + Math.sin(b) * r * 0.76).toFixed(1)} `;
    }
    return `<polygon points="${rays}" fill="#d9a520"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.86}" ry="${r * 0.64}" fill="#f2c94c" stroke="#8a6410" stroke-width="2"/>`
      + word('OFFICIAL', cx, cy - r * 0.2, r * 0.2, '#5a3f05', { anchor: 'middle' })
      + word('Nintendo', cx, cy + r * 0.08, r * 0.28, '#a8352a', { anchor: 'middle', weight: 700 })
      + word('SEAL OF QUALITY', cx, cy + r * 0.34, r * 0.15, '#5a3f05', { anchor: 'middle' });
  };
  // The SNES's four buttons, a diamond.
  const snesDots = (cx, cy, r) => [['#a8352a', 1, 0], ['#e8b23a', 0, 1], ['#2f6b4f', -1, 0], ['#33557a', 0, -1]]
    .map(([c, dx, dy]) => `<circle cx="${cx + dx * r * 1.15}" cy="${cy + dy * r * 1.15}" r="${r}" fill="${c}"/>`).join('');
  // The N64's cube: four coloured faces of an N.
  const n64Cube = (x, y, s) => `<polygon points="${x},${y + s * 0.3} ${x + s * 0.5},${y} ${x + s * 0.5},${y + s * 0.7} ${x},${y + s}" fill="#2e6fbf"/>`
    + `<polygon points="${x + s * 0.5},${y} ${x + s},${y + s * 0.3} ${x + s},${y + s} ${x + s * 0.5},${y + s * 0.7}" fill="#2f9a4f"/>`
    + `<polygon points="${x + s * 0.18},${y + s * 0.42} ${x + s * 0.5},${y + s * 0.22} ${x + s * 0.82},${y + s * 0.42} ${x + s * 0.5},${y + s * 0.62}" fill="#d23a2a"/>`
    + `<polygon points="${x + s * 0.5},${y + s * 0.62} ${x + s * 0.82},${y + s * 0.42} ${x + s * 0.82},${y + s * 0.6} ${x + s * 0.5},${y + s * 0.8}" fill="#f2b81e"/>`;
  // PlayStation's mark: the P standing, the S lying behind it, in four colours.
  const psMark = (x, y, s) => `<polygon points="${x + s * 0.1},${y + s * 0.62} ${x + s * 0.5},${y + s * 0.5} ${x + s * 0.9},${y + s * 0.62} ${x + s * 0.5},${y + s * 0.74}" fill="#f2b81e"/>`
    + `<polygon points="${x + s * 0.1},${y + s * 0.62} ${x + s * 0.5},${y + s * 0.74} ${x + s * 0.5},${y + s * 0.86} ${x + s * 0.1},${y + s * 0.74}" fill="#2f9a4f"/>`
    + `<polygon points="${x + s * 0.5},${y + s * 0.74} ${x + s * 0.9},${y + s * 0.62} ${x + s * 0.9},${y + s * 0.74} ${x + s * 0.5},${y + s * 0.86}" fill="#2e6fbf"/>`
    + `<path d="M${x + s * 0.36} ${y + s * 0.66} V${y + s * 0.06} L${x + s * 0.64} ${y + s * 0.14} Q${x + s * 0.86} ${y + s * 0.22} ${x + s * 0.72} ${y + s * 0.42} Q${x + s * 0.62} ${y + s * 0.5} ${x + s * 0.5} ${y + s * 0.44} V${y + s * 0.2} L${x + s * 0.46} ${y + s * 0.19} V${y + s * 0.7} Z" fill="#d23a2a"/>`;
  // The art's place: paper, with the name on it.
  const art = (x, y, w, h, n, size, fill = SUNKEN, ink = INK) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>` + title(n, x + w * 0.06, y + h * 0.08, w * 0.88, h * 0.84, size, ink);

  // A Game Boy's carton: a band with the system's name in its colours, the
  // Nintendo oval over it, the picture, the seal.
  function handheld(n, ground, band, name, frame) {
    let x = 30;
    const spans = name.map(([t, c]) => `<tspan fill="${c}">${esc(t)}</tspan>`).join('');
    return svg(500, 620, `<rect width="500" height="620" fill="${frame}"/>`
      + `<rect width="500" height="110" fill="${band}"/>`
      + nintendo(x, 16, 30, ground)
      + `<text x="${x}" y="94" font-size="40" font-weight="900" font-style="italic" style="font-family: Arial, Helvetica, sans-serif">${spans}</text>`
      + art(30, 130, 440, 420, n, 62)
      + seal(436, 580, 30));
  }

  const DRAW = {
    // The NES's black box: scanlines across the black, the name at the top,
    // the picture's window, the system's name and the seal at its foot.
    nes: (n) => svg(500, 700, `<rect width="500" height="700" fill="#0d0d0d"/>`
      + lines(0, 4, 500, 692, 8, '#232323')
      + title(n, 30, 26, 440, 130, 60, '#e94b3c')
      + `<rect x="58" y="176" width="384" height="364" fill="#1a1a1a" stroke="#6b6b6b" stroke-width="4"/>`
      + art(70, 188, 360, 340, '', 10)
      + grid(70, 188, 360, 340, 20, '#ddd6c6')
      + nintendo(30, 588, 34, '#e94b3c')
      + word('ENTERTAINMENT', 30, 648, 22, '#f4efe4', { spacing: 0.06 }) + word('SYSTEM', 30, 674, 22, '#f4efe4', { spacing: 0.06 })
      + seal(410, 630, 54)),
    // The SNES lying down: the dark band with the four buttons and the
    // system's name, grey stripes, the picture, the seal at its corner.
    snes: (n) => svg(700, 500, `<rect width="700" height="500" fill="#c9c6c0"/>`
      + `<rect width="700" height="86" fill="#26262a"/>` + lines(0, 70, 700, 12, 4, '#4a4a50')
      + snesDots(52, 43, 11)
      + word('SUPER NINTENDO', 92, 46, 34, '#f4efe4', { italic: true })
      + word('ENTERTAINMENT SYSTEM', 94, 66, 14, '#cfcac1', { spacing: 0.25, weight: 700 })
      + word('PAL VERSION', 670, 52, 14, '#cfcac1', { anchor: 'end', weight: 700, spacing: 0.15 })
      + art(36, 108, 628, 300, n, 70)
      + lines(0, 430, 700, 60, 6, '#b2aea6')
      + seal(612, 456, 36)),
    // The N64 lying down: the picture in black, the cube and the name at the foot.
    n64: (n) => svg(700, 500, `<rect width="700" height="500" fill="#0d0d0d"/>`
      + nintendo(510, 20, 34, '#f4efe4')
      + art(30, 66, 640, 340, n, 74)
      + n64Cube(34, 420, 58)
      + word('NINTENDO', 104, 456, 30, '#f4efe4', { italic: true }) + word('64', 286, 458, 42, '#e94b3c', { italic: true })
      + seal(628, 456, 34)),
    // The Mega Drive's case: its red grid at the top with the name over it.
    genesis: (n) => svg(500, 700, `<rect width="500" height="700" fill="#0d0d0d"/>`
      + grid(0, 0, 500, 120, 20, '#c0281e')
      + `<rect x="0" y="120" width="500" height="5" fill="#c0281e"/>`
      + `<rect x="18" y="34" width="300" height="56" fill="#0d0d0d"/>`
      + word('MEGA DRIVE', 30, 78, 40, '#f4efe4', { italic: true, spacing: -0.02 })
      + `<rect x="352" y="38" width="120" height="46" rx="8" fill="#0d0d0d"/>` + word('SEGA', 412, 76, 40, '#2e6fbf', { anchor: 'middle', italic: true })
      + art(26, 146, 448, 500, n, 62)
      + word('16-BIT CARTRIDGE', 474, 682, 16, '#cfcac1', { anchor: 'end', spacing: 0.12, weight: 700 })),
    // The Master System's white box with its black grid.
    sms: (n) => svg(500, 700, `<rect width="500" height="700" fill="#f7f5f0"/>`
      + grid(0, 0, 500, 700, 25, '#1c1c1c')
      + `<rect x="0" y="0" width="500" height="100" fill="#f7f5f0"/>`
      + word('SEGA', 26, 66, 42, '#2e6fbf', { italic: true }) + word('MASTER SYSTEM', 172, 64, 28, '#c0281e', { italic: true })
      + `<rect x="0" y="96" width="500" height="5" fill="#c0281e"/>`
      + art(50, 150, 400, 470, n, 60)),
    // A PC big box: the publisher's colour, a disk's label for the name.
    dos: (n) => svg(560, 720, `<rect width="560" height="720" fill="#33557a"/>`
      + `<rect x="0" y="0" width="560" height="16" fill="#284562"/>`
      + `<rect x="70" y="110" width="420" height="420" rx="10" fill="#1a1a1a"/>`
      + `<rect x="170" y="110" width="220" height="110" fill="#8e8a83"/><rect x="310" y="130" width="40" height="70" fill="#1a1a1a"/>`
      + `<rect x="100" y="260" width="360" height="240" fill="#f4efe4"/>`
      + lines(110, 440, 340, 40, 20, '#cfcac1')
      + title(n, 116, 272, 328, 160, 52, INK)
      + `<rect x="0" y="620" width="560" height="100" fill="#1a1a1a"/>`
      + word('IBM PC & COMPATIBLES', 280, 662, 24, '#f4efe4', { anchor: 'middle', spacing: 0.08 })
      + word('3½" DISK · MS-DOS', 280, 694, 18, '#e8b23a', { anchor: 'middle', spacing: 0.1, weight: 700 })),
    // The Game Boys' cartons: the band with the name, the picture, the seal.
    gb: (n) => handheld(n, '#f4efe4', '#26262a', [['GAME BOY', '#f4efe4']], '#c9c6c0'),
    gbc: (n) => handheld(n, '#f4efe4', '#26262a', [['GAME BOY ', '#f4efe4'], ['C', '#e94b3c'], ['O', '#e8b23a'], ['L', '#2f9a4f'], ['O', '#2e6fbf'], ['R', '#8a4fb0']], '#e9e3d4'),
    gba: (n) => handheld(n, '#f4efe4', '#2b2a6b', [['GAME BOY ', '#f4efe4'], ['ADVANCE', '#cfcaf0']], '#f4efe4'),
    nds: (n) => handheld(n, '#f7f7f7', '#9a9a9a', [['NINTENDO', '#f7f7f7'], ['DS', '#1c1c1c']], '#f7f7f7'),
    // PlayStation's jewel case: the black spine with its mark and name.
    psx: (n) => svg(600, 600, `<rect width="600" height="600" fill="${SUNKEN}"/>`
      + `<rect width="86" height="600" fill="#0d0d0d"/>` + psMark(13, 16, 60)
      + word('PlayStation', 58, 560, 34, '#f4efe4', { rotate: -90, weight: 700 })
      + word('PAL', 43, 590, 14, '#cfcac1', { anchor: 'middle', weight: 700 })
      + title(n, 116, 50, 450, 500, 64, INK)),
    // The PlayStation 2's case: tall, a black band with the name.
    ps2: (n) => svg(420, 600, `<rect width="420" height="600" fill="#0d0d0d"/>`
      + word('PlayStation.2', 24, 50, 34, '#f4efe4', { weight: 700, italic: true })
      + `<rect x="0" y="66" width="420" height="4" fill="#2e6fbf"/>`
      + art(14, 84, 392, 470, n, 54)
      + word('PAL', 396, 584, 14, '#cfcac1', { anchor: 'end', weight: 700 })),
    // The Saturn's case: its name over a white band.
    saturn: (n) => svg(600, 600, `<rect width="600" height="600" fill="#f4efe4"/>`
      + `<rect width="600" height="80" fill="#1c1c1c"/>`
      + word('SEGA SATURN', 300, 56, 40, '#f4efe4', { anchor: 'middle', spacing: 0.12 })
      + `<rect x="0" y="80" width="600" height="6" fill="#2e6fbf"/>`
      + art(30, 110, 540, 460, n, 66)),
    // The Dreamcast's: a blue spine with its orange swirl.
    dc: (n) => svg(600, 600, `<rect width="600" height="600" fill="${SUNKEN}"/>`
      + `<rect width="86" height="600" fill="#1f4e9e"/>`
      + `<path d="M43 30 a22 22 0 1 1 -16 38 a14 14 0 1 0 16 -24 a8 8 0 1 1 -6 12" fill="none" stroke="#f08a1c" stroke-width="7" stroke-linecap="round"/>`
      + word('Dreamcast', 58, 560, 34, '#f4efe4', { rotate: -90, weight: 700 })
      + title(n, 116, 50, 450, 500, 64, INK)),
    // A Neo Geo's big box: its name in red over black.
    neogeo: (n) => svg(500, 700, `<rect width="500" height="700" fill="#0d0d0d"/>`
      + word('NEO·GEO', 250, 76, 62, '#e94b3c', { anchor: 'middle', italic: true })
      + word('MAX 330 MEGA · PRO-GEAR SPEC', 250, 108, 16, '#cfcac1', { anchor: 'middle', spacing: 0.1, weight: 700 })
      + art(30, 132, 440, 500, n, 62)
      + `<rect x="0" y="652" width="500" height="48" fill="#c0281e"/>` + word('SNK', 250, 688, 32, '#f4efe4', { anchor: 'middle' })),
    // An arcade board's: a marquee at the top, a coin slot below.
    arcade: (n) => svg(500, 700, `<rect width="500" height="700" fill="#1a1a1a"/>`
      + `<rect x="20" y="20" width="460" height="90" rx="6" fill="#e8b23a"/>` + word('ARCADE', 250, 84, 52, '#1a1a1a', { anchor: 'middle', italic: true, spacing: 0.08 })
      + art(40, 130, 420, 450, n, 62)
      + `<rect x="170" y="604" width="160" height="66" rx="8" fill="#3a3a3a"/><rect x="242" y="616" width="16" height="42" rx="3" fill="#e94b3c"/>`
      + word('INSERT COIN', 250, 694, 14, '#e8b23a', { anchor: 'middle', spacing: 0.2, weight: 700 })),
    // A disc's case of no console in particular.
    disc: (n) => svg(600, 600, `<rect width="600" height="600" fill="${GREY}"/>`
      + `<rect x="0" y="0" width="44" height="600" fill="#a9a49b"/>`
      + `<rect x="70" y="40" width="490" height="520" fill="${PAPER}"/>`
      + title(n, 96, 70, 438, 460, 64, INK)),
    // A box of no console in particular.
    box: (n) => svg(500, 700, `<rect width="500" height="700" fill="${SUNKEN}"/>`
      + `<rect x="20" y="20" width="460" height="660" fill="none" stroke="${LINE}" stroke-width="4"/>`
      + title(n, 50, 60, 400, 580, 64, INK)),
    // An album: a record half out of its paper sleeve.
    album: (n) => svg(600, 600, `<circle cx="400" cy="300" r="196" fill="${INK}"/>`
      + `<circle cx="400" cy="300" r="150" fill="none" stroke="#3a332c" stroke-width="3"/><circle cx="400" cy="300" r="108" fill="none" stroke="#3a332c" stroke-width="3"/>`
      + `<circle cx="400" cy="300" r="60" fill="${OCHRE}"/><circle cx="400" cy="300" r="7" fill="${INK}"/>`
      + `<rect x="0" y="60" width="480" height="480" fill="${SUNKEN}"/>`
      + `<rect x="1.5" y="61.5" width="477" height="477" fill="none" stroke="${LINE}" stroke-width="3"/>`
      + title(n, 40, 100, 400, 400, 64, INK)),
    // A film: its case, the insert in it.
    dvd: (n) => svg(400, 600, `<rect width="400" height="600" rx="16" fill="${INK}"/>`
      + `<rect x="0" y="0" width="34" height="600" fill="#2b2622"/>`
      + `<rect x="50" y="20" width="332" height="560" fill="${PAPER}"/>`
      + `<rect x="50" y="20" width="332" height="40" fill="${RED}"/>`
      + title(n, 70, 90, 292, 440, 54, INK)),
    // An episode or a clip: a frame of film, holes along its edges.
    still: (n) => svg(640, 360, `<rect width="640" height="360" fill="${INK}"/>`
      + Array.from({ length: 16 }, (_, i) => `<rect x="${14 + i * 40}" y="12" width="18" height="16" rx="3" fill="#4a423b"/><rect x="${14 + i * 40}" y="332" width="18" height="16" rx="3" fill="#4a423b"/>`).join('')
      + `<rect x="24" y="44" width="592" height="272" fill="${SUNKEN}"/>`
      + title(n, 60, 64, 520, 232, 60, INK)),
  };

  // RomM's slugs, to a box of their own.
  const CONSOLE = {
    nes: 'nes', famicom: 'nes', snes: 'snes', sfam: 'snes', n64: 'n64',
    genesis: 'genesis', 'genesis-slash-megadrive': 'genesis', megadrive: 'genesis', '32x': 'genesis', segacd: 'genesis',
    sms: 'sms', gamegear: 'sms', 'game-gear': 'sms',
    dos: 'dos', win: 'dos', amiga: 'dos', c64: 'dos',
    gb: 'gb', gbc: 'gbc', gba: 'gba', nds: 'nds',
    psx: 'psx', ps2: 'ps2', saturn: 'saturn', dc: 'dc',
    neogeoaes: 'neogeo', neogeomvs: 'neogeo', arcade: 'arcade', mame: 'arcade', cps1: 'arcade', cps2: 'arcade',
  };

  M.mockups = {
    svg: (kind, name) => (DRAW[kind] || DRAW.box)(name || ''),
    forConsole: (slug) => CONSOLE[slug] || 'box',
  };
})(window.PioneerTV);
