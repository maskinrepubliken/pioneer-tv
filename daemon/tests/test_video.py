"""video.py without mpv: the tracks it picks, its command line, and playing
to the end or stopping against a stand-in mpv and a stand-in Jellyfin.
`python -m unittest tests.test_video` from daemon/."""
import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

from aiohttp import web

from pioneertv import config
from pioneertv.video import Video, tracks

SOURCE = {"Id": "src1", "MediaStreams": [
    {"Index": 0, "Type": "Video"},
    {"Index": 1, "Type": "Audio", "Codec": "aac"},
    {"Index": 2, "Type": "Audio", "Codec": "ac3"},
    {"Index": 3, "Type": "Subtitle", "Codec": "subrip"},
    {"Index": 4, "Type": "Subtitle", "Codec": "ass"},
    {"Index": 5, "Type": "Subtitle", "Codec": "subrip", "IsExternal": True},
]}

# Stands in for mpv: opens its IPC socket, says it plays, moves on a little,
# then plays to the end, or quits when told to.
FAKE_MPV = r'''
import json, os, socket, sys, time
args = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
open(os.environ["ARGS_OUT"], "w").write(json.dumps(sys.argv[1:]))
srv = socket.socket(socket.AF_UNIX); srv.bind(args["input-ipc-server"]); srv.listen(1)
conn, _ = srv.accept(); f = conn.makefile("rw")
f.readline(); f.readline()                      # the two observe_property commands
send = lambda m: (f.write(json.dumps(m) + "\n"), f.flush())
send({"event": "playback-restart"})
for t in (12.0, 13.0):
    send({"event": "property-change", "name": "time-pos", "data": t})
if os.environ.get("TO_END"):
    send({"event": "end-file", "reason": "eof"}); sys.exit(0)
for line in f:
    if json.loads(line)["command"] == ["quit"]:
        send({"event": "end-file", "reason": "quit"}); sys.exit(0)
'''


class Dispatcher:
    system_hook = None


class Tracks(unittest.TestCase):
    def test_audio_counted_per_kind(self):
        self.assertEqual(tracks(SOURCE, 2, None).get("aid"), "2")
        self.assertEqual(tracks(SOURCE, 1, None).get("aid"), "1")

    def test_subtitles_inside_and_off(self):
        self.assertEqual(tracks(SOURCE, 1, 4)["sid"], "2")
        self.assertEqual(tracks(SOURCE, 1, -1)["sid"], "no")

    def test_external_subtitle_is_a_file(self):
        t = tracks(SOURCE, 1, 5)
        self.assertEqual(t["sub_file"], (5, "srt"))
        self.assertNotIn("sid", t)

    def test_nothing_asked_nothing_chosen(self):
        self.assertEqual(tracks(SOURCE, None, None), {})


class Base(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.reports = []
        app = web.Application()

        async def item(request):
            if request.headers.get("Authorization", "").find('Token="k3y"') < 0:
                return web.json_response({}, status=401)
            return web.json_response({"Id": request.match_info["id"], "Name": "Fyren", "MediaSources": [SOURCE]})

        async def report(request):
            self.reports.append((request.path, await request.json()))
            return web.Response(status=204)
        app.router.add_get("/Items/{id}", item)
        app.router.add_post("/Sessions/Playing{rest:.*}", report)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        mpv = self.dir / "mpv"
        mpv.write_text(f"#!{sys.executable}\n" + FAKE_MPV)
        mpv.chmod(0o755)
        cfg = config._merge(config.DEFAULTS, {
            "jellyfin": {"url": f"http://127.0.0.1:{port}", "api_key": "k3y"},
            "video": {"dir": str(self.dir / "video"), "mpv": str(mpv), "runtime_dir": str(self.dir),
                      "wayland_display": "wayland-0"},
        })
        self.events = []

        async def emit(msg):
            self.events.append(msg)
        self.video = Video(cfg, emit, Dispatcher())
        os.environ["ARGS_OUT"] = str(self.dir / "args.json")

    async def asyncTearDown(self):
        await self.runner.cleanup()
        os.environ.pop("TO_END", None)
        self.tmp.cleanup()

    async def wait_for(self, state, seconds=5):
        for _ in range(seconds * 20):
            if any(e.get("state") == state for e in self.events):
                return
            await asyncio.sleep(0.05)
        self.fail(f"no {state} event: {self.events}")


class Playing(Base):
    async def test_refuses_odd_ids_and_no_key(self):
        self.assertEqual(await self.video.play("../System/Info"), (False, "okänd video"))
        self.video.cfg["jellyfin"]["api_key"] = ""
        self.assertEqual(await self.video.play("abc"), (False, "no_key"))

    async def test_key_only_in_its_config(self):
        self.video.item = {"id": "abc", "name": "Fyren", "source": SOURCE}
        conf = self.video.write_config()
        self.assertIn("X-Emby-Token: k3y", (conf / "mpv.conf").read_text())
        self.assertEqual(os.stat(conf / "mpv.conf").st_mode & 0o077, 0)
        cmd = " ".join(self.video.command_line(conf, 2, 5))
        self.assertNotIn("k3y", cmd)
        self.assertIn("--aid=2", cmd)
        self.assertIn("/Videos/abc/src1/Subtitles/5/0/Stream.srt", cmd)
        self.assertIn("/Videos/abc/stream?static=true&MediaSourceId=src1", cmd)

    async def test_plays_to_the_end(self):
        os.environ["TO_END"] = "1"
        self.assertEqual(await self.video.play("abc", 42, 1, -1), (True, ""))
        await self.wait_for("ended")
        self.assertEqual([e["state"] for e in self.events], ["running", "ended"])
        paths = [p for p, _ in self.reports]
        self.assertEqual(paths[0], "/Sessions/Playing")
        self.assertEqual(paths[-1], "/Sessions/Playing/Stopped")
        self.assertEqual(self.reports[-1][1]["PositionTicks"], 13 * 10_000_000)
        self.assertIn("--start=42.0", (self.dir / "args.json").read_text())
        self.assertIsNone(self.video.dispatcher.system_hook)
        self.assertEqual(self.video.state, "idle")

    async def test_hold_b_stops(self):
        await self.video.play("abc")
        await self.wait_for("running")
        self.assertTrue(await self.video.dispatcher.system_hook("back"))
        await self.wait_for("stopped")
        self.assertNotIn("ended", [e["state"] for e in self.events])

    async def test_one_at_a_time(self):
        await self.video.play("abc")
        self.assertEqual(await self.video.play("abc"), (False, "en video spelas redan"))
        await self.video.stop()


if __name__ == "__main__":
    unittest.main()
