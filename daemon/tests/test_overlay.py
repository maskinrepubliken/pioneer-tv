"""Who gets the menus and the toasts: the overlay or the page (overlay.py,
and the daemon's WebSocket). Needs aiohttp for the WebSocket part:
`python -m unittest tests.test_overlay` from daemon/."""
import asyncio
import unittest

from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.overlay import Router
from pioneertv.server import Server


class Routing(unittest.TestCase):
    def test_menus_toasts_and_the_screensaver_are_the_overlays(self):
        r = Router()
        for name in ("menu", "toast", "saver", "rest"):
            self.assertEqual(r.target(name), "overlay", name)
        self.assertEqual(r.target("keyboard"), "page")      # Y types into the page
        self.assertEqual(r.target("escape"), "page")

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

    def test_a_pages_toast_goes_on(self):
        r = Router()
        self.assertEqual(r.handle({"type": "toast", "text": "Hej", "icon": "info", "ms": 99999}),
                         [{"type": "event", "name": "toast", "text": "Hej", "icon": "info", "ms": 15000}])
        self.assertEqual(r.handle({"type": "toast", "text": ""}), [])

    def test_relays(self):
        r = Router()
        self.assertEqual(r.handle({"type": "relay", "name": "home"}), [{"type": "event", "name": "home", "target": "page"}])
        self.assertEqual(r.handle({"type": "relay", "name": "reboot"}), [])
        self.assertEqual(r.handle({"type": "relay", "name": "navigate", "url": "https://www.svtplay.se/"}),
                         [{"type": "event", "name": "navigate", "target": "page", "url": "https://www.svtplay.se/"}])
        self.assertEqual(r.handle({"type": "relay", "name": "navigate", "url": "javascript:alert(1)"}), [])
        self.assertEqual(r.handle({"type": "relay", "name": "settings", "section": "wifi"}),
                         [{"type": "event", "name": "settings", "target": "page", "section": "wifi"}])
        # A press on a page opens the overlay's quick menu.
        self.assertEqual(r.handle({"type": "relay", "name": "menu"}),
                         [{"type": "event", "name": "menu", "open": True, "target": "overlay"}])

    def test_a_sites_video(self):
        r = Router()
        [said] = r.handle({"type": "webvideo", "frame": "f1", "top": False, "present": True, "title": "Rapport",
                           "time": 61.5, "duration": 1800, "paused": False, "area": 0.9, "evil": "<script>",
                           "subs": [{"id": 0, "label": "Svenska", "selected": True}, "nonsense"]})
        self.assertEqual((said["name"], said["target"], said["frame"], said["time"], said["duration"]),
                         ("webvideo", "overlay", "f1", 61.5, 1800.0))
        self.assertEqual(said["subs"], [{"id": 0, "label": "Svenska", "selected": True}])
        self.assertNotIn("evil", said)
        # and what its panel asks goes to the page, to that frame
        self.assertEqual(r.handle({"type": "relay", "name": "webvideo", "frame": "f1", "action": "seek", "value": -10}),
                         [{"type": "event", "name": "webvideo", "target": "page", "frame": "f1", "action": "seek", "value": -10}])
        self.assertEqual(r.handle({"type": "relay", "name": "webvideo", "frame": "f1", "action": "eval"}), [])

    def test_tag_leaves_other_events_alone(self):
        r = Router()
        self.assertEqual(r.tag({"type": "event", "name": "gamepad"}), {"type": "event", "name": "gamepad"})
        self.assertEqual(r.tag({"type": "status"}), {"type": "status"})
        self.assertEqual(r.tag({"type": "event", "name": "menu"})["target"], "overlay")


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
        await page.send_json({"type": "toast", "text": "Sparat", "icon": "check"})
        while (event := await self.next_of(overlay, "event"))["name"] != "toast":
            pass
        self.assertEqual(event["text"], "Sparat")
        await overlay.close()
        self.assertFalse((await self.next_of(page, "config"))["overlay"])
        await page.close()


if __name__ == "__main__":
    unittest.main()
