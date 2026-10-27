// Pioneer TV Film & serier: Jellyfin's films, series and clips with the pad,
// played on the box in mpv.
//
// One page, its views switched by the hash so B goes back without a reload:
// #/ (the first library), #/lib/<id> (a library: "Fortsätt titta", then its
// films, series or clips), #/folder/<id>, #/series/<id>[/<season id>] and
// #/item/<id> (a film, an episode or a clip: picture, overview, Spela, sound
// and subtitles) and #/search/<words>. The tabs are Jellyfin's own libraries, music left out, so a
// new one appears by itself; switching tabs replaces the hash, so B leaves
// the page from any of them.
//
// This page plays nothing. Spela asks the daemon (daemon/pioneertv/video.py)
// to start mpv, whose window covers the page; what is here is black behind
// it, and "Tryck B för att fortsätta" when a video has ended. Nothing plays
// on by itself, not even the next episode. All data comes from jellyfin.js.
(function (M) {
  const b = M.bridge;
  const J = M.jellyfin;
  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const legend = $('legend');
  const titleEl = $('title');
  const tabsEl = $('tabs');
  const search = $('search');
  M.launcherUrl = new URL('index.html?tv=1', location.href).href;

  // ------------------------------------------------------------ helpers
  const V = M.views;
  const el = V.el;

  const clock = (s) => {
    if (s == null || !isFinite(s)) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  // A length as people say it: "1 h 52 min", "24 min".
  const length = (s) => {
    if (!s) return '';
    const m = Math.round(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  };
  const episodeCode = (v) => (v.season != null && v.episode != null ? `S${v.season} · A${v.episode}` : '');

  // A picture, or paper with the name on it.
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

  // How far into it, as a thin ochre line under the picture.
  function progress(v) {
    if (!v.position || !v.seconds) return null;
    const bar = el('span', 'film-progress');
    const fill = el('span');
    fill.style.width = `${Math.min(100, (v.position / v.seconds) * 100)}%`;
    bar.appendChild(fill);
    return bar;
  }

  const setLegend = (items) => V.legend(legend, [...items, ['B', 'tillbaka']]);

  const button = V.button;

  // Where the focus was in each view, so B lands back on the same card.
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

  // ------------------------------------------------------------ cards
  function href(v) {
    if (v.kind === 'series') return `#/series/${encodeURIComponent(v.id)}`;
    if (v.kind === 'season') return `#/series/${encodeURIComponent(v.seriesId)}/${encodeURIComponent(v.id)}`;
    if (v.kind === 'folder') return `#/folder/${encodeURIComponent(v.id)}`;
    return `#/item/${encodeURIComponent(v.id)}`;
  }

  // A film or a series: a portrait poster.
  function posterCard(v) {
    const a = el('a', 'spel-card film-card film-card--poster pioneertv-card');
    a.href = href(v);
    a.dataset.key = `v:${v.id}`;
    a.appendChild(el('span', 'band'));
    const c = cover(v.poster, v.name);
    const bar = progress(v);
    if (bar) c.appendChild(bar);
    a.appendChild(c);
    a.appendChild(el('span', 'title', v.name));
    const meta = v.kind === 'series' && v.count ? `${v.year || ''}${v.year ? ' · ' : ''}${v.count === 1 ? '1 säsong' : `${v.count} säsonger`}` : v.year;
    if (meta) a.appendChild(el('span', 'meta', String(meta)));
    return a;
  }

  // An episode, a clip or something begun: a 16:9 still.
  function stillCard(v) {
    const a = el('a', 'spel-card film-card film-card--still pioneertv-card');
    a.href = href(v);
    a.dataset.key = `v:${v.id}`;
    a.appendChild(el('span', 'band'));
    const c = cover(v.still, v.name);
    const bar = progress(v);
    if (bar) c.appendChild(bar);
    a.appendChild(c);
    a.appendChild(el('span', 'title', v.kind === 'episode' && v.series ? v.series : v.name));
    const meta = v.kind === 'episode' ? [episodeCode(v), v.name].filter(Boolean).join(' · ')
      : v.position && v.seconds ? `${clock(v.seconds - v.position)} kvar` : length(v.seconds);
    if (meta) a.appendChild(el('span', 'meta', meta));
    return a;
  }

  function folderCard(v) {
    const a = el('a', 'spel-card spel-card--group spel-card--collection film-folder pioneertv-card');
    a.href = href(v);
    a.dataset.key = `v:${v.id}`;
    a.appendChild(el('span', 'band'));
    a.appendChild(el('span', 'name', v.name));
    if (v.count != null) a.appendChild(el('span', 'meta', v.count === 1 ? '1 sak' : `${v.count} saker`));
    return a;
  }

  // ------------------------------------------------------------ messages
  const message = (text, hint, retry) => V.message(view, text, hint, retry);

  const loadingView = () => V.loading(view);

  const renderError = (err) => V.error(view, 'Jellyfin', err, route);

  // ------------------------------------------------------------ tabs
  let libraries = null;
  async function libs() {
    if (!libraries) libraries = await J.libraries();
    return libraries;
  }

  function renderTabs(current) {
    tabsEl.innerHTML = '';
    for (const lib of libraries || []) {
      const t = el('a', `film-tab${lib.id === current ? ' aktiv' : ''}`, lib.name);
      t.href = `#/lib/${encodeURIComponent(lib.id)}`;
      t.dataset.key = `tab:${lib.id}`;
      // In place: B leaves the page from any tab, not through each one.
      t.addEventListener('click', (e) => {
        e.preventDefault();
        if (lib.id === current) return;
        history.replaceState(null, '', t.getAttribute('href'));
        route();
      });
      tabsEl.appendChild(t);
    }
    tabsEl.hidden = !current;
  }

  // ------------------------------------------------------------ views
  // A library: what was begun first, then everything in it.
  async function library(id, token) {
    const all = await libs();
    const lib = all.find((l) => l.id === id) || all[0];
    if (!isCurrent(token)) return;
    if (!lib) return message('Inga bibliotek med film eller serier', 'Lägg till ett i Jellyfin.');
    const [begun, found] = await Promise.all([J.resume(lib).catch(() => []), J.browse(lib)]);
    if (!isCurrent(token)) return;
    titleEl.textContent = 'Film & serier';
    renderTabs(lib.id);
    setLegend([['A', 'öppna']]);
    view.innerHTML = '';
    const scroll = el('div', 'film-scroll');
    if (begun.length) {
      scroll.appendChild(el('h2', 'spel-label', 'Fortsätt titta'));
      const row = el('div', 'film-row');
      begun.forEach((v) => row.appendChild(stillCard(v)));
      scroll.appendChild(row);
    }
    scroll.appendChild(el('h2', 'spel-label', lib.name));
    scroll.appendChild(grid(found));
    view.appendChild(scroll);
    restoreFocus(scroll.querySelector('.film-card, .film-folder') || tabsEl.querySelector('.aktiv'));
  }

  // Posters for films and series, stills for clips, folders first.
  function grid(found) {
    if (!found.length) return el('p', 'film-empty', 'Här finns inget än.');
    const box = el('div');
    const folders = found.filter((v) => v.kind === 'folder');
    const posters = found.filter((v) => v.kind === 'movie' || v.kind === 'series');
    const stills = found.filter((v) => !['folder', 'movie', 'series'].includes(v.kind));
    if (folders.length) {
      const g = el('div', 'film-folders');
      folders.forEach((v) => g.appendChild(folderCard(v)));
      box.appendChild(g);
    }
    if (posters.length) {
      const g = el('div', 'film-grid film-grid--poster');
      posters.forEach((v) => g.appendChild(posterCard(v)));
      box.appendChild(g);
    }
    if (stills.length) {
      const g = el('div', 'film-grid film-grid--still');
      stills.forEach((v) => g.appendChild(stillCard(v)));
      box.appendChild(g);
    }
    return box;
  }

  async function searchView(term, token) {
    const found = await J.searchVideos(term);
    if (!isCurrent(token)) return;
    titleEl.textContent = 'Sök';
    renderTabs(null);
    setLegend([['A', 'öppna'], ['Y', 'sök']]);
    view.innerHTML = '';
    const scroll = el('div', 'film-scroll');
    scroll.appendChild(el('h2', 'spel-label', `Träffar för ”${term}”`));
    scroll.appendChild(grid(found));
    view.appendChild(scroll);
    // The focus stays in the field while typing; from the start page's
    // search it lands on the first thing found.
    if (document.activeElement !== search) restoreFocus(scroll.querySelector('.film-card, .film-folder'));
  }

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

  async function folder(id, token) {
    const [what, found] = await Promise.all([J.video(id), J.browse({ id, type: 'mixed' })]);
    if (!isCurrent(token)) return;
    titleEl.textContent = what.name;
    renderTabs(null);
    setLegend([['A', 'öppna']]);
    view.innerHTML = '';
    const scroll = el('div', 'film-scroll');
    scroll.appendChild(grid(found));
    view.appendChild(scroll);
    restoreFocus(scroll.querySelector('.film-card, .film-folder'));
  }

  // A series: its poster and overview on the left, a season's episodes on
  // the right, the seasons as buttons above them.
  async function series(id, seasonId, token) {
    const [show, seasons] = await Promise.all([J.video(id), J.seasons(id)]);
    if (!isCurrent(token)) return;
    // The season asked for, else the first begun but not finished, else the first.
    const season = seasons.find((s) => s.id === seasonId) || seasons.find((s) => !s.played && s.percent) || seasons[0];
    const episodes = season ? await J.episodes(id, season.id) : [];
    if (!isCurrent(token)) return;
    titleEl.textContent = 'Serie';
    renderTabs(null);
    setLegend([['A', 'öppna']]);
    view.innerHTML = '';
    const box = el('div', 'film-detail');
    const side = el('div', 'film-side');
    side.appendChild(cover(show.poster, show.name));
    box.appendChild(side);
    const main = el('div', 'film-main');
    main.appendChild(el('h2', 'film-name', show.name));
    const meta = [show.year, seasons.length === 1 ? '1 säsong' : `${seasons.length} säsonger`, show.genres.slice(0, 3).join(', ')];
    main.appendChild(el('p', 'film-meta', meta.filter(Boolean).join(' · ')));
    if (show.overview) main.appendChild(el('p', 'film-overview film-overview--short', show.overview));
    if (seasons.length > 1) {
      const row = el('div', 'film-seasons');
      for (const s of seasons) {
        const t = el('a', `film-season${season && s.id === season.id ? ' aktiv' : ''}`, s.name);
        t.href = `#/series/${encodeURIComponent(id)}/${encodeURIComponent(s.id)}`;
        t.dataset.key = `season:${s.id}`;
        t.addEventListener('click', (e) => {
          e.preventDefault();
          history.replaceState(null, '', t.getAttribute('href'));
          route();
        });
        row.appendChild(t);
      }
      main.appendChild(row);
    }
    // Only the episodes scroll; the series and its seasons stay in sight.
    const list = el('div', 'film-episodes film-scroll');
    if (episodes.length) episodes.forEach((v) => list.appendChild(episodeRow(v)));
    else list.appendChild(el('p', 'film-empty', 'Inga avsnitt.'));
    main.appendChild(list);
    box.appendChild(main);
    view.appendChild(box);
    // The first episode not yet seen, unless the focus was somewhere before.
    const next = episodes.find((v) => !v.played);
    restoreFocus(list.querySelector(next ? `[data-key="v:${CSS.escape(next.id)}"]` : '.film-episode'));
  }

  function episodeRow(v) {
    const a = el('a', `film-episode${v.played ? ' sedd' : ''}`);
    a.href = href(v);
    a.dataset.key = `v:${v.id}`;
    const c = cover(v.still, '');
    const bar = progress(v);
    if (bar) c.appendChild(bar);
    a.appendChild(c);
    const t = el('span', 't');
    t.appendChild(el('b', '', `${v.episode != null ? `${v.episode}. ` : ''}${v.name}`));
    if (v.overview) t.appendChild(el('span', '', v.overview));
    a.appendChild(t);
    a.appendChild(el('span', 'd', v.played ? 'Sedd' : length(v.seconds)));
    return a;
  }

  // A film, an episode or a clip: what it is, and how to play it.
  let current = null;          // the video on the detail page, with the chosen tracks
  async function item(id, token) {
    const v = await J.video(id);
    if (!isCurrent(token)) return;
    if (v.kind === 'series') return series(v.id, null, token);
    current = { video: v, audio: v.defaultAudio, subtitle: v.defaultSubtitle };
    // The sound and subtitles chosen last time in this series (or film), by
    // language, before Jellyfin's defaults; a language this one lacks keeps them.
    const chose = await lastChoice(v.seriesId || v.id);
    if (!isCurrent(token)) return;
    const audio = chose.audio && v.audio.find((t) => t.language === chose.audio);
    if (audio) current.audio = audio.index;
    if (chose.subtitles === 'no') current.subtitle = -1;
    else {
      const sub = chose.subtitles && v.subtitles.find((t) => t.language === chose.subtitles);
      if (sub) current.subtitle = sub.index;
    }
    titleEl.textContent = v.kind === 'episode' ? v.series || 'Avsnitt' : v.kind === 'movie' ? 'Film' : 'Klipp';
    renderTabs(null);
    setLegend([['A', 'välj']]);
    view.innerHTML = '';
    const box = el('div', 'film-detail');
    const side = el('div', `film-side${v.kind === 'movie' ? '' : ' film-side--still'}`);
    side.appendChild(cover(v.kind === 'movie' ? v.poster : v.still, v.name));
    box.appendChild(side);
    const main = el('div', 'film-main');
    main.appendChild(el('h2', 'film-name', v.name));
    const meta = [episodeCode(v), v.year, length(v.seconds), v.genres.slice(0, 3).join(', ')];
    main.appendChild(el('p', 'film-meta', meta.filter(Boolean).join(' · ')));
    if (v.overview) main.appendChild(el('p', 'film-overview', v.overview));

    const buttons = el('div', 'film-buttons');
    const begun = v.position > 0 && !v.played;
    const play = button(begun ? `Fortsätt från ${clock(v.position)}` : 'Spela', true, () => start(begun ? v.position : 0));
    play.dataset.key = 'play';
    buttons.appendChild(play);
    if (begun) {
      const again = button('Spela från början', false, () => start(0));
      again.dataset.key = 'again';
      buttons.appendChild(again);
    }
    main.appendChild(buttons);

    // Sound and subtitles: A steps to the next choice.
    const tracks = el('div', 'film-buttons film-tracks');
    if (v.audio.length > 1) tracks.appendChild(trackButton('Ljud', v.audio, 'audio', false));
    if (v.subtitles.length) tracks.appendChild(trackButton('Undertexter', v.subtitles, 'subtitle', true));
    if (tracks.children.length) main.appendChild(tracks);
    box.appendChild(main);
    view.appendChild(box);
    restoreFocus(play);
  }

  async function lastChoice(key) {
    try {
      const r = await fetch(`/api/video?key=${encodeURIComponent(key)}`);
      return (await r.json()).choice || {};
    } catch {
      return {};                     // the preview has no daemon
    }
  }

  function trackButton(label, list, field, canBeOff) {
    const choices = (canBeOff ? [{ index: -1, label: 'Av' }] : []).concat(list);
    const btn = el('button', 'knapp film-track');
    btn.type = 'button';
    btn.dataset.key = field;
    const show = () => {
      const now = choices.find((c) => c.index === current[field]) || choices[0];
      current[field] = now.index;
      btn.innerHTML = '';
      btn.appendChild(el('span', 'film-track-label', label));
      btn.append(` ${now.label}`);
    };
    btn.addEventListener('click', () => {
      const at = choices.findIndex((c) => c.index === current[field]);
      current[field] = choices[(at + 1) % choices.length].index;
      show();
    });
    show();
    return btn;
  }

  // ------------------------------------------------------------ playing
  // The daemon starts mpv; this page waits behind it, in a full-screen
  // message (screen.js) that says how it goes.
  const player = {
    state: 'idle',                    // idle | starting | running | ended | error
    isOpen() { return M.screen.isOpen(); },
    show(text, hint) {
      M.screen.show(text, hint);
      M.nav.captured = this;
    },
    close() {
      M.screen.hide();
      this.state = 'idle';
      if (M.nav.captured === this) M.nav.captured = null;
      route();                        // the position has moved: show it
    },
    // Only B does anything here (once the video has ended or failed); while
    // mpv plays, its window has the keys.
    onKeyDown(e) {
      if (e.key === 'Escape' && (this.state === 'ended' || this.state === 'error')) this.close();
    },
  };

  async function start(at) {
    if (!current) return;
    const v = current.video;
    player.state = 'starting';
    player.show('Startar…', v.kind === 'episode' && v.series ? `${v.series} · ${v.name}` : v.name);
    let r;
    try {
      const resp = await fetch('/api/video/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: v.id, start: at, audio: current.audio, subtitle: current.subtitle }),
      });
      r = await resp.json().catch(() => ({}));
    } catch {
      r = { ok: false, message: 'Boxen svarar inte' };
    }
    if (r.ok === false) failed(r.message === 'no_key' ? 'Lägg in en API-nyckel för Jellyfin under Inställningar → Jellyfin' : r.message);
  }

  function failed(text) {
    player.state = 'error';
    player.show(text || 'Filmen kunde inte startas', 'Tryck B för att gå tillbaka');
  }

  b.on('video', (e) => {
    if (player.state === 'idle') return;
    if (e.state === 'running') {
      player.state = 'running';
      M.screen.show('');                // mpv covers it; nothing to read behind
    } else if (e.state === 'ended') {
      player.state = 'ended';
      player.show('Slut', 'Tryck B för att fortsätta');
    } else if (e.state === 'stopped') player.close();
    else if (e.state === 'error') failed(e.message);
  });

  // ------------------------------------------------------------ router
  let routeToken = 0;
  const isCurrent = (t) => t === routeToken;
  async function route() {
    const token = ++routeToken;
    const hash = location.hash || '#/';
    const [what, arg, arg2] = hash.slice(2).split('/').map(decodeURIComponent);
    if (what === 'search' && arg && search.value.trim() !== arg) search.value = arg;
    if (what !== 'search' && document.activeElement !== search) search.value = '';
    let settled = false;
    const slow = setTimeout(() => { if (!settled && isCurrent(token)) loadingView(); }, 300);
    try {
      if (what === 'item' && arg) await item(arg, token);
      else if (what === 'series' && arg) await series(arg, arg2 || null, token);
      else if (what === 'folder' && arg) await folder(arg, token);
      else if (what === 'search' && arg) await searchView(arg, token);
      else await library(what === 'lib' ? arg : null, token);
    } catch (err) {
      if (isCurrent(token)) renderError(err);
    } finally {
      settled = true;
      clearTimeout(slow);
    }
  }
  window.addEventListener('hashchange', route);

  // B: one view back, and from a library out to the start page.
  window.addEventListener('keydown', (e) => {
    if (M.nav.captured || e.key !== 'Escape') return;
    // In the search field B clears it first, then leaves it.
    if (M.nav.isTextField(document.activeElement)) {
      if (document.activeElement !== search || !search.value) return;
      e.preventDefault();
      e.stopPropagation();
      search.value = '';
      if ((location.hash || '').startsWith('#/search/')) history.back();
      return;
    }
    e.preventDefault();
    const hash = location.hash || '#/';
    if (hash === '#/' || hash.startsWith('#/lib/')) b.home();
    else history.back();
  });

  M.film = { player };
  loadingView();
  setLegend([]);
  route();
})(window.PioneerTV);
