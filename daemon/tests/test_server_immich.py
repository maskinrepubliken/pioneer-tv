"""The daemon's /immich/ route and /api/bilder against a fake Immich.
Needs aiohttp: `python -m unittest tests.test_server_immich` from daemon/."""
import json
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.server import Server

A = "4f1c2a9e-1b2c-4d3e-8f90-123456789abc"
OUTBOX = "0f1c2a9e-1b2c-4d3e-8f90-123456789abc"


async def nothing(_msg: dict) -> None:
    return None


class Immich(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.heard = []
        self.albums = [{"id": "a1", "albumName": "Fjällen"}]

        async def any_(request: web.Request) -> web.Response:
            if request.headers.get("x-api-key") != "good":
                return web.json_response({}, status=401)
            body = await request.read()
            self.heard.append((request.method, request.path, json.loads(body) if body else None))
            if request.method == "GET" and request.path == "/api/albums":
                return web.json_response(self.albums)
            if request.method == "POST" and request.path == "/api/albums":
                return web.json_response({"id": OUTBOX}, status=201)
            if request.path.startswith("/api/assets") and request.method in ("PUT", "DELETE"):
                return web.Response(status=204)
            if request.path.endswith("/assets") and request.method == "PUT":
                return web.json_response([{"id": A, "success": True}])
            return web.json_response({"path": request.path})
        upstream = web.Application()
        upstream.router.add_route("*", "/{tail:.*}", any_)
        self.upstream = TestServer(upstream)
        await self.upstream.start_server()
        self.cfg = config._merge(config.DEFAULTS, {"immich": {"url": str(self.upstream.make_url("")), "api_key": "good"}})
        self.client = TestClient(TestServer(Server(self.cfg, nothing, hooks={}).app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        await self.upstream.close()

    async def test_the_proxy_reads_only(self):
        self.assertEqual((await self.client.get("/immich/api/albums")).status, 200)
        self.assertEqual((await self.client.delete("/immich/api/assets")).status, 405)
        self.assertEqual((await self.client.put(f"/immich/api/assets/{A}", json={"isFavorite": True})).status, 405)

    async def test_favourite_trash_and_not_a_photo(self):
        r = await self.client.post("/api/bilder/favorite", json={"id": A, "on": True})
        self.assertEqual((await r.json())["ok"], True)
        self.assertEqual(self.heard[-1], ("PUT", f"/api/assets/{A}", {"isFavorite": True}))
        await self.client.post("/api/bilder/trash", json={"id": A})
        self.assertEqual(self.heard[-1], ("DELETE", "/api/assets", {"ids": [A], "force": False}))
        # No Utkorg yet: made, with it in it; then there is one, and it goes in.
        await self.client.post("/api/bilder/not_photo", json={"id": A})
        self.assertEqual(self.heard[-1], ("POST", "/api/albums", {"albumName": "Utkorg", "assetIds": [A]}))
        self.albums.append({"id": OUTBOX, "albumName": "utkorg"})
        await self.client.post("/api/bilder/not_photo", json={"id": A})
        self.assertEqual(self.heard[-1], ("PUT", f"/api/albums/{OUTBOX}/assets", {"ids": [A]}))

    async def test_refused(self):
        self.assertEqual((await self.client.post("/api/bilder/trash", json={"id": "../users"})).status, 400)
        self.assertEqual((await self.client.post("/api/bilder/share", json={"id": A})).status, 404)
        self.cfg["immich"]["api_key"] = "bad"
        r = await self.client.post("/api/bilder/trash", json={"id": A})
        self.assertEqual((await r.json())["message"], "Nyckeln får inte ändra i Immich")


if __name__ == "__main__":
    unittest.main()
