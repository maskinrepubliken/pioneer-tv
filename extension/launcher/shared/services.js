// Pioneer TV: what the box offers, as the home page (home/home.js) and the
// overlay's Sök panel (overlay/main-menu.js) both use it: the services from
// the daemon's config (or default-services.js while designing), in two rows
// of tiles and a column of live channels, and where a service's address goes.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const b = M.bridge;

  // The services as configured, Film & serier as three (split below):
  // the home page's tiles and the overlay's Sök alike.
  function list() {
    const s = b.state.config && b.state.config.services;
    return (Array.isArray(s) && s.length ? s : (M.defaultServices || [])).flatMap(split);
  }

  // A relative url is a page of the launcher.
  function resolve(url) {
    try { return new URL(url, b.launcherUrl).href; } catch { return url; }
  }

  // A service's picture: its logo, else its illustration (art.js).
  const art = (s) => (s.logo ? `<img src="${encodeURI(s.logo)}" alt="">` : M.art.html(s.id, s.color || '#444'));

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

  // Where the big tiles stand on the home page, by id: Play, Cineasterna,
  // Bilder, Spel in the first row; Film, Serier, Musik, Videor in the
  // second. One not named here goes at the end of its row (the second with
  // row "second").
  const PLACES = [['svtplay', 'cineasterna', 'immich', 'romm', 'spel'], ['film', 'serier', 'musik', 'videor']];
  function rows() {
    const all = list();
    const tiles = all.filter((s) => s.row !== 'live');
    const placed = (ids) => ids.map((id) => tiles.find((s) => s.id === id)).filter(Boolean);
    const named = new Set(PLACES.flat());
    const rest = tiles.filter((s) => !named.has(s.id));
    return {
      first: [...placed(PLACES[0]), ...rest.filter((s) => s.row !== 'second')],
      second: [...placed(PLACES[1]), ...rest.filter((s) => s.row === 'second')],
      channels: all.filter((s) => s.row === 'live'),
    };
  }

  M.services = { list, resolve, art, rows };
})(window.PioneerTV);
