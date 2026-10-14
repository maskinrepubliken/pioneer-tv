"""Games that run natively, in RetroArch on the TV's Weston, instead of in
the browser.

EmulatorJS emulates the N64's processor with an interpreter in WebAssembly:
on the Pi 4 that is about 23 frames a second in Super Mario 64 whatever the
core or its options (measured on the box). RetroArch's mupen64plus_next,
built for the Pi with its ARM64 recompiler and GLES3 (system/build-n64-core.sh),
does not have that wall. The Spel pages still browse RomM; for a console with
a native core the player asks the daemon to play the game instead
(POST /api/native/play): the daemon fetches the file from RomM into a cache,
writes RetroArch's config and starts it as the Weston user. Kiosk-shell puts
its window over Chromium; when it quits, Chromium is back.

While it runs the pads are left to RetroArch, as in the browser's game mode,
and Home talks to RetroArch over its command port: a press opens its menu,
holding it quits (saving the game first, see the config below).
"""
from __future__ import annotations

import asyncio
import logging
import os
import pwd
import shutil
import socket
import time
from pathlib import Path
from typing import Callable, Coroutine
from urllib.parse import quote

import aiohttp

log = logging.getLogger("pioneertv.native")

# The 8BitDo Ultimate 2C on its dongle (xpad), for RetroArch's udev joypad
# driver, which numbers buttons in the order of their key codes: SOUTH 0,
# EAST 1, NORTH 2, WEST 3, TL 4, TR 5, SELECT 6, START 7, MODE 8, THUMBL 9,
# THUMBR 10. xpad reports the left face button as NORTH and the top one as
# WEST (see gamepad.py's quirk), so 2 is the RetroPad's Y (left) and 3 its X
# (top). Guide (8) is left unbound: it belongs to the box.
AUTOCONFIG = {
    "8BitDo Ultimate 2C Wireless Controller": """\
input_driver = "udev"
input_device = "8BitDo Ultimate 2C Wireless Controller"
input_b_btn = "0"
input_a_btn = "1"
input_y_btn = "2"
input_x_btn = "3"
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
""",
}

# Core options for the cores we ship, in RetroArch's core options file.
CORE_OPTIONS = {
    "mupen64plus_next": {
        "mupen64plus-cpucore": "dynamic_recompiler",
        "mupen64plus-rdp-plugin": "gliden64",
        "mupen64plus-rsp-plugin": "hle",
        "mupen64plus-43screensize": "640x480",
        "mupen64plus-aspect": "4:3",
    },
}


