"""The daemon's /immich/ route and /api/bilder against a fake Immich.
Needs aiohttp: `python -m unittest tests.test_server_immich` from daemon/."""
import asyncio
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
K = "5f1c2a9e-1b2c-4d3e-8f90-123456789abc"          # the partner's (Katrin's)
USERS = {"good": "u-lyret", "kat": "u-puffen"}
MINE = "6f1c2a9e-1b2c-4d3e-8f90-123456789abc"       # an album of one's own
THEIRS = "7f1c2a9e-1b2c-4d3e-8f90-123456789abc"     # the partner's, not shared
FACE = "8f1c2a9e-1b2c-4d3e-8f90-123456789abc"


async def nothing(_msg: dict) -> None:
    return None


class Immich(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.heard = []
        self.albums = [{"id": "a1", "albumName": "Fjällen"}]

        async def any_(request: web.Request) -> web.Response:
            who = USERS.get(request.headers.get("x-api-key"))
            if not who:
                return web.json_response({}, status=401)
            if request.path == "/api/users/me":
                return web.json_response({"id": who})
            if request.path == f"/api/assets/{K}" and request.method == "GET":
                return web.json_response({"id": K, "ownerId": "u-puffen", "owner": {"name": "Puffen"}, "originalFileName": "k.jpg"})
            if request.path == f"/api/assets/{K}" and who != "u-puffen":
                return web.json_response({"message": "Not found or no asset.update access"}, status=400)
            owners = {MINE: "u-lyret", THEIRS: "u-puffen"}
            for album, owner in owners.items():
                if request.path == f"/api/albums/{album}" and request.method == "GET":
                    if owner != who:
                        return web.json_response({"message": "Not found or no album.read access"}, status=400)
                    return web.json_response({"id": album, "albumUsers": [{"user": {"id": owner}, "role": "owner"}]})
            if request.path == f"/api/people/{FACE}" and request.method == "GET":
                return web.json_response({"id": FACE, "name": ""})
            body = await request.read()
            self.heard.append((request.method, request.path, json.loads(body) if body else None, who))
            if request.method == "POST" and request.path == "/api/albums":
                return web.json_response({"id": "new-album"}, status=201)
            if request.path.endswith("/assets") and request.path.startswith("/api/albums/"):
                return web.json_response([{"id": i, "success": i != A, **({} if i != A else {"error": "duplicate"})}
                                          for i in json.loads(body)["ids"]])
            if request.method == "GET" and request.path == "/api/albums":
                return web.json_response(self.albums)
            if request.path == f"/api/assets/{A}/original":
                return web.Response(body=b"the original")
            if request.path == f"/api/assets/{A}" and request.method == "GET":
                return web.json_response({"id": A, "ownerId": "u-lyret", "originalFileName": "IMG_0001.HEIC"})
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

    async def until(self, test, seconds=5):
        for _ in range(seconds * 20):
            if test():
                return
            await asyncio.sleep(0.05)
        self.fail("it never came")

    async def asyncTearDown(self):
        await self.client.close()
        await self.upstream.close()

    async def test_the_partners_way_in(self):
        self.assertEqual((await self.client.get("/immich-partner/api/albums")).status, 503)   # no partner key yet
        self.cfg["immich"]["partner_api_key"] = "kat"
        r = await self.client.get("/immich-partner/api/users/me")
        self.assertEqual((await r.json())["id"], "u-puffen")
        self.assertEqual((await self.client.delete("/immich-partner/api/assets")).status, 405)

    async def test_the_proxy_reads_only(self):
        self.assertEqual((await self.client.get("/immich/api/albums")).status, 200)
        self.assertEqual((await self.client.delete("/immich/api/assets")).status, 405)
        self.assertEqual((await self.client.put(f"/immich/api/assets/{A}", json={"isFavorite": True})).status, 405)

    async def test_favourite_and_trash(self):
        r = await self.client.post("/api/bilder/favorite", json={"id": A, "on": True})
        self.assertEqual((await r.json())["ok"], True)
        self.assertEqual(self.heard[-1], ("PUT", f"/api/assets/{A}", {"isFavorite": True}, "u-lyret"))
        await self.client.post("/api/bilder/trash", json={"id": A})
        self.assertEqual(self.heard[-1], ("DELETE", "/api/assets", {"ids": [A], "force": False}, "u-lyret"))

    async def test_not_a_photo_goes_to_the_drive_then_the_trash(self):
        # No Drive: nothing is taken away.
        r = await self.client.post("/api/bilder/not_photo", json={"id": A})
        self.assertIn("Google Drive", (await r.json())["message"])
        self.assertNotIn("DELETE", [h[0] for h in self.heard])
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
        self.assertEqual(await r.json(), {"ok": True, "queued": True})      # in the background
        await self.until(lambda: self.heard and self.heard[-1][0] == "DELETE")
        self.assertEqual(put.read_text(), "box:Ej foto/IMG_0001.HEIC\nthe original")
        self.assertEqual(self.heard[-1], ("DELETE", "/api/assets", {"ids": [A], "force": False}, "u-lyret"))
        self.assertIn("scope = drive.file", (Path(tmp.name) / "drive" / "rclone.conf").read_text())

    async def test_a_move_called_off(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        rclone = Path(tmp.name) / "rclone"
        rclone.write_text(f"#!{sys.executable}\nimport time\ntime.sleep(30)\n")   # an upload that takes its time
        rclone.chmod(0o755)
        self.cfg["drive"] = {"token": '{"access_token": "x"}', "folder": "Ej foto", "dir": str(Path(tmp.name) / "drive"), "rclone": str(rclone)}
        await self.client.post("/api/bilder/not_photo", json={"id": A})
        await asyncio.sleep(0.5)
        await self.client.post("/api/bilder/cancel", json={"id": A})
        await asyncio.sleep(0.3)
        self.assertNotIn("DELETE", [h[0] for h in self.heard])     # still in Immich

    def test_both_kinds_of_token(self):
        from pioneertv.drive import parse_token
        import base64
        self.assertEqual(parse_token('{"access_token": "a"}'), ('{"access_token": "a"}', {}))
        blob = base64.b64encode(json.dumps({"client_id": "c", "client_secret": "s", "token": '{"access_token": "a"}'}).encode()).decode().rstrip("=")
        self.assertEqual(parse_token(blob), ('{"access_token": "a"}', {"client_id": "c", "client_secret": "s"}))
        with self.assertRaises(ValueError):
            parse_token("nonsense")

    async def test_the_partners_own_with_the_partners_key(self):
        r = await self.client.post("/api/bilder/favorite", json={"id": K, "on": True})
        self.assertEqual((await r.json())["message"], "Lägg in Puffens API-nyckel under Inställningar → Tjänster → Immich")
        self.cfg["immich"]["partner_api_key"] = "kat"
        r = await self.client.post("/api/bilder/favorite", json={"id": K, "on": True})
        self.assertEqual((await r.json())["ok"], True)
        self.assertEqual(self.heard[-1], ("PUT", f"/api/assets/{K}", {"isFavorite": True}, "u-puffen"))

    async def test_albums(self):
        post = lambda action, body: self.client.post(f"/api/bilder/{action}", json=body)   # noqa: E731
        r = await (await post("album_new", {"name": "  Sommar  ", "ids": [K, "../x"]})).json()
        self.assertEqual(r, {"ok": True, "id": "new-album"})
        self.assertEqual(self.heard[-1], ("POST", "/api/albums", {"albumName": "Sommar", "assetIds": [K]}, "u-lyret"))
        self.assertEqual((await (await post("album_new", {"name": " "})).json())["message"], "Albumet behöver ett namn")
        await post("album_name", {"album": MINE, "name": "Sommar 2025"})
        self.assertEqual(self.heard[-1], ("PATCH", f"/api/albums/{MINE}", {"albumName": "Sommar 2025"}, "u-lyret"))
        await post("album_cover", {"album": MINE, "id": K})
        self.assertEqual(self.heard[-1], ("PATCH", f"/api/albums/{MINE}", {"albumThumbnailAssetId": K}, "u-lyret"))
        r = await (await post("album_add", {"album": MINE, "ids": [K]})).json()
        self.assertEqual(r, {"ok": True, "done": 1})
        r = await (await post("album_add", {"album": MINE, "ids": [A]})).json()
        self.assertEqual(r["message"], "Redan i albumet")
        await post("album_remove", {"album": MINE, "ids": [K]})
        self.assertEqual(self.heard[-1], ("DELETE", f"/api/albums/{MINE}/assets", {"ids": [K]}, "u-lyret"))
        # The partner's album: with the partner's key, once there is one.
        r = await (await post("album_delete", {"album": THEIRS})).json()
        self.assertEqual(r["ok"], False)
        self.cfg["immich"]["partner_api_key"] = "kat"
        self.assertEqual((await (await post("album_delete", {"album": THEIRS})).json())["ok"], True)
        self.assertEqual(self.heard[-1], ("DELETE", f"/api/albums/{THEIRS}", None, "u-puffen"))
        await post("album_new", {"name": "Hennes", "way": "partner"})
        self.assertEqual(self.heard[-1][3], "u-puffen")

    async def test_people_archive_and_the_trash(self):
        post = lambda action, body: self.client.post(f"/api/bilder/{action}", json=body)   # noqa: E731
        await post("person_name", {"person": FACE, "name": "Mormor"})
        self.assertEqual(self.heard[-1], ("PUT", f"/api/people/{FACE}", {"name": "Mormor"}, "u-lyret"))
        await post("person_hide", {"person": FACE, "on": True})
        self.assertEqual(self.heard[-1], ("PUT", f"/api/people/{FACE}", {"isHidden": True}, "u-lyret"))
        await post("archive", {"id": A, "on": True})
        self.assertEqual(self.heard[-1], ("PUT", f"/api/assets/{A}", {"visibility": "archive"}, "u-lyret"))
        await post("restore", {"id": A})
        self.assertEqual(self.heard[-1], ("POST", "/api/trash/restore/assets", {"ids": [A]}, "u-lyret"))
        await post("trash_empty", {})
        self.assertEqual(self.heard[-1], ("POST", "/api/trash/empty", None, "u-lyret"))
        self.assertEqual((await (await post("trash_restore", {"way": "partner"})).json())["ok"], False)   # no partner key

    async def test_refused(self):
        self.assertEqual((await self.client.post("/api/bilder/trash", json={"id": "../users"})).status, 400)
        self.assertEqual((await self.client.post("/api/bilder/share", json={"id": A})).status, 404)
        self.cfg["immich"]["api_key"] = "bad"
        r = await self.client.post("/api/bilder/trash", json={"id": A})
        self.assertEqual((await r.json())["message"], "Nyckeln får inte ändra i Immich")


if __name__ == "__main__":
    unittest.main()
