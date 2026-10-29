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
  // Y: the keyboard. The menus and the toasts are the
  // overlay's (overlay/), never the page's: Home goes there.
  b.on('keyboard', () => M.keyboard.toggle());
  b.on('escape', () => {
    if (M.keyboard.isOpen()) M.keyboard.close();
  });
  // The pad's colours (hud.js).
  M.hud.listen(b);
  b.on('tv', (e) => {
    if (e.power === 'standby') document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch {} });
  });
  b.on('keyboard_present', (e) => { b.state.physicalKeyboard = !!e.present; });

  b.on('state', (s) => document.documentElement.classList.toggle('pioneertv-tv', !!s.tvMode));
  // Which page is on screen, said once the daemon is there (the extension
  // says it at every load, but not to a daemon that was not up yet): at
  // home, being left alone turns the TV off (idle.py).
  let told = false;
  b.on('state', (s) => {
    if (s.daemonConnected && !told) b.daemon({ type: 'loaded', url: location.href });
    told = s.daemonConnected;
  });

  // The overlay's menu pauses what plays here, and carries it on when
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
})(window.PioneerTV);
