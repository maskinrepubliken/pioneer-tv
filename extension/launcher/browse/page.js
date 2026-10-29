// Pioneer TV browse page: one page for every library, browse.html?library=
// spel (RomM's games), musik or film (Jellyfin's music, films and series).
// What a library holds, and where it comes from, is its own
// (libraries/<name>.js); how it is drawn and driven is the same for all:
// this file, and the views it draws (shelf.js, grid.js, detail.js, out of
// cards.js).
//
// A library is { name, source, search, isRoot(parts), view(parts),
// rail(parts), legend(), onKey(e) }: rail() gives the column at the left
// its ways in (browse/rail.js); view() answers a hash (#/what/arg/...) with
// a view to draw,
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
  const searchBtn = $('search-btn');
  const searchItem = $('search-item');
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

  // ------------------------------------------------------------ the filled button
  // A view's filled button (Spela, Blanda allt, Försök igen) is always X's:
  // X presses it wherever the focus is, before whatever else X means in the
  // library (Spelas nu), and the legend says it, X and the button's name.
  const filled = () => [...view.querySelectorAll('.knapp.primar:not([disabled])')].find((b) => b.offsetParent);

  // ------------------------------------------------------------ the legend
  let viewLegend = [];
  function legend(items) {
    if (items) viewLegend = items;
    let extra = library.legend ? library.legend() : [];
    const button = filled();
    if (button) extra = [['X', button.textContent.trim().toLocaleLowerCase('sv-SE')], ...extra.filter(([key]) => key !== 'X')];
    // L1/R1 only where a grid has letters to jump between (not a handful
    // of results, not none); nothing found, nothing to choose (no A); Y
    // changes the words where there are some.
    const nothing = view.querySelector('.dusty');
    const own = nothing ? [] : viewLegend.filter(([key]) => !((key === 'L1' || key === 'R1') && !(onScreen && onScreen.jumps())));
    const searching = parts()[0] === 'search' || (grid && search.value.trim());
    V.legend(legendEl, [...own, ...extra, ['Y', searching ? 'ändra sökningen' : 'sök'], ['B', library.isRoot(parts()) ? 'hem' : 'tillbaka']]);
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
  let onScreen = null;           // the grid on screen, filtered or not (its L1/R1)
  function draw(spec) {
    if (spec.kind !== 'message') V.clear();
    drawView(spec);
    legend();                    // again, now that it knows whether there is a filled button
    b.emit('browse:drawn');
  }
  function drawView(spec) {
    view.innerHTML = '';
    grid = null;
    onScreen = null;
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
      // A grid filtered by the search field is headed "SNES: the words", and
      // how many in it match beside it (the grid tells, as it filters).
      const shown = (n, all, words) => {
        const name = spec.title || library.name;
        titleEl.textContent = words ? `${name}: ${words}` : name;
        countEl.textContent = words ? V.hits(n) : spec.count ? spec.count(n, all) : '';
        if (onScreen) legend();      // as it filters: A, L1/R1 and Y follow
      };
      grid = onScreen = M.grid.render(view, spec, { shown, savedKey: lastFocus[here()] });
      legend();
      // Nothing found: the focus is left be (the column would open over the
      // heading); the first arrow finds Sök.
      if (!typing) grid.focusFirst();
      if (!spec.filter) grid = null;
      return;
    }
    const first = spec.kind === 'detail' ? M.detail.render(view, spec) : M.shelf.render(view, spec);
    if (!typing && !spec.none) restoreFocus(first || searchBtn);   // nothing found: as a grid, the focus is left be
  }

  // ------------------------------------------------------------ routing
  let routeToken = 0;
  const isCurrent = (t) => t === routeToken;
  async function route() {
    const token = ++routeToken;
    rail(token);
    const [what, arg] = parts();
    if (what === 'search' && arg && search.value.trim() !== arg) search.value = arg;
    if (what !== 'search' && document.activeElement !== search) search.value = '';
    showQuery();
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

  // The column at the left, for where the page is now; a source that does
  // not answer leaves it with Sök alone (the view says what is wrong).
  async function rail(token) {
    let groups = [];
    try { groups = library.rail ? await library.rail(parts()) : []; } catch { /* the view says it */ }
    if (isCurrent(token)) M.rail.render(groups, here());
  }

  // ------------------------------------------------------------ search
  // A round button, as on every page of ours; A on it (or Y anywhere) opens
  // the on-screen keyboard on a field out of sight, which shows what is
  // typed. The words stay beside the button. Over a grid they filter what
  // is there, at once; elsewhere they search the library after a pause, in
  // place: the hash follows without a new history entry for every letter,
  // so B leaves the search in one step.
  searchBtn.appendChild(M.icons.svg('search'));
  searchItem.addEventListener('click', () => M.keyboard.open(search));
  M.keyboard.searchField = search;
  // While the words are typed outside a grid, the heading says them at
  // once (a grid heads itself as it filters; a search's view when it comes).
  function showQuery() {
    const q = search.value.trim();
    if (!grid && q && document.activeElement === search) { titleEl.textContent = V.searchTitle(q); countEl.textContent = ''; }
  }
  // The keyboard closed (OK, or B): the focus goes to what was found.
  b.on('keyboard:close', () => setTimeout(() => {
    if (document.activeElement !== search) return;
    search.blur();
    if (grid) grid.focusIndex(0);
    else restoreFocus(view.querySelector('.card:not(.card--group), .row, .card, .knapp') || searchBtn);
  }, 0));
  let typingTimer = null;
  search.addEventListener('input', () => {
    showQuery();
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
    showQuery();
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
    if (V.key(e)) { e.preventDefault(); return; }
    const button = e.key === ' ' && filled();
    if (button) { e.preventDefault(); if (!e.repeat) button.click(); return; }
    if (library.onKey && library.onKey(e)) { e.preventDefault(); return; }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    // A grid filtered: B takes the filter away first.
    if (grid && search.value) {
      search.value = '';
      showQuery();
      grid.filter('');
      grid.focusIndex(0);
      return;
    }
    if (library.isRoot(parts())) b.home();
    else history.back();
  });

  M.browse = { route, legend, head: $('head'), view, library };
  V.loading(view);
  legend([]);
  route();
})(window.PioneerTV);
