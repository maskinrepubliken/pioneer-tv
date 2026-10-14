# Spel (RomM frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gamepad-driven pages in the Pioneer TV extension for browsing and playing the RomM library, with our own EmulatorJS player and pause panel.

**Architecture:** Two extension pages (`spel.html` browse, `spela.html` play) call RomM only through a same-origin `/romm/` proxy that adds the API key: in the daemon on the box, in `dev/preview.py` on a laptop. The path filtering and header logic live in one stdlib-only module, `pioneertv/romm.py`, shared by both proxies. The page-side API client is `romm.js`.

**Tech Stack:** Vanilla JS and CSS on the existing `M = window.PioneerTV` modules (bridge, spatial-nav, keyboard, hud, game); Python 3.11, aiohttp (daemon), `http.server` (preview), `unittest`.

**Spec:** `docs/superpowers/specs/2026-10-14-spel-romm-frontend-design.md`

## Global Constraints

- UI text is Swedish. Copy fixed by the spec is used verbatim: "Senast spelade", "Konsoler", "Samlingar", "Borttaget · X ångra", "Fortsätt spela", "Spara läge", "Ladda läge", "Starta om", "TV-volym", "även L2/R2", "Avsluta och spara", "Sparningen misslyckades", "Försök igen", "Avsluta ändå", "RomM svarar inte", "Lägg in en API-nyckel för RomM under Inställningar → RomM", "API-nyckeln godtas inte", "Den här konsolen går inte att spela här än".
- Design: tokens from `content/tokens.css`, primitives from `content/paper.css`, `html { font-size: 1.45vw }` on a 1280x720 canvas, focus = `outline: 0.25rem solid var(--pioneertv-focus); outline-offset: 0.3rem` plus a 0.45rem ochre band, no transitions or animations.
- Comment style: a short prose header per file saying what it is and why, like `radio.js`; English comments.
- The API key never reaches the browser. Pages fetch `/romm/...` relative to their own origin: `new URL('/romm/', location.origin)` on the daemon (`/ext/launcher/...`) and the preview (`/ext/launcher/...`) alike.
- On the box the extension is loaded from `chrome-extension://`, not from the daemon. So the Spel tile URL is the daemon's `http://127.0.0.1:8765/ext/launcher/spel.html?tv=1`, which keeps the pages same-origin with the proxy. The content scripts still inject there (they match `<all_urls>`).
- Proxy forwards only paths starting `api/` or `assets/`, after rejecting any `..` segment; anything else is 404. No key → 503 `{"error": "no_key"}`.
- Cores: `nes` → `fceumm`, `snes` → `snes9x`, `n64` → `mupen64plus_next`.
- Undo window for removal: 5000 ms.

## Review Focus

1. A game whose name starts with a digit or a non-ASCII letter (Å/Ä/Ö, "3 Ninjas"): letter jump must still land somewhere sensible. Test in Task 6 (`letterKey`).
2. Leaving the Spel page (Home, Guide-hold) within 5 s of removing a game: the removal must still reach RomM. Test in Task 5 (pagehide flush).
3. A ROM with several files (`has_multiple_files`): the player must not fetch a wrong file and silently run nothing. Test in Task 7 (`romFileUrl` refuses it with the "går inte att spela" message).
4. Quitting while RomM is down: never return to the browse page without the user choosing "Avsluta ändå". Test in Task 8.
5. A RomM path with a query string or URL-encoded `..` (`%2e%2e`) through the proxy must not escape `api/`/`assets/`. Test in Task 1.

---

### Task 1: Shared proxy logic, RomM settings

**Files:**
- Create: `daemon/pioneertv/romm.py`
- Create: `daemon/tests/__init__.py` (empty), `daemon/tests/test_romm.py`
- Modify: `daemon/pioneertv/config.py` (defaults: add `"romm": {"url": "", "api_key": ""}` next to `"remote"`)
- Modify: `daemon/pioneertv/settings.py` (SCHEMA: new section after `remote`)

