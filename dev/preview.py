#!/usr/bin/env python3
"""Local preview of the Pioneer TV screens, no Pi needed.

    python3 dev/preview.py [port]      # default 5178

Serves the repo the way the box does: the extension at /ext/, the settings
page's own files at /static/, the settings page itself at /settings (with its
mock data), and the vendored design system at /design/. Every response is sent
uncached, so a reload always shows the file on disk.

/romm/ forwards to RomM the way the daemon does, so the Spel pages work here
against a real server. It reads ROMM_URL and ROMM_API_KEY from the
environment, or from ~/.config/pioneer-tv/romm.env (KEY=value lines)."""
import http.server
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "daemon"))
from pioneertv import romm  # noqa: E402  (stdlib only)
ROUTES = {                      # URL prefix -> folder
    "/ext/": ROOT / "extension",
    "/static/": ROOT / "daemon" / "pioneertv" / "web",
    "/design/": ROOT / "design",
}
REDIRECTS = {
    "/launcher": "/ext/launcher/index.html?tv=1",
    "/settings": "/static/settings.html?mock=1",
    "/spel": "/ext/launcher/spel.html?tv=1",
}


def romm_settings() -> tuple[str, str]:
    url, key = os.environ.get("ROMM_URL", ""), os.environ.get("ROMM_API_KEY", "")
    env_file = pathlib.Path.home() / ".config" / "pioneer-tv" / "romm.env"
    if not key and env_file.is_file():
        values = dict(line.split("=", 1) for line in env_file.read_text().splitlines() if "=" in line)
        url, key = url or values.get("ROMM_URL", "").strip(), values.get("ROMM_API_KEY", "").strip()
    return url, key

INDEX = """<!doctype html><html lang="sv"><meta charset="utf-8">
<title>Pioneer TV – förhandsvisning</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;margin:40px;max-width:720px;color:#1c1613;background:#f4efe4}
  h1{font-size:22px} h2{font-size:15px;margin-top:28px;text-transform:uppercase;letter-spacing:.08em;color:#5d5752}
  a{color:#2e4633} li{margin:4px 0} code{font-size:13px}
</style>
<h1>Pioneer TV – förhandsvisning</h1>
<p>Sidorna läses direkt från repot. Spara en fil och ladda om.
Piltangenter navigerar, Enter väljer, Escape stänger. Layouten är ritad för 1280×720.</p>
<h2>Startsidan</h2>
<ul>
  <li><a href="/launcher">Startsidan i TV-läge</a></li>
  <li><a href="/ext/launcher/index.html?tv=1&demo=keyboard">… med tangentbordet öppet</a></li>
  <li><a href="/ext/launcher/index.html?tv=1&demo=menu">… med snabbmenyn öppen</a></li>
  <li><a href="/ext/launcher/index.html?tv=1&demo=toast">… med ett meddelande</a></li>
</ul>
<h2>Spel</h2>
<ul><li><a href="/spel">Spel mot RomM</a> (kräver ROMM_URL och ROMM_API_KEY)</li></ul>
<h2>Inställningar</h2>
<ul><li><a href="/settings">Inställningssidan med exempeldata</a></li></ul>
<h2>Designsystemet</h2>
<ul>
  <li><a href="/design/maskinrepubliken/specimen.html">Maskinrepubliken: färger, typ och ytor</a></li>
  <li><a href="/design/maskinrepubliken/specimen.html?theme=eink">… i e-ink-temat</a></li>
  <li><a href="/design/maskinrepubliken/specimen.html?theme=ink">… i bläcktemat</a></li>
</ul>
</html>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        for prefix, folder in ROUTES.items():
            if clean.startswith(prefix):
                target = (folder / clean[len(prefix):]).resolve()
                if folder.resolve() in target.parents or target == folder.resolve():
                    return str(target)
        return str(ROOT / "does-not-exist")

    def send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy(self) -> None:
        url, key = romm_settings()
        path, _, query = self.path[len("/romm/"):].partition("?")
        target = romm.target_url(url, path, query)
        if target is None:
            return self.send_json(404, {"error": "not_found"})
        if not key:
            return self.send_json(503, {"error": "no_key"})
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(target, data=body, method=self.command,
                                     headers=romm.request_headers(dict(self.headers), key))
        try:
            resp = urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as err:
            resp = err
        except (urllib.error.URLError, OSError):
            return self.send_json(502, {"error": "unreachable"})
        with resp:
            self.send_response(resp.status)
            for name, value in resp.headers.items():
                if name.lower() in romm.RESPONSE_HEADERS:
                    self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                while chunk := resp.read(65536):
                    self.wfile.write(chunk)

    def do_POST(self):
        self.proxy() if self.path.startswith("/romm/") else self.send_error(405)

    do_PUT = do_DELETE = do_POST

    def do_HEAD(self):
        self.proxy() if self.path.startswith("/romm/") else super().do_HEAD()

    def do_GET(self):
        clean = self.path.split("?", 1)[0]
        if clean.startswith("/romm/"):
            return self.proxy()
        if clean in ("/", "/index.html"):
            body = INDEX.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if clean in REDIRECTS:
            self.send_response(302)
            self.send_header("Location", REDIRECTS[clean])
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, self.path))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Pioneer TV preview on http://localhost:{port}/", flush=True)
    server.serve_forever()
