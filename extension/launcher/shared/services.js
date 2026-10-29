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

  // The first row: the services without a row (Film & serier as three);
  // the second: those with row
  // "second" (Bilder); channels: those with row "live" (TV and radio, TV
  // first), behind one Live tile.
  // Jellyfin's films, series and videos as a tile each (Film, Serier,
  // Videor), each opening the film pages on its own section
  // (libraries/film.js ?section=), from the one Film & serier service.
  const SPLIT = [
    { section: 'movies', id: 'film', name: 'Film', color: '#2e6b6b' },
    { section: 'tvshows', id: 'serier', name: 'Serier' },          // the old tile's colour and shelf
    { section: 'homevideos', id: 'videor', name: 'Videor', color: '#b0643a' },
  ];
  const withSection = (url, section) => url && url.replace('library=film', `library=film&section=${section}`);
  function split(s) {
    if (!s.url || !s.url.includes('library=film')) return [s];
    return SPLIT.map((t) => ({ ...s, id: t.id, name: t.name, color: t.color || s.color,
      url: withSection(s.url, t.section), search_url: withSection(s.search_url, t.section) }));
  }

  function rows() {
    const all = list().flatMap(split);
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
