"""Google Drive, for Bilder's Ej foto: a picture taken out of Immich is kept
in a folder of one's Drive first ("Ej foto"), then goes to Immich's trash
(server.py api_bilder).

rclone does the upload (Debian's, system/install.sh), its drive backend with
the scope drive.file: the box sees only the files it put there, nothing else
of the Drive. Its token comes from `rclone authorize drive
eyJzY29wZSI6ImRyaXZlLmZpbGUifQ` (the base64 asks for that scope) on a
computer with a browser, pasted under Inställningar → Tjänster → Google
Drive. rclone keeps the token fresh in its own config file, readable by
root alone, written anew only when the setting changes.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import shutil
from pathlib import Path

log = logging.getLogger("pioneertv.drive")

REMOTE = "box"


def parse_token(given: str) -> tuple[str, dict]:
    """rclone authorize's answer: the token's JSON (older rclone), or (newer)
    base64 of {client_id, client_secret, token}. The token, and the client
    it was given to; ValueError when it is neither."""
    try:
        json.loads(given)
        return given, {}
    except ValueError:
        pass
    blob = json.loads(base64.b64decode(given + "=" * (-len(given) % 4)))
    token = blob["token"] if isinstance(blob.get("token"), str) else json.dumps(blob["token"])
    json.loads(token)
    return token, {k: str(blob.get(k) or "") for k in ("client_id", "client_secret")}


class Drive:
    def __init__(self, cfg: dict) -> None:
        self.cfg = cfg

    @property
    def dcfg(self) -> dict:
        return self.cfg.get("drive") or {}

    @property
    def root(self) -> Path:
        return Path(self.dcfg.get("dir", "/var/lib/pioneer-tv/drive"))

    def ready(self) -> bool:
        return bool(self.dcfg.get("token")) and bool(shutil.which(self.dcfg.get("rclone", "rclone")))

    def _conf(self) -> Path:
        """rclone's config, written when the token in the settings is new."""
        given = str(self.dcfg.get("token") or "").strip()
        token, client = parse_token(given)
        self.root.mkdir(parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)
        conf, mark = self.root / "rclone.conf", self.root / "token.sha256"
        digest = hashlib.sha256(given.encode()).hexdigest()
        if not conf.is_file() or not mark.is_file() or mark.read_text() != digest:
            lines = [f"[{REMOTE}]", "type = drive", "scope = drive.file", *(f"{k} = {v}" for k, v in client.items() if v), f"token = {token}"]
            conf.write_text("\n".join(lines) + "\n")
            os.chmod(conf, 0o600)
            mark.write_text(digest)
        return conf

    async def _rclone(self, *args: str, timeout: float = 300) -> tuple[int, str]:
        proc = await asyncio.create_subprocess_exec(self.dcfg.get("rclone", "rclone"), "--config", str(self._conf()), *args,
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return -1, "timeout"
        return proc.returncode, (err or out).decode(errors="replace")[-300:]

    async def put(self, path: Path, name: str) -> tuple[bool, str]:
        """A file into the Drive's folder, under its name."""
        if not self.ready():
            return False, "Google Drive är inte kopplat (Inställningar → Tjänster)"
        name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip() or path.name
        folder = str(self.dcfg.get("folder") or "Ej foto").strip("/")
        try:
            code, said = await self._rclone("copyto", str(path), f"{REMOTE}:{folder}/{name}")
        except (OSError, ValueError, KeyError) as exc:
            log.warning("drive: %s", exc)
            return False, "Google Drive kunde inte nås"
        if code != 0:
            log.warning("drive: rclone %s: %s", code, said)
            return False, "Google Drive tog inte emot den"
        return True, ""

    async def status(self) -> dict:
        """For the Tjänster tab: unset, ok (the folder answers) or down."""
        if not self.dcfg.get("token"):
            return {"state": "unset"}
        if not shutil.which(self.dcfg.get("rclone", "rclone")):
            return {"state": "down", "server": "rclone saknas"}
        try:
            code, _ = await self._rclone("lsjson", f"{REMOTE}:", "--dirs-only", "--max-depth", "1", timeout=20)
        except (OSError, ValueError, KeyError):
            return {"state": "auth"}
        return {"state": "ok", "server": f"mappen {self.dcfg.get('folder') or 'Ej foto'}"} if code == 0 else {"state": "auth"}
