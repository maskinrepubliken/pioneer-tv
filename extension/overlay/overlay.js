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

  // X on a pause panel carries on, as B does (before the spatial
  // navigation, which keeps every key while a menu is open).
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' && held && menu.isOpen()) { e.preventDefault(); menu.close(); }
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
    if (e && e.panel) return M.mainMenu.panel(e.panel);
    if (e && e.open) return menu.isOpen() || menu.open(M.mainMenu.spec());
    // Over a site's video: its panel (below), the quick menu one step in.
    if (!menu.isOpen() && webVideo()) return webPanel();
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
  // X, and Home, which the daemon takes itself.
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
  function panel(kind, e, title, items, note, at, resume) {
    held = { kind, resume, e };
    chose = false;
    menu.open({ title: title || 'Pausat', note, items });
    menu.index = at || 0;
    menu.highlight();
  }
  const pick = (f) => () => { chose = true; f(); };
  b.on('menu:close', () => {
    if (!held) return;
    queueMicrotask(() => {
      if (!chose && held && !menu.isOpen()) held.resume();
      if (!menu.isOpen()) held = null;
    });
  });
  function closePanel(kind) {
    if (held && held.kind === kind && menu.isOpen()) { chose = true; held = null; menu.close(); }
  }

  // A game (games.py): Fortsätt spela, Spara läge, Ladda läge, Starta om,
  // TV-volym, Avsluta; each one of RetroArch's own commands. Holding B quits.
  const games = (path, body) => post(`/api/games${path}`, body);
  function gamePanel(e, at = 0) {
    const note = document.createElement('div');
    note.className = 'pioneertv-menu-note';
    (e.players || []).forEach((name, i) => {
      const p = document.createElement('p');
      p.textContent = `Spelare ${i + 1} · ${name}`;
      note.appendChild(p);
    });
    panel('game', e, e.title, [
      { label: 'Fortsätt spela', icon: 'play', primary: true, run: pick(() => games('/resume', { load: 'auto' })) },
      { label: 'Spara läge', icon: 'check', keep: true, run: async () => {
        const r = await games('/save_point');
        M.hud.toast(r.ok === false ? (r.message || 'Det gick inte att spara') : 'Läget är sparat', r.ok === false ? 'info' : 'check');
        if (r.ok !== false && held && held.kind === 'game') gamePanel({ ...e, point: Date.now() / 1000 }, 1);   // Ladda läge has a time now
      } },
      { label: 'Ladda läge', icon: 'back', detail: e.point ? hhmm(e.point) : 'inget sparat', disabled: !e.point,
        run: pick(() => games('/resume', { load: 'point' })) },
      { label: 'Starta om', icon: 'reload', run: pick(() => games('/resume', { load: 'none' })) },
      { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute') },
      { label: 'Avsluta', icon: 'power', run: pick(() => games('/quit')) },
    ], note, at, () => games('/resume', { load: 'auto' }));
  }
  b.on('games', (e) => (e.state === 'held' ? gamePanel(e) : closePanel('game')));

  // A video in mpv (video.py): Fortsätt, Ljud and Undertexter (A steps to
  // the next track, at once), TV-volym. Holding B stops it.
  const video = (path, body) => post(`/api/video${path}`, body);
  function videoPanel(e, at = 0) {
    const audio = e.audio || [];
    const subs = [{ id: 'no', label: 'Av' }, ...(e.subtitles || [])];
    const current = (list) => list.find((t) => t.selected) || list[0];
    const step = (kind, list) => async () => {
      const now = list.indexOf(current(list));
      const next = list[(now + 1) % list.length];
      const r = await video('/track', { kind, id: next.id });
      if (r.ok === false || !held || held.kind !== 'video') return;     // B closed the panel meanwhile
      const mark = (l) => l.map((t) => ({ ...t, selected: t === next }));
      const changed = kind === 'audio' ? { ...e, audio: mark(audio) } : { ...e, subtitles: mark(subs).filter((t) => t.id !== 'no') };
      videoPanel(changed, kind === 'audio' ? 1 : (audio.length > 1 ? 2 : 1));
    };
    const items = [{ label: 'Fortsätt', icon: 'play', primary: true, run: pick(() => video('/resume')) }];
    if (audio.length > 1) items.push({ label: 'Ljud', icon: 'volume', detail: current(audio).label, keep: true, run: step('audio', audio) });
    if (subs.length > 1) items.push({ label: 'Undertexter', icon: 'info', detail: current(subs).label, keep: true, run: step('subtitles', subs) });
    items.push({ label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute') });
    items.push({ label: 'Sluta titta', icon: 'power', detail: 'håll B', run: pick(() => video('/stop')) });
    panel('video', e, e.title, items, null, at, () => video('/resume'));
  }
  b.on('video', (e) => (e.state === 'held' ? videoPanel(e) : closePanel('video')));

  // A site's video (SVT Play, Cineasterna, any page; content/webvideo.js in
  // each of the page's frames says how its video is): Fortsätt, Spola (left
  // and right, 10 s a press, 30 s held), Från början, Undertexter, TV-volym,
  // the quick menu, Sluta titta. The menu opening paused it (the media
  // event); closing it carries on, a seek where it was put.
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
  const clock = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const where = (v) => (v.live ? (v.end - v.time > 30 ? `${clock(v.end - v.time)} efter direkt` : 'direkt') : `${clock(v.time)} av ${clock(v.duration)}`);
  const tell = (v, action, value) => b.relay('webvideo', { frame: v.frame, action, value });
  b.on('webvideo', (e) => {
    frames.set(e.frame, { ...e, at: Date.now() });
    // An open panel follows it (a seek, the subtitles), unless a step in.
    if (held && held.kind === 'web' && menu.isOpen() && menu.stack.length === 1 && held.e.frame === e.frame) webPanel(menu.index);
  });
  function webPanel(at = 0) {
    const v = webVideo();
    if (!v) return;
    const subs = [{ id: -1, label: 'Av' }, ...v.subs];
    const current = subs.find((t) => t.selected) || subs[0];
    const items = [
      { label: 'Fortsätt', icon: 'play', primary: true, run: pick(() => {}) },
      { label: 'Spola', icon: 'arrowRight', detail: `◀ ▶ · ${where(v)}`, keep: true, run: () => {},
        step: (dir, heldDown) => {
          const by = dir * (heldDown ? 30 : 10);
          tell(v, 'seek', by);
          v.time = Math.max(0, Math.min(v.live ? v.end : v.duration || 0, v.time + by));   // at once; the page says where it got to
          webPanel(menu.index);
        } },
    ];
    if (!v.live) items.push({ label: 'Från början', icon: 'reload', run: pick(() => tell(v, 'to', 0)) });
    if (v.subs.length) {
      items.push({ label: 'Undertexter', icon: 'info', detail: current.label, keep: true, run: () => {
        const next = subs[(subs.indexOf(current) + 1) % subs.length];
        tell(v, 'subs', next.id);
      } });
    }
    items.push({ label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute') });
    items.push({ label: 'Meny', icon: 'menu', detail: 'snabbmenyn', keep: true, run: () => menu.push(M.mainMenu.spec()) });
    items.push({ label: 'Sluta titta', icon: 'back', detail: 'tillbaka', run: pick(() => b.back()) });
    if (held && held.kind === 'web' && menu.isOpen()) {
      // Drawn again in place: the same panel, its row where it was.
      held.e = v;
      menu.stack[0] = { title: v.title || pageTitle() || 'Video', items, at };
      menu.render();
      return;
    }
    panel('web', v, v.title || pageTitle() || 'Video', items, null, at, () => {});
  }

  M.overlay = { host };
})(window.PioneerTV);
