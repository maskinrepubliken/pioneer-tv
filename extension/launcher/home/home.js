// Pioneer TV home page: the box's services as big tiles, its status and a
// few buttons at the top (launcher/shared/tiles.js). A tile opens its
// service, Inställningar the settings page; Live and Sök are panels the
// overlay draws over this page (the daemon passes the ask on). The screensaver is not this page: the
// overlay draws it over everything when no pad is connected (idle.py).
(function (M) {
  const b = M.bridge;
  const S = M.services;
  M.launcherUrl = location.href;

  const panel = (name) => () => b.relay('menu', { panel: name });
  let opening = null;              // the tile on its way to its page
  function open(it) {
    if (opening) return;
    opening = M.tiles.punch(it.el, () => { opening = null; });
    b.navigate(S.resolve(it.url));
  }
  // Back on a page kept in the back/forward cache: no tile is opening.
  window.addEventListener('pageshow', (e) => { if (e.persisted && opening) { opening(); opening = null; } });

  let sheet = null;
  let drawnFor = '';
  function draw() {
    const { first, second, channels } = S.rows();
    const key = JSON.stringify([first, second, channels.length]);
    if (sheet && key === drawnFor) return;
    drawnFor = key;
    const focused = document.activeElement && document.activeElement.dataset.key;
    const service = (s) => ({ key: `tile:${s.id}`, label: s.name, art: S.art(s), color: s.color, url: s.url });
    const row2 = second.map(service);
    if (channels.length) row2.push({ key: 'tile:live', label: S.LIVE.name, art: S.art(S.LIVE), color: S.LIVE.color, panel: 'live' });
    const rows = [first.map(service), row2];
    const head = [
      { key: 'search', label: 'Sök', icon: 'search', round: true, run: panel('search') },
      { key: 'settings', label: 'Inställningar', icon: 'gear', round: true, run: () => b.settings() },
      { key: 'tv-off', label: 'Stäng av TV:n', icon: 'power', round: true, run: () => b.cec('tv_off') },
    ];
    const next = M.tiles.sheet({ head, rows, legend: [[['arrows'], 'navigera'], [['A'], 'välj'], [['Y'], 'tangentbord']] });
    for (const it of rows.flat()) it.el.addEventListener('click', () => (it.panel ? panel(it.panel)() : open(it)));
    for (const it of head) it.el.addEventListener('click', it.run);
    if (sheet) sheet.replaceWith(next); else document.body.appendChild(next);
    sheet = next;
    M.tiles.fitNames(sheet);
    if (document.fonts) document.fonts.ready.then(() => M.tiles.fitNames(sheet));
    const again = (focused && sheet.querySelector(`[data-key="${CSS.escape(focused)}"]`)) || sheet.querySelector('.tiles-tile');
    requestAnimationFrame(() => M.nav.focus(again, { scroll: false }));
  }

  // The services come with the daemon's config; the status pills follow it.
  b.on('state', () => {
    draw();
    const pills = sheet.querySelector('.tiles-pills');
    if (pills) pills.replaceWith(M.tiles.pills());
  });
  window.addEventListener('resize', () => sheet && M.tiles.fitNames(sheet));

  draw();
})(window.PioneerTV);
