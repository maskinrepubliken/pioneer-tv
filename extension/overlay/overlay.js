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
  b.on('menu:open', () => { host({ keyboard: true }); b.daemon({ type: 'overlay_menu', open: true }); });
  b.on('menu:close', () => { host({ keyboard: false }); b.daemon({ type: 'overlay_menu', open: false }); });

  b.on('toast', (e) => M.hud.toast(e.text, e.icon || ''));
  b.on('gamepad', (e) => M.hud.toast(`${e.label || 'Handkontroll'} ${e.connected ? 'ansluten' : 'frånkopplad'}`, 'gamepad'));
  b.on('keyboard_present', (e) => M.hud.toast(e.present ? 'Tangentbord anslutet' : 'Tangentbord frånkopplat', 'keyboard'));
  b.on('volume', (e) => {
    const ui = (b.state.config && b.state.config.ui) || {};
    if (!ui.volume_toast) return;
    M.hud.toast(e.direction === 'up' ? 'Volym +' : e.direction === 'down' ? 'Volym −' : 'Ljud av', e.direction === 'mute' ? 'mute' : 'volume');
  });
  b.on('active_pad', (e) => M.hud.applyPad(e.pad));

  M.overlay = { host };
})(window.PioneerTV);
