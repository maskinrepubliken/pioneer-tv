// Pioneer TV library Musik: Jellyfin's music (sources/jellyfin.js), drawn
// by the browse page (browse/page.js). #/ is Blanda allt and the
// playlists, and the column at the left goes to Album and Artister; #/albums and #/artists are grids; #/album/<id> and
// #/playlist/<id> a list of songs; #/artist/<id> an artist's albums;
// #/search/<words> what was found. A song plays in the page, from where it
// is in its list (players/audio.js): X opens Spelas nu, L1/R1 skip.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const J = M.jellyfin;
  const audio = M.players.audio;
  audio.source = { report: (what, song, at) => J.report(what, song, at), played: (song) => J.markPlayed(song) };

  const clock = (s) => {
    if (s == null || !isFinite(s)) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const songs = (n) => (n === 1 ? '1 låt' : `${n} låtar`);

  function shuffled(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // An album, a playlist or an artist as a card; a song as a row that plays
  // the list it is in from it.
  const HREF = { playlist: '#/playlist/', album: '#/album/', artist: '#/artist/' };
  const group = (g) => ({
    key: `${g.kind}:${g.id}`, title: g.name, picture: g.cover, href: HREF[g.kind] + encodeURIComponent(g.id),
    shape: g.kind === 'artist' ? 'round' : 'square',
    meta: g.kind === 'album' ? [g.artist, g.year].filter(Boolean).join(' · ') : g.kind === 'playlist' && g.count != null ? songs(g.count) : '',
  });
  const playable = (list) => list.map((s) => ({ ...s, stream: J.streamUrl(s) }));
  const song = (s, i, list, withAlbum) => ({
    key: `song:${i}:${s.id}`, song: s.id, title: s.name, picture: s.thumb,
    meta: [s.artist, withAlbum ? s.album : ''].filter(Boolean).join(' · '), detail: clock(s.seconds),
    run: () => audio.play(playable(list), i),
  });

  async function playAll(get, mix) {
    const list = await get();
    if (list.length) audio.play(playable(mix ? shuffled(list) : list), 0);
    else M.hud.toast('Inga låtar i biblioteket', 'info');
  }
  const tryPlay = (get, mix) => () => playAll(get, mix).catch((err) => M.views.error(M.browse.view, 'Jellyfin', err, M.browse.route));

  async function start() {
    const playlists = await J.playlists();
    return {
      kind: 'shelf', title: 'Musik', legend: [['A', 'öppna · spela']],
      sections: [
        { layout: 'actions', items: [
          { button: true, label: 'Blanda allt', primary: true, key: 'shuffle', run: tryPlay(() => J.shuffleAll(), false) },
        ] },
        { label: 'Spellistor', layout: 'stacks', columns: 4, shape: 'square', items: playlists.map(group),
          empty: 'Inga spellistor än. Gör en i Jellyfin på datorn eller telefonen.' },
      ],
    };
  }

  async function grid(kind) {
    const all = kind === 'albums' ? await J.albums() : await J.artists();
    const word = kind === 'albums' ? 'album' : 'artister';
    return {
      kind: 'grid', title: kind === 'albums' ? 'Album' : 'Artister', filter: true,
      legend: [['A', 'öppna'], ['L1', ''], ['R1', 'hoppa en bokstav']],
      items: all.map(group), shape: kind === 'albums' ? 'square' : 'round',
      look: kind === 'albums' ? 'shelf' : 'stacks', columns: kind === 'albums' ? 6 : 4,
      count: (n, total) => (n === total ? `${total} ${word}` : `${n} av ${total} ${word}`),
      empty: kind === 'albums' ? 'Inga album.' : 'Inga artister.',
    };
  }

  // A playlist or an album: its picture, Spela and Blanda, its songs.
  async function list(kind, id) {
    const [g, list] = await Promise.all([J.item(id), J.songs({ kind, id })]);
    const total = list.reduce((n, s) => n + (s.seconds || 0), 0);
    return {
      kind: 'detail', title: kind === 'playlist' ? 'Spellista' : 'Album', legend: [['A', 'spela']],
      shape: 'square', picture: g.cover || (list[0] && list[0].cover), name: g.name,
      meta: [kind === 'album' ? g.artist : '', g.year, songs(list.length), clock(total)].filter(Boolean).join(' · '),
      buttons: list.length ? [
        { label: 'Spela', primary: true, key: 'play', run: () => audio.play(playable(list), 0) },
        { label: 'Blanda', key: 'shuffle', run: () => audio.play(playable(shuffled(list)), 0) },
      ] : [],
      rows: { look: kind === 'playlist' ? 'thumb' : 'number', items: list.map((s, i) => song(s, i, list, kind === 'playlist')), empty: 'Inga låtar.' },
      focus: 'play',
    };
  }

  async function artist(id) {
    const [who, albums] = await Promise.all([J.item(id), J.albums({ artistId: id })]);
    const all = () => J.songs({ kind: 'artist', id });
    return {
      kind: 'shelf', title: who.name, legend: [['A', 'öppna · spela']],
      sections: [
        { layout: 'actions', items: [
          { button: true, label: 'Spela allt', primary: true, key: 'play', run: tryPlay(all, false) },
          { button: true, label: 'Blanda', key: 'shuffle', run: tryPlay(all, true) },
        ] },
        { label: 'Album', layout: 'shelf', items: albums.map(group) },
      ],
      focus: 'play',
    };
  }

  async function search(term) {
    const found = await J.search(term);
    return {
      kind: 'shelf', title: 'Sök', legend: [['A', 'spela · öppna']],
      sections: [
        { label: 'Artister', layout: 'stacks', columns: 4, shape: 'round', items: found.artists.map(group), empty: 'Inga artister.' },
        { label: 'Album', layout: 'shelf', items: found.albums.map(group), empty: 'Inga album.' },
        { label: 'Låtar', layout: 'rows', look: 'thumb', items: found.songs.map((s, i) => song(s, i, found.songs, true)), empty: 'Inga låtar.' },
      ],
    };
  }

  // The column at the left: the playlists (the start), the albums, the artists.
  const rail = () => [{ items: [
    { label: 'Spellistor', icon: 'playlist', href: '#/', key: 'rail:playlists' },
    { label: 'Album', icon: 'vinyl', href: '#/albums', key: 'rail:albums' },
    { label: 'Artister', icon: 'person', href: '#/artists', key: 'rail:artists' },
  ] }];

  function view([what, arg]) {
    if (what === 'albums' || what === 'artists') return grid(what);
    if ((what === 'playlist' || what === 'album') && arg) return list(what, arg);
    if (what === 'artist' && arg) return artist(arg);
    if (what === 'search' && arg) return search(arg);
    return start();
  }

  // While browsing: X opens Spelas nu, L1/R1 (Tab) skip.
  function onKey(e) {
    if (e.key === ' ') { if (!e.repeat) audio.open(); return true; }
    if (e.key === 'Tab') { if (!e.repeat && audio.song()) (e.shiftKey ? audio.prev() : audio.next()); return true; }
    return false;
  }

  M.libraries = M.libraries || {};
  M.libraries.musik = {
    name: 'Musik', source: 'Jellyfin', search: 'Sök låt, album eller artist…',
    isRoot: ([what]) => !what,
    view, rail, onKey, legend: () => audio.legend(),
  };
})(window.PioneerTV);
