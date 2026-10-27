"""Who gets the box's own panels: the overlay or the page.

The overlay (system/overlay.py, a WebKit page on labwc's top layer) draws
the quick menu and the toasts over any window, Chromium, RetroArch or mpv.
While it is connected the daemon sends those to it; without it (Weston, or
the overlay down) they go to the page, as before. A page's own menu (the
game player's pause panel, the start page's Live list) keeps its buttons:
Home, Y and B go to whichever menu is open.

Events the daemon broadcasts get a "target" ("overlay" or "page") here;
the bridge in each client drops what is not for it. Opening the overlay's
menu pauses what plays (video and audio in the page); closing it carries on.
"""
from __future__ import annotations

import logging

log = logging.getLogger("pioneertv.overlay")

# Pad buttons whose meaning depends on which menu is open.
ROUTED = ("menu", "keyboard", "escape")
# What the overlay may ask the page (through the extension) to do.
RELAYS = ("home", "back", "reload", "settings", "keyboard")


class Router:
    def __init__(self) -> None:
        self.overlay = None          # the overlay's WebSocket, when connected
        self.overlay_open = False    # its menu is showing
        self.page_open = False       # a page's own menu is showing

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
        if name in ("toast", "saver"):
            return "overlay" if self.present else "page"
        if self.overlay_open:
            return "overlay"
        if name == "menu" and self.present and not self.page_open:
            return "overlay"
        return "page"

    def tag(self, msg: dict) -> dict:
        if msg.get("type") == "event" and msg.get("name") in ROUTED + ("toast", "saver") and "target" not in msg:
            return {**msg, "target": self.target(msg["name"])}
        return msg

    def handle(self, data: dict) -> list[dict]:
        """A message from a client about menus; returns the events to broadcast."""
        t = data.get("type")
        if t == "overlay_menu":
            was, self.overlay_open = self.overlay_open, bool(data.get("open"))
            if was != self.overlay_open:
                return [{"type": "event", "name": "media", "action": "pause" if self.overlay_open else "resume"}]
        elif t == "page_menu":
            self.page_open = bool(data.get("open"))
        elif t == "relay" and data.get("name") in RELAYS:
            if data["name"] == "home":
                self.page_open = False
            return [{"type": "event", "name": data["name"], "target": "page"}]
        return []
