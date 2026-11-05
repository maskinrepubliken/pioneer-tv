"""actions.VolumeChord: L2 and R2 together mute once; alone they step the volume.
`python -m unittest tests.test_volume_chord` from daemon/."""
import asyncio
import unittest

from pioneertv.actions import VolumeChord

DOWN = {"cec": "volume_down", "repeat": True}
UP = {"cec": "volume_up", "repeat": True}
ENTER = {"key": "KEY_ENTER"}


class Recorder:
    def __init__(self):
        self.calls = []

    async def press(self, action, at=None):
        self.calls.append(("press", action.get("cec") or action.get("key")))

    async def release(self, action, at=None):
        self.calls.append(("release", action.get("cec") or action.get("key")))


class Chord(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.d = Recorder()
        self.c = VolumeChord(self.d)
        self.wait = VolumeChord.CHORD_SECONDS + 0.05

    async def test_both_together_mute_once(self):
        await self.c.press(DOWN)
        await asyncio.sleep(0.02)
        await self.c.press(UP)
        await asyncio.sleep(self.wait)
        await self.c.release(DOWN)
        await self.c.release(UP)
        self.assertEqual(self.d.calls, [("press", "mute"), ("release", "mute")])   # no step first

    async def test_the_second_late_stops_the_first(self):
        await self.c.press(UP)
        await asyncio.sleep(self.wait)                 # the volume is going up
        await self.c.press(DOWN)
        await self.c.release(UP)
        await self.c.release(DOWN)
        self.assertEqual(self.d.calls, [("press", "volume_up"), ("release", "volume_up"), ("press", "mute"), ("release", "mute")])

    async def test_held_again_after_both_let_go(self):
        await self.c.press(DOWN)
        await self.c.press(UP)
        await self.c.release(UP)
        await self.c.press(UP)                         # DOWN still held: no second mute, no step
        await asyncio.sleep(self.wait)
        await self.c.release(UP)
        await self.c.release(DOWN)
        await self.c.press(UP)
        await asyncio.sleep(self.wait)
        await self.c.release(UP)
        self.assertEqual(self.d.calls, [("press", "mute"), ("release", "mute"), ("press", "volume_up"), ("release", "volume_up")])

    async def test_a_tap_is_one_step(self):
        await self.c.press(DOWN)
        await self.c.release(DOWN)
        self.assertEqual(self.d.calls, [("press", "volume_down"), ("release", "volume_down")])

    async def test_other_buttons_pass_straight_on(self):
        await self.c.press(ENTER)
        await self.c.release(ENTER)
        self.assertEqual(self.d.calls, [("press", "KEY_ENTER"), ("release", "KEY_ENTER")])


if __name__ == "__main__":
    unittest.main()
