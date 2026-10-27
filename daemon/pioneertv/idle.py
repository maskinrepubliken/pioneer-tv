"""The screensaver and the TV going off by itself, decided here.

Left alone, the box shows a screensaver after ui.screensaver_minutes and
turns the TV off after ui.tv_off_minutes (0: never). Alone means: no
button on a pad or on the TV's remote, no pointer, no key on a real
keyboard (the pages report those), and nothing playing. Playing is a game
in RetroArch or a film in mpv (their own state, held or paused included),
or a page that says its video or audio plays (main.js, every page, every
frame) or that is in game mode. So browsing anywhere counts down, and a
film, a song or a game never does; the count starts again when it ends.

The screensaver is drawn by the overlay over every window, or by the page
when there is no overlay (the router's target, like a toast). Any button
takes it away and does nothing else (the dispatcher asks here first).
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Coroutine

log = logging.getLogger("pioneertv.idle")

CHECK_SECONDS = 5
PLAYING_FOR = 75        # a page's "playing" holds this long; pages repeat it every 30 s


class Idle:
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine], tv_off: Callable[[], Coroutine],
                 busy: Callable[[], bool] = lambda: False) -> None:
        self.cfg = cfg
        self.emit = emit
        self.tv_off = tv_off
        self.busy = busy                    # a game or a film has the screen
        self.last_input = time.monotonic()
        self.playing_until = 0.0
        self.showing = False
        self.tv_off_sent = False

    def minutes(self, key: str, fallback: float) -> float:
        try:
            return max(0.0, float((self.cfg.get("ui") or {}).get(key, fallback)))
        except (TypeError, ValueError):
            return fallback

    # ------------------------------------------------------------ input
    def input(self) -> bool:
        """Someone is here. True when the screensaver was up: the press only
        takes it away (the dispatcher swallows it)."""
        self.last_input = time.monotonic()
        self.tv_off_sent = False
        if self.showing:
            asyncio.get_running_loop().create_task(self.hide())
            return True
        return False

    def page(self, data: dict) -> None:
        """A page's report: {"input": true} for a key or the mouse of a real
        keyboard, {"playing": true} while its video or audio plays."""
        if data.get("playing"):
            self.playing_until = time.monotonic() + PLAYING_FOR
        elif data.get("playing") is False:
            self.playing_until = 0.0
        if data.get("input"):
            self.input()

    def tv_on(self) -> None:
        """The TV came on (its remote, or a button that woke it): start afresh."""
        self.input()

    def playing(self) -> bool:
        return self.busy() or time.monotonic() < self.playing_until

    # ------------------------------------------------------------ the loop
    async def show(self) -> None:
        self.showing = True
        log.info("screensaver on")
        await self.emit({"type": "event", "name": "saver", "show": True})

    async def hide(self) -> None:
        if not self.showing:
            return
        self.showing = False
        log.info("screensaver off")
        await self.emit({"type": "event", "name": "saver", "show": False})

    async def check(self) -> None:
        now = time.monotonic()
        if self.playing():
            # Playing is not being alone: the count starts when it ends.
            self.last_input = now
            if self.showing:
                await self.hide()
            return
        alone = now - self.last_input
        saver = self.minutes("screensaver_minutes", 3) * 60
        off = self.minutes("tv_off_minutes", 10) * 60
        if saver and alone >= saver and not self.showing:
            await self.show()
        if off and alone >= off and not self.tv_off_sent:
            self.tv_off_sent = True
            log.info("alone for %.0f min: the TV goes off", alone / 60)
            try:
                await self.tv_off()
            except Exception as exc:
                log.warning("tv off: %s", exc)

    async def run(self) -> None:
        while True:
            try:
                await self.check()
            except Exception as exc:
                log.warning("idle: %s", exc)
            await asyncio.sleep(CHECK_SECONDS)