**Interfaces:**
- Produces: `target_url(base: str, path: str, query: str = "") -> str | None` — `base` like `http://100.123.142.8:8090` (trailing slash tolerated), `path` is what follows `/romm/`, already URL-decoded by the server. Returns `None` for an empty base, a path not starting `api/` or `assets/`, or any `..` segment (checked after `urllib.parse.unquote`).
- Produces: `request_headers(incoming: Mapping[str, str], key: str) -> dict[str, str]` — keeps only `Content-Type`, `Content-Length`, `Accept`, `Range`, `If-None-Match`, `If-Modified-Since` (case-insensitive), adds `Authorization: Bearer <key>`.
- Produces: `RESPONSE_HEADERS: frozenset[str]` — lowercase names copied back to the browser: `content-type`, `content-length`, `content-range`, `accept-ranges`, `etag`, `last-modified`, `cache-control`.
- Produces: settings section `{"id": "romm", "title": "RomM", "fields": [{"path": "romm.url", "type": "text", "label": "Adress till RomM"}, {"path": "romm.api_key", "type": "text", "label": "API-nyckel", "secret": True}]}`.

- [ ] **Step 1: Write the failing tests** in `daemon/tests/test_romm.py` (unittest):

```python
B = "http://romm:8090"
def test_api_path(self): self.assertEqual(romm.target_url(B, "api/platforms"), B + "/api/platforms")
def test_query_kept(self): self.assertEqual(romm.target_url(B + "/", "api/roms", "limit=5"), B + "/api/roms?limit=5")
def test_assets_path(self): self.assertEqual(romm.target_url(B, "assets/emulatorjs/data/loader.js"), B + "/assets/emulatorjs/data/loader.js")
def test_other_paths_refused(self):
    for p in ["", "login", "api", "apix/a", "/api/x", "token"]: self.assertIsNone(romm.target_url(B, p), p)
def test_dotdot_refused(self):
    for p in ["api/../login", "assets/%2e%2e/x", "api/a/..", "assets/..%2fx"]: self.assertIsNone(romm.target_url(B, p), p)
def test_no_base(self): self.assertIsNone(romm.target_url("", "api/platforms"))
def test_headers_filtered_and_key_added(self):
    h = romm.request_headers({"content-type": "application/json", "Cookie": "x", "Origin": "y", "Range": "bytes=0-"}, "k1")
    self.assertEqual(h, {"Content-Type": "application/json", "Range": "bytes=0-", "Authorization": "Bearer k1"})
def test_settings_hide_key(self):
    cfg = config_with({"romm": {"url": B, "api_key": "secret"}})   # helper: deep copy of config.DEFAULTS + overrides
    item = find_field(settings.describe(cfg), "romm.api_key")
    self.assertEqual((item["value"], item["is_set"]), ("", True))
```

- [ ] **Step 2: Run, expect failure** — `cd daemon && python3 -m unittest tests.test_romm -v` → `ModuleNotFoundError: pioneertv.romm` (settings test fails on the missing field).

- [ ] **Step 3: Implement** `romm.py` (stdlib only, no aiohttp import), the config default and the SCHEMA section. Check the actual name of the defaults dict in `config.py` and use it in the test helper.

- [ ] **Step 4: Run, expect pass** — same command, all OK.

- [ ] **Step 5: Commit** — `git add daemon/pioneertv/romm.py daemon/pioneertv/config.py daemon/pioneertv/settings.py daemon/tests && git commit -m "RomM proxy rules and settings: address and API key"`

---

### Task 2: `/romm/` in the preview server

**Files:**
- Modify: `dev/preview.py`

**Interfaces:**
- Consumes: `romm.target_url`, `romm.request_headers`, `romm.RESPONSE_HEADERS` (import with `sys.path.insert(0, str(ROOT / "daemon"))`).
- Produces: `GET/HEAD/POST/PUT/DELETE /romm/<path>` on the preview, configured by env `ROMM_URL` and `ROMM_API_KEY`; if `ROMM_API_KEY` is unset and `~/.config/pioneer-tv/romm.env` exists, read `KEY=value` lines from it. Redirect `/spel` → `/ext/launcher/spel.html?tv=1`; a "Spel" section on the index page linking `/spel`.

