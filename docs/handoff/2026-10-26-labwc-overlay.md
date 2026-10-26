# Handoff, 2026-10-26: labwc, the overlay, and what is next

For the next agent working on Pioneer TV. Read this, then GUIDE.md. Reply to
the user in Swedish. Work on branch `main` of `maskinrepubliken/pioneer-tv`.

## Working with this user

- Keep questions to a minimum. Once a direction is agreed, build, deploy,
  verify on the box and report plainly. Ask only for real choices, one short
  question at a time. The user has asked for this ("Kör, fråga inte så mycket").
- **Never overclock the Pi** (no `arm_freq`, `over_voltage` or `gpu_freq`).
  Two overclocked boots corrupted the old SD card. Make slow things lighter
  instead (N64 runs at 320x240).
- **The TV is to stay off and black until the user says otherwise.** Do not
  show anything on it, play anything or open menus on it without an OK.
- Never repeat credentials in chat (Wi-Fi passwords, the RomM and Jellyfin
  keys). They live on the box in `/etc/pioneer-tv/settings.json`.
- Commits: plain English, a subject line that says what changed, a body that
  says why. End with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
  Run `git pull --rebase` before pushing. Keep GUIDE.md current.

## The box

- Raspberry Pi 4 on a new 32 GB SD card (fresh install on 2026-10-22; the old
  card is retired and kept as a spare). Raspberry Pi OS Lite 64-bit (Debian 13).
- Tailscale: `pioneer-tv` at 100.127.191.97. SSH user `pi`, key-only,
  passwordless sudo. The cloud environment needs an SSH key the box accepts
  (`/home/pi/.ssh/authorized_keys`) and to be on the tailnet.
- Repo checkout `/home/pi/pioneer-tv`, installed copy `/opt/pioneer-tv`.
  Deploy with `curl -X POST -H 'Content-Type: application/json' -d '{}'
  localhost:8765/api/update` on the box (pulls main, runs the installer,
  restarts the daemon and the display). Status: `/api/update/status`.
- Daemon tests on the box: `cd /opt/pioneer-tv/daemon && python3 -m unittest
  discover -s tests -t .`. On a laptop without evdev, `test_gamepad_start`
  cannot import; the rest needs aiohttp.
- Useful on the box: Chromium's DevTools port 9222 (CDP, for screenshots
  and evaluating JS in the kiosk tab); `grim` for a screenshot of the whole
  screen (`XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 grim x.png`);
  `wlr-randr`; `mpv` (installed for the films work).
- pkill pitfall: a pattern that also matches the ssh command line kills your
  own shell. Use `pkill -f "[o]verlay.py"` style patterns and run kills in a
  separate ssh call from anything else.

## Where things stand

### Done and deployed (main, up to 0452803)

- **Musik** (`extension/launcher/musik.*`, `jellyfin.js`, daemon
  `/jellyfin/` proxy and `/api/jellyfin`): playlists, albums, artists,
  search, "Spelas nu". Works against the real library.
- **labwc instead of Weston** (3601c5a): `pioneer-tv-display.service` runs
  `labwc -C /opt/pioneer-tv/system/labwc -S /opt/pioneer-tv/system/session.sh`.
  session.sh sets 1280x720 with wlr-randr, starts the overlay, then
  start-chromium.sh. Weston stays installed but disabled until the user
  agrees labwc is good. Verified on the box: the start page, SVT1 in Chromium
  at 720p with 0 % dropped frames after warm-up (Weston: about 4 %), RetroArch
  (GoldenEye) full screen, keys through uinput, sound.
