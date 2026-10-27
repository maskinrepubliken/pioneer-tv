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
  const DEVICE = 'pioneer-tv';
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

  // What Chromium on the box plays as it is: container -> audio codecs.
  // Everything else (E-AC-3 in m4a, PCM in AIFF, ...) Jellyfin transcodes.
  const DIRECT = {
    mp3: ['mp3'], flac: ['flac'], m4a: ['aac'], mp4: ['aac'], aac: ['aac'],
    ogg: ['vorbis', 'opus'], oga: ['vorbis', 'opus'], opus: ['opus'], webm: ['opus', 'vorbis'], wav: ['pcm_s16le', 'pcm_s24le'],
  };
  function direct(i) {
    const src = i.MediaSources && i.MediaSources[0];
    if (!src) return false;
    const stream = (src.MediaStreams || []).find((x) => x.Type === 'Audio');
    return !!(stream && (DIRECT[(src.Container || '').toLowerCase()] || []).includes((stream.Codec || '').toLowerCase()));
  }

  function toSong(i) {
    return {
      direct: direct(i),
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

  const SONG = { Fields: 'MediaSources', EnableImageTypes: 'Primary' };

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
      : type === 'Episode' ? 'episode' : i.IsFolder ? 'folder' : 'video';
    const tags = i.ImageTags || {};
    const ud = i.UserData || {};
    const src = (i.MediaSources || [])[0];
    const streams = (src && src.MediaStreams) || [];
    const portrait = ['movie', 'series', 'season'].includes(kind);
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
    // The song as Chromium can play it: the file as it is when it can (it
    // has a length and seeks), else transcoded by Jellyfin to MP3, streamed
    // without a length (the Pi does no work either way). Jellyfin's own
    // choice through Audio/universal transcoded AAC in m4a too.
    streamUrl(song) {
      if (song.direct) return `${BASE}Audio/${song.id}/stream?${q({ static: 'true', DeviceId: DEVICE })}`;
      return `${BASE}Audio/${song.id}/universal?${q({
        UserId: userId, DeviceId: DEVICE, MaxStreamingBitrate: 320000, Container: 'mp3',
        TranscodingContainer: 'mp3', TranscodingProtocol: 'http', AudioCodec: 'mp3',
      })}`;
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
    async video(id) {
      return toVideo(await json(`Items/${id}?${q({ userId: await user(), Fields: `${VIDEO_FIELDS},MediaSources,Genres` })}`));
    },
    // Films, series, episodes and clips whose name holds the words.
    searchVideos(term) {
      return items({ searchTerm: term, IncludeItemTypes: 'Movie,Series,Episode,Video', Limit: 60,
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

    // A song played to its end, played for the user: the reports below come
    // from the box's API key, which is no user, so they count for nobody.
    async markPlayed(song) {
      return request(`UserPlayedItems/${song.id}?${q({ userId: await user() })}`, { method: 'POST' })
        .catch((e) => console.warn('jellyfin played', e));
    },
    // Tells Jellyfin what plays (its dashboard shows it). Failures are only
    // logged: the music does not depend on them.
    report(what, song, seconds) {
      const path = { start: 'Sessions/Playing', progress: 'Sessions/Playing/Progress', stop: 'Sessions/Playing/Stopped' }[what];
      const body = JSON.stringify({ ItemId: song.id, PositionTicks: Math.round((seconds || 0) * TICKS), PlayMethod: 'DirectStream', CanSeek: true });
      return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: what === 'stop' })
        .catch((e) => console.warn('jellyfin report', what, e));
    },
  };
})(window.PioneerTV);
