// Pioneer TV home page: only the clock, as the screensaver draws it
// (overlay/clock.js). Everything to choose from is in the main menu, which
// the overlay draws over any window: Home opens it, and so does any press
// here (the daemon passes it on to the overlay).
(function (M) {
  const b = M.bridge;
  M.launcherUrl = location.href;

  const clock = M.clock('ordbild-en-rad-papper.svg');
  document.body.appendChild(clock.root);

  const openMenu = () => b.relay('menu');
  window.addEventListener('keydown', (e) => {
    if (e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(); }
  });
  window.addEventListener('click', openMenu);
})(window.PioneerTV);
