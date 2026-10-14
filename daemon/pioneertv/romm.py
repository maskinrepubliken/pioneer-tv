"""Rules for the /romm/ proxy, shared by the daemon and dev/preview.py.

The Spel pages talk to RomM only through /romm/ on their own origin: RomM
sends no CORS headers, and the API key must stay out of the browser. Only
RomM's API and its static assets (covers, EmulatorJS) are reachable this
way, never its login or web UI. Stdlib only, so the preview can import it
on a laptop without aiohttp.
"""
from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import unquote

ALLOWED_PREFIXES = ("api/", "assets/")
REQUEST_HEADERS = ("Content-Type", "Content-Length", "Accept", "Range", "If-None-Match", "If-Modified-Since")
RESPONSE_HEADERS = frozenset({
    "content-type", "content-length", "content-encoding", "content-range", "accept-ranges", "etag", "last-modified",
    "cache-control",
})
METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "DELETE"})
# Sec-Fetch-Site values that mean "our own page" (or no page at all: typed in,
# or a client that is not a browser and sends no such header).
OWN_FETCH_SITES = frozenset({"same-origin", "none", ""})


def target_url(base: str, path: str, query: str = "") -> str | None:
    """RomM URL for a path under /romm/, or None when it may not be reached."""
    if not base or not path.startswith(ALLOWED_PREFIXES):
        return None
    # Decode until stable so %2e%2e and %252e cannot slip a ".." past the check.
    decoded = path
    while (nxt := unquote(decoded)) != decoded:
        decoded = nxt
    if ".." in decoded.replace("\\", "/").split("/"):
        return None
    url = base.rstrip("/") + "/" + path
    return f"{url}?{query}" if query else url


def request_headers(incoming: Mapping[str, str], key: str) -> dict[str, str]:
    """The browser's headers RomM needs, plus the API key."""
    lower = {k.lower(): v for k, v in incoming.items()}
    out = {name: lower[name.lower()] for name in REQUEST_HEADERS if name.lower() in lower}
    out["Authorization"] = f"Bearer {key}"
    return out
