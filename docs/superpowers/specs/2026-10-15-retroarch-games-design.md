# Games in RetroArch, out of sight

Date: 2026-10-15. Status: approved in conversation, awaiting review of this document.

## Intent

Every game the Spel pages offer runs on emulator cores built for the Pi,
directly on the box, not in the browser. The game files still come from the
server (through RomM's API). Which emulator frontend does this does not
matter to the user; that it never shows does. From the sofa it looks as it
does today: browse in Spel, press A, the game starts; Home pauses into our
own pause panel; the game resumes where it was left.

Why: EmulatorJS interprets the N64's processor in WebAssembly (about 23 of
60 frames a second in Super Mario 64 on the Pi 4, whatever the core), and
SNES and Genesis run slowly with crackling sound for their first 10–15
seconds while the browser optimises the core. RetroArch with
mupen64plus_next built for the Pi ran Super Mario 64 at 81 frames a second
unthrottled (measured on the box, 2026-10-14).

## Decisions

- **RetroArch as an invisible engine** (chosen over a frontend of our own and
  over separate emulators per console): it already handles audio/video sync,
  every libretro core, pads, states and screenshots. It shows no menu, logo
  or notices; only the game picture.
- **Our pause panel, not RetroArch's menu** (the user's choice A): Chromium
  cannot draw over RetroArch's window, so pausing ends RetroArch and the
  panel is shown over a screenshot; resuming starts RetroArch again from the
  state saved on the way out. A second or two to resume is accepted.
- **No continuity with the browser's saves** (the user's choice A): states
  and save files made in EmulatorJS are not carried over. So the cores need
  not match EmulatorJS's.
- **Saves stay on the box**, not in RomM. RomM keeps serving the files and
  the last-played mark.
- **Naming**: the daemon module and everything around it is called *games*
  (`games.py`, `/api/games/...`, `[games]`, `/var/lib/pioneer-tv/games`); the
  box is more than games, so not "native".

## Cores

| Console (RomM slug) | Core | Source |
|---|---|---|
| nes | nestopia | Debian `libretro-nestopia` |
| snes | snes9x | Debian `libretro-snes9x` |
| genesis | genesis_plus_gx | Debian `libretro-genesisplusgx` |
| n64 | mupen64plus_next | built on the box (GLES3, ARM64 recompiler), pinned commit |
| dos | dosbox_pure | built on the box, pinned commit |

`pioneer-tv-cores.service` (after every install, in the background, a no-op
once done) installs RetroArch and the Debian cores and builds the other two.
A console whose core is not in place is not offered: its games say they
cannot be played yet, as today.

## Components

- **Spel pages** (Chromium, `spel.html`): unchanged.
- **Player page** (`spela.html`, `spela.js`): no emulator any more. It shows
  "Laddar…" (with megabytes while downloading), errors with Tillbaka, and the
  pause panel over the screenshot. It talks to the daemon over
  `/api/games/...` and listens to `games` events.
- **Daemon, `games.py`** (from today's `native.py`): fetches the game into
  the cache, writes RetroArch's config, starts RetroArch as the kiosk user
  on the TV's Weston, sends it commands over its UDP command port, watches
  it, and reports state as events. While a game runs the pads are
  RetroArch's (as in today's game mode) and Home is handled by `games.py`.
- **Build script** (`system/build-cores.sh`, from `build-n64-core.sh`) and
  `pioneer-tv-cores.service`.

## Flows

**Start.** A on a game opens `spela.html?rom=<id>`, which posts
`/api/games/play`. The daemon reads the game from RomM, downloads it into
`/var/lib/pioneer-tv/games/cache/<id>/` unless it is there (progress events),
and starts RetroArch with: menu hidden, notices and on-screen messages off,
black background, fullscreen, state auto-load. RetroArch's window covers
Chromium; the first thing seen after "Laddar…" is the game. The page marks
the game played in RomM.

**Pause (Home).** The daemon freezes the game, has RetroArch write a
screenshot, then sends QUIT; RetroArch saves the automatic state on the way
out. When it has exited the daemon emits `paused` with the screenshot's
URL, and the player shows the pause panel over it. Target: under a second.

**Pause panel.**
- *Fortsätt spela*: start RetroArch again, loading the automatic state.
  "Fortsätter…" over the screenshot meanwhile.
- *Spara läge*: copy the automatic state to the game's own save point, with
  its time.
- *Ladda läge*: start RetroArch from the save point (greyed out without one).
- *Starta om*: start without loading any state.
- *TV-volym*: as today (left/right steps the TV over CEC, A mutes, L2/R2).
- *Avsluta*: back to the game list; the automatic state is already saved.

**Holding Home** goes to the start page; the state is saved as RetroArch
quits. **When RetroArch exits on its own** (the core quits), the player goes
back to the list.

## Storage

Under `/var/lib/pioneer-tv/games/`, owned by the kiosk user:
`cache/<rom id>/<file>` (at most 800 MB; the games played longest ago are
dropped first), `states/` (RetroArch's automatic state per game),
`points/<rom id>.state` (Spara läge), `saves/` (the games' own save files),
`screens/` (the pause screenshot), `cfg/` (written on each start).

## Pads

Player 1 is the pad that presses first, as today. RetroArch gets an
autoconfig file for the 8BitDo Ultimate 2C (its xpad button order, X and Y
the right way round); Guide is not bound in RetroArch, it is the box's. DOS
games take the keyboard from a real keyboard when one is plugged in; the pad
is a joystick to them.

## Errors

RetroArch failing to start, a broken download or a missing core: the player
shows the reason with Tillbaka. RetroArch hanging: holding Home quits it,
and the daemon terminates it if it has not gone within a few seconds. A
daemon restart stops any RetroArch it left running.

## Testing

Unit tests for `games.py` (which consoles are offered, config writing, the
cache, the pause sequence against a fake command port). The experience
(picture, sound, pads, pause and resume times) is tried on the TV by the
user.

## Out of scope

Syncing saves to RomM; carrying over EmulatorJS saves; RetroArch shaders;
netplay; Windows games.
