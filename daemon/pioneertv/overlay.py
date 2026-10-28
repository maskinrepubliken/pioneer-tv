"""Who gets which events: the overlay or the page.

The overlay (system/overlay.py, a WebKit page on labwc's top layer) draws
every menu (the main menu, the pause panels), every toast and the
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
RELAYS = ("home", "back", "reload", "settings", "keyboard", "navigate")
TO_OVERLAY = ("menu",)
# The panels the home page may open alone in the overlay.
PANELS = ("live", "search", "settings")


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
            return [event]
        return []
