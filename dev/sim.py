"""A stand-in for the daemon, for the simulator (dev/sim.html, /sim on dev/preview.py).

The pages and the overlay connect to it over /ws as they do to the daemon on
the box, and the overlay's routing is the daemon's own (pioneertv/overlay.py,
Router): what goes to the overlay, what to the page, the menu pausing what
plays. Around it, stand-ins for what the box does with the pad's system
buttons (Home, holding Home, Y, holding B, L2/R2) and for its players: the
music and radio (audio.py), a film in mpv (video.py), a game in RetroArch
(games.py), the screensaver (idle.py). Their state moves with the clock as
the real ones do, and they say so with the same events. Stdlib only.

The keys the pad sends as keys (the d-pad, A, B, X, L1/R1) are the Mac's own
keys in the simulator's window: only those reach a page as real key presses.
"""
from __future__ import annotations

import base64
import hashlib
import json
import socket
import struct
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "daemon"))
from pioneertv.overlay import Router  # noqa: E402  (stdlib only)
import mock  # noqa: E402

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
BOX = "http://127.0.0.1:8765/"

# The box's tiles (its settings.json, October), the daemon's address as {origin}.
SERVICES = [
    {"id": "cineasterna", "name": "Cineasterna", "tagline": "Film från biblioteket", "url": "https://www.cineasterna.com/sv/library/5/discover",
     "search_url": "https://www.cineasterna.com/sv/library/5/search?q={query}&page=1", "color": "#b8940c", "glyph": "C"},
    {"id": "svtplay", "name": "SVT Play", "tagline": "Public service", "url": "https://www.svtplay.se/",
     "search_url": "https://www.svtplay.se/sok?q={query}", "color": "#1f7a4d", "glyph": "S"},
    {"id": "jellyfin", "name": "Film & serier", "tagline": "Jellyfin", "url": "{origin}ext/launcher/browse.html?library=film&tv=1",
     "search_url": "{origin}ext/launcher/browse.html?library=film&tv=1#/search/{query}", "color": "#7b5ea7", "glyph": "J"},
    {"id": "musik", "name": "Musik", "tagline": "Jellyfin", "url": "{origin}ext/launcher/browse.html?library=musik&tv=1",
     "search_url": "{origin}ext/launcher/browse.html?library=musik&tv=1#/search/{query}", "color": "#a8533a", "glyph": "M"},
    {"id": "romm", "name": "Spel", "tagline": "RomM", "url": "{origin}ext/launcher/browse.html?library=spel&tv=1",
     "search_url": "{origin}ext/launcher/browse.html?library=spel&tv=1#/search/{query}", "color": "#3b6ea5", "glyph": "R"},
    {"id": "immich", "name": "Bilder", "tagline": "Immich", "url": "https://bilder.example.se/", "color": "#3f7fa6", "row": "second"},
    {"id": "svt1", "name": "SVT1", "url": "https://www.svtplay.se/kanaler/svt1?start=auto", "fullscreen": "1", "row": "live", "kind": "tv"},
    {"id": "svt2", "name": "SVT2", "url": "https://www.svtplay.se/kanaler/svt2?start=auto", "fullscreen": "1", "row": "live", "kind": "tv"},
    {"id": "svtbarn", "name": "SVT Barn", "url": "https://www.svtplay.se/kanaler/svtbarn?start=auto", "fullscreen": "1", "row": "live", "kind": "tv"},
    {"id": "p1", "name": "P1", "url": "radio.html?channel=132&name=P1", "row": "live", "kind": "radio"},
    {"id": "p2", "name": "P2", "url": "radio.html?channel=163&name=P2", "row": "live", "kind": "radio"},
    {"id": "p3", "name": "P3", "url": "radio.html?channel=164&name=P3", "row": "live", "kind": "radio"},
    {"id": "p4", "name": "P4", "url": "radio.html?channel=206&name=P4", "row": "live", "kind": "radio"},
]
# The box's two pads (its settings.json).
PADS = {
    "rosa": {"key": "rosa", "name": "Rosa handkontroll", "named": True, "pointer": "#EFDFD4", "accent": "#E09F96", "highlight": "#E09F96"},
    "gron": {"key": "gron", "name": "Grön handkontroll", "named": True, "pointer": "#D5E2D6", "accent": "#93AE99", "highlight": "#93AE99"},
}


