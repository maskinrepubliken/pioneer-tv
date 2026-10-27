"""Left alone: home, then the TV off, decided here.

There is no screensaver of its own: the home page is it (the Mandelbrot
set, launcher/index.html). Left alone anywhere else for ui.home_minutes,
the box goes home; a game held on its pause panel is quit (its state is
saved, games.py) and a film held on its panel is stopped (its position
is saved, video.py) on the way. Left alone at home for ui.tv_off_minutes,
the TV is turned off over CEC, and the home page rests (black, nothing
drawn) until the TV is on again. 0 is never, for either.

Alone means: no button on a pad or on the TV's remote, no pointer, no key
on a real keyboard (the pages report those), and nothing playing. Playing
is a game running in RetroArch or a film running in mpv (a game or a film
held on its pause panel is not), or a page that says its video or audio
plays (main.js, every page, every frame) or that is in game mode. So
browsing anywhere counts down, and a film, a song or a game never does;
the count starts again when it ends.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Coroutine

log = logging.getLogger("pioneertv.idle")

CHECK_SECONDS = 5
PLAYING_FOR = 75        # a page's "playing" holds this long; pages repeat it every 30 s
HOME_SETTLE = 2.0       # a quit game's page goes back first; home comes after it


class Idle:
    def __init__(self, cfg: dict, emit: Callable[[dict], Coroutine], tv_off: Callable[[], Coroutine],
                 busy: Callable[[], bool] = lambda: False,
                 at_home: Callable[[], bool] = lambda: False,
                 put_away: Callable[[], Coroutine] | None = None) -> None:
        self.cfg = cfg
        self.emit = emit
        self.tv_off = tv_off
        self.busy = busy                    # a game or a film is playing
        self.at_home = at_home              # the page on screen is the home page
        self.put_away = put_away            # quits a held game, stops a held film
        self.last_input = time.monotonic()
        self.home_since: float | None = None
        self.playing_until = 0.0
        self.tv_off_sent = False
        self.sent_home = False
        self.resting = False                # the home page draws nothing

    def minutes(self, key: str, fallback: float) -> float:
        try:
            return max(0.0, float((self.cfg.get("ui") or {}).get(key, fallback)))
        except (TypeError, ValueError):
            return fallback

    # ------------------------------------------------------------ input
    def input(self) -> bool:
        """Someone is here. Never swallows the press (the dispatcher's own
        rule does that while the TV is off)."""
        self.last_input = time.monotonic()
        self.tv_off_sent = False
        self.sent_home = False
        if self.resting:
            self.resting = False
            asyncio.get_running_loop().create_task(self.emit({"type": "event", "name": "rest", "on": False}))
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
    async def go_home(self) -> None:
        log.info("alone for %.0f min: home", (time.monotonic() - self.last_input) / 60)
        self.sent_home = True
        if self.put_away:
            try:
                if await self.put_away():
                    await asyncio.sleep(HOME_SETTLE)
            except Exception as exc:
                log.warning("putting away: %s", exc)
        # quiet: the overlay closes its menus instead of opening the main menu.
        await self.emit({"type": "event", "name": "home", "quiet": True})

    async def check(self) -> None:
        now = time.monotonic()
        home = self.at_home()
        if home and self.home_since is None:
            self.home_since = now
        elif not home:
            self.home_since = None
        if self.playing():
            # Playing is not being alone: the count starts when it ends.
            self.last_input = now
            return
        alone = now - self.last_input
        if not home:
            away = self.minutes("home_minutes", 10) * 60
            if away and alone >= away and not self.sent_home:
                await self.go_home()
            return
        # At home: counted from the last press or the arrival, whichever is later.
        here = now - max(self.last_input, self.home_since)
        off = self.minutes("tv_off_minutes", 5) * 60
        if off and here >= off and not self.tv_off_sent:
            self.tv_off_sent = True
            log.info("alone at home for %.0f min: the TV goes off", here / 60)
            try:
                await self.tv_off()
            except Exception as exc:
                log.warning("tv off: %s", exc)
            self.resting = True
            await self.emit({"type": "event", "name": "rest", "on": True})

    async def run(self) -> None:
        while True:
            try:
                await self.check()
            except Exception as exc:
                log.warning("idle: %s", exc)
            await asyncio.sleep(CHECK_SECONDS)
