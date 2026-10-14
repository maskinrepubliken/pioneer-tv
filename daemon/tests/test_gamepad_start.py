"""Pads already on when the daemon starts are not new connections (they must
not wake the TV), and a pad's name and colours follow the config live.
`python -m unittest tests.test_gamepad_start` from daemon/ (needs evdev)."""
import asyncio
import unittest
from unittest import mock

from pioneertv import config, gamepad


class FakeDev:
    def __init__(self, path):
        self.path, self.name, self.phys = path, "8BitDo Ultimate 2C Wireless Controller", "usb-x-1.2/input0"
        self.info = mock.Mock(vendor=0x2dc8, product=0x310a)

    def capabilities(self):
        return {gamepad.e.EV_KEY: [gamepad.e.BTN_SOUTH], gamepad.e.EV_ABS: []}

    async def async_read_loop(self):
        await asyncio.Event().wait()
        yield

    def close(self):
        pass


class FirstScan(unittest.IsolatedAsyncioTestCase):
    async def test_pads_at_start_are_marked(self):
        seen = []

        async def on_change(connected, name, label=None, at_start=False):
            seen.append((name if not label else label, at_start))

        cfg = config._merge(config.DEFAULTS, {"pads": {"S1": {"name": "Rosa handkontroll", "accent": "#E09F96"}}})
        mgr = gamepad.GamepadManager(cfg, mock.Mock(), mock.Mock(), on_change)
        devices = ["/dev/input/event5"]
        with mock.patch.object(gamepad.evdev, "list_devices", lambda: list(devices)), \
             mock.patch.object(gamepad.evdev, "InputDevice", FakeDev), \
             mock.patch.object(gamepad, "usb_serial", lambda dev: "S1" if dev.path.endswith("5") else ""):
            await mgr.scan()
            devices.append("/dev/input/event9")
            await mgr.scan()
        self.assertEqual(seen, [("Rosa handkontroll", True), ("8BitDo Ultimate 2C Wireless Controller", False)])

        pad = mgr.instances["/dev/input/event5"]
        cfg["pads"]["S1"] = {"name": "Grön handkontroll", "accent": "#C3D9CE"}
        self.assertEqual((pad.label, pad.colors), ("Grön handkontroll", {"accent": "#C3D9CE"}))
        for task in mgr.active.values():
            task.cancel()


if __name__ == "__main__":
    unittest.main()
