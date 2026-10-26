"""Films, series and clips from Jellyfin, played in mpv on the TV's display.

The Film & serier page (extension/launcher/film.js) browses Jellyfin in
Chromium; playing happens here, as games do in RetroArch (games.py). Chromium
cannot decode HEVC or 10-bit video on the Pi; mpv can, in hardware: 1080p
HEVC 10-bit with --hwdec=drm --vo=gpu --profile=fast dropped no frames at
about 22 % CPU (measured on the box in October; plain --vo=gpu dropped about
nine a second). mpv streams the file as it is from Jellyfin
(/Videos/<id>/stream?static=true) and plays MKV, HEVC, AVI and MPEG-2 itself,
so Jellyfin never transcodes.

mpv is only ever the picture: no on-screen controller, our own key map
(input.conf, written here) and the API key in a config file only the kiosk
user can read, never on its command line. The pad drives it through the
virtual keyboard: A, B and X pause and resume (with the timeline shown),
left and right seek ten seconds, L1 and R1 a minute. Holding B stops; Home
pauses and leaves the quick menu to the overlay, holding Home stops and goes
home. Nothing plays on by itself: at the end mpv quits and the page says
"Tryck B för att fortsätta".

Jellyfin hears what plays (Sessions/Playing, every ten seconds while it
plays, and where it stopped), so "Fortsätt titta" and "played" follow the box.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import pwd
import re
import time
from pathlib import Path
from typing import Callable, Coroutine
from urllib.parse import quote

import aiohttp

from . import jellyfin
from .games import wayland_socket

log = logging.getLogger("pioneertv.video")

TICKS = 10_000_000              # Jellyfin counts time in 100 ns ticks
REPORT_EVERY = 10               # seconds between progress reports
ITEM_ID = re.compile(r"^[A-Za-z0-9-]{1,64}$")

# mpv's options. --hwdec=drm with --vo=gpu decodes HEVC in hardware and
# keeps up at 1080p; --profile=fast drops the costly scaling. The cache
# rides out a slow moment of Wi-Fi: the 1080p HEVC files need about 4.5
# Mbit/s and Jellyfin delivered about 5.3 to the box.
MPV_CONF = """\
hwdec=drm
vo=gpu
profile=fast
fullscreen=yes
osc=no
input-default-bindings=no
input-vo-keyboard=yes
cursor-autohide=always
keep-open=no
idle=no
ytdl=no
cache=yes
demuxer-max-bytes=150MiB
demuxer-readahead-secs=60
osd-level=1
osd-duration=2500
osd-bar=yes
osd-font-size=40
sub-auto=no
"""

# The pad arrives as keys (actions.py): A is Enter, B Escape, X Space,
# left and right the arrows, L1 and R1 Shift+Tab and Tab.
INPUT_CONF = """\
ENTER cycle pause; show-progress
SPACE cycle pause; show-progress
ESC cycle pause; show-progress
LEFT seek -10; show-progress
RIGHT seek 10; show-progress
TAB seek 60; show-progress
Shift+TAB seek -60; show-progress
UP show-progress
DOWN show-progress
"""

# Jellyfin's subtitle codecs and the file ending it serves them as.
SUBTITLE_FORMAT = {"subrip": "srt", "srt": "srt", "ass": "ass", "ssa": "ssa", "webvtt": "vtt", "vtt": "vtt"}


def tracks(source: dict, audio: int | None, subtitle: int | None) -> dict:
    """mpv's track choices for Jellyfin's stream indexes (counted over all of
    a file's streams; mpv numbers each kind from 1, in file order). External
    subtitles are files of their own: their address, under "sub_file"."""
    streams = source.get("MediaStreams") or []
    out: dict = {}
    inside = [s for s in streams if s.get("Type") == "Audio" and not s.get("IsExternal")]
    for n, s in enumerate(inside, 1):
        if s.get("Index") == audio:
            out["aid"] = str(n)
    if subtitle is not None and subtitle < 0:
        out["sid"] = "no"
        return out
    subs = [s for s in streams if s.get("Type") == "Subtitle"]
    for n, s in enumerate([s for s in subs if not s.get("IsExternal")], 1):
        if s.get("Index") == subtitle:
            out["sid"] = str(n)
    for s in subs:
        if s.get("IsExternal") and s.get("Index") == subtitle:
            fmt = SUBTITLE_FORMAT.get((s.get("Codec") or "").lower(), "srt")
            out["sub_file"] = (s.get("Index"), fmt)
    return out


class Video:
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine], dispatcher) -> None:
        self.cfg = cfg
        self.emit = emit
        self.dispatcher = dispatcher
        self.proc: asyncio.subprocess.Process | None = None
        self.item: dict | None = None      # what plays: {id, name, source}
        self.state = "idle"                # idle | starting | running | stopping
        self.position = 0.0
        self.paused = False
        self.ended = False
        self.ipc_task: asyncio.Task | None = None
        self.writer: asyncio.StreamWriter | None = None

    # ------------------------------------------------------------ config
    @property
    def jcfg(self) -> dict:
        return self.cfg.get("jellyfin") or {}

    @property
    def vcfg(self) -> dict:
        return self.cfg.get("video") or {}

    @property
    def root(self) -> Path:
        return Path(self.vcfg.get("dir", "/var/lib/pioneer-tv/video"))

    @property
    def socket_path(self) -> Path:
        return self.root / "mpv.sock"

    def status(self) -> dict:
        return {"state": self.state, "item": {k: self.item[k] for k in ("id", "name")} if self.item else None,
                "position": self.position, "paused": self.paused}

    def _busy(self) -> bool:
        return bool(self.proc and self.proc.returncode is None) or self.state == "starting"

    # ------------------------------------------------------------ the API
    async def play(self, item_id: str, start: float = 0, audio: int | None = None, subtitle: int | None = None) -> tuple[bool, str]:
        if not ITEM_ID.match(item_id or ""):
            return False, "okänd video"
        if self._busy():
            return False, "en video spelas redan"
        if not self.jcfg.get("url") or not self.jcfg.get("api_key"):
            return False, "no_key"
        self.state = "starting"
        try:
            item = await self._get(f"Items/{item_id}", {"Fields": "MediaSources"})
            sources = item.get("MediaSources") or []
            if not sources:
                raise ValueError("no media source")
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, KeyError) as exc:
            log.warning("jellyfin: %s: %s", item_id, exc)
            self.state = "idle"
            return False, "Jellyfin svarar inte"
        self.item = {"id": item_id, "name": item.get("Name", ""), "source": sources[0]}
        self.position, self.paused, self.ended = max(0.0, float(start or 0)), False, False
        try:
            await self._launch(audio, subtitle)
        except OSError as exc:
            log.warning("mpv: %s", exc)
            self.state, self.item = "idle", None
            return False, "mpv kunde inte startas"
        return True, ""

    async def stop(self) -> None:
        """Stop playing; the page goes back to where it was."""
        if not (self.proc and self.proc.returncode is None):
            return
        self.state = "stopping"
        await self._command(["quit"])
        try:
            await asyncio.wait_for(asyncio.shield(self.proc.wait()), 5)
        except asyncio.TimeoutError:
            log.warning("mpv did not quit; ending it")
            await self._kill()

    # ------------------------------------------------------------ mpv
    def write_config(self) -> Path:
        """mpv's config folder, readable by the kiosk user alone: the API key is in it."""
        conf = self.root / "mpv"
        conf.mkdir(parents=True, exist_ok=True)
        os.chmod(conf, 0o700)
        (conf / "mpv.conf").write_text(MPV_CONF + f"http-header-fields=X-Emby-Token: {self.jcfg['api_key']}\n")
        (conf / "input.conf").write_text(INPUT_CONF)
        for f in (conf / "mpv.conf", conf / "input.conf"):
            os.chmod(f, 0o600)
        self._own(conf)
        self._own(self.root)
        return conf

    def stream_url(self, item_id: str, source_id: str) -> str:
        base = self.jcfg["url"].rstrip("/")
        return f"{base}/Videos/{quote(item_id)}/stream?static=true&MediaSourceId={quote(source_id)}&DeviceId={jellyfin.DEVICE_ID}"

    def command_line(self, conf: Path, audio: int | None, subtitle: int | None) -> list[str]:
        """mpv as the kiosk user, on the TV's display."""
        user = self.vcfg.get("user", "pi")
        try:
            pw = pwd.getpwnam(user)
            uid, home = pw.pw_uid, pw.pw_dir
        except KeyError:
            uid, home = 1000, "/home/pi"
        runtime = self.vcfg.get("runtime_dir") or f"/run/user/{uid}"
        env = [f"XDG_RUNTIME_DIR={runtime}", f"WAYLAND_DISPLAY={self.vcfg.get('wayland_display') or wayland_socket(runtime)}",
               f"HOME={home}"]
        source = self.item["source"]
        cmd = [self.vcfg.get("mpv", "mpv"), f"--config-dir={conf}", f"--input-ipc-server={self.socket_path}",
               f"--log-file={self.root / 'mpv.log'}", f"--title=Pioneer TV: {self.item['name']}"]
        if self.position > 1:
            cmd.append(f"--start={self.position:.1f}")
        chosen = tracks(source, audio, subtitle)
        if "aid" in chosen:
            cmd.append(f"--aid={chosen['aid']}")
        if "sid" in chosen:
            cmd.append(f"--sid={chosen['sid']}")
        if "sub_file" in chosen:
            index, fmt = chosen["sub_file"]
            base = self.jcfg["url"].rstrip("/")
            cmd.append(f"--sub-file={base}/Videos/{quote(self.item['id'])}/{quote(source.get('Id', ''))}/Subtitles/{index}/0/Stream.{fmt}")
        cmd.append(self.stream_url(self.item["id"], source.get("Id", self.item["id"])))
        return (["runuser", "-u", user, "--"] if os.geteuid() == 0 else []) + ["env", *env, *cmd]

    async def _launch(self, audio: int | None, subtitle: int | None) -> None:
        conf = self.write_config()
        self.socket_path.unlink(missing_ok=True)
        cmd = self.command_line(conf, audio, subtitle)
        log.info("playing %s from %.0f s", self.item["name"], self.position)
        self.proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        self.dispatcher.system_hook = self.on_system
        asyncio.create_task(self._watch(self.proc))
        self.ipc_task = asyncio.create_task(self._ipc())

    async def _watch(self, proc: asyncio.subprocess.Process) -> None:
        started = time.monotonic()
        rc = await proc.wait()
        ran = time.monotonic() - started
        if self.dispatcher.system_hook == self.on_system:
            self.dispatcher.system_hook = None
        # mpv says "end-file" just before it exits: read what is left on its
        # socket before deciding whether it reached the end.
        if self.ipc_task:
            try:
                await asyncio.wait_for(asyncio.shield(self.ipc_task), 2)
            except asyncio.TimeoutError:
                self.ipc_task.cancel()
        log.info("mpv exited (%s) after %.0f s at %.0f s", rc, ran, self.position)
        item, ended, was = self.item, self.ended, self.state
        self.proc, self.item, self.state, self.writer = None, None, "idle", None
        if item and was != "starting":
            await self._report("Stopped", item)
        if was == "starting":
            # It never played: say why instead of just going back.
            tail = ""
            try:
                lines = [l for l in (self.root / "mpv.log").read_text(errors="replace").splitlines() if "[e]" in l or "error" in l.lower()]
                tail = lines[-1].split("]", 2)[-1].strip() if lines else ""
            except OSError:
                pass
            log.warning("mpv did not start playing: %s", tail or rc)
            await self._event("error", message="Videon kunde inte spelas")
        elif ended:
            await self._event("ended")
        else:
            await self._event("stopped")

    async def _ipc(self) -> None:
        """Follow mpv over its socket: when it starts playing, where it is,
        paused or not, and whether it reached the end."""
        for _ in range(100):                         # up to 10 s for mpv to open it
            if self.socket_path.exists():
                break
            await asyncio.sleep(0.1)
        try:
            reader, self.writer = await asyncio.open_unix_connection(str(self.socket_path))
        except OSError as exc:
            log.warning("mpv socket: %s", exc)
            return
        await self._command(["observe_property", 1, "time-pos"])
        await self._command(["observe_property", 2, "pause"])
        reported = 0.0
        try:
            while line := await reader.readline():
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                event = msg.get("event")
                if event == "playback-restart" and self.state == "starting":
                    self.state = "running"
                    await self._event("running")
                    await self._report("Start")
                    reported = time.monotonic()
                elif event == "property-change" and msg.get("name") == "time-pos" and msg.get("data") is not None:
                    self.position = float(msg["data"])
                    if self.state == "running" and time.monotonic() - reported >= REPORT_EVERY:
                        reported = time.monotonic()
                        await self._report("Progress")
                elif event == "property-change" and msg.get("name") == "pause":
                    self.paused = bool(msg.get("data"))
                    if self.state == "running":
                        await self._report("Progress")
                elif event == "end-file" and msg.get("reason") == "eof":
                    self.ended = True
        except (OSError, asyncio.IncompleteReadError):
            pass

    async def _command(self, command: list) -> None:
        if not self.writer:
            return
        try:
            self.writer.write((json.dumps({"command": command}) + "\n").encode())
            await self.writer.drain()
        except OSError as exc:
            log.debug("mpv command %s: %s", command, exc)

    async def _kill(self) -> None:
        conf = str(self.root / "mpv")
        try:
            kill = await asyncio.create_subprocess_exec("pkill", "-KILL", "-f", "--", f"mpv --config-dir={conf}",
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await kill.wait()
        except OSError:
            pass

    async def on_system(self, name: str) -> bool:
        """The box's own buttons while mpv has the screen. True: handled here."""
        if name == "back":                                  # hold B
            asyncio.create_task(self.stop())
            return True
        if name == "menu":                                  # Home: pause, and the overlay's menu opens over it
            await self._command(["set_property", "pause", True])
            return False
        if name == "home":                                  # hold Home: stop, and the start page
            await self.stop()
            return False
        return name == "keyboard"                           # nothing to type into

    # ------------------------------------------------------------ Jellyfin
    def _headers(self) -> dict:
        return {"Authorization": jellyfin.auth_header(self.jcfg["api_key"]), "Accept-Encoding": "identity"}

    async def _get(self, path: str, params: dict) -> dict:
        url = self.jcfg["url"].rstrip("/") + "/" + path
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(url, params=params, headers=self._headers()) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)

    async def _report(self, what: str, item: dict | None = None) -> None:
        """Sessions/Playing (Start), /Progress or /Stopped. Only logged when it
        fails: the video does not depend on it."""
        item = item or self.item
        if not item:
            return
        path = {"Start": "Sessions/Playing", "Progress": "Sessions/Playing/Progress", "Stopped": "Sessions/Playing/Stopped"}[what]
        body = {"ItemId": item["id"], "MediaSourceId": item["source"].get("Id"), "PositionTicks": int(self.position * TICKS),
                "IsPaused": self.paused, "PlayMethod": "DirectPlay", "CanSeek": True}
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                async with s.post(self.jcfg["url"].rstrip("/") + "/" + path, json=body, headers=self._headers()) as resp:
                    if resp.status >= 300:
                        log.warning("jellyfin report %s: %s", what, resp.status)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("jellyfin report %s: %s", what, exc)

    # ------------------------------------------------------------ the rest
    def _own(self, path: Path) -> None:
        """What mpv reads and writes belongs to the kiosk user, who runs it."""
        if os.geteuid() != 0:
            return
        try:
            pw = pwd.getpwnam(self.vcfg.get("user", "pi"))
        except KeyError:
            return
        for p in [path, *path.iterdir()] if path.is_dir() else [path]:
            try:
                os.chown(p, pw.pw_uid, pw.pw_gid)
            except OSError:
                pass

    async def _event(self, state: str, **extra) -> None:
        await self.emit({"type": "event", "name": "video", "state": state, **extra})

    async def reap_strays(self) -> None:
        """An mpv left from before a daemon restart: nothing would follow it, so it goes."""
        conf = str(self.root / "mpv")
        try:
            proc = await asyncio.create_subprocess_exec("pkill", "-f", "--", f"mpv --config-dir={conf}",
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            if await proc.wait() == 0:
                log.info("stopped an mpv left from before")
        except OSError:
            pass

    async def close(self) -> None:
        await self.stop()
