# Spel: a Pioneer TV frontend for RomM

Date: 2026-10-14 · Status: approved

## Goal

Replace RomM's web interface on the TV with pages of our own, in the box's
design system and driven by the gamepad: browse the library by console,
resume recently played games in one press, and play in a full-screen player
with a pause panel of our own. RomM stays the server: library, covers,
metadata, saves and states all live there.

Success: from the launcher's Spel tile you can reach and start any of the
1 050 games without seeing RomM's UI, resume where you quit, and nothing about
gamepad handling, game mode or CEC volume gets worse.

## What the library looks like (measured 2026-10-14)

RomM 5.4.0 at `http://100.123.142.8:8090`. SNES 781, N64 263, NES 6; no PC
games yet. 493 of a 500-game sample have a cover (Libretro/Hasheous).
`rom_user.last_played` is populated. No user collections; 23 virtual
(auto-generated) collections. RomM sends no `Access-Control-Allow-Origin`,
so browsers cannot call it cross-origin.

## Screens

UI text is Swedish, like the rest of the box. Layout on the 1280x720 canvas
with `1rem = 1/80` of the width, tokens and primitives from `tokens.css` and
`paper.css`, focus = ink ring plus ochre band, no motion except in answer to
input.

1. **Spel start** (`spel.html#/`): three rows.
   - *Senast spelade*: games with `last_played`, newest first, cover cards.
     A resumes (see Player). X removes the game from the list and shows a toast
     "Borttaget · X ångra" for 5 s; X again in that window restores it.
     The row is hidden when empty.
   - *Konsoler*: one card per platform with games, name and count.
   - *Samlingar*: the user's own collections first, then all virtual
     collections; name and count. Hidden when there are none.
2. **Grid** (`spel.html#/platform/<id>` or `#/collection/<kind>/<id>`):
   cover grid, five columns, A–Ö. An info panel on the right follows focus:
   title, year, publisher, players, a short description, "Senast: …".
   A starts the game. L1/R1 jump to the previous/next initial letter.
   Y opens search (on-screen keyboard, filters this grid). B goes back.
   Only the rows on screen and one row either side are in the DOM, so 781
   covers do not load at once on the Pi.
3. **Player** (`spela.html?rom=<id>[&fresh=1]`): the game full screen, 4:3,
   sharp scaling, nothing around it. Guide opens the pause panel (the game
   pauses and stops hearing the pad, as for the quick menu today); holding
   Guide still goes home. Pause panel, top to bottom:
   - Fortsätt spela (initial focus; B also closes the panel)
   - Spara läge
   - Ladda läge, with the time of the newest state
   - Starta om
   - TV-volym: one row; left/right step the TV volume down/up over CEC
     (`bridge.cec('volume_down'|'volume_up')`, as the quick menu does), A
     toggles mute. CEC can only step, never read or set a level, so the row
     shows no position; the TV draws its own volume bar. Hint "även L2/R2".
   - Spara och avsluta
   - Footer: which pad is player 1 and 2.

Covers without art get a paper card with the title in Fraunces.

## Architecture

```
spel.html / spela.html ──fetch /romm/...──▶ daemon :8765 (adds Bearer key) ──▶ RomM
        (extension pages)                    dev/preview.py :5178 in dev (same)
```

New files in `extension/launcher/`:

| File | Purpose |
| --- | --- |
| `romm.js` | API client used by both pages: platforms, roms (paged, by platform or collection, search), collections (own + virtual), rom detail, cover URLs, states (list newest, upload, download), saves (upload, download), mark played, remove from recently played. Knows nothing about the DOM. |
| `spel.html`, `spel.css`, `spel.js` | Start, grid and search views, switched by `location.hash`, so B goes back without a reload. |
| `spela.html`, `spela.css`, `spela.js` | Player: loads EmulatorJS, the pause panel, saving on quit. |

Changed files:

