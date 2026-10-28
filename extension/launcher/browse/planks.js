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

  M.planks = { el: planks, COLUMNS };
})(window.PioneerTV);
