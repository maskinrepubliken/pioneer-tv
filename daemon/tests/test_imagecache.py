"""Pictures kept on the disk (imagecache.py), and the proxies keeping them
(server.py). Needs aiohttp for the second: `python -m unittest
tests.test_imagecache` from daemon/."""
import os
import tempfile
import time
import unittest
from pathlib import Path

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config, imagecache
from pioneertv.server import Server

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 1000


class Wanted(unittest.TestCase):
    def test_covers_and_posters(self):
        self.assertTrue(imagecache.wanted("romm", "GET", "assets/romm/resources/roms/4/289/cover/small.png", {}))
        self.assertTrue(imagecache.wanted("jellyfin", "GET", "Items/abc/Images/Primary", {}))
        self.assertFalse(imagecache.wanted("romm", "GET", "api/roms", {}))
        self.assertFalse(imagecache.wanted("romm", "GET", "assets/emulatorjs/loader.js", {}))
        self.assertFalse(imagecache.wanted("jellyfin", "GET", "Audio/abc/universal", {}))
        self.assertFalse(imagecache.wanted("romm", "POST", "assets/romm/resources/a.png", {}))
        self.assertFalse(imagecache.wanted("jellyfin", "GET", "Items/abc/Images/Primary", {"Range": "bytes=0-"}))


class Cache(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cache = imagecache.ImageCache(Path(self.dir.name), 3000)

    def tearDown(self):
        self.dir.cleanup()

    def test_kept_and_found(self):
        k = imagecache.key("romm", "assets/a.png", "ts=1")
        self.assertIsNone(self.cache.get(k))
        self.assertTrue(self.cache.put(k, PNG, "image/png"))
        path, kind = self.cache.get(k)
        self.assertEqual((path.read_bytes(), kind), (PNG, "image/png"))
        self.assertNotEqual(k, imagecache.key("romm", "assets/a.png", "ts=2"))   # a new version, a new picture

    def test_not_a_picture_not_kept(self):
        self.assertFalse(self.cache.put("ab" * 32, b"<html>", "text/html"))

    def test_past_the_limit_the_oldest_go(self):
        keys = [imagecache.key("romm", f"assets/{i}.png", "") for i in range(4)]
        for i, k in enumerate(keys):
            self.cache.put(k, PNG, "image/png")
            path, _ = self.cache.get(k)
            os.utime(path, (time.time() - 100 + i, time.time() - 100 + i))   # in that order
        self.assertLessEqual(self.cache.size(), 3000)
        self.assertIsNone(self.cache.get(keys[0]))
        self.assertIsNotNone(self.cache.get(keys[-1]))


async def nothing(_msg: dict) -> None:
    return None


class Proxy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.asked = 0

        async def cover(request: web.Request) -> web.Response:
            self.asked += 1
            if request.path.endswith("missing.png"):
                return web.Response(status=404, text="no")
            return web.Response(body=PNG, content_type="image/png")

        upstream = web.Application()
        upstream.router.add_route("*", "/{tail:.*}", cover)
        self.upstream = TestServer(upstream)
        await self.upstream.start_server()
        self.dir = tempfile.TemporaryDirectory()
        self.cfg = config._merge(config.DEFAULTS, {
            "romm": {"url": str(self.upstream.make_url("")), "api_key": "k1"},
            "images": {"dir": self.dir.name, "cache_mb": 10},
        })
        self.client = TestClient(TestServer(Server(self.cfg, nothing, hooks={}).app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        await self.upstream.close()
        self.dir.cleanup()

    async def test_asked_once(self):
        for _ in range(3):
            resp = await self.client.get("/romm/assets/romm/resources/roms/4/289/cover/small.png?ts=1")
            self.assertEqual((resp.status, await resp.read(), resp.headers["Content-Type"]), (200, PNG, "image/png"))
        self.assertEqual(self.asked, 1)
        stats = await (await self.client.get("/api/images")).json()
        self.assertEqual((stats["enabled"], stats["files"]), (True, 1))

    async def test_a_miss_is_not_kept(self):
        for _ in range(2):
            resp = await self.client.get("/romm/assets/romm/resources/roms/4/1/cover/missing.png")
            self.assertEqual(resp.status, 404)
        self.assertEqual(self.asked, 2)
