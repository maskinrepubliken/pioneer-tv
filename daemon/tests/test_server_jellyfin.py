"""The daemon's /jellyfin/ route and /api/jellyfin against a fake Jellyfin.
Needs aiohttp: `python -m unittest tests.test_server_jellyfin` from daemon/."""
import json
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.server import Server

USERS = [
    {"Id": "u-guest", "Name": "Gäst", "Policy": {"IsAdministrator": False}},
    {"Id": "u-admin", "Name": "Viktor", "Policy": {"IsAdministrator": True}},
]


async def echo(request: web.Request) -> web.Response:
    auth = request.headers.get("Authorization", "")
    if 'Token="good"' not in auth:
        return web.json_response({}, status=401)
    if request.path == "/Users":
        return web.json_response(USERS)
    if request.path.startswith("/Audio/"):
        # A song: Range must reach Jellyfin so seeking works.
        return web.Response(body=b"0123456789", status=206 if request.headers.get("Range") else 200,
                            headers={"Content-Type": "audio/mpeg", "Accept-Ranges": "bytes"})
    body = await request.read()
    return web.json_response({"method": request.method, "path": request.path, "query": request.query_string,
                              "body_len": len(body)})


async def nothing(_msg: dict) -> None:
    return None


class JellyfinProxy(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        upstream = web.Application()
        upstream.router.add_route("*", "/{tail:.*}", echo)
        self.upstream = TestServer(upstream)
        await self.upstream.start_server()
        self.cfg = config._merge(config.DEFAULTS, {"jellyfin": {"url": str(self.upstream.make_url("")), "api_key": "good"}})
        self.client = TestClient(TestServer(Server(self.cfg, nothing, hooks={}).app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        await self.upstream.close()

    async def test_read_forwarded_with_key(self):
        resp = await self.client.get("/jellyfin/Items?ParentId=7")
        self.assertEqual(resp.status, 200)
        data = await resp.json()
        self.assertEqual((data["path"], data["query"]), ("/Items", "ParentId=7"))

    async def test_audio_range_passed_through(self):
        resp = await self.client.get("/jellyfin/Audio/a1/universal", headers={"Range": "bytes=2-"})
        self.assertEqual(resp.status, 206)
        self.assertEqual(resp.headers.get("Accept-Ranges"), "bytes")
        self.assertEqual(await resp.read(), b"0123456789")

    async def test_report_posted(self):
        resp = await self.client.post("/jellyfin/Sessions/Playing", data=b'{"ItemId":"a1"}',
                                      headers={"Content-Type": "application/json"})
        data = await resp.json()
        self.assertEqual((data["method"], data["body_len"]), ("POST", 15))

    async def test_other_paths_and_writes_refused(self):
        self.assertEqual((await self.client.get("/jellyfin/System/Info")).status, 404)
        self.assertEqual((await self.client.post("/jellyfin/Items/a1", data=b"{}")).status, 404)
        self.assertEqual((await self.client.request("DELETE", "/jellyfin/Items/a1")).status, 405)

    async def test_cross_site_refused(self):
        resp = await self.client.get("/jellyfin/Items", headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(resp.status, 403)

    async def test_no_key(self):
        self.cfg["jellyfin"]["api_key"] = ""
        resp = await self.client.get("/jellyfin/Items")
        self.assertEqual((resp.status, json.loads(await resp.text())), (503, {"error": "no_key"}))
        self.assertEqual(await (await self.client.get("/api/jellyfin")).json(), {"ok": False, "error": "no_key"})

    async def test_user_first_admin(self):
        data = await (await self.client.get("/api/jellyfin")).json()
        self.assertEqual(data, {"ok": True, "user_id": "u-admin", "user": "Viktor"})

    async def test_user_named(self):
        self.cfg["jellyfin"]["user"] = "gäst"
        data = await (await self.client.get("/api/jellyfin")).json()
        self.assertEqual(data["user_id"], "u-guest")

    async def test_user_unknown(self):
        self.cfg["jellyfin"]["user"] = "nobody"
        self.assertEqual((await (await self.client.get("/api/jellyfin")).json())["error"], "no_user")

    async def test_bad_key(self):
        self.cfg["jellyfin"]["api_key"] = "bad"
        self.assertEqual((await (await self.client.get("/api/jellyfin")).json())["error"], "auth")


if __name__ == "__main__":
    unittest.main()
