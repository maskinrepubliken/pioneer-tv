# Pioneer TV

Maskinrepubliken's Raspberry Pi 4 TV box for a 32" TV: Cineasterna, SVT Play, Jellyfin and RomM as
web pages in a kiosk Chromium on Weston, driven by a Bluetooth gamepad, with
HDMI-CEC for the TV's volume and power.

The box does not play video itself. Chromium does, with Raspberry Pi's Widevine
build for Cineasterna. Pioneer TV is everything around that:

| Part | What it does |
| --- | --- |
| `extension/` | Chromium extension: the launcher page, d-pad spatial navigation on any site, an on-screen keyboard for search, a quick menu and toasts. |
| `daemon/` | Python daemon: gamepad → virtual keyboard and mouse (uinput), HDMI-CEC volume and power, TV remote passthrough, system status, a settings page with JSON API, WebSocket bridge to the extension. |
| `system/` | Weston kiosk config, Chromium start script, systemd units, udev rule and the install script. |

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

## Designing the launcher (no Pi needed)

The quickest way is the preview server, which serves every screen straight
from the repo, uncached:

```
python3 dev/preview.py        # http://localhost:5178/
```

Its index links the launcher in TV mode (also with the keyboard, the quick
menu or a toast open), the settings page with its mock data, and a specimen
of the Maskinrepubliken design system in its three themes. The design system
is vendored in `design/maskinrepubliken/`; after pulling a new `tokens.json`,
run `python3 dev/tokens-css.py` to regenerate `tokens.css`.

Without the server, the pages also open as plain files:

Everything in `extension/` runs as plain files, so open

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

## Game mode

On RomM's player (and any fullscreen page with a big canvas) the extension
tells the daemon to leave the pad alone, so the page sees it as a real gamepad
through Chromium's Gamepad API and the emulator's own mapping applies. No key
translation, no pointer. Guide still goes home, holding Start opens the quick
menu, holding Select toggles the TV; while an overlay is open the pad drives it
as usual. Game mode ends when the page goes away or stops sending heartbeats.

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

## Games (RomM, EmulatorJS)

A service with `mode = "game"` (the id `romm` counts as one) puts the box in
game mode while its pages are on screen: the daemon stops turning pad buttons
into arrows, Enter and Escape, so the emulator reads the pad itself through
the browser's Gamepad API and nothing else reacts. Guide still goes home,
holding Y (or Start) still opens the quick menu, and the triggers still do TV
volume. The extension leaves the page's keys alone too. A toast announces the
mode when the page opens.

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
| Select | Status toast; hold to toggle TV power |
| Guide / PS / Xbox | Home. Also wakes the TV and switches input when the pad connects |

All of it is in `/etc/pioneer-tv/config.toml` (see `daemon/config.example.toml`).
The TV remote works too: keys the TV forwards over CEC are mapped in `[cec.remote]`.

## Installing on the Pi

A Raspberry Pi 4 with 4 GB, Raspberry Pi OS Lite, 64-bit, Bookworm or Trixie, user `pi`, wired Ethernet.

```
git clone -b main https://github.com/maskinrepubliken/pioneer-tv.git
cd pioneer-tv
sudo system/install.sh
sudo reboot
```

The box follows the branch it was installed from; `main` is the one to use.

The installer pulls in Weston, Chromium, Widevine, v4l-utils, BlueZ, aiohttp and
evdev, copies the repo to `/opt/pioneer-tv`, installs the systemd units,
sets the video mode (1280x720), enables
zram and sets the CPU governor to performance at
boot, and sets the boot target to graphical. Rerunning it is safe. Pair the first gamepad from the shell (later ones from the settings page):

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
journalctl -fu pioneer-tv-weston        # Weston output
tail -f ~/.pioneer-tv/chromium.log      # Chromium output (extension load errors land here)
sudo python3 -m pioneertv -v            # run the daemon in the foreground (from /opt/pioneer-tv/daemon)
curl -s localhost:8765/api/status     # what the settings page sees
cec-ctl -d /dev/cec0 --to 0 --standby # TV off, straight from the shell
vcgencmd get_throttled                # 0x0 means the TV's USB port is enough
```

## How it fits together

```
 gamepad ──evdev──▶ daemon ──uinput──▶ Weston ──▶ Chromium (kiosk, --load-extension)
                      │                              ├─ content scripts: spatial nav, keyboard, HUD
                      │◀────── ws://127.0.0.1:8765/ws ┤  background: single tab, home, dev shortcuts
                      │──── http://127.0.0.1:8765/ ───▶│  launcher page: services from config
                      └──cec-ctl──▶ /dev/cec0 ──▶ TV     settings page: status, Wi-Fi, Bluetooth, services
```

Navigation keys go through a virtual keyboard so every page, and Chromium
itself, sees ordinary key presses. Buttons that mean something to the shell
(home, menu, keyboard) go over the WebSocket as events. CEC is only ever
touched by the daemon.

## Board

Pioneer TV runs on a Raspberry Pi 4 with 4 GB; the installer warns on anything
else and carries on. The window is 1280x720: players cap stream quality to the
window size, and 1080p in a browser drops frames on this board under every
flag set we measured. A TV without a 720p mode (many only offer 1080p and
1360x768) gets Weston's scaling, which is cheap. The size is written to
`/etc/pioneer-tv/board.env`. Chromium composites and rasterises on the GPU;
the flags can be overridden with `PIONEER_TV_GPU_FLAGS` in `chromium.env`.
A Pi 3 was tried first and was too slow for Cineasterna's software-decoded
Widevine video; it is no longer supported.

## Known board quirk: no hardware cursor

Weston 14 aborted (an assertion in backend-drm/state-propose.c) the first time
any client showed a mouse cursor, and none of Weston's switches avoided it. So
the box has no pointer device at all: the daemon streams right-stick motion to the extension, which draws its
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

- Players cap stream quality to the window size, so the video mode is also the
  quality ceiling: 1080p on a Pi 4, 720p on a Pi 3. Widevine content
  (Cineasterna) is always software decoded.
- Chromium's disk cache lives in RAM (`/dev/shm`). Never let the SD card sit
  in the playback path.
- Jellyfin is reached over Tailscale at the address in the service config. Set
  its web client's playback quality so the server transcodes to H.264 rather
  than sending HEVC, which the Pi's browser cannot decode in hardware.
- Check `chrome://gpu` for "Video Decode: Hardware accelerated". If it is not,
  unprotected H.264 (SVT Play, Jellyfin) is software decoded too.
- Weston has `watch=true` on the autolaunch: if Chromium dies, Weston exits and
  systemd restarts both, which is faster and cleaner than a hung browser.

## Verify these against the live sites

- Jellyfin Web's search route is `/web/#/search.html?query=` on 10.9 and 10.10.
- SVT Play's is `/sok?q=`.
