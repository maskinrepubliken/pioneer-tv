// Pioneer TV library Film & serier: Jellyfin's films, series and clips
// (sources/jellyfin.js), drawn by the browse page (browse/page.js) and
// played on the box in mpv (players/video.js).
//
// #/ (the first library) and #/lib/<id>: "Fortsätt titta", then the
// library's films, series or clips; the libraries and a library's folders
// in the column at the left (Jellyfin's own, music left out, so a new one
// appears by itself); #/folder/<id>;
// #/series/<id>[/<season id>]: the series, its seasons as tabs, a season's
// episodes; #/item/<id>: a film, an episode or a clip, with Spela, sound
// and subtitles; #/search/<words>.
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
    if (v.kind === 'folder') return `#/folder/${encodeURIComponent(v.id)}`;
    return `#/item/${encodeURIComponent(v.id)}`;
  }

  // A film or a series: a portrait poster. An episode, a clip or something
  // begun: a 16:9 still. A folder: type only.
  function item(v) {
    const base = { key: `v:${v.id}`, href: href(v), progress: progress(v) };
    if (v.kind === 'folder') return { ...base, title: v.name, meta: v.count == null ? '' : v.count === 1 ? '1 sak' : `${v.count} saker`, style: 'prose' };
    if (v.kind === 'movie' || v.kind === 'series') {
      const meta = v.kind === 'series' && v.count ? [v.year, v.count === 1 ? '1 säsong' : `${v.count} säsonger`].filter(Boolean).join(' · ') : v.year;
      return { ...base, title: v.name, meta: meta ? String(meta) : '', picture: v.poster, shape: 'poster' };
    }
    return still(v);
  }
  function still(v) {
    return {
      key: `v:${v.id}`, href: href(v), progress: progress(v), picture: v.still, shape: 'still',
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
    if (!found.length || (!folders.length && found.every((v) => v.kind === 'folder'))) return [{ label, items: [], empty: 'Här finns inget än.' }];
    return [
      { label, layout: 'groups', items: folders },
      { label: folders.length ? null : label, layout: 'grid', columns: 6, shape: 'poster', items: posters },
      { label: folders.length || posters.length ? null : label, layout: 'grid', columns: 4, shape: 'still', items: stills },
    ];
  }

  // ------------------------------------------------------------ views
  let libraries = null;
  async function libs() {
    if (!libraries) libraries = await J.libraries();
    return libraries;
  }

  // What a library holds, kept for the column at the left (its folders).
  const held = new Map();
  function browse(lib) {
    if (!held.has(lib.id)) held.set(lib.id, J.browse(lib).catch((e) => { held.delete(lib.id); throw e; }));
    return held.get(lib.id);
  }

  // The column at the left: the libraries, and the folders of the one the
  // page is in.
  async function rail([what, id]) {
    const all = await libs();
    const lib = what === 'lib' ? all.find((l) => l.id === id) : !what ? all[0] : null;
    const folders = lib ? (await browse(lib)).filter((v) => v.kind === 'folder') : [];
    return [
      { label: 'Bibliotek', items: all.map((l) => ({ label: l.name, href: `#/lib/${encodeURIComponent(l.id)}`, key: `lib:${l.id}`, active: lib ? l.id === lib.id : false })) },
      { label: 'Mappar', items: folders.map((v) => ({ label: v.name, href: href(v), key: `v:${v.id}` })) },
    ];
  }

  async function library(id) {
    const all = await libs();
    const lib = all.find((l) => l.id === id) || all[0];
    if (!lib) return { kind: 'message', text: 'Inga bibliotek med film eller serier', hint: 'Lägg till ett i Jellyfin.' };
    const [begun, found] = await Promise.all([J.resume(lib).catch(() => []), browse(lib)]);
    return {
      kind: 'shelf', title: lib.name, legend: [['A', 'öppna']],
      sections: [{ label: 'Fortsätt titta', layout: 'row', shape: 'still', items: begun.map(still) }, ...sections(found, null, { folders: false })],
    };
  }

  async function folder(id) {
    const [what, found] = await Promise.all([J.video(id), J.browse({ id, type: 'mixed' })]);
    return { kind: 'shelf', title: what.name, legend: [['A', 'öppna']], sections: sections(found, null) };
  }

  async function search(term) {
    const found = await J.searchVideos(term);
    return { kind: 'shelf', title: 'Sök', legend: [['A', 'öppna']], sections: sections(found, `Träffar för ”${term}”`) };
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
      shape: 'poster', picture: show.poster, name: show.name, short: true, text: show.overview,
      meta: [show.year, seasons.length === 1 ? '1 säsong' : `${seasons.length} säsonger`, show.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · '),
      parts: seasons.map((s) => ({
        label: s.name, key: `season:${s.id}`, active: season && s.id === season.id,
        href: `#/series/${encodeURIComponent(id)}/${encodeURIComponent(s.id)}`,
      })),
      rows: {
        look: 'still', empty: 'Inga avsnitt.',
        items: episodes.map((v) => ({
          key: `v:${v.id}`, href: href(v), picture: v.still, progress: progress(v), played: v.played,
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
      shape: v.kind === 'movie' ? 'poster' : 'still', picture: v.kind === 'movie' ? v.poster : v.still,
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
    return library(what === 'lib' ? arg : null);
  }

  M.libraries = M.libraries || {};
  M.libraries.film = {
    name: 'Film & serier', source: 'Jellyfin', search: 'Sök film eller serie…',
    // B leaves the page from any library tab.
    isRoot: ([what]) => !what || what === 'lib',
    view, rail,
  };
})(window.PioneerTV);
