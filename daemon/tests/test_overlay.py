"""Who gets the quick menu and the toasts: the overlay or the page (overlay.py,
and the daemon's WebSocket). Needs aiohttp for the WebSocket part:
`python -m unittest tests.test_overlay` from daemon/."""
import asyncio
import unittest

from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.overlay import Router
from pioneertv.server import Server


class Routing(unittest.TestCase):
    def test_without_overlay_everything_is_the_pages(self):
        r = Router()
        for name in ("menu", "keyboard", "escape", "toast"):
            self.assertEqual(r.target(name), "page", name)

    def test_with_overlay(self):
        r = Router()
        r.connected(object())
        self.assertEqual(r.target("menu"), "overlay")
        self.assertEqual(r.target("toast"), "overlay")
        self.assertEqual(r.target("keyboard"), "page")      # Y types into the page

    def test_a_pages_own_menu_keeps_home(self):
        r = Router()
        r.connected(object())
        r.handle({"type": "page_menu", "open": True})
        self.assertEqual(r.target("menu"), "page")

    def test_overlay_menu_open_takes_every_button_and_pauses(self):
        r = Router()
        r.connected(object())
        self.assertEqual(r.handle({"type": "overlay_menu", "open": True}),
                         [{"type": "event", "name": "media", "action": "pause"}])
        for name in ("menu", "keyboard", "escape"):
            self.assertEqual(r.target(name), "overlay", name)
        self.assertEqual(r.handle({"type": "overlay_menu", "open": False}),
                         [{"type": "event", "name": "media", "action": "resume"}])
        self.assertEqual(r.handle({"type": "overlay_menu", "open": False}), [])   # no second resume

    def test_relays(self):
        r = Router()
        r.page_open = True
        self.assertEqual(r.handle({"type": "relay", "name": "home"}), [{"type": "event", "name": "home", "target": "page"}])
        self.assertFalse(r.page_open)
        self.assertEqual(r.handle({"type": "relay", "name": "reboot"}), [])

    def test_tag_leaves_other_events_alone(self):
        r = Router()
        self.assertEqual(r.tag({"type": "event", "name": "gamepad"}), {"type": "event", "name": "gamepad"})
        self.assertEqual(r.tag({"type": "status"}), {"type": "status"})
        self.assertEqual(r.tag({"type": "event", "name": "menu"})["target"], "page")


async def nothing(_msg: dict) -> None:
    return None


class OverlaySocket(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.server = Server(config._merge(config.DEFAULTS, {}), nothing, hooks={})
        self.client = TestClient(TestServer(self.server.app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def next_of(self, ws, kind):
        while True:
            msg = await asyncio.wait_for(ws.receive_json(), 3)
            if msg.get("type") == kind:
                return msg

    async def test_overlay_announced_and_menu_routed(self):
        page = await self.client.ws_connect("/ws")
        self.assertFalse((await self.next_of(page, "config"))["overlay"])
        overlay = await self.client.ws_connect("/ws")
        await self.next_of(overlay, "config")
        await overlay.send_json({"type": "hello", "client": "overlay"})
        self.assertTrue((await self.next_of(page, "config"))["overlay"])
        await self.server.broadcast({"type": "event", "name": "menu"})
        self.assertEqual((await self.next_of(page, "event"))["target"], "overlay")
        await overlay.send_json({"type": "overlay_menu", "open": True})
        self.assertEqual(await self.next_of(page, "event"), {"type": "event", "name": "media", "action": "pause"})
        await overlay.close()
        self.assertFalse((await self.next_of(page, "config"))["overlay"])
        await page.close()


if __name__ == "__main__":
    unittest.main()
