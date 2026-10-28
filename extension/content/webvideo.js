// Pioneer TV: a site's video under our own controls (SVT Play, Cineasterna,
// any page with a video), whatever player the site draws around it.
//
// Runs in every frame, since a site's player may sit in a frame of its own
// (a film service's). Each frame finds its main video (the largest one on
// screen) and says how it is to the daemon (webvideo: where it is, how long,
// paused, its subtitles), which the overlay hears: Home then opens its panel
// for that video (overlay/overlay.js) instead of the quick menu, and what is
// chosen there comes back here (a webvideo event, to the frame it is for).
// In fullscreen, left and right seek and A (or X) pauses, without the panel,
// and our own bar says where it is (the site's own controls hidden where we
// know them: SVT Play's blinked at every press). The overlay's menu pausing
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
  const clock = (s) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
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
    if (!on) bar.hide();
    return on ? v : null;
  }
  document.addEventListener('fullscreenchange', () => setTimeout(ownPlayer, 50));
  setInterval(ownPlayer, 1000);

  // ------------------------------------------------------------ our bar
  // Over the video at its foot, a card on ink: playing or paused, the name,
  // how far in on a line of ochre, the time, and what the pad does. It
  // comes on a press and goes after a few seconds; paused, it stays. It is a
  // popover in its own shadow, so it is drawn over the fullscreen video and
  // the site's styles never reach it (this frame may be a film service's,
  // without the rest of ours).
  const ICON = {
    play: '<path d="M8 6v12l10-6z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="7" y="6" width="3.6" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="13.4" y="6" width="3.6" height="12" rx="1" fill="currentColor" stroke="none"/>',
  };
  const BAR_CSS = `
    :host { all: initial; }
    .bar { box-sizing: border-box; width: 100%; padding: 22px 30px 18px; border-radius: 28px;
      background: #1c1613; color: #f4efe4; border: 1px solid #77716b;
      font-family: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; }
    .top { display: flex; align-items: center; gap: 18px; }
    .icon { width: 40px; height: 40px; flex: none; display: inline-flex; align-items: center; justify-content: center;
      border-radius: 50%; background: #f5cf5a; color: #1c1613; }
    .icon svg { width: 24px; height: 24px; }
    .name { flex: 1; min-width: 0; font: italic 400 26px/1.25 Fraunces, Georgia, serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 0.12em; }
    .time { flex: none; font: 400 22px/1 "IBM Plex Mono", "Courier New", monospace; color: #f4efe4; }
    .track { position: relative; height: 8px; margin: 18px 0 14px; border-radius: 4px; background: #3f3934; overflow: hidden; }
    .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: #f5cf5a; transition: width 300ms cubic-bezier(0.22, 0.8, 0.3, 1); }
    .hint { font: 400 16px/1 "IBM Plex Mono", "Courier New", monospace; letter-spacing: 0.06em; color: #c9c4ba; }
    .arrive { animation: plop 480ms linear(0, 0.071, 0.229, 0.415, 0.593, 0.742, 0.858, 0.939, 0.992, 1.022, 1.035, 1.038, 1.035, 1.029, 1.021, 1.015, 1.009, 1.005, 1.002, 1, 0.999, 1) backwards; transform-origin: 50% 100%; }
    .squish { animation: squish 380ms ease-out; }
    @keyframes plop { from { opacity: 0; translate: 0 18px; scale: 0.94 0.88; } 60% { opacity: 1; } to { opacity: 1; translate: 0 0; scale: 1 1; } }
    @keyframes squish { 0% { scale: 1 1; } 30% { scale: 0.88 0.85; } 65% { scale: 1.06 1.08; } 100% { scale: 1 1; } }
    @media (prefers-reduced-motion: reduce) { .arrive, .squish, .fill { animation: none; transition: none; } }`;
  const bar = (() => {
    let host = null, root = null, els = null, hideTimer = 0, tick = 0, shownOver = null;
    function build() {
      host = document.createElement('div');
      host.setAttribute('popover', 'manual');
      host.setAttribute('data-pioneertv-overlay', '');
      host.style.cssText = 'position: fixed; inset: auto 48px 40px 48px; width: auto; height: auto; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; z-index: 2147483000;';
      root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>${BAR_CSS}</style><div class="bar"><div class="top"><span class="icon"><svg viewBox="0 0 24 24"></svg></span>`
        + '<span class="name"></span><span class="time"></span></div><div class="track"><span class="fill"></span></div>'
        + '<div class="hint">◀ ▶ SPOLA · A PAUS · HEM MENY</div></div>';
      els = { bar: root.querySelector('.bar'), icon: root.querySelector('.icon'), svg: root.querySelector('svg'), name: root.querySelector('.name'),
        time: root.querySelector('.time'), fill: root.querySelector('.fill') };
      (document.body || document.documentElement).appendChild(host);
    }
    const open = () => !!host && host.matches(':popover-open');
    function draw() {
      const v = main();
      if (!v || !els) return;
      const [start, end] = bounds(v);
      const span = Math.max(1, end - start);
      els.svg.innerHTML = v.paused ? ICON.play : ICON.pause;
      els.name.textContent = title() || document.title || '';
      els.fill.style.width = `${Math.max(0, Math.min(100, ((v.currentTime - start) / span) * 100))}%`;
      els.time.textContent = live(v)
        ? (end - v.currentTime > 15 ? `Direkt −${clock(end - v.currentTime)}` : 'Direkt')
        : `${clock(v.currentTime)} / ${clock(v.duration)}`;
    }
    function show(squish) {
      const v = main();
      if (!v) return;
      if (!host) build();
      // A popover opened before the video went fullscreen lies under it: open it again.
      const over = document.fullscreenElement || null;
      if (open() && shownOver !== over) host.hidePopover();
      if (!open()) {
        try { host.showPopover(); } catch { return; }
        shownOver = over;
        els.bar.classList.remove('arrive'); void els.bar.offsetWidth; els.bar.classList.add('arrive');
      } else if (squish) {
        els.icon.classList.remove('squish'); void els.icon.offsetWidth; els.icon.classList.add('squish');
      }
      draw();
      clearInterval(tick);
      tick = setInterval(draw, 500);
      clearTimeout(hideTimer);
      // Paused it stays; playing, it goes after a while.
      const later = () => { hideTimer = setTimeout(() => { const m = main(); if (m && m.paused) later(); else hide(); }, 3500); };
      later();
    }
    function hide() {
      clearTimeout(hideTimer);
      clearInterval(tick);
      if (open()) host.hidePopover();
    }
    return { show, hide };
  })();
  // Paused or played from elsewhere (the overlay's menu, the site): the bar says so.
  for (const ev of ['play', 'pause']) document.addEventListener(ev, (e) => { if (e.target === main() && ownPlayer()) bar.show(true); }, true);

  // Left and right seek, A or X pauses or plays, up and down show the bar,
  // while the video fills the screen; true when the key was taken. The
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
      bar.show(true);
      return true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      seek(v, (e.key === 'ArrowLeft' ? -1 : 1) * (e.repeat ? LONG_STEP : STEP));
      report(true);
    }
    bar.show(false);
    return true;
  }
  if (!M.nav) {
    window.addEventListener('keydown', (e) => {
      if (e.isTrusted && key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }

  M.webvideo = { key, main };
})(window.PioneerTV);
