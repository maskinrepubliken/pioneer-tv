"""Games, played in RetroArch on the TV's display (labwc), out of sight.

The Spel pages browse RomM in Chromium; playing happens here. EmulatorJS in
the browser interpreted the N64's processor in WebAssembly (about 23 of 60
frames a second in Super Mario 64 on the Pi 4) and ran SNES and Genesis
slowly, with crackling sound, for their first seconds. RetroArch with cores
built for the Pi does not have that wall (Super Mario 64 at 81 frames a
second, unthrottled). See docs/superpowers/specs/2026-10-15-retroarch-games-design.md.

RetroArch is only ever the game picture: no menu, no notices, no logo. The
player page (extension/launcher/spela.js) asks for a game; this module
fetches it from RomM into a cache, writes RetroArch's config and starts it
as the kiosk user. Kiosk-shell puts its window over Chromium. Home pauses:
a screenshot, then the state into slot 1 (SAVE_STATE), then QUIT, and the
page shows our pause panel over the screenshot. Resuming starts RetroArch
again with that state copied to where its auto-load looks. (RetroArch 1.20
only saves or loads a state for a core its core info list knows, and that
list comes from its own cores folder, which ours are not in: every save
said "Core does not support save states" until core_info_savestate_bypass.
--entryslot loaded nothing either; auto-load does. Measured on the box.)

While a game runs the pads are RetroArch's (the pad manager leaves them
alone, as in the browser's game mode) and Home comes here, through the
dispatcher's system hook.
"""
from __future__ import annotations

import asyncio
import logging
import os
import pwd
import shutil
import socket
import time
import zipfile
from pathlib import Path
from typing import Callable, Coroutine
from urllib.parse import quote

import aiohttp

log = logging.getLogger("pioneertv.games")

# The 8BitDo Ultimate 2C on its dongle (xpad), for RetroArch's udev joypad
# driver, which numbers buttons in the order of their key codes: SOUTH 0,
# EAST 1, NORTH 2, WEST 3, TL 4, TR 5, SELECT 6, START 7, MODE 8, THUMBL 9,
# THUMBR 10. xpad reports the left face button as NORTH and the top one as
# WEST (see gamepad.py's quirk). Its buttons are marked as on an Xbox pad:
# A at the bottom (0), B on the right (1), X on the left (2), Y at the top
# (3). Guide (8) is left unbound: it belongs to the box.
PAD_BUTTONS = {"A": "0", "B": "1", "X": "2", "Y": "3"}

# The button marked A plays the console's A, B its B, and so on: the
# letters, not the places, count (asked for; the place matters less). Which
# RetroPad button each console's core reads as its A or B differs, so the
# pad's letters go to RetroPad buttons per console. SNES and NES: the
# RetroPad's names are Nintendo's. N64 (Mupen64Plus-Next): RetroPad B is
# the N64's A and Y its B; A and X are C buttons, also on the right stick.
# Mega Drive (Genesis Plus GX): Y is its A, B its B, A its C (marked X on
# the pad, which has no C) and X its Y on a six-button pad. Libretro's core
# documentation, October 2026.
LETTERS = {           # RetroPad button -> the pad's letter that presses it
    "default": {"a": "A", "b": "B", "x": "X", "y": "Y"},
    "n64": {"b": "A", "y": "B", "a": "X", "x": "Y"},
    "genesis": {"y": "A", "b": "B", "a": "X", "x": "Y"},
}

AUTOCONFIG_REST = """\
input_l_btn = "4"
input_r_btn = "5"
input_select_btn = "6"
input_start_btn = "7"
input_l3_btn = "9"
input_r3_btn = "10"
input_up_btn = "h0up"
input_down_btn = "h0down"
input_left_btn = "h0left"
input_right_btn = "h0right"
input_l2_axis = "+2"
input_r2_axis = "+5"
input_l_x_plus_axis = "+0"
input_l_x_minus_axis = "-0"
input_l_y_plus_axis = "+1"
input_l_y_minus_axis = "-1"
input_r_x_plus_axis = "+3"
input_r_x_minus_axis = "-3"
input_r_y_plus_axis = "+4"
input_r_y_minus_axis = "-4"
"""
PADS = ["8BitDo Ultimate 2C Wireless Controller"]


