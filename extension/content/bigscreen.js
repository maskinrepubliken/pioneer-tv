// Pioneer TV big screen.
//
// A service marked `fullscreen` (SVT1's live channel) should fill the TV, not
// sit in the middle of a web page. The Fullscreen API needs a real key press,
// which a page cannot fake: so we ask the daemon to tap one on the virtual
// keyboard, and take fullscreen inside that trusted event. If the browser
// still refuses, the player is promoted with CSS instead, which looks the
// same even though the page keeps its layout underneath.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const WAKE_KEY = 'F8';            // harmless, and no page listens for it
  const POLL_MS = 1000;
  const GIVE_UP_AFTER = 45000;      // stop looking for a player after this
  const PLAYER_SELECTOR = '.svt-videoplayer, [class*="videoplayer"], [class*="video-player"], [data-testid*="player"], [class*="player"]';

  let started = 0;
  let done = false;
  let waiting = false;

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

  // The CSS way out: the player is pinned over everything, the rest is hidden.
  function promote(el) {
    document.documentElement.classList.add('pioneertv-bigscreen');
    el.classList.add('pioneertv-bigscreen-target');
    M.bridge.daemon({ type: 'debug', text: 'bigscreen: promoted ' + (el.className || el.tagName) });
  }

  async function goBig(video) {
    const el = container(video);
    if (document.fullscreenElement) { done = true; return; }
    // First try: a tapped key gives us the user activation fullscreen needs.
    if (!waiting && M.bridge.available) {
      waiting = true;
      const onKey = async (e) => {
        if (e.key !== WAKE_KEY) return;
        window.removeEventListener('keydown', onKey, true);
        e.preventDefault(); e.stopImmediatePropagation();
        try {
          await el.requestFullscreen();
          done = true;
          M.bridge.daemon({ type: 'debug', text: 'bigscreen: fullscreen granted' });
        } catch (err) {
          M.bridge.daemon({ type: 'debug', text: 'bigscreen: fullscreen refused (' + err.message.slice(0, 40) + '), promoting' });
          promote(el);
          done = true;
        }
      };
      window.addEventListener('keydown', onKey, true);
      M.bridge.daemon({ type: 'key', key: 'KEY_' + WAKE_KEY });
      setTimeout(() => {
        window.removeEventListener('keydown', onKey, true);
        waiting = false;
        if (!done) { promote(el); done = true; }   // no key came back
      }, 2500);
      return;
    }
    if (!M.bridge.available) { promote(el); done = true; }
  }

  function tick() {
    if (done) return;
    if (!started) started = Date.now();
    if (Date.now() - started > GIVE_UP_AFTER) { done = true; return; }
    const video = [...document.querySelectorAll('video')].find((v) => v.readyState >= 2 && !v.paused);
    if (video) goBig(video);
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
    started = Date.now();
    const timer = setInterval(() => { tick(); if (done) clearInterval(timer); }, POLL_MS);
    tick();
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {           // left fullscreen: do not fight it
        done = true;
        document.documentElement.classList.remove('pioneertv-bigscreen');
      }
    });
  }
})(window.PioneerTV);