# ------------------------------------------------------------ the WebSocket
class Socket:
    """One client's WebSocket, on the request's own connection (RFC 6455, text only)."""

    def __init__(self, conn: socket.socket) -> None:
        self.conn = conn
        self.lock = threading.Lock()
        self.open = True

    @staticmethod
    def accept_key(key: str) -> str:
        return base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()

    def _read(self, n: int) -> bytes:
        out = b""
        while len(out) < n:
            chunk = self.conn.recv(n - len(out))
            if not chunk:
                raise ConnectionError("closed")
            out += chunk
        return out

    def recv(self) -> str | None:
        """The next text message; None when the client has gone."""
        try:
            while True:
                b1, b2 = self._read(2)
                op, n = b1 & 0x0F, b2 & 0x7F
                if n == 126:
                    n = struct.unpack(">H", self._read(2))[0]
                elif n == 127:
                    n = struct.unpack(">Q", self._read(8))[0]
                mask = self._read(4) if b2 & 0x80 else b"\0\0\0\0"
                data = bytes(c ^ mask[i % 4] for i, c in enumerate(self._read(n)))
                if op == 8:
                    return None
                if op == 9:
                    self._frame(10, data)
                elif op == 1:
                    return data.decode("utf-8", "replace")
        except (OSError, ConnectionError):
            return None

    def _frame(self, op: int, data: bytes) -> None:
        head = bytes([0x80 | op])
        n = len(data)
        head += bytes([n]) if n < 126 else bytes([126]) + struct.pack(">H", n) if n < 65536 else bytes([127]) + struct.pack(">Q", n)
        with self.lock:
            self.conn.sendall(head + data)

    def send(self, text: str) -> None:
        if not self.open:
            return
        try:
            self._frame(1, text.encode())
        except OSError:
            self.open = False


# ------------------------------------------------------------ the players
class Player:
    """A clock that runs while it plays: where it is now, from where it was and since when."""

    def __init__(self) -> None:
        self.state, self.base, self.since, self.duration = "idle", 0.0, time.monotonic(), None

    @property
    def time(self) -> float:
        t = self.base + (time.monotonic() - self.since if self.state in ("playing", "running") else 0.0)
        return min(t, self.duration) if self.duration else t

    def set(self, state: str | None = None, at: float | None = None) -> None:
        self.base, self.since = (self.time if at is None else max(0.0, at)), time.monotonic()
        if state:
            self.state = state


