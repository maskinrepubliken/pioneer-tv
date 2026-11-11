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
- [Pictures](#pictures)
- [Video on other sites](#video-on-other-sites)
- [The media panel](#the-media-panel)
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
| X / Square | The filled button, wherever there is one: on the box's pages (Spela, Blanda allt, Försök igen, the settings page's Sök efter enheter), the overlay's menus (Spara läge, the media panel's play) and the on-screen keyboard (OK); unmarked (one learns it), the browse page's legend says it. Elsewhere play, pause (Space) or the page's own use. Hold: undo (Ctrl+Z), e.g. what X took off a list |
| Y / Triangle | On-screen keyboard (on a pad without Home, hold: quick menu) |
| L1, R1 | TV volume down, up (CEC, repeats while held). Both held together: mute, once (`VolumeChord` in actions.py; either alone waits 90 ms for the other, so a chord moves the volume no step first) |
| L2, R2 | Over any video (a site's, a film, a clip), the music and on the media panel, wherever the focus is: seek back, on, as fast as they are pressed (the daemon sends how hard, `seek`; the mark on the timeline, or on the small mark at the top left with no menu open, glides, and what plays goes where they are let go; a short light touch is ten seconds). Nothing elsewhere. The volume left them for L1/R1, as it hung there and crept up or down |
| Right stick | Mouse pointer; click on the stick to left-click. What it (or a mouse) is over is drawn as selected and takes the focus, so the d-pad goes on from there |
| Start | Nothing on the box; in a game, the console's Start |
| Select | Nothing on the box; in a game, the console's Select |
| Guide / Home / PS / Xbox | The only way to the menus: the quick menu, over whatever is on screen (press again to close it); in a game or a film, the pause panel instead. Hold: the home page. Also wakes the TV and switches input when the pad connects |

In a film or an episode playing in mpv, A, B and X pause it and open its
pause panel, left and right seek ten seconds, and
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
  the rows, so they are all there), Sök filtering it, the
  chosen one's info in a column at the right when the library has it (its
  whole name, a fact a line, its whole text; right from the shelves goes
  into it, where up and down scroll it and left or B go back to the
  cover); a console's games, every album;
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
sökningen". B takes a filter away first. What plays is a player's:
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
reached from the home page (Inställningar; no menu in the overlay opens it), where the spatial
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
  saved, as Sluta spela does) and a film held on its panel is stopped (its
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
  game or a film held on its pause panel is not playing. The box's own
  music (audio.py) plays on under the screensaver instead, and keeps the
  TV on.

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
played. Beside RomM's consoles are the box's own (`OWN` in
`libraries/spel.js`), whose games are pages on the web: LL, with Wed
(beta), a Godot game at https://spelstudio.lyresten.se/. A opens its page;
once Godot has loaded (its canvas fills the window, its `#status` screen
gone) the pad is the game's (`content/game.js`), and Home leaves it. RomM's own Favourites collection (the one with `is_favorite`) is
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
  overlay draws the pause panel over the paused game: Fortsätt spela (the
  mark starts there: A), Spara läge (the filled one, X: a save point more
  each time, with a picture of the game where it was, RetroArch's
  `SCREENSHOT`; the newest 20 of each game kept in `points/<rom>/`), Ladda
  läge (the newest), Fler lägen (every one, the newest first, with its
  picture: `/api/games/points/<id>.png`), Starta om, TV-volym (L1 R1;
  marked, left and right step the TV's volume, A mutes), Sluta spela and
  Mer… (the quick menu, one step in; Hem, Ladda om from it end the game
  first). Each is one of
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

One button still belongs to the box: Guide opens the quick menu and holding it goes home. Every
other, Start and the bumpers too, is the game's. While an overlay is open the pad
drives it as usual. Game mode ends when the page goes away or stops sending heartbeats.

## Music

The Musik tile opens the browse page on top of [Jellyfin](https://jellyfin.org/)'s
music library (`browse.html?library=musik`): Blanda allt, then your
playlists as cards (like Spel's collections), with Album and Artister in
the column at the left; Album is shelves of covers, Artister their names alone, long, in three columns (they have no pictures; grid.js look names); a playlist or an album lists its songs beside
its cover, with Spela and Blanda; an artist has Blanda allt (filled, X)
and Spela allt at the heading's right, round buttons as Sök is with the
name beside (a view's `actions`, drawn in the heading by `page.js`). On
Musik's start, among the playlists, X is Blanda allt, with no button (the
legend says it). Album and Artister are grids like a
console's games: Sök filters them. Sök (the round
button, or Y) searches songs, albums and artists. Films, series and clips have
their own page ([Film and series](#film-and-series)).

The box plays the music itself, not the page: the daemon's own mpv,
without a picture (`daemon/pioneertv/audio.py`; the page hands it the
queue, `POST /api/audio/play`). It plays while "Spelas nu" is open, as a
film plays while its window is: B leaves it and the music stops, and so it
does when another page loads (the daemon hears `loaded`; the page also
says it as it goes) or something else plays (a film, a game, a site's
video); the TV is not turned off under it, as the sound comes out of the
TV. Everything done with it is the overlay's: A or Home over it opens its
panel ([the media panel](#the-media-panel): the transport, Förra and
Nästa, Blanda, Upprepa, Sluta spela, Mer…), as over a film; X plays or
pauses, L2 and R2 spool (the daemon sends `seek` to the overlay while the
music plays, the small mark at the top left shows where), B goes back to
browsing and the music stops. "Spelas nu" itself is only to look at, in
ink: the cover; what plays, by whom, from which album, a thin line of how
far; whether Blanda or Upprepa is on; at the right every song after it
(up to 100 said, 30 shown, fading out at the foot). Behind them the
cover's own colours wash over the screen, turning slowly while it plays
and resting when it pauses, as do four little bars by "Spelas nu": the
cover drawn in six by six on two canvases the browser stretches (as good
as a blur, and free), turned by the compositor, so nothing is drawn again
while it moves; a new cover fades the wash out and in.
While browsing, X on an album, a playlist or an artist plays it at once;
elsewhere X is the filled button's (Blanda allt, Spela). Blanda shuffles the songs after the one playing (and puts them
back in their order), and stays on for the next queue; Upprepa goes off,
the whole queue, the one song. A song that cannot be
played is skipped. mpv plays every file as it is, so Jellyfin never
transcodes. Jellyfin hears what plays (`Sessions/Playing`, shown on its
dashboard), and a song played to its end is marked played for the user
(`UserPlayedItems`), so play counts follow the box: the reports come from
the box's API key, which is no user, and count for nobody.

As with RomM the pages never talk to Jellyfin directly: `/jellyfin/...` on
their own origin is forwarded by the daemon with the API key added, and only
the library and the images are reachable; the daemon's mpv streams the songs
with the key in their address, given to it over its socket. Set Jellyfin's address (without
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
or Alla serier (a grid with the text at the right)
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
panel over the picture, with the time at the top left ([the media
panel](#the-media-panel): Fortsätt, the seeks, Gå till, Från början, Ljud
and Undertexter, where A steps to the next track, at once, TV-volym, Hitta
undertexter and Sluta titta). Fortsätt plays (and pauses) under the panel,
which stays open; B or Home close it and carry on. The tracks are named
by what Jellyfin knows of them, by their language (mpv calls a subtitle file
by its name, "Stream.srt"): those inside the file in the order mpv counts
them, every subtitle file by its address; each subtitle file of the film is
added to mpv once it plays (`sub-add`, with its name), so any can be
chosen. Hitta undertexter asks Jellyfin's subtitle plugins (Open Subtitles
on the box's: `RemoteSearch/Subtitles`) for Swedish and English ones, the
ones that fit the file first; the one chosen Jellyfin fetches and keeps
with the film, and it is added to mpv and chosen. Left and right seek ten
seconds, and the overlay shows where it is on a timeline of its own at the
foot of the screen (`seeked`); mpv draws nothing of its own while the
overlay is there. Holding B stops; Home opens the
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

## Pictures

The Bilder tile opens the browse page on top of [Immich](https://immich.app)
(`browse.html?library=bilder`, `libraries/bilder.js` on
`sources/immich.js`). Its column: Förslag (today's memories, "för X år
sedan", one's albums, the partner's and one's people) and Tidslinje; then
under one's name Favoriter, Album, Personer (every face Immich has
found, named or not; those hidden in Immich left out), Arkiv (out of the
timeline, `visibility: archive`) and Papperskorgen (Immich's trash,
`trashedAfter`), and the same under
the partner's name (`#/partner/...`, through the daemon's
`/immich-partner/`, the partner's key, reading only as `/immich/`: their
own albums and people, which one's key does not see). A partner's pictures (Immich's partner sharing) are
there too: the timeline asks for them (`withPartners`), the searches and
the favourites have them already; the memories, the albums (those shared
aside) and the people are one's own. The timeline, a year at a time, its months as cards; a
month, an album, a person, a memory, the favourites and a search
(Immich's smart search, by what is in the picture) are grids of pictures
close together (`grid.js` look `photos`, `cards.js` photo; a clip has its
length on it). The pages reach Immich through `/immich/` on the daemon
(`daemon/pioneertv/immich.py`), which adds the API key and lets through
reading only: the albums, the timeline, the people, the memories, an
asset and its pictures, and the searches (POSTs that only read); never
uploads, edits, deletions or sharing. Its address and key are under
Inställningar → Tjänster (an API key made in Immich: Kontoinställningar →
API-nycklar, with every permission: the pages change things too, below).

Immich is kept from here, by the headings' buttons and the viewer's
panel, each through the daemon (`POST /api/bilder/<action>`, `server.py`
`_bilder_admin`, with the owner's key: one's own, or the partner's for
theirs): Album has Nytt album (X: a name on the on-screen keyboard,
`V.askText`; then the album, empty); an album has Byt namn and Ta bort
album (A twice; the album only, its pictures stay); a person has Byt namn
(or Ge ett namn) and Göm personen (A twice; shown again from Immich's own
pages); the trash has Återställ allt and Töm papperskorgen (A twice; gone
for good). After a change the albums and the people are asked anew
(`forget`).

A picture opens the viewer (`players/photo.js`): one over the whole
screen on ink, Immich's preview (about the screen's size), the next one
fetched beforehand. Left and right go on (when and where it was taken says
itself at the foot for a moment). A opens a side panel on paper: its date
as the heading, then Plats, Bibliotek (whose library it is in: one's own
or a partner's, from `users/me` and `partners`), Kamera and Text, those
Immich has; under them, a clip's Spela first (X), then Favorit (on or off),
Lägg till i album… (the albums in the panel instead, Nytt album… first, one's
own then the partner's with their name, Tillbaka last or B), in an album
Ta bort ur albumet and Använd som albumomslag, Arkivera (or in the
archive, Ta bort ur arkivet), Ej foto, flytta till
filer (the original kept in Google Drive's folder Ej foto first, `drive.py`
with rclone, scope drive.file: the box sees only what it put there; then
to Immich's trash) and Ta bort (to Immich's trash, which
keeps it a while; A twice). Up and down choose, A does it, B closes the
panel. Only a shortcut stands at a row's right (X), never anything else.
Y (Sök) does nothing over the viewer, Spelas nu or a film on its way
(`noKeyboard`, main.js). Google Drive's token is under Inställningar →
Tjänster: `rclone authorize drive eyJzY29wZSI6ImRyaXZlLmZpbGUifQ` on a
computer with a browser (the base64 asks for drive.file), its answer pasted
there. In the trash the panel has Återställ and Radera för gott (A twice)
instead. The changes go through the daemon's `POST /api/bilder/...`
(`server.py` `api_bilder`); `/immich/` itself only reads. Immich lets only a picture's
owner change it, so a partner's own pictures are changed with the
partner's key (Inställningar → Tjänster → Immich, Partnerns API-nyckel;
the daemon asks whose a picture is, and whose each key is); without it a
notice says to put it there. Ej foto moves in the background: the daemon
takes it (one at a time: the box's upload is the slow part, a few seconds
a picture, minutes for a long clip) and says when it is done, an event
`bilder` {id, action: moved, failed or cancelled} and a toast wherever
one is. Meanwhile one browses on; the picture's row says Avbryt flytten,
with the row of holes a home page tile has, and A there calls it off
(`cancel`: the download or rclone stopped, the picture left in Immich).
Moved, it goes from the list. X starts or stops the
slideshow: a new picture every six seconds, each moving while it is shown
(Ken Burns: from a little closer to a little further or the other way,
drifting a little), fading into the next; clips passed over; the box told
something plays, so the screensaver keeps away. B goes back to the grid,
on the picture last seen (drawn anew if something was changed). X on a
grid is its Bildspel button. The grids' pictures are buttons (`cards.js`
photo), so the d-pad walks them. A clip plays right in the viewer, over
its picture (a `<video>` of Immich's `video/playback`, through
`/immich/`): X plays and pauses it, L2 and R2 glide a mark through it
(the daemon's `seek`, the page's while no overlay menu is open; it goes
where they are let go, a short touch is ten seconds), left and right go
on as for pictures, the panel is the same (Spela or Pausa first); a small
mark in a corner says playing or paused and the time. Played to its end,
the viewer goes on to the next. A clip the browser cannot play goes to mpv
instead (`video.py` `play_immich`, the key as mpv's header; X plays and
pauses it there, A or Home opens its panel, B stops it), and the viewer is
there again after. Over a film or a clip in mpv, left, right and X say
where it is for a moment in a small dark pill at the top left, the
viewer's mark on a clip in its own pixels (playing or paused, the time
and the length).

## Video on other sites

A site's own player (SVT Play, Cineasterna, any page with a video) is hard
to drive from a pad, worst in fullscreen. `content/webvideo.js` runs in
every frame of a page (a film service's player may sit in a frame of its
own), finds its main video (the largest on screen) and tells the daemon how
it is, which passes it to the overlay (`webvideo`, daemon/pioneertv/overlay.py).
Home over such a page opens that video's panel instead of the quick menu
([the media panel](#the-media-panel); a live stream seeks within what it
keeps, and has no Gå till or Från början; Undertexter when the video has
text tracks of its own, named by their language when the site's label is a
number or a file's name; Meny is the quick menu, one step in; Sluta titta,
holding B, goes back). The panel's choices go back to the frame they are for. The
menu pauses the video as it does every page's (the media event, the
frames' too), and closing it carries on; a seek from the panel leaves it
paused. The open panel follows the video by the words of its rows only,
in place (drawn anew at every word from the page, the whole menu went and
came back, which blinked over SVT Play), and where a seek was put stands
until the page has got there. While the video fills the screen
(fullscreen, or bigscreen.js's promotion) the pad drives the `<video>`
itself, not the site's keys: left and right seek, X pauses or plays,
up and down do nothing, A or B opens the panel (paused; holding B goes
back); where it is, the panel says. L2 and R2 spool any video, filling the
screen or not, a site's or a film in mpv: the daemon sends them to the
overlay while a page's frame has a video or mpv plays (overlay.py), which
glides on the small mark at the top left and seeks where they are
let go. Where we know the
site's own controls they are hidden meanwhile (`SITE_UI` in webvideo.js; SVT Play's `desktopUi` and
top bar, which came and went at every press); its subtitles stay. The
video itself is never touched beyond play, pause and its time, so it works
for what the site protects too.

## The media panel

One panel in the overlay for whatever plays (`overlay.js` mediaSpec,
styled in `overlay.css`): a film in mpv, a site's video, the box's music.
Its parts, those that apply:

- **The head**: the cover (the music's), playing, paused or live, the whole
  name, and what it is from (the artist and the album).
- **The timeline**, read only: how far in, the time and what is left. L2
  and R2 glide a mark along it with its time above it, as fast as they are
  pressed (a full press goes through a tenth of the whole a second, a light
  one a three-hundredth), and what plays goes where they are let go (one
  seek, so a site's video does not load and load); a short light touch is
  ten seconds.
- **The transport**: round buttons side by side, −2 min, −15 s, play or
  pause (the large one; on a film or a video the panel paused, Fortsätt;
  it plays under the panel, which stays open until B or Home),
  +15 s, +2 min. Left and right go between them.
- **The queue** (the music's): Förra and Nästa, side by side.
- **Rows**: Från början; TV-volym (L1 R1; marked, ◀ ▶ and A mutes), after
  what drives what plays; Ljud and Undertexter, their value in a capsule (A
  steps to the next); Hitta undertexter (a film); Sluta titta or Sluta
  spela, the stop symbol, last of what plays; Mer… (a film's and a video's:
  the quick menu, one step in, without its Tillbaka).

Every menu in the overlay alike: the filled row (or button), where there
is one (the quick menu has none), is X's and says so (the round play
button does not need to); Mer… says nothing; the way out of what plays is Sluta titta or Sluta spela with the
stop symbol (the power symbol is the TV's alone), and TV-volym says L1 R1,
and while marked what its keys do.

L2 and R2 work wherever the focus is on the panel, which stays where it
is: the daemon sends them as `seek` (a direction and how hard, 0 to 1, said
when it changes by a twentieth; a trigger as a button is half), to the
overlay alone.

The focus starts on play. The menu (`hud.js`) has the parts for it: a
`head` in the title's place, an item that draws itself (`render`), and items
with the same `row` side by side, which the d-pad goes between by where
they are. A film's and a site's video's panel comes with Home (and A, B or
X on a film); the music's with Home or A over Spelas nu. The
open panel follows what plays in place, part by part; where a seek was put
stands until the player has got there, and a time that plays runs on
between its words. mpv seeks over `POST /api/video/seek` and `/to`, the
music over `/api/audio/...`.

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

**The simulator** (`http://localhost:5178/sim`, `dev/sim.html`) is the box on
one screen, to try whole flows rather than single views. The page (Chromium
on the box) and the overlay (its own window on the box) are two frames, one
over the other, at 1920×1080 scaled to fit; behind them a stand-in daemon on
the preview server's `/ws` (`dev/sim.py`), which routes as the daemon does
(it uses `pioneertv/overlay.py` itself) and plays the music, a
film and a game on a clock of its own, with the same events. The simulator
window does what the extension's background worker does (home, back,
navigate, settings for the page) and hands the keys to the overlay while
its menu is open, as on the box.

Every button on the drawn pad can be clicked, or the Mac's keys are the
pad: the arrows, Enter (A), Esc (B) and Space (X)
are the keyboard's own and reach the page or the overlay as real presses; a
click sends the same key, marked `pioneertvPad` (spatial-nav.js lets those
through, as it does real presses, and not the on-screen keyboard's own). H is Home (held, the
home page), Y the on-screen keyboard, held Esc is holding B, `[` and `]` are
L1/R1 (the volume), `,` and `.` L2/R2 (seeking on the media panel, held;
with Shift as hard as it goes). The side panel draws the pad (lighting up what is pressed), and has
the screensaver, the TV off and on, the green or the pink pad, and a toast;
under it, every event the daemon sends. Another site (SVT Play, ...) cannot
be framed and shows as a stand-in page; `?page=` opens the simulator on a
page of its own (`/sim?page=/ext/launcher/game.html?rom=100`).

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
row: Spara läge in a game's panel, the media panel's play), the on-screen
keyboard's OK (A only types; there is no holding A for OK) and the settings
page's (`settings.js`). So a view has at most one filled button; a list's
own buttons (a network's Anslut, a pad's Para) are outlined: where a
button X does not press was filled, another is filled instead, never a
second X. Where there is
none, X keeps the page's own meaning (off Senast spelade, an album played, pause).

The UI follows Maskinrepubliken's design system, vendored in
`design/maskinrepubliken/` (its brand book is `README.md` there, in Swedish).
Paper is the ground, ink is what you read with, ochre is the one signal; there
are no shadows, gradients or see-through tones, and nothing moves except in
answer to a button, and nothing moves: the focus is the outline of what
has it, drawn at once (a ring that glided from one to the next was tried
and taken away: on the Pi it stuttered). Instead the focus moving makes a
small sound (`content/sound.js`, Web Audio, no file): the same soft tone, a
little higher going up, a little lower going down, about in between going
left and right, played by the spatial navigation, the overlay's menus, the
on-screen keyboard and the settings page's own d-pad. Off under
Inställningar → Allmänt (`ui.nav_sound`). Four voices, bundled in `extension/fonts/` under the SIL
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
  Tangentbord, Ladda om, Stäng av TV:n, and the box's status
  at the foot. Holding Home goes to the home page. B goes one step back,
  the last step closes it. A choice that opens a page punches its row of
  holes until the page has loaded (the extension says `loaded`). The TV's
  volume is L1 and R1 too (and a row in the pause panels).
- **The menu system** (`overlay/hud.js`): a stack of menus, each the paper
  card at the right; the pause panels of a game and a film are the same
  card. The d-pad moves to the nearest choice that way on screen.
- **The home page** (`launcher/index.html`, `home/home.js`) is a page of
  its own: the services as tiles of one size in two rows (`services.js`
  `PLACES`: Play, Cineasterna, Bilder, Spel; Film, Serier, Musik, Videor;
  one not named there at the end of its row; Play has the focus when it
  opens), the pad's
  legend under them; beside them, at their left, the live TV channels
  (`row = "live"`) as small tiles in a column together as tall as the two
  rows, each with what is on now (its title, how far in) and next: the
  daemon reads the day's schedule out of SVT Play's channel page
  (`schedule.py`, `GET /api/channels`, kept two minutes; the page asks each
  minute). A channel tile asks the overlay to cover the screen ("Laddar…"
  and the channel, `relay` `cover`) until `webvideo.js` says its video
  plays filling the screen (`full`), so its page is never seen loading;
  Home, a page of the box's own or 25 s take the cover away. It comes once
  the tile's holes have been seen. Every full-screen message (`screen.js`:
  this cover, "Startar…", "Vilar", a view loading) fades in and out, the one
  motion the system has. The home page must never stay empty:
  `home/guard.js`, loaded first, logs its errors to the daemon's journal
  (`extension: home: ...`) and loads the page again if nothing is drawn
  after 8 s (seen once: the page stopped after twelve of its scripts). At the far left a column on the sunken paper with round
  buttons in the middle (Sök, the quick menu with the pad's Home mark,
  Inställningar, the TV's off button) and the box's status at its foot. Sök
  asks the overlay for that panel alone (`relay` with a `panel`): the
  on-screen keyboard and then where to search. Inställningar, and
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
    goes for the nearest cell not yet walked; slowly, a stroll. The walls are hung full of pictures,
    one kind only: Bilder's photos (Immich's `search/random`, two calls of
    800, a fresh lot each time the screensaver starts, through `/immich/`),
    else, with no Immich, the covers kept on the box (`/api/finds?n=600`).
    They are drawn into the wall's columns as the torch lights them: along
    the ways about a third of the faces, mostly one picture, now and then
    two side by side, two above each other, three in a row or a triptych;
    in the rooms more of them, but not every face (and none on the garden's
    hedges), each kind of room hung its own way (the gallery's great ones,
    the library's salons, the crypt's and the cellar's few and small). Frames of many kinds: dark
    wood, black, silver, white with a wide mat, gilt, and gilt with a dark
    rim within for the great ones. None on a door. Each is drawn 64 px
    square, kept in its own shape by its frame. The maze starts somewhere
    new each time (a cell far off, `wander()`), and has more parts and rooms:
    besides the hall of pillars, the garden, the ballroom and the treasury,
    a long gallery, a crypt of slate pillars, a library in wood and a cellar
    of earth. Most cells (not the one after a look) the walker stops at a wall of
    its cell with pictures on it, turns to it and looks a while (seven
    seconds): what hangs there comes up sharp over the maze (saver.js,
    `hud.look`: a covers' own picture, a photo's Immich preview), each in
    a gilded frame, and under it what it is: a photo's date and place, a
    game's, a film's or an album's name and, when it was played or seen
    lately (`covers.py` finds: first what was played lately, RomM's last
    played and Jellyfin's begun and seen), "spelat nyss" or "sett nyss";
    faded in and out. Nothing lies on the floor any more. The
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

A channel marked `fullscreen` does not use the browser's fullscreen:
`bigscreen.js` pins its player over the page with CSS (the kiosk window
already fills the screen), so Chromium's "Tryck på Esc" bubble never shows.
SVT1's live player throws itself away every so often and builds a new one;
the new one is pinned again. B goes straight back.

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
tab's icon (the tab shown in ink; the one with the focus filled ochre, as
everything chosen is), with the focus or the pointer in it wider, with the
names and the groups'. The page opens on Allmänt.

The view is one column of rows, as in the overlay's menus: each row the
view's full width and one stop for the d-pad. Status cards, headings and
text are only read. The page owns the d-pad (settings.js, registered before
the extension's spatial navigation, which guessed by distance and went from
a row to the column and back):

- In the column, up and down go through the tabs (only moving: the view
  stays what it was); A opens one and goes into it, as in every column of
  the box; right goes into the view shown, to the row one was last on.
- In the view, up and down go row by row, in order. Left goes to the
  column; on a row marked ◀ ▶ (a number, a choice, the TV's volume, the
  log shown) left and right change its value instead. A does the row: a
  switch turns, a choice steps, a field opens the on-screen keyboard.
- B in the view goes to the column; in the column, home (`POST /api/home`,
  as Home held). X presses the view's filled row (Sök efter enheter).
- A value is saved as soon as it changes (a number once it has stood still
  a moment); there is no Spara. A row that cannot be undone (Ta bort, Glöm,
  Starta om Pi:n) asks for a second A.

The tabs:

- **Boxen.** Allmänt (the screensaver and its previews, going home when
  idle, the volume notice, the on-screen keyboard, the focus's sound), TV (only the set
  itself: CEC, its name, turning it off after the screensaver, and CEC's
  tests and trace), Kontroller.
- **Anslutet.** Bluetooth (each device a row whose A does what it needs:
  para, anslut, koppla från; and whether paired pads are called up by
  themselves), Wi-Fi (the network, then the networks in range: A joins
  one, a locked one asks for its password in a row below), Tjänster
  (Tailscale; RomM and Jellyfin, each whether it answers and takes the key
  (`GET /api/services`), its address and its API key, as a password: an
  empty field keeps the key set before).
- **Underhåll.** System (the Pi, the software, the covers on disk,
  Fjärråtkomst, restarts), Loggar.

Old addresses lead on: `#gamepads` to Bluetooth, `#status` to Allmänt,
`#remote` to System. The home page's tiles are the settings file's,
`/etc/pioneer-tv/settings.json`, written by hand, not edited on the page.
