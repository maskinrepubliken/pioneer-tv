"""Films, series and clips from Jellyfin, played in mpv on the TV's display.

The Film & serier library (extension/launcher/libraries/film.js) browses Jellyfin in
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
seconds. Holding B stops; Home opens the pause panel
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
# left and right the arrows. A, B and X ask for
# the pause panel, which the overlay draws (PANEL_KEYS), and left and right
# seek with its timeline over the film (pioneer-seek: mpv's own shows
# nothing then, OVERLAY_CONF); without the overlay they only pause, with
# mpv's timeline.
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
UP show-progress
DOWN show-progress
"""
PANEL_SEEK = """\
LEFT script-message pioneer-seek -10
RIGHT script-message pioneer-seek 10
UP script-message pioneer-seek 0
DOWN script-message pioneer-seek 0
"""
OVERLAY_CONF = "osd-level=0\nosd-bar=no\n"
# Subtitles searched for on the internet: these languages, the best few of each.
SUBTITLE_LANGUAGES = ("swe", "eng")
SUBTITLE_HITS = 8
REMOTE_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,200}$")

# Languages as the panel names them (mpv gives ISO 639 codes).
LANGUAGES = {"swe": "Svenska", "sv": "Svenska", "eng": "Engelska", "en": "Engelska", "nor": "Norska", "no": "Norska",
             "nob": "Norska", "dan": "Danska", "da": "Danska", "fin": "Finska", "fi": "Finska", "ger": "Tyska",
             "deu": "Tyska", "de": "Tyska", "fre": "Franska", "fra": "Franska", "fr": "Franska", "spa": "Spanska",
             "es": "Spanska", "ita": "Italienska", "it": "Italienska", "jpn": "Japanska", "ja": "Japanska"}


def track_label(t: dict) -> str:
    """A track as mpv says it, when Jellyfin says nothing of it: its
    language, and its title when it says more."""
    lang = LANGUAGES.get((t.get("lang") or "").lower(), t.get("lang") or "")
    title = t.get("title") or ""
    if lang and title and title.lower() not in lang.lower():
        return f"{lang} · {title}"
    return lang or title or f"Spår {t.get('id')}"


def stream_label(s: dict) -> str:
    """A track as Jellyfin knows it: its language (mpv would name a
    subtitle file by its file name, "Stream.srt"), its title when it says
    more, and whether it is forced or for the hard of hearing."""
    code = (s.get("Language") or "").lower()
    lang = LANGUAGES.get(code, code.capitalize() if code and code != "und" else "")
    title = s.get("Title") or ""
    parts = [lang or title or "Okänt språk"]
    if lang and title and title.lower() not in lang.lower():
        parts.append(title)
    if s.get("IsForced"):
        parts.append("tvingad")
    if s.get("IsHearingImpaired"):
        parts.append("för hörselskadade")
    return " · ".join(parts)


EXTERNAL = re.compile(r"/Subtitles/(\d+)/")


