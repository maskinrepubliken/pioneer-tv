#!/usr/bin/env python3
"""Local preview of the Pioneer TV screens, no Pi needed.

    python3 dev/preview.py [port] [address]      # default 5178, 127.0.0.1

An address of another interface shares it, e.g. a Tailscale address so the
catalogue can be opened from other devices on the tailnet (it serves the
stand-in data only, never a key).

Serves the repo the way the box does: the extension at /ext/, the settings
page's own files at /static/, the settings page itself at /settings (with its
mock data), and the vendored design system at /design/. Every response is sent
uncached, so a reload always shows the file on disk.

/romm/ forwards to RomM the way the daemon does, so the Spel pages work here
against a real server. It reads ROMM_URL and ROMM_API_KEY from the
environment, or from ~/.config/pioneer-tv/romm.env (KEY=value lines).
/jellyfin/ and /api/jellyfin do the same for the Musik and Film & serier pages, with
JELLYFIN_URL, JELLYFIN_API_KEY and JELLYFIN_USER (or jellyfin.env).

Without those settings, stand-ins answer instead (dev/mock.py): a small
library of films, series, music and games with drawn covers, and the
daemon's API. That is what the catalogue of every view uses
(http://localhost:5178/katalog, dev/katalog.html)."""
import http.server
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "daemon"))
from pioneertv import jellyfin, romm  # noqa: E402  (stdlib only)
sys.path.insert(0, str(ROOT / "dev"))
import mock  # noqa: E402
ROUTES = {                      # URL prefix -> folder
    "/ext/": ROOT / "extension",
    "/static/": ROOT / "daemon" / "pioneertv" / "web",
    "/design/": ROOT / "design",
    "/dev/": ROOT / "dev",
}
REDIRECTS = {
    "/launcher": "/ext/launcher/index.html?tv=1",
    "/settings": "/static/settings.html?mock=1",
    "/spel": "/ext/launcher/spel.html?tv=1",
    "/musik": "/ext/launcher/musik.html?tv=1",
    "/film": "/ext/launcher/film.html?tv=1",
    "/katalog": "/dev/katalog.html",
}


def env_settings(name: str, keys: tuple[str, ...]) -> list[str]:
    """Values from the environment, else from ~/.config/pioneer-tv/<name>.env."""
    values = [os.environ.get(k, "") for k in keys]
    try:
        env_file = pathlib.Path.home() / ".config" / "pioneer-tv" / f"{name}.env"
    except RuntimeError:            # no home directory (a service without one)
        return values
    if not values[1] and env_file.is_file():
        found = dict(line.split("=", 1) for line in env_file.read_text().splitlines() if "=" in line)
        values = [v or found.get(k, "").strip() for k, v in zip(keys, values)]
    return values


def romm_settings() -> tuple[str, str]:
    url, key = env_settings("romm", ("ROMM_URL", "ROMM_API_KEY"))
    return url, key


def jellyfin_settings() -> tuple[str, str, str]:
    url, key, user = env_settings("jellyfin", ("JELLYFIN_URL", "JELLYFIN_API_KEY", "JELLYFIN_USER"))
    return url, key, user

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
<h2>Katalog</h2>
<ul><li><a href="/katalog">Alla vyer</a>: varje skärm, meny, panel och notis i sina lägen, med låtsasdata</li></ul>
<h2>Startsidan</h2>
<ul>
  <li><a href="/launcher">Startsidan i TV-läge</a></li>
  <li><a href="/ext/launcher/index.html?tv=1&demo=keyboard">… med tangentbordet öppet</a></li>
  <li><a href="/ext/launcher/index.html?tv=1&demo=menu">… med snabbmenyn öppen</a></li>
  <li><a href="/ext/launcher/index.html?tv=1&demo=toast">… med ett meddelande</a></li>
