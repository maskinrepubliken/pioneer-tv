"""idle.py: the screensaver after a while alone, the TV off after longer,
never while something plays, and the press that takes it away.
`python -m unittest tests.test_idle` from daemon/."""
import asyncio
import time
import unittest

from pioneertv.idle import Idle


class IdleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.events, self.offs = [], []
        self.busy = False

        async def emit(msg):
            self.events.append(msg)

        async def tv_off():
            self.offs.append(True)
        self.cfg = {"ui": {"screensaver_minutes": 3, "tv_off_minutes": 10}}
        self.idle = Idle(self.cfg, emit, tv_off, busy=lambda: self.busy)

    def alone(self, minutes):
        self.idle.last_input = time.monotonic() - minutes * 60

    def shown(self):
        return [e["show"] for e in self.events if e.get("name") == "saver"]

    async def test_screensaver_then_the_tv_off_once(self):
        self.alone(2)
        await self.idle.check()
        self.assertEqual(self.shown(), [])
        self.alone(3.1)
        await self.idle.check()
        self.assertEqual(self.shown(), [True])
        await self.idle.check()
        self.assertEqual(self.shown(), [True])           # once
        self.alone(10.1)
        await self.idle.check()
        await self.idle.check()
        self.assertEqual(self.offs, [True])              # once

    async def test_the_press_that_wakes_does_nothing_else(self):
        self.alone(4)
        await self.idle.check()
        self.assertTrue(self.idle.input())               # swallowed
        await asyncio.sleep(0)
        self.assertEqual(self.shown(), [True, False])
        self.assertFalse(self.idle.input())              # the next one acts

    async def test_never_while_a_game_or_a_film_plays(self):
        self.busy = True
        self.alone(30)
        await self.idle.check()
        self.assertEqual((self.shown(), self.offs), ([], []))
        # It ended: the count starts from then.
        self.busy = False
        await self.idle.check()
        self.assertEqual(self.shown(), [])

    async def test_never_while_a_page_plays(self):
        self.idle.page({"playing": True})
        self.alone(30)
        await self.idle.check()
        self.assertEqual(self.shown(), [])
        self.idle.page({"playing": False})
        self.alone(4)
        await self.idle.check()
        self.assertEqual(self.shown(), [True])

    async def test_a_page_playing_report_runs_out(self):
        self.idle.page({"playing": True})
        self.idle.playing_until = time.monotonic() - 1    # no word from the page since
        self.alone(4)
        await self.idle.check()
        self.assertEqual(self.shown(), [True])

    async def test_a_real_keyboard_counts(self):
        self.alone(2.9)
        self.idle.page({"input": True})
        self.assertLess(time.monotonic() - self.idle.last_input, 1)

    async def test_zero_is_never(self):
        self.cfg["ui"] = {"screensaver_minutes": 0, "tv_off_minutes": 0}
        self.alone(600)
        await self.idle.check()
        self.assertEqual((self.shown(), self.offs), ([], []))

    async def test_the_tv_coming_on_starts_afresh(self):
        self.alone(11)
        await self.idle.check()
        self.idle.tv_on()
        await asyncio.sleep(0)
        self.assertFalse(self.idle.showing)
        self.assertFalse(self.idle.tv_off_sent)


class DispatcherSwallows(unittest.IsolatedAsyncioTestCase):
    async def test_the_waking_press_does_not_reach_the_page(self):
        from pioneertv import config
        from pioneertv.actions import Dispatcher

        class Cec:
            enabled, last_power = True, "on"

            async def power_status(self):
                return "on"

        async def nothing(_):
            return None
        d = Dispatcher(config._merge(config.DEFAULTS, {}), vinput=None, cec=Cec(), emit=nothing)
        fired = []

        async def fire(action):
            fired.append(action)
        d._begin = fire
        up = [True]
        d.on_input = lambda: up.pop() if up else False
        action = {"key": "KEY_ENTER"}
        await d.press(action)
        await d.release(action)
        self.assertEqual(fired, [])
        await d.press(action)
        self.assertEqual(fired, [action])


if __name__ == "__main__":
    unittest.main()
