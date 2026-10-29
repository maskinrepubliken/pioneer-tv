// Pioneer TV browse page, the grid: a long collection of cards (a console's
// games, every album), with
//
//   { items, shape, look, columns, info, letter, count }
//
// look: 'stacks' for cards of wholes (cards.js stack), 'names' for names
// alone in a few columns (cards.js name: the artists, who have no
// pictures), else covers on shelves. info(item): { title, meta, text, foot } for a strip
// under the cards that follows the focus; letter(item): the letter it
// files under, for L1/R1 jumps; count(shown, all): the heading's count;
// empty: what the bare plank says when there is nothing at all. The page's
// search field filters it while it is on screen.
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
  const NAME_ROWS = 14;            // a list of names: its rows are low, more of them on screen

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

  // ctx: { setCount(text), shown(n, all, words), savedKey } (shown, when
  // given, instead of setCount: the page heads a filtered grid itself). Returns { focusFirst(), filter(words),
  // focusIndex(i) }; the grid on screen is also M.grid.active.
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
    const names = spec.look === 'names';
    const around = names ? NAME_ROWS : WINDOW_ROWS;
    const gridEl = stacks ? el('div', 'shelf-stacks') : names ? el('div', 'name-list') : M.planks.el(spec.shape || 'square', cols);
    gridEl.classList.add('grid');
    gridEl.style.setProperty('--columns', String(cols));
    scroller.appendChild(gridEl);
    body.appendChild(scroller);
    // The chosen one's info in a column at the right: its whole name, each
    // fact on a line of its own, its whole text. Right from the shelves goes
    // into it; there up and down scroll it, and left or B go back to the
    // cover it is about.
    const info = spec.info ? el('aside', 'grid-info') : null;
    let about = null;              // the card the info is about
    if (info) {
      body.classList.add('grid-view--info');
      info.tabIndex = 0;
      info.setAttribute('aria-label', 'Mer om den');
      body.appendChild(info);
      const layer = {
        onKeyDown(e) {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            info.scrollBy({ top: (e.key === 'ArrowUp' ? -1 : 1) * info.clientHeight * 0.4 });
          } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
            leave();
            M.nav.focus(about && about.isConnected ? about : nodes.get(windowStart) || null);
          }
        },
      };
      const leave = () => { if (M.nav.captured === layer) M.nav.captured = null; };
      info.addEventListener('focus', () => { M.nav.captured = layer; });
      info.addEventListener('blur', leave);
    }
    view.appendChild(body);

    function showInfo(item) {
      if (!info) return;
      info.innerHTML = '';
      info.scrollTop = 0;
      const d = item && spec.info(item);
      if (!d) return;
      info.appendChild(el('h2', 'grid-info-title', d.title));
      const facts = [].concat(d.meta ? d.meta.split(' · ') : [], d.foot || []);
      if (facts.length) {
        const list = el('ul', 'grid-info-facts');
        for (const f of facts) list.appendChild(el('li', '', f));
        info.appendChild(list);
      }
      if (d.text) info.appendChild(el('p', 'grid-info-text', d.text));
    }

    function place(i) {
      const c = stacks ? C.stack(shown[i], spec.shape) : names ? C.name(shown[i]) : C.card(shown[i], spec.shape);
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
      const first = Math.max(0, row - around) * cols;
      const last = Math.min(shown.length, (row + around + 1) * cols);
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

    // Nothing to show (nothing matches, or nothing there at all): a bare
    // dusty plank in the grid's place (planks.js dusty).
    let bare = null;
    function setShown(list) {
      shown = list;
      for (const node of nodes.values()) node.remove();
      nodes.clear();
      windowStart = -1;
      const none = !list.length;
      gridEl.style.display = none ? 'none' : '';
      if (bare) { bare.remove(); bare = null; }
      if (none) {
        bare = M.planks.dusty(words.trim() || !spec.empty ? M.views.NONE : spec.empty);
        scroller.appendChild(bare);
      }
      if (list.length) renderWindow(0);
      showInfo(list[0]);
      if (ctx.shown) ctx.shown(list.length, all.length, words.trim());
      else if (spec.count) ctx.setCount(spec.count(list.length, all.length));
    }

    gridEl.addEventListener('focusin', (e) => {
      const c = e.target.closest('[data-index]');
      if (!c) return;
      renderWindow(Number(c.dataset.index));
      about = c;
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
      count: () => shown.length,
      // Whether L1/R1 have anywhere to go: more than two rows of it, and
      // more than one letter among them.
      jumps() {
        if (shown.length <= cols * 2) return false;
        const first = letter(shown[0]);
        return shown.some((it) => letter(it) !== first);
      },
    };
    M.grid.active = api;
    return api;
  }

  M.grid = { render, letterOf };
})(window.PioneerTV);
