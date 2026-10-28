// Pioneer TV library Spel: RomM's games (sources/romm.js), drawn by the
// browse page (browse/page.js). #/ is recently played, the consoles and the
// collections; #/platform/<id>, #/collection/<own|virtual>/<id> and
// #/search/<words> are grids of games. A game opens game.html, which has
// the daemon play it in RetroArch. X on a recently played game takes it off
// the list (X again within five seconds puts it back).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const R = M.romm;
  const tv = location.search.includes('tv=1') ? '&tv=1' : '';
  const UNDO_MS = 5000;

  const PLATFORM_SHORT = { nes: 'NES', snes: 'SNES', n64: 'N64', genesis: 'Genesis', win: 'PC' };
  const platformName = (slug) => PLATFORM_SHORT[slug] || (slug || '').toUpperCase();
  const PLAYERS = (p) => (p === 'flera' ? 'flera spelare' : p ? `${p} spelare` : null);

  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    if (days <= 0) return 'idag';
    if (days === 1) return 'igår';
    if (days < 7) return `${days} dgr`;
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  }

  // A game as the browse page's item: its box art, small then sharp.
  const game = (g, meta) => ({
    key: `game:${g.id}`, id: g.id, title: g.name, meta, shape: 'box',
    picture: g.cover, large: g.coverLarge, href: `game.html?rom=${g.id}${tv}`, game: g,
  });

  // The letter a game files under, from RomM's sort key, so the jumps
  // follow the order the grid is in ("The Blues Brothers" is a B).
  const letter = (it) => M.grid.letterOf(it.game.sortKey || it.game.name);

  function gridOf(title, games, filter) {
    return {
      kind: 'grid', title, filter,
      legend: [['A', 'spela'], ['L1', ''], ['R1', 'hoppa en bokstav']],
      items: games.map((g) => game(g)), shape: 'box', columns: 3, rowHeight: '16.2rem', letter,
      count: (n, all) => (n === all ? `${all} spel` : `${n} av ${all} spel`),
      empty: 'Inga spel här.',
      info: (it) => {
        const g = it.game;
        return {
          title: g.name,
          meta: [platformName(g.platform), g.year, g.publisher, PLAYERS(g.players)].filter(Boolean).join(' · '),
          text: g.summary,
          foot: g.lastPlayed ? `Senast: ${when(g.lastPlayed)}` : 'Aldrig spelat',
        };
      },
    };
  }

  async function start() {
    const [recent, platforms] = await Promise.all([R.recent(), R.platforms()]);
    undo = null;                 // its card belonged to the view drawn before
    const total = platforms.reduce((n, p) => n + p.count, 0);
    return {
      kind: 'shelf', title: 'Spel', count: `${platforms.length} konsoler · ${total} spel`,
      legend: [['A', 'spela · öppna'], ['X', 'ta bort ur senast spelade']],
      sections: [
        { id: 'recent', label: 'Senast spelade', layout: 'row', shape: 'box',
          items: recent.filter((g) => !pending.has(g.id)).map((g) => game(g, `${platformName(g.platform)} · ${when(g.lastPlayed)}`)),
          empty: 'Inget spelat än. Välj en konsol till vänster.' },
      ],
    };
  }

  async function view([what, a, b]) {
    if (what === 'platform') {
      const [{ games }, platforms] = await Promise.all([R.games({ platformId: Number(a) }), R.platforms()]);
      const p = platforms.find((x) => x.id === Number(a));
      return gridOf(p ? (PLATFORM_SHORT[p.slug] || p.name) : 'Spel', games, true);
    }
    if (what === 'collection') {
      const [{ games }, collections] = await Promise.all([R.games({ collection: { kind: a, id: b } }), R.collections()]);
      const c = collections.find((x) => x.kind === a && String(x.id) === String(b));
      return gridOf(c ? c.name : 'Samling', games, true);
    }
    if (what === 'search' && a) {
      const { games } = await R.games({ search: a });
      return gridOf(`”${a}”`, games, false);
    }
    return start();
  }

  // The column at the left: the start, the consoles, the collections.
  async function rail() {
    const [platforms, collections] = await Promise.all([R.platforms(), R.collections()]);
    return [
      { items: [{ label: 'Senast spelade', href: '#/', key: 'rail:recent' }] },
      { label: 'Konsoler', items: platforms.map((p) => ({ label: PLATFORM_SHORT[p.slug] || p.name, href: `#/platform/${p.id}`, key: `platform:${p.id}` })) },
      { label: 'Samlingar', items: collections.map((c) => ({ label: c.name, href: `#/collection/${c.kind}/${encodeURIComponent(c.id)}`, key: `collection:${c.kind}:${c.id}` })) },
    ];
  }

  // ------------------------------------------------------------ remove + undo
  // The card leaves at once; RomM hears of it only when the undo window has
  // passed, or when the page goes away, so undo never needs to touch RomM.
  const pending = new Map();       // rom id -> timer
  let undo = null;                 // { id, card, row, next } of the last removal

  function send(id, keepalive) {
    clearTimeout(pending.get(id));
    pending.delete(id);
    R.removeRecent(id, { keepalive }).catch((e) => console.error('remove_last_played', id, e));
  }

  function remove(card) {
    const id = Number(card.dataset.key.split(':')[1]);
    const row = card.parentElement;
    const next = card.nextElementSibling;
    const focusTo = next || card.previousElementSibling;
    card.remove();
    if (!row.children.length) row.closest('section').hidden = true;
    M.nav.focus(focusTo || document.querySelector('.view .card'));
    undo = { id, card, row, next };
    pending.set(id, setTimeout(() => { send(id, false); if (undo && undo.id === id) undo = null; }, UNDO_MS));
    M.hud.toast('Borttaget · X ångra', 'gamepad', UNDO_MS);
  }

  function restore() {
    const { id, card, row, next } = undo;
    undo = null;
    clearTimeout(pending.get(id));
    pending.delete(id);
    row.insertBefore(card, next && next.parentElement === row ? next : null);
    row.closest('section').hidden = false;
    M.nav.focus(card);
  }

  window.addEventListener('pagehide', () => { for (const id of [...pending.keys()]) send(id, true); });

  // X arrives as Space.
  function onKey(e) {
    if (e.key !== ' ') return false;
    if (e.repeat) return true;
    const active = document.activeElement;
    if (undo) restore();
    else if (active && active.closest('#recent') && active.classList.contains('card')) remove(active);
    return true;
  }

  M.libraries = M.libraries || {};
  M.libraries.spel = {
    name: 'Spel', source: 'RomM', search: 'Sök bland spelen…',
    isRoot: ([what]) => !what,
    view, rail, onKey,
  };
})(window.PioneerTV);
