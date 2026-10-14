"""native.py without RetroArch: which consoles it offers, the config it
writes, the cache it keeps. `python -m unittest tests.test_native` from daemon/."""
import os
import tempfile
import unittest
from pathlib import Path

from pioneertv import config
from pioneertv.native import Native


class Dummy:
    system_hook = None


async def nothing(_msg):
    return None


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = Path(self.dir.name)
        core = d / "mupen64plus_next_libretro.so"
        core.write_bytes(b"\x7fELF")
        ra = d / "retroarch"
        ra.write_text("#!/bin/sh\n")
        ra.chmod(0o755)
        self.cfg = config._merge(config.DEFAULTS, {"native": {
            "enabled": True, "retroarch": str(ra), "dir": str(d / "native"), "cores": {"n64": str(core), "snes": str(d / "none.so")},
        }})
        self.native = Native(self.cfg, nothing, {}, Dummy())

    def tearDown(self):
        self.dir.cleanup()

    def test_platforms_need_a_core_and_the_switch(self):
        self.assertEqual(self.native.platforms(), ["n64"])
        self.cfg["native"]["enabled"] = False
        self.assertEqual(self.native.platforms(), [])

    def test_config_written(self):
        self.native._write_config("mupen64plus_next")
        root = Path(self.cfg["native"]["dir"])
        cfg = (root / "cfg" / "retroarch.cfg").read_text()
        self.assertIn('network_cmd_enable = "true"', cfg)
        self.assertIn('savestate_auto_save = "true"', cfg)
        self.assertIn('mupen64plus-cpucore = "dynamic_recompiler"', (root / "cfg" / "retroarch-core-options.cfg").read_text())
        self.assertTrue(any((root / "autoconfig" / "udev").iterdir()))

    def test_cache_drops_the_oldest(self):
        self.cfg["native"]["cache_mb"] = 1
        games = Path(self.cfg["native"]["dir"]) / "games"
        for i, age in ((1, 300), (2, 200), (3, 100)):
            g = games / str(i)
            g.mkdir(parents=True)
            f = g / "rom.bin"
            f.write_bytes(b"x" * 400_000)
            t = os.path.getmtime(f) - age
            os.utime(f, (t, t))
        self.native._make_room(300_000)
        self.assertEqual(sorted(p.name for p in games.iterdir()), ["3"])


if __name__ == "__main__":
    unittest.main()
