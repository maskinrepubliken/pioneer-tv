// Pioneer TV browse page, the shelves: covers standing on planks, each at
// its own shape with its foot on the plank, the name on a label under it,
// as many to a plank as there are columns and the next plank under it, so
// nothing scrolls sideways. The shelf view's sections (shelf.js) and the
// grid (grid.js) put their cards (cards.js) on them. Styled by planks.css.
//
//   M.planks.el(shape, columns) -> the element the cards go in
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  // How many covers to a plank, by their shape (a still is wide).
  const COLUMNS = { box: 6, poster: 6, square: 6, round: 6, still: 4 };

  function planks(shape, columns = COLUMNS[shape] || 6) {
    const body = M.views.el('div', `planks planks--${shape}`);
    body.style.setProperty('--columns', String(columns));
    return body;
  }

  // Nothing to stand on it (a search that found nothing, an empty
  // collection): one bare plank, dust along its top, a cobweb in the corner
  // above with its spider, and the line in big type on the wall.
  function dusty(text) {
    const box = planks('box', 6);
    box.classList.add('planks--dusty');
    const row = M.views.el('div', 'dusty');
    row.innerHTML = DUST + WEB;
    row.appendChild(M.views.el('p', 'dusty-text', text || M.views.NONE));
    box.appendChild(row);
    return box;
  }
  // The dust: specks and a few fluffs along the plank's top, thicker towards
  // the wall, drawn once from a fixed seed so it lies the same every time.
  const DUST = (() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let out = '';
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 1000, y = 2 + Math.pow(rnd(), 1.6) * 20, r = 0.6 + rnd() * 1.8;
      out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(r * 1.4).toFixed(1)}" ry="${r.toFixed(1)}" fill="${rnd() < 0.5 ? '#d9d2c4' : '#bdb5a7'}"/>`;
    }
    for (let i = 0; i < 5; i++) {
      const cx = 80 + rnd() * 840, cy = 10 + rnd() * 8;
      let fluff = '';
      for (let k = 0; k < 9; k++) {
        const a = rnd() * Math.PI * 2, l = 3 + rnd() * 6;
        fluff += `<path d="M${cx} ${cy} q${(Math.cos(a) * l * 0.6).toFixed(1)} ${(Math.sin(a) * l * 0.2 - 2).toFixed(1)} ${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l * 0.5).toFixed(1)}"/>`;
      }
      out += `<g fill="none" stroke="#b3ab9d" stroke-width="0.8" stroke-linecap="round">${fluff}</g><ellipse cx="${cx}" cy="${cy}" rx="4" ry="2.4" fill="#c9c1b3"/>`;
    }
    return `<svg class="dusty-dust" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
  })();
  // The cobweb: threads from the corner, rings across them, the spider on its own thread.
  const WEB = (() => {
    const spokes = [0, 18, 36, 54, 72, 90].map((d) => d * Math.PI / 180);
    let out = spokes.map((a) => `<path d="M140 0 L${(140 - Math.sin(a) * 150).toFixed(1)} ${(Math.cos(a) * 150).toFixed(1)}"/>`).join('');
    for (const r of [28, 52, 78, 104, 128]) {
      const pts = spokes.map((a) => [140 - Math.sin(a) * r, Math.cos(a) * r]);
      out += `<path d="M${pts.map(([x, y], i) => (i ? `Q${(140 - Math.sin((spokes[i] + spokes[i - 1]) / 2) * r * 0.86).toFixed(1)} ${(Math.cos((spokes[i] + spokes[i - 1]) / 2) * r * 0.86).toFixed(1)} ` : '') + `${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}"/>`;
    }
    const spider = '<path d="M96 0 V86" stroke-width="0.8"/><g stroke="#1c1613" stroke-width="1.4" fill="none">'
      + [-1, 1].map((s) => [[-4, -2], [-3, 2], [0, 4], [3, 6]].map(([dy, dx2]) => `<path d="M96 ${92 + dy * 0.6} q${s * 6} ${-4 + dx2 * 0.3} ${s * 10} ${dy + 3}"/>`).join('')).join('')
      + '</g><ellipse cx="96" cy="92" rx="4" ry="5" fill="#1c1613"/><circle cx="96" cy="86" r="2.6" fill="#1c1613"/>';
    return `<svg class="dusty-web" viewBox="0 0 140 150" aria-hidden="true"><g fill="none" stroke="#b9b2a6" stroke-width="1">${out}${spider}</g></svg>`;
  })();

  M.planks = { el: planks, dusty, COLUMNS };
})(window.PioneerTV);