- [ ] **Step 1: Implement** `do_POST`, `do_PUT`, `do_DELETE`, `do_HEAD` and a `/romm/` branch in `do_GET`, all calling one `proxy(self)` that uses `urllib.request` with the request body (read `Content-Length` bytes), streams the response in 64 KiB chunks, copies `RESPONSE_HEADERS`, and passes RomM's status through (catch `urllib.error.HTTPError` and forward its status and body). 404 when `target_url` is `None`, 503 `{"error":"no_key"}` without a key, 502 `{"error":"unreachable"}` on `URLError`.

- [ ] **Step 2: Verify against the real server** (restart the preview first):

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:5178/romm/api/platforms        # 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:5178/romm/login               # 404
curl -s -o /dev/null -w "%{http_code}\n" "localhost:5178/romm/assets/emulatorjs/data/loader.js"  # 200
ROMM_API_KEY= ROMM_URL= python3 dev/preview.py 5179 & sleep 1; curl -s localhost:5179/romm/api/platforms; kill %1   # {"error": "no_key"} (with no romm.env readable: run with HOME=/nonexistent)
```

- [ ] **Step 3: Commit** — `git commit -am "Preview: /romm/ forwards to RomM with the API key"`

---

### Task 3: `/romm/` in the daemon

**Files:**
- Modify: `daemon/pioneertv/server.py` (route + handler)
- Create: `daemon/tests/test_server_romm.py`
- Dev only: `python3 -m venv "$SCRATCH/venv" && "$SCRATCH/venv/bin/pip" install aiohttp` (aiohttp is not installed on the laptop; never committed)

**Interfaces:**
- Consumes: Task 1 functions; `self.cfg["romm"]`.
- Produces: `self.app.router.add_route("*", "/romm/{path:.*}", self.romm_proxy)`. One `aiohttp.ClientSession` created lazily and closed on app cleanup; `timeout=aiohttp.ClientTimeout(total=None, sock_connect=5)`.

- [ ] **Step 1: Write the failing tests** with `aiohttp.test_utils.TestServer`/`TestClient` in an `IsolatedAsyncioTestCase`. The fake upstream app echoes method, path, query, `Authorization` and body as JSON; `Server(cfg, on_command, hooks={})` gets `cfg["romm"] = {"url": str(upstream.make_url("")), "api_key": "k1"}`:
  - `GET /romm/api/roms?limit=2` → 200, echo has `path == "/api/roms"`, `query == "limit=2"`, `auth == "Bearer k1"`.
  - `POST /romm/api/states?rom_id=3` with a 3-byte body → echo `body_len == 3`, method POST. Send it with no `Origin` header (the auth middleware refuses foreign origins, which is wanted).
  - `GET /romm/login` → 404. `GET /romm/api/x` with `api_key = ""` → 503 and `{"error": "no_key"}`.
  - Upstream returning 401 → 401 passed through.

- [ ] **Step 2: Run, expect failure** — `cd daemon && "$SCRATCH/venv/bin/python" -m unittest tests.test_server_romm -v` → 404s from the missing route.

- [ ] **Step 3: Implement `async def romm_proxy(self, request: web.Request) -> web.StreamResponse`** — `target_url(cfg url, request.match_info["path"], request.query_string)`; body via `await request.read()` (states and saves are small); response streamed with `web.StreamResponse` and `iter_chunked(65536)`; `aiohttp.ClientError` → 502 `{"error": "unreachable"}`.

- [ ] **Step 4: Run, expect pass**, and also `python3 -m unittest tests.test_romm` with the system python (still stdlib-only).

- [ ] **Step 5: Commit** — `git add daemon && git commit -m "Daemon: /romm/ forwards to RomM with the API key"`

---

### Task 4: `romm.js`, the page-side client

**Files:**
- Create: `extension/launcher/romm.js`

**Interfaces:** (all async, all reject with `RommError {status: number, code: 'no_key'|'auth'|'down'|'http'}`; `status` 0 for a network error; 503 `no_key` → `'no_key'`, 401/403 → `'auth'`, 502/0/5xx → `'down'`)
- `M.romm.platforms(): Promise<{id, slug, name, count}[]>` — `rom_count > 0` only, sorted by name.
- `M.romm.recent(limit = 20): Promise<Game[]>` — query from the spec.
- `M.romm.games({platformId?, collection?: {kind: 'own'|'virtual', id}}): Promise<{games: Game[], letters: Record<string, number>}>` — `limit=1000&with_filter_values=false&with_rom_id_index=false`, `letters` = `char_index`. Collections use `collection_id` / `virtual_collection_id`.
- `M.romm.search(term, opts)` — same shape, adds `search_term`.
- `M.romm.collections(): Promise<{kind, id, name, count}[]>` — `/api/collections` first, then `/api/collections/virtual?type=all`.
- `M.romm.game(id): Promise<GameDetail>` — `/api/roms/<id>`.
- `M.romm.markPlayed(id)`, `M.romm.removeRecent(id)` — props calls from the spec, body `{}`.
- `M.romm.latestState(romId): Promise<{id, url, updatedAt} | null>`, `M.romm.latestSave(romId)` — same shape; newest by `updated_at`; `url` = `/romm/api/states/<id>/content` (`/saves/` for saves).
- `M.romm.uploadState(romId, bytes: Uint8Array, png: Blob | null)`, `M.romm.uploadSave(romId, bytes, png)` — multipart `stateFile`/`saveFile` + `screenshotFile`, query `rom_id` and `emulator=<core>` (core passed as a third argument).
- `Game = {id, name, platform: slug, cover: string | null, year: number | null, players: string | null, summary: string, lastPlayed: string | null, publisher: string | null, files: number, fileName: string}` — `cover` is `/romm` + `path_cover_small`; `year` from `metadatum.first_release_date` (ms); `files` from `files.length`; `fileName` = `fs_name`. One function `toGame(raw)` does the mapping, and only those fields are kept in memory.

- [ ] **Step 1: Implement**, with a page-independent base: `const BASE = new URL('/romm/', location.origin).href`.
- [ ] **Step 2: Verify in the browser pane** on `localhost:5178/ext/launcher/spel.html?tv=1` (a stub page that loads `romm.js` is enough until Task 5) with `javascript_tool`: `(await M.romm.platforms()).map(p=>p.slug)` → `['n64','nes','snes']`; `(await M.romm.recent(3))[0].name` → the newest game; `(await M.romm.games({platformId: 4})).games.length` → 781; `(await M.romm.collections()).length` → 23.
- [ ] **Step 3: Commit** — `git add extension/launcher/romm.js && git commit -m "romm.js: the Spel pages' client for RomM"`

---

### Task 5: Spel start view, the tile

**Files:**
- Create: `extension/launcher/spel.html` (script and style list like `radio.html`, plus `romm.js`, `spel.js`), `spel.css`, `spel.js`
- Modify: `extension/launcher/default-services.js` (the `romm` entry becomes id `spel`, url `spel.html?tv=1`, relative like the radio tiles, since this list is only used without a daemon, i.e. in the preview; no `search_url`, no `mode`), `daemon/config.example.toml` (same entry with url `http://127.0.0.1:8765/ext/launcher/spel.html?tv=1`), `GUIDE.md` (Games section: the Spel pages, the API key, `/romm/`, and that a box whose `settings.json` still lists `romm` switches by editing that service on the settings page)

