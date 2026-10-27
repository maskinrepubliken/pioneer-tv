// Pioneer TV overlay page: the quick menu and the toasts, over every window.
//
// Loaded by system/overlay.py, a WebKit view on labwc's top layer, from the
// daemon (/ext/overlay/). It talks to the daemon over the WebSocket like the
// Spel pages; the daemon sends it Home, Y and B while its menu is the one
// that should have them, and every toast (daemon/pioneertv/overlay.py). The
// window takes the keyboard only while the menu is open, so the pad drives
// the page below the rest of the time; what the menu cannot do here (home,
// back, the keyboard, reload) it asks the page to do (bridge.relay).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;
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
  const held = new Set();
  let letGo = null;
  window.addEventListener('keydown', (e) => held.add(e.code), true);
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (!held.size && letGo) letGo();
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
    if (!s.daemonConnected && M.hud.menu.isOpen()) M.hud.menu.close();
  });

  b.on('menu', () => M.hud.menu.toggle());
  b.on('keyboard', () => M.hud.menu.close());     // Y closes the menu, as on the pages
  b.on('escape', () => M.hud.menu.close());
  function releaseKeyboard() {
    const done = () => { clearTimeout(timer); letGo = null; if (!M.hud.menu.isOpen()) host({ keyboard: false }); };
    const timer = setTimeout(() => { held.clear(); done(); }, 1500);   // a key up that never came
    letGo = done;
    if (!held.size) done();
  }

  b.on('menu:open', () => { letGo = null; host({ keyboard: true }); b.daemon({ type: 'overlay_menu', open: true }); });
  b.on('menu:close', () => { releaseKeyboard(); b.daemon({ type: 'overlay_menu', open: false }); });

  b.on('toast', (e) => M.hud.toast(e.text, e.icon || ''));
  b.on('gamepad', (e) => M.hud.toast(`${e.label || 'Handkontroll'} ${e.connected ? 'ansluten' : 'frånkopplad'}`, 'gamepad'));
  b.on('keyboard_present', (e) => M.hud.toast(e.present ? 'Tangentbord anslutet' : 'Tangentbord frånkopplat', 'keyboard'));
  b.on('volume', (e) => {
    const ui = (b.state.config && b.state.config.ui) || {};
    if (!ui.volume_toast) return;
    M.hud.toast(e.direction === 'up' ? 'Volym +' : e.direction === 'down' ? 'Volym −' : 'Ljud av', e.direction === 'mute' ? 'mute' : 'volume');
  });
  b.on('active_pad', (e) => M.hud.applyPad(e.pad));

  // ------------------------------------------------------------ a game, held
  // Home in a game: the daemon pauses RetroArch where it is (games.py,
  // "held") and this panel opens over the paused game. Every choice is
  // RetroArch's own command, so carrying on is instant. B or Home carries
  // on; holding B quits, as Avsluta does.
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  async function games(path, body) {
    try {
      const r = await fetch(`/api/games${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch {
      return { ok: false, message: 'Boxen svarar inte' };
    }
  }
  let paused = null;              // the game the panel is for, while it is open
  let chose = false;             // a choice closed the panel, not B
  function gamePanel(e, at = 0) {
    paused = e;
    chose = false;
    const pick = (f) => () => { chose = true; f(); };
    const note = document.createElement('div');
    note.className = 'pioneertv-menu-note';
    (e.players || []).forEach((name, i) => {
      const p = document.createElement('p');
      p.textContent = `Spelare ${i + 1} · ${name}`;
      note.appendChild(p);
    });
    const items = [
      { label: 'Fortsätt spela', icon: 'play', primary: true, run: pick(() => games('/resume', { load: 'auto' })) },
      { label: 'Spara läge', icon: 'check', keep: true, run: async () => {
        const r = await games('/save_point');
        M.hud.toast(r.ok === false ? (r.message || 'Det gick inte att spara') : 'Läget är sparat', r.ok === false ? 'info' : 'check');
        if (r.ok !== false && paused) gamePanel({ ...paused, point: Date.now() / 1000 }, 1);   // Ladda läge has a time now
      } },
      { label: 'Ladda läge', icon: 'back', detail: e.point ? hhmm(e.point) : 'inget sparat', disabled: !e.point,
        run: pick(() => games('/resume', { load: 'point' })) },
      { label: 'Starta om', icon: 'reload', run: pick(() => games('/resume', { load: 'none' })) },
      { label: 'TV-volym', icon: 'volume', detail: '◀ ▶ · även L2/R2', volume: true, keep: true, run: () => b.cec('mute') },
      { label: 'Avsluta', icon: 'power', run: pick(() => games('/quit')) },
    ];
    M.hud.menu.open({ title: e.title || 'Pausat', note, items });
    M.hud.menu.index = at;
    M.hud.menu.highlight();
  }
  b.on('games', (e) => {
    if (e.state === 'held') gamePanel(e);
    else if (paused && M.hud.menu.isOpen()) { chose = true; paused = null; M.hud.menu.close(); }
    else paused = null;
  });
  // B closes the panel: the game carries on. (A choice's own run follows
  // the close in the same turn, so it is checked a moment later.)
  b.on('menu:close', () => {
    if (!paused) return;
    queueMicrotask(() => {
      if (!chose && paused && !M.hud.menu.isOpen()) games('/resume', { load: 'auto' });
      if (!M.hud.menu.isOpen()) paused = null;
    });
  });

  M.overlay = { host };
})(window.PioneerTV);
