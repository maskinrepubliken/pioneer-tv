// Pioneer TV Spel: browse the RomM library with the pad.
//
// One page, three views switched by the hash so B goes back without a
// reload: #/ (recently played, consoles, collections), #/platform/<id>,
// #/collection/<own|virtual>/<id> (a console's or collection's games) and
// #/search/<words> (what the start page's search found). A game
// opens spela.html, our own player. All data comes from romm.js.
(function (M) {
  const b = M.bridge;
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const legend = $('legend');
  M.launcherUrl = new URL('index.html?tv=1', location.href).href;

  const UNDO_MS = 5000;
  const tv = location.search.includes('tv=1') ? '&tv=1' : '';
  const playUrl = (id) => `spela.html?rom=${id}${tv}`;

  // ------------------------------------------------------------ helpers
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (days <= 0) return 'idag';
    if (days === 1) return 'igår';
    if (days < 7) return `${days} dgr`;
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  }

  const PLATFORM_SHORT = { nes: 'NES', snes: 'SNES', n64: 'N64', genesis: 'Genesis', win: 'PC' };
  const platformName = (slug) => PLATFORM_SHORT[slug] || (slug || '').toUpperCase();

  // Sharp box art without the wait: a card shows RomM's small cover at once,
  // and once it is on screen the big one is fetched (two at a time, the box's
  // network is slow: a screen of big covers took over half a minute) and
  // swapped in when it has loaded.
  const sharpen = (() => {
    const queue = [];
    let busy = 0;
    const next = () => {
      while (busy < 2 && queue.length) {
        const img = queue.shift();
        if (!img.isConnected || !img.dataset.large) continue;
        busy++;
        const big = new Image();
        big.decoding = 'async';
        const done = () => { busy--; next(); };
        big.onload = () => { if (img.isConnected) img.src = big.src; done(); };
        big.onerror = done;
        big.src = img.dataset.large;
      }
    };
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seen.unobserve(e.target);
        queue.push(e.target);
      }
      next();
    });
    return (img) => seen.observe(img);
  })();

  function cover(game) {
    const box = el('span', 'cover');
    const paper = () => { box.className = 'cover cover-paper'; box.textContent = game.name; };
    if (!game.cover) { paper(); return box; }
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = game.cover;
    img.onerror = paper;
    if (game.coverLarge && game.coverLarge !== game.cover) {
      img.dataset.large = game.coverLarge;
      img.addEventListener('load', () => sharpen(img), { once: true });
    }
    box.appendChild(img);
    return box;
  }

  // A game card: cover, title and a line of meta. Shared by the recent row
  // and the grid.
  function card(game, { size }) {
    const a = el('a', `spel-card spel-card--${size} pioneertv-card`);
    a.href = playUrl(game.id);
    a.dataset.id = String(game.id);
    a.dataset.key = `game:${game.id}`;
    a.appendChild(el('span', 'band'));
    a.appendChild(cover(game));
    a.appendChild(el('span', 'title', game.name));
    if (size === 'recent') a.appendChild(el('span', 'meta', `${platformName(game.platform)} · ${when(game.lastPlayed)}`));
    return a;
  }

  function groupCard(name, count, href, key, kind) {
    const a = el('a', `spel-card spel-card--group spel-card--${kind} pioneertv-card`);
    a.href = href;
    a.dataset.key = key;
    a.appendChild(el('span', 'band'));
    a.appendChild(el('span', 'name', name));
    a.appendChild(el('span', 'meta', `${count} spel`));
    return a;
  }

  function setLegend(items) {
    legend.innerHTML = '';
    for (const [key, text] of items) {
      const s = el('span');
      if (key) { const k = el('kbd', 'pioneertv-kbd', key); s.appendChild(k); s.append(' '); }
      s.append(text);
      legend.appendChild(s);
    }
    const credit = el('span', 'credit');
    const img = el('img'); img.src = 'ordbild-en-rad-black.svg'; img.alt = 'Maskinrepubliken';
    credit.appendChild(img);
    legend.appendChild(credit);
  }

  // Where the focus was in each view, so B lands back on the same card.
  const lastFocus = {};
  function restoreFocus(route, fallback) {
    const key = lastFocus[route];
    const target = (key && view.querySelector(`[data-key="${CSS.escape(key)}"]`)) || fallback;
    if (target) M.nav.focus(target);
  }
  // The navigation announces every focus move (focusin does not fire while
  // the window itself lacks focus, as in a preview pane). onFocus is the
  // current view's own handler, if it has one.
  let onFocus = null;
  b.on('nav:focus', (target) => {
    if (!target || !view.contains(target)) return;
    const k = target.closest('[data-key]');
    if (k) lastFocus[location.hash || '#/'] = k.dataset.key;
    if (onFocus) onFocus(target);
  });

  // ------------------------------------------------------------ messages
  function message(text, hint, retry) {
    view.innerHTML = '';
    const box = el('section', 'spel-message');
    box.appendChild(el('p', '', text));
    if (hint) box.appendChild(el('p', 'hint', hint));
    if (retry) {
      const btn = el('button', 'knapp primar', 'Försök igen');
      btn.type = 'button';
      btn.addEventListener('click', retry);
      box.appendChild(btn);
      M.nav.focus(btn);
    }
    view.appendChild(box);
  }

  // While a view loads: "Laddar…" in the middle, in italics, as the player
  // says it while a game loads.
  function loadingView() {
    view.innerHTML = '';
    view.appendChild(el('p', 'spel-loading', 'Laddar…'));
  }

  function renderError(err) {
    const code = err && err.code;
    if (code === 'no_key') return message('Lägg in en API-nyckel för RomM under Inställningar → RomM', null, route);
    if (code === 'auth') return message('API-nyckeln godtas inte', 'Lägg in en ny under Inställningar → RomM.', route);
    console.error(err);
    return message('RomM svarar inte', 'Kontrollera att servern är igång.', route);
  }

  // ------------------------------------------------------------ start view
  async function start(token) {
    setLegend([['A', 'spela · öppna'], ['X', 'ta bort ur senast spelade'], ['B', 'startsidan']]);
    const [recent, platforms, collections] = await Promise.all([M.romm.recent(), M.romm.platforms(), M.romm.collections()]);
    if (!M.spel.isCurrent(token)) return;          // the hash moved on while we waited
    view.innerHTML = '';
    onFocus = null;
    undo = null;                 // its card belonged to the view we just replaced
    const head = el('header', 'spel-head');
    head.appendChild(el('h1', 'spel-title', 'Spel'));
    const total = platforms.reduce((n, p) => n + p.count, 0);
    head.appendChild(el('span', 'spel-count', `${platforms.length} konsoler · ${total} spel`));
    view.appendChild(head);

    const section = (label, cards, id) => {
      const s = el('section', 'spel-section');
      s.id = id;
      s.appendChild(el('h2', 'spel-label', label));
      const row = el('div', 'spel-row');
      cards.forEach((c) => row.appendChild(c));
      s.appendChild(row);
      s.hidden = !cards.length;
      view.appendChild(s);
      return row;
    };
    const recentRow = section('Senast spelade', recent.filter((g) => !pending.has(g.id)).map((g) => card(g, { size: 'recent' })), 'recent');
    section('Konsoler', platforms.map((p) => groupCard(PLATFORM_SHORT[p.slug] || p.name, p.count, `#/platform/${p.id}`, `platform:${p.id}`, 'platform')), 'platforms');
    section('Samlingar', collections.map((c) => groupCard(c.name, c.count, `#/collection/${c.kind}/${encodeURIComponent(c.id)}`, `collection:${c.kind}:${c.id}`, 'collection')), 'collections');
    restoreFocus('#/', recentRow.firstElementChild || view.querySelector('.spel-card'));
  }

  // ------------------------------------------------------------ remove + undo
  // The card leaves at once; RomM hears of it only when the undo window has
  // passed, or when the page goes away, so undo never needs to touch RomM.
  const pending = new Map();       // rom id -> timer
  let undo = null;                 // { id, card, row, next } of the last removal

  function send(id, keepalive) {
    clearTimeout(pending.get(id));
    pending.delete(id);
    M.romm.removeRecent(id, { keepalive }).catch((e) => console.error('remove_last_played', id, e));
  }

  function remove(cardEl) {
    const id = Number(cardEl.dataset.id);
    const row = cardEl.parentElement;
    const next = cardEl.nextElementSibling;
    const focusTo = next || cardEl.previousElementSibling;
    cardEl.remove();
    if (!row.children.length) row.closest('.spel-section').hidden = true;
    M.nav.focus(focusTo || view.querySelector('.spel-card'));
    undo = { id, card: cardEl, row, next };
    pending.set(id, setTimeout(() => { send(id, false); if (undo && undo.id === id) undo = null; }, UNDO_MS));
    M.hud.toast('Borttaget · X ångra', 'gamepad', UNDO_MS);
  }

  function restore() {
    const { id, card: c, row, next } = undo;
    undo = null;
    clearTimeout(pending.get(id));
    pending.delete(id);
    row.insertBefore(c, next && next.parentElement === row ? next : null);
    row.closest('.spel-section').hidden = false;
    M.nav.focus(c);
  }

  window.addEventListener('pagehide', () => { for (const id of [...pending.keys()]) send(id, true); });

  // ------------------------------------------------------------ grid
  // A console's, a collection's or a search's games: covers three across, an info panel
  // that follows the focus, letter jumps on L1/R1 and a search field. Only
  // the rows around the focus are in the DOM (a console can have nearly a
  // thousand games): the spatial navigation moves into the row just outside
  // the view by geometry, and focusin then shifts the window around it.
  const COLS = 3;
  const WINDOW_ROWS = 3;           // rows kept either side of the focused row

  // The letter a game files under, taken from RomM's sort key so the jumps
  // follow the order the grid is in ("The Blues Brothers" is a B). å, ä and ö
  // are letters of their own; anything else (digits, punctuation) is '#'.
  function letterKey(game) {
    const c = (game.sortKey || game.name || '').trim().charAt(0).toLocaleLowerCase('sv-SE');
    if ('åäö'.includes(c) && c) return c;
    const base = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /^[a-z]$/.test(base) ? base : '#';
  }
  const fold = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sv-SE');

  const PLAYERS = (p) => (p ? `${p} spelare` : null);

  async function grid(opts, token) {
    setLegend([['A', 'spela'], ['L1', ''], ['R1', 'hoppa en bokstav'], ['Y', 'sök'], ['B', 'tillbaka']]);
    const [{ games }, title] = await Promise.all([M.romm.games(opts), gridTitle(opts)]);
    if (!M.spel.isCurrent(token)) return;
    undo = null;                 // a removal on the start view can no longer be undone from here
    const route = location.hash;
    let shown = games;
    let windowStart = -1;
    const nodes = new Map();       // game index in `shown` -> card

    view.innerHTML = '';
    const head = el('header', 'spel-head');
    head.appendChild(el('h1', 'spel-title', title));
    const search = el('input', 'spel-search');
    search.type = 'search';
    search.placeholder = 'Sök bland spelen…';
    search.autocomplete = 'off';
    head.appendChild(search);
    const count = el('span', 'spel-count');
    head.appendChild(count);
    view.appendChild(head);

    const body = el('div', 'spel-grid-body');
    const scroller = el('div', 'spel-grid-scroll');
    const gridEl = el('div', 'spel-grid');
    scroller.appendChild(gridEl);
    body.appendChild(scroller);
    const info = el('aside', 'spel-info');
    body.appendChild(info);
    view.appendChild(body);

    function showInfo(game) {
      info.innerHTML = '';
      if (!game) return;
      info.appendChild(el('h2', 'spel-info-title', game.name));
      const meta = [platformName(game.platform), game.year, game.publisher, PLAYERS(game.players)].filter(Boolean).join(' · ');
      info.appendChild(el('p', 'spel-info-meta', meta));
      if (game.summary) info.appendChild(el('p', 'spel-info-summary', game.summary));
      info.appendChild(el('p', 'spel-info-meta', game.lastPlayed ? `Senast: ${when(game.lastPlayed)}` : 'Aldrig spelat'));
    }

    function renderWindow(centerIndex) {
      const rows = Math.ceil(shown.length / COLS);
      gridEl.style.setProperty('--rows', String(Math.max(rows, 1)));
      const row = Math.floor(centerIndex / COLS);
      const first = Math.max(0, row - WINDOW_ROWS) * COLS;
      const last = Math.min(shown.length, (row + WINDOW_ROWS + 1) * COLS);
      if (first === windowStart && nodes.size === last - first) return;
      windowStart = first;
      for (const [i, node] of nodes) {
        if (i < first || i >= last) { node.remove(); nodes.delete(i); }
      }
      for (let i = first; i < last; i++) {
        if (nodes.has(i)) continue;
        const c = card(shown[i], { size: 'grid' });
        c.dataset.index = String(i);
        c.style.gridRow = String(Math.floor(i / COLS) + 1);
        c.style.gridColumn = String((i % COLS) + 1);
        gridEl.appendChild(c);
        nodes.set(i, c);
      }
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
      count.textContent = list.length === games.length ? `${games.length} spel` : `${list.length} av ${games.length} spel`;
      renderWindow(0);
      if (!list.length) showInfo(null);
    }

    onFocus = (target) => {
      const c = target.closest('.spel-card');
      if (!c || !gridEl.contains(c)) return;
      const i = Number(c.dataset.index);
      renderWindow(i);
      showInfo(shown[i]);
    };

    search.addEventListener('input', () => {
      const q = fold(search.value.trim());
      setShown(q ? games.filter((g) => fold(g.name).includes(q)) : games);
    });

    // L1/R1 arrive as Shift+Tab/Tab: jump to the previous/next letter.
    gridEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || M.nav.captured) return;
      e.preventDefault();
      const c = document.activeElement.closest('.spel-card');
      if (!c) return;
      let i = Number(c.dataset.index);
      const key = letterKey(shown[i]);
      if (e.shiftKey) {
        // To the start of this letter; from there, to the start of the one before.
        let start = i;
        while (start > 0 && letterKey(shown[start - 1]) === key) start--;
        if (start === i && i > 0) {
          const prev = letterKey(shown[i - 1]);
          start = i - 1;
          while (start > 0 && letterKey(shown[start - 1]) === prev) start--;
        }
        i = start;
      } else {
        while (i < shown.length - 1 && letterKey(shown[i]) === key) i++;
      }
      focusIndex(i);
      M.hud.toast(letterKey(shown[i]).toUpperCase(), '', 700);
    });

    // B in the search field: clear the filter first, then go back.
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || M.nav.captured || !search.value) return;
      e.preventDefault();
      e.stopPropagation();
      search.value = '';
      setShown(games);
      focusIndex(0);
    });

    setShown(games);
    const saved = lastFocus[route];
    const savedIndex = saved ? shown.findIndex((g) => `game:${g.id}` === saved) : -1;
    if (shown.length) focusIndex(Math.max(savedIndex, 0));
    else M.nav.focus(search);
  }

  async function gridTitle(opts) {
    if (opts.search) return `”${opts.search}”`;
    if (opts.platformId) {
      const p = (await M.romm.platforms()).find((x) => x.id === opts.platformId);
      return p ? (PLATFORM_SHORT[p.slug] || p.name) : 'Spel';
    }
    const c = (await M.romm.collections()).find((x) => x.kind === opts.collection.kind && String(x.id) === String(opts.collection.id));
    return c ? c.name : 'Samling';
  }

  // ------------------------------------------------------------ router
  let routeToken = 0;
  async function route() {
    const token = ++routeToken;
    const hash = location.hash || '#/';
    const parts = hash.slice(2).split('/').map(decodeURIComponent);
    // A view that takes a moment (a console of nearly a thousand games) says
    // so instead of leaving the last one on screen.
    let settled = false;
    const slow = setTimeout(() => { if (!settled && token === routeToken) loadingView(); }, 300);
    try {
      if (parts[0] === 'platform') await grid({ platformId: Number(parts[1]) }, token);
      else if (parts[0] === 'collection') await grid({ collection: { kind: parts[1], id: parts[2] } }, token);
      else if (parts[0] === 'search' && parts[1]) await grid({ search: parts[1] }, token);   // the start page's search
      else await start(token);
    } catch (err) {
      if (token === routeToken) renderError(err);
    } finally {
      settled = true;
      clearTimeout(slow);
    }
  }
  window.addEventListener('hashchange', route);

  // X arrives as Space, B as Escape.
  window.addEventListener('keydown', (e) => {
    if (M.nav.captured) return;                     // the menu or keyboard has the pad
    const active = document.activeElement;
    // A text field keeps its keys, except B in an empty search field: back.
    if (M.nav.isTextField(active) && !(e.key === 'Escape' && active.classList.contains('spel-search') && !active.value)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (undo) restore();
      else if (active && active.classList.contains('spel-card--recent')) remove(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if ((location.hash || '#/') === '#/') b.home();
      else history.back();
    }
  });

  M.spel = { card, letterKey, isCurrent: (t) => t === routeToken };
  loadingView();
  route();
})(window.PioneerTV);
