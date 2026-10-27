// Pioneer TV clock: ink, the time, the date and the wordmark, jumping to a
// new place once a minute so nothing stays burnt into the panel (nothing
// glides: the design moves only in answer to a button). It is the
// screensaver the overlay draws over every window (overlay/hud.js), and the
// whole of the home page (launcher/index.html). Styled by clock.css
// (.pioneertv-saver).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  // mark: the wordmark's url, from the page that draws it.
  function clock(mark) {
    const root = document.createElement('div');
    root.className = 'pioneertv-saver';
    root.setAttribute('data-pioneertv-overlay', '');
    const box = document.createElement('div'); box.className = 'pioneertv-saver-box';
    const time = document.createElement('p'); time.className = 'pioneertv-saver-time';
    const date = document.createElement('p'); date.className = 'pioneertv-saver-date';
    const img = document.createElement('img'); img.className = 'pioneertv-saver-mark'; img.alt = 'Maskinrepubliken';
    img.src = mark;
    box.append(time, date, img);
    root.appendChild(box);
    let tick = null;
    const draw = () => {
      const now = new Date();
      time.textContent = now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      date.textContent = now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
      box.style.left = `${Math.round(Math.random() * 60) + 5}%`;
      box.style.top = `${Math.round(Math.random() * 55) + 8}%`;
    };
    // On the minute, so the clock is never a minute behind.
    const next = () => { tick = setTimeout(() => { draw(); next(); }, 60000 - (Date.now() % 60000) + 50); };
    draw();
    next();
    return { root, stop: () => clearTimeout(tick) };
  }

  M.clock = clock;
})(window.PioneerTV);
