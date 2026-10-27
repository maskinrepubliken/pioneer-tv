// Pioneer TV browse page, the detail: one thing, its picture at the left
// and beside it its name, what it is, a text, buttons, choices, tabs and a
// list; only the list scrolls. A film or an episode (Spela, sound and
// subtitles), a series (its seasons as tabs, the episodes), an album or a
// playlist (Spela, Blanda, the songs).
//
//   { picture, shape, name, meta, text, short, buttons, choices, parts,
//     rows: { items, look, empty }, focus }
//
// shape: the picture's (poster, still or square); short: the text kept to
// three lines (a list follows); buttons: [{ label, primary, key, run }];
// choices: [{ label, key, options: [{ value, label }], value, change }],
// a button that steps to the next option on A; parts: tabs over the list
// (a series' seasons), as cards.tabs; focus: the key the focus goes to
// first.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const V = M.views;
  const el = V.el;
  const C = M.cards;

  function choice(c) {
    let at = Math.max(0, c.options.findIndex((o) => o.value === c.value));
    const btn = el('button', 'knapp choice');
    btn.type = 'button';
    btn.dataset.key = c.key;
    const show = () => {
      btn.innerHTML = '';
      btn.appendChild(el('span', 'choice-label', c.label));
      btn.append(` ${c.options[at].label}`);
    };
    btn.addEventListener('click', () => {
      at = (at + 1) % c.options.length;
      show();
      c.change(c.options[at].value);
    });
    show();
    return btn;
  }

  function render(view, spec) {
    const box = el('div', 'detail');
    const side = el('div', `detail-side detail-side--${spec.shape || 'poster'}`);
    side.appendChild(V.cover(spec.picture, spec.name));
    box.appendChild(side);
    const main = el('div', 'detail-main');
    main.appendChild(el('h2', 'detail-name', spec.name));
    if (spec.meta) main.appendChild(el('p', 'detail-meta', spec.meta));
    if (spec.text) main.appendChild(el('p', `detail-text${spec.short ? ' detail-text--short' : ''}`, spec.text));
    if (spec.buttons && spec.buttons.length) {
      const row = el('div', 'detail-buttons');
      for (const b of spec.buttons) {
        const btn = V.button(b.label, b.primary, b.run);
        if (b.key) btn.dataset.key = b.key;
        row.appendChild(btn);
      }
      main.appendChild(row);
    }
    if (spec.choices && spec.choices.length) {
      const row = el('div', 'detail-buttons detail-choices');
      spec.choices.forEach((c) => row.appendChild(choice(c)));
      main.appendChild(row);
    }
    if (spec.parts && spec.parts.length > 1) main.appendChild(C.tabs(spec.parts));
    if (spec.rows) {
      const list = el('div', 'rows scroll');
      const items = spec.rows.items || [];
      if (items.length) items.forEach((it, i) => list.appendChild(C.row(it, i + 1, spec.rows.look || 'number')));
      else list.appendChild(el('p', 'empty', spec.rows.empty || ''));
      main.appendChild(list);
    }
    box.appendChild(main);
    view.appendChild(box);
    const wanted = spec.focus && box.querySelector(`[data-key="${CSS.escape(spec.focus)}"]`);
    return wanted || box.querySelector('.knapp, .row, .tab');
  }

  M.detail = { render };
})(window.PioneerTV);
