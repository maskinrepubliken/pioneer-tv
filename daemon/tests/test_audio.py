"""audio.py against a stand-in mpv and a stand-in Jellyfin: a queue played
on to the next song and to its end, a song marked played, paused and
stopped, and a radio channel. `python -m unittest tests.test_audio` from daemon/."""
import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

from aiohttp import web

from pioneertv import config
from pioneertv.audio import Audio

# Stands in for mpv: opens its IPC socket and plays what it is given, each
# file a moment long (or for ever, a radio stream), saying so as mpv does.
FAKE_MPV = r'''
import json, os, socket, sys, threading, time
args = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
srv = socket.socket(socket.AF_UNIX); srv.bind(args["input-ipc-server"]); srv.listen(1)
conn, _ = srv.accept(); f = conn.makefile("r")
lock = threading.Lock()
def send(m):
    with lock: conn.sendall((json.dumps(m) + "\n").encode())
playing = [0]
def play(url, n):
    send({"event": "playback-restart"})
    if "radio" in url: return
    for t in (0.0, 0.5):
        time.sleep(0.05)
        if playing[0] != n: return
        send({"event": "property-change", "name": "time-pos", "data": t})
    time.sleep(0.05)
    if playing[0] == n: send({"event": "end-file", "reason": "eof"})
for line in f:
    cmd = json.loads(line).get("command") or []
    if cmd[:1] == ["loadfile"]:
        playing[0] += 1
        open(os.environ["LOADED"], "a").write(cmd[1] + "\n")
        threading.Thread(target=play, args=(cmd[1], playing[0]), daemon=True).start()
    elif cmd[:1] == ["stop"]:
        playing[0] += 1
        send({"event": "end-file", "reason": "stop"})
    elif cmd[:1] == ["quit"]:
        sys.exit(0)
'''


class Playing(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.reports, self.played = [], []
        app = web.Application()

        async def report(request):
            self.reports.append((request.path, (await request.json())["ItemId"]))
            return web.json_response({})

        async def users(_request):
            return web.json_response([{"Id": "u1", "Name": "lyret", "Policy": {"IsAdministrator": True}}])

        async def played(request):
            self.played.append(request.match_info["id"])
            return web.json_response({})
        app.router.add_post("/Sessions/Playing{rest:.*}", report)
        app.router.add_get("/Users", users)
        app.router.add_post("/UserPlayedItems/{id}", played)
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
            "audio": {"dir": str(self.dir / "audio"), "mpv": str(mpv)},
        })
        self.events = []

        async def emit(msg):
            self.events.append(msg)
        self.audio = Audio(cfg, emit)
        os.environ["LOADED"] = str(self.dir / "loaded.txt")

    async def asyncTearDown(self):
        await self.audio.close()
        await self.runner.cleanup()
        self.tmp.cleanup()

    async def until(self, test, what):
        for _ in range(100):
            if test():
                return
            await asyncio.sleep(0.05)
        self.fail(f"{what}: {self.audio.status()}")

    def loaded(self):
        return (self.dir / "loaded.txt").read_text().splitlines()

    async def test_a_queue_plays_to_its_end(self):
        ok, _ = await self.audio.play([{"id": "s1", "name": "Ett"}, {"id": "s2", "name": "Två"}], 0)
        self.assertTrue(ok)
        await self.until(lambda: self.audio.index == 1, "on to the second song")
        await self.until(lambda: self.audio.state == "idle", "the end of the queue")
        urls = self.loaded()
        self.assertEqual(len(urls), 2)
        self.assertIn("/Audio/s1/stream?static=true", urls[0])
        self.assertIn("api_key=k3y", urls[0])                 # the key in the address, given over the socket
        await self.until(lambda: self.played == ["s1", "s2"], "both marked played")
        self.assertIn(("/Sessions/Playing", "s1"), self.reports)
        self.assertEqual(self.events[-1]["state"], "idle")

    async def test_paused_and_stopped(self):
        await self.audio.radio({"channel": "132", "name": "P1", "url": "https://example.org/radio/132.mp3"})
        await self.until(lambda: self.audio.state == "playing", "the radio playing")
        self.assertTrue(self.audio.status()["live"])
        await self.audio.toggle()
        self.assertEqual(self.audio.state, "paused")
        await self.audio.toggle()                             # live: loaded again, at the broadcast
        await self.until(lambda: self.audio.state == "playing", "playing again")
        self.assertEqual(len(self.loaded()), 2)
        self.assertNotIn("k3y", "".join(self.loaded()))       # never the key to someone else's stream
        await self.audio.stop("en film")
        self.assertEqual(self.audio.state, "idle")
        self.assertFalse(self.reports)                        # radio is not Jellyfin's


if __name__ == "__main__":
    unittest.main()
