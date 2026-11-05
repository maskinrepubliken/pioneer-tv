// Pioneer TV: a small sound as the focus moves, instead of any motion. The
// same soft tone each time, a little higher going up, a little lower going
// down, about in between going left and right; drawn here with Web Audio,
// no file. Played by the spatial navigation (spatial-nav.js), the overlay's
// menus (hud.js), the on-screen keyboard (keyboard.js) and the settings
// page's own d-pad (settings.js). Off under Inställningar → Allmänt
// (ui.nav_sound).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  if (M.sound) return;
  // The tones: A5 to the right, a step under it to the left, a third over
  // it going up, a third under it going down.
  const NOTES = { up: 1108.73, right: 880.0, left: 830.61, down: 698.46 };
  const LOUD = 0.07;             // under what plays: a tick, not a beep
  const QUIET_AFTER_MS = 8000;   // the sound card let go when nothing moves
  let ctx = null;
  let sleep = 0;

  function play(dir) {
    if (!sound.enabled()) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + 0.005;
      const f = NOTES[dir] || NOTES.right;
      // A soft pluck: a sine and, quieter, its octave, up at once and gone in
      // a tenth of a second.
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(LOUD, t + 0.004);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      out.connect(ctx.destination);
      for (const [mult, level] of [[1, 1], [2, 0.18]]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * mult, t);
        g.gain.value = level;
        osc.connect(g);
        g.connect(out);
        osc.start(t);
        osc.stop(t + 0.12);
      }
      clearTimeout(sleep);
      sleep = setTimeout(() => { if (ctx && ctx.state === 'running') ctx.suspend(); }, QUIET_AFTER_MS);
    } catch { /* no sound to be had: nothing */ }
  }

  const sound = {
    off: false,                  // the settings page says it (it has no bridge)
    enabled() {
      if (this.off) return false;
      const ui = M.bridge && M.bridge.state && M.bridge.state.config && M.bridge.state.config.ui;
      return !ui || ui.nav_sound !== false;
    },
    // dir: 'up', 'down', 'left' or 'right' (an arrow key's name will do).
    tick(dir) { play(String(dir || '').replace(/^Arrow/, '').toLowerCase()); },
  };
  M.sound = sound;
})(window.PioneerTV);
