"""Keep trusted gamepads connected.

Pads dial the host themselves when switched on, but after a reboot of the box
the pad's own reconnect window has usually closed before Bluetooth is back,
and it sits there asleep. So the daemon dials paired, trusted HID devices
that are not connected: quickly for the first minutes after start (while a
pad that was on during the reboot is still trying), then only rarely, as a
safety net; a host that pages often collides with a pad that is paging in
("Operation already in progress"). A pad that is off answers "Host is down",
which is harmless.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time

from . import sysinfo

log = logging.getLogger("pioneertv.bluetooth")

HID_UUID = "00001124"
RE_DEVICE = re.compile(r"^Device ([0-9A-F:]{17}) (.*)$", re.M)
BURST_SECONDS = 150   # dial often this long after the daemon starts
BURST_INTERVAL = 20
QUIET_AFTER_SEEN = 90  # a pad that showed up on its own this recently is left alone: it is dialing in

# Set by the gamepad manager whenever a pad appears or disappears.
last_seen: dict[str, float] = {}


def note_seen(name: str) -> None:
    last_seen[name] = time.monotonic()


async def paired_hid_devices() -> list[dict]:
    rc, out = await sysinfo.run("bluetoothctl", "devices", "Paired", timeout=8)
    if rc != 0:
        rc, out = await sysinfo.run("bluetoothctl", "devices", timeout=8)
    devices = []
    for mac, name in RE_DEVICE.findall(out):
        _, info = await sysinfo.run("bluetoothctl", "info", mac, timeout=5)
        if HID_UUID not in info and "Gamepad" not in info and "Joystick" not in info:
            continue
        flags = {k: ("yes" in v) for k, v in re.findall(r"^\s*(Connected|Paired|Trusted): (\w+)$", info, re.M)}
        devices.append({"mac": mac, "name": name, **flags})
    return devices


async def dial_once(on_change=None) -> None:
    for d in await paired_hid_devices():
        if d.get("Connected") or not d.get("Trusted"):
            continue
        seen = last_seen.get(d["name"])
        if seen is not None and time.monotonic() - seen < QUIET_AFTER_SEEN:
            log.debug("not dialing %s: it connected on its own %.0f s ago", d["name"], time.monotonic() - seen)
            continue
        log.debug("dialing %s (%s)", d["name"], d["mac"])
        rc, out = await sysinfo.run("bluetoothctl", "connect", d["mac"], timeout=15)
        if "Connection successful" in out:
            log.info("connected %s", d["name"])
            if on_change:
                await on_change(True, d["name"])


async def reconnect_loop(cfg: dict, on_change=None) -> None:
    bt = cfg.get("bluetooth") or {}
    interval = float(bt.get("reconnect_interval", 300))
    if not bt.get("auto_connect", True):
        log.info("auto-connect dialing off")
        return
    started = time.monotonic()
    await asyncio.sleep(3)
    while True:
        try:
            await dial_once(on_change)
        except Exception as exc:
            log.warning("reconnect loop: %s", exc)
        burst = time.monotonic() - started < BURST_SECONDS
        await asyncio.sleep(BURST_INTERVAL if burst else interval)