- **The overlay** (f1ac3dd, 0452803): `system/overlay.py` (GTK4 +
  gtk4-layer-shell + WebKitGTK 6, transparent, labwc's overlay layer) loads
  `/ext/overlay/index.html` (`extension/overlay/`), which reuses `hud.js`
  for the quick menu and toasts. `daemon/pioneertv/overlay.py` (Router)
  decides who gets Home/Y/B and the toasts: the overlay while it is
  connected, a page's own menu while one is open (`page_menu`), the page
  otherwise. The overlay takes the keyboard (layer-shell EXCLUSIVE) only
  while its menu is open, and relays home/back/reload/keyboard/settings to
  the page. Opening its menu broadcasts `media: pause`; closing it,
  `media: resume` (main.js pauses and resumes the page's video/audio).
  The session gives every process the ambient capability CAP_WAKE_ALARM,
  which makes bubblewrap refuse WebKit's sandbox: session.sh starts the
  overlay with `setpriv --inh-caps=-all --ambient-caps=-all`. Do not
  disable WebKit's sandbox instead.
  Verified: the overlay starts and connects ("hello from overlay").
  **Not yet verified**: the menu actually opening, keys reaching it, the
  relays, media pause/resume, toasts.

### The incident to start with

During the first test of the overlay's quick menu the **whole box froze**:
no ping, no SSH, on Tailscale or the LAN, for over three minutes. At the
time SVT1 was playing in Chromium and a fake uinput gamepad (a throwaway
test script, `/tmp/fakepad.py`) pressed Home (BTN_MODE) to open the menu.
Cause unknown: GPU (vc4) hang while WebKit drew over the video, memory, or
something else. The user is power-cycling the box.

When the box answers again, in this order:

1. Keep the TV off: `curl -X POST -H 'Content-Type: application/json' -d
   '{"command":"tv_off"}' localhost:8765/api/cec`, and blank the output:
   `XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 wlr-randr
   --output HDMI-A-1 --off` (it stays off until the display restarts; turn it
   back on with `--on` once the user agrees).
2. Read the frozen boot's log: `journalctl -b -1 --no-pager` (kernel: vc4,
   v3d, OOM, "hung task", undervoltage; labwc and the overlay in
   `-u pioneer-tv-display`; the daemon in `-u pioneer-tv-daemon`). Check
   `vcgencmd get_throttled` too.
3. Find the cause and fix it before testing the menu again. Try to
   reproduce in steps that do not need the TV: overlay menu without video,
   then with video, watching `free -m`, `dmesg -w` and the GPU from SSH.
   Consider a hardware watchdog (`dtparam=watchdog=on` + systemd
   `RuntimeWatchdogSec`) so a freeze reboots by itself.
4. Then verify the rest of the overlay (above) and update GUIDE.md: the
   display section, "How it fits together", the Weston quirks (the cursor
   assertion and atomic modesetting no longer apply), README's `system/`
   line.

### Next: project 1, step 3: the games' pause panel in the overlay

Today Home in a game makes games.py screenshot, save state and quit
RetroArch, and spela.html shows the pause panel over the screenshot. With
the overlay: pause RetroArch (UDP command port, `PAUSE_TOGGLE`) and show
the pause panel in the overlay over the paused game; Fortsätt unpauses;
Spara läge / Ladda läge / Starta om through RetroArch commands (or as
today); Avsluta quits. The user also chose that the quick menu pauses
games. Not started.

### After that: project 2, Film & serier with mpv

Decided with the user:

- Our own pages for Jellyfin's films, series and clips; tabs are Jellyfin's
  own libraries (UserViews, music excluded) so new ones appear by themselves.
  Each tab a grid, "Fortsätt titta" first. A on a film or clip opens a
  detail page (picture, title, year, length, overview; Spela / Fortsätt från
  …, Spela från början, sound and subtitles). A series opens seasons and
  episodes.
- Playback in **mpv**, started by the daemon as games.py starts RetroArch.
  Measured on the box: 1080p HEVC 10-bit with `--hwdec=drm --vo=gpu
  --profile=fast`, 0 dropped frames, about 22 % CPU; plain `--vo=gpu`
  dropped about 9 frames a second; `--vo=dmabuf-wayland` hung against
  Weston (untested on labwc). Stream straight from Jellyfin
  (`/Videos/<id>/stream?static=true`): mpv plays MKV, HEVC, AVI and MPEG-2
  itself. About 4.5 Mbit/s is needed for the 1080p HEVC files and Jellyfin
  delivered about 5.3 Mbit/s to the box: watch for buffering.
- Controls: A, B and X pause and show a panel (in the overlay) with
  Fortsätt, Ljud, Undertexter; in the panel B/X resume and A picks. Holding B
  quits. Left/right seek 10 s, L1/R1 one minute, with a short timeline.
  **No autoplay**, not even the next episode. When a video has ended: a
  black screen like "Laddar…" saying "Tryck B för att fortsätta".
  Audio and subtitle defaults follow the user's Jellyfin settings.
- Report playback progress to Jellyfin (Sessions/Playing) as Musik does.

### Smaller open threads

- Musik: songs in playlists start slowly because many of those m4a files
  have their `moov` atom at the end. Offered: a script to fix the files on
  the Jellyfin server (`ffmpeg -i in.m4a -c copy -movflags +faststart
  out.m4a`), and/or preloading the next song in the page. The user said
  "vi återkommer till detta".
- Musik: the album grid (1,707 albums) is untested for smoothness on the Pi;
  search matches song titles, not artist names.
- Wi-Fi: the box chose Småhusbyn's 5 GHz network itself (signal 60 against
  75 on 2.4 GHz). Locking it to 5 GHz was offered; no answer yet.
- Spike packages still on the box: mpv, grim, wlr-randr (now used), labwc
  (used), WebKitGTK and gtk4-layer-shell (used).
- A second session ("Pioneer TV (fork)") works on a different Pi with a
  small SPI display and an amplifier HAT (`pioneer-cd`); it is unrelated to
  this box.
