// Pioneer TV: a site's video under our own controls (SVT Play, Cineasterna,
// any page with a video), whatever player the site draws around it.
//
// Runs in every frame, since a site's player may sit in a frame of its own
// (a film service's). Each frame finds its main video (the largest one on
// screen) and says how it is to the daemon (webvideo: where it is, how long,
// paused, its subtitles), which the overlay hears: Home then opens its panel
// for that video (overlay/overlay.js) instead of the quick menu, and what is
// chosen there comes back here (a webvideo event, to the frame it is for).
// In fullscreen, left and right seek and A (or X) pauses, without the panel
// (the site's own controls hidden where we know them: SVT Play's blinked at
// every press); where it is, the panel says. The overlay's menu pausing
// what plays reaches the frames here too (the top frame's own videos are
// main.js's).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  if (M.webvideo) return;
  const TOP = window === window.top;
  const FRAME = Math.random().toString(36).slice(2, 10);
  const STEP = 10;                       // seconds a press of left or right seeks
  const LONG_STEP = 30;                  // held down
  const hasExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  const daemon = (payload) => { if (hasExt) chrome.runtime.sendMessage({ type: 'daemon', payload }).catch(() => {}); };

  // ------------------------------------------------------------ the video
  // The largest video on screen that has something to play (a tiny preview
  // or an ad's frame is passed over).
  function main() {
    let best = null, bestArea = 0;
    const view = window.innerWidth * window.innerHeight || 1;
    for (const v of document.querySelectorAll('video')) {
      if (!v.isConnected || (v.readyState === 0 && !v.currentSrc)) continue;
      const r = v.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0))
        * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (area / view < 0.12) continue;
      if (area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }
  const areaOf = (v) => {
    const r = v.getBoundingClientRect();
    return Math.round((r.width * r.height) / ((window.innerWidth * window.innerHeight) || 1) * 100) / 100;
  };

  // How far one can seek: a live stream only within what it keeps.
  function bounds(v) {
    const s = v.seekable;
    if (s && s.length) return [s.start(0), s.end(s.length - 1)];
    return [0, isFinite(v.duration) ? v.duration : v.currentTime];
  }
  const live = (v) => !isFinite(v.duration) || v.duration > 86400;
  const tracks = (v) => [...(v.textTracks || [])].filter((t) => t.kind === 'subtitles' || t.kind === 'captions');

  function title() {
    if (!TOP) return '';
    const og = document.querySelector('meta[property="og:title"]');
    return ((og && og.content) || document.title || '').trim().slice(0, 120);
  }

  function state(v) {
    if (!v || document.visibilityState !== 'visible') return { type: 'webvideo', frame: FRAME, top: TOP, present: false, title: title() };
    const [, end] = bounds(v);
    return {
      type: 'webvideo', frame: FRAME, top: TOP, present: true, title: title(), area: areaOf(v),
      time: v.currentTime, duration: live(v) ? null : v.duration, live: live(v), end, paused: v.paused,
      subs: tracks(v).slice(0, 12).map((t, i) => ({ id: i, label: (t.label || t.language || `Spår ${i + 1}`).slice(0, 40), selected: t.mode === 'showing' })),
    };
  }

  // Said when it changes, and every few seconds while there is a video (the
  // overlay forgets one it has not heard of for a minute).
  let said = '';
  let saidAt = 0;
  function report(force) {
    const s = state(main());
    const key = JSON.stringify({ ...s, time: Math.round(s.time || 0) });
    if (!force && key === said && Date.now() - saidAt < 5000) return;
    if (!s.present && !TOP && !said.includes('"present":true')) return;   // a frame without one: nothing to say
    said = key;
    saidAt = Date.now();
    daemon(s);
  }
  for (const ev of ['play', 'pause', 'seeked', 'loadedmetadata', 'emptied', 'ended']) {
    document.addEventListener(ev, () => report(true), true);
  }
  document.addEventListener('visibilitychange', () => report(true));
  window.addEventListener('pagehide', () => daemon({ type: 'webvideo', frame: FRAME, top: TOP, present: false, title: '' }));
  setInterval(() => report(false), 2000);
  setTimeout(() => report(true), 1500);

  // ------------------------------------------------------------ doing
  function seek(v, by) {
    const [start, end] = bounds(v);
    v.currentTime = Math.max(start, Math.min(end - 0.5, v.currentTime + by));
  }
  function act(e) {
    const v = main();
    if (!v) return;
    // A seek from the panel leaves a paused video paused: a site's player
    // may set it going again once it has got there.
    if (v.paused && (e.action === 'seek' || e.action === 'to')) {
      const still = () => { if (!v.paused) v.pause(); };
      v.addEventListener('playing', still, { once: true });
      setTimeout(() => v.removeEventListener('playing', still), 3000);
    }
    if (e.action === 'toggle') { if (v.paused) v.play().catch(() => {}); else v.pause(); }
    else if (e.action === 'seek' && typeof e.value === 'number') seek(v, e.value);
    else if (e.action === 'to' && typeof e.value === 'number') { const [start] = bounds(v); v.currentTime = Math.max(start, e.value); }
    else if (e.action === 'subs') tracks(v).forEach((t, i) => { t.mode = i === e.value ? 'showing' : 'disabled'; });
    setTimeout(() => report(true), 50);
  }

  // The daemon's events reach every frame of the tab (background.js).
  // Only the frame a choice is for acts on it; the menu's pausing reaches
  // the frames here (the top frame's own videos are main.js's).
  let held = [];
  if (hasExt) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type !== 'event') return;
      if (msg.name === 'webvideo' && msg.frame === FRAME) act(msg);
      else if (msg.name === 'media' && !TOP) {
        if (msg.action === 'pause') {
          held = [...document.querySelectorAll('video, audio')].filter((m) => !m.paused && !m.ended);
          held.forEach((m) => { try { m.pause(); } catch {} });
        } else {
          held.forEach((m) => { if (m.isConnected) m.play().catch(() => {}); });
          held = [];
        }
      }
    });
  }

  // ------------------------------------------------------------ in fullscreen
  function filling(v) {
    const f = document.fullscreenElement;
    return (f && (f === v || f.contains(v))) || document.documentElement.classList.contains('pioneertv-bigscreen');
  }

  // The site's own controls, where we know them, are hidden while its video
  // fills the screen and ours are in charge: SVT Play's came and went at
  // every press. Its subtitles stay (they are its own drawing, not ours).
  const SITE_UI = [
    ['svtplay.se', '[data-rt="desktopUi"], [data-rt="top-bar-container"]'],
  ];
  const siteUi = (SITE_UI.find(([host]) => location.hostname === host || location.hostname.endsWith(`.${host}`)) || [])[1];
  if (siteUi) {
    const style = document.createElement('style');
    style.textContent = `${siteUi.split(',').map((sel) => `html.pioneertv-ownplayer ${sel.trim()}`).join(', ')} { opacity: 0 !important; pointer-events: none !important; transition: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }
  function ownPlayer() {
    const v = main();
    const on = !!(v && filling(v));
    document.documentElement.classList.toggle('pioneertv-ownplayer', on);
    return on ? v : null;
  }
  document.addEventListener('fullscreenchange', () => setTimeout(ownPlayer, 50));
  setInterval(ownPlayer, 1000);

  // Left and right seek, A or X pauses or plays, while the video fills the
  // screen; true when the key was taken (up and down too, so they do not
  // move about the site's hidden controls). The
  // spatial navigation asks here first in the top frame; a frame of its own
  // listens itself.
  function key(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return false;
    if (M.nav && M.nav.captured) return false;
    if (M.cursor && M.cursor.active && M.cursor.active()) return false;
    const v = main();
    if (!v || !filling(v)) return false;
    ownPlayer();
    if (e.key === 'Enter' || e.key === ' ') {
      if (!e.repeat) { if (v.paused) v.play().catch(() => {}); else v.pause(); }
      return true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      seek(v, (e.key === 'ArrowLeft' ? -1 : 1) * (e.repeat ? LONG_STEP : STEP));
      report(true);
    }
    return true;
  }
  if (!M.nav) {
    window.addEventListener('keydown', (e) => {
      if (e.isTrusted && key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  M.webvideo = { key, main };
})(window.PioneerTV);
