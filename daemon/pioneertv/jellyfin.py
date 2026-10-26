"""Rules for the /jellyfin/ proxy, shared by the daemon and dev/preview.py.

The Musik and Film & serier pages talk to Jellyfin only through /jellyfin/
on their own origin: the API key stays out of the browser, and Jellyfin's
plain http on its Tailscale address is the daemon's business. Only what the
pages need is reachable: reading the library (items, playlists, artists,
search, images, libraries, series), the audio stream, and the reports of
what is playing (so Jellyfin's "played" and play counts follow the box).
Never its users' settings, the dashboard or its web UI. Videos are not
streamed through here: mpv, started by the daemon (video.py), fetches them
from Jellyfin itself. Stdlib only, so the preview can import it on a laptop.
"""
from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import unquote

# Path prefixes (lower case: Jellyfin's routes ignore case) and the methods
# each allows.
# userviews, useritems/ and shows/ are for the Film & serier pages: the
# libraries, what was begun, and a series' seasons and episodes.
READ_PREFIXES = ("items", "users/", "playlists/", "artists", "search/hints", "audio/", "userviews", "useritems/", "shows/")
REPORT_PREFIXES = ("sessions/playing",)
REQUEST_HEADERS = ("Content-Type", "Content-Length", "Accept", "Range", "If-None-Match", "If-Modified-Since")
RESPONSE_HEADERS = frozenset({
    "content-type", "content-length", "content-encoding", "content-range", "accept-ranges", "etag", "last-modified",
    "cache-control",
})
METHODS = frozenset({"GET", "HEAD", "POST"})
DEVICE_ID = "pioneer-tv"


def target_url(base: str, path: str, query: str = "", method: str = "GET") -> str | None:
    """Jellyfin URL for a path under /jellyfin/, or None when it may not be reached."""
    if not base:
        return None
    lower = path.lower()
    if method in ("GET", "HEAD"):
        if not lower.startswith(READ_PREFIXES + REPORT_PREFIXES):
            return None
    elif method == "POST":
        if not lower.startswith(REPORT_PREFIXES):
            return None
    else:
        return None
    # Decode until stable so %2e%2e and %252e cannot slip a ".." past the check.
    decoded = path
    while (nxt := unquote(decoded)) != decoded:
        decoded = nxt
    if ".." in decoded.replace("\\", "/").split("/"):
        return None
    url = base.rstrip("/") + "/" + path
    return f"{url}?{query}" if query else url


def auth_header(key: str) -> str:
    return f'MediaBrowser Client="Pioneer TV", Device="Pioneer TV", DeviceId="{DEVICE_ID}", Version="1", Token="{key}"'


def request_headers(incoming: Mapping[str, str], key: str) -> dict[str, str]:
    """The browser's headers Jellyfin needs, plus the API key."""
    lower = {k.lower(): v for k, v in incoming.items()}
    out = {name: lower[name.lower()] for name in REQUEST_HEADERS if name.lower() in lower}
    out["Authorization"] = auth_header(key)
    return out


def pick_user(users: list[dict], wanted: str) -> dict | None:
    """The Jellyfin user the box plays as: the one named in the settings
    (any case), or with no name the first administrator, or the first."""
    users = [u for u in users if not (u.get("Policy") or {}).get("IsDisabled")]
    if wanted:
        return next((u for u in users if (u.get("Name") or "").lower() == wanted.strip().lower()), None)
    admins = [u for u in users if (u.get("Policy") or {}).get("IsAdministrator")]
    return (admins or users or [None])[0]
