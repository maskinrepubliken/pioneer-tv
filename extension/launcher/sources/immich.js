// Pioneer TV: the client for Immich, the source of the Bilder library
// (libraries/bilder.js) and of the picture viewer (players/photo.js).
//
// Every request goes to /immich/ on the page's own origin, where the daemon
// (or dev/preview.py) adds the API key and forwards to Immich (immich.py
// says what it may reach: reading only). Knows nothing about the DOM. A
// picture or a clip, as the pages take it:
//
//   { id, video, taken, seconds, favorite, ratio }
//
// taken: when it was taken, in the place's own time (an ISO date to read as
// UTC, as Immich's localDateTime); seconds: a clip's length.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const BASE = new URL('/immich/', location.origin).href;

  // code: 'no_key', 'auth', 'down' or 'http', as RomM's and Jellyfin's.
  class ImmichError extends Error {
    constructor(status, code) {
      super(`Immich: ${code} (${status})`);
      this.status = status;
      this.code = code;
    }
  }

  async function request(path, opts = {}) {
    let resp;
    try {
      resp = await fetch(BASE + path, opts);
    } catch {
      throw new ImmichError(0, 'down');
    }
    if (resp.ok) return resp;
    let code = 'http';
    if (resp.status === 503) {
      const body = await resp.json().catch(() => ({}));
      code = body.error === 'no_key' ? 'no_key' : 'down';
    } else if (resp.status === 401 || resp.status === 403) code = 'auth';
    else if (resp.status >= 500) code = 'down';
    throw new ImmichError(resp.status, code);
  }
  const json = async (path, opts) => (await request(path, opts)).json();
  const post = (path, body) => json(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // A time in the place's own time, written as Immich's localDateTime is
  // (an ISO date read as UTC): the timeline gives the time and the offset.
  const local = (iso, hours) => (iso ? new Date(Date.parse(iso) + (hours || 0) * 3600000).toISOString() : null);

  const asset = (a) => ({
    id: a.id, video: a.type === 'VIDEO', taken: a.localDateTime || a.fileCreatedAt || null,
    seconds: a.duration ? a.duration / 1000 : 0, favorite: !!a.isFavorite,
    ratio: a.width && a.height ? a.width / a.height : null,
  });

  // A search, page by page (a thousand a page) up to limit: the newest first.
  async function every(filter, limit = 5000) {
    const out = [];
    let cursor;
    do {
      const r = await post('api/search/metadata', { ...filter, size: 1000, ...(cursor ? { cursor } : {}) });
      const page = (r.assets && r.assets.items) || [];
      out.push(...page.map(asset));
      cursor = r.assets && r.assets.nextCursor;
    } while (cursor && out.length < limit);
    return out;
  }

  // What changes rarely: fetched once per page.
  const once = (fn) => { let p = null; return () => (p = p || fn().catch((e) => { p = null; throw e; })); };

  M.immich = {
    ImmichError,
    // A picture of one, by its id: 'thumbnail' (small, the grids), 'preview'
    // (about the screen's size) or 'fullsize'.
    picture: (id, size = 'thumbnail') => `/immich/api/assets/${encodeURIComponent(id)}/thumbnail?size=${size}`,
    face: (id) => `/immich/api/people/${encodeURIComponent(id)}/thumbnail`,
    // The albums, the one changed last first: { id, name, count, cover }.
    albums: once(async () => (await json('api/albums'))
      .map((a) => ({ id: a.id, name: a.albumName, count: a.assetCount, cover: a.albumThumbnailAssetId, last: a.endDate || a.updatedAt }))
      .sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')))),
    async album(id) {
      const [a, assets] = await Promise.all([json(`api/albums/${encodeURIComponent(id)}`), every({ albumIds: [id] })]);
      return { name: a.albumName, assets };
    },
    // The timeline's months, the newest first: { month: '2024-05-01', count };
    // with a partner's pictures (Immich's partner sharing; the searches have
    // them already).
    months: once(async () => (await json('api/timeline/buckets?visibility=timeline&withPartners=true&order=desc'))
      .map((b) => ({ month: String(b.timeBucket).slice(0, 10), count: b.count }))),
    // A month's pictures and clips, the newest first (Immich gives them as
    // columns: a list for each field).
    async month(month) {
      const c = await json(`api/timeline/bucket?visibility=timeline&withPartners=true&order=desc&timeBucket=${encodeURIComponent(month)}`);
      return (c.id || []).map((id, i) => ({
        id, video: c.isImage ? !c.isImage[i] : false, taken: local(c.fileCreatedAt && c.fileCreatedAt[i], c.localOffsetHours && c.localOffsetHours[i]),
        seconds: c.duration && c.duration[i] ? c.duration[i] / 1000 : 0, favorite: !!(c.isFavorite && c.isFavorite[i]),
        ratio: c.ratio ? c.ratio[i] : null,
      }));
    },
    // The people, named or not (not those hidden in Immich), as Immich
    // orders them: { id, name }, name '' for one without.
    people: once(async () => ((await json('api/people?size=500')).people || [])
      .filter((p) => !p.isHidden).map((p) => ({ id: p.id, name: p.name || '' }))),
    async person(id) {
      const [p, assets] = await Promise.all([json(`api/people/${encodeURIComponent(id)}`), every({ personIds: [id] })]);
      return { name: p.name, assets };
    },
    // Today's memories, "för X år sedan": { id, year, assets } (Immich keeps
    // the coming days' and the past days' too: for= asks for today's).
    memories: once(async () => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return (await json(`api/memories?for=${today}`))
        .filter((m) => m.type === 'on_this_day' && (m.assets || []).length)
        .map((m) => ({ id: m.id, year: m.data && m.data.year, assets: m.assets.map(asset) }))
        .sort((a, b) => (b.year || 0) - (a.year || 0));
    }),
    favorites: () => every({ isFavorite: true }),
    // Immich's search by what is in the picture (its smart search).
    async search(words) {
      const r = await post('api/search/smart', { query: words, size: 200, language: 'sv' });
      return ((r.assets && r.assets.items) || []).map(asset);
    },
    // Whose libraries there are: one's own and a partner's (Immich's
    // partner sharing), by the owner's id.
    owners: once(async () => {
      const [me, partners] = await Promise.all([json('api/users/me'), json('api/partners?direction=shared-with').catch(() => [])]);
      const out = new Map([[me.id, me.name || me.email]]);
      for (const p of partners || []) out.set(p.id, p.name || p.email);
      return out;
    }),
    // One, with what the viewer says of it: when, where, whose, its text.
    async details(id) {
      const [a, owners] = await Promise.all([json(`api/assets/${encodeURIComponent(id)}`), this.owners().catch(() => new Map())]);
      const exif = a.exifInfo || {};
      return {
        ...asset(a), city: exif.city || '', country: exif.country || '', text: exif.description || '',
        people: (a.people || []).map((p) => p.name).filter(Boolean),
        camera: [exif.make, exif.model].filter(Boolean).join(' '), file: a.originalFileName || '',
        owner: owners.get(a.ownerId) || (a.owner && a.owner.name) || '',
        width: a.width || exif.exifImageWidth || null, height: a.height || exif.exifImageHeight || null,
      };
    },
  };
})(window.PioneerTV);
