// Pioneer TV service illustrations: soft 3D objects in the service colour,
// lit from the top left, standing on a cast shadow. Keyed by service id; a
// service with a `logo` URL shows that instead, anything unknown gets the
// ticket.
window.PioneerTV = window.PioneerTV || {};
(function (P) {
  const INK = '#2b2419';
  const PAPER = '#f4edda';

  // Colour helpers: lighter and darker faces of the service colour.
  function hex(c) { const m = c.replace('#', ''); const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); }
  function mix(c, to, t) { const a = hex(c), b = hex(to); return '#' + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join(''); }
  const light = (c, t = 0.45) => mix(c, '#ffffff', t);
  const dark = (c, t = 0.35) => mix(c, '#2b2419', t);

  function wrap(id, color, defs, body) {
    const u = `${id}-${color.replace('#', '')}`;
    return `<svg class="art-svg" viewBox="0 0 160 110" width="100%" height="100%" aria-hidden="true">
      <defs>
        <filter id="shadow-${u}" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="${INK}" flood-opacity="0.28"/>
        </filter>
        <radialGradient id="ground-${u}" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="${INK}" stop-opacity="0.22"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/>
        </radialGradient>
        ${defs.replace(/U/g, u)}
      </defs>
      <ellipse cx="80" cy="100" rx="58" ry="7" fill="url(#ground-${u})"/>
      <g filter="url(#shadow-${u})">${body.replace(/U/g, u)}</g>
    </svg>`;
  }

  const ART = {
    // Cineasterna's mark is a golden palm frond (a nod to the Palme d'Or):
    // a curved stem with tapered leaflets, gold lit from the top left.
    cineasterna: (c) => {
      const gold = '#c9a227', deep = '#8f6d0a', pale = '#f1dc8a';
      // Quadratic stem from the base at bottom-left to the tip at top-right.
      const A = [26, 98], C = [52, 22], B = [146, 18];
      const pt = (t) => [(1 - t) ** 2 * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
      const tan = (t) => { const [x0, y0] = pt(Math.max(0, t - 0.01)), [x1, y1] = pt(Math.min(1, t + 0.01)); const l = Math.hypot(x1 - x0, y1 - y0) || 1; return [(x1 - x0) / l, (y1 - y0) / l]; };
      const leaflets = [];
      for (let i = 0; i < 15; i++) {
        const t = 0.06 + i * 0.062;
        const [x, y] = pt(t), [dx, dy] = tan(t);
        const len = 30 * (1 - t * 0.55) * (i < 2 ? 0.7 : 1);
        for (const side of [-1, 1]) {
          // leaflet direction: stem tangent rotated ~55° to the side, leaning toward the tip
          const a = side * 0.95;
          const ux = dx * Math.cos(a) - dy * Math.sin(a), uy = dx * Math.sin(a) + dy * Math.cos(a);
          const tx = x + ux * len + dx * len * 0.45, ty = y + uy * len + dy * len * 0.45;
          const nx = -uy, ny = ux; // normal for the leaf width
          const w = 2.6 * (1 - t * 0.4);
          const c1x = x + ux * len * 0.5 + nx * w * side, c1y = y + uy * len * 0.5 + ny * w * side;
          const c2x = x + ux * len * 0.5 - nx * w * side, c2y = y + uy * len * 0.5 - ny * w * side;
          const shade = side < 0 ? 'leafL' : 'leafR';
          leaflets.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)} Q${c1x.toFixed(1)} ${c1y.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Z" fill="url(#${shade}-U)"/>`);
        }
      }
      const stem = `<path d="M${A[0]} ${A[1]} Q${C[0]} ${C[1]} ${B[0]} ${B[1]}" stroke="url(#stem-U)" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
      return wrap('cine', c, `
      <linearGradient id="leafL-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pale}"/><stop offset="0.55" stop-color="${gold}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
      <linearGradient id="leafR-U" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${deep}"/><stop offset="0.5" stop-color="${gold}"/><stop offset="1" stop-color="${pale}"/></linearGradient>
      <linearGradient id="stem-U" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${deep}"/><stop offset="0.6" stop-color="${gold}"/><stop offset="1" stop-color="${pale}"/></linearGradient>`,
      `${leaflets.join('')}${stem}`);
    },

    // A retro television seen slightly from above, screen lit, showing play.
    svtplay: (c) => wrap('svt', c, `
      <linearGradient id="body-U" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fbf6e6"/><stop offset="1" stop-color="#e2d6b4"/>
      </linearGradient>
      <linearGradient id="side-U" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#c9bd9c"/><stop offset="1" stop-color="#a89a80"/>
      </linearGradient>
      <linearGradient id="screen-U" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${light(c, 0.55)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.35)}"/>
      </linearGradient>
      <linearGradient id="gloss-U" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>`, `
      <!-- antennas -->
      <path d="M78 26 L58 6 M78 26 L102 8" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <circle cx="58" cy="6" r="2.6" fill="${INK}"/><circle cx="102" cy="8" r="2.6" fill="${INK}"/>
      <!-- cabinet: side face, then front -->
      <path d="M120 30 L132 36 L132 90 L120 96 Z" fill="url(#side-U)"/>
      <path d="M28 96 L120 96 L132 90 L40 90 Z" fill="#8f836a"/>
      <rect x="28" y="30" width="92" height="66" rx="9" fill="url(#body-U)" stroke="${INK}" stroke-width="1.4"/>
      <!-- screen -->
      <rect x="36" y="38" width="58" height="46" rx="6" fill="url(#screen-U)" stroke="${dark(c, 0.5)}" stroke-width="1.2"/>
      <path d="M36 44 Q 60 34 94 38 L 94 40 Q 62 42 36 54 Z" fill="url(#gloss-U)"/>
      <polygon points="58,52 58,72 76,62" fill="${PAPER}" opacity="0.95"/>
      <!-- knobs and speaker -->
      <circle cx="107" cy="50" r="5.5" fill="#e8dcbd" stroke="${INK}" stroke-width="1.2"/><circle cx="107" cy="50" r="2" fill="${INK}"/>
      <circle cx="107" cy="66" r="5.5" fill="#e8dcbd" stroke="${INK}" stroke-width="1.2"/><circle cx="107" cy="66" r="2" fill="${INK}"/>
      <g stroke="${INK}" stroke-width="1.2" opacity="0.6"><path d="M102 78 h10 M102 82 h10 M102 86 h10"/></g>
      <!-- feet -->
      <path d="M44 96 L40 104 M104 96 L108 104" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    `),

    // A transmitter mast with the signal going out: the live channel.
    svt1: (c) => wrap('svt1', c, `
      <linearGradient id="legL-U" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbf6e6"/><stop offset="1" stop-color="#b9ad90"/></linearGradient>
      <linearGradient id="legR-U" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a89a80"/><stop offset="1" stop-color="#6f6350"/></linearGradient>
      <radialGradient id="beacon-U" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${light(c, 0.6)}"/><stop offset="1" stop-color="${dark(c, 0.2)}"/></radialGradient>`, `
      <!-- signal, thinning as it goes out -->
      <g fill="none" stroke="${c}" stroke-linecap="round">
        <path d="M63 26 A 22 22 0 0 0 63 54" stroke-width="3" opacity="0.9"/>
        <path d="M52 20 A 34 34 0 0 0 52 60" stroke-width="2.4" opacity="0.6"/>
        <path d="M41 14 A 46 46 0 0 0 41 66" stroke-width="1.8" opacity="0.32"/>
        <path d="M97 26 A 22 22 0 0 1 97 54" stroke-width="3" opacity="0.9"/>
        <path d="M108 20 A 34 34 0 0 1 108 60" stroke-width="2.4" opacity="0.6"/>
        <path d="M119 14 A 46 46 0 0 1 119 66" stroke-width="1.8" opacity="0.32"/>
      </g>
      <!-- mast: two tapering legs with braces -->
      <path d="M62 96 L74 30 L78 30 L68 96 Z" fill="url(#legL-U)" stroke="${INK}" stroke-width="1.1"/>
      <path d="M98 96 L86 30 L82 30 L92 96 Z" fill="url(#legR-U)" stroke="${INK}" stroke-width="1.1"/>
      <g stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.85">
        <path d="M70 84 L90 84 M71 72 L89 72 M73 60 L87 60 M74 48 L86 48 M76 38 L84 38"/>
        <path d="M70 84 L89 72 M90 84 L71 72 M71 72 L87 60 M89 72 L73 60 M73 60 L86 48 M87 60 L74 48"/>
      </g>
      <!-- antenna and beacon -->
      <path d="M80 30 L80 14" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="80" cy="11" r="5" fill="url(#beacon-U)" stroke="${dark(c, 0.35)}" stroke-width="1"/>
      <circle cx="78.5" cy="9.5" r="1.6" fill="#ffffff" opacity="0.75"/>
      <!-- feet -->
      <path d="M60 96 L70 96 M90 96 L100 96" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    `),

    // A shelf with cases standing and leaning, seen from the front-left.
    jellyfin: (c) => wrap('jf', c, `
      <linearGradient id="case1-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(c, 0.4)}"/><stop offset="1" stop-color="${dark(c, 0.2)}"/></linearGradient>
      <linearGradient id="case2-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf6e6"/><stop offset="1" stop-color="#ddd1ad"/></linearGradient>
      <linearGradient id="case3-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(c, 0.15)}"/><stop offset="1" stop-color="${dark(c, 0.45)}"/></linearGradient>
      <linearGradient id="spine-U" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark(c, 0.55)}"/><stop offset="1" stop-color="${dark(c, 0.25)}"/></linearGradient>
      <linearGradient id="wood-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5a3a"/><stop offset="1" stop-color="#4a3622"/></linearGradient>`, `
      <!-- shelf board with a front edge -->
      <path d="M20 84 L140 84 L146 90 L26 90 Z" fill="#8a6a45"/>
      <rect x="20" y="88" width="126" height="7" rx="1.5" fill="url(#wood-U)"/>
      <!-- cases: each a front face plus a thin spine for depth -->
      <path d="M34 42 L38 40 L38 84 L34 84 Z" fill="url(#spine-U)"/><rect x="38" y="40" width="16" height="44" rx="1.5" fill="url(#case1-U)" stroke="${INK}" stroke-width="1.1"/>
      <path d="M40 48 h12 M40 53 h12" stroke="${PAPER}" stroke-width="1.6" opacity="0.8"/>
      <path d="M57 32 L61 30 L61 84 L57 84 Z" fill="#b9ad90"/><rect x="61" y="30" width="13" height="54" rx="1.5" fill="url(#case2-U)" stroke="${INK}" stroke-width="1.1"/>
      <path d="M63 40 h9 M63 45 h9" stroke="${INK}" stroke-width="1.4" opacity="0.5"/>
      <path d="M77 46 L81 44 L81 84 L77 84 Z" fill="url(#spine-U)"/><rect x="81" y="44" width="18" height="40" rx="1.5" fill="url(#case3-U)" stroke="${INK}" stroke-width="1.1"/>
      <circle cx="90" cy="60" r="4.5" fill="${PAPER}" opacity="0.9"/>
      <path d="M102 36 L106 34 L106 84 L102 84 Z" fill="#b9ad90"/><rect x="106" y="34" width="11" height="50" rx="1.5" fill="url(#case2-U)" stroke="${INK}" stroke-width="1.1"/>
      <!-- the leaning one -->
      <g transform="rotate(16 128 84)">
        <path d="M121 40 L125 38 L125 84 L121 84 Z" fill="url(#spine-U)"/>
        <rect x="125" y="38" width="14" height="46" rx="1.5" fill="url(#case1-U)" stroke="${INK}" stroke-width="1.1"/>
        <path d="M127 46 h10 M127 51 h10" stroke="${PAPER}" stroke-width="1.6" opacity="0.8"/>
      </g>
      <!-- highlight on the shelf edge -->
      <path d="M22 84 L138 84" stroke="#ffffff" stroke-width="1" opacity="0.35"/>
    `),

    // RomM: a chunky gamepad in the service colour, seen slightly from above.
    romm: (c) => wrap('romm', c, `
      <linearGradient id="body-U" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${light(c, 0.4)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.4)}"/></linearGradient>
      <linearGradient id="under-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark(c, 0.45)}"/><stop offset="1" stop-color="${dark(c, 0.7)}"/></linearGradient>
      <linearGradient id="face-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6e6"/><stop offset="1" stop-color="#ddd1ad"/></linearGradient>
      <linearGradient id="btnA-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e88a7a"/><stop offset="1" stop-color="#a8352a"/></linearGradient>
      <linearGradient id="btnB-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d98a"/><stop offset="1" stop-color="#b8940c"/></linearGradient>
      <linearGradient id="btnX-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fc7a8"/><stop offset="1" stop-color="#3d6f4a"/></linearGradient>
      <linearGradient id="btnY-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b7a3d6"/><stop offset="1" stop-color="#5a3f8a"/></linearGradient>
      <linearGradient id="gloss3-U" x1="0" y1="0" x2="0.2" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`, `
      <!-- underside (thickness) -->
      <path d="M22 66 C 22 50, 34 42, 48 42 L 112 42 C 126 42, 138 50, 138 66 L 140 88 C 141 98, 130 104, 122 98 L 108 86 L 52 86 L 38 98 C 30 104, 19 98, 20 88 Z" fill="url(#under-U)" transform="translate(0 6)"/>
      <!-- body -->
      <path d="M22 66 C 22 50, 34 42, 48 42 L 112 42 C 126 42, 138 50, 138 66 L 140 88 C 141 98, 130 104, 122 98 L 108 86 L 52 86 L 38 98 C 30 104, 19 98, 20 88 Z" fill="url(#body-U)" stroke="${INK}" stroke-width="1.4"/>
      <path d="M30 50 Q 80 40 130 50 L 128 56 Q 80 48 32 58 Z" fill="url(#gloss3-U)"/>
      <!-- shoulder buttons -->
      <rect x="40" y="34" width="26" height="10" rx="4" fill="${dark(c, 0.3)}" stroke="${INK}" stroke-width="1.1"/>
      <rect x="94" y="34" width="26" height="10" rx="4" fill="${dark(c, 0.3)}" stroke="${INK}" stroke-width="1.1"/>
      <!-- d-pad -->
      <g transform="translate(46 66)">
        <path d="M-4 -12 h8 v8 h8 v8 h-8 v8 h-8 v-8 h-8 v-8 h8 z" fill="#2f2a24" stroke="${INK}" stroke-width="1"/>
        <path d="M-3 -11 h6 v7 h7 v6" stroke="#5a544b" stroke-width="1" fill="none" opacity="0.8"/>
      </g>
      <!-- face buttons -->
      <circle cx="114" cy="56" r="5.2" fill="url(#btnY-U)" stroke="${INK}" stroke-width="0.9"/>
      <circle cx="104" cy="66" r="5.2" fill="url(#btnX-U)" stroke="${INK}" stroke-width="0.9"/>
      <circle cx="124" cy="66" r="5.2" fill="url(#btnA-U)" stroke="${INK}" stroke-width="0.9"/>
      <circle cx="114" cy="76" r="5.2" fill="url(#btnB-U)" stroke="${INK}" stroke-width="0.9"/>
      <!-- start / select -->
      <rect x="70" y="62" width="8" height="3.4" rx="1.7" fill="${dark(c, 0.55)}"/>
      <rect x="82" y="62" width="8" height="3.4" rx="1.7" fill="${dark(c, 0.55)}"/>
      <!-- sticks -->
      <circle cx="66" cy="80" r="7" fill="url(#face-U)" stroke="${INK}" stroke-width="1.1"/><circle cx="66" cy="80" r="4" fill="#3a352e"/>
      <circle cx="94" cy="80" r="7" fill="url(#face-U)" stroke="${INK}" stroke-width="1.1"/><circle cx="94" cy="80" r="4" fill="#3a352e"/>
      <!-- cable -->
      <path d="M80 42 C 80 28, 100 30, 112 18 C 122 8, 140 12, 148 6" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.85"/>
    `),

    // Default: a cinema ticket with a torn stub, lying at an angle.
    default: (c) => wrap('ticket', c, `
      <linearGradient id="tk-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(c, 0.45)}"/><stop offset="1" stop-color="${dark(c, 0.15)}"/></linearGradient>`, `
      <g transform="rotate(-8 80 60)">
        <path d="M28 38 H132 a6 6 0 0 1 6 6 v8 a8 8 0 0 0 0 16 v8 a6 6 0 0 1 -6 6 H28 a6 6 0 0 1 -6 -6 v-8 a8 8 0 0 0 0 -16 v-8 a6 6 0 0 1 6 -6 z" fill="url(#tk-U)" stroke="${INK}" stroke-width="1.4"/>
        <line x1="100" y1="40" x2="100" y2="80" stroke="${PAPER}" stroke-dasharray="3 3" stroke-width="1.6" opacity="0.9"/>
        <rect x="36" y="50" width="46" height="6" rx="3" fill="${PAPER}" opacity="0.9"/>
        <rect x="36" y="62" width="30" height="6" rx="3" fill="${PAPER}" opacity="0.7"/>
        <path d="M30 40 Q 80 34 130 40" stroke="#ffffff" stroke-width="2" opacity="0.35" fill="none"/>
      </g>
    `),
  };
  ART.plex = ART.jellyfin;

  P.art = {
    html(id, color) {
      const fn = ART[id] || ART.default;
      return fn(color || INK);
    },
    has(id) { return !!ART[id]; },
  };
})(window.PioneerTV);
