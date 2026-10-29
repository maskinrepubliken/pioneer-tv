// Pioneer TV screensaver, drawn by the overlay over every window, one of
// two (Inställningar → TV, ui.screensaver):
//
//   labyrint (the default): a maze without end, walked by itself, where
//   the covers kept on the box lie to be found and picked up (maze.js);
//   what was found is said in a notice, and the last few are carried in a
//   row at the left.
//   eld: the Mandelbrot set like an open fire (mandelbrot.js) and a line of
//   the Tao Te Ching (tao.js).
//
// The daemon decides when (idle.py: no pad connected and nobody pressing
// anything, nothing playing) and takes it away at the next button, which
// does nothing else. When it has been up long enough the TV goes off and
// it rests: nothing moves, and a full-screen message
// (launcher/shared/screen.js) says "Vilar", still, so nothing is drawn
// again until the TV is on. Styled by saver.css.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const LINE_MS = 3 * 60 * 1000;        // a new line every three minutes
  const SAID_MS = 5000;                 // what was found, said this long
  let root = null, rest = null;
  let kind = null;                      // the one drawn: 'labyrint' or 'eld'
  let drawer = null;                    // its { start, stop }
  // The fire's parts.
  let quote = null, where = null, box = null, order = [], lineTimer = null;
  // The maze's.
  let carried = null;

  let chosen = null;                    // as(): the catalogue's choice over the settings'
  let once = null;                      // show(kind): a preview's, this time only
  const wanted = () => {
    if (chosen || once) return chosen || once;
    const ui = (M.bridge.state.config && M.bridge.state.config.ui) || {};
    return ui.screensaver === 'eld' ? 'eld' : 'labyrint';
  };

  function build() {
    root = document.createElement('div');
    root.setAttribute('data-pioneertv-overlay', '');
    rest = M.screen.in(root);
  }
  // The saver's own parts, for the kind wanted; drawn anew when it changes.
  function make(k) {
    if (drawer) drawer.stop();
    clearInterval(lineTimer);
    lineTimer = null;
    [...root.children].forEach((c) => { if (!c.classList.contains('pioneertv-screen')) c.remove(); });
    root.className = `pioneertv-saver pioneertv-saver--${k}`;
    kind = k;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    if (k === 'eld') {
      canvas.className = 'fractal';
      box = document.createElement('figure');
      box.className = 'tao';
      quote = document.createElement('blockquote');
      where = document.createElement('figcaption');
      box.append(quote, where);
      root.prepend(canvas, box);
      drawer = M.mandelbrot(canvas);
    } else {
      canvas.className = 'maze';
      carried = document.createElement('div');
      carried.className = 'maze-carried';
      root.prepend(canvas, carried);
      drawer = M.maze(canvas, { found: tell });
      saver.maze = drawer;               // its debug(), for the catalogue and tests
    }
  }

  // ---------------------------------------------------------- the maze's words
  // What was found is said as any notice is (hud.js toast), its icon its
  // kind's; the last four found are carried in a row at the top left.
  const ICON = { spel: 'gamepad', film: 'film', serie: 'tv', album: 'vinyl' };
  const LATELY = { spel: 'spelat nyss', album: 'spelat nyss' };
  function tell(f, all) {
    const when = f.recent ? ` · ${LATELY[f.kind] || 'sett nyss'}` : '';
    M.hud.toast(`Hittade ${f.title}${when}`, ICON[f.kind] || 'stack', SAID_MS);
    carried.innerHTML = '';
    for (const c of all.slice(-4)) {
      const im = document.createElement('img');
      im.alt = '';
      im.src = c.url;
      carried.appendChild(im);
    }
  }

  // ---------------------------------------------------------- the fire's words
  function line() {
    if (!order.length) order = M.tao.map((_, i) => i).sort(() => Math.random() - 0.5);
    const [text, chapter] = M.tao[order.pop()];
    quote.textContent = `”${text}”`;
    where.textContent = `Tao Te Ching · ${chapter}`;
    fit();
  }
  // The largest size at which the line and its chapter fit the screen.
  function fit() {
    if (kind !== 'eld') return;
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
    if (on && kind === 'eld') { line(); lineTimer = setInterval(line, LINE_MS); }
  }

  const saver = {
    isOpen() { return !!root && root.isConnected; },
    // ask: the settings' preview asks for a kind, this time only (one
    // already up of the other kind is put away first).
    show(ask) {
      if (ask === 'labyrint' || ask === 'eld') once = ask;
      if (this.isOpen()) {
        if (wanted() === kind) return;
        this.hide();
        once = ask;
      }
      if (!root) build();
      if (kind !== wanted()) make(wanted()); else drawer.start();
      M.bridge.mount(root);
      lines(true);
      if (document.fonts) document.fonts.ready.then(() => this.isOpen() && fit());
    },
    hide() {
      once = null;
      if (!this.isOpen()) return;
      this.rest(false);
      drawer.stop();
      lines(false);
      M.bridge.unmount(root);
    },
    // The catalogue of views: the fire straight to a point of a zoom (0 the
    // widest); the kind to show (show() otherwise takes the settings').
    jump(part) { if (kind === 'eld' && drawer) drawer.jump(part); },
    as(k) { chosen = k; },
    // The TV off: nothing moves, nothing is drawn but "Vilar".
    rest(on) {
      if (!root || root.classList.contains('resting') === on) return;
      root.classList.toggle('resting', on);
      if (on) { drawer.stop(); lines(false); rest.show('Vilar', 'Tryck en knapp för att väcka TV:n'); }
      else { rest.hide(); if (this.isOpen()) { drawer.start(); lines(true); } }
    },
  };

  M.saver = saver;
})(window.PioneerTV);
