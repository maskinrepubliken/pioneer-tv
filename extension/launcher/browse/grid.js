// Pioneer TV browse page, the grid: a long collection of cards (a console's
// games, every album), with
//
//   { items, shape, look, columns, info, letter, count }
//
// look: 'stacks' for cards of wholes (cards.js stack: the artists), else
// covers on shelves. info(item): { title, meta, text, foot } for a strip
// under the cards that follows the focus; letter(item): the letter it
// files under, for L1/R1 jumps; count(shown, all): the heading's count. The page's search field filters it while it is on screen.
//
// Only the rows around the focus are in the page (a console can have nearly
// a thousand games, the box 1,707 albums): with every card there, the
// spatial navigation looked at each on every press, 110 to 160 ms. The rows
// are shelves of one height (planks.js); the navigation moves
// into the row just outside the window by geometry, and the focus moving
// in it shifts the window around it.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const el = M.views.el;
  const C = M.cards;
  const WINDOW_ROWS = 3;           // rows kept either side of the focused row

  // The navigation's own word for a move (focusin does not fire while the
  // window itself lacks focus, as in a preview pane), for the grid on screen.
  let current = null;
  M.bridge.on('nav:focus', (t) => { if (t && current) current(t); });

  const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('sv-SE');

  // The letter a name files under: å, ä and ö are letters of their own;
  // anything else (digits, punctuation) is '#'.
  function letterOf(name) {
    const c = (name || '').trim().charAt(0).toLocaleLowerCase('sv-SE');
    if (c && 'åäö'.includes(c)) return c;
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return /^[a-z]$/.test(base) ? base : '#';
  }

  // ctx: { setCount(text), savedKey }. Returns { focusFirst(), filter(words),
  // focusIndex(i), remove(key), insert(item, at), alive() }; the grid on
  // screen is also M.grid.active.
  function render(view, spec, ctx) {
    const all = spec.items;
    const cols = spec.columns || 5;
    const letter = spec.letter || ((it) => letterOf(it.title));
    let shown = all;
    let words = '';
    let windowStart = -1;
    const nodes = new Map();       // index in shown -> card

    const body = el('div', 'grid-view');
    const scroller = el('div', 'scroll grid-scroll');
    const stacks = spec.look === 'stacks';
    const gridEl = stacks ? el('div', 'shelf-stacks') : M.planks.el(spec.shape || 'square', cols);
    gridEl.classList.add('grid');
    gridEl.style.setProperty('--columns', String(cols));
    scroller.appendChild(gridEl);
    body.appendChild(scroller);
    const info = spec.info ? el('aside', 'grid-info') : null;
    if (info) body.appendChild(info);
    view.appendChild(body);

    function showInfo(item) {
      if (!info) return;
      info.innerHTML = '';
      const d = item && spec.info(item);
      if (!d) return;
      info.appendChild(el('h2', 'grid-info-title', d.title));
      if (d.meta) info.appendChild(el('p', 'grid-info-meta', d.meta));
      if (d.text) info.appendChild(el('p', 'grid-info-text', d.text));
      if (d.foot) info.appendChild(el('p', 'grid-info-meta', d.foot));
    }

    function place(i) {
      const c = stacks ? C.stack(shown[i], spec.shape) : C.card(shown[i], spec.shape);
      c.dataset.index = String(i);
      c.style.gridRow = String(Math.floor(i / cols) + 1);
      c.style.gridColumn = String((i % cols) + 1);
      gridEl.appendChild(c);
      nodes.set(i, c);
      return c;
    }

    function renderWindow(center) {
      gridEl.style.setProperty('--rows', String(Math.max(1, Math.ceil(shown.length / cols))));
      const row = Math.floor(center / cols);
      const first = Math.max(0, row - WINDOW_ROWS) * cols;
      const last = Math.min(shown.length, (row + WINDOW_ROWS + 1) * cols);
      if (first === windowStart && nodes.size === last - first) return;
      windowStart = first;
      for (const [i, node] of nodes) if (i < first || i >= last) { node.remove(); nodes.delete(i); }
      for (let i = first; i < last; i++) if (!nodes.has(i)) place(i);
    }

    function focusIndex(i) {
      if (!shown.length) return;
      i = Math.max(0, Math.min(shown.length - 1, i));
      renderWindow(i);
      M.nav.focus(nodes.get(i));
    }

    function setShown(list) {
      shown = list;
      for (const node of nodes.values()) node.remove();
      nodes.clear();
      windowStart = -1;
      if (spec.count) ctx.setCount(spec.count(list.length, all.length));
      if (list.length) renderWindow(0);
      showInfo(list[0]);
    }

    gridEl.addEventListener('focusin', (e) => {
      const c = e.target.closest('[data-index]');
      if (!c) return;
      renderWindow(Number(c.dataset.index));
      showInfo(shown[Number(c.dataset.index)]);
    });
    current = (t) => {
      const c = gridEl.isConnected && gridEl.contains(t) && t.closest('[data-index]');
      if (c) showInfo(shown[Number(c.dataset.index)]);
    };

    // L1/R1 arrive as Shift+Tab/Tab: to the previous/next letter.
    gridEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || M.nav.captured) return;
      e.preventDefault();
      e.stopPropagation();
      const c = document.activeElement.closest('[data-index]');
      if (!c) return;
      let i = Number(c.dataset.index);
      const key = letter(shown[i]);
      if (e.shiftKey) {
        // To the start of this letter; from there, to the start of the one before.
        let start = i;
        while (start > 0 && letter(shown[start - 1]) === key) start--;
        if (start === i && i > 0) {
          const prev = letter(shown[i - 1]);
          start = i - 1;
          while (start > 0 && letter(shown[start - 1]) === prev) start--;
        }
        i = start;
      } else {
        while (i < shown.length - 1 && letter(shown[i]) === key) i++;
      }
      focusIndex(i);
      M.hud.toast(letter(shown[i]).toUpperCase(), '', 700);
    });

    if (!all.length && spec.empty) scroller.appendChild(el('p', 'empty', spec.empty));
    setShown(all);
    const matches = () => {
      const q = fold(words.trim());
      return q ? all.filter((it) => fold(it.title).includes(q)) : all;
    };
    const api = {
      focusFirst() {
        const at = ctx.savedKey ? shown.findIndex((it) => it.key === ctx.savedKey) : -1;
        focusIndex(Math.max(at, 0));
        return !!shown.length;
      },
      filter(w) {
        words = w;
        setShown(matches());
      },
      focusIndex,
      // Takes an item off (X on a list it can leave): the focus goes to the
      // one now in its place. Returns { item, at } (where it was in the
      // whole) for insert, or null.
      remove(key) {
        const i = shown.findIndex((it) => it.key === key);
        if (i < 0) return null;
        const item = shown[i];
        const at = all.indexOf(item);
        all.splice(at, 1);
        setShown(matches());
        if (shown.length) focusIndex(Math.min(i, shown.length - 1));
        else M.nav.focus(document.getElementById('search-btn'));
        return { item, at };
      },
      // Puts it back where it was, with the focus on it.
      insert(item, at) {
        all.splice(Math.min(at, all.length), 0, item);
        setShown(matches());
        const i = shown.indexOf(item);
        if (i >= 0) focusIndex(i);
      },
      alive: () => gridEl.isConnected,
    };
    M.grid.active = api;
    return api;
  }

  M.grid = { render, letterOf };
})(window.PioneerTV);
