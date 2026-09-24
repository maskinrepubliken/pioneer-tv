// Default services shown by the launcher when no daemon config is available
// (design work on a laptop). On the Pi the daemon's config.toml wins.
// `{query}` in search_url is replaced with the URL-encoded search string.
// row: 'live' puts a service in the second row: live TV and radio, no
// illustration, labelled by kind ('tv' or 'radio'). A relative url opens a
// page of the launcher, like the radio player.
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
    "name": "Jellyfin",
    "tagline": "Egna filmer och serier",
    "url": "http://100.123.142.8:8096/web/",
    "search_url": "http://100.123.142.8:8096/web/#/search.html?query={query}",
    "color": "#7b5ea7",
    "glyph": "J"
  },
  {
    "id": "romm",
    "name": "Spel",
    "tagline": "RomM",
    "url": "http://100.123.142.8:8081/",
    "search_url": "http://100.123.142.8:8081/search?search={query}",
    "color": "#3b6ea5",
    "glyph": "R"
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
