"""Pictures kept on the disk (imagecache.py), fetched and made small
(covers.py), by the proxies (server.py) and at night. Needs aiohttp (and
Pillow for the making small): `python -m unittest tests.test_imagecache`
from daemon/."""
import io
import os
import tempfile
import time
import unittest
from pathlib import Path

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config, covers, imagecache
from pioneertv.server import Server

try:
    from PIL import Image
except ImportError:
    Image = None

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 1000


def big_png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (1200, 1600), (120, 60, 30)).save(out, "PNG")
    return out.getvalue()


class Wanted(unittest.TestCase):
    def test_covers_and_posters(self):
        self.assertTrue(imagecache.wanted("romm", "GET", "assets/romm/resources/roms/4/289/cover/small.png", {}))
        self.assertTrue(imagecache.wanted("jellyfin", "GET", "Items/abc/Images/Primary", {}))
        self.assertFalse(imagecache.wanted("romm", "GET", "api/roms", {}))
        self.assertFalse(imagecache.wanted("romm", "GET", "assets/emulatorjs/loader.js", {}))
        self.assertFalse(imagecache.wanted("jellyfin", "GET", "Audio/abc/universal", {}))
        self.assertFalse(imagecache.wanted("romm", "POST", "assets/romm/resources/a.png", {}))
        self.assertFalse(imagecache.wanted("jellyfin", "GET", "Items/abc/Images/Primary", {"Range": "bytes=0-"}))


class Keys(unittest.TestCase):
    def test_one_picture_whatever_size(self):
        a = imagecache.key("jellyfin", "Items/ab/Images/Primary", "fillHeight=600&fillWidth=600&quality=90&tag=t1")
        b = imagecache.key("jellyfin", "items/ab/images/primary", "fillWidth=120&tag=t1")
        c = imagecache.key("jellyfin", "Items/ab/Images/Primary", "tag=t2")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)

    def test_romm_spelt_either_way(self):
        self.assertEqual(imagecache.key("romm", "assets/a.png", "ts=2026-09-21%2007:01:51"),
                         imagecache.key("romm", "assets/a.png", "ts=2026-09-21 07:01:51"))


@unittest.skipIf(Image is None, "Pillow is not installed")
class Shrink(unittest.TestCase):
    def test_made_small_as_webp(self):
        body, kind = covers.shrink(big_png(), "image/png", 600)
        self.assertEqual(kind, "image/webp")
        with Image.open(io.BytesIO(body)) as img:
            self.assertEqual(img.size, (450, 600))

    def test_not_a_picture_kept_as_it_came(self):
        self.assertEqual(covers.shrink(b"nope", "image/png", 600), (b"nope", "image/png"))


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

        self.queries = []

        async def cover(request: web.Request) -> web.Response:
            self.asked += 1
            self.queries.append(request.query_string)
            if request.path.endswith("missing.png"):
                return web.Response(status=404, text="no")
            return web.Response(body=PNG, content_type="image/png")

        async def roms(request: web.Request) -> web.Response:
            offset = int(request.query.get("offset", 0))
            items = [{"id": i, "path_cover_small": f"/assets/romm/resources/roms/1/{i}/cover/small.png?ts=2026-09-21 07:01:51",
                      "path_cover_large": None} for i in range(offset, min(offset + 200, 250))]
            return web.json_response({"items": items, "total": 250})

        async def users(_request: web.Request) -> web.Response:
            return web.json_response([{"Id": "u1", "Name": "viktor", "Policy": {"IsAdministrator": True}}])

        async def items(request: web.Request) -> web.Response:
            if int(request.query.get("StartIndex", 0)):
                return web.json_response({"Items": [], "TotalRecordCount": 2})
            return web.json_response({"Items": [{"Id": "a1", "ImageTags": {"Primary": "t1"}},
                                                {"Id": "m1", "ImageTags": {"Primary": "t2"}, "BackdropImageTags": ["b1"]}],
                                      "TotalRecordCount": 2})

        upstream = web.Application()
        upstream.router.add_get("/api/roms", roms)
        upstream.router.add_get("/Users", users)
        upstream.router.add_get("/Users/u1/Items", items)
        upstream.router.add_get("/Artists", lambda r: web.json_response({"Items": [], "TotalRecordCount": 0}))
        upstream.router.add_route("*", "/{tail:.*}", cover)
        self.upstream = TestServer(upstream)
        await self.upstream.start_server()
        self.dir = tempfile.TemporaryDirectory()
        self.cfg = config._merge(config.DEFAULTS, {
            "romm": {"url": str(self.upstream.make_url("")), "api_key": "k1"},
            "jellyfin": {"url": str(self.upstream.make_url("")), "api_key": "k2"},
            "images": {"dir": self.dir.name, "cache_mb": 10},
        })
        self.server = Server(self.cfg, nothing, hooks={})
        self.server.covers.pause = 0
        self.client = TestClient(TestServer(self.server.app))
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

    async def test_jellyfin_asked_once_at_the_size_kept(self):
        for size in (600, 120, 280):
            resp = await self.client.get(f"/jellyfin/Items/ab/Images/Primary?fillHeight={size}&fillWidth={size}&quality=90&tag=t1")
            self.assertEqual(resp.status, 200)
        self.assertEqual(self.asked, 1)
        self.assertIn("maxWidth=600", self.queries[0])

    async def test_the_night_fetches_every_cover_once(self):
        first = await self.server.covers.prefetch()
        self.assertEqual((first["new"], first["failed"]), (250 + 3, 0))     # 250 games; two pictures and a backdrop
        again = await self.server.covers.prefetch()
        self.assertEqual((again["new"], again["had"]), (0, 253))
        # and a page asking for one of them then needs nothing from RomM
        asked = self.asked
        resp = await self.client.get("/romm/assets/romm/resources/roms/1/7/cover/small.png?ts=2026-09-21%2007:01:51")
        self.assertEqual((resp.status, self.asked), (200, asked))

    async def test_a_miss_is_not_kept(self):
        for _ in range(2):
            resp = await self.client.get("/romm/assets/romm/resources/roms/4/1/cover/missing.png")
            self.assertEqual(resp.status, 404)
        self.assertEqual(self.asked, 2)
