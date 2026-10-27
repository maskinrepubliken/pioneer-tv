"""idle.py: left alone anywhere, home (a held game or film put away first);
left alone at home, the TV off and the home page resting; never while
something plays. `python -m unittest tests.test_idle` from daemon/."""
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
        self.cfg = {"ui": {"home_minutes": 10, "tv_off_minutes": 5}}
        self.idle = Idle(self.cfg, emit, tv_off, busy=lambda: self.busy, at_home=lambda: self.home, put_away=put_away)

    def alone(self, minutes):
        self.idle.last_input = time.monotonic() - minutes * 60
        if self.idle.home_since is not None:
            self.idle.home_since = min(self.idle.home_since, self.idle.last_input)

    def named(self, name):
        return [e for e in self.events if e.get("name") == name]

    async def test_away_from_home_then_home_quietly_once(self):
        self.alone(9)
        await self.idle.check()
        self.assertEqual(self.named("home"), [])
        self.alone(10.1)
        await self.idle.check()
        await self.idle.check()
        self.assertEqual(self.named("home"), [{"type": "event", "name": "home", "quiet": True}])
        self.assertEqual(self.put, [False])

    async def test_a_held_game_or_film_is_put_away_first(self):
        self.held = True
        self.alone(11)
        await self.idle.check()
        self.assertEqual(self.put, [True])
        self.assertEqual(len(self.named("home")), 1)

    async def test_at_home_the_tv_off_counted_from_arriving(self):
        self.home = True
        self.alone(30)                         # long alone, but only just home
        self.idle.home_since = time.monotonic() - 60
        await self.idle.check()
        self.assertEqual(self.offs, [])
        self.idle.home_since = time.monotonic() - 5.1 * 60
        await self.idle.check()
        await self.idle.check()
        self.assertEqual(self.offs, [True])    # once
        self.assertEqual(self.named("rest"), [{"type": "event", "name": "rest", "on": True}])
        self.assertEqual(self.named("home"), [])

    async def test_a_press_wakes_the_home_page(self):
        self.home = True
        await self.idle.check()
        self.idle.home_since = time.monotonic() - 6 * 60
        self.alone(6)
        await self.idle.check()
        self.assertFalse(self.idle.input())   # never swallowed here
        await asyncio.sleep(0)
        self.assertEqual([e["on"] for e in self.named("rest")], [True, False])
        self.assertFalse(self.idle.tv_off_sent)

    async def test_never_while_a_game_or_a_film_plays(self):
        self.busy = True
        self.alone(30)
        await self.idle.check()
        self.assertEqual((self.named("home"), self.offs), ([], []))
        # It ended: the count starts from then.
        self.busy = False
        await self.idle.check()
        self.assertEqual(self.named("home"), [])

    async def test_never_while_a_page_plays(self):
        self.idle.page({"playing": True})
        self.alone(30)
        await self.idle.check()
        self.assertEqual(self.named("home"), [])
        self.idle.page({"playing": False})
        self.alone(11)
        await self.idle.check()
        self.assertEqual(len(self.named("home")), 1)

    async def test_a_page_playing_report_runs_out(self):
        self.idle.page({"playing": True})
        self.idle.playing_until = time.monotonic() - 1    # no word from the page since
        self.alone(11)
        await self.idle.check()
        self.assertEqual(len(self.named("home")), 1)

    async def test_a_real_keyboard_counts(self):
        self.alone(9.9)
        self.idle.page({"input": True})
        self.assertLess(time.monotonic() - self.idle.last_input, 1)

    async def test_zero_is_never(self):
        self.cfg["ui"] = {"home_minutes": 0, "tv_off_minutes": 0}
        self.alone(600)
        await self.idle.check()
        self.home = True
        await self.idle.check()
        self.idle.home_since = time.monotonic() - 3600
        await self.idle.check()
        self.assertEqual((self.named("home"), self.offs), ([], []))

    async def test_the_tv_coming_on_starts_afresh(self):
        self.home = True
        await self.idle.check()
        self.idle.home_since = time.monotonic() - 6 * 60
        self.alone(6)
        await self.idle.check()
        self.idle.tv_on()
        await asyncio.sleep(0)
        self.assertFalse(self.idle.resting)
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
