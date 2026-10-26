"""games.py without RetroArch: the consoles it offers, the config it writes,
the cache, players, and pausing and resuming against a stand-in RetroArch.
`python -m unittest tests.test_games` from daemon/."""
import asyncio
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path

from pioneertv import config
from pioneertv.games import Games, wayland_socket


class Vinput:
    def release_all(self):
        pass


class Dispatcher:
    system_hook = None
    vinput = Vinput()


class Pad:
    def __init__(self, path, serial, label):
        class Dev:
            pass
        self.dev = Dev()
        self.dev.path = path
        self.serial, self.label = serial, label

    async def release_everything(self):
        pass


class Pads:
    def __init__(self, pads, active=None):
        self._pads = pads
        self.shared = {"active": active}

    def pads(self):
        return self._pads


# A stand-in for RetroArch: listens on the command port; SCREENSHOT writes the
# picture, SAVE_STATE the state, QUIT exits (without saving, as the real one
# did when told to quit over the port).
FAKE_RA = r'''
import socket, sys, pathlib
port, shot, state = int(sys.argv[1]), sys.argv[2], sys.argv[3]
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("127.0.0.1", port))
while True:
    msg = s.recv(64).decode()
    if msg == "SCREENSHOT":
        pathlib.Path(shot).write_bytes(b"png")
    elif msg == "SAVE_STATE":
        pathlib.Path(state).write_bytes(b"state")
    elif msg == "QUIT":
        sys.exit(0)
'''


