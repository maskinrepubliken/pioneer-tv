// Pioneer TV Musik: the Jellyfin music library with the pad.
//
// One page, its views switched by the hash so B goes back without a reload:
// #/ (Blanda allt, Album, Artister, then the playlists), #/albums,
// #/artists, #/playlist/<id>, #/album/<id>, #/artist/<id> and
// #/search/<words>. A song plays here, in this page's <audio>: the music
// lives only as long as the page (leaving it, Home included, stops it).
// "Spelas nu" covers the page while it plays; B goes back to browsing and X
// brings it back. All data comes from jellyfin.js.
(function (M) {
  const b = M.bridge;
  const J = M.jellyfin;
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const legend = $('legend');
  const titleEl = $('title');
  const search = $('search');
  const mini = $('mini');
  M.launcherUrl = new URL('index.html?tv=1', location.href).href;

  // ------------------------------------------------------------ helpers
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const clock = (s) => {
    if (s == null || !isFinite(s)) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const songs = (n) => (n === 1 ? '1 låt' : `${n} låtar`);

  function cover(src, name) {
    const box = el('span', 'cover');
    const paper = () => { box.className = 'cover cover-paper'; box.textContent = name; };
    if (!src) { paper(); return box; }
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;
    img.onerror = paper;
    box.appendChild(img);
    return box;
  }

  function setLegend(target, items) {
    target.innerHTML = '';
    for (const [key, text] of items) {
      const s = el('span');
      if (key) { s.appendChild(el('kbd', 'pioneertv-kbd', key)); s.append(' '); }
      s.append(text);
      target.appendChild(s);
    }
    const credit = el('span', 'credit');
    const img = el('img'); img.src = 'ordbild-en-rad-black.svg'; img.alt = 'Maskinrepubliken';
    credit.appendChild(img);
    target.appendChild(credit);
  }
  // The browsing legend; what plays adds X and L1/R1.
  let viewLegend = [];
  function browseLegend(items) {
    viewLegend = items || viewLegend;
    const playing = player.song() ? [['X', 'spelas nu'], ['L1', ''], ['R1', 'föregående · nästa']] : [];
    setLegend(legend, [...viewLegend, ...playing, ['Y', 'sök'], ['B', 'tillbaka']]);
  }

  // Where the focus was in each view, so B lands back on the same card or song.
  const lastFocus = {};
  function restoreFocus(fallback) {
    const key = lastFocus[location.hash || '#/'];
    const target = (key && view.querySelector(`[data-key="${CSS.escape(key)}"]`)) || fallback;
    if (target) M.nav.focus(target);
  }
  b.on('nav:focus', (target) => {
    if (!target || !view.contains(target)) return;
    const k = target.closest('[data-key]');
    if (k) lastFocus[location.hash || '#/'] = k.dataset.key;
  });

  // ------------------------------------------------------------ cards and rows
  const HREF = { playlist: '#/playlist/', album: '#/album/', artist: '#/artist/' };
  function card(g) {
    const a = el('a', `spel-card musik-card musik-card--${g.kind} pioneertv-card`);
    a.href = HREF[g.kind] + encodeURIComponent(g.id);
    a.dataset.key = `${g.kind}:${g.id}`;
    a.appendChild(el('span', 'band'));
    a.appendChild(cover(g.cover, g.name));
    a.appendChild(el('span', 'title', g.name));
    const meta = g.kind === 'album' ? [g.artist, g.year].filter(Boolean).join(' · ')
      : g.kind === 'playlist' && g.count != null ? songs(g.count) : '';
    if (meta) a.appendChild(el('span', 'meta', meta));
    return a;
  }

  function groupCard(name, meta, href, key) {
    const a = el('a', 'spel-card spel-card--group pioneertv-card');
    a.href = href;
    a.dataset.key = key;
    a.appendChild(el('span', 'band'));
    a.appendChild(el('span', 'name', name));
    if (meta) a.appendChild(el('span', 'meta', meta));
    return a;
  }

  // A song row; A plays the list it is in from it. withCover shows the
  // album's picture instead of the number (a playlist, a search).
  function songRow(song, i, list, { withCover } = {}) {
    const r = el('button', 'musik-song');
    r.type = 'button';
    r.dataset.key = `song:${i}:${song.id}`;
    r.dataset.song = song.id;
    if (withCover && song.thumb) {
      const img = el('img'); img.src = song.thumb; img.alt = ''; img.loading = 'lazy'; r.appendChild(img);
    } else r.appendChild(el('span', 'n', String(i + 1)));
    const t = el('span', 't');
    t.appendChild(el('b', '', song.name));
    t.appendChild(el('span', '', [song.artist, withCover ? song.album : ''].filter(Boolean).join(' · ')));
    r.appendChild(t);
    r.appendChild(el('span', 'd', clock(song.seconds)));
    r.addEventListener('click', () => player.play(list, i));
    return r;
  }

  function markPlaying() {
    const id = player.song() && player.song().id;
    for (const r of view.querySelectorAll('.musik-song')) r.classList.toggle('playing', r.dataset.song === id);
  }

  function button(text, primary, onClick) {
    const btn = el('button', `knapp${primary ? ' primar' : ''}`, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ------------------------------------------------------------ messages
  function message(text, hint, retry) {
    view.innerHTML = '';
    const box = el('section', 'spel-message');
    box.appendChild(el('p', '', text));
    if (hint) box.appendChild(el('p', 'hint', hint));
    if (retry) {
      const btn = button('Försök igen', true, retry);
      box.appendChild(btn);
      M.nav.focus(btn);
    }
    view.appendChild(box);
  }

  function loadingView() {
    view.innerHTML = '';
    view.appendChild(el('p', 'spel-loading', 'Laddar…'));
  }

  function renderError(err) {
    const code = err && err.code;
    const where = 'Inställningar → Jellyfin';
    if (code === 'no_key') return message('Lägg in en API-nyckel för Jellyfin', `Under ${where}.`, route);
    if (code === 'no_user') return message('Användaren finns inte i Jellyfin', `Ändra namnet under ${where}.`, route);
    if (code === 'auth') return message('API-nyckeln godtas inte', `Lägg in en ny under ${where}.`, route);
    console.error(err);
    return message('Jellyfin svarar inte', 'Kontrollera att servern är igång.', route);
  }

  // ------------------------------------------------------------ views
  async function start(token) {
    const playlists = await J.playlists();
    if (!isCurrent(token)) return;
    titleEl.textContent = 'Musik';
    browseLegend([['A', 'öppna · spela']]);
    view.innerHTML = '';
    const scroll = el('div', 'musik-scroll');
    const actions = el('div', 'musik-actions');
    const shuffle = button('Blanda allt', true, shuffleAll);
    shuffle.classList.add('musik-shuffle');
    shuffle.dataset.key = 'shuffle';
    actions.append(shuffle, groupCard('Album', null, '#/albums', 'albums'), groupCard('Artister', null, '#/artists', 'artists'));
    scroll.appendChild(actions);
    scroll.appendChild(el('h2', 'spel-label', 'Spellistor'));
    if (playlists.length) {
      const grid = el('div', 'musik-grid');
      playlists.forEach((p) => grid.appendChild(card(p)));
      scroll.appendChild(grid);
    } else scroll.appendChild(el('p', 'musik-empty', 'Inga spellistor än. Gör en i Jellyfin på datorn eller telefonen.'));
    view.appendChild(scroll);
    restoreFocus(scroll.querySelector('.musik-card') || shuffle);
  }

  async function shuffleAll() {
    try {
      const list = await J.shuffleAll();
      if (list.length) player.play(list, 0);
      else M.hud.toast('Inga låtar i biblioteket', 'info');
    } catch (err) {
      renderError(err);
    }
  }

  async function grid(kind, token) {
    const groups = kind === 'albums' ? await J.albums() : await J.artists();
    if (!isCurrent(token)) return;
    titleEl.textContent = kind === 'albums' ? 'Album' : 'Artister';
    browseLegend([['A', 'öppna']]);
    view.innerHTML = '';
    const scroll = el('div', 'musik-scroll');
    if (groups.length) {
      const g = el('div', 'musik-grid');
      groups.forEach((x) => g.appendChild(card(x)));
      scroll.appendChild(g);
    } else scroll.appendChild(el('p', 'musik-empty', kind === 'albums' ? 'Inga album.' : 'Inga artister.'));
    view.appendChild(scroll);
    restoreFocus(scroll.querySelector('.musik-card'));
  }

  // A playlist or an album: its head and buttons, then its songs.
  async function list(kind, id, token) {
    const [group, list] = await Promise.all([J.item(id), J.songs({ kind, id })]);
    if (!isCurrent(token)) return;
    group.kind = kind;
    titleEl.textContent = kind === 'playlist' ? 'Spellista' : 'Album';
    browseLegend([['A', 'spela']]);
    view.innerHTML = '';
    const box = el('div', 'musik-list');
    const head = el('div', 'musik-list-head');
    head.appendChild(cover(group.cover || (list[0] && list[0].cover), group.name));
    head.appendChild(el('h2', 'musik-list-name', group.name));
    const total = list.reduce((n, s) => n + (s.seconds || 0), 0);
    head.appendChild(el('p', 'musik-list-meta', [kind === 'album' ? group.artist : '', group.year, songs(list.length), clock(total)].filter(Boolean).join(' · ')));
    const buttons = el('div', 'musik-list-buttons');
    const play = button('Spela', true, () => player.play(list, 0));
    play.dataset.key = 'play';
    buttons.append(play, button('Blanda', false, () => player.play(shuffled(list), 0)));
    head.appendChild(buttons);
    box.appendChild(head);
    const rows = el('div', 'musik-songs musik-scroll');
    if (list.length) list.forEach((s, i) => rows.appendChild(songRow(s, i, list, { withCover: kind === 'playlist' })));
    else rows.appendChild(el('p', 'musik-empty', 'Inga låtar.'));
    box.appendChild(rows);
    view.appendChild(box);
    markPlaying();
    restoreFocus(list.length ? play : null);
  }

  async function artist(id, token) {
    const [who, albums] = await Promise.all([J.item(id), J.albums({ artistId: id })]);
    if (!isCurrent(token)) return;
    titleEl.textContent = who.name;
    browseLegend([['A', 'öppna · spela']]);
    view.innerHTML = '';
    const scroll = el('div', 'musik-scroll');
    const actions = el('div', 'musik-list-buttons musik-actions');
    const playAll = async (mix) => {
      try {
        const all = await J.songs({ kind: 'artist', id });
        if (all.length) player.play(mix ? shuffled(all) : all, 0);
      } catch (err) { renderError(err); }
    };
    const play = button('Spela allt', true, () => playAll(false));
    play.dataset.key = 'play';
    actions.append(play, button('Blanda', false, () => playAll(true)));
    scroll.appendChild(actions);
    scroll.appendChild(el('h2', 'spel-label', 'Album'));
    const g = el('div', 'musik-grid');
    albums.forEach((x) => g.appendChild(card(x)));
    scroll.appendChild(g);
    view.appendChild(scroll);
    restoreFocus(play);
  }

  async function searchView(term, token) {
    const found = await J.search(term);
    if (!isCurrent(token)) return;
    titleEl.textContent = 'Sök';
    browseLegend([['A', 'spela · öppna']]);
    view.innerHTML = '';
    const scroll = el('div', 'musik-scroll');
    const section = (label, content, empty) => {
      scroll.appendChild(el('h2', 'spel-label', label));
      if (content) scroll.appendChild(content);
      else scroll.appendChild(el('p', 'musik-empty', empty));
    };
    let rows = null;
    if (found.songs.length) {
      rows = el('div', 'musik-songs');
      found.songs.forEach((s, i) => rows.appendChild(songRow(s, i, found.songs, { withCover: true })));
    }
    const row = (groups) => {
      if (!groups.length) return null;
      const r = el('div', 'musik-row');
      groups.forEach((x) => r.appendChild(card(x)));
      return r;
    };
    section('Artister', row(found.artists), 'Inga artister.');
    section('Album', row(found.albums), 'Inga album.');
    section('Låtar', rows, 'Inga låtar.');
    view.appendChild(scroll);
    markPlaying();
    // The focus stays in the search field while typing; from the start page's
    // search it lands on the first thing found.
    if (document.activeElement !== search) restoreFocus(scroll.querySelector('.musik-card, .musik-song'));
  }

  function shuffled(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ------------------------------------------------------------ search field
  // Typing searches after a pause, in place: the hash follows without a new
  // history entry for every letter, so B leaves the search in one step.
  let typing = null;
  search.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      const term = search.value.trim();
      const inSearch = (location.hash || '').startsWith('#/search/');
      if (!term) { if (inSearch) history.back(); return; }
      const hash = `#/search/${encodeURIComponent(term)}`;
      if (inSearch) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
      route();
    }, 450);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || M.nav.captured || !search.value) return;
    e.preventDefault();
    e.stopPropagation();
    search.value = '';
    if ((location.hash || '').startsWith('#/search/')) history.back();
  });

  // ------------------------------------------------------------ the player
  // A queue of songs and where in it we are; the <audio> plays one at a time.
  const audio = $('audio');
  const STALL_MS = 10000;
  const SKIP_AFTER_ERROR_MS = 3000;

  const player = {
    queue: [], index: -1, started: false, stall: null, lastReport: 0,
    song() { return this.queue[this.index] || null; },

    play(list, index) {
      this.stopReport();
      this.queue = list;
      this.load(index);
      np.open();
    },

    load(index, at = 0) {
      if (index < 0 || index >= this.queue.length) return;
      if (index !== this.index) { this.stopReport(); this.started = false; }
      this.index = index;
      audio.src = J.streamUrl(this.song());
      if (at) audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true });
      setState('Laddar…');
      audio.play().catch((e) => { if (e.name !== 'AbortError') setState('Ljudet kunde inte startas', true); });
      np.render();
      onSongChange();
    },

    toggle() {
      if (!this.song()) return;
      if (audio.paused) audio.play().catch(() => setState('Ljudet kunde inte startas', true));
      else audio.pause();
    },

    next() {
      if (this.index < this.queue.length - 1) this.load(this.index + 1);
      else { audio.pause(); this.stopReport(); setState('Slut på kön'); }
    },
    // Back to the start of the song, or to the one before when near its start.
    prev() {
      if (audio.currentTime > 3 || this.index === 0) audio.currentTime = 0;
      else this.load(this.index - 1);
    },
    seek(by) {
      if (!this.song() || !isFinite(audio.duration)) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration - 1, audio.currentTime + by));
    },

    stopReport() {
      const s = this.song();
      if (s && this.started) J.report('stop', s, audio.currentTime);
      this.started = false;
    },
  };

  function setState(text, error) {
    const s = $('np-state');
    s.textContent = text || '';
    s.classList.toggle('fel', !!error);
  }

  audio.addEventListener('playing', () => {
    clearTimeout(player.stall);
    setState('');
    const s = player.song();
    if (s && !player.started) {
      player.started = true;
      player.lastReport = Date.now();
      J.report('start', s, audio.currentTime);
    }
  });
  audio.addEventListener('pause', () => { if (!audio.ended && player.song()) setState('Pausad'); });
  audio.addEventListener('ended', () => player.next());
  audio.addEventListener('timeupdate', () => {
    np.progress();
    const s = player.song();
    if (s && player.started && Date.now() - player.lastReport > 30000) {
      player.lastReport = Date.now();
      J.report('progress', s, audio.currentTime);
    }
  });
  // A song Jellyfin cannot give us: say so and go on to the next.
  audio.addEventListener('error', () => {
    if (!player.song() || !audio.getAttribute('src')) return;
    clearTimeout(player.stall);
    setState('Låten kunde inte spelas', true);
    const at = player.index;
    setTimeout(() => { if (player.index === at) player.next(); }, SKIP_AFTER_ERROR_MS);
  });
  // A stream that stops coming (the network dropped a moment): pick the song
  // up again from where it was.
  audio.addEventListener('waiting', () => {
    clearTimeout(player.stall);
    const at = player.index, pos = audio.currentTime;
    player.stall = setTimeout(() => {
      if (player.index !== at || audio.paused || audio.readyState >= 3) return;
      console.warn('musik: stalled, reloading at', pos);
      player.load(at, pos);
    }, STALL_MS);
  });

  window.addEventListener('pagehide', () => player.stopReport());

  // What plays, in the heading while browsing.
  function onSongChange() {
    const s = player.song();
    mini.hidden = !s;
    mini.innerHTML = '';
    if (s) {
      if (s.thumb) { const img = el('img'); img.src = s.thumb; img.alt = ''; mini.appendChild(img); }
      mini.appendChild(el('span', '', `${s.name} – ${s.artist}`));
    }
    markPlaying();
    browseLegend();
  }
  mini.addEventListener('click', () => np.open());

  // ------------------------------------------------------------ Spelas nu
  // Over the whole page, holding the pad while open: A or X pauses, L1/R1
  // skip, left/right seek, B goes back to browsing (the music plays on).
  const np = {
    root: $('np'),
    isOpen() { return !this.root.hidden; },
    open() {
      if (!player.song()) return;
      this.root.hidden = false;
      M.nav.captured = this;
      this.render();
    },
    close() {
      this.root.hidden = true;
      if (M.nav.captured === this) M.nav.captured = null;
      const row = view.querySelector('.musik-song.playing');
      if (row && !view.contains(document.activeElement)) M.nav.focus(row);
    },
    render() {
      const s = player.song();
      if (!s) return;
      const c = $('np-cover');
      c.innerHTML = '';
      if (s.cover) { const img = el('img'); img.src = s.cover; img.alt = ''; c.appendChild(img); }
      $('np-title').textContent = s.name;
      $('np-artist').textContent = s.artist;
      $('np-album').textContent = s.album;
      $('np-label').textContent = `Spelas nu · ${player.index + 1} av ${player.queue.length}`;
      $('np-len').textContent = clock(s.seconds);
      const q = $('np-queue');
      q.innerHTML = '';
      for (const next of player.queue.slice(player.index + 1, player.index + 7)) {
        const li = el('li');
        li.appendChild(el('b', '', next.name));
        li.appendChild(el('span', '', next.artist));
        q.appendChild(li);
      }
      if (!q.children.length) q.appendChild(el('li', 'musik-empty', 'Inget mer i kön'));
      setLegend($('np-legend'), [['A', 'paus · spela'], ['L1', ''], ['R1', 'föregående · nästa'], ['◀ ▶', 'spola'], ['B', 'bläddra']]);
      this.progress();
    },
    progress() {
      const s = player.song();
      const len = isFinite(audio.duration) ? audio.duration : (s && s.seconds) || 0;
      $('np-pos').textContent = clock(audio.currentTime || 0);
      if (len) $('np-len').textContent = clock(len);
      $('np-bar').style.width = len ? `${Math.min(100, (audio.currentTime / len) * 100)}%` : '0';
    },
    onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') { if (!e.repeat) player.toggle(); }
      else if (e.key === 'Tab') { if (!e.repeat) (e.shiftKey ? player.prev() : player.next()); }
      else if (e.key === 'ArrowLeft') player.seek(-10);
      else if (e.key === 'ArrowRight') player.seek(10);
      else if (e.key === 'Escape') this.close();
    },
  };
  // The quick menu and the keyboard take the pad while open; it comes back here.
  const recapture = () => { if (np.isOpen() && !M.nav.captured) M.nav.captured = np; };
  b.on('menu:close', recapture);
  b.on('keyboard:close', recapture);

  // ------------------------------------------------------------ router
  let routeToken = 0;
  const isCurrent = (t) => t === routeToken;
  async function route() {
    const token = ++routeToken;
    const hash = location.hash || '#/';
    const [what, arg] = hash.slice(2).split('/').map(decodeURIComponent);
    if (what === 'search' && arg && search.value.trim() !== arg) search.value = arg;
    if (what !== 'search' && document.activeElement !== search) search.value = '';
    let settled = false;
    const slow = setTimeout(() => { if (!settled && isCurrent(token)) loadingView(); }, 300);
    try {
      if (what === 'albums' || what === 'artists') await grid(what, token);
      else if ((what === 'playlist' || what === 'album') && arg) await list(what, arg, token);
      else if (what === 'artist' && arg) await artist(arg, token);
      else if (what === 'search' && arg) await searchView(arg, token);
      else await start(token);
    } catch (err) {
      if (isCurrent(token)) renderError(err);
    } finally {
      settled = true;
      clearTimeout(slow);
    }
  }
  window.addEventListener('hashchange', route);

  // While browsing: X opens Spelas nu, L1/R1 (Tab) skip, B goes back.
  window.addEventListener('keydown', (e) => {
    if (M.nav.captured) return;                     // Spelas nu, the menu or the keyboard has the pad
    const active = document.activeElement;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.repeat && player.song()) (e.shiftKey ? player.prev() : player.next());
      return;
    }
    if (M.nav.isTextField(active) && !(e.key === 'Escape' && active === search && !search.value)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) np.open();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if ((location.hash || '#/') === '#/') b.home();
      else history.back();
    }
  });

  M.musik = { player, np };
  loadingView();
  browseLegend([]);
  route();
})(window.PioneerTV);
