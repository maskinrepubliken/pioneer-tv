"""audio.py against a stand-in mpv and a stand-in Jellyfin: a queue played
on to the next song and to its end, a song marked played, paused and
stopped. `python -m unittest tests.test_audio` from daemon/."""
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
# file a moment long (or for ever, one whose id says "long"), saying so as mpv does.
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
    if "long" in url: return
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
        await self.audio.play([{"id": "long1", "name": "Lång"}], 0)
        await self.until(lambda: self.audio.state == "playing", "the song playing")
        await self.audio.toggle()
        self.assertEqual(self.audio.state, "paused")
        await self.audio.toggle()
        self.assertEqual(self.audio.state, "playing")
        await self.audio.stop("en film")
        self.assertEqual(self.audio.state, "idle")
        self.assertIn(("/Sessions/Playing/Stopped", "long1"), self.reports)


    async def test_shuffle_and_back_in_order(self):
        songs = [{"id": f"long{i}", "name": str(i)} for i in range(8)]
        await self.audio.play(songs, 2)
        await self.until(lambda: self.audio.state == "playing", "the song playing")
        await self.audio.toggle_shuffle()
        self.assertTrue(self.audio.status()["shuffle"])
        self.assertEqual((self.audio.index, self.audio.item()["id"]), (0, "long2"))   # it plays on, first now
        self.assertEqual(sorted(s["id"] for s in self.audio.queue), sorted(s["id"] for s in songs))
        await self.audio.toggle_shuffle()
        self.assertEqual([s["id"] for s in self.audio.queue], [s["id"] for s in songs])
        self.assertEqual(self.audio.index, 2)
        self.assertEqual(len(self.audio.status()["next"]), 5)                       # every song after it
        await self.audio.stop()

    async def test_repeat_goes_round(self):
        self.assertEqual(self.audio.repeat, "off")
        for want in ("all", "one", "off"):
            await self.audio.cycle_repeat()
            self.assertEqual(self.audio.status()["repeat"], want)
        await self.audio.cycle_repeat()                                              # the whole queue
        await self.audio.play([{"id": "long1", "name": "Ett"}, {"id": "long2", "name": "Två"}], 1)
        await self.until(lambda: self.audio.state == "playing", "the song playing")
        await self.audio.next()                                                      # the last: round to the first
        self.assertEqual(self.audio.index, 0)
        await self.audio.stop()

if __name__ == "__main__":
    unittest.main()
