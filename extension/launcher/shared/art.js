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

    // Bilder (Immich): a photo standing in a frame on its stand, a landscape
    // under a sky in the service colour, a second print leaning behind it.
    immich: (c) => wrap('img', c, `
      <linearGradient id="frame-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6a45"/><stop offset="1" stop-color="#4a3622"/></linearGradient>
      <linearGradient id="mat-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6e6"/><stop offset="1" stop-color="#e2d6b4"/></linearGradient>
      <linearGradient id="sky-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light(c, 0.55)}"/><stop offset="1" stop-color="${c}"/></linearGradient>
      <linearGradient id="hill1-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f9a6a"/><stop offset="1" stop-color="#3d6a45"/></linearGradient>
      <linearGradient id="hill2-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7d52"/><stop offset="1" stop-color="#2e4633"/></linearGradient>
      <linearGradient id="print-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4edda"/><stop offset="1" stop-color="#cfc3a3"/></linearGradient>
      <linearGradient id="gloss4-U" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`, `
      <!-- a print leaning behind -->
      <g transform="rotate(-9 104 60)">
        <rect x="86" y="22" width="52" height="64" rx="2" fill="url(#print-U)" stroke="${INK}" stroke-width="1.1"/>
        <rect x="91" y="27" width="42" height="44" fill="${dark(c, 0.2)}" opacity="0.55"/>
      </g>
      <!-- the stand behind the frame -->
      <path d="M78 92 L92 100" stroke="#4a3622" stroke-width="4" stroke-linecap="round"/>
      <!-- frame, mat and photo -->
      <rect x="30" y="24" width="68" height="74" rx="3" fill="url(#frame-U)" stroke="${INK}" stroke-width="1.4"/>
      <rect x="36" y="30" width="56" height="62" rx="1.5" fill="url(#mat-U)"/>
      <rect x="42" y="36" width="44" height="44" fill="url(#sky-U)" stroke="${dark(c, 0.45)}" stroke-width="1"/>
      <circle cx="74" cy="46" r="5.5" fill="#f4d98a" stroke="#b8940c" stroke-width="0.8"/>
      <path d="M42 70 Q 54 56 66 66 Q 74 60 86 66 L 86 80 L 42 80 Z" fill="url(#hill1-U)"/>
      <path d="M42 80 L42 74 Q 58 64 72 76 Q 78 72 86 74 L 86 80 Z" fill="url(#hill2-U)"/>
      <path d="M42 36 L 86 36 L 86 40 Q 62 44 42 58 Z" fill="url(#gloss4-U)"/>
      <!-- the frame's lit edge -->
      <path d="M31 25 L97 25" stroke="#ffffff" stroke-width="1" opacity="0.3"/>
    `),

    // Musik: a record player seen from the front and above, a black record
    // with a label in the service colour, the tone arm resting on it.
    musik: (c) => wrap('musik', c, `
      <linearGradient id="plinth-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79a6a"/><stop offset="1" stop-color="#8a5f38"/></linearGradient>
      <linearGradient id="plinthfront-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5232"/><stop offset="1" stop-color="#5c3c22"/></linearGradient>
      <radialGradient id="vinyl-U" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#4a423a"/><stop offset="0.6" stop-color="#221d18"/><stop offset="1" stop-color="#14110e"/></radialGradient>
      <radialGradient id="label-U" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${light(c, 0.35)}"/><stop offset="1" stop-color="${dark(c, 0.1)}"/></radialGradient>
      <linearGradient id="arm-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3efe6"/><stop offset="1" stop-color="#a7a094"/></linearGradient>`, `
      <!-- the plinth: its top in perspective, then its front -->
      <path d="M22 44 L138 44 L148 82 L12 82 Z" fill="url(#plinth-U)" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M12 82 L148 82 L148 92 Q148 94 146 94 L14 94 Q12 94 12 92 Z" fill="url(#plinthfront-U)" stroke="${INK}" stroke-width="1.4"/>
      <path d="M24 46 L136 46" stroke="#ffffff" stroke-width="1" opacity="0.35"/>
      <!-- the record, flattened by the angle -->
      <ellipse cx="70" cy="63" rx="46" ry="15" fill="${INK}" opacity="0.25" transform="translate(0 2)"/>
      <ellipse cx="70" cy="62" rx="46" ry="15" fill="url(#vinyl-U)" stroke="${INK}" stroke-width="1.2"/>
      <ellipse cx="70" cy="62" rx="36" ry="11.6" fill="none" stroke="#ffffff" stroke-width="0.6" opacity="0.16"/>
      <ellipse cx="70" cy="62" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="0.6" opacity="0.12"/>
      <path d="M38 56 Q 58 49 86 51" stroke="#ffffff" stroke-width="1.6" opacity="0.22" fill="none" stroke-linecap="round"/>
      <ellipse cx="70" cy="62" rx="13" ry="4.4" fill="url(#label-U)" stroke="${INK}" stroke-width="0.8"/>
      <ellipse cx="70" cy="62" rx="1.6" ry="0.7" fill="${INK}"/>
      <!-- the tone arm from its pivot at the back right down onto the record -->
      <circle cx="128" cy="52" r="6" fill="url(#arm-U)" stroke="${INK}" stroke-width="1.2"/>
      <path d="M128 52 L118 66 L96 68" stroke="${INK}" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M128 52 L118 66 L96 68" stroke="url(#arm-U)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="89" y="65" width="9" height="5" rx="1.2" fill="${dark(c, 0.2)}" stroke="${INK}" stroke-width="1"/>
      <!-- two knobs on the front -->
      <circle cx="126" cy="88" r="2.4" fill="#e9e2d2" stroke="${INK}" stroke-width="0.9"/>
      <circle cx="136" cy="88" r="2.4" fill="${c}" stroke="${INK}" stroke-width="0.9"/>
    `),

    // Spel: the box's own two pads, the pink and the green 8BitDo Ultimate
    // 2C, one leaning on the other. Their colours, not the service's.
    pads: () => {
      const pad = (id, t, body, deep, rim, stick, btn) => `
        <g transform="${t}">
          <path d="M22 66 C 22 50, 34 42, 48 42 L 112 42 C 126 42, 138 50, 138 66 L 140 88 C 141 98, 130 104, 122 98 L 108 86 L 52 86 L 38 98 C 30 104, 19 98, 20 88 Z" fill="${deep}" transform="translate(0 6)"/>
          <path d="M22 66 C 22 50, 34 42, 48 42 L 112 42 C 126 42, 138 50, 138 66 L 140 88 C 141 98, 130 104, 122 98 L 108 86 L 52 86 L 38 98 C 30 104, 19 98, 20 88 Z" fill="url(#${id}-body-U)" stroke="${INK}" stroke-width="1.6"/>
          <path d="M30 50 Q 80 40 130 50 L 128 56 Q 80 48 32 58 Z" fill="#ffffff" opacity="0.35"/>
          <rect x="40" y="34" width="26" height="10" rx="4" fill="${deep}" stroke="${INK}" stroke-width="1.2"/>
          <rect x="94" y="34" width="26" height="10" rx="4" fill="${deep}" stroke="${INK}" stroke-width="1.2"/>
          <g transform="translate(66 76)"><path d="M-4 -12 h8 v8 h8 v8 h-8 v8 h-8 v-8 h-8 v-8 h8 z" fill="${stick}" stroke="${INK}" stroke-width="1.1"/></g>
          <circle cx="114" cy="54" r="5.4" fill="${btn}" stroke="${INK}" stroke-width="1"/>
          <circle cx="104" cy="64" r="5.4" fill="${btn}" stroke="${INK}" stroke-width="1"/>
          <circle cx="124" cy="64" r="5.4" fill="${btn}" stroke="${INK}" stroke-width="1"/>
          <circle cx="114" cy="74" r="5.4" fill="${btn}" stroke="${INK}" stroke-width="1"/>
          <circle cx="80" cy="54" r="4" fill="none" stroke="${rim}" stroke-width="1.6"/>
          <circle cx="46" cy="58" r="9" fill="${rim}" stroke="${INK}" stroke-width="1.1"/><circle cx="46" cy="58" r="6" fill="${stick}" stroke="${INK}" stroke-width="0.8"/>
          <circle cx="98" cy="80" r="9" fill="${rim}" stroke="${INK}" stroke-width="1.1"/><circle cx="98" cy="80" r="6" fill="${stick}" stroke="${INK}" stroke-width="0.8"/>
        </g>`;
      return wrap('pads', '#e09f96', `
        <linearGradient id="green-body-U" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#e2ede6"/><stop offset="0.6" stop-color="#c3d9ce"/><stop offset="1" stop-color="#9fb9ab"/></linearGradient>
        <linearGradient id="pink-body-U" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#f8ebe6"/><stop offset="0.6" stop-color="#efcfc6"/><stop offset="1" stop-color="#d9aa9f"/></linearGradient>`, `
        ${pad('green', 'translate(46 -10) scale(0.74) rotate(14 80 70)', '#c3d9ce', '#8fa99b', '#7d978a', '#42584a', '#42584a')}
        ${pad('pink', 'translate(-2 22) scale(0.8) rotate(-8 80 70)', '#efcfc6', '#c99a8f', '#e09f96', '#f7f3ee', '#f7f3ee')}
      `);
    },

    // Default: a cinema ticket with a torn stub, lying at an angle.
    // Film: a clapperboard standing a little open, its arm striped in the
    // service colour, a reel of film lying beside it.
    film: (c) => wrap('film', c, `
      <linearGradient id="slate-U" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#4a423a"/><stop offset="1" stop-color="#1f1a16"/></linearGradient>
      <linearGradient id="arm-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a423a"/><stop offset="1" stop-color="#26201b"/></linearGradient>
      <radialGradient id="reel-U" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${light(c, 0.45)}"/><stop offset="1" stop-color="${dark(c, 0.3)}"/></radialGradient>`, `
      <!-- the reel, lying flat at the right -->
      <ellipse cx="118" cy="84" rx="26" ry="10" fill="${dark(c, 0.45)}" stroke="${INK}" stroke-width="1.2"/>
      <ellipse cx="118" cy="80" rx="26" ry="10" fill="url(#reel-U)" stroke="${INK}" stroke-width="1.2"/>
      <ellipse cx="118" cy="80" rx="18" ry="6.6" fill="none" stroke="${INK}" stroke-width="0.8" opacity="0.45"/>
      <ellipse cx="118" cy="80" rx="4" ry="1.6" fill="${INK}"/>
      <path d="M108 77 h0.01 M128 77 h0.01 M110 84 h0.01 M126 84 h0.01" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <!-- the film running off it to the front -->
      <path d="M138 84 Q148 90 140 96 L120 98" fill="none" stroke="#2a241f" stroke-width="5" stroke-linecap="round"/>
      <path d="M138 84 Q148 90 140 96 L120 98" fill="none" stroke="#d9cfb8" stroke-width="1.2" stroke-dasharray="1.5 2.5" stroke-linecap="round"/>
      <!-- the slate -->
      <rect x="24" y="46" width="70" height="46" rx="3" fill="url(#slate-U)" stroke="${INK}" stroke-width="1.4"/>
      <rect x="24" y="46" width="70" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
      <path d="M32 46 l-6 10 M46 46 l-6 10 M60 46 l-6 10 M74 46 l-6 10 M88 46 l-6 10" stroke="${c}" stroke-width="6"/>
      <rect x="24" y="46" width="70" height="10" fill="none" stroke="${INK}" stroke-width="1.2"/>
      <path d="M32 66 h54 M32 76 h54 M58 60 v24" stroke="${PAPER}" stroke-width="1.2" opacity="0.55"/>
      <!-- the arm, lifted -->
      <g transform="rotate(-18 26 44)">
        <rect x="24" y="34" width="70" height="10" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
        <path d="M30 34 l6 10 M44 34 l6 10 M58 34 l6 10 M72 34 l6 10 M86 34 l6 10" stroke="${c}" stroke-width="6"/>
        <rect x="24" y="34" width="70" height="10" rx="1.5" fill="none" stroke="${INK}" stroke-width="1.2"/>
      </g>
      <circle cx="27" cy="45" r="2.2" fill="#d9cfb8" stroke="${INK}" stroke-width="0.9"/>
    `),

    // Serier: a season box set, three cases on their side in a slipcase,
    // their spines numbered.
    serier: (c) => wrap('serier', c, `
      <linearGradient id="slip-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(c, 0.35)}"/><stop offset="1" stop-color="${dark(c, 0.3)}"/></linearGradient>
      <linearGradient id="top-U" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${light(c, 0.55)}"/><stop offset="1" stop-color="${light(c, 0.2)}"/></linearGradient>`, `
      <!-- the slipcase: its top in perspective, then its side -->
      <path d="M30 40 L112 40 L132 30 L50 30 Z" fill="url(#top-U)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M112 40 L132 30 L132 82 L112 92 Z" fill="${dark(c, 0.4)}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <rect x="30" y="40" width="82" height="52" fill="url(#slip-U)" stroke="${INK}" stroke-width="1.3"/>
      <!-- the cases' spines, out of the open front -->
      <rect x="36" y="45" width="70" height="13" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>
      <rect x="36" y="60" width="70" height="13" rx="1.5" fill="#e9dfc6" stroke="${INK}" stroke-width="1.1"/>
      <rect x="36" y="75" width="70" height="13" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>
      <path d="M44 51.5 h34 M44 66.5 h34 M44 81.5 h34" stroke="${INK}" stroke-width="1.6" opacity="0.4" stroke-linecap="round"/>
      <circle cx="96" cy="51.5" r="4" fill="${c}" stroke="${INK}" stroke-width="0.9"/>
      <circle cx="96" cy="66.5" r="4" fill="${c}" stroke="${INK}" stroke-width="0.9"/>
      <circle cx="96" cy="81.5" r="4" fill="${c}" stroke="${INK}" stroke-width="0.9"/>
      <text x="96" y="53.6" text-anchor="middle" font-size="5.6" font-weight="700" fill="${PAPER}" font-family="Arial, sans-serif">1</text>
      <text x="96" y="68.6" text-anchor="middle" font-size="5.6" font-weight="700" fill="${PAPER}" font-family="Arial, sans-serif">2</text>
      <text x="96" y="83.6" text-anchor="middle" font-size="5.6" font-weight="700" fill="${PAPER}" font-family="Arial, sans-serif">3</text>
      <path d="M32 42 L110 42" stroke="#ffffff" stroke-width="1" opacity="0.35"/>
    `),

    // Videor: a handheld video camera, its lens to the left, the screen
    // folded out, a red light on.
    videor: (c) => wrap('videor', c, `
      <linearGradient id="cam-U" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="${light(c, 0.4)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.4)}"/></linearGradient>
      <radialGradient id="glass-U" cx="35%" cy="35%" r="70%"><stop offset="0" stop-color="#7d8fa0"/><stop offset="0.5" stop-color="#2a3440"/><stop offset="1" stop-color="#11161c"/></radialGradient>
      <linearGradient id="screen-U" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fc0cf"/><stop offset="1" stop-color="#3f6476"/></linearGradient>`, `
      <!-- the body -->
      <rect x="44" y="44" width="76" height="40" rx="9" fill="url(#cam-U)" stroke="${INK}" stroke-width="1.4"/>
      <path d="M50 47 Q 80 43 112 47" stroke="#ffffff" stroke-width="1.6" opacity="0.3" fill="none" stroke-linecap="round"/>
      <!-- the strap -->
      <path d="M58 84 Q80 92 104 84" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="M58 84 Q80 92 104 84" fill="none" stroke="#5a4a3a" stroke-width="3" stroke-linecap="round"/>
      <!-- the lens -->
      <rect x="26" y="50" width="22" height="28" rx="4" fill="#2b2622" stroke="${INK}" stroke-width="1.3"/>
      <ellipse cx="26" cy="64" rx="7" ry="13" fill="url(#glass-U)" stroke="${INK}" stroke-width="1.3"/>
      <ellipse cx="24" cy="59" rx="2" ry="4" fill="#ffffff" opacity="0.35"/>
      <!-- the screen, folded out -->
      <path d="M120 50 L142 44 L142 76 L120 72 Z" fill="#2b2622" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M123 53 L139 48.5 L139 72 L123 69 Z" fill="url(#screen-U)"/>
      <!-- the red light and a button -->
      <circle cx="108" cy="52" r="3" fill="#d23a2a" stroke="${INK}" stroke-width="0.8"/>
      <circle cx="107.3" cy="51.3" r="0.9" fill="#ffffff" opacity="0.7"/>
      <rect x="64" y="38" width="22" height="7" rx="3" fill="${dark(c, 0.3)}" stroke="${INK}" stroke-width="1.1"/>
    `),

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
  ART.spel = ART.pads;           // our own Spel pages on top of RomM: the two pads
  ART.romm = ART.pads;           // (the box's tile still has RomM's id)
  ART.bilder = ART.immich;
  ART.live = ART.svt1;           // the start page's Live tile: the mast with its signal

  P.art = {
    html(id, color) {
      const fn = ART[id] || ART.default;
      return fn(color || INK);
    },
    has(id) { return !!ART[id]; },
  };
})(window.PioneerTV);
