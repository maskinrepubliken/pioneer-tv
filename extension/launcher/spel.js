// Pioneer TV Spel: browse the RomM library with the pad.
//
// One page, three views switched by the hash so B goes back without a
// reload: #/ (recently played, consoles, collections), #/platform/<id> and
// #/collection/<own|virtual>/<id> (a console's or collection's games). A game
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
    if (target) requestAnimationFrame(() => M.nav.focus(target));
  }
  view.addEventListener('focusin', (e) => {
    const k = e.target.closest && e.target.closest('[data-key]');
    if (k) lastFocus[location.hash || '#/'] = k.dataset.key;
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
      requestAnimationFrame(() => M.nav.focus(btn));
    }
    view.appendChild(box);
  }

  function renderError(err) {
    const code = err && err.code;
    if (code === 'no_key') return message('Lägg in en API-nyckel för RomM under Inställningar → RomM', null, route);
    if (code === 'auth') return message('API-nyckeln godtas inte', 'Lägg in en ny under Inställningar → RomM.', route);
    console.error(err);
    return message('RomM svarar inte', 'Kontrollera att servern är igång.', route);
  }

  // ------------------------------------------------------------ start view
  async function start() {
    setLegend([['A', 'spela · öppna'], ['X', 'ta bort ur senast spelade'], ['B', 'startsidan']]);
    const [recent, platforms, collections] = await Promise.all([M.romm.recent(), M.romm.platforms(), M.romm.collections()]);
    view.innerHTML = '';
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

  // ------------------------------------------------------------ router
  let routeToken = 0;
  async function route() {
    const token = ++routeToken;
    const hash = location.hash || '#/';
    const parts = hash.slice(2).split('/').map(decodeURIComponent);
    try {
      if (parts[0] === 'platform' && M.spel.grid) await M.spel.grid({ platformId: Number(parts[1]) }, token);
      else if (parts[0] === 'collection' && M.spel.grid) await M.spel.grid({ collection: { kind: parts[1], id: parts[2] } }, token);
      else await start();
    } catch (err) {
      if (token === routeToken) renderError(err);
    }
  }
  window.addEventListener('hashchange', route);

  // X arrives as Space, B as Escape.
  window.addEventListener('keydown', (e) => {
    if (M.nav.captured) return;                     // the menu or keyboard has the pad
    const active = document.activeElement;
    if (M.nav.isTextField(active)) return;
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

  M.spel = { card, el, cover, when, platformName, setLegend, restoreFocus, message, isCurrent: (t) => t === routeToken };
  message('Laddar…');
  route();
})(window.PioneerTV);
