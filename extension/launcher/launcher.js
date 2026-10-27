// Pioneer TV home page, and the box's screensaver: the Mandelbrot set,
// generated without end (mandelbrot.js), and a line of the Tao Te Ching
// (tao.js). Everything to choose from is in the main menu, which the
// overlay draws over any window: Home opens it, and so does any press here
// (the daemon passes it on to the overlay).
//
// Left alone here, the daemon turns the TV off (idle.py) and says "rest":
// the page then draws nothing, black, until the TV is on again.
(function (M) {
  const b = M.bridge;
  M.launcherUrl = location.href;
  const $ = (id) => document.getElementById(id);

  const fractal = M.mandelbrot($('fractal'));

  // A new line every few minutes, somewhere else on the screen, so nothing
  // stays burnt into the panel.
  const LINE_MS = 3 * 60 * 1000;
  let order = [];
  let lineTimer = null;
  function line() {
    if (!order.length) order = M.tao.map((_, i) => i).sort(() => Math.random() - 0.5);
    const [text, chapter] = M.tao[order.pop()];
    $('tao-text').textContent = `”${text}”`;
    $('tao-where').textContent = `Tao Te Ching · ${chapter}`;
    const box = $('tao');
    box.style.left = `${Math.round(5 + Math.random() * 55)}vw`;
    box.style.top = `${Math.round(8 + Math.random() * 60)}vh`;
    box.style.right = 'auto';
  }
  function lines(on) {
    clearInterval(lineTimer);
    lineTimer = null;
    if (on) { line(); lineTimer = setInterval(line, LINE_MS); }
  }
  lines(true);

  // Resting: the TV is off. Nothing moves, nothing is drawn.
  function rest(on) {
    if (document.documentElement.classList.contains('resting') === on) return;
    document.documentElement.classList.toggle('resting', on);
    if (on) { fractal.stop(); lines(false); }
    else { fractal.start(); lines(true); }
  }
  b.on('rest', (e) => rest(!!e.on));
  b.on('tv', (e) => { if (e.power) rest(e.power === 'standby'); });

  const openMenu = () => b.relay('menu');
  window.addEventListener('keydown', (e) => {
    if (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(); }
  });
  window.addEventListener('click', openMenu);

  M.home = { fractal, rest, line };
})(window.PioneerTV);
