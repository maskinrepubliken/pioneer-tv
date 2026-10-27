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
virtual keyboard: A, B and X pause it and the overlay shows the pause panel
(Fortsätt, Ljud, Undertexter; B, X or Home carry on), or without the
overlay only pause and resume, with the timeline; left and right seek ten
seconds, L1 and R1 a minute. Holding B stops; Home opens the pause panel
too (the quick menu's choices act on the page hidden below), holding Home
stops and goes home. Nothing plays on by itself: at the end mpv quits and the page says
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
# left and right the arrows, L1 and R1 Shift+Tab and Tab. A, B and X ask for
# the pause panel, which the overlay draws (PANEL_KEYS); without the overlay
# they only pause, with the timeline.
PAUSE_KEYS = """\
ENTER cycle pause; show-progress
SPACE cycle pause; show-progress
ESC cycle pause; show-progress
"""
PANEL_KEYS = """\
ENTER script-message pioneer-panel
SPACE script-message pioneer-panel
ESC script-message pioneer-panel
"""
INPUT_CONF = """\
LEFT seek -10; show-progress
RIGHT seek 10; show-progress
TAB seek 60; show-progress
Shift+TAB seek -60; show-progress
UP show-progress
DOWN show-progress
"""

# Languages as the panel names them (mpv gives ISO 639 codes).
LANGUAGES = {"swe": "Svenska", "sv": "Svenska", "eng": "Engelska", "en": "Engelska", "nor": "Norska", "no": "Norska",
             "nob": "Norska", "dan": "Danska", "da": "Danska", "fin": "Finska", "fi": "Finska", "ger": "Tyska",
             "deu": "Tyska", "de": "Tyska", "fre": "Franska", "fra": "Franska", "fr": "Franska", "spa": "Spanska",
             "es": "Spanska", "ita": "Italienska", "it": "Italienska", "jpn": "Japanska", "ja": "Japanska"}


def track_label(t: dict) -> str:
    """A track as the panel shows it: its language, and its title when it says more."""
    lang = LANGUAGES.get((t.get("lang") or "").lower(), t.get("lang") or "")
    title = t.get("title") or ""
    if lang and title and title.lower() not in lang.lower():
        return f"{lang} · {title}"
    return lang or title or f"Spår {t.get('id')}"


def panel_tracks(track_list: list) -> dict:
    """The audio and subtitle tracks mpv has, for the pause panel."""
    out: dict = {"audio": [], "subtitles": []}
    for t in track_list or []:
        kind = {"audio": "audio", "sub": "subtitles"}.get(t.get("type"))
        if kind:
            out[kind].append({"id": t.get("id"), "label": track_label(t), "selected": bool(t.get("selected"))})
    return out


def languages(source: dict, audio: int | None, subtitle: int | None) -> dict:
    """The languages of the tracks asked for (Jellyfin's stream indexes):
    {"audio": "swe", "subtitles": "eng" or "no"}, what is known of them."""
    streams = {s.get("Index"): s for s in source.get("MediaStreams") or []}
    out = {}
    # Only where there was a choice: one with no subtitles at all says
    # nothing about the next episode, which may have them.
    if not any(s.get("Type") == "Subtitle" for s in streams.values()):
        subtitle = None
    if sum(s.get("Type") == "Audio" for s in streams.values()) < 2:
        audio = None
    if audio is not None and (streams.get(audio) or {}).get("Language"):
        out["audio"] = streams[audio]["Language"]
    if subtitle is not None and subtitle < 0:
        out["subtitles"] = "no"
    elif subtitle is not None and (streams.get(subtitle) or {}).get("Language"):
        out["subtitles"] = streams[subtitle]["Language"]
    return out


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
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine], dispatcher,
                 overlay: Callable[[], bool] = lambda: False) -> None:
        self.cfg = cfg
        self.overlay = overlay             # True while the overlay is up: it draws the pause panel
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
        self._user: tuple | None = None    # ((url, key, wanted), user id)
        self.menu_paused = False           # the quick menu paused it, and resumes it
        self.held = False                  # the pause panel is open over it
        self.track_list: list = []         # mpv's, as it last said

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
        # Until _watch has reported where it stopped: a new play() before
        # that would have its position saved as the old video's.
        return self.state != "idle"

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
            # Jellyfin answers 400 for an item without the user (10.11 on the server).
            item = await self._get(f"Items/{item_id}", {"Fields": "MediaSources", "userId": await self._user_id()})
            sources = item.get("MediaSources") or []
            if not sources:
                raise ValueError("no media source")
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, KeyError) as exc:
            log.warning("jellyfin: %s: %s", item_id, exc)
            self.state = "idle"
            return False, "Jellyfin svarar inte"
        self.item = {"id": item_id, "name": item.get("Name", ""), "source": sources[0],
                     "key": item.get("SeriesId") or item_id}
        self.remember(self.item["key"], **languages(sources[0], audio, subtitle))
        self.position, self.paused, self.ended = max(0.0, float(start or 0)), False, False
        self.menu_paused = False
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
        (conf / "input.conf").write_text((PANEL_KEYS if self.overlay() else PAUSE_KEYS) + INPUT_CONF)
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
        item, ended, was, position, paused = self.item, self.ended, self.state, self.position, self.paused
        self.proc, self.writer, self.held = None, None, False
        if item and was != "starting":
            await self._report("Stopped", item, position, paused)
            await self._save_position(item, ended, position)
        self.item, self.state = None, "idle"
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
        await self._command(["observe_property", 3, "track-list"])
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
                elif event == "property-change" and msg.get("name") == "track-list":
                    self.track_list = msg.get("data") or []
                elif event == "client-message" and (msg.get("args") or [None])[0] == "pioneer-panel":
                    await self.hold()
                elif event == "end-file" and msg.get("reason") == "eof":
                    self.ended = True
        except (OSError, asyncio.IncompleteReadError):
            pass

    # ------------------------------------------------------------ the pause panel
    async def hold(self) -> None:
        """A, B or X: pause, keep the timeline up, and have the overlay show
        Fortsätt, Ljud and Undertexter."""
        if self.state != "running" or self.held:
            return
        self.held = True
        await self._command(["set_property", "pause", True])
        await self._command(["set_property", "osd-level", 3])
        await self._event("held", title=self.item["name"] if self.item else "", **panel_tracks(self.track_list))

    async def resume(self) -> None:
        if not self.held:
            return
        self.held = False
        await self._command(["set_property", "osd-level", 1])
        await self._command(["set_property", "pause", False])
        await self._event("running")

    async def track(self, kind: str, track_id) -> tuple[bool, str]:
        """Ljud or Undertexter from the panel: an mpv track id, or "no" for no subtitles."""
        prop = {"audio": "aid", "subtitles": "sid"}.get(kind)
        if not prop or not (track_id == "no" and kind == "subtitles" or isinstance(track_id, int)):
            return False, "okänt spår"
        await self._command(["set_property", prop, track_id])
        if self.item:
            chosen = next((t for t in self.track_list if t.get("type") == ("audio" if kind == "audio" else "sub")
                           and t.get("id") == track_id), None)
            lang = "no" if track_id == "no" else (chosen or {}).get("lang") or ""
            if lang:
                self.remember(self.item["key"], **{kind: lang})
        return True, ""

    # ------------------------------------------------------------ remembered choices
    # The sound and subtitles last chosen, by language, for each series (or
    # film): the detail page picks them again for the next episode, where
    # Jellyfin would start from the user's defaults every time.
    @property
    def choices_path(self) -> Path:
        return self.root / "choices.json"

    def choices(self) -> dict:
        try:
            data = json.loads(self.choices_path.read_text())
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def choice(self, key: str) -> dict:
        return self.choices().get(key) or {}

    def remember(self, key: str, audio: str = "", subtitles: str = "") -> None:
        if not key or not (audio or subtitles):
            return
        data = self.choices()
        entry = dict(data.get(key) or {})
        if audio:
            entry["audio"] = audio
        if subtitles:
            entry["subtitles"] = subtitles
        data[key] = entry
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            tmp = self.choices_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data))
            tmp.replace(self.choices_path)
        except OSError as exc:
            log.warning("remembering the tracks: %s", exc)

    async def media(self, action: str) -> None:
        """The quick menu opening (pause) and closing (resume): only what it
        paused carries on, so a video paused before stays paused."""
        if self.state != "running" or self.held:            # the panel pauses and resumes it itself
            return
        if action == "pause" and not self.paused:
            self.menu_paused = True
            await self._command(["set_property", "pause", True])
        elif action == "resume" and self.menu_paused:
            self.menu_paused = False
            await self._command(["set_property", "pause", False])

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
        if name == "menu" and self.held:                    # Home on the panel: carry on
            await self.resume()
            return True
        if name == "menu" and self.overlay():               # Home: the pause panel, as in a game
            await self.hold()
            return True
        if name == "menu":                                  # without the overlay: the page's menu, which pauses it (media)
            return False
        if name == "home":                                  # hold Home: stop, and the start page
            await self.stop()
            return False
        return name == "keyboard"                           # nothing to type into

    # ------------------------------------------------------------ Jellyfin
    async def _user_id(self) -> str:
        """The user the box plays as, as for the pages (jellyfin.pick_user)."""
        wanted = (self.jcfg.get("url"), self.jcfg.get("api_key"), self.jcfg.get("user", ""))
        if self._user and self._user[0] == wanted:
            return self._user[1]
        url = self.jcfg["url"].rstrip("/") + "/Users"
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(url, headers=self._headers()) as resp:
                resp.raise_for_status()
                users = await resp.json(content_type=None)
        user = jellyfin.pick_user(users if isinstance(users, list) else [], wanted[2])
        if not user:
            raise ValueError("no such user")
        self._user = (wanted, user["Id"])
        return user["Id"]

    def _headers(self) -> dict:
        return {"Authorization": jellyfin.auth_header(self.jcfg["api_key"]), "Accept-Encoding": "identity"}

    async def _get(self, path: str, params: dict) -> dict:
        url = self.jcfg["url"].rstrip("/") + "/" + path
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(url, params=params, headers=self._headers()) as resp:
                resp.raise_for_status()
                return await resp.json(content_type=None)

    async def _report(self, what: str, item: dict | None = None, position: float | None = None,
                      paused: bool | None = None) -> None:
        """Sessions/Playing (Start), /Progress or /Stopped. Only logged when it
        fails: the video does not depend on it."""
        item = item or self.item
        if not item:
            return
        path = {"Start": "Sessions/Playing", "Progress": "Sessions/Playing/Progress", "Stopped": "Sessions/Playing/Stopped"}[what]
        position = self.position if position is None else position
        body = {"ItemId": item["id"], "MediaSourceId": item["source"].get("Id"), "PositionTicks": int(position * TICKS),
                "IsPaused": self.paused if paused is None else paused, "PlayMethod": "DirectPlay", "CanSeek": True}
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                async with s.post(self.jcfg["url"].rstrip("/") + "/" + path, json=body, headers=self._headers()) as resp:
                    if resp.status >= 300:
                        log.warning("jellyfin report %s: %s", what, resp.status)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("jellyfin report %s: %s", what, exc)

    async def _save_position(self, item: dict, ended: bool, position: float) -> None:
        """Where the video was left, on the user: the reports above come from
        the API key, which is no user, so they move nobody's "Fortsätt
        titta" (seen on the box). Jellyfin's own rules: past 90 % it counts
        as seen, before 5 % nothing is kept."""
        runtime = (item["source"].get("RunTimeTicks") or 0) / TICKS
        share = position / runtime if runtime else 0
        played = ended or share >= 0.9
        data = {"PlaybackPositionTicks": 0 if played or share < 0.05 else int(position * TICKS),
                "LastPlayedDate": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        # Only ever marked seen here, never unmarked: watching a seen film
        # again and stopping halfway keeps it seen, as in Jellyfin.
        if played:
            data["Played"] = True
        try:
            url = f"{self.jcfg['url'].rstrip('/')}/UserItems/{quote(item['id'])}/UserData"
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                async with s.post(url, params={"userId": await self._user_id()}, json=data, headers=self._headers()) as resp:
                    if resp.status >= 300:
                        log.warning("jellyfin user data: %s", resp.status)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            log.warning("jellyfin user data: %s", exc)

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