class Native:
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine], shared: dict, dispatcher) -> None:
        self.cfg = cfg
        self.emit = emit
        self.shared = shared            # the pad manager's: "native" leaves the pads to RetroArch
        self.dispatcher = dispatcher
        self.proc: asyncio.subprocess.Process | None = None
        self.game: dict | None = None
        self.task: asyncio.Task | None = None

    # ------------------------------------------------------------ config
    @property
    def ncfg(self) -> dict:
        return self.cfg.get("native") or {}

    @property
    def root(self) -> Path:
        return Path(self.ncfg.get("dir", "/var/lib/pioneer-tv/native"))

    def core_for(self, platform: str) -> str | None:
        core = (self.ncfg.get("cores") or {}).get(platform)
        return core if core and os.path.isfile(core) else None

    def platforms(self) -> list[str]:
        """Consoles that play natively on this box: switched on, a core in place and RetroArch installed."""
        if not self.ncfg.get("enabled") or not shutil.which(self.ncfg.get("retroarch", "retroarch")):
            return []
        return [p for p in (self.ncfg.get("cores") or {}) if self.core_for(p)]

    def status(self) -> dict:
        return {"platforms": self.platforms(), "running": bool(self.proc and self.proc.returncode is None),
                "game": self.game}

    # ------------------------------------------------------------ playing
    async def play(self, rom_id: int) -> tuple[bool, str]:
        if self.proc and self.proc.returncode is None:
            return False, "ett spel körs redan"
        if self.task and not self.task.done():
            return False, "ett spel startar redan"
        romm = self.cfg.get("romm") or {}
        if not romm.get("url") or not romm.get("api_key"):
            return False, "no_key"
        self.task = asyncio.create_task(self._play(rom_id))
        return True, ""

    async def _play(self, rom_id: int) -> None:
        try:
            game = await self._fetch(rom_id)
            if game is None:
                return
            core = self.core_for(game["platform"])
            if not core:
                await self._event("error", message="Konsolen spelas inte här")
                return
            self._write_config(Path(core).name.replace("_libretro.so", ""))
            await self._start(core, game)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.exception("native play failed")
            await self._event("error", message=f"Kunde inte starta: {exc}")

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
            game = {"id": rom_id, "name": meta.get("name") or name, "platform": meta.get("platform_slug"), "file": name}
            folder = self.root / "games" / str(rom_id)
            path = folder / name
            size = meta.get("fs_size_bytes") or 0
            if path.is_file() and (not size or path.stat().st_size == size):
                os.utime(path)                          # most recently played: kept longest
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
            game["path"] = str(path)
            self._own(self.root)
            return game

    def _make_room(self, need: int) -> None:
        """Keep the cache under native.cache_mb: drop the games played longest ago."""
        limit = int(self.ncfg.get("cache_mb", 1500)) * (1 << 20)
        games = self.root / "games"
        entries = []
        for d in games.iterdir() if games.is_dir() else []:
            files = [f for f in d.iterdir() if f.is_file()]
            if files:
                entries.append((max(f.stat().st_mtime for f in files), sum(f.stat().st_size for f in files), d))
        used = sum(e[1] for e in entries)
        for _, size, d in sorted(entries):
            if used + need <= limit:
                break
            shutil.rmtree(d, ignore_errors=True)
            used -= size

    def _write_config(self, core_name: str) -> None:
        r = self.root
        for sub in ("saves", "states", "system", "autoconfig/udev", "cfg"):
            (r / sub).mkdir(parents=True, exist_ok=True)
        port = int(self.ncfg.get("port", 55355))
        cfg = f"""\
video_driver = "gl"
video_context_driver = "wayland"
video_fullscreen = "true"
video_vsync = "true"
video_smooth = "false"
video_font_enable = "true"
audio_driver = "{self.ncfg.get("audio_driver", "pipewire")}"
audio_latency = "64"
input_driver = "wayland"
input_joypad_driver = "udev"
input_autodetect_enable = "true"
joypad_autoconfig_dir = "{r}/autoconfig"
menu_driver = "rgui"
menu_pause_libretro = "true"
pause_nonactive = "false"
quit_press_twice = "false"
confirm_quit = "false"
config_save_on_exit = "false"
network_cmd_enable = "true"
network_cmd_port = "{port}"
savefile_directory = "{r}/saves"
savestate_directory = "{r}/states"
system_directory = "{r}/system"
savestate_auto_save = "true"
savestate_auto_load = "true"
autosave_interval = "30"
core_options_path = "{r}/cfg/retroarch-core-options.cfg"
global_core_options = "true"
libretro_info_path = "/usr/share/libretro/info"
history_list_enable = "false"
"""
        (r / "cfg" / "retroarch.cfg").write_text(cfg)
        opts = CORE_OPTIONS.get(core_name, {})
        (r / "cfg" / "retroarch-core-options.cfg").write_text("".join(f'{k} = "{v}"\n' for k, v in opts.items()))
        for name, text in AUTOCONFIG.items():
            (r / "autoconfig" / "udev" / (name.replace(" ", "_") + ".cfg")).write_text(text)
        self._own(r)

    def _own(self, path: Path) -> None:
        """Everything under the native folder belongs to the Weston user, who runs RetroArch."""
        try:
            pw = pwd.getpwnam(self.ncfg.get("user", "pi"))
        except KeyError:
            return
        if os.geteuid() != 0:
            return
        for dirpath, dirnames, filenames in os.walk(path):
            for n in [dirpath, *(os.path.join(dirpath, x) for x in dirnames + filenames)]:
                try:
                    os.chown(n, pw.pw_uid, pw.pw_gid)
                except OSError:
                    pass

    async def _start(self, core: str, game: dict) -> None:
        n = self.ncfg
        user = n.get("user", "pi")
        try:
            pw = pwd.getpwnam(user)
            uid, home = pw.pw_uid, pw.pw_dir
        except KeyError:
            uid, home = 1000, "/home/pi"
        env = [f"XDG_RUNTIME_DIR={n.get('runtime_dir', f'/run/user/{uid}')}",
               f"WAYLAND_DISPLAY={n.get('wayland_display', 'wayland-1')}",
               f"HOME={home}"]
        cmd = [n.get("retroarch", "retroarch"), "--config", str(self.root / "cfg" / "retroarch.cfg"), "-L", core, game["path"]]
        if os.geteuid() == 0:
            cmd = ["runuser", "-u", user, "--", "env", *env, *cmd]
        else:
            cmd = ["env", *env, *cmd]
        log.info("starting %s: %s", game["name"], " ".join(cmd))
        log_path = self.root / "retroarch.log"
        out = open(log_path, "wb")
        self.proc = await asyncio.create_subprocess_exec(*cmd, stdout=out, stderr=asyncio.subprocess.STDOUT)
        out.close()
        self.game = {k: game[k] for k in ("id", "name", "platform")}
        self.shared["native"] = True
        self.dispatcher.system_hook = self.on_system
        await self._event("running")
        started = time.monotonic()
        rc = await self.proc.wait()
        self.shared["native"] = False
        self.dispatcher.system_hook = None
        ran = time.monotonic() - started
        log.info("retroarch exited (%s) after %.0f s", rc, ran)
        game_info, self.game, self.proc = self.game, None, None
        if rc and ran < 10:
            # It never got going: say why instead of just going back.
            tail = ""
            try:
                lines = [l for l in log_path.read_text(errors="replace").splitlines() if "[ERROR]" in l]
                tail = lines[-1].split("]", 2)[-1].strip() if lines else ""
            except OSError:
                pass
            log.warning("retroarch failed to start: %s", tail or rc)
            await self._event("error", message="RetroArch kunde inte starta spelet" + (f": {tail}" if tail else ""))
            return
        await self._event("exited", code=rc, game=game_info)

    async def quit(self) -> None:
        if not (self.proc and self.proc.returncode is None):
            return
        self.command("QUIT")                 # saves the game state, then exits
        try:
            await asyncio.wait_for(asyncio.shield(self.proc.wait()), 8)
        except asyncio.TimeoutError:
            log.warning("retroarch did not quit; terminating")
            try:
                self.proc.terminate()
            except ProcessLookupError:
                pass

    def command(self, text: str) -> None:
        """One of RetroArch's network commands (MENU_TOGGLE, QUIT, ...)."""
        port = int(self.ncfg.get("port", 55355))
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.sendto(text.encode(), ("127.0.0.1", port))

    async def on_system(self, name: str) -> bool:
        """The box's own buttons while RetroArch has the screen. True: handled here."""
        if name == "menu":
            self.command("MENU_TOGGLE")
        elif name == "home":
            asyncio.create_task(self.quit())
        # Everything else (keyboard, back, status) has nothing to act on while
        # RetroArch has the screen.
        return True

    async def _event(self, state: str, **extra) -> None:
        await self.emit({"type": "event", "name": "native", "state": state, **extra})

    async def reap_strays(self) -> None:
        """A RetroArch left from before a daemon restart: nothing would hand
        it the pads or take Home to it, so it goes."""
        cfg = str(self.root / "cfg" / "retroarch.cfg")
        proc = await asyncio.create_subprocess_exec("pkill", "-f", "--", f"retroarch --config {cfg}",
                                                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        if await proc.wait() == 0:
            log.info("stopped a RetroArch left from before")

    async def close(self) -> None:
        if self.task:
            self.task.cancel()
        await self.quit()
