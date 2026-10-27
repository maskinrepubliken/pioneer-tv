# Handoff, 2026-10-27: the overlay tried, Film & serier live, games held in place

For the next agent working on Pioneer TV. Read this, then GUIDE.md. The
rules in `2026-10-26-labwc-overlay.md` ("Working with this user") still
hold: reply in Swedish, ask little, never overclock, never repeat
credentials. Work on `main` and check after each push that it arrived
(`git ls-remote origin refs/heads/main`): on the 26th the pushes from one
session never reached GitHub and nobody noticed for a day.

## The box

- Reached as `ssh pioneer-tv` (Tailscale 100.127.191.97); this
  environment's key is in `~/.ssh/authorized_keys`, and the installer now
  adds the keys in `system/authorized_keys`.
- The "freeze" of the 26th was a power cut, and the outage on the 27th was
  Wi-Fi: the box had been put behind the sofa. It never hung.
- Installed and tested at `ac85578` or later: all 78 daemon tests pass on
  the box (`cd /opt/pioneer-tv/daemon && python3 -m unittest discover -s
  tests -t .`).
- Guards: the hardware watchdog (systemd, 15 s), `kernel.panic = 10`, a
  persistent journal.

## Testing on the box without a person

What worked this session, worth repeating (the scripts were throwaway,
in `/tmp`, and are gone):

- A stand-in gamepad: a uinput device with BTN_SOUTH ... BTN_MODE and a hat,
  reading commands ("tap BTN_MODE", "hold BTN_EAST 1.6", "dpad down") from
  a FIFO, run as root with `systemd-run --unit=pioneer-fakepad`. The daemon
  picks it up as "Pioneer Test Pad".
- `grim -s 0.5` as `pi` for a screenshot of everything, overlay included.
- Chromium's DevTools on 9222 to read and steer the kiosk tab (location,
  `video.paused`, `document.fullscreenElement`).
- mpv's socket (`/var/lib/pioneer-tv/video/mpv.sock`, as root) for
  `time-pos`, `pause`, `sid`, dropped frames.
- New overlay code goes live by copying it to `/opt` and killing the
  overlay's `WebKitWebProcess` (overlay.py reloads the page). Kill by PID in
  its own ssh call. Then run a real update so `/opt` matches `main`.

## Done today (all on main, all tried on the box)

- **The overlay**: quick menu over the start page, over SVT1 in fullscreen
  (pauses and resumes the video) and over mpv; toasts. Fixed: B closing the
  menu threw SVT1 out of fullscreen (the keyboard went back to Chromium
  with Escape still down); the overlay now waits for every key to be up.
- **Film & serier** is the tile now (`film.html`, the installer moved the
  box's tile once). Libraries as tabs, Fortsätt titta, posters, series by
  season, detail page with sound and subtitles, search. Plays in mpv: 1080p
  HEVC in hardware, no dropped frames. Fixed on the box: Jellyfin 10.11
  wants the user for `Items/<id>`; positions are written to the user's
  data on stop (the API key's reports count for nobody).
- **Pause panels in the overlay**: in a game, Home pauses RetroArch where
  it is and the panel (Fortsätt spela, Spara läge, Ladda läge, Starta om,
  TV-volym, Avsluta) uses RetroArch's commands: instant. In a video, A, B,
  X or Home pause mpv and the panel offers Fortsätt, Ljud, Undertexter,
  TV-volym, Sluta titta. B or X carries on, holding B quits.
- **Musik**: a song played to its end is marked played for the user
  (`UserPlayedItems`); before, nothing was ever counted.
- **Long presses** after ten seconds idle came out short (the TV's power
  is asked over CEC first, and the pad's release waited behind it):
  holding B to stop a film paused it instead. Now judged by the input
  events' own times (4e00c0b); four of four held B stopped the film.
- **Musik's album and artist grids** keep only the rows around the focus
  (as Spel's grid does): a press down on the 1,707 albums went from 110 to
  160 ms to the next picture to about 80. Pictures from Jellyfin are now
  sized for the screen (Film & serier down: 130 to 95 ms).

## Loose ends

- Every update ends with systemd logging "Failed to open
  /run/systemd/transient/pioneer-tv-update.service" a few times after the
  unit has finished. Harmless as far as seen.
- The subtitle and sound chosen in the video panel are not remembered; the
  next play starts from Jellyfin's defaults for the user.
- Spike packages still on the box: grim (used for screenshots). Weston is
  still installed and disabled; the user has not yet said labwc may stay
  for good.
- From the 26th, still open: Musik's slow starts (moov atom at the end),
  locking Wi-Fi to 5 GHz (better not, now
  that the box may stand behind the sofa: 2.4 GHz reaches further).
