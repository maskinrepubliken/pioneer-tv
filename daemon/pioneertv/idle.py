"""Left alone: home, the screensaver, the TV off, decided here.

- Left alone anywhere but home for ui.home_minutes, the box goes home; a
  game held on its pause panel is quit (its state is saved, games.py) and
  a film held on its panel is stopped (its position is saved, video.py) on
  the way, and the overlay closes its menus.
- With no pad connected and left alone for ui.saver_minutes, the
  screensaver comes over everything (the overlay draws it: the fire and a
  line of the Tao Te Ching). Any button takes it away and does nothing
  else; a pad connecting does too.
- When the screensaver has been up for ui.tv_off_minutes, the TV is turned
  off over CEC and the screensaver rests ("Vilar", nothing moving) until
  the TV is on again.

0 is never, for each. Alone means: no button on a pad or on the TV's
remote, no pointer, no key on a real keyboard (the pages report those), and
nothing playing. Playing is a game running in RetroArch or a film running
in mpv (a game or a film held on its pause panel is not), or a page that
says its video or audio plays (main.js, every page, every frame) or that
is in game mode. So browsing anywhere counts down, and a film, a song or a
game never does; the count starts again when it ends.
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
                 pads: Callable[[], int] = lambda: 0,
                 put_away: Callable[[], Coroutine] | None = None) -> None:
        self.cfg = cfg
        self.emit = emit
        self.tv_off = tv_off
        self.busy = busy                    # a game or a film is playing
        self.at_home = at_home              # the page on screen is the home page
        self.pads = pads                    # how many pads are connected
        self.put_away = put_away            # quits a held game, stops a held film
        self.last_input = time.monotonic()
        self.playing_until = 0.0
        self.sent_home = False
        self.saver_since: float | None = None   # the screensaver is up
        self.tv_off_sent = False
        self.resting = False                # the screensaver says "Vilar"

    def minutes(self, key: str, fallback: float) -> float:
        try:
            return max(0.0, float((self.cfg.get("ui") or {}).get(key, fallback)))
        except (TypeError, ValueError):
            return fallback

    @property
    def showing(self) -> bool:
        return self.saver_since is not None

    def later(self, msg: dict) -> None:
        asyncio.get_running_loop().create_task(self.emit(msg))

    # ------------------------------------------------------------ input
    def input(self) -> bool:
        """Someone is here. True when the screensaver was up: the press only
        takes it away (the dispatcher swallows it)."""
        self.last_input = time.monotonic()
        self.sent_home = False
        self.tv_off_sent = False
        if self.resting:
            self.resting = False
            self.later({"type": "event", "name": "rest", "on": False})
        if self.showing:
            self.saver_since = None
            log.info("screensaver off")
            self.later({"type": "event", "name": "saver", "show": False})
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

    def tv_standby(self) -> None:
        """The TV went off (its own remote, or ours): the screensaver rests
        over everything until it is on again."""
        self.tv_off_sent = True
        if not self.showing:
            self.saver_since = time.monotonic()
            self.later({"type": "event", "name": "saver", "show": True})
        if not self.resting:
            self.resting = True
            self.later({"type": "event", "name": "rest", "on": True})

    def pad_connected(self) -> None:
        """Someone switched a pad on: the screensaver goes."""
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
        if self.playing():
            # Playing is not being alone: the count starts when it ends.
            self.last_input = now
            if self.showing:
                self.input()
            return
        alone = now - self.last_input
        away = self.minutes("home_minutes", 10) * 60
        if away and alone >= away and not self.sent_home and not self.at_home():
            await self.go_home()
        saver = self.minutes("saver_minutes", 2) * 60
        if saver and not self.showing and alone >= saver and not self.pads():
            self.saver_since = now
            log.info("no pad and alone for %.0f min: screensaver on", alone / 60)
            await self.emit({"type": "event", "name": "saver", "show": True})
        off = self.minutes("tv_off_minutes", 5) * 60
        if off and self.showing and now - self.saver_since >= off and not self.tv_off_sent:
            self.tv_off_sent = True
            log.info("screensaver up for %.0f min: the TV goes off", (now - self.saver_since) / 60)
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
