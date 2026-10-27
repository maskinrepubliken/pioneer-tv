"""The dispatcher's repeats: a held volume trigger repeats, stops on
release, never runs twice for one action, and gives up on its own. And long
presses judged by the pad's own times, however late they are handled.
`python -m unittest tests.test_actions` from daemon/."""
import asyncio
import unittest

from pioneertv import actions, config
from pioneertv.actions import Dispatcher


class Cec:
    enabled = True
    last_power = "on"

    def __init__(self):
        self.sent = []

    async def command(self, name):
        self.sent.append(name)

    async def power_status(self):
        return "on"


async def nothing(_msg):
    return None


class Repeats(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        cfg = config._merge(config.DEFAULTS, {"gamepad": {"repeat_ms": 20}})
        self.cec = Cec()
        self.d = Dispatcher(cfg, vinput=None, cec=self.cec, emit=nothing)
        self.action = {"cec": "volume_down", "repeat": True}

    async def test_release_stops_the_repeat(self):
        await self.d.press(self.action)
        await asyncio.sleep(0.5)
        await self.d.release(self.action)
        sent = len(self.cec.sent)
        self.assertGreater(sent, 2)
        await asyncio.sleep(0.2)
        self.assertEqual(len(self.cec.sent), sent)

    async def test_a_second_press_does_not_leave_the_first_running(self):
        await self.d.press(self.action)
        await self.d.press(self.action)                 # its release went missing
        await asyncio.sleep(0.5)
        await self.d.release(self.action)
        sent = len(self.cec.sent)
        await asyncio.sleep(0.2)
        self.assertEqual(len(self.cec.sent), sent)
        self.assertEqual(self.d._repeat_tasks, {})

    async def test_a_lost_release_gives_up(self):
        old = actions.REPEAT_MAX_SECONDS
        actions.REPEAT_MAX_SECONDS = 0.6
        try:
            await self.d.press(self.action)
            await asyncio.sleep(0.9)
            sent = len(self.cec.sent)
            await asyncio.sleep(0.2)
            self.assertEqual(len(self.cec.sent), sent)
            self.assertEqual(self.d._repeat_tasks, {})
        finally:
            actions.REPEAT_MAX_SECONDS = old


if __name__ == "__main__":
    unittest.main()


class LongPresses(unittest.IsolatedAsyncioTestCase):
    """B: Escape, held: back. The pad's events wait while a press is handled
    (the TV's power is asked first after a pause), so its release can arrive
    at once, long after it happened."""
    async def asyncSetUp(self):
        cfg = config._merge(config.DEFAULTS, {"gamepad": {"long_press_ms": 300}})
        self.fired = []
        self.d = Dispatcher(cfg, vinput=None, cec=Cec(), emit=nothing)

        async def fire(action):
            self.fired.append(action.get("system") or action.get("key"))
        self.d.fire = fire
        self.action = {"key": "KEY_ESC", "long": {"system": "back"}}

    async def test_held_and_handled_late_is_long(self):
        t0 = actions.time.time() - 1.0                   # went down a second ago
        await self.d.press(self.action, t0)
        await self.d.release(self.action, t0 + 0.6)      # its release, waiting
        self.assertEqual(self.fired, ["back"])

    async def test_a_tap_handled_late_is_short(self):
        t0 = actions.time.time() - 1.0
        await self.d.press(self.action, t0)
        await self.d.release(self.action, t0 + 0.1)
        await asyncio.sleep(0.25)
        self.assertEqual(self.fired, ["KEY_ESC"])

    async def test_held_on_time_fires_once(self):
        t0 = actions.time.time()
        await self.d.press(self.action, t0)
        await asyncio.sleep(0.4)
        self.assertEqual(self.fired, ["back"])
        await self.d.release(self.action, t0 + 0.5)
        self.assertEqual(self.fired, ["back"])
