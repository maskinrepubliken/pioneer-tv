"""The daemon's /immich/ route and /api/bilder against a fake Immich.
Needs aiohttp: `python -m unittest tests.test_server_immich` from daemon/."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from pioneertv import config
from pioneertv.server import Server

A = "4f1c2a9e-1b2c-4d3e-8f90-123456789abc"


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
            if request.path == f"/api/assets/{A}/original":
                return web.Response(body=b"the original")
            if request.path == f"/api/assets/{A}" and request.method == "GET":
                return web.json_response({"id": A, "originalFileName": "IMG_0001.HEIC"})
            if request.path.startswith("/api/assets") and request.method in ("PUT", "DELETE"):
                return web.Response(status=204)
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

    async def test_favourite_and_trash(self):
        r = await self.client.post("/api/bilder/favorite", json={"id": A, "on": True})
        self.assertEqual((await r.json())["ok"], True)
        self.assertEqual(self.heard[-1], ("PUT", f"/api/assets/{A}", {"isFavorite": True}))
        await self.client.post("/api/bilder/trash", json={"id": A})
        self.assertEqual(self.heard[-1], ("DELETE", "/api/assets", {"ids": [A], "force": False}))

    async def test_not_a_photo_goes_to_the_drive_then_the_trash(self):
        # No Drive: nothing is taken away.
        r = await self.client.post("/api/bilder/not_photo", json={"id": A})
        self.assertIn("Google Drive", (await r.json())["message"])
        self.assertNotIn("DELETE", [m for m, _, _ in self.heard])
        # A stand-in rclone: copyto writes where it was told.
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        put = Path(tmp.name) / "put.txt"
        rclone = Path(tmp.name) / "rclone"
        rclone.write_text(f"#!{sys.executable}\nimport sys, shutil\nif sys.argv[3] == 'copyto':\n"
                          f"    open({str(put)!r}, 'w').write(sys.argv[5] + '\\n' + open(sys.argv[4], 'rb').read().decode())\n")
        rclone.chmod(0o755)
        self.cfg["drive"] = {"token": '{"access_token": "x"}', "folder": "Ej foto", "dir": str(Path(tmp.name) / "drive"), "rclone": str(rclone)}
        r = await self.client.post("/api/bilder/not_photo", json={"id": A})
        self.assertEqual((await r.json())["ok"], True)
        self.assertEqual(put.read_text(), "box:Ej foto/IMG_0001.HEIC\nthe original")
        self.assertEqual(self.heard[-1], ("DELETE", "/api/assets", {"ids": [A], "force": False}))
        self.assertIn("scope = drive.file", (Path(tmp.name) / "drive" / "rclone.conf").read_text())

    def test_both_kinds_of_token(self):
        from pioneertv.drive import parse_token
        import base64
        self.assertEqual(parse_token('{"access_token": "a"}'), ('{"access_token": "a"}', {}))
        blob = base64.b64encode(json.dumps({"client_id": "c", "client_secret": "s", "token": '{"access_token": "a"}'}).encode()).decode().rstrip("=")
        self.assertEqual(parse_token(blob), ('{"access_token": "a"}', {"client_id": "c", "client_secret": "s"}))
        with self.assertRaises(ValueError):
            parse_token("nonsense")

    async def test_refused(self):
        self.assertEqual((await self.client.post("/api/bilder/trash", json={"id": "../users"})).status, 400)
        self.assertEqual((await self.client.post("/api/bilder/share", json={"id": A})).status, 404)
        self.cfg["immich"]["api_key"] = "bad"
        r = await self.client.post("/api/bilder/trash", json={"id": A})
        self.assertEqual((await r.json())["message"], "Nyckeln får inte ändra i Immich")


if __name__ == "__main__":
    unittest.main()
