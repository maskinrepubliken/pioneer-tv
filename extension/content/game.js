// Pioneer TV game mode.
//
// While a browser game has the screen (RomM's EmulatorJS player, or any page
// with a big canvas in fullscreen), the pad must reach the page as a real
// gamepad. The daemon stops translating it into key presses and pointer
// motion while we send a heartbeat; Guide, and holding Start or Select, still
// reach the shell. Our own overlays pause game mode while they are open so the
// d-pad can drive them.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const HEARTBEAT_MS = 4000;
  let inGame = false;
  let lastSent = null;
  let timer = null;

  function detect() {
    if (/\/ejs(\/|$)/.test(location.pathname)) return true;                  // RomM player route
    if (document.querySelector('#game .ejs_game, .ejs_canvas, canvas.ejs_canvas, #ejs-canvas')) return true;
    const canvas = document.querySelector('canvas');
    if (canvas && document.fullscreenElement) {
      const r = canvas.getBoundingClientRect();
      if (r.width * r.height > window.innerWidth * window.innerHeight * 0.5) return true;
    }
    return false;
  }

  function overlayOpen() {
    return (M.keyboard && M.keyboard.isOpen()) || (M.hud && M.hud.menu.isOpen()) || (M.logs && M.logs.isOpen());
  }

  function send(force) {
    const on = inGame && !overlayOpen();
    if (!force && on === lastSent && on === false) return; // nothing to keep alive
    lastSent = on;
    M.bridge.daemon({ type: 'gamemode', on });
  }

  function tick() {
    const now = detect();
    if (now !== inGame) {
      inGame = now;
      document.documentElement.classList.toggle('pioneertv-game', inGame);
      if (M.nav) M.nav.enabled = !inGame;   // a real keyboard goes to the game too
      send(true);
    } else if (inGame) {
      send(true);                             // heartbeat
    }
  }

  M.game = {
    active() { return inGame; },
    init() {
      const b = M.bridge;
      if (!b || !b.available) return;
      timer = setInterval(tick, HEARTBEAT_MS);
      tick();
      // Overlays pause game mode; resume when they close.
      ['keyboard:open', 'keyboard:close', 'menu:open', 'menu:close', 'logs:open', 'logs:close'].forEach((ev) => b.on(ev, () => send(true)));
      window.addEventListener('pagehide', () => { if (inGame) { inGame = false; b.daemon({ type: 'gamemode', on: false }); } });
      document.addEventListener('fullscreenchange', tick);
    },
  };
})(window.PioneerTV);