**Interfaces:**
- Consumes: Task 4.
- Produces: hash router in `spel.js`: `#/` start, `#/platform/<id>`, `#/collection/<own|virtual>/<id>`; `show(route)` renders into `<main id="view">`. `M.launcherUrl` set as in `radio.js`. B (Escape) on `#/` → `M.bridge.home()`, elsewhere `history.back()`.
- Produces: `card(game, {size: 'recent'|'grid'})` returning a focusable `<a class="spel-card" data-id>` with cover `<img loading="lazy">` or the paper fallback (`onerror` swaps to it). Task 6 reuses it.

- [ ] **Step 1: Implement the start view** — three sections per the spec (rows hidden when empty), initial focus on the first recent card (`data-pioneertv-initial`). A on a recent card → `spela.html?rom=<id>`; on a console or collection → hash route. Error states per the spec's Errors section, as one `renderError(err: RommError)` with a "Försök igen" button that re-runs the current route.
- [ ] **Step 2: Implement remove + undo** — X (`' '` keydown, as in `radio.js`, skipped when `M.nav.captured`) on a recent card removes it from the DOM, moves focus to its neighbour, shows `M.hud.toast('Borttaget · X ångra', 'gamepad', 5000)`. X within 5000 ms puts it back. When the timer runs out, or on `pagehide`, call `M.romm.removeRecent` for every pending id (on `pagehide` use `fetch(..., {keepalive: true})`).
- [ ] **Step 3: Verify in the browser pane** — screenshot of `localhost:5178/spel` at 1280x720; arrows move between rows; Enter on SNES changes the hash. Remove a game, press Space within 5 s → back in place, nothing sent (check `read_network_requests` for no props call). Remove, navigate to `/launcher` within 5 s → a `remove_last_played` request in the network log, and the game is gone after a reload of `/spel`. Re-add it afterwards with `M.romm.markPlayed(id)` so the user's list stays as it was.
- [ ] **Step 4: Error check** — run the preview with `HOME=/nonexistent ROMM_API_KEY=` and open `/spel` → the no-key message; with `ROMM_URL=http://127.0.0.1:9` → "RomM svarar inte" and a working "Försök igen".
- [ ] **Step 5: Commit** — `git add extension/launcher daemon/config.example.toml GUIDE.md && git commit -m "Spel: start page with recent games, consoles and collections"`

