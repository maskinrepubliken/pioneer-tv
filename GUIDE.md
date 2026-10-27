# Pioneer TV guide

Everything that does not fit in the [README](README.md): how to use the box, how it is put together and
what was learned on the way.

## Contents

- [Gamepad mapping](#gamepad-mapping)
- [How it fits together](#how-it-fits-together)
- [Installing in detail](#installing-in-detail)
- [Settings and status](#settings-and-status)
- [The TV (HDMI-CEC)](#the-tv-hdmi-cec)
- [Games](#games)
- [Music](#music)
- [Film and series](#film-and-series)
- [Updating the box](#updating-the-box)
- [Logs and CEC debugging](#logs-and-cec-debugging)
- [Working on the home screen without a Pi](#working-on-the-home-screen-without-a-pi)
- [Design](#design)
- [Board and video mode](#board-and-video-mode)
- [The display: labwc](#the-display-labwc)
- [The overlay](#the-overlay)
- [When the box hangs](#when-the-box-hangs)
- [The pointer](#the-pointer)
- [Overlays and fullscreen](#overlays-and-fullscreen)
- [Sound](#sound)
- [Performance notes](#performance-notes)
- [Verify these against the live sites](#verify-these-against-the-live-sites)

## Gamepad mapping

| Button | Action |
| --- | --- |
| D-pad, left stick | Move focus (arrow keys) |
| A / Cross | Select (Enter) |
| B / Circle | Escape: closes an overlay, releases an engaged slider, leaves a text field. Hold: one page back |
| X / Square | Play, pause (Space) |
| Y / Triangle | On-screen keyboard. Hold: quick menu |
| L1, R1 | Shift+Tab, Tab (previous, next focusable) |
| L2, R2 | TV volume down, up (CEC, repeats while held) |
| Right stick | Mouse pointer; click on the stick to left-click |
| Start | Quick menu (also: hold Y) |
| Select | Status toast |
| Guide / Home / PS / Xbox | Quick menu (press again to close it); in a Spel game, the pause panel instead. Hold: home. Also wakes the TV and switches input when the pad connects |

All of it is in `/etc/pioneer-tv/config.toml` (see `daemon/config.example.toml`).
The TV remote works too: keys the TV forwards over CEC are mapped in `[cec.remote]`.

## How it fits together

```
 gamepad ──evdev──▶ daemon ──uinput──▶ labwc ──▶ Chromium (kiosk, --load-extension)
                      │                   │          ├─ content scripts: spatial nav, keyboard, HUD
                      │                   │          ├─ background: single tab, home, dev shortcuts
                      │◀── ws://127.0.0.1:8765/ws ───┤  launcher page: services from config
                      │                   │             settings page: status, Wi-Fi, Bluetooth, services
                      │                   ├────▶ RetroArch (a game, started by the daemon)
                      │◀── ws ────────────┴────▶ overlay (WebKit, top layer): quick menu, toasts
                      └──cec-ctl──▶ /dev/cec0 ──▶ TV
```

Navigation keys go through a virtual keyboard so every page, and Chromium
itself, sees ordinary key presses. Buttons that mean something to the shell
(home, menu, keyboard) go over the WebSocket as events, to the overlay while
it is up and to the page otherwise ([The overlay](#the-overlay)). CEC is only
ever touched by the daemon.

## Installing in detail

The installer pulls in labwc, Chromium, Widevine, WebKitGTK (for the overlay),
v4l-utils, BlueZ, aiohttp and evdev, copies the repo to `/opt/pioneer-tv`, installs the systemd units,
sets the video mode (1280x720), leaves swap in compressed memory to
Raspberry Pi OS's own zram, sets the CPU governor to performance at
boot, sets the boot target to graphical, and arms the guards in
[When the box hangs](#when-the-box-hangs). It also adds the SSH keys in
`system/authorized_keys` to the kiosk user's, so a freshly installed card can
be reached from the same machines as the old one. Rerunning it is safe. Pair the first gamepad from the shell (later ones from the settings page):

```
bluetoothctl
  scan on
  pair <MAC>
  trust <MAC>
  connect <MAC>
```

A pad that does not reconnect after the box reboots is normal for Bluetooth:
the pad pages the host for a while, gives up before Bluetooth is back, and
sleeps. The daemon therefore dials paired, trusted pads every few seconds for
the first minutes after start and once a minute after that, and BlueZ is set to
answer pages fast, to retry a dropped link, and not to re-run service discovery
on every incoming connection (the Stratus XL drops the link when it does). Waking the pad with any button
still helps if it went to sleep. A pad that was never trusted needs
`bluetoothctl trust <MAC>`; pairing from the settings page does this for you.

If `bluetoothctl` says "No default controller available", the kernel did not
bring up the onboard chip. On Bookworm the kernel attaches it itself (the old
`hciuart` service is not used and fails by design). Check `dmesg | grep -i bcm`:
no output means the chip did not enumerate, which a real power cycle usually
fixes after an unclean shutdown; a firmware error means
`sudo apt install --reinstall bluez-firmware firmware-brcm80211`. Make sure
`dtoverlay=disable-bt` is not in config.txt, and `rfkill unblock bluetooth`.

Tailscale is optional: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`.

Log in to Cineasterna and Jellyfin once with the on-screen keyboard; the Chromium
profile in `~/.pioneer-tv/chromium` remembers the sessions.

### Useful commands

```
journalctl -fu pioneer-tv-daemon        # gamepad, CEC and bridge log
journalctl -fu pioneer-tv-display       # labwc, Chromium and overlay output
journalctl -b -1 --no-pager             # the boot before a reset or a power cut
tail -f ~/.pioneer-tv/chromium.log      # Chromium output (extension load errors land here)
sudo python3 -m pioneertv -v            # run the daemon in the foreground (from /opt/pioneer-tv/daemon)
curl -s localhost:8765/api/status     # what the settings page sees
cec-ctl -d /dev/cec0 --to 0 --standby # TV off, straight from the shell
vcgencmd get_throttled                # 0x0 means the TV's USB port is enough
```

## Settings and status

The daemon serves a settings page at `http://127.0.0.1:8765/`. On the TV it is
reached from the quick menu (Start → Inställningar), where the spatial
navigation and on-screen keyboard work like on any other page; a USB keyboard
works too, and while one is plugged in the on-screen keyboard stays out of the
way. The quick menu itself shows Wi-Fi, Tailscale (and whether the Jellyfin peer is
online), connected gamepads with battery, and temperature.

The page has: status (network, Tailscale, CEC, gamepads, thermals and power
throttling), Wi-Fi networks with connect and forget plus saving a network that
is not in range yet, Bluetooth scan and pairing
for any number of gamepads, the services shown on the launcher, controller
tuning, TV behaviour, and system actions (restart Chromium, reboot, update from
git, logs). Changes are saved to `/etc/pioneer-tv/settings.json` and applied
without a restart; `config.toml` remains the place for the full button map.

To design the settings page without a Pi, open
`daemon/pioneertv/web/settings.html?mock=1` in a browser. It is responsive, so the
same page works on a phone.

**Remote access.** Keep the daemon on localhost and publish it to your tailnet:

```
sudo tailscale serve --bg 8765
```

Then the page is at `https://<pi-name>.<tailnet>.ts.net/` from any of your
devices, with Tailscale doing the authentication. If you instead bind the daemon
to `0.0.0.0` in `config.toml`, set an access key under Fjärråtkomst; non-local
requests must then carry it (`?token=` once, stored as a cookie).

## The TV (HDMI-CEC)

The daemon claims a CEC playback address and follows the bus, so the box and
the TV stay in step:

- A gamepad connecting wakes the TV and switches it to the Pi's input.
- Any pad button while the TV is off turns it on and does nothing else, so a
  press never lands on a screen nobody can see (`cec.wake_on_input`).
- The TV going to standby sends the box back to the launcher and pauses any
  video, so the next time it wakes it is on the home page
  (`cec.home_on_standby`).
- The TV's own remote keys arrive over CEC and are mapped in `[cec.remote]`.

Both behaviours are toggles on the TV page in settings. The daemon also polls
the TV's power state every 30 seconds, because a set switched off with its own
remote does not always announce it.

## Games

The Spel tile opens our own pages on top of [RomM](https://github.com/rommapp/romm):
`extension/launcher/spel.html` to browse (recently played, consoles, collections,
each console's games with covers) and `spela.html` to play. On the start page X
removes a game from Senast spelade; X again within five seconds puts it back.

The pages never talk to RomM directly. They call `/romm/...` on their own
origin, and the daemon forwards that to RomM with the API key added; only
RomM's `/api/` and `/assets/` are reachable that way. That is why the tile
opens the pages from the daemon (`http://127.0.0.1:8765/ext/launcher/spel.html`)
rather than from the extension. Set RomM's address and a client API token
(RomM: Settings → Client API Tokens, read scopes plus `roms.user.write` and
`assets.write`) under Inställningar → RomM.

### Playing: RetroArch, out of sight

Games run on the box, in RetroArch, not in the browser (EmulatorJS could not
keep up on the Pi: the N64 at about 23 of 60 frames a second, SNES and
Genesis slow and crackling for their first seconds). RetroArch never shows
itself: no menu, notices or logo, only the game. The design is in
`docs/superpowers/specs/2026-10-15-retroarch-games-design.md`.

- **Cores.** NES (Nestopia), SNES (snes9x) and Genesis (Genesis Plus GX) from
  Debian; N64 (mupen64plus_next, GLES3 and its ARM64 recompiler) and DOS
  (DOSBox Pure) built on the box. `pioneer-tv-cores.service` installs and
  builds them in the background after an install (`system/build-cores.sh`,
  once per pinned commit). A console without its core says it cannot be
  played yet.
- **Starting.** The player asks the daemon (`games.py`, `/api/games/play`),
  which fetches the file from RomM into `/var/lib/pioneer-tv/games/cache`
  (800 MB at most; the games played longest ago go first) and starts
  RetroArch as the kiosk user on the TV's display, over Chromium. A game
  resumes where it was left.
- **Pausing.** Guide in a game: RetroArch takes a picture and quits, saving
  where the game was, and the player shows the pause panel over the
  picture: Fortsätt spela, Spara läge (a save point of its own), Ladda läge,
  Starta om, TV-volym (left and right step the TV's volume, A mutes) and
  Avsluta. Everything but Avsluta starts RetroArch again, which takes a
  second or two; B carries on. Holding Guide goes home; the game is saved as
  RetroArch quits.
- **Pads.** While a game runs the pads are RetroArch's (with an autoconfig
  for the 8BitDo Ultimate 2C); player 1 is the pad last used. A real
  keyboard plugged in goes to DOS games; RetroArch's own hotkeys are off.
- **Saves** stay on the box (`/var/lib/pioneer-tv/games/states`, `points`,
  `saves`), not in RomM. Inställningar → RomM → *Spela spelen på boxen*
  switches it all off.

Pages the daemon serves under `/ext/` carry their own copies of the shell
scripts, so the manifest keeps the extension's content scripts off them, and
their bridge talks to the daemon over `/ws` directly.

A service with `mode = "game"` puts the box in game mode while its pages are
on screen, and so does any full-screen page with a large canvas. In game mode the daemon stops turning
pad buttons into arrows, Enter and Escape, so the emulator reads the pad itself through the browser's
Gamepad API and its own button mapping applies. The extension leaves the page's keys alone too.

A few buttons still belong to the box: Guide opens the quick menu and holding it goes home, holding
Start opens the quick menu too and the triggers set the TV volume. While an overlay is open the pad
drives it as usual. Game mode ends when the page goes away or stops sending heartbeats.

## Music

The Musik tile opens our own pages on top of [Jellyfin](https://jellyfin.org/)'s
music library, `extension/launcher/musik.html`: Blanda allt, Album and
Artister, then your playlists; a playlist or an album lists its songs beside
its cover, with Spela and Blanda. Typing in the search field (Y opens the
keyboard) searches songs, albums and artists. Films, series and clips have
their own page ([Film and series](#film-and-series)).

A song plays in the page itself and "Spelas nu" covers the screen: A or X
pauses, L1/R1 go to the previous and next song, left and right seek ten
seconds, B goes back to browsing while the music plays on, and X brings
"Spelas nu" back. The music lives only as long as the page: leaving it (Home
included) stops it. A song that cannot be played is skipped after a few
seconds; a stream that stalls for ten seconds is picked up again where it was.
Jellyfin hears what plays (`Sessions/Playing`), so "played" and play counts
follow the box.

As with RomM the pages never talk to Jellyfin directly: `/jellyfin/...` on
their own origin is forwarded by the daemon with the API key added, and only
the library, the images, the audio stream and those reports are reachable.
Jellyfin sends a song as it is when Chromium can play it and transcodes it to
MP3 otherwise, so the Pi does no work. Set Jellyfin's address (without
`/web/`), an API key (Jellyfin: Dashboard → API Keys) and, if not the first
administrator, the user whose playlists to show under Inställningar → Jellyfin.

## Film and series

The Film & serier tile opens `extension/launcher/film.html`, our own page on
top of Jellyfin, served by the daemon like Musik
(`http://127.0.0.1:8765/ext/launcher/film.html`); the installer moved a tile
that still opened Jellyfin's web UI over to it once. Its tabs are Jellyfin's
own libraries (`UserViews`), music, photos and books left out, so a library
added in Jellyfin appears by itself. Each tab starts with "Fortsätt titta"
(what was begun) and then holds the library's films or series as posters, or
a home video library's folders and clips. A on a film, an episode or a clip
opens its page: the picture, year, length and overview, Spela or "Fortsätt
från …" and "Spela från början", and, when there is a choice, Ljud and
Undertexter (A steps through them). Which sound and subtitles are chosen
first is Jellyfin's call, from the user's own settings. A series opens on
the first season not finished, its seasons as buttons above the episodes.
The search field (Y opens the keyboard) and the start page's search find
films, series, episodes and clips by name.

Videos play in **mpv**, not Chromium, started by the daemon
(`daemon/pioneertv/video.py`) as games are: Chromium on the Pi cannot decode
HEVC or 10-bit video, and mpv decodes it in hardware (1080p HEVC 10-bit with
`--hwdec=drm --vo=gpu --profile=fast`: no dropped frames at about 22 % CPU;
plain `--vo=gpu` dropped about nine a second). mpv streams the file as it is
from Jellyfin (`/Videos/<id>/stream?static=true`), so nothing is
transcoded; it keeps a minute ahead in its cache, since the 1080p HEVC files
need about 4.5 Mbit/s and Jellyfin delivered about 5.3 to the box. The API
key goes to mpv in its config file (`/var/lib/pioneer-tv/video/mpv/`,
readable by the kiosk user alone), never on its command line.

While a video plays: A, B or X pauses and resumes, with the timeline shown;
left and right seek ten seconds, L1 and R1 a minute; holding B stops; Home
opens the overlay's quick menu over the video, which pauses it until the
menu closes; holding Home stops and goes home. Nothing plays on by itself,
not even the next episode: at the end the screen goes black and says "Tryck
B för att fortsätta". Jellyfin hears what plays every ten seconds, and when
mpv stops the position is written to the user's own data (the reports come
from the API key, which is no user, and move nobody's "Fortsätt titta"):
past 90 % the video counts as seen, before 5 % nothing is kept, as in
Jellyfin itself. The panel planned for pausing (Fortsätt, Ljud,
Undertexter) will be drawn by the overlay; until then mpv's own timeline
shows.

Measured on the box in October: a 1080p HEVC episode decoded in hardware
(`hevc-drm`), no dropped frames, mpv at about 18 % CPU, a cache about 40
seconds ahead.

## Updating the box

Start → Meny → **Uppdatera systemet** checks GitHub and, only if there is
something new, pulls it, reinstalls and restarts the daemon and Chromium. The
screen goes blank for a few seconds. If nothing is new it just says so. The
System page in settings shows the installed commit, lists the incoming commits,
has an install button with a live log, and a "reinstall anyway" for when the
Pi is up to date but broken. The update runs as its own systemd unit
(`pioneer-tv-update`), so it survives restarting the daemon that started it;
its log is under Loggar. The installer records the clone path in
`/etc/pioneer-tv/repo`, so keep the clone you installed from, and keep it on the
branch you want to follow.

## Logs and CEC debugging

Start → Meny → **Loggar** opens a log sheet over whatever is on screen. Left
and right switch between the daemon, the display, the updater, Bluetooth,
NetworkManager, Tailscale and the CEC trace; up and down scroll; A refreshes.
The daemon and CEC tabs follow live. The CEC trace shows every command the
daemon sends (`>>`) and everything it hears on the bus (`<<`), so a TV remote
press that does nothing can be traced to either "never arrived" or "arrived
but is not mapped".

The TV page in settings has the same trace, the bus topology from `cec-ctl -S`
(the Pi should appear as a Playback Device and the TV as logical address 0),
test buttons, and a box for raw `cec-ctl` arguments.

## Working on the home screen without a Pi

The quickest way is the preview server, which serves every screen straight
from the repo, uncached:

```
python3 dev/preview.py        # http://localhost:5178/
```

Its index links to the launcher in TV mode (also with the keyboard, the quick
menu or a toast open), the settings page with its mock data, and a specimen
of the Maskinrepubliken design system in its three themes. The design system
is vendored in `design/maskinrepubliken/`; after pulling a new `tokens.json`,
run `python3 dev/tokens-css.py` to regenerate `tokens.css`.

The Film & serier page (http://localhost:5178/film) runs against Jellyfin as
the Musik pages do; Spela needs the box.

The Spel pages (http://localhost:5178/spel) run against a real RomM: the
preview forwards `/romm/` like the daemon does, with the address and key
from `ROMM_URL` and `ROMM_API_KEY`, or from `~/.config/pioneer-tv/romm.env`
holding those two lines. Keep the key in that file, not in the repo.

Without the server, everything in `extension/` also works as plain files. Open

```
extension/launcher/index.html?tv=1
```

in Chrome. Arrow keys navigate, Enter selects, Escape goes back. `?tv=1` turns
on TV mode so Enter on the search field opens the on-screen keyboard. Edit
`launcher.css` (tokens at the top), `launcher.js` and `default-services.js`;
reload. The page is laid out on a 1280x720 canvas in `vw` units, so a laptop
window looks like the TV. Drop logos in `extension/launcher/logos/` and set
`logo` on a service to use them instead of the letter glyph.

To try the extension parts on real sites, load `extension/` as an unpacked
extension at `chrome://extensions` (developer mode). Then any page gets the
spatial navigation and the overlays, and these shortcuts work:

| Shortcut | Action |
| --- | --- |
| Alt+Shift+H | Launcher (home) |
| Alt+Shift+K | Toggle on-screen keyboard |
| Alt+Shift+M | Toggle quick menu |

The launcher is at `chrome-extension://dpigdefepjjejbkidlabpjlnleidgjaf/launcher/index.html`
(the ID is fixed by the key in the manifest).

## Design

The UI follows Maskinrepubliken's design system, vendored in
`design/maskinrepubliken/` (its brand book is `README.md` there, in Swedish).
Paper is the ground, ink is what you read with, ochre is the one signal; there
are no shadows, gradients or see-through tones, and nothing moves except in
answer to a button. Four voices, bundled in `extension/fonts/` under the SIL
Open Font License: IBM Plex Sans for everything you press or fill in, Fraunces
for what you read and for card titles, IBM Plex Mono for every number and
machine word, and Rubik Black for a page heading.

`dev/tokens-css.py` turns the system's `tokens.json` into
`extension/content/tokens.css`, where every token is prefixed `--pioneertv-`
because the same styles run inside every website the box opens.
`extension/content/paper.css` holds the shared primitives (cards, labels, key
caps). Focus is a solid ink ring with air around it, drawn thicker than the
system's 2 px so it reads across a room, plus an ochre marker on the focused
launcher tile. A status is never colour alone: each one carries a filled or
empty hole and a word.

The service illustrations in `extension/launcher/art.js` predate the system
and are not yet redrawn to it.

## Board and video mode

Pioneer TV runs on a Raspberry Pi 4 with 4 GB; the installer warns on anything
else and carries on. The window is 1280x720: players cap stream quality to the
window size, and 1080p in a browser drops frames on this board under every
flag set we measured. A TV without a 720p mode (many only offer 1080p and
1360x768) is asked for a custom 1280x720 mode (session.sh, `wlr-randr`). The size is written to
`/etc/pioneer-tv/board.env`. Chromium composites and rasterises on the GPU;
the flags can be overridden with `PIONEER_TV_GPU_FLAGS` in `chromium.env`.
A Pi 3 was tried first and was too slow for Cineasterna's software-decoded
Widevine video; it is no longer supported.

The box is never overclocked. Both boots at 2.0 GHz (`over_voltage=6`, GPU at
600 MHz) in October left damaged files on the SD card, and the card had to be
replaced. The installer takes any `arm_freq`, `over_voltage` and `gpu_freq`
lines out of `config.txt`. Games that do not keep up are made lighter instead
(the N64 runs at 320x240).

## The display: labwc

The screen is [labwc](https://labwc.github.io/), a small wlroots compositor,
run by `pioneer-tv-display.service` as `labwc -C /opt/pioneer-tv/system/labwc
-S /opt/pioneer-tv/system/session.sh`. Its config (`system/labwc/rc.xml`)
makes it a kiosk: every window fills the screen without a frame, and there
are no key bindings, so Alt+F4 or Alt+Tab on a keyboard plugged in for a DOS
game do nothing. `session.sh` sets the TV to 1280x720 with `wlr-randr`,
starts the overlay and then Chromium; when Chromium exits the session ends,
labwc with it, and systemd restarts the display.

labwc replaced Weston in October because Weston has no way to draw one
client over another, which the overlay needs. Chromium also plays cleaner on
it: SVT1 at 720p dropped no frames after warming up, against about 4 % on
Weston. Weston (`pioneer-tv-weston.service`) stays installed but switched
off until labwc has proved itself; enabling it again and disabling
`pioneer-tv-display` goes back, and the box then works as before without the
overlay. Weston's two quirks no longer apply on labwc: the abort on the first
mouse cursor ([The pointer](#the-pointer)) and its atomic modesetting, which
failed on the Pi 4 and had to be switched off (`WESTON_DISABLE_ATOMIC=1`).

To look at the screen from SSH, as `pi`:

```
export XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0
grim shot.png                          # a screenshot of everything, the overlay included
wlr-randr                              # outputs and modes
wlr-randr --output HDMI-A-1 --off      # black until --on or the display restarts
```

## The overlay

`system/overlay.py` is a transparent WebKitGTK window on labwc's overlay
layer (wlr-layer-shell, through gtk4-layer-shell), above every other window:
Chromium, RetroArch and, later, mpv. It shows the daemon's
`/ext/overlay/index.html` (`extension/overlay/`), which uses the same `hud.js`
as the pages for the quick menu and the toasts, so they look the same over a
game as over a web page. A page that does not load (the daemon not up yet) is
tried again every three seconds.

Who gets Home, Y and B is decided in the daemon (`daemon/pioneertv/overlay.py`):
the overlay while it is connected, a page's own menu while one is open (the
game player's pause panel, the start page's Live list), the page otherwise.
Toasts go to the overlay whenever it is there. The overlay's window takes the
keyboard (layer-shell `EXCLUSIVE`) only while its menu is open, so the rest
of the time every key goes to the window below and the overlay is only seen.
What the menu cannot do itself (home, back, reload, the keyboard, settings)
it asks the page to do through the daemon. Opening the menu broadcasts
`media: pause`, and the page pauses its video and audio; closing it resumes
them. Without the overlay (on Weston, or with it down) the pages draw their
own menu and toasts as before.

The login session gives every process the ambient capability
`CAP_WAKE_ALARM`, and with it bubblewrap refuses to set up WebKit's sandbox
("Unexpected capabilities but not setuid"), so the page never loads.
`session.sh` therefore starts the overlay through `setpriv --inh-caps=-all
--ambient-caps=-all`. Do not switch WebKit's sandbox off instead.

**Status, October 2026.** The overlay starts and connects. The menu, keys
reaching it, the relays, pausing and resuming media, and the toasts are not
yet verified on the box. (The box went dark during the first test of the
menu; that was a power cut, not the overlay.)

## When the box hangs

The installer arms two guards:

- **The hardware watchdog.** `dtparam=watchdog=on` in `config.txt` and
  `RuntimeWatchdogSec=15s` (`system/watchdog.conf`, in
  `/etc/systemd/system.conf.d/`): systemd pets the board's watchdog, and if
  the whole box hangs the board resets itself after 15 seconds. A kernel
  panic reboots after 10 (`kernel.panic`).
- **A journal that survives.** The journal is kept on the card
  (`system/journald.conf`), so the boot before a reset or a power cut can be
  read: `journalctl -b -1 --no-pager`, and `journalctl --list-boots` for
  which boots there are.

After a reset, look in `journalctl -b -1 -k` for vc4, v3d, "hung task", OOM
and undervoltage, in `journalctl -b -1 -u pioneer-tv-display` for labwc and
the overlay, and at `vcgencmd get_throttled`.

## The pointer

Weston 14 aborted (an assertion in backend-drm/state-propose.c) the first time
any client showed a mouse cursor, and none of Weston's switches avoided it. So
the box has no pointer device at all, and still has none on labwc: the daemon streams right-stick motion to the extension, which draws its
own pointer (`cursor.js`), delivers hover and clicks to what is under it, and
scrolls when pushed against the top or bottom edge. A clicks at the pointer
for a few seconds after it last moved, and is the normal "select" otherwise.
`cursor.css` also hides any system cursor in case a real mouse is plugged in.
The stick is sampled at 60 Hz by the daemon; the extension sums the steps and
applies them once per animation frame, and runs the hit test behind hover at
most every 80 ms, so a busy page does not queue up pointer motion.

## Overlays and fullscreen

A page in fullscreen shows only its fullscreen element, which the browser puts
in its top layer; nothing else on the page is drawn. So every overlay (quick
menu, keyboard, log viewer, toasts, the pointer) is a popover, mounted with
`M.bridge.mount()`, which joins the top layer above the player; the pointer and
the toast are re-stacked to stay on top. While a menu, keyboard or log viewer
is open in fullscreen, Escape is held with the Keyboard Lock API: B sends
Escape, and without the lock the browser leaves fullscreen instead of the
overlay closing (held for two seconds, Escape still exits). The lock is let go
only after the key is up. B with nothing open leaves fullscreen as usual. The
keyboard leaves fullscreen first when its text field is outside the player, so
what is typed can be seen. In fullscreen the browser's hit test does not see
the overlays, so the pointer searches them itself.

SVT1's live player throws its fullscreen element away every so often and
builds a new one. `bigscreen.js` tells that apart from leaving fullscreen on
purpose (the old element is gone from the page) and takes the new player
fullscreen again.

## Sound

Audio goes to the TV over HDMI through PipeWire, which runs as the kiosk user
(`loginctl enable-linger` keeps it up from boot). A WirePlumber rule in
`system/wireplumber-pioneer-tv.conf` disables the 3.5 mm jack and prefers
HDMI0, and the Chromium start script waits for the sound server before
launching so Chromium binds to it rather than raw ALSA. Volume is the TV's,
over CEC; Chromium itself stays at 100 %. To check from a shell as `pi`:
`XDG_RUNTIME_DIR=/run/user/1000 wpctl status`.

## Performance notes

- Wi-Fi power saving is turned off by the installer (NetworkManager
  `wifi.powersave = 2`); on the Pi's radio it causes the latency spikes that
  make players stall and drop to low quality. Ethernet, or a 5 GHz network,
  is still the real fix for streaming.

- Streams are kept on H.264. Chromium says yes to every codec it can decode
  in software, so SVT Play served AV1, which the Pi 4 has no hardware for:
  four `dav1d` threads for a 540p stream, one frame in eight dropped, and a
  pointer that lagged behind the stick. `extension/content/codecs.js` runs in
  the page's own world before any of its scripts and answers the codec
  queries (`MediaSource.isTypeSupported`, `canPlayType`,
  `mediaCapabilities.decodingInfo`) with H.264 only. The same stream then
  decodes at well under a core with no drops, and Jellyfin transcodes
  anything else on the server, which is what we want. Video decode itself is
  software (`--disable-accelerated-video-decode`): the V4L2 decoder wedges on
  every resolution change, and an adaptive player on weak Wi-Fi changes
  resolution constantly. Re-measured on Chromium 153 rpt1, which fixed the
  decoder's VideoCore hang: hardware decode still stalled twice in four
  minutes, dropped 11% of frames against 4% for software, and saved no CPU.
  `PIONEER_TV_VIDEO_DECODE=hardware` in `chromium.env` retries it on a newer
  build.

- Players cap stream quality to the window size, so the 1280x720 video mode is also
  the quality ceiling. Widevine content (Cineasterna) is always software decoded.
- Chromium's disk cache lives in RAM (`/dev/shm`). Never let the SD card sit
  in the playback path.
- Jellyfin is reached over Tailscale at the address in the service config. Set
  its web client's playback quality so the server transcodes to H.264 rather
  than sending HEVC, which the Pi's browser cannot decode in hardware.
- Check `chrome://gpu` for "Video Decode: Hardware accelerated". If it is not,
  unprotected H.264 (SVT Play, Jellyfin) is software decoded too.
- If Chromium dies, `session.sh` ends, labwc exits with it and systemd
  restarts the whole display, which is faster and cleaner than a hung browser.

## Verify these against the live sites

- Jellyfin Web's search route is `/web/#/search.html?query=` on 10.9 and 10.10.
- SVT Play's is `/sok?q=`.
