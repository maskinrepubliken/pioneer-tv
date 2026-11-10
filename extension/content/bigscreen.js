// Pioneer TV big screen.
//
// A service marked `fullscreen` (SVT1's live channel) should fill the TV, not
// sit in the middle of a web page. The kiosk window already fills the
// screen, so the player is pinned over the page with CSS: the browser's own
// fullscreen would put up its "Tryck på Esc" bubble each time it began (and
// SVT1's live player throws itself away and takes it again every minute or
// so). A player that replaces itself is pinned again.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const POLL_MS = 1000;
  const GIVE_UP_AFTER = 45000;      // stop looking for a player after this
  const PLAYER_SELECTOR = '.svt-videoplayer, [class*="videoplayer"], [class*="video-player"], [data-testid*="player"], [class*="player"]';

  function wanted() {
    const services = (M.bridge.state.config && M.bridge.state.config.services) || [];
    const truthy = (v) => v !== undefined && v !== null && v !== false && v !== '' && v !== '0' && v !== 'false' && v !== 'nej';
    return services.some((s) => {
      if (!truthy(s.fullscreen)) return false;
      try {
        const u = new URL(s.url, location.href);
        return u.hostname === location.hostname && location.pathname.startsWith(u.pathname);
      } catch { return false; }
    });
  }

  function container(video) {
    const c = video.closest(PLAYER_SELECTOR);
    if (c && c.clientHeight >= video.clientHeight * 0.9) return c;
    return video.parentElement || video;
  }

  // The player pinned over everything, the rest hidden.
  function promote(el) {
    document.documentElement.classList.add('pioneertv-bigscreen');
    el.classList.add('pioneertv-bigscreen-target');
    M.bridge.daemon({ type: 'debug', text: 'bigscreen: promoted ' + (el.className || el.tagName) });
  }

  let started = 0;
  let target = null;
  function goBig(video) {
    const el = container(video);
    if (target === el && el.isConnected) return;
    if (target) target.classList.remove('pioneertv-bigscreen-target');
    target = el;
    promote(el);
  }

  // Until a player plays, then on: the one pinned may be thrown away.
  function tick() {
    if (!target && Date.now() - started > GIVE_UP_AFTER) return;
    const video = [...document.querySelectorAll('video')].find((v) => v.readyState >= 2 && !v.paused);
    if (video && !(target && target.isConnected && target.contains(video))) goBig(video);
  }

  M.bigscreen = {
    init() {
      if (!wanted()) {
        // The config may arrive after the page does.
        M.bridge.on('state', () => { if (!started && wanted()) start(); });
        return;
      }
      start();
    },
  };

  function start() {
    if (started) return;
    started = Date.now();
    setInterval(tick, POLL_MS);
    tick();
  }
})(window.PioneerTV);