async def nothing(_msg):
    return None


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class GamesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        d = Path(self.dir.name)
        core = d / "snes9x_libretro.so"
        core.write_bytes(b"\x7fELF")
        ra = d / "retroarch"
        ra.write_text("#!/bin/sh\n")
        ra.chmod(0o755)
        self.events = []

        async def emit(msg):
            self.events.append(msg)
        self.cfg = config._merge(config.DEFAULTS, {"games": {
            "retroarch": str(ra), "dir": str(d / "games"), "port": free_port(),
        }})
        # Only this test's cores, not the box's own (which may well be installed).
        self.cfg["games"]["cores"] = {"snes": str(core), "n64": str(d / "missing.so")}
        self.pads = Pads([Pad("/dev/input/event7", "B", "Grön handkontroll"), Pad("/dev/input/event5", "A", "Rosa handkontroll")], active="B")
        self.games = Games(self.cfg, emit, self.pads, Dispatcher())

    def tearDown(self):
        self.dir.cleanup()

    def test_platforms_need_a_core_and_the_switch(self):
        self.assertEqual(self.games.platforms(), ["snes"])
        self.cfg["games"]["enabled"] = False
        self.assertEqual(self.games.platforms(), [])

    def test_player_one_is_the_pad_last_used(self):
        joy, names = self.games._players()
        self.assertEqual(joy, [1, 0])                 # event5 is RetroArch's pad 0, event7 its pad 1
        self.assertEqual(names, ["Grön handkontroll", "Rosa handkontroll"])

    def test_config_is_quiet(self):
        self.games.write_config("snes9x")
        root = Path(self.cfg["games"]["dir"])
        cfg = (root / "cfg" / "retroarch.cfg").read_text()
        for line in ('network_cmd_enable = "true"', 'state_slot = "1"', 'video_font_enable = "false"',
                     'menu_enable_widgets = "false"', 'input_exit_emulator = "nul"', 'input_player1_joypad_index = "1"'):
            self.assertIn(line, cfg)
        self.assertTrue(any((root / "autoconfig" / "udev").iterdir()))

    def test_the_state_is_staged_for_auto_load(self):
        g = self.games
        g.game = {"id": 7, "name": "Testspel", "platform": "snes", "path": str(Path(self.dir.name) / "Testspel.smc")}
        auto = g._auto_state().with_name("Testspel.state.auto")
        self.assertFalse(g._stage_state(True))                    # nothing saved yet
        g._auto_state().parent.mkdir(parents=True, exist_ok=True)
        g._auto_state().write_bytes(b"state")
        self.assertTrue(g._stage_state(True))
        self.assertEqual(auto.read_bytes(), b"state")
        self.assertFalse(g._stage_state(False))                   # Starta om: nothing to auto-load
        self.assertFalse(auto.exists())
        g.write_config("snes9x", autoload=True)
        cfg = (Path(self.cfg["games"]["dir"]) / "cfg" / "retroarch.cfg").read_text()
        self.assertIn('savestate_auto_load = "true"', cfg)
        self.assertIn('core_info_savestate_bypass = "true"', cfg)

    def test_dos_bundles_are_repacked_for_dosbox_pure(self):
        import zipfile
        from pioneertv.games import dos_bundle
        src = Path(self.dir.name) / "Game.zip"
        conf = "[cpu]\ncycles=auto\n\n[autoexec]\n@echo off\nmount c GAME\nc:\nimgmount d GAME/cd/game.iso -t iso\ncall GO.BAT\n"
        with zipfile.ZipFile(src, "w") as z:
            z.writestr(".jsdos/dosbox.conf", conf)
            z.writestr("GAME/GO.BAT", "go")
            z.writestr("GAME/cd/game.iso", "iso")
            z.writestr("GAME/dosbox.conf", "[autoexec]\nmount c .\n")   # the game's own, left out
        out = dos_bundle(src)
        self.assertNotEqual(out, src)
        with zipfile.ZipFile(out) as z:
            self.assertEqual(sorted(z.namelist()), ["GO.BAT", "cd/game.iso", "dosbox.conf"])
            text = z.read("dosbox.conf").decode()
        self.assertNotIn("mount c", text.lower())
        self.assertIn("imgmount d cd/game.iso", text)
        self.assertIn("call GO.BAT", text)
        self.assertIn("cycles=auto", text)
        self.assertEqual(dos_bundle(src), out)                    # once
        plain = Path(self.dir.name) / "Plain.zip"
        with zipfile.ZipFile(plain, "w") as z:
            z.writestr("GO.EXE", "x")
        self.assertEqual(dos_bundle(plain), plain)                 # not a bundle: as it is

    def test_cache_drops_the_oldest(self):
        self.cfg["games"]["cache_mb"] = 1
        cache = Path(self.cfg["games"]["dir"]) / "cache"
        for i, age in ((1, 300), (2, 200), (3, 100)):
            g = cache / str(i)
            g.mkdir(parents=True)
            f = g / "rom.bin"
            f.write_bytes(b"x" * 400_000)
            t = os.path.getmtime(f) - age
            os.utime(f, (t, t))
        self.games._make_room(300_000)
        self.assertEqual(sorted(p.name for p in cache.iterdir()), ["3"])

    async def start_fake(self, game_path):
        g = self.games
        g.game = {"id": 7, "name": "Testspel", "platform": "snes", "path": str(game_path)}
        g.write_config("snes9x")
        g.proc = await asyncio.create_subprocess_exec(sys.executable, "-c", FAKE_RA, str(self.cfg["games"]["port"]),
                                                      str(g.screen_path()), str(g._auto_state()))
        await asyncio.sleep(0.3)
        g.state = "running"
        g.pads.shared["games"] = True
        asyncio.create_task(g._watch(g.proc, Path(self.dir.name) / "ra.log"))

    async def test_pause_save_point_and_quit(self):
        g = self.games
        rom = Path(self.dir.name) / "Testspel (U).smc"
        rom.write_bytes(b"rom")
        await self.start_fake(rom)
        await g.pause()
        await asyncio.sleep(0.2)
        self.assertEqual(g.state, "paused")
        self.assertTrue(g.screen_path().is_file())
        self.assertTrue(g._auto_state().is_file())
        self.assertFalse(g.pads.shared["games"])                 # the pads are Chromium's again
        self.assertIn("paused", [e.get("state") for e in self.events])
        self.assertEqual(g.save_point(), (True, ""))
        self.assertIsNotNone(g.status()["point"])
        await g.quit()
        self.assertEqual(g.state, "idle")
        self.assertIsNone(g.game)

    async def test_resume_from_the_point_restores_it(self):
        g = self.games
        rom = Path(self.dir.name) / "Testspel (U).smc"
        rom.write_bytes(b"rom")
        await self.start_fake(rom)
        await g.pause()
        await asyncio.sleep(0.2)
        g.save_point()
        g._auto_state().write_bytes(b"later")
        launched = []

        async def launch(autoload):
            launched.append(autoload)
        g._launch = launch
        ok, _ = await g.resume("point")
        await asyncio.sleep(0.05)
        self.assertTrue(ok)
        self.assertEqual(g._auto_state().read_bytes(), b"state")   # the point, not the later state
        self.assertEqual(launched, [True])
        g.task = None
        ok, _ = await g.resume("none")
        await asyncio.sleep(0.05)
        self.assertEqual(launched, [True, False])



class WaylandSocket(unittest.TestCase):
    def test_finds_the_compositor_socket(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(wayland_socket(d), "wayland-0")          # none yet: labwc's name
            Path(d, "wayland-1.lock").touch()
            s = socket.socket(socket.AF_UNIX)
            s.bind(os.path.join(d, "wayland-1"))
            try:
                self.assertEqual(wayland_socket(d), "wayland-1")
            finally:
                s.close()


if __name__ == "__main__":
    unittest.main()
