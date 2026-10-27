// Pioneer TV browse page: one page for every library, browse.html?library=
// spel (RomM's games), musik or film (Jellyfin's music, films and series).
// What a library holds, and where it comes from, is its own
// (libraries/<name>.js); how it is drawn and driven is the same for all:
// this file, and the views it draws (shelf.js, grid.js, detail.js, out of
// cards.js).
//
// A library is { name, source, search, isRoot(parts), view(parts),
// legend(), onKey(e) }: view() answers a hash (#/what/arg/...) with a view
// to draw,
//
//   { kind: 'shelf' | 'grid' | 'detail', title, count, tabs, legend, ... }
//
// (the rest as the view's file says) or a message: { kind: 'message',
// text, hint }. The views switch by the hash, so B goes back without a
// reload; B from the library's first view goes home. Where the focus was
// in each view is kept, so B lands back on the same card.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const V = M.views;
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const titleEl = $('title');
  const countEl = $('count');
  const tabsEl = $('tabs');
  const search = $('search');
  const legendEl = $('legend');
  M.launcherUrl = new URL('index.html?tv=1', location.href).href;

  const name = new URLSearchParams(location.search).get('library') || 'spel';
  const library = M.libraries[name];
  document.documentElement.dataset.library = name;
  document.title = `${library.name} – Pioneer TV`;
  titleEl.textContent = library.name;
  search.placeholder = library.search;

  const parts = () => (location.hash || '#/').slice(2).split('/').map(decodeURIComponent);
  const here = () => location.hash || '#/';

  // ------------------------------------------------------------ the legend
  let viewLegend = [];
  function legend(items) {
    if (items) viewLegend = items;
    const extra = library.legend ? library.legend() : [];
    V.legend(legendEl, [...viewLegend, ...extra, ['Y', 'sök'], ['B', library.isRoot(parts()) ? 'hem' : 'tillbaka']]);
  }

  // ------------------------------------------------------------ focus
  const lastFocus = {};
  b.on('nav:focus', (target) => {
    if (!target || !view.contains(target)) return;
    const k = target.closest('[data-key]');
    if (k) lastFocus[here()] = k.dataset.key;
  });
  function restoreFocus(fallback) {
    const key = lastFocus[here()];
    const target = (key && view.querySelector(`[data-key="${CSS.escape(key)}"]`)) || fallback;
    if (target) M.nav.focus(target);
  }

  // ------------------------------------------------------------ drawing
  let grid = null;               // the grid on screen, which the search field filters
  function draw(spec) {
    drawView(spec);
    b.emit('browse:drawn');
  }
  function drawView(spec) {
    view.innerHTML = '';
    grid = null;
    titleEl.textContent = spec.title || library.name;
    countEl.textContent = spec.count || '';
    tabsEl.innerHTML = '';
    if (spec.tabs) tabsEl.appendChild(M.cards.tabs(spec.tabs));
    tabsEl.hidden = !spec.tabs;
    legend(spec.legend || []);
    if (spec.kind === 'message') return V.message(view, spec.text, spec.hint, spec.retry);
    // While typing in the field (a search, a filter) the focus stays there.
    const typing = document.activeElement === search;
    if (spec.kind === 'grid') {
      grid = M.grid.render(view, spec, { setCount: (t) => { countEl.textContent = t; }, savedKey: lastFocus[here()] });
      if (!typing && !grid.focusFirst()) M.nav.focus(search);
      if (!spec.filter) grid = null;
      return;
    }
    const first = spec.kind === 'detail' ? M.detail.render(view, spec) : M.shelf.render(view, spec);
    if (!typing) restoreFocus(first || search);
  }

  // ------------------------------------------------------------ routing
  let routeToken = 0;
  const isCurrent = (t) => t === routeToken;
  async function route() {
    const token = ++routeToken;
    const [what, arg] = parts();
    if (what === 'search' && arg && search.value.trim() !== arg) search.value = arg;
    if (what !== 'search' && document.activeElement !== search) search.value = '';
    // A view that takes a moment (a console of nearly a thousand games) says
    // so instead of leaving the last one on screen.
    let settled = false;
    const slow = setTimeout(() => { if (!settled && isCurrent(token)) V.loading(view); }, 300);
    try {
      const spec = await library.view(parts());
      if (isCurrent(token) && spec) draw(spec);
    } catch (err) {
      if (isCurrent(token)) {
        legend([]);
        V.error(view, library.source, err, route);
      }
    } finally {
      settled = true;
      clearTimeout(slow);
    }
  }
  window.addEventListener('hashchange', route);

  // ------------------------------------------------------------ the search field
  // Over a grid it filters what is there, at once. Elsewhere it searches the
  // library after a pause, in place: the hash follows without a new history
  // entry for every letter, so B leaves the search in one step.
  let typingTimer = null;
  search.addEventListener('input', () => {
    if (grid) { grid.filter(search.value); return; }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      const term = search.value.trim();
      const inSearch = here().startsWith('#/search/');
      if (!term) { if (inSearch) history.back(); return; }
      const hash = `#/search/${encodeURIComponent(term)}`;
      if (inSearch) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
      route();
    }, 450);
  });
  // B in the field: clear it first, then leave it.
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || M.nav.captured || !search.value) return;
    e.preventDefault();
    e.stopPropagation();
    search.value = '';
    if (grid) { grid.filter(''); grid.focusIndex(0); }
    else if (here().startsWith('#/search/')) history.back();
  });

  // ------------------------------------------------------------ the pad
  // B: one view back, and from the library's first view home. X and L1/R1
  // are the library's (a grid takes L1/R1 for its letters first).
  window.addEventListener('keydown', (e) => {
    if (M.nav.captured) return;                     // a player, the menu or the keyboard has the pad
    const active = document.activeElement;
    // A text field keeps its keys, except B in an empty search field: back.
    if (M.nav.isTextField(active) && !(e.key === 'Escape' && active === search && !search.value)) return;
    if (library.onKey && library.onKey(e)) { e.preventDefault(); return; }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (library.isRoot(parts())) b.home();
    else history.back();
  });

  M.browse = { route, legend, head: $('head'), view, library };
  V.loading(view);
  legend([]);
  route();
})(window.PioneerTV);
