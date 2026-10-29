"""Music and radio, played by the daemon in an mpv of their own, without a picture.

A page only asks for it (the Musik pages' songs, a radio channel) and shows
what plays: the sound lives here, so it plays on whatever page is on screen,
under the screensaver too, until something else starts to play (a film in
mpv, a game, a site's video, a page's own sound: main.py and server.py stop
it then) or it is stopped. The overlay's quick menu has a row for it, which
opens its panel (overlay.js), as a film's and a site's video's.

A queue of songs from Jellyfin (each streamed as it is, the API key in its
address, which goes to mpv over its socket and never on a command line), or
one radio channel, live: paused, a live channel is let go, and played again
it starts where the broadcast is. Jellyfin hears what plays, as for films
(Sessions/Playing), and a song played to its end counts as played.

The state goes to every page and the overlay as an "audio" event:
{state: idle | playing | paused | loading, kind, item, index, count, time,
duration, live, next (the next few songs' names)}, at each change and every few seconds while it plays.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import pwd
import time
from pathlib import Path
from typing import Callable, Coroutine
from urllib.parse import quote

import aiohttp

from . import jellyfin

log = logging.getLogger("pioneertv.audio")

TICKS = 10_000_000              # Jellyfin counts time in 100 ns ticks
REPORT_EVERY = 30               # seconds between progress reports to Jellyfin
SAY_EVERY = 5                   # seconds between "audio" events while it plays
SONG_FIELDS = ("id", "name", "artist", "album", "seconds", "cover", "thumb")
RADIO_FIELDS = ("channel", "name", "url", "cover")


class Audio:
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine]) -> None:
        self.cfg = cfg
        self.emit = emit
        self.proc: asyncio.subprocess.Process | None = None
        self.writer: asyncio.StreamWriter | None = None
        self.queue: list[dict] = []
        self.index = -1
        self.kind = ""                  # "music" or "radio"
        self.state = "idle"
        self.time = 0.0
        self.duration: float | None = None
        self.started = False            # Jellyfin told of the song now playing
        self.reported = 0.0
        self.said = 0.0
        self.lock = asyncio.Lock()

    # ------------------------------------------------------------ config
    @property
    def jcfg(self) -> dict:
        return self.cfg.get("jellyfin") or {}

    @property
    def root(self) -> Path:
        return Path((self.cfg.get("audio") or {}).get("dir", "/var/lib/pioneer-tv/audio"))

    @property
    def socket_path(self) -> Path:
        return self.root / "mpv.sock"

    def item(self) -> dict | None:
        return self.queue[self.index] if 0 <= self.index < len(self.queue) else None

    def status(self) -> dict:
        item = self.item()
        return {"state": self.state, "kind": self.kind, "item": item, "index": self.index, "count": len(self.queue),
                "time": round(self.time, 1), "duration": self.duration, "live": self.kind == "radio",
                "next": [{"name": s.get("name"), "artist": s.get("artist")} for s in self.queue[self.index + 1:self.index + 7]]}

    def active(self) -> bool:
        """Something to show: playing, paused or on its way."""
        return self.state != "idle"

    def playing(self) -> bool:
        return self.state in ("playing", "loading")

    # ------------------------------------------------------------ the API
    async def play(self, queue: list, index: int = 0) -> tuple[bool, str]:
        """Songs from Jellyfin: [{id, name, artist, album, seconds, cover, thumb}]."""
        songs = [{k: s.get(k) for k in SONG_FIELDS} for s in queue if isinstance(s, dict) and s.get("id")]
        if not songs:
            return False, "inget att spela"
        if not self.jcfg.get("url") or not self.jcfg.get("api_key"):
            return False, "no_key"
        await self._report_stop()
        self.queue, self.kind = songs, "music"
        return await self._load(max(0, min(len(songs) - 1, int(index or 0))))

    async def radio(self, channel: dict) -> tuple[bool, str]:
        """A live channel: {channel, name, url, cover}."""
        url = str(channel.get("url") or "")
        if not url.startswith(("https://", "http://")):
            return False, "okänd kanal"
        await self._report_stop()
        self.queue, self.kind = [{k: channel.get(k) for k in RADIO_FIELDS}], "radio"
        return await self._load(0)

    async def toggle(self) -> None:
        if self.state == "playing":
            await self.pause()
        elif self.state == "paused":
            await self.resume()

    async def pause(self) -> None:
        if self.state != "playing":
            return
        if self.kind == "radio":
            # Let a live stream go; played again it starts at the broadcast.
            await self._command(["stop"])
        else:
            await self._command(["set_property", "pause", True])
        self.state = "paused"
        await self._report("Progress")
        await self.say()

    async def resume(self) -> None:
        if self.state != "paused":
            return
        if self.kind == "radio":
            await self._load(0)
            return
        await self._command(["set_property", "pause", False])
        self.state = "playing"
        await self.say()

    async def seek(self, by: float) -> None:
        if self.kind == "music" and self.item():
            await self.to(self.time + by)

    async def to(self, at: float) -> None:
        if self.kind != "music" or not self.item():
            return
        end = (self.duration or self.item().get("seconds") or 0) - 1
        at = max(0.0, min(at, end)) if end > 0 else max(0.0, at)
        await self._command(["seek", at, "absolute"])
        self.time = at
        await self.say()

    async def next(self) -> None:
        if self.kind == "music" and self.index < len(self.queue) - 1:
            await self._report_stop()
            await self._load(self.index + 1)

    async def prev(self) -> None:
        """Back to the start of the song, or to the one before when near its start."""
        if self.kind != "music":
            return
        if self.time > 3 or self.index == 0:
            await self.to(0)
        else:
            await self._report_stop()
            await self._load(self.index - 1)

    async def stop(self, why: str = "") -> None:
        """Nothing plays any more (asked to, or something else plays now)."""
        if self.state == "idle":
            return
        if why:
            log.info("audio: stopped, %s", why)
        await self._report_stop()
        await self._command(["stop"])
        self.queue, self.index, self.kind, self.state = [], -1, "", "idle"
        self.time, self.duration = 0.0, None
        await self.say()

    # ------------------------------------------------------------ mpv
    def stream_url(self, item: dict) -> str:
        if self.kind == "radio":
            return item["url"]
        base = self.jcfg["url"].rstrip("/")
        return (f"{base}/Audio/{quote(str(item['id']))}/stream?static=true&DeviceId={jellyfin.DEVICE_ID}"
                f"&api_key={quote(self.jcfg['api_key'])}")

    async def _load(self, index: int) -> tuple[bool, str]:
        async with self.lock:
            try:
                await self._ensure()
            except OSError as exc:
                log.warning("audio: mpv: %s", exc)
                self.state = "idle"
                return False, "mpv kunde inte startas"
            self.index, self.time, self.started = index, 0.0, False
            self.duration = None if self.kind == "radio" else (self.item().get("seconds") or None)
            self.state = "loading"
            await self._command(["set_property", "pause", False])
            await self._command(["loadfile", self.stream_url(self.item()), "replace"])
            log.info("audio: %s", self.item().get("name"))
            await self.say()
            return True, ""

    async def _ensure(self) -> None:
        """mpv up and its socket open (started once, then kept, idle between)."""
        if self.proc and self.proc.returncode is None and self.writer:
            return
        self.root.mkdir(parents=True, exist_ok=True)
        self.socket_path.unlink(missing_ok=True)
        user = (self.cfg.get("video") or {}).get("user", "pi")
        try:
            pw = pwd.getpwnam(user)
            uid, home = pw.pw_uid, pw.pw_dir
            if os.geteuid() == 0:
                os.chown(self.root, pw.pw_uid, pw.pw_gid)
        except KeyError:
            uid, home = 1000, "/home/pi"
        env = [f"XDG_RUNTIME_DIR=/run/user/{uid}", f"HOME={home}"]
        cmd = [(self.cfg.get("audio") or {}).get("mpv", "mpv"), "--no-config", "--idle=yes", "--no-video", "--vo=null", "--audio-display=no", "--no-terminal",
               "--ytdl=no", "--cache=yes", "--demuxer-max-bytes=32MiB", "--keep-open=no",
               f"--input-ipc-server={self.socket_path}", "--title=Pioneer TV: ljud"]
        full = (["runuser", "-u", user, "--"] if os.geteuid() == 0 else []) + ["env", *env, *cmd]
        self.proc = await asyncio.create_subprocess_exec(*full, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        for _ in range(100):                          # up to 10 s for mpv to open it
            if self.socket_path.exists():
                break
            await asyncio.sleep(0.1)
        reader, self.writer = await asyncio.open_unix_connection(str(self.socket_path))
        for n, prop in enumerate(("time-pos", "duration", "pause"), 1):
            await self._command(["observe_property", n, prop])
        asyncio.create_task(self._listen(reader, self.proc))

    async def _listen(self, reader: asyncio.StreamReader, proc: asyncio.subprocess.Process) -> None:
        try:
            while line := await reader.readline():
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                await self._on(msg)
        except (OSError, asyncio.IncompleteReadError):
            pass
        if self.proc is proc:
            self.proc, self.writer = None, None
            if self.state != "idle":
                log.warning("audio: mpv went away")
                self.queue, self.index, self.kind, self.state = [], -1, "", "idle"
                await self.say()

    async def _on(self, msg: dict) -> None:
        event = msg.get("event")
        if event == "playback-restart" and self.state == "loading":
            self.state = "playing"
            await self._report("Start")
            await self.say()
        elif event == "property-change" and msg.get("name") == "time-pos" and msg.get("data") is not None:
            self.time = float(msg["data"])
            now = time.monotonic()
            if self.state == "playing" and now - self.reported >= REPORT_EVERY:
                await self._report("Progress")
            if self.state == "playing" and now - self.said >= SAY_EVERY:
                await self.say()
        elif event == "property-change" and msg.get("name") == "duration" and msg.get("data") and self.kind == "music":
            self.duration = float(msg["data"])
        elif event == "end-file" and self.state in ("playing", "loading"):
            reason = msg.get("reason")
            if reason == "eof" and self.kind == "music":
                await self._played()
                if self.index < len(self.queue) - 1:
                    await self._load(self.index + 1)
                else:
                    log.info("audio: the end of the queue")
                    await self.stop()
            elif reason == "error":
                log.warning("audio: %s could not be played", (self.item() or {}).get("name"))
                if self.kind == "music" and self.index < len(self.queue) - 1:
                    await self._load(self.index + 1)
                else:
                    await self.stop()
            elif reason == "eof" and self.kind == "radio":
                await self._load(0)                   # a live stream that ended: on again

    async def _command(self, command: list) -> None:
        if not self.writer:
            return
        try:
            self.writer.write((json.dumps({"command": command}) + "\n").encode())
            await self.writer.drain()
        except OSError as exc:
            log.debug("audio: mpv command %s: %s", command[0], exc)

    async def say(self) -> None:
        self.said = time.monotonic()
        await self.emit({"type": "event", "name": "audio", **self.status()})

    # ------------------------------------------------------------ Jellyfin
    def _headers(self) -> dict:
        return {"Authorization": jellyfin.auth_header(self.jcfg["api_key"]), "Accept-Encoding": "identity"}

    async def _report(self, what: str) -> None:
        """Sessions/Playing (Start), /Progress or /Stopped for a song."""
        item = self.item()
        if self.kind != "music" or not item or not self.jcfg.get("url"):
            return
        if what == "Start":
            self.started = True
        elif not self.started:
            return
        self.reported = time.monotonic()
        path = {"Start": "Sessions/Playing", "Progress": "Sessions/Playing/Progress", "Stopped": "Sessions/Playing/Stopped"}[what]
        body = {"ItemId": item["id"], "PositionTicks": int(self.time * TICKS), "IsPaused": self.state == "paused",
                "PlayMethod": "DirectPlay", "CanSeek": True}
        if what == "Stopped":
            self.started = False
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                async with s.post(self.jcfg["url"].rstrip("/") + "/" + path, json=body, headers=self._headers()) as resp:
                    if resp.status >= 300:
                        log.warning("jellyfin report %s: %s", what, resp.status)
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("jellyfin report %s: %s", what, exc)

    async def _report_stop(self) -> None:
        if self.started:
            await self._report("Stopped")

    async def _played(self) -> None:
        """A song played to its end: played, for the user the pages browse as."""
        item = self.item()
        if not item:
            return
        await self._report("Stopped")
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
                base = self.jcfg["url"].rstrip("/")
                async with s.get(f"{base}/Users", headers=self._headers()) as resp:
                    users = await resp.json(content_type=None) if resp.status == 200 else []
                user = jellyfin.pick_user(users if isinstance(users, list) else [], self.jcfg.get("user", ""))
                if user:
                    async with s.post(f"{base}/UserPlayedItems/{quote(str(item['id']))}", params={"userId": user["Id"]},
                                      headers=self._headers()) as resp:
                        if resp.status >= 300:
                            log.warning("jellyfin played: %s", resp.status)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            log.warning("jellyfin played: %s", exc)

    # ------------------------------------------------------------ the rest
    async def reap_strays(self) -> None:
        """An mpv left from before a daemon restart: nothing would follow it, so it goes."""
        try:
            proc = await asyncio.create_subprocess_exec("pkill", "-f", "--", f"mpv --no-config --idle=yes --no-video",
                                                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await proc.wait()
        except OSError:
            pass

    async def close(self) -> None:
        await self._report_stop()
        if self.proc and self.proc.returncode is None:
            await self._command(["quit"])
            try:
                await asyncio.wait_for(self.proc.wait(), 3)
            except asyncio.TimeoutError:
                self.proc.kill()
