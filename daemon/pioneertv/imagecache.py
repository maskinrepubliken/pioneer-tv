"""Pictures kept on the box's own disk: RomM's covers and Jellyfin's
posters, stills and album art, as the /romm/ and /jellyfin/ proxies fetch
them for the pages (server.py).

The first time a picture is asked for it comes from the server and is
written here; after that it comes from the disk, without asking the server
at all. Both servers put a version in the address (RomM ?ts=, Jellyfin
&tag=), so a picture that changes there gets an address of its own and is
fetched anew; the old one ages out. The pictures are kept up to a size
(config: images.cache_mb); past it, the ones unused longest go first.

Stdlib only: the proxies do the fetching.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from pathlib import Path

log = logging.getLogger(__name__)

# What a picture may be, by its type, and the file's ending for it.
TYPES = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    "image/avif": ".avif", "image/svg+xml": ".svg",
}
ENDINGS = {ending: kind for kind, ending in TYPES.items()}
MAX_ONE = 8 * 1024 * 1024        # a picture larger than this is passed through, not kept
TOUCH_EVERY = 3600               # a picture's last use is noted at most this often (an SD card)


def wanted(source: str, method: str, path: str, headers) -> bool:
    """Whether a proxied request is for a picture that may be kept: a plain
    GET (not a part of one, not a "has it changed") of a cover or a poster."""
    if method != "GET" or "Range" in headers or "If-None-Match" in headers or "If-Modified-Since" in headers:
        return False
    if source == "romm":
        return path.startswith("assets/romm/resources/") and path.rsplit(".", 1)[-1].lower() in ("png", "jpg", "jpeg", "webp", "gif")
    if source == "jellyfin":
        parts = path.lower().split("/")
        return len(parts) >= 4 and parts[0] == "items" and parts[2] == "images"
    return False


def key(source: str, path: str, query: str) -> str:
    return hashlib.sha256(f"{source}\n{path}\n{query}".encode()).hexdigest()


class ImageCache:
    def __init__(self, root: Path, max_bytes: int) -> None:
        self.root = Path(root)
        self.max_bytes = max_bytes
        self._size: int | None = None      # counted on first need

    def _dir(self, k: str) -> Path:
        return self.root / k[:2]

    def get(self, k: str) -> tuple[Path, str] | None:
        """The kept picture and its type, or None."""
        d = self._dir(k)
        for ending, kind in ENDINGS.items():
            path = d / (k + ending)
            try:
                st = path.stat()
            except OSError:
                continue
            if time.time() - st.st_mtime > TOUCH_EVERY:
                try:
                    os.utime(path)
                except OSError:
                    pass
            return path, kind
        return None

    def put(self, k: str, body: bytes, content_type: str) -> bool:
        """Keeps a picture; False when it is not one to keep. Blocking (disk):
        run it off the event loop."""
        ending = TYPES.get(content_type.split(";")[0].strip().lower())
        if not ending or not body or len(body) > MAX_ONE:
            return False
        d = self._dir(k)
        try:
            d.mkdir(parents=True, exist_ok=True)
            tmp = d / f".{k}.{os.getpid()}.tmp"
            tmp.write_bytes(body)
            os.replace(tmp, d / (k + ending))
        except OSError as exc:
            log.warning("images: could not keep %s: %s", k[:12], exc)
            return False
        if self._size is not None:
            self._size += len(body)
        if self.size() > self.max_bytes:
            self.prune()
        return True

    def _files(self) -> list[tuple[float, int, Path]]:
        out = []
        if not self.root.is_dir():
            return out
        for d in self.root.iterdir():
            if not d.is_dir():
                continue
            for f in d.iterdir():
                if f.name.startswith("."):
                    continue
                try:
                    st = f.stat()
                except OSError:
                    continue
                out.append((st.st_mtime, st.st_size, f))
        return out

    def size(self) -> int:
        if self._size is None:
            self._size = sum(size for _, size, _ in self._files())
        return self._size

    def prune(self) -> None:
        """Down to nine tenths of the limit, the ones unused longest first."""
        files = sorted(self._files())
        total = sum(size for _, size, _ in files)
        goal = self.max_bytes * 0.9
        gone = 0
        for _, size, f in files:
            if total <= goal:
                break
            try:
                f.unlink()
                total -= size
                gone += 1
            except OSError:
                pass
        self._size = total
        log.info("images: let %d go, %.0f MB kept", gone, total / 1e6)

    def stats(self) -> dict:
        files = self._files()
        return {"files": len(files), "bytes": sum(size for _, size, _ in files), "max_bytes": self.max_bytes}

    def clear(self) -> None:
        for _, _, f in self._files():
            try:
                f.unlink()
            except OSError:
                pass
        self._size = 0
