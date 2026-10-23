// Pioneer TV: the Musik pages' client for Jellyfin.
//
// Every request goes to /jellyfin/ on the page's own origin, where the daemon
// (or dev/preview.py) adds the API key and forwards to Jellyfin; the key never
// reaches the browser. Who the box plays as comes from /api/jellyfin. Knows
// nothing about the DOM: songs, albums, artists and playlists are trimmed to
// the few fields the pages show.
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
      cover: image(i.Id, i.ImageTags && i.ImageTags.Primary, 400),
    };
  }

  const SONG_FIELDS = 'Fields=MediaSources&EnableImageTypes=Primary';
  const GROUP_FIELDS = 'Fields=ChildCount,PrimaryImageAspectRatio&EnableImageTypes=Primary';
  const q = (params) => Object.entries(params).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  async function items(params, shape) {
    const d = await json(`Items?${q({ userId: await user(), Recursive: 'true', ...params })}`);
    return (d.Items || []).map(shape);
  }

  M.jellyfin = {
    JellyfinError,
    user,
    async playlists() {
      const all = await items({ IncludeItemTypes: 'Playlist', SortBy: 'SortName', Fields: 'ChildCount', EnableImageTypes: 'Primary' }, (i) => ({ ...toGroup(i), mediaType: i.MediaType }));
      // Jellyfin lists video playlists too; only songs belong here.
      return all.filter((p) => !p.mediaType || p.mediaType === 'Audio');
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
        const d = await json(`Playlists/${group.id}/Items?${q({ userId: await user() })}&${SONG_FIELDS}`);
        return (d.Items || []).map(toSong);
      }
      const key = group.kind === 'album' ? { ParentId: group.id } : { ArtistIds: group.id };
      return items({ ...key, IncludeItemTypes: 'Audio', SortBy: group.kind === 'album' ? 'ParentIndexNumber,IndexNumber,SortName' : 'ProductionYear,Album,ParentIndexNumber,IndexNumber' }, toSong);
    },
    shuffleAll(limit = 300) {
      return items({ IncludeItemTypes: 'Audio', SortBy: 'Random', Limit: limit }, toSong);
    },
    async search(term) {
      const uid = await user();
      const [songs, albums, artists] = await Promise.all([
        items({ searchTerm: term, IncludeItemTypes: 'Audio', Limit: 40 }, toSong),
        items({ searchTerm: term, IncludeItemTypes: 'MusicAlbum', Limit: 30, EnableImageTypes: 'Primary' }, toGroup),
        json(`Artists?${q({ userId: uid, searchTerm: term, Limit: 20, EnableImageTypes: 'Primary' })}`).then((d) => (d.Items || []).map(toGroup)),
      ]);
      return { songs, albums, artists };
    },
    // The song as Chromium can play it: as it is when the container and codec
    // suit, else transcoded by Jellyfin to MP3 (the Pi does no work).
    streamUrl(song) {
      return `${BASE}Audio/${song.id}/universal?${q({
        UserId: userId, DeviceId: DEVICE, MaxStreamingBitrate: 320000,
        Container: 'mp3,flac,ogg,opus,webm|opus,webma,m4a,aac,mp4|aac,wav',
        TranscodingContainer: 'mp3', TranscodingProtocol: 'http', AudioCodec: 'mp3',
      })}`;
    },
    // Tells Jellyfin what plays, so "played" and play counts follow the box.
    // Failures are only logged: the music does not depend on them.
    report(what, song, seconds) {
      const path = { start: 'Sessions/Playing', progress: 'Sessions/Playing/Progress', stop: 'Sessions/Playing/Stopped' }[what];
      const body = JSON.stringify({ ItemId: song.id, PositionTicks: Math.round((seconds || 0) * TICKS), PlayMethod: 'DirectStream', CanSeek: true });
      return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: what === 'stop' })
        .catch((e) => console.warn('jellyfin report', what, e));
    },
  };
})(window.PioneerTV);
