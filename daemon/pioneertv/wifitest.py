"""Compare the box's Wi-Fi cards on the network it is on, without leaving it.

The onboard card keeps the connection the box (and whoever is reaching it
over Tailscale) depends on. Another card, a USB adapter say, joins the same
network on a temporary copy of the active profile, bound to that card and
with a high route metric so no traffic moves to it. Each card is then
measured on its own: signal, pings to the router (delay, spread, loss) and a
download bound to it. The copy is removed afterwards whatever happens.
Started from POST /api/wifi/compare; the report is JSON.
"""
from __future__ import annotations

import asyncio
import logging
import re

from .sysinfo import run

log = logging.getLogger("pioneertv.wifitest")

TEST_PROFILE = "pioneertv-wifi-test"
DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes=25000000"


async def _wifi_devices() -> dict[str, dict]:
    rc, out = await run("nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status")
    devs = {}
    for line in out.splitlines():
        parts = line.split(":")
        if len(parts) >= 4 and parts[1] == "wifi":
            devs[parts[0]] = {"state": parts[2], "connection": parts[3]}
    return devs


async def _gateway(dev: str) -> str | None:
    rc, out = await run("ip", "-4", "route", "show", "default", "dev", dev)
    m = re.search(r"default via (\S+)", out)
    return m.group(1) if m else None


async def _signal(dev: str) -> dict:
    rc, out = await run("nmcli", "-t", "-f", "IN-USE,BSSID,CHAN,RATE,SIGNAL", "device", "wifi", "list", "ifname", dev)
    for line in out.replace("\\:", "-").splitlines():
        parts = line.split(":")
        if parts and parts[0] == "*":
            return {"bssid": parts[1], "channel": parts[2], "rate": parts[3], "signal": int(parts[4] or 0)}
    return {}


async def _ping(dev: str, host: str, count: int = 50) -> dict:
    rc, out = await run("ping", "-I", dev, "-c", str(count), "-i", "0.2", "-W", "1", host, timeout=count * 0.2 + 15)
    res = {}
    m = re.search(r"(\d+)% packet loss", out)
    if m:
        res["loss_pct"] = int(m.group(1))
    m = re.search(r"= ([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+) ms", out)
    if m:
        res.update(min_ms=float(m.group(1)), avg_ms=float(m.group(2)), max_ms=float(m.group(3)), mdev_ms=float(m.group(4)))
    return res


async def _download(dev: str) -> dict:
    rc, out = await run("curl", "-s", "-o", "/dev/null", "--interface", dev, "--max-time", "40",
                        "-w", "%{speed_download} %{size_download} %{time_total}", DOWNLOAD_URL, timeout=50)
    try:
        speed, size, total = out.split()[-3:]
        return {"mbit_s": round(float(speed) * 8 / 1e6, 1), "mb": round(float(size) / 1e6, 1), "seconds": float(total)}
    except ValueError:
        return {"error": out.strip()[-200:] or f"curl rc {rc}"}


async def _measure(dev: str) -> dict:
    gw = await _gateway(dev)
    res = {"device": dev, **await _signal(dev), "gateway": gw}
    if gw:
        res["ping_router"] = await _ping(dev, gw)
    res["ping_internet"] = await _ping(dev, "1.1.1.1", count=30)
    res["download"] = await _download(dev)
    return res


async def compare() -> dict:
    devs = await _wifi_devices()
    active = next((d for d, v in devs.items() if v["state"] == "connected" and v["connection"]), None)
    if not active:
        return {"error": "no Wi-Fi connection to compare against"}
    profile = devs[active]["connection"]
    others = [d for d in devs if d != active and not d.startswith("p2p")]
    report = {"network": profile, "cards": [await _measure(active)]}
    for dev in others:
        await run("nmcli", "connection", "delete", "id", TEST_PROFILE, timeout=15)
        try:
            rc, out = await run("nmcli", "connection", "clone", profile, TEST_PROFILE, timeout=15)
            if rc:
                report["cards"].append({"device": dev, "error": f"clone: {out.strip()}"})
                continue
            await run("nmcli", "connection", "modify", TEST_PROFILE,
                      "connection.interface-name", dev, "connection.autoconnect", "no",
                      "ipv4.route-metric", "2000", "ipv6.route-metric", "2000", timeout=15)
            rc, out = await run("nmcli", "--wait", "40", "connection", "up", TEST_PROFILE, "ifname", dev, timeout=50)
            if rc:
                report["cards"].append({"device": dev, "error": f"connect: {out.strip()[-200:]}"})
                continue
            await asyncio.sleep(3)
            report["cards"].append(await _measure(dev))
        finally:
            await run("nmcli", "connection", "down", "id", TEST_PROFILE, timeout=20)
            await run("nmcli", "connection", "delete", "id", TEST_PROFILE, timeout=15)
    # The active card once more, so a change in the network over the test shows.
    report["cards"].append({**await _measure(active), "again": True})
    log.info("wifi compare: %s", report)
    return report
