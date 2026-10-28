"""Covers: RomM's game covers and Jellyfin's posters, stills, album and
artist pictures, fetched, made small and kept on the box (imagecache.py).

For the pages, through the /romm/ and /jellyfin/ proxies (server.py): a
kept picture comes from the disk; one not kept yet comes from the server,
is made small and kept on the way. And every night (images.prefetch_at)
all of them, so the first look at a page is quick too: every game's two
covers, and every album, artist, playlist, film, series, season, episode
and video's pictures, one at a time, waiting while something plays.

Small: at most images.max_px on its longer side (the TV is 1280x720 and no
page shows one larger), as WebP. Without Pillow (python3-pil) they are
kept as they came.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import io
import logging
import time
from pathlib import Path
from typing import Callable, NamedTuple
from urllib.parse import quote, urlsplit

import aiohttp

from . import imagecache, jellyfin

log = logging.getLogger(__name__)

try:
    from PIL import Image
except ImportError:          # the box before the installer added python3-pil
    Image = None

TIMEOUT = aiohttp.ClientTimeout(total=60, sock_connect=5)
PASSED_HEADERS = frozenset({"content-type", "content-length", "etag", "last-modified", "cache-control"})


class Passed(NamedTuple):
    """An answer that is no picture to keep (an error, something else), to be
    passed on as it came."""
    status: int
    body: bytes
    headers: dict
PAGE = 200                   # items asked for at a time, at night
JELLYFIN_TYPES = "MusicAlbum,Playlist,Movie,Series,Season,Episode,Video,Folder,BoxSet,MusicVideo"


def shrink(body: bytes, kind: str, max_px: int) -> tuple[bytes, str]:
    """At most max_px on its longer side, as WebP; as it was when that is
    no smaller, or without Pillow, or when it is no picture Pillow reads."""
    if Image is None or kind == "image/svg+xml":
        return body, kind
    try:
        with Image.open(io.BytesIO(body)) as img:
            img.load()
            if max(img.size) <= max_px and kind == "image/webp":
                return body, kind
            img.thumbnail((max_px, max_px))
            has_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
            img = img.convert("RGBA" if has_alpha else "RGB")
            out = io.BytesIO()
            img.save(out, "WEBP", quality=80, method=4)
            small = out.getvalue()
    except Exception as exc:                       # noqa: BLE001 - any picture Pillow cannot read
        log.debug("covers: kept as it came (%s)", exc)
        return body, kind
    return (small, "image/webp") if len(small) < len(body) else (body, kind)


def seconds_until(at: str, now: dt.datetime | None = None) -> float:
    """Seconds from now to the next HH:MM, local time."""
    now = now or dt.datetime.now()
    hour, minute = (int(x) for x in at.split(":"))
    nxt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if nxt <= now:
        nxt += dt.timedelta(days=1)
    return (nxt - now).total_seconds()


class Covers:
    def __init__(self, cfg: dict) -> None:
        self.cfg = cfg
        icfg = cfg.get("images") or {}
        self.max_px = int(icfg.get("max_px", 600))
        self.cache = (imagecache.ImageCache(Path(icfg.get("dir", "/var/lib/pioneer-tv/images")),
                                            int(icfg["cache_mb"]) * 1024 * 1024)
                      if icfg.get("cache_mb") else None)
        self.busy: Callable[[], bool] = lambda: False      # main.py: a film or a game plays
        self._session: aiohttp.ClientSession | None = None
        self.last_night: dict | None = None
        self.pause = 0.05                 # at night, between one picture and the next

    def session(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = aiohttp.ClientSession(timeout=TIMEOUT)
        return self._session

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()

    # ------------------------------------------------------------ for the pages
    def upstream(self, source: str, base: str, path: str, query: str) -> str:
        """Where to fetch it: Jellyfin is asked for it at the size kept (so it
        sends less), whatever size the page asked for."""
        url = base.rstrip("/") + "/" + path
        if source == "jellyfin":
            tag = imagecache.parse_qs(query).get("tag", [""])[0]
            return f"{url}?maxWidth={self.max_px}&maxHeight={self.max_px}&quality=90&tag={quote(tag)}"
        return f"{url}?{query}" if query else url

    async def picture(self, source: str, base: str, path: str, query: str,
                      headers: dict) -> tuple[Path | bytes, str] | Passed | None:
        """The picture (a kept file, or the bytes just kept) and its type; or
        the answer as it came when it is none to keep; None when the server
        does not answer."""
        k = imagecache.key(source, path, query)
        if hit := self.cache.get(k):
            return hit
        return await self._fetch(k, self.upstream(source, base, path, query), headers)

    async def _fetch(self, k: str, url: str, headers: dict) -> tuple[bytes, str] | Passed | None:
        try:
            async with self.session().get(url, headers=headers, allow_redirects=False) as resp:
                kind = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
                body = await resp.read()
                if resp.status != 200 or kind not in imagecache.TYPES or len(body) > imagecache.MAX_ONE * 4:
                    return Passed(resp.status, body, {h: v for h, v in resp.headers.items() if h.lower() in PASSED_HEADERS})
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            log.warning("covers: %s: %s", url, exc)
            return None
        small, small_kind = await asyncio.to_thread(shrink, body, kind, self.max_px)
        await asyncio.to_thread(self.cache.put, k, small, small_kind)
        return small, small_kind

    # ------------------------------------------------------------ at night
    async def run_nightly(self) -> None:
        at = (self.cfg.get("images") or {}).get("prefetch_at", "03:30")
        if not self.cache or not at:
            return
        while True:
            await asyncio.sleep(seconds_until(at))
            try:
                await self.prefetch()
            except Exception:                    # noqa: BLE001 - tomorrow is another night
                log.exception("covers: the night's fetching failed")

    async def _wait_while_busy(self) -> None:
        while self.busy():
            await asyncio.sleep(60)

    def _full(self) -> bool:
        return self.cache.size() >= self.cache.max_bytes * 0.95

    async def _keep(self, source: str, base: str, path: str, query: str, headers: dict) -> str:
        k = imagecache.key(source, path, query)
        if self.cache.has(k):
            return "had"
        await self._wait_while_busy()
        got = await self._fetch(k, self.upstream(source, base, path, query), headers)
        await asyncio.sleep(self.pause)        # gently: one at a time, a breath between
        return "new" if isinstance(got, tuple) and not isinstance(got, Passed) else "failed"

    async def prefetch(self) -> dict:
        """Every cover there is, kept; returns how it went."""
        started = time.monotonic()
        counts = {"new": 0, "had": 0, "failed": 0}
        for name, walk in (("romm", self._romm), ("jellyfin", self._jellyfin)):
            try:
                async for base, path, query, headers in walk():
                    if self._full():
                        log.warning("covers: the disk's share for pictures is full")
                        break
                    counts[await self._keep(name, base, path, query, headers)] += 1
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, KeyError) as exc:
                log.warning("covers: %s at night: %s", name, exc)
        counts["seconds"] = round(time.monotonic() - started)
        self.last_night = {**counts, "time": time.time()}
        log.info("covers: the night's fetching: %d new, %d had, %d failed, %d s",
                 counts["new"], counts["had"], counts["failed"], counts["seconds"])
        return counts

    async def _json(self, url: str, headers: dict):
        async with self.session().get(url, headers=headers) as resp:
            resp.raise_for_status()
            return await resp.json(content_type=None)

    async def _romm(self):
        cfg = self.cfg.get("romm") or {}
        base, api_key = cfg.get("url", ""), cfg.get("api_key", "")
        if not base or not api_key:
            return
        headers = {"Authorization": f"Bearer {api_key}"}
        offset = 0
        while True:
            data = await self._json(f"{base.rstrip('/')}/api/roms?limit={PAGE}&offset={offset}&order_by=id"
                                    "&with_char_index=false&with_filter_values=false&with_rom_id_index=false", headers)
            items = data.get("items") or []
            for rom in items:
                for cover in (rom.get("path_cover_small"), rom.get("path_cover_large")):
                    if cover:
                        parts = urlsplit(cover)
                        yield base, parts.path.lstrip("/"), parts.query, headers
            offset += len(items)
            if not items or offset >= (data.get("total") or 0):
                break

    async def _jellyfin(self):
        cfg = self.cfg.get("jellyfin") or {}
        base, api_key = cfg.get("url", ""), cfg.get("api_key", "")
        if not base or not api_key:
            return
        base = base.rstrip("/")
        headers = {"Authorization": jellyfin.auth_header(api_key)}
        users = await self._json(f"{base}/Users", headers)
        user = jellyfin.pick_user(users if isinstance(users, list) else [], cfg.get("user", ""))
        if not user:
            return
        lists = [f"{base}/Users/{user['Id']}/Items?Recursive=true&IncludeItemTypes={JELLYFIN_TYPES}"
                 "&Fields=ImageTags,BackdropImageTags&EnableTotalRecordCount=true",
                 f"{base}/Artists?UserId={user['Id']}&Fields=ImageTags&EnableTotalRecordCount=true"]
        for url in lists:
            start = 0
            while True:
                data = await self._json(f"{url}&StartIndex={start}&Limit={PAGE}", headers)
                items = data.get("Items") or []
                for item in items:
                    tags = item.get("ImageTags") or {}
                    for kind in ("Primary", "Thumb"):
                        if tags.get(kind):
                            yield base, f"Items/{item['Id']}/Images/{kind}", f"tag={tags[kind]}", headers
                    backdrops = item.get("BackdropImageTags") or []
                    if backdrops:
                        yield base, f"Items/{item['Id']}/Images/Backdrop", f"tag={backdrops[0]}", headers
                start += len(items)
                if not items or start >= (data.get("TotalRecordCount") or 0):
                    break
