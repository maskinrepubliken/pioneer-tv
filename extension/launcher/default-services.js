// Default services shown by the launcher when no daemon config is available
// (design work on a laptop). On the Pi the daemon's config.toml wins.
// `{query}` in search_url is replaced with the URL-encoded search string.
window.PioneerTV = window.PioneerTV || {};
window.PioneerTV.defaultServices = [
  {
    id: 'cineasterna',
    name: 'Cineasterna',
    tagline: 'Film från biblioteket',
    url: 'https://www.cineasterna.com/sv/library/5/discover',
    search_url: 'https://www.cineasterna.com/sv/library/5/search?q={query}&page=1',
    color: '#b8940c',
    glyph: 'C',
  },
  {
    id: 'svtplay',
    name: 'SVT Play',
    tagline: 'Public service',
    url: 'https://www.svtplay.se/',
    search_url: 'https://www.svtplay.se/sok?q={query}',
    color: '#1f7a4d',
    glyph: 'S',
  },
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    tagline: 'Egna filmer och serier',
    url: 'http://100.123.142.8:8096/web/',
    search_url: 'http://100.123.142.8:8096/web/#/search.html?query={query}',
    color: '#7b5ea7',
    glyph: 'J',
  },
  {
    id: 'romm',
    name: 'RomM',
    tagline: 'Retrospel',
    url: 'http://100.123.142.8:8080/',
    search_url: 'http://100.123.142.8:8080/search?searchTerm={query}',
    color: '#3b6ea5',
    glyph: 'R',
  },
];
