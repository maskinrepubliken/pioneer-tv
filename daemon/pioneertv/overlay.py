"""Who gets which events: the overlay or the page.

The overlay (system/overlay.py, a WebKit page on labwc's top layer) draws
every menu (the quick menu, the pause panels), every toast and the
screensaver, over any window: Chromium, RetroArch or mpv. The pages draw
none of them; a page's toast is sent here and goes on to the overlay.

Events the daemon broadcasts get a "target" ("overlay" or "page") here;
the bridge in each client drops what is not for it. While the overlay's
menu is open it has Y and B too; the rest of the time Y types into the
page. Opening the menu pauses what plays (video and audio in the page);
closing it carries on.
"""
from __future__ import annotations

import logging

log = logging.getLogger("pioneertv.overlay")

# Pad buttons whose meaning depends on whether the overlay's menu is open.
ROUTED = ("keyboard", "escape")
# Always the overlay's.
OVERLAY = ("menu", "toast", "saver", "rest")
# What the overlay may ask the page (through the extension) to do, and what
# a page may ask of the overlay (the home page: a panel, Live or Sök).
RELAYS = ("home", "back", "reload", "settings", "keyboard", "navigate", "webvideo")
TO_OVERLAY = ("menu",)
# The panels the home page may open alone in the overlay.
PANELS = ("live", "search")
# What the overlay's panel for a site's video may ask of it (content/webvideo.js).
WEBVIDEO_ACTIONS = ("toggle", "seek", "to", "subs")


def webvideo_state(data: dict) -> dict:
    """A page's video, as content/webvideo.js says it is, for the overlay:
    only the fields it draws, of the types it expects."""
    num = lambda v: float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None   # noqa: E731
    subs = []
    for t in (data.get("subs") or [])[:12] if isinstance(data.get("subs"), list) else []:
        if isinstance(t, dict) and isinstance(t.get("id"), int):
            subs.append({"id": t["id"], "label": str(t.get("label") or "")[:40], "selected": bool(t.get("selected"))})
    return {
        "type": "event", "name": "webvideo", "target": "overlay",
        "frame": str(data.get("frame") or "")[:16], "top": bool(data.get("top")), "present": bool(data.get("present")),
        "title": str(data.get("title") or "")[:120], "area": num(data.get("area")) or 0.0,
        "time": num(data.get("time")), "duration": num(data.get("duration")), "end": num(data.get("end")),
        "live": bool(data.get("live")), "paused": bool(data.get("paused")), "subs": subs,
    }


class Router:
    def __init__(self) -> None:
        self.overlay = None          # the overlay's WebSocket, when connected
        self.overlay_open = False    # its menu is showing

    @property
    def present(self) -> bool:
        return self.overlay is not None

    def connected(self, ws) -> None:
        self.overlay = ws
        self.overlay_open = False
        log.info("overlay connected")

    def disconnected(self, ws) -> bool:
        """True when it was the overlay that went."""
        if ws is not self.overlay:
            return False
        self.overlay = None
        self.overlay_open = False
        log.info("overlay disconnected")
        return True

    def target(self, name: str) -> str:
        if name in OVERLAY or self.overlay_open:
            return "overlay"
        return "page"

    def tag(self, msg: dict) -> dict:
        if msg.get("type") == "event" and msg.get("name") in ROUTED + OVERLAY and "target" not in msg:
            return {**msg, "target": self.target(msg["name"])}
        return msg

    def handle(self, data: dict) -> list[dict]:
        """A message from a client about menus; returns the events to broadcast."""
        t = data.get("type")
        if t == "overlay_menu":
            was, self.overlay_open = self.overlay_open, bool(data.get("open"))
            if was != self.overlay_open:
                return [{"type": "event", "name": "media", "action": "pause" if self.overlay_open else "resume"}]
        elif t == "toast" and data.get("text"):
            event = {"type": "event", "name": "toast", "text": str(data["text"])[:200], "icon": str(data.get("icon") or "")}
            if isinstance(data.get("ms"), (int, float)):
                event["ms"] = max(500, min(int(data["ms"]), 15000))
            return [event]
        elif t == "webvideo":
            return [webvideo_state(data)]
        elif t == "relay" and data.get("name") in TO_OVERLAY:
            event = {"type": "event", "name": data["name"], "open": True, "target": "overlay"}
            if data.get("panel") in PANELS:
                event["panel"] = data["panel"]
            return [event]
        elif t == "relay" and data.get("name") in RELAYS:
            event = {"type": "event", "name": data["name"], "target": "page"}
            if data["name"] == "navigate":
                url = str(data.get("url") or "")
                if not url.startswith(("http://", "https://", "chrome-extension://")):
                    return []
                event["url"] = url
            if data["name"] == "settings" and isinstance(data.get("section"), str):
                event["section"] = data["section"][:40]
            if data["name"] == "webvideo":
                if data.get("action") not in WEBVIDEO_ACTIONS:
                    return []
                event.update(frame=str(data.get("frame") or "")[:16], action=data["action"])
                value = data.get("value")
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    event["value"] = value
            return [event]
        return []
