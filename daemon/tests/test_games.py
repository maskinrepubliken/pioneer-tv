"""games.py without RetroArch: the consoles it offers, the config it writes,
the cache, players, the pad's letters, and holding a game where it is
against a stand-in RetroArch.
`python -m unittest tests.test_games` from daemon/."""
import asyncio
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path

from pioneertv import config
from pioneertv.games import Games, autoconfig, wayland_socket


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
heard = sys.argv[4] if len(sys.argv) > 4 else None
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.bind(("127.0.0.1", port))
while True:
    msg = s.recv(64).decode()
    if heard:
        with open(heard, "a") as f:
            f.write(msg + "\n")
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

    def test_platforms_need_a_core(self):
        self.assertEqual(self.games.platforms(), ["snes"])

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
        self.heard = Path(self.dir.name) / "heard.txt"
        g.game = {"id": 7, "name": "Testspel", "platform": "snes", "path": str(game_path)}
        g.write_config("snes9x")
        g.proc = await asyncio.create_subprocess_exec(sys.executable, "-c", FAKE_RA, str(self.cfg["games"]["port"]),
                                                      str(Path(self.dir.name) / "shot.png"), str(g._auto_state()), str(self.heard))
        await asyncio.sleep(0.3)
        g.state = "running"
        g.pads.shared["games"] = True
        asyncio.create_task(g._watch(g.proc, Path(self.dir.name) / "ra.log"))

    async def test_home_holds_the_game(self):
        g = self.games
        g.dispatcher.system_hook = g.on_system
        rom = Path(self.dir.name) / "Testspel (U).smc"
        rom.write_bytes(b"rom")
        await self.start_fake(rom)
        heard = lambda: self.heard.read_text().split() if self.heard.is_file() else []
        await g.on_system("menu")
        await asyncio.sleep(0.2)
        self.assertEqual(g.state, "held")
        self.assertEqual(heard(), ["PAUSE_TOGGLE"])              # no picture, no quitting
        self.assertFalse(g.pads.shared["games"])                 # the pads drive the panel
        held = [e for e in self.events if e.get("state") == "held"][0]
        self.assertEqual(held["name"], "games")
        self.assertEqual(held["title"], "Testspel")
        self.assertEqual(await g.save_point(), (True, ""))       # SAVE_STATE, and it becomes the point
        self.assertTrue(g._point_path().is_file())
        self.assertEqual(await g.resume("point"), (True, ""))
        self.assertEqual(g.state, "running")
        self.assertTrue(g.pads.shared["games"])
        await asyncio.sleep(0.1)                                 # the stand-in hears it
        self.assertEqual(heard()[-2:], ["LOAD_STATE", "PAUSE_TOGGLE"])
        await g.on_system("menu")
        await asyncio.sleep(0.1)
        await g.on_system("menu")                                # Home again: carry on
        await asyncio.sleep(0.1)
        self.assertEqual(g.state, "running")
        await g.on_system("menu")
        await asyncio.sleep(0.1)
        self.assertEqual(await g.resume("none"), (True, ""))
        await asyncio.sleep(0.1)                                 # the stand-in hears it
        self.assertEqual(heard()[-2:], ["RESET", "PAUSE_TOGGLE"])
        await g.on_system("menu")
        await asyncio.sleep(0.1)
        await g.on_system("back")                                # hold B on the panel: Avsluta
        for _ in range(50):
            if g.state == "idle":
                break
            await asyncio.sleep(0.05)
        self.assertEqual(g.state, "idle")
        self.assertIn("SAVE_STATE", heard())
        self.assertIn("exited", [e.get("state") for e in self.events])


class PadLetters(unittest.TestCase):
    """The button marked A plays the console's A: the 8BitDo's A is button 0,
    B 1, X 2, Y 3."""
    def bindings(self, platform):
        text = autoconfig("8BitDo Ultimate 2C Wireless Controller", platform)
        return {k.split("_")[1]: v.strip('" ') for k, v in (l.split("=") for l in text.splitlines()
                                                          if l.startswith("input_") and l.split("_")[1] in "abxy" and l.endswith('"') and "_btn" in l)}

    def test_snes_and_nes_by_name(self):
        for platform in ("snes", "nes", None):
            self.assertEqual(self.bindings(platform), {"a": "0", "b": "1", "x": "2", "y": "3"})

    def test_n64_a_and_b(self):
        b = self.bindings("n64")
        self.assertEqual((b["b"], b["y"]), ("0", "1"))          # the core's A is RetroPad B, its B RetroPad Y

    def test_mega_drive_a_b_and_c(self):
        b = self.bindings("genesis")
        self.assertEqual((b["y"], b["b"], b["a"]), ("0", "1", "2"))   # A, B, and C on X


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
