// Pioneer TV screensaver, drawn by the overlay over every window, one of
// two (Inställningar → TV, ui.screensaver):
//
//   labyrint (the default): a maze without end, floated through by itself,
//   its walls hung with pictures (maze.js); now and then the walker stops
//   and looks at a wall, and its pictures come up sharp over it, with what
//   each is: when a picture was taken and where, a game or a film by its
//   name and whether it was played or seen lately; or a sign's line.
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
  let root = null, rest = null;
  let kind = null;                      // the one drawn: 'labyrint' or 'eld'
  let drawer = null;                    // its { start, stop }
  // The fire's parts.
  let quote = null, where = null, box = null, order = [], lineTimer = null;
  // The maze's: what the walker looks at, sharp.
  let looking = null;

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
      looking = document.createElement('div');
      looking.className = 'maze-look';
      root.prepend(canvas, looking);
      drawer = M.maze(canvas, { look, leave });
      saver.maze = drawer;               // its debug(), for the catalogue and tests
    }
  }

  // ---------------------------------------------------------- the maze's pictures
  // What hangs on the wall looked at, each sharp in its frame, and under it
  // what it is; faded in once the pictures have come, out as it walks on.
  const LATELY = { spel: 'spelat nyss', album: 'spelat nyss' };
  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  function said(it) {
    if (it.photo) {
      const d = it.taken ? new Date(it.taken) : null;
      const when = d && !isNaN(d) ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
      return [when, it.city].filter(Boolean);
    }
    return [it.title, it.recent ? LATELY[it.kind] || 'sett nyss' : ''].filter(Boolean);
  }
  let lookTimer = 0;
  function look(items) {
    clearTimeout(lookTimer);
    looking.innerHTML = '';
    looking.style.setProperty('--n', String(items.length));
    const loads = items.map((it) => {
      const fig = document.createElement('figure');
      // A sign on a pale wall: its line, large.
      if (it.sign) {
        fig.appendChild(Object.assign(document.createElement('div'), { className: 'maze-sign', textContent: it.sign }));
        looking.appendChild(fig);
        return Promise.resolve();
      }
      const frame = document.createElement('div');
      frame.className = 'maze-frame';
      const im = document.createElement('img');
      im.alt = '';
      im.src = it.big || it.url;
      frame.appendChild(im);
      const cap = document.createElement('figcaption');
      const [first, second] = said(it);
      if (first) cap.appendChild(Object.assign(document.createElement('b'), { textContent: first }));
      if (second) cap.appendChild(Object.assign(document.createElement('span'), { textContent: second }));
      fig.append(frame, cap);
      looking.appendChild(fig);
      return new Promise((done) => { im.onload = im.onerror = done; });
    });
    Promise.all(loads).then(() => { if (looking.firstChild) looking.classList.add('shown'); });
  }
  function leave() {
    looking.classList.remove('shown');
    clearTimeout(lookTimer);
    lookTimer = setTimeout(() => { if (!looking.classList.contains('shown')) looking.innerHTML = ''; }, 900);
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
