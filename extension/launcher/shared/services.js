// Pioneer TV: what the box offers, as the home page (home/home.js) and the
// overlay's Live and Sök panels (overlay/main-menu.js) both use it: the services
// from the daemon's config (or default-services.js while designing), in two
// rows of tiles, Live for the channels, and where a service's address goes.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;

  function list() {
    const s = b.state.config && b.state.config.services;
    return Array.isArray(s) && s.length ? s : (M.defaultServices || []);
  }

  // A relative url is a page of the launcher (the radio player).
  function resolve(url) {
    try { return new URL(url, b.launcherUrl).href; } catch { return url; }
  }

  // A service's picture: its logo, else its illustration (art.js).
  const art = (s) => (s.logo ? `<img src="${encodeURI(s.logo)}" alt="">` : M.art.html(s.id, s.color || '#444'));

  // The first row: the services without a row; the second: those with row
  // "second" (Bilder); channels: those with row "live" (TV and radio, TV
  // first), behind one Live tile.
  function rows() {
    const all = list();
    const order = (s) => (s.kind === 'radio' ? 1 : 0);
    return {
      first: all.filter((s) => s.row !== 'second' && s.row !== 'live'),
      second: all.filter((s) => s.row === 'second'),
      channels: all.filter((s) => s.row === 'live').sort((x, y) => order(x) - order(y)),
    };
  }

  // The Live tile's look.
  const LIVE = { id: 'live', name: 'Live', color: '#a8352a' };

  M.services = { list, resolve, art, rows, LIVE };
})(window.PioneerTV);
