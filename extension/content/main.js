// Pioneer TV content entry point: wires bridge events to the overlays.
(function (M) {
  if (window.top !== window) return; // main frame only
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
  // A page with its own menu (the game player's pause panel) takes Guide.
  b.on('menu', () => (M.pageMenu ? M.pageMenu.toggle() : M.hud.menu.toggle()));
  b.on('logs', () => M.logs.toggle());
  b.on('escape', () => {
    if (M.hud.menu.isOpen()) M.hud.menu.close();
    else if (M.logs.isOpen()) M.logs.close();
    else if (M.keyboard.isOpen()) M.keyboard.close();
  });
  // Our own volume note is off by default: the TV draws its own volume bar.
  // Settings → TV → "Visa en notis vid volymändring" turns it back on.
  b.on('volume', (e) => {
    const ui = (b.state.config && b.state.config.ui) || {};
    if (!ui.volume_toast) return;
    M.hud.toast(e.direction === 'up' ? 'Volym +' : e.direction === 'down' ? 'Volym −' : 'Ljud av', e.direction === 'mute' ? 'mute' : 'volume');
  });
  b.on('gamepad', (e) => M.hud.toast(`${e.label || 'Handkontroll'} ${e.connected ? 'ansluten' : 'frånkopplad'}`, 'gamepad'));
  // The pad in use lends the pointer its colour and the focus ring its
  // accent (the pink and the green 8BitDo; [pads] in the config). A pad
  // without colours leaves the design system's own.
  function applyPad(pad) {
    const root = document.documentElement;
    if (!root) return;
    const set = (name, value) => (value ? root.style.setProperty(name, value) : root.style.removeProperty(name));
    set('--pioneertv-pointer-fill', pad && pad.pointer);
    set('--pioneertv-focus', pad && pad.accent);
  }
  b.on('active_pad', (e) => applyPad(e.pad));
  b.on('state', (s) => { if (s.status && 'active_pad' in s.status) applyPad(s.status.active_pad); });
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
    M.hud.toast(e.present ? 'Tangentbord anslutet' : 'Tangentbord frånkopplat', 'keyboard');
  });

  b.on('state', (s) => document.documentElement.classList.toggle('pioneertv-tv', !!s.tvMode));

  // Escape closes overlays before it reaches the page.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (M.hud.menu.isOpen() || M.keyboard.isOpen()) return; // captured layers handle it
  }, true);
})(window.PioneerTV);