def autoconfig(name: str, platform: str | None) -> str:
    """RetroArch's autoconfig for one pad, its letters as the console reads them."""
    letters = LETTERS.get(platform or "", LETTERS["default"])
    face = "".join(f'input_{retropad}_btn = "{PAD_BUTTONS[letter]}"\n' for retropad, letter in sorted(letters.items()))
    return f'input_driver = "udev"\ninput_device = "{name}"\n' + face + AUTOCONFIG_REST

# Core options, in RetroArch's core options file (keyed by the core's name).
CORE_OPTIONS = {
    # A DOS game's own dosbox.conf (at the root of its archive, see
    # dos_bundle) says what to run; without it DOSBox Pure shows its own menu.
    "dosbox_pure": {
        "dosbox_pure_conf": "inside",
    },
    # N64 music played in slow motion and GoldenEye stuttered: the Pi did not
    # keep up. Measured unthrottled over each game's first 1800 frames (60 is
    # full speed, and heavy scenes run below the average): GoldenEye 79 at
    # 640x480 with framebuffer emulation, 169 at 320x240 without; Super Mario
    # 64 100 and 164. 320x240 is about the N64's own resolution; without
    # framebuffer emulation a few effects drawn from the framebuffer (some
    # menus and screen transitions) are lost. GLideN64's shaders are stored
    # (compiled once per game) and drawn on a thread of their own: without
    # the threaded renderer the core hung in RetroArch on the box.
    "mupen64plus_next": {
        "mupen64plus-cpucore": "dynamic_recompiler",
        "mupen64plus-rdp-plugin": "gliden64",
        "mupen64plus-rsp-plugin": "hle",
        "mupen64plus-43screensize": "320x240",
        "mupen64plus-EnableFBEmulation": "False",
        "mupen64plus-aspect": "4:3",
        "mupen64plus-EnableShadersStorage": "True",
        "mupen64plus-ThreadedRenderer": "True",
        "mupen64plus-EnableN64DepthCompare": "False",
    },
}

# RetroArch's own hotkeys, all off: a real keyboard plugged in for a DOS game
# must not quit, pause or open anything with Escape, F1, P and friends.
HOTKEYS = (
    "exit_emulator", "menu_toggle", "save_state", "load_state", "state_slot_increase", "state_slot_decrease",
    "toggle_fast_forward", "hold_fast_forward", "toggle_slowmotion", "hold_slowmotion", "rewind", "pause_toggle",
    "frame_advance", "reset", "shader_next", "shader_prev", "screenshot", "audio_mute", "volume_up", "volume_down",
    "toggle_fullscreen", "movie_record_toggle", "recording_toggle", "streaming_toggle", "grab_mouse_toggle",
    "game_focus_toggle", "osk_toggle", "fps_toggle", "statistics_toggle", "ai_service", "netplay_game_watch",
    "netplay_host_toggle", "netplay_ping_toggle", "close_content", "desktop_menu_toggle", "cheat_toggle",
    "cheat_index_plus", "cheat_index_minus", "disk_eject_toggle", "disk_next", "disk_prev", "overlay_next",
    "runahead_toggle", "preempt_toggle", "save_state_slot", "load_state_slot", "toggle_vrr_runloop",
    "send_debug_info", "turbo_fire_toggle", "record_replay", "play_replay", "replay_slot_increase",
    "replay_slot_decrease", "shader_toggle", "frame_time_counter_reset",
)


