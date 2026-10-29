# Pioneer TV guide

Everything that does not fit in the [README](README.md): how to use the box, how it is put together and
what was learned on the way.

## Contents

- [Gamepad mapping](#gamepad-mapping)
- [How it fits together](#how-it-fits-together)
- [The pages](#the-pages)
- [Installing in detail](#installing-in-detail)
- [Settings and status](#settings-and-status)
- [The TV (HDMI-CEC)](#the-tv-hdmi-cec)
- [Games](#games)
- [Music](#music)
- [Film and series](#film-and-series)
- [Video on other sites](#video-on-other-sites)
- [Covers on the box](#covers-on-the-box)
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
| X / Square | The filled button, wherever there is one: on the box's pages (Spela, Blanda allt, Försök igen, the settings page's Spara), the overlay's menus (Fortsätt, Hem) and the on-screen keyboard (OK); unmarked (one learns it), the browse page's legend says it. Elsewhere play, pause (Space) or the page's own use. Hold: undo (Ctrl+Z), e.g. what X took off a list |
| Y / Triangle | On-screen keyboard (on a pad without Home, hold: quick menu) |
| L1, R1 | Shift+Tab, Tab (previous, next focusable) |
| L2, R2 | TV volume down, up (CEC, repeats while held) |
| Right stick | Mouse pointer; click on the stick to left-click. What it (or a mouse) is over is drawn as selected and takes the focus, so the d-pad goes on from there |
| Start | Nothing on the box; in a game, the console's Start |
| Select | A toast saying whether the page reaches the daemon, and the page's host (a check left from debugging) |
| Guide / Home / PS / Xbox | The only way to the menus: the quick menu, over whatever is on screen (press again to close it); in a game or a film, the pause panel instead. Hold: the home page. Also wakes the TV and switches input when the pad connects |

In a film or an episode playing in mpv, A, B and X pause it and open its
pause panel, left and right seek ten seconds, L1 and R1 a minute, and
holding B stops it ([Film and series](#film-and-series)).

All of it is in `/etc/pioneer-tv/config.toml` (see `daemon/config.example.toml`).
The TV remote works too: keys the TV forwards over CEC are mapped in `[cec.remote]`.

## How it fits together

```
 gamepad ──evdev──▶ daemon ──uinput──▶ labwc ──▶ Chromium (kiosk, --load-extension)
                      │                   │          ├─ content scripts: spatial nav, keyboard, HUD
                      │                   │          ├─ background: single tab, home, dev shortcuts
                      │◀── ws://127.0.0.1:8765/ws ───┤  home page: the services as tiles
                      │                   │             settings page: status, Wi-Fi, Bluetooth, services
                      │                   ├────▶ RetroArch (a game, started by the daemon)
                      │                   ├────▶ mpv (a film from Jellyfin, started by the daemon)
                      │◀── ws ────────────┴────▶ overlay (WebKit, top layer): main menu, pause panels, toasts, screensaver
                      └──cec-ctl──▶ /dev/cec0 ──▶ TV
```

Navigation keys go through a virtual keyboard so every page, and Chromium
itself, sees ordinary key presses. Buttons that mean something to the shell
(home, menu, keyboard) go over the WebSocket as events: the menu to the
overlay, Y to the page unless the overlay's menu is open
([The overlay](#the-overlay)). CEC is only
ever touched by the daemon.

## The pages

The box's own pages live in `extension/launcher/`, one HTML file per kind of
page, each with a folder of its own code; what several of them use is in
`shared/`, where the data comes from in `sources/`.

| Page | Code | What it is |
| --- | --- | --- |
| `index.html` | `home/` | Home: the services as tiles, Sök, Inställningar, the TV's off button |
| `browse.html` | `browse/`, `libraries/`, `players/` | One page for every library: `?library=spel`, `musik` or `film` |
| `game.html` | `game/` | A game on its way, before RetroArch covers the screen |
| `radio.html` | `radio/` | A Sveriges Radio channel |

The browse page draws every library the same way. A library
(`libraries/spel.js`, `musik.js`, `film.js`) only says what there is, from
its source (`sources/romm.js`, `sources/jellyfin.js`), as views of a few
kinds, made of items of one shape (`browse/cards.js`):

- **the shelf** (`browse/shelf.js`): sections one under the other; covers
  standing on shelves (`planks.js`: each at its own shape, its foot on the
  plank, its name on a label under it, as many to a shelf as there are
  columns and the next shelf under it, so nothing scrolls sideways), and
  type-only cards and buttons; a library's start, an artist, a search;
- **the stacks** (`shelf.js` layout `stacks`, `cards.js` stack): wholes
  as cards on paper, a collection, a playlist, an artist: its picture, or
  its first few in a pile, its name and a line under it;
- **the grid** (`browse/grid.js`): a long collection on the same shelves
  (or as stacks, `look: 'stacks'`: every artist),
  only the rows around the focus in the page (the planks are drawn behind
  the rows, so they are all there), L1/R1 a letter, Sök filtering it, the
  chosen one's info in a strip under the shelves when the library has it
  (so the shelves always run wall to wall); a console's games, every album;
- **the detail** (`browse/detail.js`): one thing, its picture, text,
  buttons, choices, tabs and a list; a film, a series, an album.

`browse/page.js` does the rest for all of them: the hash, the heading,
search, the legend, where the focus was, B. At the left is a column on the
sunken paper, as on the home page (`browse/rail.js`): Sök at the top, then
the library's ways in (`library.rail()`: Spel's consoles and collections,
Musik's Spellistor, Album and Artister, Film's libraries and the folders of
the one it is in), each a ring with its initial. With the focus in it, or a
pointer moving over it, it widens over the view and gives their names;
left from the view lands on the one the page is at. Search is a round
button, as on every page of ours (`pioneertv-round` in
`content/paper.css`): A on it, or Y anywhere, opens the on-screen keyboard
on a field out of sight; over a grid they filter it, elsewhere they
search the library. Either way the heading is alike: the words as the
title (over a grid with its name, "SNES: ”mario”") and how many were found
beside them ("3 träffar"), and when nothing was found only the title and
a bare dusty plank, a cobweb under its end, saying "Inga
träffar" in big type (`planks.js` dusty, also for a grid with nothing in
it), and the legend then offers no A. On a search Y says "ändra
sökningen", and L1/R1 are in the legend only where a grid has more than
two rows across more than one letter. B takes a filter away first. What plays is a player's:
`players/video.js` (mpv, through the daemon) and `players/audio.js` (in the
page, with "Spelas nu"). `shared/` has the canvas, the buttons and the
legend (`base.css`), the full-screen message (`screen.js`; on ink where
what comes next is dark, a game or a film starting or ending, Vilar; on
paper, as the page is, where a view is loading or cannot reach its source,
through `views.js`, X tries again, B goes back) and the services' illustrations (`art.js`). The old
addresses `spel.html`, `musik.html` and `film.html` go on to the browse
page.

## Installing in detail

The installer pulls in labwc, Chromium, Widevine, WebKitGTK (for the overlay),
v4l-utils, BlueZ, aiohttp and evdev, copies the repo to `/opt/pioneer-tv`, installs the systemd units,
sets the video mode (1280x720, or the TV's own 1360x768), leaves swap in compressed memory to
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
reached from the quick menu or the home page (Inställningar), where the spatial
navigation and on-screen keyboard work like on any other page; a USB keyboard
works too, and while one is plugged in the on-screen keyboard stays out of the
way. The quick menu shows the network, connected gamepads with battery, and
temperature at its foot; Tailscale is on the settings page only.
Its toasts are the overlay's, like every other (`POST /api/toast`).

Its tabs are in a column at the left, as on the browse pages (see "The
settings page's tabs"). There is no status tab: each part's status stands at
the top of its own tab (the network on Wi-Fi, Tailscale and whether RomM and
Jellyfin answer and take their keys on Tjänster, CEC and sound on TV,
thermals, power throttling and memory on System, the pads in Bluetooth's
list). Changes are saved to `/etc/pioneer-tv/settings.json` and applied
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
to `0.0.0.0` in `config.toml`, set an access key under System → Fjärråtkomst; non-local
requests must then carry it (`?token=` once, stored as a cookie).

## The TV (HDMI-CEC)

The daemon claims a CEC playback address and follows the bus, so the box and
the TV stay in step:

- A gamepad connecting wakes the TV and switches it to the Pi's input.
- Any pad button while the TV is off turns it on and does nothing else, so a
  press never lands on a screen nobody can see (`cec.wake_on_input`). It
  does so when the button is let go, and only if it was held less than
  1.5 seconds: holding Home switches an 8BitDo pad off, and that leaves the
  TV off (a pad gone with the button down never lets go, and wakes nothing).
- The TV going to standby sends the box back to the launcher and pauses any
  video, so the next time it wakes it is on the home page
  (`cec.home_on_standby`).
- The TV's own remote keys arrive over CEC and are mapped in `[cec.remote]`.

Both behaviours are toggles on the TV page in settings. The daemon also polls
the TV's power state every 30 seconds, because a set switched off with its own
remote does not always announce it.

Left alone, the box goes home, and with no pad connected the screensaver
comes over everything (the overlay draws it, `overlay/saver.js`): the
Mandelbrot set, generated without end, like an open fire
(`overlay/mandelbrot.js`, on the GPU at a third of the screen's width and
fifteen frames a second). It zooms in on one place along the set's edge,
out, and on to the next, a quarter of an hour a round. Nearly all of it is
ink; near the set's edge it glows as embers do, through rust to a dimmed
ochre, brightest at the foot of the screen, flickering gently (a few slow
waves out of step) while the edges waver upwards like the air over a
flame. On it, with no box behind it, a line of the Tao Te Ching
(`overlay/tao.js`, our own Swedish renderings) fills the screen, blended
into the fire (color-dodge: the letters glow where it glows and all but
vanish over the ink), and changes every three minutes. No clock, no date.

- **Anywhere but home**, after ten minutes without a button, the box goes
  home. A game held on its pause panel is quit on the way (its state is
  saved, as Avsluta does) and a film held on its panel is stopped (its
  position is saved); every menu in the overlay closes.
- **With no pad connected**, the screensaver, at once (within the
  daemon's five-second check). A pad switched on takes it away; so does a
  button on the TV's remote, for a moment only, as no pad is there. A pad connected keeps it away (8BitDo pads
  switch themselves off after a while, and then it comes).
- **The screensaver up five minutes**, the TV is turned off over CEC and
  the screensaver rests: "Vilar" in the full-screen message, nothing
  moving, until a button wakes the TV. The TV turned off with its own
  remote does the same.
- **Never while something plays**: a game running in RetroArch, a film
  running in mpv, or a page whose video or audio plays, in any of its
  frames, or that is in game mode; the count starts again when it ends. A
  game or a film held on its pause panel is not playing.

The daemon decides (`daemon/pioneertv/idle.py`): it sees every button, the
pointer and the pads coming and going, the pages tell it what plays and
when a real keyboard or mouse is used (`main.js`, `playing.js`), and the
extension tells it which page is on screen (`loaded`). The times are on the
TV page in settings (`ui.home_minutes`, `ui.tv_off_minutes`; 0 is never).

## Games

The Spel tile opens the browse page on top of [RomM](https://github.com/rommapp/romm)
(`browse.html?library=spel`, [The pages](#the-pages)): recently played;
Samlingar, each collection as a card (its first six covers in a pile, its
name and how many), A opening it; the
consoles in the column at the left, each by its pad (or its initial); each
console's games with covers; a game opens `game.html`, which has it
played. RomM's own Favourites collection (the one with `is_favorite`) is
not listed. On Senast spelade X takes a game off the list at once, one
after the other;
holding X (Ctrl+Z) puts back the last one taken, then the one before.
RomM hears of a game off Senast spelade only after a minute, or when the
page goes away, so putting it back never touches it.

The pages never talk to RomM directly. They call `/romm/...` on their own
origin, and the daemon forwards that to RomM with the API key added; only
RomM's `/api/` and `/assets/` are reachable that way. That is why the tile
opens the pages from the daemon (`http://127.0.0.1:8765/ext/launcher/browse.html?library=spel`)
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
  (5 GB at most; the games played longest ago go first) and starts
  RetroArch as the kiosk user on the TV's display, over Chromium. A game
  resumes where it was left.
- **Pausing.** Guide in a game: RetroArch pauses where it is and the
  overlay draws the pause panel over the paused game: Fortsätt spela, Spara
  läge (a save point of its own), Ladda läge, Starta om, TV-volym (left and
  right step the TV's volume, A mutes) and Avsluta. Each is one of
  RetroArch's own commands (`PAUSE_TOGGLE`, `SAVE_STATE`, `LOAD_STATE`,
  `RESET`), so carrying on is instant; B or Guide carries on, holding B
  quits. While the panel is open the pads drive it, not the game. (Should
  the overlay be down the game still holds, with nothing drawn: Guide
  carries on, holding B quits.) Holding Guide goes home; the game is saved
  as RetroArch quits.
- **Pads.** While a game runs the pads are RetroArch's (with an autoconfig
  for the 8BitDo Ultimate 2C); player 1 is the pad last used. The button
  marked A plays the console's A and B its B, by the letters rather than
  the places (`LETTERS` in games.py): on the SNES and NES all four match,
  on the N64 A and B do, and on the Mega Drive A and B do and C is on X. A real
  keyboard plugged in goes to DOS games; RetroArch's own hotkeys are off.
- **Saves** stay on the box (`/var/lib/pioneer-tv/games/states`, `points`,
  `saves`), not in RomM. Games are always played on the box; there is no
  switch for it.

Pages the daemon serves under `/ext/` carry their own copies of the shell
scripts, so the manifest keeps the extension's content scripts off them, and
their bridge talks to the daemon over `/ws` directly.

A service with `mode = "game"` puts the box in game mode while its pages are
on screen, and so does any full-screen page with a large canvas. In game mode the daemon stops turning
pad buttons into arrows, Enter and Escape, so the emulator reads the pad itself through the browser's
Gamepad API and its own button mapping applies. The extension leaves the page's keys alone too.

A few buttons still belong to the box: Guide opens the quick menu and holding it goes home, and the
triggers set the TV volume. Start is the game's, held or not. While an overlay is open the pad
drives it as usual. Game mode ends when the page goes away or stops sending heartbeats.

## Music

The Musik tile opens the browse page on top of [Jellyfin](https://jellyfin.org/)'s
music library (`browse.html?library=musik`): Blanda allt, then your
playlists as cards (like Spel's collections), with Album and Artister in
the column at the left; Album is shelves of covers, Artister their names alone, long, in three columns (they have no pictures; grid.js look names); a playlist or an album lists its songs beside
its cover, with Spela and Blanda; an artist has Blanda allt (filled, X)
and Spela allt at the heading's right, round buttons as Sök is with the
name beside (a view's `actions`, drawn in the heading by `page.js`; Musik's
start has its Blanda allt there too). Album and Artister are grids like a
console's games: L1/R1 jump a letter, Sök filters them. Sök (the round
button, or Y) searches songs, albums and artists. Films, series and clips have
their own page ([Film and series](#film-and-series)).

A song plays in the page itself and "Spelas nu" covers the screen: A or X
pauses, L1/R1 go to the previous and next song, left and right seek ten
seconds, B goes back to browsing while the music plays on, and X brings
"Spelas nu" back (on a view without a filled button: there X is the
button's). The music lives only as long as the page: leaving it (Home
included) stops it. A song that cannot be played is skipped after a few
seconds; a stream that stalls for ten seconds is picked up again where it was.
Jellyfin hears what plays (`Sessions/Playing`, shown on its dashboard), and
a song played to its end is marked played for the user
(`UserPlayedItems`), so play counts follow the box: the reports come from
the box's API key, which is no user, and count for nobody.

As with RomM the pages never talk to Jellyfin directly: `/jellyfin/...` on
their own origin is forwarded by the daemon with the API key added, and only
the library, the images, the audio stream and those reports are reachable.
Jellyfin sends a song as it is when Chromium can play it and transcodes it to
MP3 otherwise, so the Pi does no work. Set Jellyfin's address (without
`/web/`), an API key (Jellyfin: Dashboard → API Keys) and, if not the first
administrator, the user whose playlists to show under Inställningar → Jellyfin.

## Film and series

The home page shows the Film & serier service as three tiles, Film,
Serier and Videor (`shared/services.js` split; Film a clapperboard and a
reel, Serier the old tile's shelf of cases in its colour, Videor a globe
with a play button, videos off the internet), each opening the film pages on one section of Jellyfin
(`browse.html?library=film&section=movies`, `tvshows`, `homevideos`: the
libraries of that kind, the rest counted as videos). A section starts on
Upptäck: Fortsätt titta; for series Nästa avsnitt first (`Shows/NextUp`);
Senast tillagt (`Items/Latest`); for films Jellyfin's recommendations from
what was watched ("Eftersom du såg …", "Med …", `Movies/Recommendations`);
and videos have Kanaler in the column, their folders as Spel's
collections are (a card each, its newest clips in a pile; opened, the
clips in a grid). Its column has Upptäck, Alla filmer
or Alla serier (a grid with letter jumps and the text under the shelves)
and the genres (`Genres`), by their Swedish name with an icon each, one
genre where Jellyfin has it under two names (Comedy and Komedi); a genre
is a grid as Alla is; Samlingar, Jellyfin's collections (box sets), when
it has any. Sök keeps to the section, and the overlay's Sök offers the
three. An address without a section is Film. The pages are served by the
daemon like Musik
(`http://127.0.0.1:8765/ext/launcher/browse.html?library=film`); the installer moved a tile
that still opened Jellyfin's web UI over to it once. A section's libraries
are Jellyfin's own (`UserViews`) of its kind, music, photos and books left
out, so a library added in Jellyfin appears by itself; with more than one
the column lists them too. A on a film, an episode or a clip
opens its page: the picture, year, length and overview, Spela or "Fortsätt
från …" and "Spela från början", and, when there is a choice, Ljud and
Undertexter (A steps through them). Which sound and subtitles are chosen
first is the language chosen last time in the same series (or film), on
the detail page or in the pause panel (`/var/lib/pioneer-tv/video/choices.json`),
and otherwise Jellyfin's call, from the user's own settings. A series opens on
the first season not finished, its seasons as buttons above the episodes.
Sök (the round button, or Y) and the home page's Sök find
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

While a video plays: A, B or X pauses it and the overlay shows the pause
panel over the picture, with the time at the top left: Fortsätt, Ljud and
Undertexter (A steps to the next track, at once; mpv's own list, named by
language), TV-volym and Sluta titta. B, X or Home carries on. Left and
right seek ten seconds, L1 and R1 a minute; holding B stops; Home opens the
pause panel too, as in a game (the main menu's choices would act on the
page hidden below); holding Home stops and goes home. Without the overlay, A, B and X only pause and
resume, with mpv's timeline. Nothing plays on by itself, not even the next
episode: at the end the screen goes black and says "Tryck B för att
fortsätta". Jellyfin hears what plays every ten seconds, and when
mpv stops the position is written to the user's own data (the reports come
from the API key, which is no user, and move nobody's "Fortsätt titta"):
past 90 % the video counts as seen, before 5 % nothing is kept, as in
Jellyfin itself.

Measured on the box in October: a 1080p HEVC episode decoded in hardware
(`hevc-drm`), no dropped frames, mpv at about 18 % CPU, a cache about 40
seconds ahead.

## Video on other sites

A site's own player (SVT Play, Cineasterna, any page with a video) is hard
to drive from a pad, worst in fullscreen. `content/webvideo.js` runs in
every frame of a page (a film service's player may sit in a frame of its
own), finds its main video (the largest on screen) and tells the daemon how
it is, which passes it to the overlay (`webvideo`, daemon/pioneertv/overlay.py).
Home over such a page opens that video's panel instead of the quick menu:
Fortsätt, Spola (left and right, 10 s a press, 30 s held; a live stream
within what it keeps), Från början, Undertexter (when the video has text
tracks of its own), TV-volym, Meny (the quick menu, one step in) and Sluta
titta (back). The panel's choices go back to the frame they are for. The
menu pauses the video as it does every page's (the media event, the
frames' too), and closing it carries on; a seek from the panel leaves it
paused. The open panel follows the video by the words of its rows only,
in place (drawn anew at every word from the page, the whole menu went and
came back, which blinked over SVT Play), and where a seek was put stands
until the page has got there. While the video fills the screen
(fullscreen, or bigscreen.js's promotion) the pad drives the `<video>`
itself, not the site's keys: left and right seek, A or X pauses or plays,
up and down do nothing; where it is, Home's panel says. Where we know the
site's own controls they are hidden meanwhile (`SITE_UI` in webvideo.js; SVT Play's `desktopUi` and
top bar, which came and went at every press); its subtitles stay. The
video itself is never touched beyond play, pause and its time, so it works
for what the site protects too.

## Covers on the box

The daemon keeps RomM's covers and Jellyfin's posters, stills, album and
artist pictures on the box's own disk (`daemon/pioneertv/covers.py`,
`imagecache.py`, in `/var/lib/pioneer-tv/images`), made small on the way:
at most `images.max_px` (600) on the longer side, as WebP (with Pillow,
`python3-pil`; without it, as they came). A page's picture comes from the
disk when it is there; else through the `/romm/` or `/jellyfin/` proxy
from the server, kept on the way. Each picture is kept once whatever size
a page asks for (Jellyfin is asked for it at the size kept), by its path
and its version (RomM `?ts=`, Jellyfin `&tag=`), so a changed picture is
fetched anew. Every night at `images.prefetch_at` (03:30) the daemon
fetches every one there is, one at a time and waiting while a film or a
game plays: every game's two covers, and the pictures of every album,
artist, playlist, film, series, season, episode and video. They are kept
up to `images.cache_mb` (10 GB); past it the ones unused longest go. The
System page in settings shows how many and how much, how the last night
went, and can empty it. The games downloaded to play are kept up to
`games.cache_mb` (5 GB) the same way (saves and states are not counted).

A thing without a cover gets a mockup instead (`launcher/shared/mockups.js`,
through `views.cover(..., { mock })`): empty packaging of its kind with its
name on it, drawn in SVG. A game gets its console's own box, drawn as close
to the real one as a drawing gets (the NES's black box with its seal, the
SNES and N64 lying down, the Mega Drive's red grid, PlayStation's black
spine, the Game Boys' cartons, and so on; `forConsole(slug)` maps RomM's
platform slugs). An album gets a record in its sleeve, a film or series a
case, an episode or clip a frame of film. `dev/mockups.html` shows them all;
the stand-in data (`dev/mock.py`) leaves some covers out so the catalogue
shows them in place.

## Updating the box

Home → Meny → **Uppdatera systemet** checks GitHub and, only if there is
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

**Loggar** is a tab of the settings page (`#logs`). A button per part: the
daemon, the display, Chromium, the updater, Bluetooth, NetworkManager,
Tailscale and the CEC trace. The daemon and CEC logs follow live while shown. The CEC trace shows every command the
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

**The catalogue of every view** is at http://localhost:5178/katalog
(`dev/katalog.html`, `katalog.js`): every screen, menu, panel and toast,
each in the states it can be in (loading, starting, playing, paused, the
errors), drawn at 1280x720 from stand-in data (`dev/mock.py`: a small
library of films, series, music and games with drawn covers, and the
daemon's API), so it needs no server and no Pi. Click a view to see it
large and drive it with the keyboard (arrows, Enter for A, Escape for B,
space for X). The overlay's panels are drawn over a page or a picture, as
on the TV. A new view is one entry in `VIEWS` in `katalog.js`; a page opened
with `?mockerror=no_key`, `auth` or `down` gets that error from the
stand-ins. When `ROMM_URL` or `JELLYFIN_URL` is set, the real server
answers instead.

For working on a view: pick its group (`#grupp=snabbmenyn`, a link at the
top), so only that group's views are drawn, and keep the one you change
open large. A save under `extension/`, the settings page or `dev/` draws
the views in sight and the open one again within a second (the preview
server's `/__changes`); a change to the catalogue itself reloads it, a
change to `dev/mock.py` needs the preview server restarted. The toasts are
drawn small in the catalogue page itself, with the overlay's `toast.js`
and `toast.css`, so their group shows at once.

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
on TV mode so Enter on the search field opens the on-screen keyboard. The
pages are laid out on a 1280x720 canvas in `vw` units, so a laptop window
looks like the TV ([The pages](#the-pages)). Set `logo` on a service to show a
picture instead of its illustration on the home page.

To try the extension parts on real sites, load `extension/` as an unpacked
extension at `chrome://extensions` (developer mode). Then any page gets the
spatial navigation and the overlays, and these shortcuts work:

| Shortcut | Action |
| --- | --- |
| Alt+Shift+H | Launcher (home) |
| Alt+Shift+K | Toggle on-screen keyboard |
| Alt+Shift+M | Open the quick menu (in the overlay) |

The launcher is at `chrome-extension://dpigdefepjjejbkidlabpjlnleidgjaf/launcher/index.html`
(the ID is fixed by the key in the manifest).

## Design

**X is the filled button's.** Wherever there is a filled (ochre) button, X
presses it, whatever has the focus. The button itself is not marked (one
learns it); the browse page's legend says "X" and the button's name:
the browse page's (`browse/page.js`; Spela, Fortsätt från, Blanda allt,
Försök igen), the overlay's menus (`overlay/hud.js`; the filled
row: Fortsätt in a pause panel, Hem in the quick menu), the on-screen
keyboard's OK (A only types; there is no holding A for OK) and the settings
page's (`settings.js`). So a view has at most one filled button; a list's
own buttons (a network's Anslut, a pad's Para) are outlined: where a
button X does not press was filled, another is filled instead, never a
second X. Where there is
none, X keeps the page's own meaning (off Senast spelade, Spelas nu, pause).

The UI follows Maskinrepubliken's design system, vendored in
`design/maskinrepubliken/` (its brand book is `README.md` there, in Swedish).
Paper is the ground, ink is what you read with, ochre is the one signal; there
are no shadows, gradients or see-through tones, and nothing moves except in
answer to a button. The one motion is the focus ring's: on our own pages
(`html.pioneertv-own`) it closes in on what takes the focus, from a little
way out and clear, in a fifth of a second (`paper.css`, a transition, so
it outranks the rings' `!important`). Four voices, bundled in `extension/fonts/` under the SIL
Open Font License: IBM Plex Sans for everything you press or fill in, Fraunces
for what you read and for card titles, IBM Plex Mono for every number and
machine word, and Rubik Black for a page heading.

The legends at the foot of a page, the home page's and the on-screen
keyboard's draw the pad's buttons as they are on the pad (`icons.js` key,
`.pioneertv-kbd` in `paper.css`): A, B, X and Y round, L1 and R1 as
bumpers, the d-pad as a cross with the arms meant in ink, Hem as the pad's
round home button, always in the design system's colours (whichever pad
is in use).

`dev/tokens-css.py` turns the system's `tokens.json` into
`extension/content/tokens.css`, where every token is prefixed `--pioneertv-`
because the same styles run inside every website the box opens.
`extension/content/paper.css` holds the shared primitives (cards, labels, key
caps). Focus is a solid ink ring with air around it, drawn thicker than the
system's 2 px so it reads across a room, plus an ochre marker on the focused
launcher tile. A status is never colour alone: each one carries a filled or
empty hole and a word.

The service illustrations in `extension/launcher/shared/art.js` predate the system
and are not yet redrawn to it.

## Board and video mode

Pioneer TV runs on a Raspberry Pi 4 with 4 GB; the installer warns on anything
else and carries on. The window is 1280x720: players cap stream quality to the
window size, and 1080p in a browser drops frames on this board under every
flag set we measured. A TV whose own panel is HD ready (its preferred mode
1360x768 or 1366x768) gets that size instead: such a TV shows it pixel for
pixel, while a 720p picture it zooms in a few percent and cuts at the edges
(seen on the Philips, the column at the left half gone). The pages are laid
out in `vw`, so they fill either. A TV without a 720p mode (many only offer
1080p and 1360x768) is asked for a custom 1280x720 mode (session.sh,
`wlr-randr`). The size is written to
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
game do nothing. `session.sh` sets the TV to 1280x720 (or its own 1360x768) with `wlr-randr`,
starts the overlay and then Chromium; when Chromium exits the session ends,
labwc with it, and systemd restarts the display.

labwc replaced Weston in October 2026 because Weston has no way to draw one
client over another, which the overlay needs. Chromium also plays cleaner on
it: SVT1 at 720p dropped no frames after warming up, against about 4 % on
Weston. Weston is gone: the installer moves a box still on it over to
labwc and removes its unit, its config and its packages. (Its two quirks,
an abort on the first mouse cursor and atomic modesetting that failed on
the Pi 4, went with it.)

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
Chromium, RetroArch and mpv. It shows the daemon's `/ext/overlay/index.html`
(`extension/overlay/`), and it draws everything of the box's own over the
picture: every menu, every toast and the screensaver. The pages draw none of
them; a page's toast is sent to the daemon and on to the overlay
(`content/hud.js`). A page that does not load (the daemon not up yet) is
tried again every three seconds.

- **The quick menu** (`overlay/main-menu.js`): Home opens it over any
  window, the paper card at the right: Tillbaka, Hem, TV-volym,
  Tangentbord, Ladda om, Stäng av TV:n, Inställningar, and the box's status
  at the foot. Holding Home goes to the home page. B goes one step back,
  the last step closes it. A choice that opens a page punches its row of
  holes until the page has loaded (the extension says `loaded`). The TV's
  volume is L2 and R2 too (and a row in the pause panels).
- **The menu system** (`overlay/hud.js`): a stack of menus, each the paper
  card at the right; the pause panels of a game and a film are the same
  card. The d-pad moves to the nearest choice that way on screen.
- **The home page** (`launcher/index.html`, `home/home.js`) is a page of
  its own: Live (the channels) first, then the services (config
  `services`), as tiles of one size in two rows, the pad's legend under
  them; at the left a column on the sunken paper with round buttons in
  the middle (Sök, the quick menu with the pad's Home mark, Inställningar,
  the TV's off button) and the box's status at its foot. Its Live tile and Sök ask the
  overlay for that panel alone (`relay` with a `panel`): Live's channels,
  or the on-screen keyboard and then where to search. Inställningar, and
  its Loggar tab, is the settings page.
- **The screensaver** (`overlay/saver.js`), over everything when no pad is
  connected and nobody has pressed anything ([The TV
  (HDMI-CEC)](#the-tv-hdmi-cec) above); it closes every menu. One of two,
  chosen under Inställningar → TV (`ui.screensaver`), where Förhandsgranska
  Labyrint and Förhandsgranska Eld put it up at once (`POST
  /api/saver/preview`; the next press takes it away, the press that asked
  is let be, and the TV is not turned off for it):
  - **Labyrint** (the default, `overlay/maze.js`): a maze without end in
    the manner of Ultima Underworld, walked by itself. A raycaster on a
    320x180 canvas scaled up with square pixels, twenty frames a second
    (about 2 ms a frame on a laptop; on the box the overlay's WebKit about
    10 % of a core), dark but for a flickering torch. Its parts (zones of
    5x5 cells) are each in their own stones: walls, floor and ceiling per
    tile, from sixteen textures. The maze comes in chunks of 8x8 cells, each
    a perfect maze of its own (a seeded backtracker, a few walls knocked
    through) with two doors to the chunks west and north of it, so the
    whole is one maze, made as it is walked into and forgotten behind.
    Nearly half the chunks have a room in their middle: a hall of pillars,
    a garden of grass and hedges under the stars, a ballroom floored in
    marble, or a treasury where many things lie (`visit(kind)` goes
    straight to one, for the catalogue). The walker steers by a point a little ahead
    along its way (round corners, no turning on the spot facing a wall),
    goes for a thing lying near, else the nearest cell not yet
    walked; slowly, a stroll. About one cell in thirty has a cover, large,
    standing on the floor: a game's, a film's or a series' (a few albums')
    from the daemon's `/api/finds`
    (`covers.py` finds: first what was played lately, RomM's last played and
    Jellyfin's begun and seen, then others at random, those kept on the box
    first), standing on the floor; it is come upon, not hunted (only one a
    few cells off is gone for). Picked up, a notice says so ("Hittade
    GoldenEye 007 · spelat nyss", its kind's icon), and the last four are
    carried in a row at the top left. The
    textures are Screaming Brain Studios' [Tiny Texture Pack
    1](https://opengameart.org/content/tiny-texture-pack-1) (CC0), made
    64 px and fewer colours (`overlay/maze/textures.png`).
  - **Eld** (`overlay/mandelbrot.js`): the Mandelbrot set like an open fire
    and a line of the Tao Te Ching, at a quarter of the screen's width and
    ten frames a second, the line in a solid colour (a blend over the
    moving picture was the CPU's every frame).

Who gets Home, Y and B is decided in the daemon (`daemon/pioneertv/overlay.py`):
Home, toasts and the screensaver always go to the overlay; Y and B go to the
overlay while its menu is open and to the page otherwise. The overlay's
window takes the keyboard (layer-shell `EXCLUSIVE`) only while its menu or
its keyboard is open, so the rest of the time every key goes to the window
below and the overlay is only seen. What the menu cannot do itself (home,
back, reload, the keyboard, settings, opening a page) it asks the page to do
through the daemon (`relay`). Opening the menu broadcasts `media: pause`,
and the page pauses its video and audio; closing it resumes them. Without
the overlay there is no menu and no toast.

The login session gives every process the ambient capability
`CAP_WAKE_ALARM`, and with it bubblewrap refuses to set up WebKit's sandbox
("Unexpected capabilities but not setuid"), so the page never loads.
`session.sh` therefore starts the overlay through `setpriv --inh-caps=-all
--ambient-caps=-all`. Do not switch WebKit's sandbox off instead.

**Tried on the box, October 2026:** the quick menu over the start page,
over SVT1 in fullscreen (the video pauses and carries on, and stays in
fullscreen) and over mpv; the toasts; and the game pause panel over a
paused RetroArch. The overlay hands the keyboard back only once every key
is up: Chromium given the keyboard while the B that closed the menu was
still down took it as its own Escape and left fullscreen.

**Not yet tried on the box (28 October):** the main menu in the overlay
with its submenus, Sök on the overlay's keyboard, the toasts sent from the
pages and the settings page, the home page of tiles, and the screensaver in
the overlay (WebGL in WebKitGTK over the other windows).

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

labwc draws its own pointer, Adwaita's arrow, even with no mouse at all;
it stood in the picture all the time. The installer writes an invisible
cursor theme (`system/blank-cursors.py`, every cursor name as one
transparent pixel, in `/usr/share/icons/pioneer-tv-blank`) and labwc's
environment names it, so nothing of the compositor's shows.

The box has no pointer device at all (Weston, the display before labwc,
aborted the first time any client showed a mouse cursor): the daemon
streams right-stick motion to the extension, which draws its
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

## The settings page's tabs

In a column at the left, as on the browse pages: at rest a ring with each
tab's icon, with the focus or the pointer in it wider, with the names and
the groups'. Coming in from the view, the focus lands on the tab shown; up
and down show each tab as its ring gets the focus. The page opens on
Bluetooth.

- **Anslutet.** Bluetooth (the devices, pairing, and whether paired pads
  are called up by themselves), Wi-Fi (the network, then the networks in
  range), Tjänster (Tailscale; RomM and Jellyfin, each whether it answers
  and takes the key (`GET /api/services`), its address and its API key, as
  a password: an empty field keeps the key set before).
- **Boxen.** Allmänt (the screensaver and its previews, going home when
  idle, the volume notice, the on-screen keyboard), TV (only the set
  itself: CEC, its name, turning it off after the screensaver, and CEC's
  tests and trace), Kontroller.
- **Underhåll.** System (the Pi, the software, the covers on disk,
  Fjärråtkomst, restarts), Loggar.

Old addresses lead on: `#gamepads` and `#status` to Bluetooth, `#remote`
to System. The home page's tiles are the settings file's,
`/etc/pioneer-tv/settings.json`, written by hand, not edited on the page.
