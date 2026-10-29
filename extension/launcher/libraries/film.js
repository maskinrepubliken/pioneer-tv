// Pioneer TV libraries Film, Serier and Videor: Jellyfin's films, series
// and clips (sources/jellyfin.js), drawn by the browse page (browse/page.js)
// and played on the box in mpv (players/video.js).
//
// ?section= (the home page's Film, Serier and Videor tiles; none: films)
// keeps to the libraries of one kind: movies, tvshows, or homevideos (and
// any other kind of video). #/ is what to watch (Fortsätt titta, Nästa
// avsnitt, Senast tillagt, Jellyfin's recommendations, a video library's
// folders); #/all every film or series in a grid; #/genre/<name> those of a
// genre; #/collections Jellyfin's collections (box sets), when there are
// any; the column at the left has them, each with its icon. #/lib/<id> a
// library (when the section has more than one); #/folder/<id> a folder or
// a collection; #/series/<id>[/<season id>]: the series, its seasons as
// tabs, a season's episodes; #/item/<id>: a film, an episode or a clip,
// with Spela, sound and subtitles; #/search/<words>, in the section.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const J = M.jellyfin;
  const video = M.players.video;

  const clock = (s) => {
    if (s == null || !isFinite(s)) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  // A length as people say it: "1 h 52 min", "24 min".
  const length = (s) => {
    if (!s) return '';
    const m = Math.round(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  };
  const episodeCode = (v) => (v.season != null && v.episode != null ? `S${v.season} · A${v.episode}` : '');
  const progress = (v) => (v.position && v.seconds ? v.position / v.seconds : 0);

  function href(v) {
    if (v.kind === 'series') return `#/series/${encodeURIComponent(v.id)}`;
    if (v.kind === 'season') return `#/series/${encodeURIComponent(v.seriesId)}/${encodeURIComponent(v.id)}`;
    if (v.kind === 'collection') return `#/folder/${encodeURIComponent(v.id)}`;
    if (v.kind === 'folder') return `#/folder/${encodeURIComponent(v.id)}`;
    return `#/item/${encodeURIComponent(v.id)}`;
  }

  // A film or a series: a portrait poster. An episode, a clip or something
  // begun: a 16:9 still. A folder: type only.
  function item(v) {
    const base = { key: `v:${v.id}`, href: href(v), progress: progress(v) };
    if (v.kind === 'collection') return { ...base, title: v.name, meta: v.count == null ? '' : v.count === 1 ? '1 film' : `${v.count} filmer`, picture: v.poster, mock: 'dvd', shape: 'poster' };
    if (v.kind === 'folder') return { ...base, title: v.name, meta: v.count == null ? '' : v.count === 1 ? '1 sak' : `${v.count} saker`, style: 'prose' };
    if (v.kind === 'movie' || v.kind === 'series') {
      const meta = v.kind === 'series' && v.count ? [v.year, v.count === 1 ? '1 säsong' : `${v.count} säsonger`].filter(Boolean).join(' · ') : v.year;
      return { ...base, title: v.name, meta: meta ? String(meta) : '', picture: v.poster, mock: 'dvd', shape: 'poster' };
    }
    return still(v);
  }
  function still(v) {
    return {
      key: `v:${v.id}`, href: href(v), progress: progress(v), picture: v.still, mock: 'still', shape: 'still',
      title: v.kind === 'episode' && v.series ? v.series : v.name,
      meta: v.kind === 'episode' ? [episodeCode(v), v.name].filter(Boolean).join(' · ')
        : v.position && v.seconds ? `${clock(v.seconds - v.position)} kvar` : length(v.seconds),
    };
  }

  // What a library or a folder holds: folders first (a library's are in the
  // column at the left instead), then posters, then stills.
  function sections(found, label, { folders: withFolders = true } = {}) {
    const folders = withFolders ? found.filter((v) => v.kind === 'folder').map(item) : [];
    const posters = found.filter((v) => v.kind === 'movie' || v.kind === 'series').map(item);
    const stills = found.filter((v) => !['folder', 'movie', 'series'].includes(v.kind)).map(item);
    if (!found.length || (!folders.length && found.every((v) => v.kind === 'folder'))) return [{ label, items: [], empty: 'Inget hittades' }];
    return [
      { label, layout: 'groups', items: folders },
      { label: folders.length ? null : label, layout: 'shelf', shape: 'poster', items: posters },
      { label: folders.length || posters.length ? null : label, layout: 'shelf', shape: 'still', items: stills },
    ];
  }

  // ------------------------------------------------------------ sections
  const SECTION = new URLSearchParams(location.search).get('section');
  const SECTIONS = {
    movies: { name: 'Film', all: 'Alla filmer', search: 'Sök film…', types: 'Movie', mock: 'dvd' },
    tvshows: { name: 'Serier', all: 'Alla serier', search: 'Sök serie eller avsnitt…', types: 'Series,Episode', mock: 'dvd' },
    homevideos: { name: 'Videor', all: null, search: 'Sök video…', types: 'Video', mock: 'still' },
  };
  // No section asked for (an old address): films.
  const SEC = SECTIONS[SECTION] || SECTIONS.movies;
  const SECTION_KEY = SECTIONS[SECTION] ? SECTION : 'movies';
  // The section a library belongs to: films, series, and the rest videos.
  const sectionOf = (lib) => (lib.type === 'movies' || lib.type === 'tvshows' ? lib.type : 'homevideos');
  const LIB_ICON = { movies: 'film', tvshows: 'tv', homevideos: 'camera' };

  // Genres by their Swedish name, with an icon: Jellyfin has some under
  // both their English and their Swedish name, and they are one here.
  const GENRES = [
    [/^action/i, 'Action', 'bolt'], [/^anim/i, 'Animerat', 'pencil'], [/^(äventyr|adventure)/i, 'Äventyr', 'compass'],
    [/^(komedi|comedy)/i, 'Komedi', 'smile'], [/^(dokument|documentary)/i, 'Dokumentär', 'eye'], [/^drama/i, 'Drama', 'masks'],
    [/^(familj|family|kids|barn)/i, 'Familj', 'family'], [/^fantasy/i, 'Fantasy', 'wand'], [/^(histor)/i, 'Historisk', 'column'],
    [/^(krig|war)/i, 'Krig', 'helmet'], [/^(kriminal|crime)/i, 'Kriminal', 'fingerprint'], [/^(music|musik)/i, 'Musik', 'note'],
    [/^(myst)/i, 'Mystik', 'keyhole'], [/^(roman)/i, 'Romantik', 'heart'], [/^(science fiction|sci-fi)/i, 'Science fiction', 'rocket'],
    [/^(skräck|horror)/i, 'Skräck', 'ghost'], [/^thriller/i, 'Thriller', 'pulse'], [/^(tv-film|tv movie)/i, 'TV-film', 'tv'],
    [/^(västern|western)/i, 'Västern', 'hat'],
  ];
  function genreOf(name) {
    const g = GENRES.find(([re]) => re.test(name));
    return g ? { name: g[1], icon: g[2] } : { name, icon: null };
  }
  const slug = (name) => name.toLocaleLowerCase('sv-SE').replace(/\s+/g, '-');

  // ------------------------------------------------------------ views
  let libraries = null;
  async function libs() {
    if (!libraries) {
      const all = await J.libraries();
      libraries = all.filter((l) => sectionOf(l) === SECTION_KEY);
    }
    return libraries;
  }

  // The section's genres, merged by their Swedish name, over its libraries:
  // [{ name, icon, key, ids: [[lib, ids]] }].
  let genreList = null;
  async function genres() {
    if (genreList) return genreList;
    const by = new Map();
    for (const lib of await libs()) {
      if (lib.type !== 'movies' && lib.type !== 'tvshows') continue;
      for (const g of await J.genres(lib).catch(() => [])) {
        const { name, icon } = genreOf(g.name);
        const key = slug(name);
        if (!by.has(key)) by.set(key, { name, icon, key, ids: new Map() });
        const one = by.get(key);
        if (!one.ids.has(lib)) one.ids.set(lib, []);
        one.ids.get(lib).push(g.id);
      }
    }
    genreList = [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    return genreList;
  }

  // What a library holds, kept for the column at the left (its folders).
  const held = new Map();
  function browse(lib) {
    if (!held.has(lib.id)) held.set(lib.id, J.browse(lib).catch((e) => { held.delete(lib.id); throw e; }));
    return held.get(lib.id);
  }

  // Jellyfin's collections (box sets), for films, kept.
  let boxsets = null;
  function collections() {
    if (!boxsets) boxsets = SECTION_KEY === 'movies' ? J.collections().catch(() => []) : Promise.resolve([]);
    return boxsets;
  }

  // The column at the left: what to watch, all of it, the collections when
  // there are any, the genres, and the libraries when there are more than one.
  async function rail([what, id]) {
    const [all, gs, cs] = await Promise.all([libs(), genres(), collections()]);
    const top = [{ label: 'Upptäck', icon: 'spark', href: '#/', key: 'rail:start', active: !what }];
    if (SEC.all) top.push({ label: SEC.all, icon: 'grid', href: '#/all', key: 'rail:all' });
    if (cs.length) top.push({ label: 'Samlingar', icon: 'stack', href: '#/collections', key: 'rail:collections' });
    const groups = [{ items: top }];
    if (all.length > 1) {
      groups.push({ label: 'Bibliotek', items: all.map((l) => ({ label: l.name, icon: LIB_ICON[sectionOf(l)],
        href: `#/lib/${encodeURIComponent(l.id)}`, key: `lib:${l.id}`, active: what === 'lib' && l.id === id })) });
    }
    if (gs.length) groups.push({ label: 'Genrer', items: gs.map((g) => ({ label: g.name, icon: g.icon, href: `#/genre/${encodeURIComponent(g.key)}`, key: `genre:${g.key}` })) });
    return groups;
  }

  // A section's start: what to watch now. Films: begun, added lately,
  // Jellyfin's suggestions from what was watched. Series: the next episode
  // of each begun, begun, added lately. Videos: begun, added lately, and
  // the libraries' folders (channels).
  const BECAUSE = {
    SimilarToRecentlyPlayed: (x) => `Eftersom du såg ${x}`, SimilarToLikedItem: (x) => `Liknar ${x}`,
    HasDirectorFromRecentlyPlayed: (x) => `Regi av ${x}`, HasDirectorFromLikedItem: (x) => `Regi av ${x}`,
    HasActorFromRecentlyPlayed: (x) => `Med ${x}`, HasActorFromLikedItem: (x) => `Med ${x}`,
  };
  async function start() {
    const all = await libs();
    if (!all.length) return { kind: 'message', text: `Inga bibliotek med ${SEC.name.toLowerCase()}`, hint: 'Lägg till ett i Jellyfin.' };
    const each = async (fn) => (await Promise.all(all.map((l) => fn(l).catch(() => [])))).flat();
    const [begun, latest] = await Promise.all([each((l) => J.resume(l)), each((l) => J.latest(l, 12))]);
    const sections = [];
    if (SECTION_KEY === 'tvshows') {
      const next = await each((l) => J.nextUp(l));
      const nextIds = new Set(next.map((v) => v.id));
      sections.push({ label: 'Nästa avsnitt', layout: 'shelf', shape: 'still', items: next.map(still) });
      sections.push({ label: 'Fortsätt titta', layout: 'shelf', shape: 'still', items: begun.filter((v) => !nextIds.has(v.id)).map(still) });
    } else sections.push({ label: 'Fortsätt titta', layout: 'shelf', shape: 'still', items: begun.map(still) });
    const shape = SECTION_KEY === 'homevideos' ? 'still' : 'poster';
    sections.push({ label: 'Senast tillagt', layout: 'shelf', shape, items: latest.slice(0, 12).map(shape === 'still' ? still : item) });
    if (SECTION_KEY === 'movies') {
      const recs = await each((l) => J.recommendations(l));
      for (const r of recs) {
        if (!r.items.length) continue;
        const label = (BECAUSE[r.type] || ((x) => `Liknar ${x}`))(r.because);
        sections.push({ label, layout: 'shelf', shape: 'poster', items: r.items.slice(0, 12).map(item) });
      }
    }
    if (SECTION_KEY === 'homevideos') {
      const folders = (await each((l) => browse(l))).filter((v) => v.kind === 'folder');
      sections.push({ label: 'Kanaler', layout: 'groups', items: folders.map(item) });
    }
    return { kind: 'shelf', title: SEC.name, legend: [['A', 'öppna']], sections };
  }

  // Every film or series of the section, or those of a genre, in a grid
  // (L1/R1 a letter, Sök filters, the chosen one's text under the shelves).
  function gridOf(title, found) {
    return {
      kind: 'grid', title, filter: true, shape: 'poster', columns: 6,
      legend: [['A', 'öppna'], ['L1', ''], ['R1', 'hoppa en bokstav']],
      items: found.map(item), empty: 'Inget hittades',
      count: (n, all) => (n === all ? `${all} st` : `${n} av ${all}`),
      info: (it) => {
        const v = found.find((x) => `v:${x.id}` === it.key);
        if (!v) return null;
        return { title: v.name, meta: [v.year, v.kind === 'series' && v.count ? (v.count === 1 ? '1 säsong' : `${v.count} säsonger`) : length(v.seconds), v.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · '), text: v.overview };
      },
    };
  }
  async function everything() {
    const found = (await Promise.all((await libs()).map((l) => browse(l)))).flat().filter((v) => v.kind !== 'folder');
    found.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    return gridOf(SEC.all || 'Alla', found);
  }
  async function collectionsView() {
    const cs = await collections();
    return { ...gridOf('Samlingar', cs), empty: 'Inga samlingar i Jellyfin.' };
  }
  async function genre(key) {
    const g = (await genres()).find((x) => x.key === key);
    if (!g) return gridOf(key, []);
    const found = (await Promise.all([...g.ids].map(([lib, ids]) => J.byGenre(lib, ids)))).flat();
    found.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    return gridOf(g.name, found);
  }

  async function library(id) {
    const all = await libs();
    const lib = all.find((l) => l.id === id) || all[0];
    if (!lib) return { kind: 'message', text: 'Inga bibliotek med film eller serier', hint: 'Lägg till ett i Jellyfin.' };
    const [begun, found] = await Promise.all([J.resume(lib).catch(() => []), browse(lib)]);
    return {
      kind: 'shelf', title: lib.name, legend: [['A', 'öppna']],
      sections: [{ label: 'Fortsätt titta', layout: 'shelf', shape: 'still', items: begun.map(still) }, ...sections(found, null, { folders: false })],
    };
  }

  async function folder(id) {
    const [what, found] = await Promise.all([J.video(id), J.browse({ id, type: 'mixed' })]);
    return { kind: 'shelf', title: what.name, legend: [['A', 'öppna']], sections: sections(found, null) };
  }

  async function search(term) {
    const found = await J.searchVideos(term, SEC.types);
    const head = { kind: 'shelf', title: M.views.searchTitle(term), count: M.views.hits(found.length), legend: [['A', 'öppna']] };
    if (!found.length) return { ...head, none: M.views.NONE };
    return { ...head, sections: sections(found, null) };
  }

  // A series: its poster and overview, the seasons as tabs, a season's episodes.
  async function series(id, seasonId) {
    const [show, seasons] = await Promise.all([J.video(id), J.seasons(id)]);
    // The season asked for, else the first begun but not finished, else the first.
    const season = seasons.find((s) => s.id === seasonId) || seasons.find((s) => !s.played && s.percent) || seasons[0];
    const episodes = season ? await J.episodes(id, season.id) : [];
    // The first episode not yet seen, unless the focus was somewhere before.
    const next = episodes.find((v) => !v.played);
    return {
      kind: 'detail', title: 'Serie', legend: [['A', 'öppna']],
      shape: 'poster', picture: show.poster, mock: 'dvd', name: show.name, short: true, text: show.overview,
      meta: [show.year, seasons.length === 1 ? '1 säsong' : `${seasons.length} säsonger`, show.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · '),
      parts: seasons.map((s) => ({
        label: s.name, key: `season:${s.id}`, active: season && s.id === season.id,
        href: `#/series/${encodeURIComponent(id)}/${encodeURIComponent(s.id)}`,
      })),
      rows: {
        look: 'still', empty: 'Inga avsnitt.',
        items: episodes.map((v) => ({
          key: `v:${v.id}`, href: href(v), picture: v.still, mock: 'still', progress: progress(v), played: v.played,
          title: `${v.episode != null ? `${v.episode}. ` : ''}${v.name}`, meta: v.overview, detail: v.played ? 'Sedd' : length(v.seconds),
        })),
      },
      focus: next ? `v:${next.id}` : null,
    };
  }

  // A film, an episode or a clip: what it is, and how to play it. The sound
  // and subtitles chosen last time in this series (or film), by language,
  // come before Jellyfin's defaults; a language this one lacks keeps them.
  async function one(id) {
    const v = await J.video(id);
    if (v.kind === 'series') return series(v.id, null);
    const chose = await video.lastChoice(v.seriesId || v.id);
    const tracks = { audio: v.defaultAudio, subtitle: v.defaultSubtitle };
    const a = chose.audio && v.audio.find((t) => t.language === chose.audio);
    if (a) tracks.audio = a.index;
    if (chose.subtitles === 'no') tracks.subtitle = -1;
    else {
      const s = chose.subtitles && v.subtitles.find((t) => t.language === chose.subtitles);
      if (s) tracks.subtitle = s.index;
    }
    const begun = v.position > 0 && !v.played;
    const play = (at) => () => video.play({ id: v.id, name: v.name, series: v.kind === 'episode' ? v.series : '' }, at, tracks);
    const buttons = [{ label: begun ? `Fortsätt från ${clock(v.position)}` : 'Spela', primary: true, key: 'play', run: play(begun ? v.position : 0) }];
    if (begun) buttons.push({ label: 'Spela från början', key: 'again', run: play(0) });
    // Sound and subtitles: A steps to the next choice.
    const choices = [];
    if (v.audio.length > 1) {
      choices.push({ label: 'Ljud', key: 'audio', value: tracks.audio, change: (x) => { tracks.audio = x; },
        options: v.audio.map((t) => ({ value: t.index, label: t.label })) });
    }
    if (v.subtitles.length) {
      choices.push({ label: 'Undertexter', key: 'subtitle', value: tracks.subtitle, change: (x) => { tracks.subtitle = x; },
        options: [{ value: -1, label: 'Av' }, ...v.subtitles.map((t) => ({ value: t.index, label: t.label }))] });
    }
    return {
      kind: 'detail', title: v.kind === 'episode' ? v.series || 'Avsnitt' : v.kind === 'movie' ? 'Film' : 'Klipp',
      legend: [['A', 'välj']],
      shape: v.kind === 'movie' ? 'poster' : 'still', picture: v.kind === 'movie' ? v.poster : v.still, mock: v.kind === 'movie' ? 'dvd' : 'still',
      name: v.name, text: v.overview,
      meta: [episodeCode(v), v.year, length(v.seconds), v.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · '),
      buttons, choices, focus: 'play',
    };
  }

  function view([what, arg, arg2]) {
    if (what === 'item' && arg) return one(arg);
    if (what === 'series' && arg) return series(arg, arg2 || null);
    if (what === 'folder' && arg) return folder(arg);
    if (what === 'search' && arg) return search(arg);
    if (what === 'all') return everything();
    if (what === 'genre' && arg) return genre(arg);
    if (what === 'collections') return collectionsView();
    if (what === 'lib' && arg) return library(arg);
    return start();
  }

  M.libraries = M.libraries || {};
  M.libraries.film = {
    name: SEC.name, source: 'Jellyfin', search: SEC.search,
    // B leaves the page from its start; its other views go back, as Spel's
    // consoles do.
    isRoot: ([what]) => !what,
    view, rail,
  };
})(window.PioneerTV);
