// Pioneer TV: the client for RomM, the source of the Spel library
// (libraries/spel.js) and of the game page (game/game.js).
//
// Every request goes to /romm/ on the page's own origin, where the daemon (or
// dev/preview.py) adds the API key and forwards to RomM; RomM itself sends no
// CORS headers and the key never reaches the browser. Knows nothing about the
// DOM. Games are trimmed to the few fields the pages show, because a console
// list from RomM is a couple of megabytes of metadata we never read.
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  const BASE = new URL('/romm/', location.origin).href;
  const LIST = 'with_filter_values=false&with_rom_id_index=false';

  // code: 'no_key' (no API key on the box), 'auth' (RomM refuses the key),
  // 'down' (RomM or the box does not answer), 'http' (anything else).
  class RommError extends Error {
    constructor(status, code) {
      super(`RomM: ${code} (${status})`);
      this.status = status;
      this.code = code;
    }
  }

  // A read that fails on the way (no answer, or RomM's own 5xx) is tried
  // again: the first calls after a quiet spell sometimes get a 500 from RomM
  // while the next one is fine (seen on the box, on the start view's virtual
  // collections). Writes are sent once.
  const RETRY_MS = [700, 2000];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function request(path, opts = {}) {
    const read = !opts.method || opts.method === 'GET';
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestOnce(path, opts);
      } catch (err) {
        if (!read || attempt >= RETRY_MS.length || err.code !== 'down') throw err;
        await sleep(RETRY_MS[attempt]);
      }
    }
  }

  async function requestOnce(path, opts) {
    let resp;
    try {
      resp = await fetch(BASE + path, opts);
    } catch {
      throw new RommError(0, 'down');
    }
    if (resp.ok) return resp;
    let code = 'http';
    if (resp.status === 503) {
      const body = await resp.json().catch(() => ({}));
      code = body.error === 'no_key' ? 'no_key' : 'down';
    } else if (resp.status === 401 || resp.status === 403) code = 'auth';
    else if (resp.status >= 500) code = 'down';
    throw new RommError(resp.status, code);
  }
  const json = async (path, opts) => (await request(path, opts)).json();

  // How many can play. RomM's player_count is "1" for most games whatever
  // they are (Contra too, with "Co-operative" and "Multiplayer" among its
  // game modes), so a count of one only counts when the modes back it up.
  // A number, "flera" (more than one, how many unknown) or null.
  const MULTI = /multiplayer|co-?operative|split screen|mmo|battle royale/i;
  function playersOf(meta) {
    const n = parseInt(String(meta.player_count || '').split(/[-–]/).pop(), 10);
    const modes = meta.game_modes || [];
    if (n > 1) return n;
    if (modes.some((m) => MULTI.test(m))) return 'flera';
    return n === 1 && modes.length ? 1 : null;   // no modes: the 1 is only RomM's default
  }

  function toGame(r) {
    const meta = r.metadatum || {};
    const released = meta.first_release_date;
    return {
      id: r.id,
      name: r.name || r.fs_name_no_ext || r.fs_name,
      sortKey: r.name_sort_key || '',   // RomM's order: lower case, no leading "The", numbers padded
      platform: r.platform_slug,
      // The small cover (204 px) shows at once; the cards swap in the big one
      // (512 px, five times the bytes) once it has loaded (shared/views.js, cover()).
      cover: r.path_cover_small ? '/romm' + r.path_cover_small : (r.path_cover_large ? '/romm' + r.path_cover_large : null),
      coverLarge: r.path_cover_large ? '/romm' + r.path_cover_large : null,
      year: released ? new Date(released).getFullYear() : null,
      players: playersOf(meta),
      summary: r.summary || '',
      lastPlayed: (r.rom_user && r.rom_user.last_played) || null,
      publisher: (meta.publishers && meta.publishers[0]) || (meta.companies && meta.companies[0]) || null,
      multiFile: !!r.has_multiple_files,
      fileCount: Array.isArray(r.files) ? r.files.length : null,   // only the single-game call lists files
      fileName: r.fs_name,
    };
  }

  function listQuery({ platformId, collection } = {}) {
    let q = LIST;
    if (platformId) q += `&platform_ids=${platformId}`;
    if (collection) q += `&${collection.kind === 'virtual' ? 'virtual_collection_id' : 'collection_id'}=${encodeURIComponent(collection.id)}`;
    return q;
  }

  async function list(query) {
    const d = await json(`api/roms?limit=1000&order_by=name&order_dir=asc&${query}`);
    return { games: d.items.map(toGame), letters: d.char_index || {} };
  }

  const props = (id, flag, keepalive) => request(`api/roms/${id}/props?${flag}=true`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: !!keepalive,
  });

  // Consoles and collections change rarely: fetched once per page, so going
  // back to the start view does not wait for them again.
  const once = (fn) => { let p = null; return () => (p = p || fn().catch((e) => { p = null; throw e; })); };

  M.romm = {
    RommError,
    base: BASE,
    platforms: once(async () => {
      const items = await json('api/platforms');
      return items.filter((p) => p.rom_count > 0)
        .map((p) => ({ id: p.id, slug: p.slug, name: p.display_name || p.name, count: p.rom_count }))
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    }),
    async recent(limit = 20) {
      const d = await json(`api/roms?last_played=true&order_by=last_played&order_dir=desc&limit=${limit}&with_char_index=false&${LIST}`);
      return d.items.map(toGame);
    },
    games(opts) { return opts && opts.search ? this.search(opts.search) : list(listQuery(opts)); },
    search(term, opts) { return list(listQuery(opts) + `&search_term=${encodeURIComponent(term)}`); },
    collections: once(async () => {
      const [own, virtual] = await Promise.all([json('api/collections'), json('api/collections/virtual?type=all')]);
      const shape = (kind) => (c) => ({ kind, id: c.id, name: c.name, count: c.rom_count ?? (c.rom_ids || []).length });
      return [...own.map(shape('own')), ...virtual.map(shape('virtual'))];
    }),
    async game(id) { return toGame(await json(`api/roms/${id}`)); },
    markPlayed(id) { return props(id, 'update_last_played'); },
    removeRecent(id, opts = {}) { return props(id, 'remove_last_played', opts.keepalive); },
  };
})(window.PioneerTV);
