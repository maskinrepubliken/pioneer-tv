// Default services shown by the launcher when no daemon config is available
// (design work on a laptop). On the Pi the daemon's config.toml wins.
// `{query}` in search_url is replaced with the URL-encoded search string.
// row: 'second' puts a service in the second row of big tiles (Bilder).
// row: 'live' makes it a live channel ('tv' or 'radio' by kind): those are
// listed behind the second row's Live tile. A relative url opens a page of
// the launcher, like the radio player.
window.PioneerTV = window.PioneerTV || {};
window.PioneerTV.defaultServices = [
  {
    "id": "cineasterna",
    "name": "Cineasterna",
    "tagline": "Film från biblioteket",
    "url": "https://www.cineasterna.com/sv/library/5/discover",
    "search_url": "https://www.cineasterna.com/sv/library/5/search?q={query}&page=1",
    "color": "#b8940c",
    "glyph": "C"
  },
  {
    "id": "svtplay",
    "name": "SVT Play",
    "tagline": "Public service",
    "url": "https://www.svtplay.se/",
    "search_url": "https://www.svtplay.se/sok?q={query}",
    "color": "#1f7a4d",
    "glyph": "S"
  },
  {
    "id": "jellyfin",
    "name": "Film & serier",
    "tagline": "Jellyfin",
    "url": "browse.html?library=film&tv=1",
    "search_url": "browse.html?library=film&tv=1#/search/{query}",
    "color": "#7b5ea7",
    "glyph": "J"
  },
  {
    "id": "musik",
    "name": "Musik",
    "tagline": "Jellyfin",
    "url": "browse.html?library=musik&tv=1",
    "color": "#a8533a",
    "glyph": "M"
  },
  {
    "id": "spel",
    "name": "Spel",
    "tagline": "RomM",
    "url": "browse.html?library=spel&tv=1",
    "search_url": "browse.html?library=spel&tv=1#/search/{query}",
    "color": "#3b6ea5",
    "glyph": "S"
  },
  {
    "id": "immich",
    "name": "Bilder",
    "tagline": "Immich",
    "url": "https://bilder.lyresten.se/",
    "color": "#3f7fa6",
    "row": "second"
  },
  {
    "id": "svt1",
    "name": "SVT1",
    "url": "https://www.svtplay.se/kanaler/svt1?start=auto",
    "row": "live",
    "kind": "tv",
    "fullscreen": "1"
  },
  {
    "id": "svt2",
    "name": "SVT2",
    "url": "https://www.svtplay.se/kanaler/svt2?start=auto",
    "row": "live",
    "kind": "tv",
    "fullscreen": "1"
  },
  {
    "id": "svtbarn",
    "name": "SVT Barn",
    "url": "https://www.svtplay.se/kanaler/svtbarn?start=auto",
    "row": "live",
    "kind": "tv",
    "fullscreen": "1"
  },
  {
    "id": "kunskapskanalen",
    "name": "Kunskaps\u00adkanalen",
    "url": "https://www.svtplay.se/kanaler/kunskapskanalen?start=auto",
    "row": "live",
    "kind": "tv",
    "fullscreen": "1"
  },
  {
    "id": "p1",
    "name": "P1",
    "url": "radio.html?channel=132&name=P1",
    "row": "live",
    "kind": "radio"
  },
  {
    "id": "p2",
    "name": "P2",
    "url": "radio.html?channel=163&name=P2",
    "row": "live",
    "kind": "radio"
  },
  {
    "id": "p3",
    "name": "P3",
    "url": "radio.html?channel=164&name=P3",
    "row": "live",
    "kind": "radio"
  },
  {
    "id": "p4",
    "name": "P4",
    "url": "radio.html?channel=206&name=P4",
    "row": "live",
    "kind": "radio"
  }
];