def panel_tracks(track_list: list, source: dict | None = None) -> dict:
    """The audio and subtitle tracks mpv has, for the pause panel, named by
    what Jellyfin knows of them: mpv numbers each kind in file order, as
    Jellyfin's streams inside the file go; a subtitle file is known by its
    address (or by the title it was added with)."""
    streams = (source or {}).get("MediaStreams") or []
    inside = {kind: [s for s in streams if s.get("Type") == kind and not s.get("IsExternal")] for kind in ("Audio", "Subtitle")}
    by_index = {s.get("Index"): s for s in streams}
    out: dict = {"audio": [], "subtitles": []}
    for t in track_list or []:
        kind = {"audio": "audio", "sub": "subtitles"}.get(t.get("type"))
        if not kind:
            continue
        stream = None
        if t.get("external"):
            m = EXTERNAL.search(t.get("external-filename") or "")
            ours = t.get("title") and not (t.get("title") or "").lower().startswith("stream.")
            if not ours and m:
                stream = by_index.get(int(m.group(1)))
        else:
            mine = [x for x in track_list if x.get("type") == t.get("type") and not x.get("external")]
            n = next(i for i, x in enumerate(mine) if x is t)
            group = inside["Audio" if kind == "audio" else "Subtitle"]
            stream = group[n] if n < len(group) and len(mine) == len(group) else None
        label = stream_label(stream) if stream else track_label(t)
        out[kind].append({"id": t.get("id"), "label": label, "selected": bool(t.get("selected"))})
    # Two of the same name: numbered, so they can be told apart.
    for kind, tracks in out.items():
        seen: dict = {}
        for t in tracks:
            seen[t["label"]] = seen.get(t["label"], 0) + 1
            if seen[t["label"]] > 1:
                t["label"] = f"{t['label']} ({seen[t['label']]})"
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
        self.duration: float | None = None
        self.paused = False
        self.ended = False
        self.ipc_task: asyncio.Task | None = None
        self.writer: asyncio.StreamWriter | None = None
        self._user: tuple | None = None    # ((url, key, wanted), user id)
        self.menu_paused = False           # the quick menu paused it, and resumes it
        self.held = False                  # the pause panel is open over it
        self.track_list: list = []         # mpv's, as it last said
        self.first_sub: int | None = None  # the subtitle file it started with

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
        self.duration = None
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
        overlay = self.overlay()
        (conf / "mpv.conf").write_text(MPV_CONF + (OVERLAY_CONF if overlay else "")
                                       + f"http-header-fields=X-Emby-Token: {self.jcfg['api_key']}\n")
        (conf / "input.conf").write_text(PANEL_KEYS + PANEL_SEEK if overlay else PAUSE_KEYS + INPUT_CONF)
        for f in (conf / "mpv.conf", conf / "input.conf"):
            os.chmod(f, 0o600)
        self._own(conf)
        self._own(self.root)
        return conf

    def subtitle_url(self, index: int) -> str:
        """A subtitle file of what plays, as Jellyfin serves it."""
        source = self.item["source"]
        stream = next((s for s in source.get("MediaStreams") or [] if s.get("Index") == index), {})
        fmt = SUBTITLE_FORMAT.get((stream.get("Codec") or "").lower(), "srt")
        base = self.jcfg["url"].rstrip("/")
        return f"{base}/Videos/{quote(self.item['id'])}/{quote(source.get('Id', ''))}/Subtitles/{index}/0/Stream.{fmt}"

    async def add_subtitles(self, skip: int | None = None) -> None:
        """Every subtitle file of what plays in mpv, named by its language,
        so the panel can choose any of them (the one asked for at the start
        came with it, as --sub-file)."""
        for stream in self.item["source"].get("MediaStreams") or []:
            if stream.get("Type") == "Subtitle" and stream.get("IsExternal") and stream.get("Index") != skip:
                await self._command(["sub-add", self.subtitle_url(stream["Index"]), "auto", stream_label(stream),
                                     stream.get("Language") or ""])

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
            cmd.append(f"--sub-file={self.subtitle_url(chosen['sub_file'][0])}")
        cmd.append(self.stream_url(self.item["id"], source.get("Id", self.item["id"])))
        return (["runuser", "-u", user, "--"] if os.geteuid() == 0 else []) + ["env", *env, *cmd]

    async def _launch(self, audio: int | None, subtitle: int | None) -> None:
        conf = self.write_config()
        self.socket_path.unlink(missing_ok=True)
        cmd = self.command_line(conf, audio, subtitle)
        self.first_sub = (tracks(self.item["source"], audio, subtitle).get("sub_file") or (None,))[0]
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
        await self._command(["observe_property", 4, "duration"])
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
                    await self.add_subtitles(skip=self.first_sub)
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
                elif event == "property-change" and msg.get("name") == "duration" and msg.get("data"):
                    self.duration = float(msg["data"])
                elif event == "property-change" and msg.get("name") == "track-list":
                    self.track_list = msg.get("data") or []
                elif event == "client-message" and (msg.get("args") or [None])[0] == "pioneer-panel":
                    await self.hold()
                elif event == "client-message" and (msg.get("args") or [None])[0] == "pioneer-seek":
                    await self.seeked((msg.get("args") or [None, "0"])[1:2])
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
        self.paused = True                 # mpv says so too, a moment later
        await self._command(["set_property", "pause", True])
        await self._event("held", title=self.item["name"] if self.item else "", time=self.position,
                          duration=self.length(), **panel_tracks(self.track_list, self.item["source"] if self.item else None))

    def length(self) -> float | None:
        return self.duration or (self.item["source"].get("RunTimeTicks") or 0) / TICKS or None if self.item else self.duration

    async def seeked(self, args: list) -> None:
        """Left or right while it plays (with the overlay): a seek, and the
        overlay shows where it is now on a timeline of its own."""
        try:
            by = float(args[0]) if args else 0.0
        except ValueError:
            by = 0.0
        if self.state != "running":
            return
        if by:
            await self.seek(by)
        await self._event("seeked", time=self.position, duration=self.length(), paused=self.paused)

    async def resume(self) -> None:
        if not self.held:
            return
        self.held = False
        await self._command(["set_property", "pause", False])
        await self._event("running")

    async def toggle(self) -> bool:
        """Fortsätt (or Pausa) on the panel: it plays or pauses under the
        panel, which stays open; closing it carries on."""
        if self.state == "running" and self.held:
            self.paused = not self.paused
            await self._command(["set_property", "pause", self.paused])
        return self.paused

    async def seek(self, by: float) -> None:
        """Spola on the panel: by seconds, from where it is."""
        if self.state == "running":
            await self.to(self.position + by)

    async def to(self, at: float) -> None:
        """Gå till and Från början on the panel: to a time."""
        if self.state != "running":
            return
        end = (self.duration or 0) - 1
        self.position = max(0.0, min(at, end)) if end > 0 else max(0.0, at)
        await self._command(["seek", self.position, "absolute"])

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

    # ------------------------------------------------------------ subtitles from the internet
    # Jellyfin's subtitle plugins (Open Subtitles on the box's) search for
    # what plays; one chosen is fetched by Jellyfin, kept with the film, and
    # added to mpv at once.
    async def find_subtitles(self, langs: tuple = SUBTITLE_LANGUAGES) -> tuple[bool, list | str]:
        if not self.item:
            return False, "inget spelas"
        found = []
        for lang in langs:
            try:
                hits = await self._get(f"Items/{quote(self.item['id'])}/RemoteSearch/Subtitles/{lang}", {}, timeout=30)
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                log.warning("subtitle search %s: %s", lang, exc)
                continue
            hits = [h for h in hits if isinstance(h, dict) and h.get("Id")] if isinstance(hits, list) else []
            hits.sort(key=lambda h: (not h.get("IsHashMatch"), -(h.get("DownloadCount") or 0)))
            for h in hits[:SUBTITLE_HITS]:
                lang_name = LANGUAGES.get((h.get("ThreeLetterISOLanguageName") or lang).lower(), lang)
                detail = [lang_name, "passar filen" if h.get("IsHashMatch") else "",
                          f"{h['DownloadCount']} nedladdningar" if h.get("DownloadCount") else ""]
                found.append({"id": str(h["Id"]), "name": str(h.get("Name") or h.get("Comment") or "Undertext")[:120],
                              "detail": " · ".join(d for d in detail if d), "lang": lang})
        if not found:
            return False, "Hittade inga undertexter"
        return True, found

    async def fetch_subtitle(self, sub_id: str) -> tuple[bool, dict | str]:
        """Have Jellyfin fetch one; when the film has it (Jellyfin looks
        again, a moment), it is added to mpv and chosen."""
        if not self.item or not REMOTE_ID.match(sub_id or ""):
            return False, "okänd undertext"
        before = {s.get("Path") for s in self.item["source"].get("MediaStreams") or [] if s.get("IsExternal")}
        url = f"{self.jcfg['url'].rstrip('/')}/Items/{quote(self.item['id'])}/RemoteSearch/Subtitles/{quote(sub_id, safe='')}"
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as s:
                async with s.post(url, headers=self._headers()) as resp:
                    if resp.status >= 300:
                        log.warning("subtitle download %s: %s", sub_id, resp.status)
                        return False, "Jellyfin kunde inte hämta den"
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("subtitle download %s: %s", sub_id, exc)
            return False, "Jellyfin svarar inte"
        for _ in range(20):
            await asyncio.sleep(1)
            if not self.item:
                return False, "inget spelas"
            try:
                item = await self._get(f"Items/{quote(self.item['id'])}", {"Fields": "MediaSources", "userId": await self._user_id()})
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
                continue
            source = next((x for x in item.get("MediaSources") or [] if x.get("Id") == self.item["source"].get("Id")), None)
            new = [x for x in (source or {}).get("MediaStreams") or []
                   if x.get("Type") == "Subtitle" and x.get("IsExternal") and x.get("Path") not in before]
            if new:
                self.item["source"] = source
                stream = new[0]
                label = stream_label(stream)
                await self._command(["sub-add", self.subtitle_url(stream["Index"]), "select", label, stream.get("Language") or ""])
                if stream.get("Language"):
                    self.remember(self.item["key"], subtitles=stream["Language"])
                # mpv says its new track list a moment later.
                for _ in range(30):
                    await asyncio.sleep(0.1)
                    if any(t.get("type") == "sub" and t.get("title") == label for t in self.track_list):
                        break
                return True, panel_tracks(self.track_list, self.item["source"])
        return False, "Undertexten kom inte fram"

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

    async def _get(self, path: str, params: dict, timeout: float = 10) -> dict:
        url = self.jcfg["url"].rstrip("/") + "/" + path
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as s:
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