- `default-services.js` and the daemon's default service list: the `romm`
  tile becomes id `spel` pointing to `spel.html`, without `mode = "game"`.
  The id `romm` counts as game mode today, which would leave the browse
  pages deaf to the d-pad; `game.js` already detects the running canvas on
  `spela.html` by itself. An existing `settings.json` that still lists
  `romm` with RomM's URL keeps working as before.
- `daemon/pioneertv/server.py`: a `/romm/{path}` route that forwards GET,
  HEAD, POST, PUT and DELETE to the configured RomM base URL with
  `Authorization: Bearer <key>`, streaming bodies both ways. Only paths under
  `/api/` and `/assets/` are forwarded; anything else is 404. Without a key
  configured it answers 503 with `{"error": "no_key"}`.
- `daemon/pioneertv/settings.py`: a RomM section with `romm.url` and
  `romm.api_key` (the key shown as set/not set, never echoed back).
- `content/game.js`/`hud.js`: on `spela.html`, Guide opens the page's pause
  panel instead of the quick menu. `game.js` and `ejs-players.js` otherwise
  work unchanged (same EmulatorJS canvas).
- `dev/preview.py`: the same `/romm/` forwarding, reading `ROMM_URL` and
  `ROMM_API_KEY` from the environment; plus a "Spel" link on its index page.

The key is a RomM client API token with read scopes plus `roms.user.write`
and `assets.write`. It never reaches the browser.

## Player details

- EmulatorJS is loaded from RomM through the proxy:
  `/romm/assets/emulatorjs/data/loader.js`, `EJS_pathtodata` pointing at the
  same folder.
- Core per platform: NES `fceumm`, SNES `snes9x`, N64 `mupen64plus_next`
  (RomM's defaults). A platform without a mapping shows "Den här konsolen går
  inte att spela här än" with a button back.
- The ROM is fetched from `/romm/api/roms/<id>/content/<file>` and handed to
  EmulatorJS as a blob URL. A loading line shows progress in MB.
- On start: mark the game as played (updates `last_played`). Unless
  `fresh=1`, load the newest state for this ROM if there is one, else the
  newest save file.
- Spara läge / Spara och avsluta: upload a state with a screenshot to
  `/api/states`, and the in-game save file (SRAM) to `/api/saves` if the core
  has one. On quit, success returns to where the game was started from.
  Failure shows "Sparningen misslyckades" with "Försök igen" and "Avsluta
  ändå"; we never leave silently without a save.
- Starta om resets the core; it does not delete states.

## Recently played

Read: `GET /api/roms?last_played=true&order_by=last_played&order_dir=desc&limit=20`
(verified). Start: `PUT /api/roms/<id>/props?update_last_played=true`.
Remove: `PUT /api/roms/<id>/props?remove_last_played=true` with body `{}`.
The card leaves the row at once, but the request is sent only when the 5 s
undo toast runs out (or the page is left), so undo puts the game back where
it was without touching RomM.

## Errors

- RomM unreachable or 5xx: the Spel page shows "RomM svarar inte" and a
  "Försök igen" button, never an empty page.
- 503 `no_key`: "Lägg in en API-nyckel för RomM under Inställningar → RomM".
- 401/403 from RomM: "API-nyckeln godtas inte" and the same pointer.
- A cover that fails to load falls back to the paper card.
- Save failures: see Player.

## Testing

- Python unit tests for the proxy: adds the header, forwards body and
  status, refuses paths outside `/api/` and `/assets/`, 503 without a key.
- Pages verified in the browser pane against the real server through
  `dev/preview.py`: keyboard navigation of all three views, covers loading,
  letter jump, search, remove + undo, a game starting, a state reaching RomM
  and loading again. Screenshots at 1280x720.
- On the box, by hand: gamepad in game, Guide → pause panel, hold Guide →
  home, L2/R2 TV volume, two pads.

## Not in this version

Creating or editing collections from the TV, ratings and favourites,
manuals, more than one state slot per game, PC/DOS games (none in the
library yet; when they arrive they get their own design round).
