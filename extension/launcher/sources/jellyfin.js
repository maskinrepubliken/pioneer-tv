// Pioneer TV: the client for Jellyfin, the source of the Musik and Film &
// serier libraries (libraries/musik.js, libraries/film.js).
//
// Every request goes to /jellyfin/ on the page's own origin, where the daemon
// (or dev/preview.py) adds the API key and forwards to Jellyfin; the key never
// reaches the browser. Who the box plays as comes from /api/jellyfin. Knows
// nothing about the DOM: songs, albums, artists, playlists, films, series and
// episodes are trimmed to the few fields the pages show.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const BASE = new URL('/jellyfin/', location.origin).href;
  const TICKS = 10000000;             // Jellyfin counts time in 100 ns ticks

  // code: 'no_key' (no API key on the box), 'no_user' (the named user does
  // not exist), 'auth' (Jellyfin refuses the key), 'down' (Jellyfin or the
  // box does not answer), 'http' (anything else).
  class JellyfinError extends Error {
    constructor(status, code) {
      super(`Jellyfin: ${code} (${status})`);
      this.status = status;
      this.code = code;
    }
  }

  async function request(path, opts = {}) {
    let resp;
    try {
      resp = await fetch(BASE + path, opts);
    } catch {
      throw new JellyfinError(0, 'down');
    }
    if (resp.ok) return resp;
    let code = 'http';
    if (resp.status === 503) {
      const body = await resp.json().catch(() => ({}));
      code = body.error === 'no_key' ? 'no_key' : 'down';
    } else if (resp.status === 401 || resp.status === 403) code = 'auth';
    else if (resp.status >= 500) code = 'down';
    throw new JellyfinError(resp.status, code);
  }
  const json = async (path, opts) => (await request(path, opts)).json();

  let userId = null;
  async function user() {
    if (userId) return userId;
    let d;
    try {
      d = await (await fetch(new URL('/api/jellyfin', location.origin))).json();
    } catch {
      throw new JellyfinError(0, 'down');
    }
    if (!d.ok) throw new JellyfinError(0, d.error || 'down');
    userId = d.user_id;
    return userId;
  }

  const image = (id, tag, size) => (id && tag ? `${BASE}Items/${id}/Images/Primary?fillHeight=${size}&fillWidth=${size}&quality=90&tag=${tag}` : null);

  function toSong(i) {
    return {
      id: i.Id,
      name: i.Name,
      artist: (i.Artists && i.Artists.join(', ')) || i.AlbumArtist || '',
      album: i.Album || '',
      albumId: i.AlbumId || null,
      seconds: i.RunTimeTicks ? i.RunTimeTicks / TICKS : null,
      // A song without a picture of its own shows its album's.
      cover: image(i.Id, i.ImageTags && i.ImageTags.Primary, 600) || image(i.AlbumId, i.AlbumPrimaryImageTag, 600),
      thumb: image(i.Id, i.ImageTags && i.ImageTags.Primary, 120) || image(i.AlbumId, i.AlbumPrimaryImageTag, 120),
    };
  }

  // An album, a playlist or an artist: what a card and a list's head show.
  function toGroup(i) {
    return {
      id: i.Id,
      kind: i.Type === 'MusicAlbum' ? 'album' : i.Type === 'Playlist' ? 'playlist' : 'artist',
      name: i.Name,
      artist: i.AlbumArtist || (i.AlbumArtists && i.AlbumArtists.map((a) => a.Name).join(', ')) || '',
      year: i.ProductionYear || null,
      count: i.ChildCount ?? i.SongCount ?? null,
      seconds: i.RunTimeTicks ? i.RunTimeTicks / TICKS : null,
      cover: image(i.Id, i.ImageTags && i.ImageTags.Primary, 280),     // a card, or a list's 17rem head
    };
  }

  const SONG = { EnableImageTypes: 'Primary' };

  // ------------------------------------------------------------ video
  // Libraries that are not for the Film & serier pages.
  const SKIP_VIEWS = new Set(['music', 'playlists', 'books', 'photos', 'livetv', 'audiobooks']);
  const VIDEO_FIELDS = 'Overview,ProductionYear,ChildCount';
  const picture = (id, kind, tag, width) => (id && tag ? `${BASE}Items/${id}/Images/${kind}?fillWidth=${width}&quality=85&tag=${tag}` : null);

  // A track as the detail page lists it and mpv picks it: index is
  // Jellyfin's (over all streams), external ones are separate files.
  function toTrack(s) {
    const label = s.DisplayTitle || [s.Language, s.Codec].filter(Boolean).join(' ') || `Spår ${s.Index}`;
    return { index: s.Index, label, language: s.Language || '', external: !!s.IsExternal, codec: (s.Codec || '').toLowerCase() };
  }

  // A film, a series, a season, an episode, a clip or a folder.
  function toVideo(i) {
    const type = i.Type;
    const kind = type === 'Movie' ? 'movie' : type === 'Series' ? 'series' : type === 'Season' ? 'season'
      : type === 'Episode' ? 'episode' : type === 'BoxSet' ? 'collection' : i.IsFolder ? 'folder' : 'video';
    const tags = i.ImageTags || {};
    const ud = i.UserData || {};
    const src = (i.MediaSources || [])[0];
    const streams = (src && src.MediaStreams) || [];
    const portrait = ['movie', 'series', 'season', 'collection'].includes(kind);
    // Sized for the 1280x720 screen: a poster is at most 16rem wide (256 px,
    // on the detail page), a still 24rem (384 px). Larger only costs the
    // Pi decoding time while the grid scrolls.
    const backdrop = picture(i.Id, 'Backdrop', (i.BackdropImageTags || [])[0], 480)
      || picture(i.ParentBackdropItemId, 'Backdrop', (i.ParentBackdropImageTags || [])[0], 480);
    return {
      id: i.Id,
      kind,
      name: i.Name,
      year: i.ProductionYear || null,
      overview: i.Overview || '',
      genres: i.Genres || [],
      seconds: i.RunTimeTicks ? i.RunTimeTicks / TICKS : null,
      position: ud.PlaybackPositionTicks ? ud.PlaybackPositionTicks / TICKS : 0,
      played: !!ud.Played,
      percent: ud.PlayedPercentage || 0,
      count: i.ChildCount ?? null,
      series: i.SeriesName || '',
      seriesId: i.SeriesId || null,
      seasonId: i.SeasonId || null,
      season: i.ParentIndexNumber ?? null,
      episode: i.IndexNumber ?? null,
      // Portrait for films, series and seasons; a 16:9 still for the rest
      // (a film's or a series' Primary is its poster, so not that).
      poster: picture(i.Id, 'Primary', tags.Primary, 280) || picture(i.SeriesId, 'Primary', i.SeriesPrimaryImageTag, 280),
      still: (portrait ? null : picture(i.Id, 'Primary', tags.Primary, 480)) || picture(i.Id, 'Thumb', tags.Thumb, 480) || backdrop,
      backdrop,
      sourceId: src ? src.Id : null,
      audio: streams.filter((s) => s.Type === 'Audio').map(toTrack),
      subtitles: streams.filter((s) => s.Type === 'Subtitle').map(toTrack),
      // Chosen by Jellyfin from the user's own settings (language, subtitle mode).
      defaultAudio: src && src.DefaultAudioStreamIndex != null ? src.DefaultAudioStreamIndex : null,
      defaultSubtitle: src && src.DefaultSubtitleStreamIndex != null ? src.DefaultSubtitleStreamIndex : -1,
    };
  }
  const q = (params) => Object.entries(params).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  async function items(params, shape) {
    const d = await json(`Items?${q({ userId: await user(), Recursive: 'true', ...params })}`);
    return (d.Items || []).map(shape);
  }

  M.jellyfin = {
    JellyfinError,
    user,
    // Jellyfin's MediaType says "Unknown" for most playlists of songs (seen on
    // the server, 12.1), so it cannot tell them apart: every playlist that
    // has something in it is shown.
    async playlists() {
      const all = await items({ IncludeItemTypes: 'Playlist', SortBy: 'SortName', Fields: 'ChildCount', EnableImageTypes: 'Primary' }, toGroup);
      return all.filter((p) => p.count !== 0);
    },
    albums(opts = {}) {
      return items({ IncludeItemTypes: 'MusicAlbum', SortBy: opts.artistId ? 'ProductionYear,SortName' : 'SortName',
        AlbumArtistIds: opts.artistId, Fields: 'ChildCount', EnableImageTypes: 'Primary' }, toGroup);
    },
    async artists() {
      const d = await json(`Artists/AlbumArtists?${q({ userId: await user(), SortBy: 'SortName', Fields: 'ChildCount', EnableImageTypes: 'Primary' })}`);
      return (d.Items || []).map(toGroup);
    },
    async item(id) {
      return toGroup(await json(`Items/${id}?${q({ userId: await user(), Fields: 'ChildCount' })}`));
    },
    // A playlist in its own order, an album in disc and track order, an artist's songs album by album.
    async songs(group) {
      if (group.kind === 'playlist') {
        const d = await json(`Playlists/${group.id}/Items?${q({ userId: await user(), ...SONG })}`);
        return (d.Items || []).map(toSong);
      }
      const key = group.kind === 'album' ? { ParentId: group.id } : { ArtistIds: group.id };
      return items({ ...SONG, ...key, IncludeItemTypes: 'Audio', SortBy: group.kind === 'album' ? 'ParentIndexNumber,IndexNumber,SortName' : 'ProductionYear,Album,ParentIndexNumber,IndexNumber' }, toSong);
    },
    shuffleAll(limit = 300) {
      return items({ ...SONG, IncludeItemTypes: 'Audio', SortBy: 'Random', Limit: limit }, toSong);
    },
    async search(term) {
      const uid = await user();
      const [songs, albums, artists] = await Promise.all([
        items({ ...SONG, searchTerm: term, IncludeItemTypes: 'Audio', Limit: 40 }, toSong),
        items({ searchTerm: term, IncludeItemTypes: 'MusicAlbum', Limit: 30, EnableImageTypes: 'Primary' }, toGroup),
        json(`Artists?${q({ userId: uid, searchTerm: term, Limit: 20, EnableImageTypes: 'Primary' })}`).then((d) => (d.Items || []).map(toGroup)),
      ]);
      return { songs, albums, artists };
    },
    // ---------------------------------------------------------- film and series
    // Jellyfin's own libraries, music and what is not video left out, so a
    // library added in Jellyfin shows up as a tab by itself.
    async libraries() {
      const d = await json(`UserViews?${q({ userId: await user() })}`);
      return (d.Items || []).filter((v) => !SKIP_VIEWS.has((v.CollectionType || '').toLowerCase()))
        .map((v) => ({ id: v.Id, name: v.Name, type: (v.CollectionType || 'mixed').toLowerCase() }));
    },
    // A library's (or a folder's) cards: films, series, or what a home video
    // library holds (folders first).
    browse(lib) {
      const kind = { movies: 'Movie', tvshows: 'Series' }[lib.type];
      const params = kind ? { IncludeItemTypes: kind, Recursive: 'true', SortBy: 'SortName' }
        : { Recursive: 'false', SortBy: 'IsFolder,SortName', SortOrder: 'Descending,Ascending' };
      return items({ ParentId: lib.id, ...params, Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' }, toVideo);
    },
    // Begun but not finished, latest first.
    async resume(lib) {
      const d = await json(`UserItems/Resume?${q({ userId: await user(), ParentId: lib.id, MediaTypes: 'Video', Limit: 16,
        Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' })}`);
      return (d.Items || []).map(toVideo);
    },
    // What a library holds of one kind (films, series), in some genres
    // (ids: a genre can be there twice, under its English and its Swedish
    // name), by name.
    byGenre(lib, ids) {
      const kind = { movies: 'Movie', tvshows: 'Series' }[lib.type];
      return items({ ParentId: lib.id, IncludeItemTypes: kind, GenreIds: ids.join(','), SortBy: 'SortName',
        Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' }, toVideo);
    },
    // A folder's newest few videos (a channel's card, its pile).
    firstVideos(folderId, n = 6) {
      return items({ ParentId: folderId, IncludeItemTypes: 'Video,Movie,Episode', SortBy: 'DateCreated,SortName', SortOrder: 'Descending',
        Limit: n, Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' }, toVideo);
    },
    // Jellyfin's collections (box sets), the empty left out.
    collections() {
      return items({ IncludeItemTypes: 'BoxSet', SortBy: 'SortName', Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary' }, toVideo)
        .then((all) => all.filter((c) => c.count !== 0));
    },
    // A library's genres: [{ id, name }].
    async genres(lib) {
      const kind = { movies: 'Movie', tvshows: 'Series' }[lib.type];
      const d = await json(`Genres?${q({ userId: await user(), ParentId: lib.id, IncludeItemTypes: kind, Recursive: 'true', SortBy: 'SortName' })}`);
      return (d.Items || []).map((g) => ({ id: g.Id, name: g.Name }));
    },
    // Added lately, newest first (a series: once, for its new episodes).
    async latest(lib, limit = 18) {
      const d = await json(`Items/Latest?${q({ userId: await user(), ParentId: lib.id, Limit: limit,
        Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' })}`);
      return (Array.isArray(d) ? d : d.Items || []).map(toVideo);
    },
    // Jellyfin's suggestions for a film library, from what was watched:
    // [{ type, because, items }] (type: SimilarToRecentlyPlayed,
    // SimilarToLikedItem, HasDirectorFromRecentlyPlayed,
    // HasActorFromRecentlyPlayed, ...; because: the film or person).
    async recommendations(lib) {
      const d = await json(`Movies/Recommendations?${q({ userId: await user(), ParentId: lib.id, categoryLimit: 3, itemLimit: 12,
        Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' })}`);
      return (Array.isArray(d) ? d : []).map((c) => ({ type: c.RecommendationType, because: c.BaselineItemName, items: (c.Items || []).map(toVideo) }));
    },
    // The next episode of each series begun.
    async nextUp(lib) {
      const d = await json(`Shows/NextUp?${q({ userId: await user(), ParentId: lib.id, Limit: 16,
        Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' })}`);
      return (d.Items || []).map(toVideo);
    },
    async video(id) {
      return toVideo(await json(`Items/${id}?${q({ userId: await user(), Fields: `${VIDEO_FIELDS},MediaSources,Genres` })}`));
    },
    // Films, series, episodes and clips whose name holds the words.
    searchVideos(term, types = 'Movie,Series,Episode,Video') {
      return items({ searchTerm: term, IncludeItemTypes: types, Limit: 60,
        Fields: VIDEO_FIELDS, EnableImageTypes: 'Primary,Thumb,Backdrop' }, toVideo);
    },
    async seasons(seriesId) {
      const d = await json(`Shows/${seriesId}/Seasons?${q({ userId: await user(), Fields: VIDEO_FIELDS })}`);
      return (d.Items || []).map(toVideo);
    },
    async episodes(seriesId, seasonId) {
      const d = await json(`Shows/${seriesId}/Episodes?${q({ userId: await user(), SeasonId: seasonId, Fields: VIDEO_FIELDS })}`);
      return (d.Items || []).map(toVideo);
    },

  };
})(window.PioneerTV);
