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
    // A film reel standing at an angle with a strip of film curling away.
    cineasterna: (c) => wrap('cine', c, `
      <linearGradient id="face-U" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${light(c, 0.35)}"/><stop offset="0.6" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.3)}"/>
      </linearGradient>
      <linearGradient id="rim-U" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${dark(c, 0.15)}"/><stop offset="1" stop-color="${dark(c, 0.55)}"/>
      </linearGradient>
      <linearGradient id="strip-U" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#4a4036"/><stop offset="1" stop-color="#2b2419"/>
      </linearGradient>
      <radialGradient id="hole-U" cx="40%" cy="35%" r="70%">
        <stop offset="0" stop-color="${PAPER}"/><stop offset="1" stop-color="#ddd1ad"/>
      </radialGradient>`, `
      <!-- film strip -->
      <path d="M92 66 C 112 58, 128 62, 150 52 L 152 68 C 130 78, 114 74, 94 82 Z" fill="url(#strip-U)"/>
      <g fill="${PAPER}" opacity="0.9">
        <rect x="98" y="66" width="5" height="3.5" rx="0.6" transform="rotate(-14 100 68)"/><rect x="109" y="63" width="5" height="3.5" rx="0.6" transform="rotate(-14 111 65)"/>
        <rect x="120" y="60" width="5" height="3.5" rx="0.6" transform="rotate(-14 122 62)"/><rect x="131" y="57" width="5" height="3.5" rx="0.6" transform="rotate(-14 133 59)"/>
        <rect x="100" y="77" width="5" height="3.5" rx="0.6" transform="rotate(-14 102 79)"/><rect x="111" y="74" width="5" height="3.5" rx="0.6" transform="rotate(-14 113 76)"/>
        <rect x="122" y="71" width="5" height="3.5" rx="0.6" transform="rotate(-14 124 73)"/><rect x="133" y="68" width="5" height="3.5" rx="0.6" transform="rotate(-14 135 70)"/>
      </g>
      <!-- reel rim (thickness) -->
      <ellipse cx="62" cy="62" rx="40" ry="38" fill="url(#rim-U)"/>
      <!-- reel face -->
      <ellipse cx="58" cy="56" rx="40" ry="38" fill="url(#face-U)"/>
      <ellipse cx="58" cy="56" rx="9" ry="8.5" fill="url(#hole-U)"/>
      <ellipse cx="58" cy="32" rx="8" ry="7.5" fill="url(#hole-U)"/>
      <ellipse cx="58" cy="80" rx="8" ry="7.5" fill="url(#hole-U)"/>
      <ellipse cx="34" cy="56" rx="8" ry="7.5" fill="url(#hole-U)"/>
      <ellipse cx="82" cy="56" rx="8" ry="7.5" fill="url(#hole-U)"/>
      <!-- highlight -->
      <ellipse cx="44" cy="34" rx="14" ry="7" fill="#ffffff" opacity="0.28" transform="rotate(-35 44 34)"/>
    `),

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
