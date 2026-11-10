"""What is on SVT's channels now and next, for the home page's channel tiles.

SVT Play's channel page (https://www.svtplay.se/kanaler) carries the day's
schedule of every channel in the page itself, as the state of its own data
client: a JSON string under "data" holding {"channels": {"channels": [{id,
name, schedule: [{name, start, startTime, state, progress, ...}]}]}}. That
is read here (no key, no API of its own), kept a couple of minutes, and
handed to the home page as now and next for each channel the box has, by
the address its tile opens (/kanaler/svt1 is ch-svt1, svtbarn is
ch-barnkanalen).
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime

import aiohttp

log = logging.getLogger("pioneertv.schedule")

PAGE = "https://www.svtplay.se/kanaler"
KEEP_SECONDS = 120
# A tile's address (/kanaler/<slug>) to SVT's id for the channel.
IDS = {"svt1": "ch-svt1", "svt2": "ch-svt2", "svtbarn": "ch-barnkanalen", "barnkanalen": "ch-barnkanalen",
       "kunskapskanalen": "ch-kunskapskanalen", "svt24": "ch-svt24"}
STATE = re.compile(r'\{\\"channels\\":\s*\{\\"channels\\"')


def slug(url: str) -> str | None:
    """The channel a tile's address opens: /kanaler/svt1?start=auto -> svt1."""
    m = re.search(r"/kanaler/([a-z0-9-]+)", url or "")
    return m.group(1) if m else None


def channels(html: str) -> dict[str, list[dict]]:
    """Every channel's schedule in the page, by SVT's id; {} if none is found."""
    out: dict[str, list[dict]] = {}
    decoder = json.JSONDecoder()
    for m in STATE.finditer(html):
        start = html.rfind('"data":"', 0, m.start())
        if start < 0:
            continue
        try:
            text, _ = decoder.raw_decode(html, start + 7)
            data = json.loads(text)
        except ValueError:
            continue
        for ch in ((data.get("channels") or {}).get("channels") or []):
            if isinstance(ch, dict) and ch.get("schedule"):
                out[ch.get("id")] = ch["schedule"]
    return out


def _when(item: dict) -> float | None:
    try:
        return datetime.fromisoformat(item.get("start") or "").timestamp()
    except ValueError:
        return None


def now_and_next(schedule: list[dict], at: float | None = None) -> dict:
    """{now: {name, start, end, progress}, next: {name, start}} at a time
    (now by default), from the schedule's own times: the last programme
    started before it is on, the one after it is next."""
    at = time.time() if at is None else at
    items = [(t, it) for it in schedule if (t := _when(it)) is not None and not it.get("isBroadcastIntermission")]
    items.sort(key=lambda x: x[0])
    now = nxt = None
    for i, (t, it) in enumerate(items):
        if t <= at:
            now = (i, t, it)
        else:
            nxt = (t, it)
            break
    out: dict = {}
    if now:
        i, t, it = now
        after = items[i + 1] if i + 1 < len(items) else None
        progress = round(min(1.0, max(0.0, (at - t) / (after[0] - t))), 3) if after else None
        # The times as SVT writes them (Swedish time), not this machine's clock.
        out["now"] = {"name": it.get("name") or "", "start": it.get("startTime") or "", "progress": progress,
                      "end": (after[1].get("startTime") or "") if after else ""}
    if nxt:
        out["next"] = {"name": nxt[1].get("name") or "", "start": nxt[1].get("startTime") or ""}
    return out


class Schedule:
    """The page fetched at most every KEEP_SECONDS; the last good one kept."""

    def __init__(self) -> None:
        self.fetched = 0.0
        self.found: dict[str, list[dict]] = {}

    async def get(self, slugs: list[str]) -> dict:
        if time.monotonic() - self.fetched > KEEP_SECONDS:
            self.fetched = time.monotonic()
            try:
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session, \
                        session.get(PAGE, headers={"User-Agent": "Mozilla/5.0 (X11; Linux) Pioneer TV"}) as resp:
                    if resp.status == 200:
                        found = channels(await resp.text())
                        if found:
                            self.found = found
                        else:
                            log.warning("schedule: no channels in %s", PAGE)
                    else:
                        log.warning("schedule: %s answered %s", PAGE, resp.status)
            except Exception as exc:                      # the network, SVT: the tiles just say less
                log.warning("schedule: %s", exc)
        return {s: now_and_next(self.found.get(IDS.get(s, f"ch-{s}"), [])) for s in slugs}
