"""Rules for the /immich/ proxy, shared by the daemon and dev/preview.py.

The Bilder pages talk to Immich only through /immich/ on their own origin:
the API key stays out of the browser. Only what the pages read is reachable:
the albums, the timeline, the people, the memories, an asset and its
pictures, and the searches (Immich's searches are POSTs that only read).
Never uploads, edits, deletions, sharing or its web UI. A video is played by
mpv, which the daemon starts (video.py), from Immich itself. Stdlib only, so
the preview can import it on a laptop.
"""
from __future__ import annotations

import re
from collections.abc import Mapping
from urllib.parse import unquote

ID = r"[0-9a-fA-F-]{36}"
# GET: what the pages read (paths without /api/'s leading slash).
READ = re.compile(rf"^api/(albums|albums/{ID}|timeline/buckets|timeline/bucket|people|people/{ID}|people/{ID}/thumbnail"
                  rf"|memories|assets/{ID}|assets/{ID}/thumbnail|assets/{ID}/video/playback|server/version)$")
# POST: the searches, which only read.
SEARCH = re.compile(r"^api/search/(metadata|smart|random)$")
REQUEST_HEADERS = ("Content-Type", "Content-Length", "Accept", "Range", "If-None-Match", "If-Modified-Since")
RESPONSE_HEADERS = frozenset({
    "content-type", "content-length", "content-encoding", "content-range", "accept-ranges", "etag", "last-modified",
    "cache-control",
})
METHODS = frozenset({"GET", "HEAD", "POST"})


def target_url(base: str, path: str, query: str = "", method: str = "GET") -> str | None:
    """Immich URL for a path under /immich/, or None when it may not be reached."""
    if not base:
        return None
    decoded = path
    while (nxt := unquote(decoded)) != decoded:      # %2e%2e and %252e decoded before the checks
        decoded = nxt
    if ".." in decoded.replace("\\", "/").split("/"):
        return None
    if method in ("GET", "HEAD"):
        if not READ.match(decoded):
            return None
    elif method == "POST":
        if not SEARCH.match(decoded):
            return None
    else:
        return None
    url = base.rstrip("/") + "/" + path
    return f"{url}?{query}" if query else url


def request_headers(incoming: Mapping[str, str], key: str) -> dict[str, str]:
    """The browser's headers Immich needs, plus the API key."""
    lower = {k.lower(): v for k, v in incoming.items()}
    out = {name: lower[name.lower()] for name in REQUEST_HEADERS if name.lower() in lower}
    out["x-api-key"] = key
    return out
