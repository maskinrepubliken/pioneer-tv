// Pioneer TV home page: the box's services as big tiles, the live TV
// channels as small ones in a column beside them, its status and a few
// buttons at the left (launcher/shared/tiles.js). A tile opens its service
// or channel, Inställningar the settings page; Sök is a panel the overlay
// draws over this page (the daemon passes the ask on). The screensaver is not this page: the
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
    // A channel: the overlay covers the screen until it plays, in full.
    if (it.channel) b.relay('cover', { text: it.label });
    b.navigate(S.resolve(it.url));
  }

  // What is on the channels (the daemon reads SVT's schedule), by the
  // channel its tile opens: /kanaler/svt1 -> svt1. Asked again each minute.
  const slug = (url) => ((url || '').match(/\/kanaler\/([a-z0-9-]+)/) || [])[1];
  let onAir = {};
  function showOnAir() {
    for (const it of live) { const s = slug(it.url); if (s) M.tiles.onAir(it, onAir[s]); }
  }
  async function askOnAir() {
    if (!live.some((it) => slug(it.url))) return;
    try { onAir = (await (await fetch('/api/channels')).json()) || {}; } catch { return; }
    showOnAir();
  }
  setInterval(askOnAir, 60000);
  // Back on a page kept in the back/forward cache: no tile is opening.
  window.addEventListener('pageshow', (e) => { if (e.persisted && opening) { opening(); opening = null; } });

  let sheet = null;
  let live = [];
  let drawnFor = '';
  function draw() {
    const { first, second, channels } = S.rows();
    const key = JSON.stringify([first, second, channels]);
    if (sheet && key === drawnFor) return;
    drawnFor = key;
    const focused = document.activeElement && document.activeElement.dataset.key;
    const service = (s) => ({ key: `tile:${s.id}`, label: s.name, art: S.art(s), color: s.color, url: s.url });
    // The services, all the same size, in two rows; the channels small, in
    // their column.
    const all = [...first, ...second].map(service);
    live = channels.map((s) => ({ key: `channel:${s.id}`, label: s.name, url: s.url, channel: true }));
    const half = Math.ceil(all.length / 2);
    const rows = [all.slice(0, half), all.slice(half)];
    // The column at the left, top to bottom.
    const side = [
      { key: 'search', label: 'Sök', icon: 'search', round: true, run: panel('search') },
      // What Home on the pad opens, with its button's mark.
      { key: 'menu', label: 'Snabbmenyn', icon: 'padHome', round: true, run: () => b.relay('menu') },
      { key: 'settings', label: 'Inställningar', icon: 'gear', round: true, run: () => b.settings() },
      { key: 'tv-off', label: 'Stäng av TV:n', icon: 'power', round: true, run: () => b.cec('tv_off') },
    ];
    const next = M.tiles.sheet({ side, channels: live, rows, legend: [[['arrows'], 'navigera'], [['A'], 'välj'], [['Y'], 'tangentbord']] });
    for (const it of [...rows.flat(), ...live]) it.el.addEventListener('click', () => open(it));
    for (const it of side) it.el.addEventListener('click', it.run);
    if (sheet) sheet.replaceWith(next); else document.body.appendChild(next);
    sheet = next;
    M.tiles.fitNames(sheet);
    M.art.fit(sheet);
    showOnAir();
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
  askOnAir();
})(window.PioneerTV);
