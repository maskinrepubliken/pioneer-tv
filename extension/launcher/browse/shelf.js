// Pioneer TV browse page, the shelf: a view of sections one under the other,
// each with its label, scrolling as one column. A library's start, a film
// library, an artist, a search. A section:
//
//   { label, layout, items, shape, columns, look, empty }
//
// layout: 'stacks' (wholes as cards: collections, playlists, artists, each
// its picture or its first few in a pile, cards.js stack; columns, 3 if
// not given),
// 'shelf' (covers standing on shelves, as many to a shelf as there
// are columns, the next shelf under it: nothing scrolls sideways; 'row' and
// 'grid' are shelves too), 'groups' (type-only cards, wrapping), 'actions'
// (buttons and type-only cards in a line: { button: true, label, primary,
// run, key } for a button) or 'rows' (a list, look 'number', 'thumb' or
// 'still'). A section without items is left out, or says empty.
// focus: the key the focus goes to first.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const el = M.views.el;
  const C = M.cards;

  // How many covers to a shelf, by their shape (a still is wide).
  const COLUMNS = { box: 6, poster: 6, square: 6, round: 6, still: 4 };

  // Shelves: the covers stand on them, each its own shape, bottom on the
  // plank, the name under it (browse.css, .planks; the grid's too).
  function planks(shape, columns) {
    const body = el('div', `planks planks--${shape}`);
    body.style.setProperty('--columns', String(columns));
    return body;
  }

  function section(s) {
    const box = el('section', `shelf-section shelf-section--${s.layout}`);
    if (s.id) box.id = s.id;
    if (s.label) box.appendChild(el('h2', 'section-label', s.label));
    const items = s.items || [];
    if (!items.length) {
      if (!s.empty) return null;
      box.appendChild(el('p', 'empty', s.empty));
      return box;
    }
    let body;
    if (s.layout === 'rows') {
      body = el('div', 'rows');
      items.forEach((it, i) => body.appendChild(C.row(it, i + 1, s.look || 'number')));
    } else if (s.layout === 'actions') {
      body = el('div', 'shelf-actions');
      for (const it of items) {
        if (!it.button) { body.appendChild(C.group(it)); continue; }
        const b = M.views.button(it.label, it.primary, it.run);
        if (it.key) b.dataset.key = it.key;
        body.appendChild(b);
      }
    } else if (s.layout === 'stacks') {
      body = el('div', 'shelf-stacks');
      if (s.columns) body.style.setProperty('--columns', String(s.columns));
      items.forEach((it) => body.appendChild(C.stack(it, s.shape)));
    } else if (s.layout === 'groups') {
      body = el('div', 'shelf-groups');
      items.forEach((it) => body.appendChild(C.group(it)));
    } else {
      const shape = s.shape || items[0].shape || 'square';
      const columns = s.columns || COLUMNS[shape] || 6;
      body = planks(shape, columns);
      items.forEach((it) => body.appendChild(C.card(it, shape)));
    }
    box.appendChild(body);
    return box;
  }

  // Draws the view into the page's view; returns where the focus goes first.
  function render(view, spec) {
    const scroll = el('div', 'scroll shelf');
    for (const s of spec.sections) {
      const node = section(s);
      if (node) scroll.appendChild(node);
    }
    view.appendChild(scroll);
    // The key asked for, else the first thing in it before the buttons and
    // type-only cards above it.
    const wanted = spec.focus && scroll.querySelector(`[data-key="${CSS.escape(spec.focus)}"]`);
    return wanted || scroll.querySelector('.card:not(.card--group), .row') || scroll.querySelector('.card, .knapp');
  }

  M.shelf = { render, section, planks, COLUMNS };
})(window.PioneerTV);
