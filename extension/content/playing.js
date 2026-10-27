// Pioneer TV: tells the top frame whether a video or audio plays in this
// frame (a site's player is often in an iframe), so the box never goes
// home from under it (main.js passes it on to the daemon, idle.py). Every frame
// but the top one, which looks for itself.
(function () {
  if (window.top === window) return;
  const playing = () => [...document.querySelectorAll('video, audio')].some((m) => !m.paused && !m.ended && m.readyState > 2);
  let said = false;
  function tell() {
    const now = playing();
    if (now || said) {
      try { window.top.postMessage({ pioneertvPlaying: now }, '*'); } catch {}
    }
    said = now;
  }
  setInterval(tell, 20000);
  for (const ev of ['playing', 'pause', 'ended']) document.addEventListener(ev, () => setTimeout(tell, 200), true);
})();
