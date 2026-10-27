// Pioneer TV content entry point: wires bridge events to the overlays.
(function (M) {
  // Main frame only, except a page the catalogue of views (dev/katalog.js)
  // shows in a frame of its own, marked ?katalog.
  if (window.top !== window && !new URLSearchParams(location.search).has('katalog')) return;
  if (M._started) return;
  M._started = true;

  M.bridge.init();
  M.nav.init();
  M.cursor.init();
  M.video.init();
  M.bigscreen.init();
  M.game.init();

  const b = M.bridge;
  // Y: the keyboard, except that with the quick menu open it closes the menu
  // (the menu is what Y's long press opened, so Y is the way out of it too).
  b.on('keyboard', () => (M.hud.menu.isOpen() ? M.hud.menu.close() : M.keyboard.toggle()));
  // A page with its own menu (M.pageMenu) takes Guide.
  b.on('menu', () => (M.pageMenu ? M.pageMenu.toggle() : M.hud.menu.toggle()));
  b.on('logs', () => M.logs.toggle());
  b.on('escape', () => {
    if (M.hud.menu.isOpen()) M.hud.menu.close();
    else if (M.logs.isOpen()) M.logs.close();
    else if (M.keyboard.isOpen()) M.keyboard.close();
  });
  // Our own volume note is off by default: the TV draws its own volume bar.
  // Settings → TV → "Visa en notis vid volymändring" turns it back on.
  // With the overlay up (labwc) it shows the toasts over everything; the
  // page keeps only its own (overlay.py in the daemon).
  const overlay = () => !!(b.state.config && b.state.config.overlay);
  b.on('volume', (e) => {
    const ui = (b.state.config && b.state.config.ui) || {};
    if (!ui.volume_toast || overlay()) return;
    M.hud.toast(e.direction === 'up' ? 'Volym +' : e.direction === 'down' ? 'Volym −' : 'Ljud av', e.direction === 'mute' ? 'mute' : 'volume');
  });
  b.on('gamepad', (e) => overlay() || M.hud.toast(`${e.label || 'Handkontroll'} ${e.connected ? 'ansluten' : 'frånkopplad'}`, 'gamepad'));
  // Every page starts in the design system's own colours (ochre); the pad's
  // colours come with its first press there.
  b.on('active_pad', (e) => M.hud.applyPad(e.pad));
  b.on('tv', (e) => {
    if (e.power === 'standby') document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch {} });
  });
  b.on('status', () => {
    const s = b.state;
    M.hud.toast(`${s.daemonConnected ? 'Daemon ansluten' : 'Ingen daemon'} · ${location.hostname || 'launcher'}`, 'info');
  });
  b.on('toast', (e) => M.hud.toast(e.text, e.icon || ''));
  b.on('keyboard_present', (e) => {
    b.state.physicalKeyboard = !!e.present;
    if (!overlay()) M.hud.toast(e.present ? 'Tangentbord anslutet' : 'Tangentbord frånkopplat', 'keyboard');
  });

  b.on('state', (s) => document.documentElement.classList.toggle('pioneertv-tv', !!s.tvMode));

  // A menu of the page's own (the quick menu without the overlay, the start
  // page's Live list) keeps Home, Y and B
  // while it is open: the daemon is told, and sends them here.
  b.on('menu:open', () => b.daemon({ type: 'page_menu', open: true }));
  b.on('menu:close', () => b.daemon({ type: 'page_menu', open: false }));
  window.addEventListener('pagehide', () => { if (M.hud.menu.isOpen() || (M.pageMenu && M.pageMenu.isOpen())) b.daemon({ type: 'page_menu', open: false }); });

  // The overlay's quick menu pauses what plays here, and carries it on when
  // it closes: only what it paused, so a video paused before stays paused.
  let held = [];
  b.on('media', (e) => {
    if (e.action === 'pause') {
      held = [...document.querySelectorAll('video, audio')].filter((m) => !m.paused && !m.ended);
      held.forEach((m) => { try { m.pause(); } catch {} });
    } else {
      held.forEach((m) => { if (m.isConnected) m.play().catch(() => {}); });
      held = [];
    }
  });

  // The screensaver (idle.py decides): drawn here only without the overlay.
  b.on('saver', (e) => (e.show ? M.hud.saver.show() : M.hud.saver.hide()));

  // What the daemon cannot see for itself: whether something plays here (a
  // video or audio element in this page or any of its frames, or a game in
  // the page), and a real keyboard or mouse in use. Playing is said every
  // 30 s while it lasts, and once when it stops; input at most every 10 s.
  const framesPlaying = new Map();           // frame -> when it last said it plays
  window.addEventListener('message', (e) => {
    if (e.data && e.data.pioneertvPlaying !== undefined && e.source) {
      if (e.data.pioneertvPlaying) framesPlaying.set(e.source, Date.now());
      else framesPlaying.delete(e.source);
      tellPlaying();
    }
  });
  const playingHere = () => [...document.querySelectorAll('video, audio')].some((m) => !m.paused && !m.ended && m.readyState > 2)
    || (b.gameMode && b.gameMode())
    || [...framesPlaying.values()].some((t) => Date.now() - t < 45000);
  let saidPlaying = false;
  let saidAt = 0;
  function tellPlaying() {
    const now = playingHere();
    if (now && (!saidPlaying || Date.now() - saidAt > 30000)) { b.daemon({ type: 'activity', playing: true }); saidAt = Date.now(); }
    else if (!now && saidPlaying) b.daemon({ type: 'activity', playing: false });
    saidPlaying = now;
  }
  setInterval(tellPlaying, 10000);
  for (const ev of ['playing', 'pause', 'ended']) document.addEventListener(ev, () => setTimeout(tellPlaying, 200), true);
  let inputAt = 0;
  const tellInput = (e) => {
    if (!e.isTrusted || Date.now() - inputAt < 10000) return;
    if (e.type === 'mousemove' && !e.movementX && !e.movementY) return;
    inputAt = Date.now();
    b.daemon({ type: 'activity', input: true });
  };
  window.addEventListener('keydown', tellInput, true);
  window.addEventListener('mousemove', tellInput, { capture: true, passive: true });

  // Escape closes overlays before it reaches the page.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (M.hud.menu.isOpen() || M.keyboard.isOpen()) return; // captured layers handle it
  }, true);
})(window.PioneerTV);
