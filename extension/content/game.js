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
  const DETECT_MS = 1000;           // how often we look
  const HEARTBEAT_MS = 4000;        // how often the daemon hears from us
  let inGame = false;
  let lastSent = null;
  let lastBeat = 0;
  let timer = null;

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity) > 0;
  }

  // Only a running emulator owns the pad. EmulatorJS paints into its canvas,
  // and that canvas does not exist before the core starts: the player route
  // first shows RomM's own save-file screen and then a loading screen, both
  // ordinary pages you drive with the d-pad. So the canvas decides, never the
  // URL, and a "start game" overlay means it has not started yet.
  function detect() {
    const canvas = document.querySelector('canvas.ejs_canvas, .ejs_parent canvas, .ejs_game canvas, #game canvas');
    if (canvas && visible(canvas) && canvas.clientWidth > 200 && canvas.clientHeight > 150) {
      const start = document.querySelector('.ejs_start_button, [class*="ejs_start"]');
      return !(start && visible(start));
    }
    const other = document.querySelector('canvas');
    if (other && document.fullscreenElement && visible(other)) {
      const r = other.getBoundingClientRect();
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
    lastBeat = Date.now();
    M.bridge.daemon({ type: 'gamemode', on });
  }

  function tick() {
    const now = detect();
    if (now !== inGame) {
      inGame = now;
      document.documentElement.classList.toggle('pioneertv-game', inGame);
      if (M.nav) M.nav.enabled = !inGame;   // a real keyboard goes to the game too
      send(true);
    } else if (inGame && Date.now() - lastBeat >= HEARTBEAT_MS) {
      send(true);                             // heartbeat
    }
  }

  M.game = {
    active() { return inGame; },
    init() {
      const b = M.bridge;
      if (!b || !b.available) return;
      timer = setInterval(tick, DETECT_MS);
      tick();
      // Overlays pause game mode; resume when they close.
      ['keyboard:open', 'keyboard:close', 'menu:open', 'menu:close', 'logs:open', 'logs:close'].forEach((ev) => b.on(ev, () => send(true)));
      window.addEventListener('pagehide', () => { if (inGame) { inGame = false; b.daemon({ type: 'gamemode', on: false }); } });
      document.addEventListener('fullscreenchange', tick);
    },
  };
})(window.PioneerTV);