---

### Task 6: Grid, info panel, letter jump, search

**Files:**
- Modify: `extension/launcher/spel.js`, `spel.css`

**Interfaces:**
- Consumes: `card()`, router, Task 4 `games`/`search`.
- Produces: `letterKey(name: string): string` — first character, case-folded, with `å`, `ä`, `ö` kept as their own letters and anything that is not a letter → `'#'`. Used both for jumps and for any letter header.

- [ ] **Step 1: Grid** — five columns; render only the rows on screen plus one either side (a spacer above and below keeps the scroll height right); re-render on focus move. Cards are `card(game, {size:'grid'})`. The info panel follows `focusin`: title, year · publisher · players, summary clamped to 6 lines, "Senast: <date sv-SE> | aldrig spelat".
- [ ] **Step 2: Letter jump** — L1/R1 arrive as Shift+Tab/Tab: in the grid, prevent default and move focus to the first game whose `letterKey` is the previous/next letter present. Check in the console: `letterKey('3 Ninjas Kick Back') === '#'`, `letterKey('Ägget') === 'ä'`, `letterKey('the 7th Saga') === 't'`.
- [ ] **Step 3: Search** — Y in the grid: a search field at the top of the grid gets focus (the box's on-screen keyboard opens by itself in TV mode); input filters the grid in memory by `name` (case- and diacritic-insensitive), Enter or B leaves the field with the filter kept, B again clears it.
- [ ] **Step 4: Verify in the browser pane** — `/spel#/platform/4`: screenshot; holding ArrowDown keeps the DOM card count under 60 (`document.querySelectorAll('.spel-card').length`); Tab jumps from "C…" to "D…"; search "mario" shows only Mario games; a collection route (`Co-operative`) shows 65 games.
- [ ] **Step 5: Commit** — `git commit -am "Spel: game grid with info panel, letter jump and search"`

---

### Task 7: Player page, game start

**Files:**
- Create: `extension/launcher/spela.html`, `spela.css`, `spela.js`

**Interfaces:**
- Consumes: Task 4 `game`, `markPlayed`, `latestState`, `latestSave`.
- Produces: `CORES = {nes: 'fceumm', snes: 'snes9x', n64: 'mupen64plus_next'}`; `romFileUrl(game: GameDetail): string | null` → `/romm/api/roms/<id>/content/<encodeURIComponent(fileName)>`, `null` when `files > 1` or the platform has no core. `M.player = {emulator, core, game}` for Task 8.

- [ ] **Step 1: Confirm the EmulatorJS API** of the version RomM serves: fetch `/romm/assets/emulatorjs/data/loader.js` and `emulator.min.js` and note, in a comment at the top of `spela.js`, the exact global and method names this file uses (expected: `EJS_player`, `EJS_core`, `EJS_gameUrl`, `EJS_pathtodata`, `EJS_startOnLoaded`, `EJS_Buttons`, `EJS_onGameStart`, `window.EJS_emulator`, `gameManager.getState()`, `gameManager.loadState(bytes)`, `gameManager.getSaveFile()`, `gameManager.loadSaveFiles()`, `gameManager.restart()`, `gameManager.screenshot()`, `pause()`, `play()`). Use what the file actually has.
- [ ] **Step 2: Implement start** — `?rom=<id>[&fresh=1]`; fetch the game; `romFileUrl` null → the spec's "går inte att spela" message with a button back. Otherwise fetch the ROM with a progress line "Laddar <n> MB" (stream `response.body`), hand EmulatorJS a blob URL, hide all of EmulatorJS's own buttons, `EJS_pathtodata = '/romm/assets/emulatorjs/data/'`. On game start: `markPlayed`; unless `fresh=1`, load the newest state, else the newest save file. The canvas fills the screen at 4:3 with `image-rendering: pixelated`.
- [ ] **Step 3: Verify in the browser pane** — open `/ext/launcher/spela.html?rom=<a SNES id>&tv=1`: screenshot shows the game running; `document.documentElement.classList.contains('pioneertv-game')` is true after ~2 s (`game.js` detected it); the game is first in `M.romm.recent(1)`. A multi-file ROM id (find one with `has_multiple_files`) shows the message.
- [ ] **Step 4: Commit** — `git add extension/launcher/spela.* && git commit -m "Spela: our own player on RomM's EmulatorJS"`

---

### Task 8: Pause panel, save on quit, TV volume, Guide

**Files:**
- Modify: `extension/launcher/spela.js`, `spela.css`, `extension/content/main.js:18`
- Modify: `GUIDE.md` (gamepad table note: on the player, Guide opens the pause panel)

**Interfaces:**
- Consumes: `M.player`, Task 4 uploads.
- Produces: in `main.js`, `b.on('menu', () => (M.menuOverride ? M.menuOverride() : M.hud.menu.toggle()))`; `spela.js` sets `M.menuOverride = () => panel.toggle()`. Holding Guide is a different daemon action (home) and is untouched.
- Produces: the panel registers as a modal layer with `M.bridge.mount(el, {modal: true})` and emits `menu:open`/`menu:close`, so `game.js` pauses game mode and `ejs-players.js` mutes the pad exactly as for the quick menu.

- [ ] **Step 1: Panel** — items in the spec's order. Opening pauses the emulator, closing (B, or "Fortsätt spela") resumes it. "Ladda läge" shows `HH:MM` of the newest state and is skipped by focus when there is none. TV-volym row: ArrowLeft/ArrowRight → `M.bridge.cec('volume_down'|'volume_up')`, Enter → `M.bridge.cec('mute')`, focus stays on the row. Footer: player 1/2 pad names from `navigator.getGamepads()` in the order `ejs-players.js` assigned (if that order is not exposed, show the connected pads without numbers).
- [ ] **Step 2: Save** — `saveAll(): Promise<void>` uploads the state (+ screenshot PNG) and, when `getSaveFile()` returns bytes, the save file. "Spara läge" runs it and toasts "Sparat". "Avsluta och spara" runs it, then goes `history.back()` (or to `spel.html` when there is no history). On failure the panel shows "Sparningen misslyckades" with "Försök igen" and "Avsluta ändå"; nothing navigates until one is chosen.
- [ ] **Step 3: Verify in the browser pane** — with the preview, `M.menuOverride()` opens the panel (the preview has no bridge, so call it directly); "Spara läge" → a new state in `M.romm.latestState(id)`; reload with `?rom=<id>` → the game resumes from it (screenshots before and after). Quit with the preview stopped (Ctrl-C after the panel is open) → the failure buttons appear and the page stays.
- [ ] **Step 4: Commit** — `git add extension GUIDE.md && git commit -m "Spela: pause panel with saving, TV volume and quit"`

---

### Task 9: Whole-branch check

- [ ] **Step 1:** `cd daemon && python3 -m unittest tests.test_romm && "$SCRATCH/venv/bin/python" -m unittest discover tests` → all OK.
- [ ] **Step 2:** In the browser pane, walk the full path once: launcher → Spel tile → SNES → a game → pause → Avsluta och spara → back on the grid → the game first in Senast spelade. Screenshots of each screen at 1280x720 for the user.
- [ ] **Step 3:** List what is left for the box (gamepad, Guide, L2/R2, two pads, the daemon-served tile URL) in the final summary.
