// Pioneer TV screensaver, drawn by the overlay over every window, one of
// two (Inställningar → TV, ui.screensaver):
//
//   labyrint (the default): a maze without end, walked by itself, where
//   the covers kept on the box lie to be found and picked up (maze.js);
//   what was found is said at the foot, and the last few are carried in a
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
  const SAID_MS = 4500;                 // what was found, said this long
  let root = null, rest = null;
  let kind = null;                      // the one drawn: 'labyrint' or 'eld'
  let drawer = null;                    // its { start, stop }
  // The fire's parts.
  let quote = null, where = null, box = null, order = [], lineTimer = null;
  // The maze's.
  let said = null, carried = null, saidTimer = null;

  let chosen = null;                    // as(): the catalogue's choice over the settings'
  const wanted = () => {
    if (chosen) return chosen;
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
      said = document.createElement('figure');
      said.className = 'maze-said';
      said.hidden = true;
      carried = document.createElement('div');
      carried.className = 'maze-carried';
      root.prepend(canvas, carried, said);
      drawer = M.maze(canvas, { found: tell });
      saver.maze = drawer;               // its debug(), for the catalogue and tests
    }
  }

  // ---------------------------------------------------------- the maze's words
  const KIND = { spel: 'ett spel', film: 'en film', serie: 'en serie', album: 'ett album' };
  function tell(f, all) {
    said.innerHTML = '';
    const pic = document.createElement('img');
    pic.alt = '';
    pic.src = f.url;
    const words = document.createElement('figcaption');
    const small = document.createElement('span');
    small.className = 'maze-said-what';
    small.textContent = `Du hittade ${KIND[f.kind] || 'något'}`;
    const name = document.createElement('span');
    name.className = 'maze-said-name';
    name.textContent = f.title;
    words.append(small, name);
    said.append(pic, words);
    said.hidden = false;
    clearTimeout(saidTimer);
    saidTimer = setTimeout(() => { said.hidden = true; }, SAID_MS);
    carried.innerHTML = '';
    for (const c of all) {
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
    show() {
      if (this.isOpen()) return;
      if (!root) build();
      if (kind !== wanted()) make(wanted()); else drawer.start();
      M.bridge.mount(root);
      lines(true);
      if (document.fonts) document.fonts.ready.then(() => this.isOpen() && fit());
    },
    hide() {
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