def dos_bundle(path: Path) -> Path:
    """A DOS game as DOSBox Pure can start it on its own.

    RomM's DOS games are js-dos bundles: the game under GAME/ and what to run
    in .jsdos/dosbox.conf ("mount c GAME", "c:", "call HOCUS.BAT"). EmulatorJS
    unpacked them and ran that; DOSBox Pure mounts the archive itself as C:
    and only reads a dosbox.conf at its root, so it showed its own menu
    instead. Repacked once, next to the original: GAME/'s contents at the
    root and the conf beside them, its mount of C: dropped and its paths made
    relative to the new root. Anything that is not such a bundle is used as it is."""
    if path.suffix.lower() != ".zip":
        return path
    out = path.with_name(path.stem + ".pure.zip")
    if out.is_file() and out.stat().st_mtime >= path.stat().st_mtime:
        return out
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            conf_name = next((n for n in names if n.lower() == ".jsdos/dosbox.conf"), None)
            if not conf_name or any(n.lower() == "dosbox.conf" for n in names):
                return path
            conf = z.read(conf_name).decode("latin-1")
            prefix = ""
            lines = []
            in_autoexec = False
            for line in conf.splitlines():
                bare = line.strip()
                if bare.startswith("["):
                    in_autoexec = bare.lower() == "[autoexec]"
                if in_autoexec:
                    words = bare.split()
                    if len(words) >= 3 and words[0].lower() == "mount" and words[1].lower().rstrip(":") == "c":
                        prefix = words[2].strip('"').rstrip("/\\") + "/"
                        continue
                lines.append(line)
            if not prefix:
                return path
            text = "\n".join(lines) + "\n"
            # Paths in the rest of the autoexec (an imgmount of the CD, say)
            # were given from the archive's root; they now start inside GAME/.
            for sep in ("/", "\\"):
                text = text.replace(prefix.rstrip("/") + sep, "")
            tmp = out.with_name(out.name + ".part")
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as dst:
                dst.writestr("dosbox.conf", text)
                for info in z.infolist():
                    name = info.filename[len(prefix):]
                    # GAME/ may carry a dosbox.conf of its own: ours, from the
                    # bundle's, is the one at the root.
                    if not info.filename.startswith(prefix) or info.is_dir() or name.lower() == "dosbox.conf":
                        continue
                    dst.writestr(name, z.read(info))
            tmp.rename(out)
            log.info("%s: repacked for DOSBox Pure (%s at the root)", path.name, prefix)
            return out
    except (OSError, zipfile.BadZipFile) as exc:
        log.warning("%s: could not repack for DOSBox Pure: %s", path.name, exc)
        return path



def wayland_socket(runtime_dir: str) -> str:
    """The compositor's socket in runtime_dir: labwc's is wayland-0, Weston's
    was wayland-1. The newest, should a stale one be left behind."""
    socks = [p for p in Path(runtime_dir).glob("wayland-[0-9]*") if p.is_socket()]
    return max(socks, key=lambda p: p.stat().st_mtime).name if socks else "wayland-0"