class Daemon:
    def __init__(self) -> None:
        self.clients: set[Socket] = set()
        self.router = Router()
        self.lock = threading.RLock()
        self.origin = "http://localhost:5178/"
        self.ui = {"auto_keyboard": True, "volume_toast": True, "screensaver": "labyrint"}
        self.pad = "gron"
        self.tv = "on"
        self.saver = False
        self.page = ""
        # music and radio (audio.py)
        self.audio = Player()
        self.queue: list[dict] = []
        self.index = -1
        self.kind = ""
        # a film (video.py) and a game (games.py)
        self.video = Player()
        self.film: dict | None = None
        self.held_film = False
        self.game: dict | None = None
        self.game_state = "idle"
        threading.Thread(target=self._tick, daemon=True).start()

    # ------------------------------------------------------------ talking
    def config(self) -> dict:
        services = [{k: (v.replace("{origin}", self.origin) if isinstance(v, str) else v) for k, v in s.items()} for s in SERVICES]
        return {"type": "config", "services": services, "ui": self.ui, "settings_url": self.origin + "static/settings.html?mock=1",
                "overlay": self.router.present}

    def status(self) -> dict:
        pads = [{"name": p["name"], "path": k, "battery": 80 if k == "gron" else 45, **{c: p[c] for c in ("pointer", "accent", "highlight")}}
                for k, p in PADS.items()]
        return {"type": "status", "wifi": {"available": True, "state": "connected", "ssid": "Simulatorn", "signal": 78},
                "tailscale": {"installed": True, "state": "running", "ips": ["100.64.0.1"], "dns_name": "pioneer-tv.sim", "peers": []},
                "interfaces": [{"name": "eth0", "up": True, "addresses": ["192.168.1.40"]}],
                "system": {"hostname": "pioneer-tv (simulator)", "temp_c": 51.2, "throttled": 0, "throttled_now": False, "throttled_ever": False,
                           "mem_total_mb": 921, "mem_available_mb": 400, "uptime_s": 3600, "load1": 0.4, "disk": {"total_mb": 29000, "free_mb": 20000}},
                "gamepads": pads, "active_pad": PADS[self.pad], "keyboard_present": False,
                "cec": {"enabled": True, "phys_addr": "1.0.0.0", "tv_power": self.tv}, "audio": {"available": True, "sink": {"name": "TV (HDMI)", "volume": 1}},
                "version": "sim", "git": {"available": True, "commit": "simulator", "branch": "main", "date": time.strftime("%Y-%m-%d")}, "page": self.page}

    def broadcast(self, msg: dict) -> None:
        data = json.dumps(self.router.tag(msg))
        for c in list(self.clients):
            c.send(data)

    def event(self, name: str, **extra) -> None:
        self.broadcast({"type": "event", "name": name, **extra})

    def toast(self, text: str, icon: str = "info") -> None:
        for e in self.router.handle({"type": "toast", "text": text, "icon": icon}):
            self.broadcast(e)

    def serve(self, ws: Socket, origin: str) -> None:
        """One client, until it goes: what it says, as the daemon's server.py hears it."""
        self.origin = origin
        with self.lock:
            self.clients.add(ws)
        ws.send(json.dumps(self.config()))
        ws.send(json.dumps(self.status()))
        try:
            while (text := ws.recv()) is not None:
                try:
                    data = json.loads(text)
                except ValueError:
                    continue
                with self.lock:
                    self.hear(ws, data)
        finally:
            with self.lock:
                self.clients.discard(ws)
                if self.router.disconnected(ws):
                    self.broadcast(self.config())

    def hear(self, ws: Socket, data: dict) -> None:
        t = data.get("type")
        if t == "hello":
            if data.get("client") == "overlay":
                self.router.connected(ws)
                self.broadcast(self.config())
                if self.saver:
                    self.event("saver", show=True)
        elif t in ("overlay_menu", "relay", "toast", "webvideo"):
            if t == "webvideo" and data.get("present") and data.get("paused") is False:
                self.audio_stop()
            for e in self.router.handle(data):
                self.broadcast(e)
                if e.get("name") == "media":
                    self.film_media(e["action"])
        elif t == "loaded":
            self.page = data.get("url") or ""
            self.event("loaded", url=self.page, target="overlay")
        elif t == "activity" and data.get("playing"):
            self.audio_stop()
        elif t == "cec":
            self.cec(str(data.get("command") or ""))

    def cec(self, command: str) -> None:
        if command in ("volume_up", "volume_down", "mute"):
            self.event("volume", direction={"volume_up": "up", "volume_down": "down"}.get(command, "mute"))
        elif command in ("tv_off", "standby"):
            self.set_tv("standby")
        elif command == "tv_on":
            self.set_tv("on")
        else:
            self.toast(f"CEC: {command}")

    def set_tv(self, power: str) -> None:
        self.tv = power
        self.event("tv", power=power)
        self.broadcast(self.status())
        if power == "standby":
            self.event("home", quiet=True)
            if not self.saver:
                self.saver_show(True)
            self.event("rest", on=True)
        elif self.saver:
            self.event("rest", on=False)

    # ------------------------------------------------------------ the pad's system buttons
    def button(self, name: str) -> None:
        """A press on the pad that the daemon itself handles (actions.py): Home
        (menu), holding Home (home), Y (keyboard), holding B (back), L2/R2."""
        with self.lock:
            if self.saver and name not in ("vol_up", "vol_down"):
                self.saver_show(False)                # a press takes the screensaver away, and does nothing else
                return
            if self.tv == "standby":
                self.set_tv("on")
                return
            if name == "menu":
                if self.game_state == "running":
                    return self.game_hold()
                if self.game_state == "held":
                    return self.game_resume()
                if self.film and not self.held_film:
                    return self.film_hold()
                if self.film and self.held_film:
                    return self.film_resume()
                self.event("menu")
            elif name == "home":
                self.game_quit()
                self.film_stop()
                self.event("home")
            elif name == "keyboard":
                self.event("keyboard")
            elif name == "back":
                if self.film:
                    return self.film_stop()
                if self.game_state == "held":
                    return self.game_quit()
                self.event("back")
            elif name in ("vol_up", "vol_down"):
                self.cec("volume_up" if name == "vol_up" else "volume_down")

    def use_pad(self, key: str) -> None:
        with self.lock:
            if key in PADS:
                self.pad = key
                self.event("active_pad", pad=PADS[key])
                self.broadcast(self.status())

    def saver_show(self, on: bool, kind: str = "") -> None:
        self.saver = on
        if on:
            self.event("saver", show=True, **({"kind": kind} if kind else {}))
        else:
            self.event("rest", on=False)
            self.event("saver", show=False)

    # ------------------------------------------------------------ music and radio (audio.py)
    def audio_status(self) -> dict:
        item = self.queue[self.index] if 0 <= self.index < len(self.queue) else None
        return {"state": self.audio.state, "kind": self.kind, "item": item, "index": self.index, "count": len(self.queue),
                "time": round(self.audio.time, 1), "duration": self.audio.duration, "live": self.kind == "radio",
                "next": [{"name": s.get("name"), "artist": s.get("artist")} for s in self.queue[self.index + 1:self.index + 7]]}

    def audio_say(self) -> None:
        self.event("audio", **self.audio_status())

    def audio_load(self, index: int) -> None:
        self.index = index
        item = self.queue[index]
        self.audio.duration = None if self.kind == "radio" else (item.get("seconds") or 180)
        self.audio.set("loading", 0)
        self.audio_say()

        def started():
            time.sleep(0.6)
            with self.lock:
                if self.audio.state == "loading" and self.index == index:
                    self.audio.set("playing", 0)
                    self.audio_say()
        threading.Thread(target=started, daemon=True).start()

    def audio_stop(self) -> None:
        if self.audio.state != "idle":
            self.queue, self.index, self.kind = [], -1, ""
            self.audio.state, self.audio.duration = "idle", None
            self.audio_say()

    def audio_api(self, action: str, body: dict) -> dict:
        if action == "play":
            if self.film or self.game_state not in ("idle", "exited"):
                return {"ok": False, "message": "något annat spelas"}
            self.queue = [{k: s.get(k) for k in ("id", "name", "artist", "album", "seconds", "cover", "thumb")} for s in body.get("queue") or []]
            if not self.queue:
                return {"ok": False, "message": "inget att spela"}
            self.kind = "music"
            self.audio_load(max(0, min(len(self.queue) - 1, int(body.get("index") or 0))))
        elif action == "radio":
            self.queue, self.kind = [{k: body.get(k) for k in ("channel", "name", "url", "cover")}], "radio"
            self.audio_load(0)
        elif action == "toggle":
            if self.audio.state == "playing":
                self.audio.set("paused")
            elif self.audio.state == "paused":
                self.audio.set("playing", 0 if self.kind == "radio" else None)
            self.audio_say()
        elif action in ("seek", "to") and self.kind == "music":
            at = (self.audio.time + float(body.get("by") or 0)) if action == "seek" else float(body.get("at") or 0)
            self.audio.set(None, min(at, (self.audio.duration or 1) - 1))
            self.audio_say()
        elif action == "next" and self.kind == "music" and self.index < len(self.queue) - 1:
            self.audio_load(self.index + 1)
        elif action == "prev" and self.kind == "music":
            if self.audio.time > 3 or self.index == 0:
                self.audio.set(None, 0)
                self.audio_say()
            else:
                self.audio_load(self.index - 1)
        elif action == "stop":
            self.audio_stop()
        return {"ok": True, "message": "", **self.audio_status()}

    # ------------------------------------------------------------ a film (video.py)
    def film_play(self, body: dict) -> dict:
        item_id = str(body.get("id") or "")
        found = mock.ALL.get(item_id)
        name = (found or {}).get("Name") or "Filmen"
        runtime = ((found or {}).get("RunTimeTicks") or 90 * 60 * mock.T) / mock.T
        self.audio_stop()
        self.film = {"id": item_id, "name": name}
        self.held_film = False
        self.video.duration = runtime
        self.video.set("starting", float(body.get("start") or 0))

        def started():
            time.sleep(1.0)
            with self.lock:
                if self.film and self.film["id"] == item_id:
                    self.video.set("running")
                    self.event("video", state="running")
        threading.Thread(target=started, daemon=True).start()
        return {"ok": True, "message": ""}

    def film_hold(self) -> None:
        self.held_film = True
        self.video.set("paused")
        self.event("video", state="held", title=self.film["name"], time=self.video.time, duration=self.video.duration,
                   audio=[{"id": 1, "label": "Svenska", "selected": True}, {"id": 2, "label": "Engelska", "selected": False}],
                   subtitles=[{"id": 1, "label": "Svenska", "selected": False}, {"id": 2, "label": "Engelska", "selected": False}])

    def film_resume(self) -> None:
        if self.film and self.held_film:
            self.held_film = False
            self.video.set("running")
            self.event("video", state="running")

    def film_stop(self, ended: bool = False) -> None:
        if self.film:
            self.film, self.held_film = None, False
            self.video.state = "idle"
            self.event("video", state="ended" if ended else "stopped")

    def film_media(self, action: str) -> None:
        if self.film and not self.held_film:
            self.video.set("paused" if action == "pause" else "running")

    def video_api(self, action: str, body: dict) -> dict:
        if action == "play":
            return self.film_play(body)
        if action == "resume":
            self.film_resume()
        elif action == "stop":
            self.film_stop()
        elif action == "seek":
            self.video.set(None, self.video.time + float(body.get("by") or 0))
        elif action == "to":
            self.video.set(None, float(body.get("at") or 0))
        elif action == "track":
            self.toast(f"Spår: {body.get('kind')} {body.get('id')}")
        return {"ok": True, "message": ""}

    # ------------------------------------------------------------ a game (games.py)
    def game_play(self, body: dict) -> dict:
        rom = next((r for r in mock.ROMS if r["id"] == body.get("rom")), {"name": "Spelet"})
        self.audio_stop()
        self.game = {"rom": body.get("rom"), "name": rom.get("name")}
        self.game_state = "loading"
        self.event("games", state="loading", got=0, total=4 * 1048576)

        def started():
            for got in (1, 2, 3, 4):
                time.sleep(0.3)
                with self.lock:
                    if self.game_state == "loading":
                        self.event("games", state="loading", got=got * 1048576, total=4 * 1048576)
            with self.lock:
                if self.game_state == "loading":
                    self.game_state = "running"
                    self.event("games", state="running")
                    self.toast(f"{self.game['name']} körs (simulerat; Hem pausar)", "gamepad")
        threading.Thread(target=started, daemon=True).start()
        return {"ok": True, "message": ""}

    def game_hold(self) -> None:
        self.game_state = "held"
        self.event("games", state="held", title=self.game["name"], players=[PADS[self.pad]["name"]], point=None)

    def game_resume(self) -> None:
        if self.game_state == "held":
            self.game_state = "running"
            self.event("games", state="running")

    def game_quit(self) -> None:
        if self.game_state in ("loading", "running", "held"):
            self.game_state, self.game = "idle", None
            self.event("games", state="exited")

    def games_api(self, action: str, body: dict) -> dict:
        if action == "play":
            return self.game_play(body)
        if action == "resume":
            self.game_resume()
        elif action == "quit":
            self.game_quit()
        elif action == "save_point":
            return {"ok": True, "message": ""}
        return {"ok": True, "message": ""}

    # ------------------------------------------------------------ the API
    def api(self, method: str, path: str, body: dict) -> dict | None:
        """The daemon's API where the simulator plays its part; None leaves it to mock.py."""
        with self.lock:
            if path == "/api/status":
                return self.status()
            if path == "/api/audio" and method == "GET":
                return self.audio_status()
            if path.startswith("/api/audio/"):
                return self.audio_api(path.rsplit("/", 1)[1], body)
            if path.startswith("/api/video/") and method == "POST":
                return self.video_api(path.rsplit("/", 1)[1], body)
            if path.startswith("/api/games/") and method == "POST":
                return self.games_api(path.rsplit("/", 1)[1], body)
            if path == "/api/toast":
                self.toast(str(body.get("text") or ""), str(body.get("icon") or "info"))
                return {"ok": True}
            if path == "/api/home":
                self.event("home")
                return {"ok": True}
            if path == "/api/cec":
                self.cec(str(body.get("command") or ""))
                return {"ok": True}
            if path == "/api/saver/preview":
                self.saver_show(True, str(body.get("kind") or ""))
                return {"ok": True}
            # The simulator's own controls.
            if path == "/api/sim/button":
                self.button(str(body.get("name") or ""))
                return {"ok": True}
            if path == "/api/sim/pad":
                self.use_pad(str(body.get("pad") or ""))
                return {"ok": True}
            if path == "/api/sim/tv":
                self.set_tv("standby" if self.tv == "on" else "on")
                return {"ok": True, "tv": self.tv}
            if path == "/api/sim/saver":
                self.saver_show(not self.saver)
                return {"ok": True}
            if path == "/api/sim/toast":
                self.toast(str(body.get("text") or "En notis"), "info")
                return {"ok": True}
        return None

    # ------------------------------------------------------------ the clock
    def _tick(self) -> None:
        """Every second: a song or a film at its end goes on; every few, the music says where it is."""
        n = 0
        while True:
            time.sleep(1)
            n += 1
            with self.lock:
                a = self.audio
                if a.state == "playing" and a.duration and a.time >= a.duration - 0.2:
                    if self.kind == "music" and self.index < len(self.queue) - 1:
                        self.audio_load(self.index + 1)
                    else:
                        self.audio_stop()
                elif a.state == "playing" and n % 5 == 0:
                    self.audio_say()
                v = self.video
                if self.film and v.state == "running" and v.duration and v.time >= v.duration - 0.2:
                    self.film_stop(ended=True)


DAEMON = Daemon()
