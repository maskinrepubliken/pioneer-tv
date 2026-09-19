// Pioneer TV video watchdog.
//
// The Pi's V4L2 hardware decoder sometimes wedges mid-stream: the page keeps
// buffering, readyState drops to HAVE_CURRENT_DATA and currentTime stops
// advancing, for ever. It is not the network (there are seconds of data
// buffered ahead) and the site's own player never recovers. A tiny seek
// re-primes the decoder; this watchdog does that, escalating if it has to,
// and tells the daemon what it did so it shows up in the log.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const CHECK_MS = 1000;
  const STALL_SECONDS = 4;     // no progress this long, with data buffered ahead
  const NEED_BUFFER = 1.5;     // seconds buffered ahead before we blame the decoder
  const RETRY_SECONDS = 5;     // between escalating attempts
  const state = new WeakMap();

  function bufferedAhead(v) {
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= v.currentTime + 0.25 && v.currentTime <= v.buffered.end(i) + 0.25) {
        return v.buffered.end(i) - v.currentTime;
      }
    }
    return 0;
  }

  function report(text) {
    if (M.bridge) M.bridge.daemon({ type: 'debug', text: 'video: ' + text });
    console.log('[pioneer-tv] video:', text);
  }

  // Each step is a stronger way of asking the decoder to start again.
  function recover(v, s) {
    const at = v.currentTime.toFixed(1);
    s.tries += 1;
    try {
      if (s.tries === 1) {
        v.currentTime = v.currentTime + 0.04;          // re-prime in place
      } else if (s.tries === 2) {
        v.pause(); v.play().catch(() => {});
      } else if (s.tries === 3) {
        v.currentTime = v.currentTime + 0.5;           // skip the frame it choked on
      } else {
        v.currentTime = v.currentTime + 2;
      }
    } catch (e) {
      report(`recovery ${s.tries} threw ${e.message}`);
      return;
    }
    report(`stalled at ${at}s with ${bufferedAhead(v).toFixed(0)}s buffered, recovery ${s.tries}`);
    if (s.tries === 3 && M.hud) M.hud.toast('Videon hakade upp sig, försöker igen', 'reload');
  }

  function check() {
    for (const v of document.querySelectorAll('video')) {
      if (v.paused || v.ended || v.readyState === 0 || v.seeking) { state.delete(v); continue; }
      let s = state.get(v);
      if (!s || s.t !== v.currentTime) {
        // Progress (or a new element): forget everything we knew.
        state.set(v, { t: v.currentTime, since: Date.now(), tries: 0, last: 0 });
        continue;
      }
      const stalledFor = (Date.now() - s.since) / 1000;
      const sinceLast = (Date.now() - (s.last || 0)) / 1000;
      if (stalledFor < STALL_SECONDS || sinceLast < RETRY_SECONDS) continue;
      if (bufferedAhead(v) < NEED_BUFFER) continue;    // genuinely waiting for the network
      s.last = Date.now();
      recover(v, s);
    }
  }

  M.video = {
    init() {
      setInterval(check, CHECK_MS);
    },
  };
})(window.PioneerTV);