class Games:
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine], pads, dispatcher,
                 overlay: Callable[[], bool] = lambda: False) -> None:
        self.cfg = cfg
        self.overlay = overlay          # True while the overlay is up: it draws the pause panel over the game
        self.emit = emit
        self.pads = pads                # the pad manager: its shared["games"] leaves the pads to RetroArch
        self.dispatcher = dispatcher
        self.proc: asyncio.subprocess.Process | None = None
        self.game: dict | None = None   # the game being played or paused
        self.state = "idle"             # idle | loading | running | held | pausing | paused | quitting
        self.task: asyncio.Task | None = None
        self.screen_at = 0.0

    # ------------------------------------------------------------ config
    @property
    def gcfg(self) -> dict:
        return self.cfg.get("games") or {}

    @property
    def root(self) -> Path:
        return Path(self.gcfg.get("dir", "/var/lib/pioneer-tv/games"))

    def core_for(self, platform: str | None) -> str | None:
        core = (self.gcfg.get("cores") or {}).get(platform or "")
        return core if core and os.path.isfile(core) else None

    def platforms(self) -> list[str]:
        """Consoles the box plays: switched on, RetroArch installed, a core in place."""
        if not self.gcfg.get("enabled", True) or not shutil.which(self.gcfg.get("retroarch", "retroarch")):
            return []
        return [p for p in (self.gcfg.get("cores") or {}) if self.core_for(p)]

    def status(self) -> dict:
        point = self._point_path()
        return {
            "platforms": self.platforms(),
            "state": self.state,
            "game": {k: self.game[k] for k in ("id", "name", "platform")} if self.game else None,
            "point": point.stat().st_mtime if point and point.is_file() else None,
            "players": self._players()[1],
        }

    # ------------------------------------------------------------ paths
    def _base(self) -> str:
        return Path(self.game["path"]).stem if self.game else ""

    def _auto_state(self) -> Path:
        """Where the game was left: RetroArch's slot 1, written by SAVE_STATE."""
        return self.root / "states" / f"{self._base()}.state1"

    def _point_path(self) -> Path | None:
        return self.root / "points" / f"{self.game['id']}.state" if self.game else None

    def screen_path(self) -> Path | None:
        return self.root / "screens" / f"{self._base()}.png" if self.game else None

    # ------------------------------------------------------------ the API
    def _busy(self) -> bool:
        return (self.task is not None and not self.task.done()) or bool(self.proc and self.proc.returncode is None)

    async def play(self, rom_id: int) -> tuple[bool, str]:
        """Start a game from the beginning of its automatic state (where it was left)."""
        if self._busy():
            return False, "ett spel körs redan"
        romm = self.cfg.get("romm") or {}
        if not romm.get("url") or not romm.get("api_key"):
            return False, "no_key"
        self.task = asyncio.create_task(self._play(rom_id))
        return True, ""

    async def resume(self, load: str = "auto") -> tuple[bool, str]:
        """The paused game again: load "auto" (where it was), "point" (Spara läge's) or "none" (from the start)."""
        if self.state == "held":
            return await self._unhold(load)
        if self._busy():
            return False, "ett spel körs redan"
        if not self.game or self.state != "paused":
            return False, "inget pausat spel"
        if load == "point":
            point = self._point_path()
            if not point or not point.is_file():
                return False, "inget sparat läge"
            shutil.copyfile(point, self._auto_state())
            self._own(self._auto_state())
        self.task = asyncio.create_task(self._launch(autoload=load != "none"))
        return True, ""

    async def save_point(self) -> tuple[bool, str]:
        """Spara läge: the state the game was paused with becomes its save point."""
        if self.state == "held" and not await self._save_state():
            return False, "inget att spara"
        if not self.game or self.state not in ("paused", "held") or not self._auto_state().is_file():
            return False, "inget att spara"
        point = self._point_path()
        point.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self._auto_state(), point)
        self._own(point)
        return True, ""

    async def _wait_written(self, path: Path | None, before: float, seconds: float) -> bool:
        """Until path is written anew and its size has settled."""
        size = -1
        for _ in range(int(seconds / 0.02)):
            await asyncio.sleep(0.02)
            if not (path and path.is_file() and path.stat().st_mtime > before):
                continue
            now = path.stat().st_size
            if now and now == size:
                return True
            size = now
        return False

    async def _save_state(self) -> bool:
        """The game where it is, into slot 1."""
        state = self._auto_state()
        before = state.stat().st_mtime if state.is_file() else 0
        self.command("SAVE_STATE")
        ok = await self._wait_written(state, before, 4)
        if not ok:
            log.warning("retroarch wrote no state for %s", self.game and self.game["name"])
        return ok

    async def pause(self) -> None:
        """Home in a game: a screenshot and the state, then RetroArch goes and the page shows the pause panel.

        RetroArch's window covers the panel until it has exited, so this is
        what the person waits for. The picture, then the state (one after the
        other: RetroArch skipped the save when asked for both at once), about
        0.3 s together; then RetroArch is not left to shut down at its own
        pace: the N64 core took 1.6 s to (measured on the box), while
        everything a resume needs, the game's own save memory included, is in
        the state just written."""
        if self.state != "running" or not (self.proc and self.proc.returncode is None):
            return
        self.state = "pausing"
        started = time.monotonic()
        shot, state = self.screen_path(), self._auto_state()
        shot_before = shot.stat().st_mtime if shot and shot.is_file() else 0
        state_before = state.stat().st_mtime if state.is_file() else 0
        self.command("PAUSE_TOGGLE")
        self.command("SCREENSHOT")
        got_shot = await self._wait_written(shot, shot_before, 1.5)
        self.command("SAVE_STATE")
        saved = await self._wait_written(state, state_before, 4)
        self.screen_at = time.time()
        if not saved:
            log.warning("retroarch wrote no state for %s", self.game and self.game["name"])
        # Only with the state safely written may RetroArch be cut short.
        await self._quit_process(grace=0.3 if saved else 8)
        log.info("paused %s in %.2f s (picture %s, state %s)", self.game and self.game["name"],
                 time.monotonic() - started, "yes" if got_shot else "no", "yes" if saved else "no")
        # _watch sees the exit and, with state "pausing", reports "paused".

    async def quit(self) -> None:
        """Leave the game for good: its state saved, RetroArch quits and the page goes back."""
        running = bool(self.proc and self.proc.returncode is None)
        if running and self.state in ("running", "held"):
            await self._save_state()
        self.state = "quitting" if running else "idle"
        await self._quit_process()
        if self.state != "quitting":
            self.game = None
            self.state = "idle"

    # ------------------------------------------------------------ starting
    async def _play(self, rom_id: int) -> None:
        try:
            self.state = "loading"
            game = await self._fetch(rom_id)
            if game is None:
                self.state = "idle"
                return
            if not self.core_for(game["platform"]):
                self.state = "idle"
                await self._event("error", message="Den här konsolen går inte att spela här än")
                return
            self.game = game
            await self._launch(autoload=True)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.exception("play failed")
            self.state = "idle"
            await self._event("error", message=f"Spelet kunde inte startas: {exc}")

    async def _fetch(self, rom_id: int) -> dict | None:
        """The game's file from RomM, into the cache (kept between plays)."""
        romm = self.cfg["romm"]
        base = romm["url"].rstrip("/")
        headers = {"Authorization": f"Bearer {romm['api_key']}"}
        timeout = aiohttp.ClientTimeout(total=None, sock_connect=10, sock_read=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{base}/api/roms/{rom_id}", headers=headers) as r:
                if r.status in (401, 403):
                    await self._event("error", message="API-nyckeln godtas inte")
                    return None
                r.raise_for_status()
                meta = await r.json()
            name = meta.get("fs_name") or f"{rom_id}.bin"
            game = {"id": rom_id, "name": meta.get("name") or name, "platform": meta.get("platform_slug")}
            if not self.core_for(game["platform"]):
                game["path"] = ""
                return game
            folder = self.root / "cache" / str(rom_id)
            path = folder / name
            size = meta.get("fs_size_bytes") or 0
            if path.is_file() and (not size or path.stat().st_size == size):
                os.utime(path)                          # the most recently played are kept longest
            else:
                folder.mkdir(parents=True, exist_ok=True)
                self._make_room(size)
                part = path.with_name(path.name + ".part")
                got, last = 0, 0.0
                async with session.get(f"{base}/api/roms/{rom_id}/content/{quote(name)}", headers=headers) as r:
                    r.raise_for_status()
                    total = int(r.headers.get("Content-Length") or size or 0)
                    with open(part, "wb") as f:
                        async for chunk in r.content.iter_chunked(1 << 16):
                            f.write(chunk)
                            got += len(chunk)
                            if time.monotonic() - last > 0.5:
                                last = time.monotonic()
                                await self._event("loading", got=got, total=total)
                part.rename(path)
            if game["platform"] == "dos":
                path = dos_bundle(path)
            game["path"] = str(path)
            self._own(self.root)
            return game

    def _make_room(self, need: int) -> None:
        """Keep the cache under games.cache_mb: the games played longest ago go first."""
        limit = int(self.gcfg.get("cache_mb", 800)) * (1 << 20)
        cache = self.root / "cache"
        entries = []
        for d in cache.iterdir() if cache.is_dir() else []:
            files = [f for f in d.iterdir() if f.is_file()]
            if files:
                entries.append((max(f.stat().st_mtime for f in files), sum(f.stat().st_size for f in files), d))
        used = sum(e[1] for e in entries)
        for _, size, d in sorted(entries):
            if used + need <= limit:
                break
            shutil.rmtree(d, ignore_errors=True)
            used -= size

    def _players(self) -> tuple[list[int], list[str]]:
        """RetroArch's joypad index for players 1 and 2, and the pads' names.
        Player 1 is the pad last used (the one that reached for the game);
        RetroArch's udev driver numbers pads in the order of their event nodes."""
        pads = sorted(self.pads.pads() if self.pads else [], key=lambda p: int("".join(c for c in p.dev.path if c.isdigit()) or 0))
        if not pads:
            return [0, 1], []
        active = self.pads.shared.get("active")
        first = next((i for i, p in enumerate(pads) if (p.serial or p.dev.path) == active), 0)
        order = [first] + [i for i in range(len(pads)) if i != first]
        return order[:2] + [1] * (2 - len(order[:2])), [pads[i].label for i in order[:2]]

    def write_config(self, core_name: str, autoload: bool = False) -> None:
        r = self.root
        for sub in ("states", "saves", "screens", "points", "system", "autoconfig/udev", "cfg"):
            (r / sub).mkdir(parents=True, exist_ok=True)
        port = int(self.gcfg.get("port", 55355))
        joy, _ = self._players()
        hotkeys = "".join(f'input_{h} = "nul"\ninput_{h}_btn = "nul"\ninput_{h}_axis = "nul"\n' for h in HOTKEYS)
        cfg = f"""\
video_driver = "gl"
video_context_driver = "wayland"
video_fullscreen = "true"
video_vsync = "true"
video_smooth = "false"
video_shader_enable = "false"
video_font_enable = "false"
video_gpu_screenshot = "true"
video_aspect_ratio_auto = "true"
audio_driver = "{self.gcfg.get("audio_driver", "pulse")}"
audio_latency = "{int(self.gcfg.get("audio_latency", 128))}"
audio_resampler_quality = "2"
audio_enable_menu = "false"
input_driver = "wayland"
input_joypad_driver = "udev"
input_autodetect_enable = "true"
joypad_autoconfig_dir = "{r}/autoconfig"
input_max_users = "2"
input_player1_joypad_index = "{joy[0]}"
input_player2_joypad_index = "{joy[1]}"
input_auto_game_focus = "1"
input_overlay_enable = "false"
menu_driver = "rgui"
menu_enable_widgets = "false"
menu_show_load_content_animation = "false"
load_dummy_on_core_shutdown = "false"
pause_nonactive = "false"
quit_press_twice = "false"
confirm_quit = "false"
config_save_on_exit = "false"
fps_show = "false"
notification_show_autoconfig = "false"
notification_show_config_override_load = "false"
notification_show_remap_load = "false"
notification_show_set_initial_disk = "false"
notification_show_fast_forward = "false"
notification_show_save_state = "false"
notification_show_screenshot = "false"
notification_show_screenshot_flash = "0"
notification_show_refresh_rate = "false"
notification_show_when_menu_is_alive = "false"
notification_show_patch_applied = "false"
notification_show_cheats_applied = "false"
network_cmd_enable = "true"
network_cmd_port = "{port}"
savefile_directory = "{r}/saves"
savestate_directory = "{r}/states"
screenshot_directory = "{r}/screens"
system_directory = "{r}/system"
sort_savefiles_enable = "false"
sort_savestates_enable = "false"
sort_savefiles_by_content_enable = "false"
sort_savestates_by_content_enable = "false"
sort_screenshots_by_content_enable = "false"
auto_screenshot_filename = "false"
savestate_auto_save = "false"
savestate_auto_load = "{"true" if autoload else "false"}"
state_slot = "1"
core_info_savestate_bypass = "true"
savestate_thumbnail_enable = "false"
autosave_interval = "30"
rewind_enable = "false"
core_options_path = "{r}/cfg/retroarch-core-options.cfg"
global_core_options = "true"
libretro_info_path = "/usr/share/libretro/info"
history_list_enable = "false"
{hotkeys}"""
        (r / "cfg" / "retroarch.cfg").write_text(cfg)
        opts = CORE_OPTIONS.get(core_name, {})
        (r / "cfg" / "retroarch-core-options.cfg").write_text("".join(f'{k} = "{v}"\n' for k, v in opts.items()))
        platform = self.game["platform"] if self.game else None
        for name in PADS:
            (r / "autoconfig" / "udev" / (name.replace(" ", "_") + ".cfg")).write_text(autoconfig(name, platform))
        self._own(r)

    def _own(self, path: Path) -> None:
        """What RetroArch reads and writes belongs to the kiosk user, who runs it."""
        if os.geteuid() != 0:
            return
        try:
            pw = pwd.getpwnam(self.gcfg.get("user", "pi"))
        except KeyError:
            return
        targets = [str(path)]
        if path.is_dir():
            for dirpath, dirnames, filenames in os.walk(path):
                targets += [os.path.join(dirpath, x) for x in dirnames + filenames]
        for n in targets:
            try:
                os.chown(n, pw.pw_uid, pw.pw_gid)
            except OSError:
                pass

    def _stage_state(self, autoload: bool) -> bool:
        """Where RetroArch's auto-load looks: the game's state when resuming,
        nothing when starting over. True when there is a state to load."""
        auto = self._auto_state().with_name(f"{self._base()}.state.auto")
        if autoload and self._auto_state().is_file():
            shutil.copyfile(self._auto_state(), auto)
            self._own(auto)
            return True
        auto.unlink(missing_ok=True)
        return False

    def command_line(self, core: str, autoload: bool) -> list[str]:
        """RetroArch as the kiosk user, on the TV's display, from where the game was left unless not."""
        g = self.gcfg
        user = g.get("user", "pi")
        try:
            pw = pwd.getpwnam(user)
            uid, home = pw.pw_uid, pw.pw_dir
        except KeyError:
            uid, home = 1000, "/home/pi"
        runtime = g.get("runtime_dir") or f"/run/user/{uid}"
        env = [f"XDG_RUNTIME_DIR={runtime}", f"WAYLAND_DISPLAY={g.get('wayland_display') or wayland_socket(runtime)}",
               f"HOME={home}"]
        cmd = [g.get("retroarch", "retroarch"), "--config", str(self.root / "cfg" / "retroarch.cfg"), "--verbose",
               "-L", core, self.game["path"]]
        return (["runuser", "-u", user, "--"] if os.geteuid() == 0 else []) + ["env", *env, *cmd]

    async def _launch(self, autoload: bool) -> None:
        core = self.core_for(self.game["platform"])
        if not core:
            self.state = "idle"
            await self._event("error", message="Den här konsolen går inte att spela här än")
            return
        resume = self._stage_state(autoload)
        self.write_config(Path(core).name.replace("_libretro.so", ""), autoload=resume)
        cmd = self.command_line(core, autoload)
        log.info("starting %s (%s)", self.game["name"], "resuming" if autoload else "from the start")
        log_path = self.root / "retroarch.log"
        with open(log_path, "wb") as out:
            self.proc = await asyncio.create_subprocess_exec(*cmd, stdout=out, stderr=asyncio.subprocess.STDOUT)
        self.pads.shared["games"] = True
        for pad in self.pads.pads():
            await pad.release_everything()
        self.dispatcher.vinput.release_all()
        self.dispatcher.system_hook = self.on_system
        self.state = "running"
        await self._event("running")
        asyncio.create_task(self._watch(self.proc, log_path))

    async def _watch(self, proc: asyncio.subprocess.Process, log_path: Path) -> None:
        started = time.monotonic()
        rc = await proc.wait()
        ran = time.monotonic() - started
        self.pads.shared["games"] = False
        self.dispatcher.system_hook = None
        if proc is self.proc:
            self.proc = None
        log.info("retroarch exited (%s) after %.0f s", rc, ran)
        if self.state == "pausing":
            self.state = "paused"
            await self._event("paused", screen=self.screen_at)
            return
        quitting = self.state == "quitting"
        game, self.game, self.state = self.game, None, "idle"
        if rc and ran < 10 and not quitting:
            # It never got going: say why instead of just going back.
            tail = ""
            try:
                lines = [l for l in log_path.read_text(errors="replace").splitlines() if "[ERROR]" in l]
                tail = lines[-1].split("]", 2)[-1].strip() if lines else ""
            except OSError:
                pass
            log.warning("retroarch failed to start: %s", tail or rc)
            await self._event("error", message="Spelet kunde inte startas" + (f": {tail}" if tail else ""))
            return
        await self._event("exited", game=game["id"] if game else None)

    # ------------------------------------------------------------ RetroArch
    def command(self, text: str) -> None:
        """One of RetroArch's network commands (PAUSE_TOGGLE, SCREENSHOT, QUIT)."""
        port = int(self.gcfg.get("port", 55355))
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.sendto(text.encode(), ("127.0.0.1", port))
        except OSError as exc:
            log.warning("retroarch command %s: %s", text, exc)

    async def _quit_process(self, grace: float = 8) -> None:
        """QUIT, and if RetroArch is still there after grace seconds, end it.
        A short grace is for a pause, with the state already written."""
        proc = self.proc
        if not (proc and proc.returncode is None):
            return
        self.command("QUIT")
        try:
            await asyncio.wait_for(asyncio.shield(proc.wait()), grace)
            return
        except asyncio.TimeoutError:
            pass
        if grace >= 8:
            log.warning("retroarch did not quit; ending it")
        # proc is runuser; the signal has to reach RetroArch itself.
        cfg = str(self.root / "cfg" / "retroarch.cfg")
        try:
            kill = await asyncio.create_subprocess_exec("pkill", "-KILL", "-f", "--", f"retroarch --config {cfg}",
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await kill.wait()
        except OSError:
            pass
        try:
            await asyncio.wait_for(asyncio.shield(proc.wait()), 3)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass

    # ------------------------------------------------------------ held
    # With the overlay up, Home holds the game where it is instead: RetroArch
    # pauses and stays on screen, and the overlay draws the pause panel over
    # it. Nothing is written or restarted, so carrying on is instant; Spara
    # läge, Ladda läge and Starta om are RetroArch's own commands. Without the
    # overlay (Weston, or the overlay down) Home pauses as before.
    async def hold(self) -> None:
        if self.state != "running" or not (self.proc and self.proc.returncode is None):
            return
        self.command("PAUSE_TOGGLE")
        self.state = "held"
        # The pads drive the panel (keys to the overlay) until the game goes on.
        self.pads.shared["games"] = False
        for pad in self.pads.pads():
            await pad.release_everything()
        point = self._point_path()
        await self._event("held", title=self.game["name"] if self.game else "",
                          point=point.stat().st_mtime if point and point.is_file() else None,
                          players=self._players()[1])

    async def _unhold(self, load: str) -> tuple[bool, str]:
        if load == "point":
            point = self._point_path()
            if not point or not point.is_file():
                return False, "inget sparat läge"
            shutil.copyfile(point, self._auto_state())
            self._own(self._auto_state())
            self.command("LOAD_STATE")
        elif load == "none":
            self.command("RESET")
        self.dispatcher.vinput.release_all()
        self.pads.shared["games"] = True
        for pad in self.pads.pads():
            await pad.release_everything()
        self.command("PAUSE_TOGGLE")
        self.state = "running"
        await self._event("running")
        return True, ""

    async def on_system(self, name: str) -> bool:
        """The box's own buttons while RetroArch has the screen. True: handled here."""
        if name == "menu" and self.state == "held":
            asyncio.create_task(self._unhold("auto"))           # Home again: carry on
        elif name == "menu" and self.overlay():
            asyncio.create_task(self.hold())
        elif name == "menu":
            asyncio.create_task(self.pause())
        elif name == "back" and self.state == "held":            # hold B on the panel: Avsluta
            asyncio.create_task(self.quit())
        elif name == "home":
            async def home() -> None:
                await self.quit()
                await self.emit({"type": "event", "name": "home"})
            asyncio.create_task(home())
        # The rest (keyboard, back, status) has nothing to act on while a game has the screen.
        return True

    async def _event(self, state: str, **extra) -> None:
        await self.emit({"type": "event", "name": "games", "state": state, **extra})

    async def reap_strays(self) -> None:
        """A RetroArch left from before a daemon restart: nothing would give it
        the pads or take Home to it, so it goes."""
        cfg = str(self.root / "cfg" / "retroarch.cfg")
        try:
            proc = await asyncio.create_subprocess_exec("pkill", "-f", "--", f"retroarch --config {cfg}",
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            if await proc.wait() == 0:
                log.info("stopped a RetroArch left from before")
        except OSError:
            pass

    async def close(self) -> None:
        if self.task:
            self.task.cancel()
        await self.quit()
