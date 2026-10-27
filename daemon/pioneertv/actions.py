"""Maps abstract actions ({"key": ...}, {"cec": ...}, {"system": ...}) to effects.

Buttons call `press(action)` / `release(action)`; the dispatcher handles key
hold semantics, repeat for held CEC actions, and long-press alternates.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Coroutine

log = logging.getLogger("pioneertv.actions")

# After this long without input, check the TV really is awake before acting.
IDLE_RECHECK_SECONDS = 10.0
REPEAT_MAX_SECONDS = 8.0
# A TV reports itself "on" the moment it accepts the command, while the panel
# stays dark for a few seconds more. Input keeps being swallowed for this long
# after a wake, or the presses that follow land on a screen nobody can see yet.
WAKE_SETTLE_SECONDS = 4.0

Action = dict[str, Any]
MIN_KEY_HOLD = 0.06  # seconds


class Dispatcher:
    def __init__(self, cfg: dict, vinput, cec, emit: Callable[[dict], Coroutine]) -> None:
        self.cfg = cfg
        self.vinput = vinput
        self.cec = cec
        self.emit = emit  # send an event to the extension
        self.repeat_ms = cfg["gamepad"]["repeat_ms"]
        self.long_press_ms = cfg["gamepad"]["long_press_ms"]
        self._repeat_tasks: dict[int, asyncio.Task] = {}
        self._pressed_at: dict[int, float] = {}
        self._long_fired: set[int] = set()
        self._long_tasks: dict[int, asyncio.Task] = {}
        self._down_at: dict[int, float] = {}     # when a long-press button went down, by the pad's own clock
        self._key_down_at: dict[int, float] = {}
        self._begun: set[int] = set()
        self._swallowed: set[int] = set()
        self._last_input = 0.0
        self._wake_until = 0.0
        # Someone pressed something: the screensaver's count starts again
        # (idle.py). True when the screensaver was up and the press only
        # takes it away.
        self.on_input: Callable[[], bool] | None = None
        # While a game runs in RetroArch (games.py), its handler gets
        # the box's own buttons (menu, home) first; True means it took them.
        self.system_hook: Callable[[str], Coroutine] | None = None

    # ------------------------------------------------------------ public
    def _tv_is_off(self) -> bool:
        return bool(self.cfg["cec"].get("wake_on_input", True)) and self.cec.enabled and self.cec.last_power == "standby"

    async def _refresh_tv_power(self, idle: float) -> None:
        """Ask the TV whether it is awake before the first press after a pause.
        A set switched off with its own remote does not always say so, and a
        press that slips through lands on a screen nobody can see."""
        if not bool(self.cfg["cec"].get("wake_on_input", True)) or not self.cec.enabled:
            return
        if idle < IDLE_RECHECK_SECONDS or self.cec.last_power == "standby":
            return
        try:
            await self.cec.power_status()
        except Exception as exc:
            log.debug("power check before input failed: %s", exc)

    async def _wake_tv(self) -> None:
        """Wake the TV, then hold the door shut until the picture is really there."""
        try:
            await self.cec_command("tv_on")
        finally:
            self._wake_until = max(self._wake_until, time.monotonic() + WAKE_SETTLE_SECONDS)

    async def press(self, action: Action, at: float | None = None) -> None:
        """at: when the button went down (the input event's own time, on the
        wall clock). The pad's events wait while a press is handled, so a
        long press is judged by these times, not by when they arrive here."""
        aid = id(action)
        down_at = at if at is not None else time.time()
        now = time.monotonic()
        idle, self._last_input = now - self._last_input, now
        await self._refresh_tv_power(idle)
        self._pressed_at[aid] = time.monotonic()
        saver_was_up = bool(self.on_input and self.on_input())
        # With the TV off, the first button press only turns it back on: what
        # it would otherwise do happens on a screen nobody can see. The presses
        # that follow while the picture comes up are dropped for the same reason.
        if "cec" not in action and (self._tv_is_off() or now < self._wake_until):
            self._swallowed.add(aid)
            if self._tv_is_off():
                log.info("TV is off: waking it instead of %s", action)
                self._wake_until = now + WAKE_SETTLE_SECONDS
                # Waking verifies and retries, which takes seconds; do not block
                # the pad's read loop on it.
                asyncio.create_task(self._wake_tv())
            else:
                log.debug("TV is still waking: dropped %s", action)
            return
        if saver_was_up and "cec" not in action:
            # The press that takes the screensaver away does nothing else.
            self._swallowed.add(aid)
            return
        if "long" in action:
            # Defer the short action until release; fire long after the delay.
            self._down_at[aid] = down_at
            self._long_tasks[aid] = asyncio.create_task(self._long_after(action, down_at))
            return
        self._begun.add(aid)
        await self._begin(action)

    async def release(self, action: Action, at: float | None = None) -> None:
        aid = id(action)
        if aid in self._swallowed:
            self._swallowed.discard(aid)
            return
        if task := self._long_tasks.pop(aid, None):
            held = (at if at is not None else time.time()) - self._down_at.pop(aid, time.time())
            if aid in self._long_fired:
                # It fired and may still be at work (holding Home stops a
                # film first): letting go must not cut it short.
                self._long_fired.discard(aid)
                return
            task.cancel()
            if held >= self.long_press_ms / 1000:
                await self.fire(action["long"])  # held long enough, though its release came before the timer
            else:
                await self.fire(action)  # short press
            return
        if aid not in self._begun:
            return  # never began (game mode)
        self._begun.discard(aid)
        await self._end(action)

    async def fire(self, action: Action) -> None:
        """One-shot: press and release."""
        await self._begin(action)
        await self._end(action)

    # ------------------------------------------------------------ internals
    async def _long_after(self, action: Action, down_at: float) -> None:
        # Counted from when the button went down. A press handled late (the
        # TV's power asked first, which takes a second or more over CEC) may
        # have its release already waiting: give it a moment to arrive and
        # decide by the times instead (seen on the box: holding B to stop a
        # film after a while without input paused it instead).
        late = time.time() - down_at
        try:
            await asyncio.sleep(max(self.long_press_ms / 1000 - late, 0.15))
        except asyncio.CancelledError:
            return
        self._long_fired.add(id(action))
        await self.fire(action["long"])

    async def _begin(self, action: Action) -> None:
        if "key" in action:
            self._key_down_at[id(action)] = time.monotonic()
            self.vinput.key(action["key"], True, action.get("modifiers"))
        elif "mouse_button" in action:
            if self.cfg["mouse"].get("mode", "virtual") == "virtual":
                await self.emit({"type": "event", "name": "pointer_button", "button": action["mouse_button"].replace("BTN_", "").lower(), "down": True})
            else:
                self.vinput.mouse_button(action["mouse_button"], True)
        elif "cec" in action or "system" in action:
            await self._run_once(action)
            if action.get("repeat"):
                # Never two repeats for one action: a press whose release went
                # missing must not leave the first running for ever.
                if old := self._repeat_tasks.pop(id(action), None):
                    old.cancel()
                self._repeat_tasks[id(action)] = asyncio.create_task(self._repeat(action))

    async def _end(self, action: Action) -> None:
        if "key" in action:
            # A d-pad tap can report press and release in the same instant;
            # hold the virtual key long enough for the compositor and browser.
            held = time.monotonic() - self._key_down_at.pop(id(action), 0)
            if held < MIN_KEY_HOLD:
                await asyncio.sleep(MIN_KEY_HOLD - held)
            self.vinput.key(action["key"], False, action.get("modifiers"))
        elif "mouse_button" in action:
            if self.cfg["mouse"].get("mode", "virtual") == "virtual":
                await self.emit({"type": "event", "name": "pointer_button", "button": action["mouse_button"].replace("BTN_", "").lower(), "down": False})
            else:
                self.vinput.mouse_button(action["mouse_button"], False)
        if task := self._repeat_tasks.pop(id(action), None):
            task.cancel()

    async def _repeat(self, action: Action) -> None:
        # A held button repeats for REPEAT_MAX_SECONDS at most: if its release
        # is ever lost, the TV's volume does not run to the end of its scale.
        started = time.monotonic()
        try:
            await asyncio.sleep(0.4)
            while time.monotonic() - started < REPEAT_MAX_SECONDS:
                await self._run_once(action)
                await asyncio.sleep(self.repeat_ms / 1000)
            log.warning("stopped repeating %s after %.0f s", action, REPEAT_MAX_SECONDS)
        except asyncio.CancelledError:
            pass
        finally:
            if self._repeat_tasks.get(id(action)) is asyncio.current_task():
                del self._repeat_tasks[id(action)]

    async def _run_once(self, action: Action) -> None:
        if "cec" in action:
            await self.cec_command(action["cec"])
        elif "system" in action:
            if self.system_hook and await self.system_hook(action["system"]):
                return
            await self.emit({"type": "event", "name": action["system"]})

    async def cec_command(self, command: str) -> None:
        if command in ("volume_up", "volume_down", "mute"):
            await self.emit({"type": "event", "name": "volume", "direction": command.split("_")[-1] if "_" in command else "mute"})
        try:
            await self.cec.command(command)
        except Exception as exc:  # cec-ctl missing, TV asleep, ...
            log.warning("cec %s failed: %s", command, exc)
