// Pioneer TV library Bilder: Immich's pictures and clips (sources/immich.js),
// drawn by the browse page (browse/page.js) and shown full screen by the
// picture viewer (players/photo.js), a clip played on the box in mpv.
//
// #/ is today's memories ("för X år sedan"), the albums and the people;
// #/timeline the months, a year at a time; #/month/<2024-05-01>,
// #/album/<id>, #/person/<id>, #/memory/<id>, #/favorites and
// #/search/<words> (Immich's search by what is in the picture) are grids of
// pictures; #/albums and #/people every album and person. A picture opens
// the viewer at it; X on a grid starts a slideshow from its first.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const I = M.immich;
  const photo = M.players.photo;

  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  const monthName = (month) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
  const many = (n) => (n === 1 ? '1 bild' : `${n} bilder`);
  const ago = (year) => { const n = new Date().getFullYear() - year; return n === 1 ? 'För ett år sedan' : `För ${n} år sedan`; };

  // A picture as the grid's item; A opens the viewer at it, among the rest.
  const pictures = (assets) => assets.map((a, i) => ({
    key: `asset:${a.id}`, title: '', picture: I.picture(a.id), video: a.video ? a.seconds || true : false,
    run: () => photo.open(assets, i),
  }));
  function grid(title, assets, empty = 'Inga bilder här.') {
    return {
      kind: 'grid', title, look: 'photos', columns: 6, items: pictures(assets), filter: false,
      count: () => many(assets.length), empty,
      legend: [['arrows', 'välj'], ['A', 'visa']],
      actions: assets.length ? [{ label: 'Bildspel', icon: 'play', primary: true, key: 'slideshow', run: () => photo.open(assets, 0, { slideshow: true }) }] : [],
    };
  }

  const albumCard = (a) => ({
    key: `album:${a.id}`, title: a.name, meta: many(a.count), href: `#/album/${encodeURIComponent(a.id)}`,
    picture: a.cover ? I.picture(a.cover) : null,
  });
  const personCard = (p) => ({ key: `person:${p.id}`, title: p.name, href: `#/person/${encodeURIComponent(p.id)}`, picture: I.face(p.id), shape: 'round' });

  async function start() {
    const [memories, albums, people] = await Promise.all([I.memories().catch(() => []), I.albums(), I.people().catch(() => [])]);
    return {
      kind: 'shelf', title: 'Bilder', legend: [['A', 'öppna']],
      sections: [
        { label: 'Minnen', layout: 'stacks', columns: 4, shape: 'square', items: memories.map((m) => ({
          key: `memory:${m.id}`, title: ago(m.year), meta: many(m.assets.length), href: `#/memory/${encodeURIComponent(m.id)}`,
          pictures: m.assets.slice(0, 4).map((a) => ({ src: I.picture(a.id), name: '' })),
        })) },
        { label: 'Album', layout: 'stacks', columns: 4, shape: 'square', items: albums.slice(0, 8).map(albumCard),
          empty: 'Inga album än. Gör ett i Immich.' },
        { label: 'Personer', layout: 'shelf', shape: 'round', items: people.slice(0, 12).map(personCard) },
      ],
    };
  }

  // The timeline: each year, its months as cards with how many.
  async function timeline() {
    const months = await I.months();
    const years = new Map();
    for (const m of months) {
      const y = m.month.slice(0, 4);
      if (!years.has(y)) years.set(y, []);
      years.get(y).push(m);
    }
    const total = months.reduce((n, m) => n + m.count, 0);
    return {
      kind: 'shelf', title: 'Tidslinje', count: many(total), legend: [['A', 'öppna']],
      sections: [...years].map(([y, list]) => ({
        label: y, layout: 'groups', items: list.map((m) => ({
          key: `month:${m.month}`, title: MONTHS[Number(m.month.slice(5, 7)) - 1], meta: many(m.count),
          href: `#/month/${m.month}`, style: 'prose',
        })),
      })),
    };
  }

  async function view([what, arg]) {
    if (what === 'timeline') return timeline();
    if (what === 'month' && arg) return grid(monthName(arg), await I.month(arg));
    if (what === 'albums') {
      const albums = await I.albums();
      return { kind: 'grid', title: 'Album', look: 'stacks', shape: 'square', columns: 5, items: albums.map(albumCard), filter: true,
        count: (n, all) => (n === all ? `${all} album` : `${n} av ${all} album`), empty: 'Inga album än.', legend: [['A', 'öppna']] };
    }
    if (what === 'album' && arg) { const a = await I.album(arg); return grid(a.name, a.assets); }
    if (what === 'people') {
      const people = await I.people();
      return { kind: 'grid', title: 'Personer', shape: 'round', columns: 6, items: people.map(personCard), filter: true,
        count: (n, all) => (n === all ? `${all} personer` : `${n} av ${all} personer`), empty: 'Ingen har fått ett namn i Immich än.', legend: [['A', 'öppna']] };
    }
    if (what === 'person' && arg) { const p = await I.person(arg); return grid(p.name, p.assets); }
    if (what === 'memory' && arg) {
      const m = (await I.memories()).find((x) => x.id === arg);
      return m ? grid(ago(m.year), m.assets) : start();
    }
    if (what === 'favorites') return grid('Favoriter', await I.favorites(), 'Inga favoriter än. Markera en bild med hjärtat i Immich.');
    if (what === 'search' && arg) {
      const found = await I.search(arg);
      return { ...grid(M.views.searchTitle(arg), found), count: () => M.views.hits(found.length), empty: M.views.NONE };
    }
    return start();
  }

  // The column at the left: the start, the timeline, the albums, the people, the favourites.
  const rail = () => [{ items: [
    { label: 'Minnen', icon: 'spark', href: '#/', key: 'rail:start' },
    { label: 'Tidslinje', icon: 'clock', href: '#/timeline', key: 'rail:timeline' },
    { label: 'Album', icon: 'stack', href: '#/albums', key: 'rail:albums' },
    { label: 'Personer', icon: 'person', href: '#/people', key: 'rail:people' },
    { label: 'Favoriter', icon: 'heart', href: '#/favorites', key: 'rail:favorites' },
  ] }];

  M.libraries = M.libraries || {};
  M.libraries.bilder = {
    name: 'Bilder', source: 'Immich', search: 'Sök bland bilderna…',
    isRoot: ([what]) => !what,
    view, rail,
  };
})(window.PioneerTV);
