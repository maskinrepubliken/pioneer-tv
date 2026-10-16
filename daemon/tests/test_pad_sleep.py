"""Putting the pads to sleep with the TV: their dongles are cut off and let
back in later, also after a restart. `python -m unittest tests.test_pad_sleep`
from daemon/."""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path

from pioneertv import config, gamepad


class Dev:
    def __init__(self, path, phys, uniq=""):
        self.path, self.phys, self.uniq = path, phys, uniq


class Pad:
    def __init__(self, dev, label):
        self.dev, self.label = dev, label


class Sleep(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = Path(self.dir.name)
        self.dongles = {}
        for name in ("1-1.2", "1-1.4"):
            p = d / name
            p.mkdir()
            (p / "authorized").write_text("1")
            self.dongles[name] = p
        self.old = (gamepad.usb_device_dir, gamepad.ASLEEP_FILE)
        gamepad.usb_device_dir = lambda dev: str(self.dongles[dev.path])
        gamepad.ASLEEP_FILE = str(d / "run" / "dongles-off")
        cfg = config._merge(config.DEFAULTS, {"gamepad": {"sleep_seconds": 0.3}})
        self.mgr = gamepad.GamepadManager.__new__(gamepad.GamepadManager)
        self.mgr.cfg = cfg
        self.mgr.instances = {
            "a": Pad(Dev("1-1.2", "usb-0000:01:00.0-1.2/input0"), "Rosa"),
            "b": Pad(Dev("1-1.4", "usb-0000:01:00.0-1.4/input0"), "Grön"),
        }

    def tearDown(self):
        gamepad.usb_device_dir, gamepad.ASLEEP_FILE = self.old
        self.dir.cleanup()

    def state(self):
        return {n: p.joinpath("authorized").read_text() for n, p in self.dongles.items()}

    async def test_dongles_cut_off_then_back(self):
        await self.mgr.sleep_pads()
        self.assertEqual(self.state(), {"1-1.2": "0", "1-1.4": "0"})
        self.assertTrue(os.path.isfile(gamepad.ASLEEP_FILE))
        await asyncio.sleep(0.5)
        self.assertEqual(self.state(), {"1-1.2": "1", "1-1.4": "1"})
        self.assertFalse(os.path.exists(gamepad.ASLEEP_FILE))

    async def test_a_restart_lets_them_back_in(self):
        self.mgr.cfg["gamepad"]["sleep_seconds"] = 60
        await self.mgr.sleep_pads()
        fresh = gamepad.GamepadManager.__new__(gamepad.GamepadManager)
        await fresh.wake_dongles()                      # what a new daemon does at start
        self.assertEqual(self.state(), {"1-1.2": "1", "1-1.4": "1"})


if __name__ == "__main__":
    unittest.main()
