// Pioneer TV overlay page: every menu, every toast and the screensaver,
// over every window.
//
// Loaded by system/overlay.py, a WebKit view on labwc's top layer, from the
// daemon (/ext/overlay/). It talks to the daemon over the WebSocket like the
// Spel pages; the daemon sends it Home, and Y and B while its menu is open,
// and every toast (daemon/pioneertv/overlay.py). The window takes the
// keyboard only while a menu or its keyboard (Sök) is open, so the pad
// drives the page below the rest of the time; what the menu cannot do here
// (go home, back, reload, open a page) it asks the page to do (bridge.relay).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
  const menu = M.hud.menu;
  // overlay.py listens here; in a browser (designing) there is nobody.
  const host = (msg) => {
    try { window.webkit.messageHandlers.pioneertv.postMessage(JSON.stringify(msg)); } catch {}
  };

  // The keyboard goes back to the window below only once every key is up.
  // The menu closes on a key's press (B, or A on Tillbaka); a window that
  // gets the keyboard while that key is still down is told it is held, and
  // Chromium took the B that closed the menu as its own Escape and left
  // fullscreen (seen on the box over SVT1). Registered before the spatial
  // navigation, which stops the keys the menu handles.
  const down = new Set();
  let letGo = null;
  let giveUp = null;             // the fallback for a key up that never comes
  window.addEventListener('keydown', (e) => down.add(e.code), true);
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (!down.size && letGo) letGo();
  }, true);

  b.init();
  M.nav.init();
  b.state.tvMode = true;
  document.documentElement.classList.add('pioneertv-tv');

  // Once per connection (state comes with every status, every ten seconds).
  let greeted = false;
  b.on('state', (s) => {
    if (s.daemonConnected && !greeted) b.daemon({ type: 'hello', client: 'overlay' });
    greeted = s.daemonConnected;
    if (!s.daemonConnected && menu.isOpen()) menu.close();
  });

  // Home: the quick menu, or away with it. The home page asks for a panel
  // of its own (Live, Sök). Held, Home goes to the home page: away with
  // everything here.
  const away = () => { if (M.keyboard.isOpen()) M.keyboard.close(); menu.close(); };
  b.on('menu', (e) => {
    // B over a site's video filling the screen (webvideo.js): its panel.
    if (e && e.panel === 'media') { if (!menu.isOpen() && webVideo()) webPanel(); return; }
    if (e && e.panel) return M.mainMenu.panel(e.panel);
    if (e && e.open) return menu.isOpen() || menu.open(M.mainMenu.spec());
    // Over a site's video or the music's Spelas nu: its panel (below), the
    // quick menu one step in (Mer…).
    if (!menu.isOpen() && webVideo()) return webPanel();
    if (!menu.isOpen() && audioState && audioState.state !== 'idle' && audioState.item) return menu.open(audioSpec());
    menu.toggle();
  });
  b.on('home', () => { if (!held) away(); });
  // Y: away with the keyboard, else with the menu (as on the pages).
  b.on('keyboard', () => (M.keyboard.isOpen() ? M.keyboard.close() : menu.close()));
  b.on('escape', () => (M.keyboard.isOpen() ? M.keyboard.close() : menu.back()));
  // The page a choice opened has loaded: the menu waiting on it goes.
  b.on('loaded', () => { if (menu.punching) menu.close(); });
  // Nothing of a menu stays under the screensaver.
  b.on('saver', (e) => { if (e.show && !held) away(); });

  // A channel on its way (the home page asks): the screen covered, its name
  // on it, until its video plays filling the screen (the webvideo events,
  // below); Home, one of the box's own pages (B on the way), the
  // screensaver or 25 s take it away. Not the keyboard's: the page below
  // still gets the pad. It comes once the tile's holes have been seen.
  const cover = M.screen.in(document.body);
  const COVER_AFTER_MS = 700, COVER_GIVE_UP_MS = 25000;
  let coverTimer = 0;
  const covering = () => cover.isOpen() || !!coverTimer;
  function uncover() {
    clearTimeout(coverTimer);
    coverTimer = 0;
    cover.hide();
  }
  b.on('cover', (e) => {
    clearTimeout(coverTimer);
    coverTimer = setTimeout(() => {
      cover.show('Laddar…', (e && e.text) || '');
      coverTimer = setTimeout(uncover, COVER_GIVE_UP_MS - COVER_AFTER_MS);
    }, COVER_AFTER_MS);
  });
  b.on('menu', uncover);
  b.on('home', uncover);
  b.on('loaded', (e) => { if (e && /\/launcher\//.test(e.url || '')) uncover(); });
  b.on('saver', (e) => { if (e.show) uncover(); });

  // The window has the keyboard while the menu or the keyboard is open, and
  // the daemon is told (it routes Y and B here then, and pauses what plays).
  // Going from one to the other (Sök) is not a close and an open.
  let mine = false;
  function sync() {
    const now = menu.isOpen() || M.keyboard.isOpen();
    if (now === mine) return;
    mine = now;
    if (now) { letGo = null; clearTimeout(giveUp); host({ keyboard: true }); }
    else releaseKeyboard();
    b.daemon({ type: 'overlay_menu', open: now });
  }
  function releaseKeyboard() {
    const done = () => { clearTimeout(giveUp); letGo = null; if (!mine) host({ keyboard: false }); };
    clearTimeout(giveUp);
    giveUp = setTimeout(() => { down.clear(); done(); }, 1500);   // a key up that never came
    letGo = done;
    if (!down.size) done();
  }
  for (const ev of ['menu:open', 'menu:close', 'keyboard:open', 'keyboard:close']) b.on(ev, () => queueMicrotask(sync));
  // Sök's keyboard over the menu: the menu has the pad again when it goes.
  b.on('keyboard:close', () => { if (menu.isOpen() && !M.nav.captured) M.nav.captured = menu; });

  // The toasts and the pad's colours (overlay/hud.js).
  M.hud.listen(b);

  // ------------------------------------------------------------ pause panels
  // A game or a video, held where it is by the daemon ("held"), with its
  // panel over it. B closes the panel and carries on (a choice that closes
  // it runs in the same turn, so that is checked a moment later); so does
  // Home, which the daemon takes itself. A game's Fortsätt spela closes it
  // too; a film's or a video's Fortsätt plays under the open panel.
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch {
      return { ok: false, message: 'Boxen svarar inte' };
    }
  }
  let held = null;               // { kind, resume, e } while a panel is open
  let chose = false;             // a choice closed the panel, not B
  function panel(kind, e, title, items, note, at, resume, spec) {
    held = { kind, resume, e };
    chose = false;
    menu.open(spec || { title: title || 'Pausat', note, items });
    if (!spec) { menu.index = at || 0; menu.highlight(); }
  }
  const pick = (f) => () => { chose = true; f(); };
  b.on('menu:close', () => {
    if (!held) return;
    queueMicrotask(() => {
      if (!chose && held && !menu.isOpen()) held.resume();
      if (!menu.isOpen()) held = null;
    });
  });
  // Mer… on a game's or a film's panel: the quick menu, one step in; what
  // goes to another page from it ends what plays first (stop).
  const more = (stop) => ({ label: 'Mer…', icon: 'menu', detail: '', sub: () => M.mainMenu.spec({
    leave: (go) => { chose = true; menu.close(); Promise.resolve(stop && stop()).then(go); },
  }) });
  function closePanel(kind) {
    if (held && held.kind === kind && menu.isOpen()) { chose = true; held = null; menu.close(); }
  }

  // A game (games.py): Fortsätt spela, Spara läge (a save point more each
  // time), Ladda läge (the newest), Fler lägen (every one, with its picture),
  // Starta om, TV-volym, Sluta spela, Mer… (the quick menu, whose way to another page
  // ends the game first); each one of RetroArch's own commands. Holding B quits.
  const games = (path, body) => post(`/api/games${path}`, body);
  function gamePanel(e, at = 0) {
    const points = e.points || (e.point ? [{ id: null, at: e.point }] : []);
    const note = document.createElement('div');
    note.className = 'pioneertv-menu-note';
    (e.players || []).forEach((name, i) => {
      const p = document.createElement('p');
      p.textContent = `Spelare ${i + 1} · ${name}`;
      note.appendChild(p);
    });
    panel('game', e, e.title, [
      // Fortsätt spela has the mark (A); the filled one, X, saves.
      { label: 'Fortsätt spela', icon: 'play', run: pick(() => games('/resume', { load: 'auto' })) },
      { label: 'Spara läge', icon: 'check', primary: true, keep: true, run: async () => {
        const r = await games('/save_point');
        M.hud.toast(r.ok === false ? (r.message || 'Det gick inte att spara') : 'Läget är sparat', r.ok === false ? 'info' : 'check');
        if (r.ok !== false && held && held.kind === 'game') gamePanel({ ...e, points: r.points || [] }, 1);   // Ladda läge has a time now
      } },
      // The detail at a row's right is for shortcuts alone: the time in the name.
      { label: points.length ? `Ladda läge från ${when(points[0].at)}` : 'Ladda läge', icon: 'clock', disabled: !points.length,
        run: pick(() => games('/resume', { load: 'point' })) },
      { label: 'Fler lägen', icon: 'stack', disabled: points.length < 2, sub: () => pointsSpec(points) },
      { label: 'Starta om', icon: 'reload', run: pick(() => games('/resume', { load: 'none' })) },
      M.hud.volumeItem(),
      { label: 'Sluta spela', icon: 'stop', detail: 'håll B', run: pick(() => games('/quit')) },
      more(() => games('/quit')),
    ], note, at, () => games('/resume', { load: 'auto' }));
  }
  b.on('games', (e) => (e.state === 'held' ? gamePanel(e) : closePanel('game')));
  // When a save point was saved: the time today, else the day too.
  function when(t) {
    const d = new Date(t * 1000), today = new Date();
    const days = Math.round((new Date(today).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
    return days <= 0 ? hhmm(t) : days === 1 ? `igår ${hhmm(t)}` : `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${hhmm(t)}`;
  }
  // Fler lägen: every save point of the game, the newest first, each with
  // the picture of where it was; A loads it.
  function pointsSpec(points) {
    return { title: 'Sparade lägen', items: points.map((p, i) => ({
      label: when(p.at), keep: false, run: pick(() => games('/resume', { load: 'point', point: p.id })),
      render: () => {
        const row = make('div', 'pioneertv-menu-item pioneertv-point');
        const pic = make('span', 'pioneertv-point-picture');
        if (p.picture) pic.innerHTML = `<img alt="" src="/api/games/points/${encodeURIComponent(p.id)}.png">`;
        const words = make('span', 'pioneertv-subhit-words');
        words.append(make('span', 'pioneertv-subhit-name', when(p.at)), make('span', 'pioneertv-subhit-detail', i === 0 ? 'det senaste' : ''));
        row.append(pic, words);
        return row;
      },
    })) };
  }

  // ------------------------------------------------------------ the media panel
  // One panel for whatever plays: a film in mpv (video.py), a site's video
  // (content/webvideo.js in each of the page's frames), the box's music and
  // music (audio.py). Its parts, those that apply (overlay.css, "the media
  // panel"):
  //
  //   the head: the cover (the music's), playing or paused, the whole name,
  //   what it is from;
  //   the timeline: how far in, the time and what is left, read only;
  //   L2 and R2 glide a mark along it, as fast as they are pressed, and
  //   what plays goes where they are let go (below);
  //   the transport: −2 min, −15 s, play or pause under the open panel (on
  //   a film or a video the panel paused: Fortsätt), +15 s, +2 min, round
  //   buttons side by side;
  //   the queue (the music's): the song before and the next;
  //   Från början, TV-volym (L1/R1; marked, left and right, A mutes), Ljud,
  //   Undertexter (A steps to the next), Hitta undertexter, Sluta titta or
  //   spela (the stop symbol), Mer… (the quick menu; a film's, a video's).
  //
  // A source says what plays and does it:
  //   { kind, title, sub, cover, live, time, duration, end, paused, index,
  //     count, audio, subs, to(t), skip(dir), track(kind), first(), last, more }
  // The open panel follows it in place, part by part (drawn anew, the whole
  // menu went and came back: it blinked over SVT Play). Where a seek was put
  // stands until the source has got there (or a moment has passed), and a
  // time that plays runs on between its words.
  const clock = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const lengthOf = (src) => (src.live ? src.end || src.time : src.duration) || 0;
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // The transport's own symbols: play, pause, and a turn back or on with how far.
  const SVG = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const GLYPH = {
    play: SVG('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
    pause: SVG('<rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/>'),
    back: SVG('<path d="M11 6 3.5 12 11 18zM20.5 6 13 12l7.5 6z" fill="currentColor"/>'),
    on: SVG('<path d="M13 6l7.5 6L13 18zM3.5 6 11 12l-7.5 6z" fill="currentColor"/>'),
    turnBack: SVG('<path d="M5 12a7 7 0 1 0 2.05-4.95" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    turnOn: SVG('<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    prev: SVG('<rect x="5" y="6" width="2.4" height="12" rx="1" fill="currentColor"/><path d="M19 6 9 12l10 6z" fill="currentColor"/>'),
    next: SVG('<rect x="16.6" y="6" width="2.4" height="12" rx="1" fill="currentColor"/><path d="M5 6l10 6-10 6z" fill="currentColor"/>'),
  };
  let media = null;              // { src, spec, aim, target, parts } while a media panel is in the menu
  function mediaOpen() { return media && menu.isOpen() && menu.stack.includes(media.spec); }

  function mediaSpec(src, at) {
    media = { src, aim: null, target: null, parts: [], spec: null };
    const m = media;
    const items = [];
    const seekTo = (t) => {
      t = Math.max(0, Math.min(lengthOf(src) || t, t));
      src.to(t);
      src.time = t;
      m.aim = { time: t, until: Date.now() + 2500 };
      refresh();
    };
    const seekable = !src.live ? !!src.duration : !!src.end;

    // ---- the head (the timeline goes under it)
    const head = make('div', 'pioneertv-media-top');
    const top = make('div', 'pioneertv-media-head');
    head.appendChild(top);
    const cover = make('div', 'pioneertv-media-cover');
    const kicker = make('div', 'pioneertv-media-kicker');
    const title = make('div', 'pioneertv-menu-title pioneertv-media-title');
    const sub = make('div', 'pioneertv-media-sub');
    const words = make('div', 'pioneertv-media-words');
    words.append(kicker, title, sub);
    top.append(cover, words);
    m.parts.push(() => {
      const pic = src.cover || '';
      if (cover.dataset.src !== pic) {
        cover.dataset.src = pic;
        cover.innerHTML = pic ? `<img alt="" src="${pic.replace(/"/g, '&quot;')}">` : '';
      }
      cover.hidden = !pic;
      kicker.textContent = [src.live ? 'Direktsänt' : src.paused ? 'Pausad' : 'Spelas',
        src.count > 1 ? `låt ${src.index + 1} av ${src.count}` : ''].filter(Boolean).join(' · ');
      title.textContent = src.title || 'Spelas';
      sub.textContent = src.sub || '';
      sub.hidden = !src.sub;
    });

    // ---- the timeline
    if (seekable) {
      const box = make('div', 'pioneertv-media-timeline');
      const track = make('div', 'pioneertv-media-track');
      const fill = make('div', 'pioneertv-media-fill');
      const mark = make('div', 'pioneertv-media-mark');
      const bubble = make('span', 'pioneertv-media-bubble');
      mark.appendChild(bubble);
      track.append(fill, mark);
      const times = make('div', 'pioneertv-media-times');
      const now = make('span', '', ''), hint = make('span', 'pioneertv-media-hint', ''), end = make('span', '', '');
      times.append(now, hint, end);
      box.append(track, times);
      head.appendChild(box);                       // read, not a stop: L2/R2 move it
      const span = () => lengthOf(src) || 1;
      m.seekTo = seekTo;
      m.parts.push(() => {
        const share = Math.max(0, Math.min(1, src.time / span()));
        fill.style.width = `${share * 100}%`;
        const marking = m.target != null;
        box.classList.toggle('marking', marking);
        if (marking) {
          mark.style.left = `${(m.target / span()) * 100}%`;
          bubble.textContent = src.live ? `−${clock(span() - m.target)}` : clock(m.target);
        }
        now.textContent = src.live ? (src.end - src.time > 30 ? `${clock(src.end - src.time)} efter` : 'Direkt') : clock(src.time);
        end.textContent = src.live ? 'direkt' : `−${clock(src.duration - src.time)}`;
        hint.textContent = marking ? 'släpp så hoppar den hit' : 'L2 ◀ ▶ R2';
      });
    }

    // ---- the transport
    const first = src.first();
    const round = (cls, glyph, says, label) => {
      const btn = make('div', `pioneertv-media-btn ${cls}`);
      btn.innerHTML = `<span class="pioneertv-media-ring">${glyph}</span>`;
      btn.appendChild(make('span', 'pioneertv-media-says', says));
      btn.setAttribute('aria-label', label);
      return btn;
    };
    const play = round('pioneertv-media-play', '', first.label, first.label);
    m.parts.push(() => {
      // Plays or pauses under the panel, which stays open: a film or a video
      // the panel paused says Fortsätt, the music Spela.
      const icon = src.paused ? 'play' : 'pause';
      const ring = play.querySelector('.pioneertv-media-ring');
      if (ring.dataset.icon !== icon) { ring.dataset.icon = icon; ring.innerHTML = GLYPH[icon]; }
      const says = !src.paused ? 'Pausa' : src.kind === 'audio' ? 'Spela' : first.label;
      play.querySelector('.pioneertv-media-says').textContent = says;
    });
    const jumps = seekable ? [[-120, 'back', '2 min', '2 minuter bakåt'], [-15, 'turnBack', '15 s', '15 sekunder bakåt']] : [];
    const ahead = seekable ? [[15, 'turnOn', '15 s', '15 sekunder framåt'], [120, 'on', '2 min', '2 minuter framåt']] : [];
    for (const [by, glyph, says, label] of jumps) items.push({ label, row: 'transport', keep: true, render: () => round('', GLYPH[glyph], says, label), run: () => seekTo(src.time + by) });
    items.push({ ...first, row: 'transport', primary: true, render: () => play });
    for (const [by, glyph, says, label] of ahead) items.push({ label, row: 'transport', keep: true, render: () => round('', GLYPH[glyph], says, label), run: () => seekTo(src.time + by) });

    // ---- the queue
    if (src.count > 1) {
      const wide = (glyph, text, label) => {
        const btn = make('div', 'pioneertv-media-wide');
        btn.innerHTML = glyph;
        btn.appendChild(make('span', '', text));
        btn.setAttribute('aria-label', label);
        return btn;
      };
      items.push({ label: 'Förra låten', row: 'queue', keep: true, render: () => wide(GLYPH.prev, 'Förra', 'Förra låten'), run: () => src.skip(-1) });
      items.push({ label: 'Nästa låt', row: 'queue', keep: true, render: () => wide(GLYPH.next, 'Nästa', 'Nästa låt'), run: () => src.skip(1) });
    }

    // ---- the rest, as rows
    const pill = (it, value) => { it.detail = value; it.pill = true; return it; };
    if (!src.live && src.duration) items.push({ label: 'Från början', icon: 'reload', keep: true, run: () => seekTo(0) });
    // The TV's volume after what plays is driven by, before its sound and subtitles.
    items.push(M.hud.volumeItem());
    if (src.audio && src.audio.length > 1) {
      const it = pill({ label: 'Ljud', icon: 'volume', keep: true, run: () => src.track('audio') }, '');
      m.parts.push(() => { setDetail(it, (src.audio.find((t) => t.selected) || src.audio[0]).label); });
      items.push(it);
    }
    if ((src.subs && src.subs.length) || src.find) {
      const it = pill({ label: 'Undertexter', icon: 'info', keep: true, run: () => src.subs.length && src.track('subtitles') }, '');
      m.parts.push(() => { setDetail(it, (src.subs.find((t) => t.selected) || { label: 'Av' }).label); });
      items.push(it);
    }
    if (src.find) items.push({ label: 'Hitta undertexter', icon: 'search', sub: () => findSpec(src) });
    // The music's Blanda and Upprepa, their value in a capsule; A changes it.
    if (src.modes) {
      const REPEAT = { off: 'Av', all: 'Alla låtar', one: 'Den här låten' };
      const shuffle = pill({ label: 'Blanda', icon: 'shuffle', keep: true, run: () => sound('shuffle') }, '');
      const repeat = pill({ label: 'Upprepa', icon: 'repeat', keep: true, run: () => sound('repeat') }, '');
      m.parts.push(() => { setDetail(shuffle, src.shuffle ? 'På' : 'Av'); setDetail(repeat, REPEAT[src.repeat] || 'Av'); });
      items.push(shuffle, repeat);
    }
    // Sluta titta (or spela) last of what plays, then Mer…: the quick menu.
    items.push(src.last);
    if (src.more) items.push(src.more);

    // Hitta undertexter (a film from Jellyfin): its subtitle plugins search
  // the internet; the one chosen is fetched, kept with the film and shown.
  function findSpec(src) {
    const spec = { title: 'Undertexter från nätet', items: [{ label: 'Söker…', icon: 'search', disabled: true, keep: true, run: () => {} }] };
    src.find().then((r) => {
      if (menu.stack[menu.stack.length - 1] !== spec) return;
      spec.items = r.ok && Array.isArray(r.found)
        ? r.found.map((f) => {
          // The name on its own line, what it is under it: the names are long.
          const says = (text) => { const d = it.el && it.el.querySelector('.pioneertv-subhit-detail'); if (d) d.textContent = text; };
          const it = { label: f.name, keep: true, render: () => {
            const row = make('div', 'pioneertv-menu-item pioneertv-subhit');
            row.innerHTML = `<span class="pioneertv-menu-icon">${M.icons.html('info')}</span>`;
            const words = make('span', 'pioneertv-subhit-words');
            words.append(make('span', 'pioneertv-subhit-name', f.name), make('span', 'pioneertv-subhit-detail', f.detail));
            row.appendChild(words);
            return row;
          }, run: async () => {
            if (it.busy) return;
            it.busy = true;
            says('Hämtar…');
            const got = await src.fetch(f.id);
            it.busy = false;
            if (!got.ok) { says(got.message || 'Det gick inte'); return; }
            src.subs = got.subtitles || src.subs;
            if (menu.stack[menu.stack.length - 1] === spec) menu.back();
            refresh(true);
            M.hud.toast('Undertexten är vald', 'info');
          } };
          return it;
        })
        : [{ label: r.message || 'Hittade inga undertexter', icon: 'info', disabled: true, keep: true, run: () => {} }];
      menu.render();
    });
    return spec;
  }

  // The timeline's mark goes when the focus leaves it.
    // First the play button, unless asked for another.
    const playAt = items.findIndex((it) => it.primary);
    m.spec = { title: src.title || 'Spelas', head, items, at: at != null ? at : playAt, media: true };
    refresh(true);
    return m.spec;
  }
  function setDetail(it, text) {
    it.detail = text;
    const d = it.el && it.el.querySelector('.pioneertv-menu-detail');
    if (d && d.textContent !== text) d.textContent = text;
  }
  // L2 and R2 (the daemon's seek: a direction and how hard, 0 let go, 1 all
  // the way) on the open media panel, wherever its focus is: the mark on the
  // timeline glides back or on, the harder the faster (a full press goes
  // through a tenth of the whole a second, a light one through a
  // three-hundredth), and where it is let go, what plays goes. A short
  // light touch is a step of ten seconds. Seeking at every frame would have
  // a site's video load and load; one seek on letting go does not.
  let scrubbing = null;          // { dir, amount, from, at } while L2 or R2 is down
  function scrubSpeed(src, amount) {
    const whole = lengthOf(src) || 600;
    const slow = Math.max(2, whole / 300), fast = Math.max(30, whole / 10);
    return slow + (fast - slow) * amount * amount;
  }
  b.on('seek', (e) => {
    if (!mediaOpen() || menu.stack[menu.stack.length - 1] !== media.spec || !media.seekTo) return;
    const src = media.src;
    const amount = Math.max(0, Math.min(1, Number(e.amount) || 0));
    if (amount > 0) {
      if (!scrubbing) scrubbing = { from: src.time, at: performance.now() };
      scrubbing.dir = e.dir < 0 ? -1 : 1;
      scrubbing.amount = amount;
      if (media.target == null) media.target = src.time;
      return;
    }
    if (!scrubbing) return;
    const { from, dir } = scrubbing;
    scrubbing = null;
    let to = media.target == null ? src.time : media.target;
    if (Math.abs(to - from) < 3) to = from + dir * 10;
    media.target = null;
    media.seekTo(to);
  });
  setInterval(() => {
    if (!scrubbing || !mediaOpen() || media.target == null) return;
    const now = performance.now(), dt = (now - scrubbing.at) / 1000;
    scrubbing.at = now;
    const src = media.src;
    media.target = Math.max(0, Math.min((lengthOf(src) || 1) - 1, media.target + scrubbing.dir * scrubSpeed(src, scrubbing.amount) * dt));
    refresh();
  }, 50);
  // The open panel, from where its source is now.
  function refresh(force) {
    if (!media || (!force && !mediaOpen())) return;
    for (const part of media.parts) part();
  }
  // Word from the source: what it says, unless a seek is still on its way.
  function heard(src, said) {
    if (!media || media.src !== src) return;
    // Another song: no seek on its way, no mark on its timeline.
    if (said.index != null && said.index !== src.index) { media.aim = null; media.target = null; }
    const aim = media.aim;
    Object.assign(src, said);
    if (aim && Date.now() < aim.until && Math.abs((said.time || 0) - aim.time) > 3) src.time = aim.time;
    else media.aim = null;
    src.at = Date.now();
    refresh();
  }
  // A time that plays runs on between the source's words.
  setInterval(() => {
    if (!mediaOpen() || media.src.paused || media.src.live) return;
    const src = media.src;
    const now = Date.now();
    src.time = Math.min(lengthOf(src) || Infinity, src.time + (now - (src.at || now)) / 1000);
    src.at = now;
    refresh();
  }, 1000);
  // Ljud and Undertexter: A steps to the next track.
  const nextTrack = (list, none) => {
    const all = none ? [none, ...list] : list;
    const now = all.find((t) => t.selected) || all[0];
    return all[(all.indexOf(now) + 1) % all.length];
  };
  const mark = (list, chosen) => list.map((t) => ({ ...t, selected: t.id === chosen.id }));

  // A film in mpv (video.py): held paused by the daemon while the panel is
  // open (Fortsätt plays it under the panel); B or Home close the panel and
  // carry on, holding B stops it.
  const video = (path, body) => post(`/api/video${path}`, body);
  function videoPanel(e) {
    const src = {
      kind: 'video', title: e.title, live: false, time: e.time || 0, duration: e.duration || 0, paused: true,
      audio: e.audio || [], subs: e.subtitles || [],
      to: (t) => video('/to', { at: t }),
      // Subtitles from the internet are Jellyfin's (a clip from Immich has none).
      find: e.immich ? null : () => video('/find_subtitles'),
      fetch: (id) => video('/fetch_subtitle', { id }),
      track: async (kind) => {
        const list = kind === 'audio' ? src.audio : src.subs;
        const next = nextTrack(list, kind === 'audio' ? null : { id: 'no', label: 'Av' });
        const r = await video('/track', { kind, id: next.id });
        if (r.ok === false) return;
        if (kind === 'audio') src.audio = mark(src.audio, next); else src.subs = mark(src.subs, next);
        refresh();
      },
      // Under the panel, which stays open (B or Home close it and carry on).
      first: () => ({ label: 'Fortsätt', keep: true, run: async () => {
        const r = await video('/toggle');
        if (r.ok !== false) { src.paused = !!r.paused; refresh(); }
      } }),
      last: { label: 'Sluta titta', icon: 'stop', detail: 'håll B', run: pick(() => video('/stop')) },
      more: more(() => video('/stop')),
    };
    panel('video', e, null, null, null, 0, () => video('/resume'), mediaSpec(src));
  }
  b.on('video', (e) => {
    if (e.state === 'seeked') return seekStrip(e);
    seekStrip(null);
    if (e.state === 'held') videoPanel(e); else closePanel('video');
  });

  // Left and right over a film (video.py seeks), X on a clip: where it is
  // now, small, where the notices are (a card at the top right: playing or
  // paused, the time, a thin timeline), for a moment.
  let strip = null, stripTimer = 0;
  function seekStrip(e) {
    clearTimeout(stripTimer);
    if (!e) { if (strip) strip.classList.remove('shown'); return; }
    if (!strip) {
      strip = make('div', 'pioneertv-seekstrip');
      strip.innerHTML = '<span class="pioneertv-seekstrip-state"></span><div class="pioneertv-seekstrip-body">'
        + '<div class="pioneertv-media-times"><span></span><span></span></div>'
        + '<div class="pioneertv-media-track"><div class="pioneertv-media-fill"></div></div></div>';
      document.body.appendChild(strip);
    }
    const len = e.duration || 0, at = Math.max(0, Math.min(len || e.time, e.time || 0));
    strip.querySelector('.pioneertv-media-fill').style.width = len ? `${(at / len) * 100}%` : '0';
    const [now, left] = strip.querySelectorAll('.pioneertv-media-times span');
    now.textContent = clock(at);
    left.textContent = len ? `−${clock(len - at)}` : '';
    strip.querySelector('.pioneertv-seekstrip-state').innerHTML = GLYPH[e.paused ? 'pause' : 'play'];
    strip.classList.add('shown');
    stripTimer = setTimeout(() => strip.classList.remove('shown'), 2500);
  }

  // A site's video (SVT Play, Cineasterna, any page; content/webvideo.js in
  // each of the page's frames says how its video is). The menu opening
  // paused it (the media event); closing it carries on, a seek where it
  // was put.
  const frames = new Map();      // frame -> what it said last, and when
  const webVideo = () => {
    let best = null;
    for (const [id, s] of frames) {
      if (Date.now() - s.at > 60000) { frames.delete(id); continue; }
      if (s.present && (!best || s.area > best.area)) best = s;
    }
    return best;
  };
  const pageTitle = () => { for (const s of frames.values()) if (s.top && s.title) return s.title; return ''; };
  const tell = (frame, action, value) => b.relay('webvideo', { frame, action, value });
  let webSrc = null;
  b.on('webvideo', (e) => {
    frames.set(e.frame, { ...e, at: Date.now() });
    if (covering() && e.present && e.full && !e.paused) uncover();
    if (webSrc && webSrc.frame === e.frame) heard(webSrc, { time: e.time, duration: e.duration, end: e.end, live: e.live, paused: e.paused, subs: e.subs });
  });
  function webPanel() {
    const v = webVideo();
    if (!v) return;
    const src = webSrc = {
      kind: 'web', frame: v.frame, title: v.title || pageTitle() || 'Video', live: v.live, time: v.time, duration: v.duration, end: v.end,
      paused: true, subs: v.subs, more: more(null),
      to: (t) => tell(v.frame, 'to', t),
      track: () => tell(v.frame, 'subs', nextTrack(src.subs, { id: -1, label: 'Av' }).id),
      first: () => ({ label: 'Fortsätt', keep: true, run: () => { tell(v.frame, 'toggle'); src.paused = !src.paused; refresh(); } }),
      last: { label: 'Sluta titta', icon: 'stop', detail: 'håll B', run: pick(() => b.back()) },
    };
    panel('web', v, null, null, null, 0, () => {}, mediaSpec(src));
  }

  // The box's music (audio.py), while its page's Spelas nu is open: it
  // plays on under the menu; Home opens its panel, as over a film.
  const sound = (action, body) => post(`/api/audio/${action}`, body);
  let audioState = { state: 'idle' };
  let audioSrc = null;
  function fromAudio(s) {
    const it = s.item || {};
    return { title: it.name, sub: [it.artist, it.album].filter(Boolean).join(' · '),
      cover: it.cover || it.thumb || '', live: s.live, time: s.time || 0, duration: s.duration || it.seconds || 0,
      paused: s.state !== 'playing', index: s.index, count: s.kind === 'music' ? s.count : 0, state: s.state,
      shuffle: !!s.shuffle, repeat: s.repeat || 'off' };
  }
  b.on('audio', (s) => {
    audioState = s;
    if (!audioSrc) return;
    if (s.state === 'idle') {
      if (mediaOpen() && media.src === audioSrc) { while (menu.stack[menu.stack.length - 1] !== media.spec) menu.stack.pop(); menu.back(); }
      audioSrc = null;
      return;
    }
    const was = audioSrc.count;
    heard(audioSrc, fromAudio(s));
    if (was !== audioSrc.count && mediaOpen()) refresh();
  });
  fetch('/api/audio').then((r) => r.json()).then((s) => { if (s && s.state) audioState = s; }).catch(() => {});
  function audioSpec() {
    const src = audioSrc = {
      kind: 'audio', ...fromAudio(audioState),
      to: (t) => sound('to', { at: t }),
      skip: (dir) => sound(dir > 0 ? 'next' : 'prev'),
      first: () => ({ label: 'Spela eller pausa', keep: true, run: () => sound('toggle') }),
      // Blanda and Upprepa among its rows; Sluta spela stops it (the stop
      // symbol), and its page leaves Spelas nu; Mer…, the quick menu.
      modes: true,
      last: { label: 'Sluta spela', icon: 'stop', run: () => sound('stop') },
      more: more(() => sound('stop')),
    };
    return mediaSpec(src);
  }

  M.overlay = { host };
})(window.PioneerTV);