</ul>
<h2>Spel</h2>
<ul><li><a href="/spel">Spel mot RomM</a> (kräver ROMM_URL och ROMM_API_KEY)</li></ul>
<h2>Musik</h2>
<ul><li><a href="/musik">Musik mot Jellyfin</a> (kräver JELLYFIN_URL och JELLYFIN_API_KEY)</li></ul>
<h2>Film &amp; serier</h2>
<ul><li><a href="/film">Film &amp; serier mot Jellyfin</a> (samma; att spela kräver boxen)</li></ul>
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

    def send_mock(self, answer: tuple[int, str, bytes]) -> None:
        status, ctype, body = answer
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def mocked(self) -> bool:
        """Answered by the stand-ins (dev/mock.py) when no real server is set."""
        path, _, query = self.path.partition("?")
        jf = path.startswith("/jellyfin/") and not jellyfin_settings()[0]
        rm = path.startswith("/romm/") and not romm_settings()[0]
        api = path.startswith("/api/") and not (path == "/api/jellyfin" and jellyfin_settings()[0])
        if not (jf or rm or api):
            return False
        err = mock.error_for(self.headers.get("Referer"))
        if err and path == "/api/jellyfin":
            return self.send_json(200, {"ok": False, "error": "no_key" if err[0] == 503 else "auth" if err[0] == 401 else "down"}) or True
        if err and (jf or rm):
            self.send_mock(err)
            return True
        if jf:
            answer = mock.jellyfin(path[len("/jellyfin/"):], query, self.command)
        elif rm:
            answer = mock.romm(path[len("/romm/"):], query, self.command)
        else:
            answer = mock.daemon(path, query, self.command) or (404, "application/json", b'{"error": "not_found"}')
        self.send_mock(answer)
        return True

    def proxy(self) -> None:
        if self.mocked():
            return
        if self.path.startswith("/jellyfin/"):
            url, key, _ = jellyfin_settings()
            path, _, query = self.path[len("/jellyfin/"):].partition("?")
            target, rules = jellyfin.target_url(url, path, query, self.command), jellyfin
        else:
            url, key = romm_settings()
            path, _, query = self.path[len("/romm/"):].partition("?")
            target, rules = romm.target_url(url, path, query), romm
        if target is None:
            return self.send_json(404, {"error": "not_found"})
        if not key:
            return self.send_json(503, {"error": "no_key"})
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(target, data=body, method=self.command,
                                     headers=rules.request_headers(dict(self.headers), key))
        try:
            resp = urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as err:
            resp = err
        except (urllib.error.URLError, OSError):
            return self.send_json(502, {"error": "unreachable"})
        with resp:
            self.send_response(resp.status)
            for name, value in resp.headers.items():
                if name.lower() in rules.RESPONSE_HEADERS:
                    self.send_header(name, value)
            self.end_headers()
            if self.command != "HEAD":
                try:
                    while chunk := resp.read(65536):
                        self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass   # the page let go of a song

    def jellyfin_user(self) -> None:
        url, key, wanted = jellyfin_settings()
        if not url or not key:
            return self.send_json(200, {"ok": False, "error": "no_key"})
        req = urllib.request.Request(url.rstrip("/") + "/Users", headers={"Authorization": jellyfin.auth_header(key)})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                users = json.load(resp)
        except urllib.error.HTTPError as err:
            return self.send_json(200, {"ok": False, "error": "auth" if err.code in (401, 403) else "down"})
        except (urllib.error.URLError, OSError, ValueError):
            return self.send_json(200, {"ok": False, "error": "down"})
        user = jellyfin.pick_user(users, wanted)
        if user is None:
            return self.send_json(200, {"ok": False, "error": "no_user"})
        self.send_json(200, {"ok": True, "user_id": user["Id"], "user": user["Name"]})

    def proxied(self) -> bool:
        return self.path.startswith(("/romm/", "/jellyfin/"))

    def do_POST(self):
        if self.path.startswith("/api/") and self.mocked():
            return
        self.proxy() if self.proxied() else self.send_error(405)

    do_PUT = do_DELETE = do_POST

    def do_HEAD(self):
        self.proxy() if self.proxied() else super().do_HEAD()

    def do_GET(self):
        clean = self.path.split("?", 1)[0]
        if self.proxied():
            return self.proxy()
        if clean.startswith("/api/") and self.mocked():
            return
        if clean == "/api/jellyfin":
            return self.jellyfin_user()
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
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    server = http.server.ThreadingHTTPServer((host, port), Handler)
    print(f"Pioneer TV preview on http://{host}:{port}/", flush=True)
    server.serve_forever()
