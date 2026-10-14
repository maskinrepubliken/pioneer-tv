"""The daemon's /romm/ route against a fake RomM. Needs aiohttp:
`python -m unittest tests.test_server_romm` from daemon/."""
import gzip
import json
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.server import Server


GZ_BODY = json.dumps({"items": list(range(2000))}).encode()


async def echo(request: web.Request) -> web.Response:
    if request.path == "/api/denied":
        return web.json_response({"detail": "nope"}, status=401)
    if request.path == "/api/gzipped":
        packed = gzip.compress(GZ_BODY)
        return web.Response(body=packed, headers={"Content-Encoding": "gzip", "Content-Type": "application/json",
                                                  "Content-Length": str(len(packed))})
    body = await request.read()
    return web.json_response({
        "method": request.method, "path": request.path, "query": request.query_string,
        "auth": request.headers.get("Authorization"), "body_len": len(body),
    })


async def nothing(_msg: dict) -> None:
    return None


class RommProxy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        upstream = web.Application(client_max_size=64 * 1024 * 1024)   # RomM takes large states
        upstream.router.add_route("*", "/{tail:.*}", echo)
        self.upstream = TestServer(upstream)
        await self.upstream.start_server()
        self.cfg = config._merge(config.DEFAULTS, {"romm": {"url": str(self.upstream.make_url("")), "api_key": "k1"}})
        self.client = TestClient(TestServer(Server(self.cfg, nothing, hooks={}).app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        await self.upstream.close()

    async def test_get_forwarded_with_key(self):
        resp = await self.client.get("/romm/api/roms?limit=2")
        self.assertEqual(resp.status, 200)
        data = await resp.json()
        self.assertEqual((data["path"], data["query"], data["auth"]), ("/api/roms", "limit=2", "Bearer k1"))

    async def test_post_body_forwarded(self):
        resp = await self.client.post("/romm/api/states?rom_id=3", data=b"abc")
        data = await resp.json()
        self.assertEqual((data["method"], data["body_len"]), ("POST", 3))

    async def test_other_paths_refused(self):
        resp = await self.client.get("/romm/login")
        self.assertEqual(resp.status, 404)

    async def test_no_key(self):
        self.cfg["romm"]["api_key"] = ""
        resp = await self.client.get("/romm/api/x")
        self.assertEqual(resp.status, 503)
        self.assertEqual(json.loads(await resp.text()), {"error": "no_key"})

    async def test_upstream_status_passed_through(self):
        resp = await self.client.get("/romm/api/denied")
        self.assertEqual(resp.status, 401)

    async def test_large_body_forwarded(self):
        # An N64 state is about 16 MB; aiohttp's default limit is 1 MiB.
        resp = await self.client.post("/romm/api/states?rom_id=3", data=b"x" * (3 * 1024 * 1024))
        self.assertEqual(resp.status, 200)
        self.assertEqual((await resp.json())["body_len"], 3 * 1024 * 1024)

    async def test_gzip_passed_through_intact(self):
        resp = await self.client.get("/romm/api/gzipped")
        self.assertEqual(await resp.json(), json.loads(GZ_BODY))

    async def test_null_origin_refused(self):
        resp = await self.client.post("/romm/api/roms/delete", data=b"{}", headers={"Origin": "null"})
        self.assertEqual(resp.status, 403)

    async def test_cross_site_fetch_refused(self):
        for method in ("GET", "POST"):
            resp = await self.client.request(method, "/romm/api/roms", headers={"Sec-Fetch-Site": "cross-site"})
            self.assertEqual(resp.status, 403, method)

    async def test_same_origin_fetch_allowed(self):
        resp = await self.client.get("/romm/api/roms", headers={"Sec-Fetch-Site": "same-origin"})
        self.assertEqual(resp.status, 200)

    async def test_other_methods_refused(self):
        resp = await self.client.request("OPTIONS", "/romm/api/roms")
        self.assertEqual(resp.status, 405)

    async def test_player_page_cross_origin_isolated(self):
        # DOSBox Pure runs in threads, which need SharedArrayBuffer.
        resp = await self.client.get("/ext/launcher/spela.html")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.headers.get("Cross-Origin-Opener-Policy"), "same-origin")
        self.assertEqual(resp.headers.get("Cross-Origin-Embedder-Policy"), "credentialless")

    async def test_other_pages_not_isolated(self):
        resp = await self.client.get("/ext/launcher/spel.html")
        self.assertEqual(resp.status, 200)
        self.assertNotIn("Cross-Origin-Embedder-Policy", resp.headers)


if __name__ == "__main__":
    unittest.main()
