"""The daemon's /romm/ route against a fake RomM. Needs aiohttp:
`python -m unittest tests.test_server_romm` from daemon/."""
import json
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.server import Server


async def echo(request: web.Request) -> web.Response:
    if request.path == "/api/denied":
        return web.json_response({"detail": "nope"}, status=401)
    body = await request.read()
    return web.json_response({
        "method": request.method, "path": request.path, "query": request.query_string,
        "auth": request.headers.get("Authorization"), "body_len": len(body),
    })


async def nothing(_msg: dict) -> None:
    return None


class RommProxy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        upstream = web.Application()
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


if __name__ == "__main__":
    unittest.main()
