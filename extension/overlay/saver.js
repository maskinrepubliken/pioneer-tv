// Pioneer TV screensaver: the Mandelbrot set like an open fire
// (mandelbrot.js) and a line of the Tao Te Ching (tao.js), drawn by the
// overlay over every window. The daemon decides when (idle.py: no pad
// connected and nobody pressing anything, nothing playing) and takes it
// away at the next button, which does nothing else. When it has been up
// long enough the TV goes off and it rests: the fire goes out and a
// full-screen message (launcher/shared/screen.js) says "Vilar", still, so
// nothing is drawn again until the TV is on. Styled by saver.css.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const LINE_MS = 3 * 60 * 1000;        // a new line every three minutes
  let root = null, fractal = null, quote = null, where = null, box = null, rest = null;
  let order = [];
  let lineTimer = null;

  function build() {
    root = document.createElement('div');
    root.className = 'pioneertv-saver';
    root.setAttribute('data-pioneertv-overlay', '');
    const canvas = document.createElement('canvas');
    canvas.className = 'fractal';
    canvas.setAttribute('aria-hidden', 'true');
    box = document.createElement('figure');
    box.className = 'tao';
    quote = document.createElement('blockquote');
    where = document.createElement('figcaption');
    box.append(quote, where);
    root.append(canvas, box);
    rest = M.screen.in(root);
    M.bridge.mount(root);
    fractal = M.mandelbrot(canvas);
  }

  function line() {
    if (!order.length) order = M.tao.map((_, i) => i).sort(() => Math.random() - 0.5);
    const [text, chapter] = M.tao[order.pop()];
    quote.textContent = `”${text}”`;
    where.textContent = `Tao Te Ching · ${chapter}`;
    fit();
  }
  // The largest size at which the line and its chapter fit the screen.
  function fit() {
    let lo = 2, hi = 16;                // vw
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      quote.style.fontSize = `${mid}vw`;
      if (box.scrollHeight <= box.clientHeight && quote.scrollWidth <= quote.clientWidth) lo = mid; else hi = mid;
    }
    quote.style.fontSize = `${lo}vw`;
  }
  function lines(on) {
    clearInterval(lineTimer);
    lineTimer = null;
    if (on) { line(); lineTimer = setInterval(line, LINE_MS); }
  }

  const saver = {
    isOpen() { return !!root && root.isConnected; },
    show() {
      if (this.isOpen()) return;
      if (!root) build(); else { M.bridge.mount(root); fractal.start(); }
      lines(true);
      if (document.fonts) document.fonts.ready.then(() => this.isOpen() && fit());
    },
    hide() {
      if (!this.isOpen()) return;
      this.rest(false);
      fractal.stop();
      lines(false);
      M.bridge.unmount(root);
    },
    // Straight to a point of a zoom (the catalogue of views): 0 the widest.
    jump(part) { if (fractal) fractal.jump(part); },
    // The TV off: nothing moves, nothing is drawn but "Vilar".
    rest(on) {
      if (!root || root.classList.contains('resting') === on) return;
      root.classList.toggle('resting', on);
      if (on) { fractal.stop(); lines(false); rest.show('Vilar', 'Tryck en knapp för att väcka TV:n'); }
      else { rest.hide(); if (this.isOpen()) { fractal.start(); lines(true); } }
    },
  };

  M.saver = saver;
})(window.PioneerTV);
