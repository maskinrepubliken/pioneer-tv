"""idle.py: left alone anywhere, home (a held game or film put away first);
with no pad, the screensaver; up long enough, the TV off and resting; never
while something plays. `python -m unittest tests.test_idle` from daemon/."""
import asyncio
import time
import unittest

from pioneertv import idle as idle_module
from pioneertv.idle import Idle


class IdleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.events, self.offs, self.put = [], [], []
        self.busy = False
        self.home = False
        self.held = False
        self.pads = 0
        idle_module.HOME_SETTLE = 0

        async def emit(msg):
            self.events.append(msg)
            if msg.get("name") == "home":
                self.home = True

        async def tv_off():
            self.offs.append(True)

        async def put_away():
            self.put.append(self.held)
            return self.held
        self.cfg = {"ui": {"home_minutes": 10, "saver_minutes": 2, "tv_off_minutes": 5}}
        self.idle = Idle(self.cfg, emit, tv_off, busy=lambda: self.busy, at_home=lambda: self.home,
                         pads=lambda: self.pads, put_away=put_away)

    def alone(self, minutes):
        self.idle.last_input = time.monotonic() - minutes * 60

    def named(self, name):
        return [e for e in self.events if e.get("name") == name]

    def shown(self):
        return [e["show"] for e in self.named("saver")]

    async def test_away_from_home_then_home_quietly_once(self):
        self.pads = 1
        self.alone(9)
        await self.idle.check()
        self.assertEqual(self.named("home"), [])
        self.alone(10.1)
        await self.idle.check()
        await self.idle.check()
        self.assertEqual(self.named("home"), [{"type": "event", "name": "home", "quiet": True}])
        self.assertEqual(self.put, [False])

    async def test_a_held_game_or_film_is_put_away_first(self):
        self.pads = 1
        self.held = True
        self.alone(11)
        await self.idle.check()
        self.assertEqual(self.put, [True])
        self.assertEqual(len(self.named("home")), 1)

    async def test_no_pad_the_screensaver_then_the_tv_off_once(self):
        self.alone(1.9)
        await self.idle.check()
        self.assertEqual(self.shown(), [])
        self.alone(2.1)
        await self.idle.check()
        await self.idle.check()
        self.assertEqual(self.shown(), [True])                 # once
        self.idle.saver_since = time.monotonic() - 5.1 * 60
        await self.idle.check()
        await self.idle.check()
        self.assertEqual(self.offs, [True])                    # once
        self.assertEqual(self.named("rest"), [{"type": "event", "name": "rest", "on": True}])

    async def test_a_pad_connected_keeps_it_away(self):
        self.pads = 1
        self.home = True
        self.alone(60)
        await self.idle.check()
        self.assertEqual((self.shown(), self.offs), ([], []))

    async def test_the_press_that_wakes_does_nothing_else(self):
        self.alone(3)
        await self.idle.check()
        self.assertTrue(self.idle.input())                     # swallowed
        await asyncio.sleep(0)
        self.assertEqual(self.shown(), [True, False])
        self.assertFalse(self.idle.input())                    # the next one acts

    async def test_a_pad_switched_on_takes_it_away(self):
        self.alone(3)
        await self.idle.check()
        self.idle.pad_connected()
        await asyncio.sleep(0)
        self.assertEqual(self.shown(), [True, False])

    async def test_a_press_wakes_it_from_resting(self):
        self.alone(3)
        await self.idle.check()
        self.idle.saver_since = time.monotonic() - 6 * 60
        await self.idle.check()
        self.idle.input()
        await asyncio.sleep(0)
        self.assertEqual([e["on"] for e in self.named("rest")], [True, False])
        self.assertFalse(self.idle.tv_off_sent)

    async def test_the_tv_off_by_its_remote_rests_too(self):
        self.idle.tv_standby()
        await asyncio.sleep(0)
        self.assertEqual(self.shown(), [True])
        self.assertEqual(self.named("rest"), [{"type": "event", "name": "rest", "on": True}])
        self.idle.tv_on()
        await asyncio.sleep(0)
        self.assertEqual(self.shown(), [True, False])
        self.assertFalse(self.idle.resting)

    async def test_never_while_a_game_or_a_film_plays(self):
        self.busy = True
        self.alone(30)
        await self.idle.check()
        self.assertEqual((self.named("home"), self.shown(), self.offs), ([], [], []))
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
        self.alone(3)
        await self.idle.check()
        self.assertEqual(self.shown(), [True])

    async def test_a_page_playing_report_runs_out(self):
        self.idle.page({"playing": True})
        self.idle.playing_until = time.monotonic() - 1    # no word from the page since
        self.alone(3)
        await self.idle.check()
        self.assertEqual(self.shown(), [True])

    async def test_a_real_keyboard_counts(self):
        self.alone(9.9)
        self.idle.page({"input": True})
        self.assertLess(time.monotonic() - self.idle.last_input, 1)

    async def test_zero_is_never(self):
        self.cfg["ui"] = {"home_minutes": 0, "saver_minutes": 0, "tv_off_minutes": 0}
        self.alone(600)
        await self.idle.check()
        self.assertEqual((self.named("home"), self.shown(), self.offs), ([], [], []))


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
