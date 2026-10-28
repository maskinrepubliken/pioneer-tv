// Pioneer TV library Spel: RomM's games (sources/romm.js), drawn by the
// browse page (browse/page.js). #/ is recently played; #/collections the
// collections, a shelf each; #/platform/<id>, #/collection/<own|virtual>/<id>
// and #/search/<words> are grids of games; the column at the left goes to
// them, the consoles by their pad. A game opens game.html, which has the
// daemon play it in RetroArch. X on a recently played game takes it off the
// list (X again within five seconds puts it back); X on any other game
// marks it favourite, or not (RomM's Favourites).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const R = M.romm;
  const tv = location.search.includes('tv=1') ? '&tv=1' : '';
  const UNDO_MS = 5000;

  const PLATFORM_SHORT = { nes: 'NES', snes: 'SNES', n64: 'N64', genesis: 'Genesis', win: 'PC' };
  // A console's symbol in the column (content/icons.js), by RomM's slug;
  // one without keeps its initial.
  const CONSOLE_ICON = {
    nes: 'nes', famicom: 'nes', snes: 'snes', sfam: 'snes', n64: 'n64',
    genesis: 'genesis', 'genesis-slash-megadrive': 'genesis', sms: 'genesis', segacd: 'disc', saturn: 'disc',
    gb: 'gameboy', gbc: 'gameboy', gba: 'gba', psx: 'disc', ps2: 'disc', dc: 'disc',
    dos: 'floppy', win: 'floppy', amiga: 'floppy', c64: 'floppy', arcade: 'arcade', mame: 'arcade', neogeoaes: 'arcade',
  };
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

  // A game as the browse page's item: its box art, small then sharp; a
  // heart when it is a favourite (favs: the ids, R.favorites()).
  const game = (g, meta, favs) => ({
    key: `game:${g.id}`, id: g.id, title: g.name, meta, shape: 'box', favorite: !!favs && favs.has(g.id),
    picture: g.cover, large: g.coverLarge, href: `game.html?rom=${g.id}${tv}`, game: g,
  });

  // The letter a game files under, from RomM's sort key, so the jumps
  // follow the order the grid is in ("The Blues Brothers" is a B).
  const letter = (it) => M.grid.letterOf(it.game.sortKey || it.game.name);

  function gridOf(title, games, filter, favs) {
    return {
      kind: 'grid', title, filter,
      legend: [['A', 'spela'], ['X', 'favorit'], ['L1', ''], ['R1', 'hoppa en bokstav']],
      items: games.map((g) => game(g, undefined, favs)), shape: 'box', columns: 4, letter,
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
    const [recent, platforms, favs] = await Promise.all([R.recent(), R.platforms(), R.favorites().catch(() => new Set())]);
    undo = null;                 // its card belonged to the view drawn before
    const total = platforms.reduce((n, p) => n + p.count, 0);
    return {
      kind: 'shelf', title: 'Spel', count: `${platforms.length} konsoler · ${total} spel`,
      legend: [['A', 'spela · öppna'], ['X', 'ta bort ur senast spelade']],
      sections: [
        { id: 'recent', label: 'Senast spelade', layout: 'shelf', shape: 'box',
          items: recent.filter((g) => !pending.has(g.id)).map((g) => game(g, `${platformName(g.platform)} · ${when(g.lastPlayed)}`, favs)),
          empty: 'Inget spelat än. Välj en konsol till vänster.' },
      ],
    };
  }

  // The collections: a shelf each, its first games and the way to all.
  async function shelves() {
    const [collections, favs] = await Promise.all([R.collections(), R.favorites()]);
    const lists = await Promise.all(collections.map((c) => R.games({ collection: c }).then((r) => r.games).catch(() => [])));
    return {
      kind: 'shelf', title: 'Samlingar', count: collections.length === 1 ? '1 samling' : `${collections.length} samlingar`,
      legend: [['A', 'spela · öppna'], ['X', 'favorit']],
      sections: collections.map((c, i) => ({
        label: `${c.name} · ${lists[i].length} spel`, layout: 'shelf', shape: 'box', limit: true,
        items: lists[i].map((g) => game(g, platformName(g.platform), favs)),
        more: { key: `collection:${c.kind}:${c.id}`, title: 'Alla', meta: `${lists[i].length} spel`, href: `#/collection/${c.kind}/${encodeURIComponent(c.id)}` },
        empty: 'Inga spel här än.',
      })),
    };
  }

  async function view([what, a, b]) {
    const favs = await R.favorites().catch(() => new Set());
    if (what === 'platform') {
      const [{ games }, platforms] = await Promise.all([R.games({ platformId: Number(a) }), R.platforms()]);
      const p = platforms.find((x) => x.id === Number(a));
      return gridOf(p ? (PLATFORM_SHORT[p.slug] || p.name) : 'Spel', games, true, favs);
    }
    if (what === 'collections') return shelves();
    if (what === 'collection') {
      const [{ games }, collections] = await Promise.all([R.games({ collection: { kind: a, id: b } }), R.collections()]);
      const c = collections.find((x) => x.kind === a && String(x.id) === String(b));
      return gridOf(c ? c.name : 'Samling', games, true, favs);
    }
    if (what === 'search' && a) {
      const { games } = await R.games({ search: a });
      return gridOf(`”${a}”`, games, false, favs);
    }
    return start();
  }

  // The column at the left: the start, the collections (one page for all
  // of them, marked inside one too), the consoles.
  async function rail([what]) {
    const platforms = await R.platforms();
    return [
      { items: [
        { label: 'Senast spelade', icon: 'clock', href: '#/', key: 'rail:recent' },
        { label: 'Samlingar', icon: 'stack', href: '#/collections', key: 'rail:collections', active: what === 'collections' || what === 'collection' },
      ] },
      { label: 'Konsoler', items: platforms.map((p) => ({
        label: PLATFORM_SHORT[p.slug] || p.name, icon: CONSOLE_ICON[p.slug], href: `#/platform/${p.id}`, key: `platform:${p.id}`,
      })) },
    ];
  }

  // X on a game: favourite, or not. The heart changes at once; RomM is told
  // after, and the heart goes back if it says no.
  async function toggleFavorite(card) {
    const id = Number(card.dataset.key.split(':')[1]);
    const on = !card.classList.contains('card--fav');
    M.cards.favorite(card, on);
    M.hud.toast(on ? 'Favorit' : 'Inte längre favorit', 'heart');
    try {
      await R.setFavorite(id, on);
    } catch (err) {
      console.error('favourite', id, err);
      M.cards.favorite(card, !on);
      M.hud.toast('RomM svarar inte, prova igen', 'info');
    }
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
    const isGame = active && active.classList.contains('card') && /^game:/.test(active.dataset.key || '');
    if (undo) restore();
    else if (isGame && active.closest('#recent')) remove(active);
    else if (isGame) toggleFavorite(active);
    return true;
  }

  M.libraries = M.libraries || {};
  M.libraries.spel = {
    name: 'Spel', source: 'RomM', search: 'Sök bland spelen…',
    isRoot: ([what]) => !what,
    view, rail, onKey,
  };
})(window.PioneerTV);
