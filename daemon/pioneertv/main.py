"""Entry point: wires config, virtual input, gamepad, CEC, status and the server."""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import time
from urllib.parse import urlparse

from . import __version__, bluetooth, config, settings, sysinfo, updater
from .actions import Dispatcher
from .cec import Cec
from .gamepad import GamepadManager, MouseDriver
from .server import Server
from .virtual_input import VirtualInput

log = logging.getLogger("pioneertv")

STATUS_INTERVAL = 10.0


async def amain(cfg: dict) -> None:
    settings.apply_overlay(cfg)
    server: Server

    async def emit(msg: dict) -> None:
        await server.broadcast(msg)

    vinput = VirtualInput(with_mouse=cfg["mouse"].get("mode", "virtual") == "uinput")
    cec = Cec(cfg, emit)
    dispatcher = Dispatcher(cfg, vinput, cec, emit)
    mouse = MouseDriver(cfg, vinput, emit)

    async def toast(text: str, icon: str = "info") -> None:
        await emit({"type": "event", "name": "toast", "text": text, "icon": icon})

    async def update_from_menu() -> None:
        """Quick-menu update: only acts when the repo is actually behind."""
        await toast("Söker efter uppdatering…", "reload")
        info = await updater.check()
        if info.get("error"):
            await toast(f"Uppdatering: {info['error']}", "info")
            return
        if not info.get("behind"):
            await toast(f"Redan senaste versionen ({info.get('commit')})", "check")
            return
        ok, msg = await updater.start()
        if ok:
            await toast(f"Uppdaterar {info['commit']} → {info['remote']}, startar om strax", "reload")
        else:
            await toast(f"Kunde inte starta uppdatering: {msg}", "info")

    async def on_command(msg: dict) -> None:
        if msg.get("type") == "cec":
            await dispatcher.cec_command(str(msg.get("command")))
        elif msg.get("type") == "key":
            vinput.tap(str(msg.get("key")), msg.get("modifiers"))
        elif msg.get("type") == "update":
            asyncio.create_task(update_from_menu())
        elif msg.get("type") == "gamemode":
            on = bool(msg.get("on"))
            if await pads_mgr.set_passthrough(on) and on:
                await toast("Spelläge: handkontrollen går till spelet · Guide: hem · håll Start: meny", "gamepad")
        else:
            log.debug("unknown command %s", msg)

    # ------------------------------------------------------------ status
    last_status: dict = {}
    status_lock = asyncio.Lock()
    status_at = 0.0

    def is_game_url(url: str | None) -> bool:
        """Is this page one of the services flagged as a game (RomM, EmulatorJS, ...)?"""
        if not url:
            return False
        host = (urlparse(url).hostname or "").lower(); port = urlparse(url).port
        for s in cfg.get("services", []):
            if s.get("mode") != "game" and s.get("id") != "romm":
                continue
            su = urlparse(s.get("url") or "")
            if (su.hostname or "").lower() == host and su.port == port:
                return True
        return False

    async def on_page(url: str | None) -> None:
        game = is_game_url(url)
        if game != dispatcher.game_mode:
            dispatcher.game_mode = game
            log.info("game mode %s (%s)", "on" if game else "off", url)
            if game:
                await toast("Spelläge: handkontrollen går till spelet · Guide/håll Y: meny", "gamepad")

    def media_server() -> tuple[str | None, str | None]:
        """The service that lives on the tailnet (Jellyfin, Plex, ...): its URL and name."""
        for s in cfg.get("services", []):
            url = s.get("url") or ""
            host = (urlparse(url).hostname or "").lower()
            if host.startswith("100.") or host.endswith(".ts.net") or s.get("id") in ("jellyfin", "plex"):
                return url, s.get("name")
        return None, None

    async def status(force: bool = False) -> dict:
        nonlocal status_at
        async with status_lock:
            if not force and last_status and time.monotonic() - status_at < 3:
                return last_status
            wifi, ts, ifaces, sysstat, ver, audio = await asyncio.gather(
                sysinfo.wifi_status(), sysinfo.tailscale_status(*media_server()), sysinfo.interfaces(), sysinfo.system_status(),
                updater.version(), sysinfo.audio_status(),
            )
            batteries = sysinfo.gamepad_batteries()
            pads = [{"name": p.dev.name, "path": p.dev.path, "battery": batteries.get(p.dev.name)} for p in pads_mgr.pads()]
            last_status.clear()
            last_status.update({
                "type": "status",
                "wifi": wifi,
                "tailscale": ts,
                "interfaces": ifaces,
                "system": sysstat,
                "gamepads": pads,
                "keyboard_present": pads_mgr.keyboard_present,
                "cec": {"enabled": cec.enabled, "phys_addr": cec.phys_addr, "tv_power": cec.last_power},
                "audio": audio,
                "version": __version__,
                "git": ver,
                "page": server.current_url,
            })
            status_at = time.monotonic()
            return last_status

    async def status_loop() -> None:
        while True:
            try:
                s = await status()
                await emit(s)
            except Exception as exc:
                log.warning("status failed: %s", exc)
            await asyncio.sleep(STATUS_INTERVAL)

    # ------------------------------------------------------------ hooks
    async def system_action(name: str) -> tuple[bool, str]:
        commands = {
            "restart_ui": ["systemctl", "restart", "pioneer-tv-weston"],
            "restart_daemon": ["systemctl", "restart", "pioneer-tv-daemon"],
            "reboot": ["systemctl", "reboot"],
            "shutdown": ["systemctl", "poweroff"],
            "tailscale_up": ["tailscale", "up"],
        }
        if name == "update":
            return await updater.start()
        if name not in commands:
            return False, "unknown action"
        log.info("system action: %s", name)
        rc, out = await sysinfo.run(*commands[name], timeout=600 if name == "update" else 30)
        return rc == 0, out.strip()[-2000:]

    async def config_changed() -> None:
        log.info("settings updated")
        await emit({"type": "event", "name": "toast", "text": "Inställningar sparade", "icon": "check"})

    server = Server(cfg, on_command, {
        "status": status,
        "last_status": lambda: last_status or None,
        "system_action": system_action,
        "cec": dispatcher.cec_command,
        "cec_trace": cec.trace_text,
        "cec_topology": cec.topology,
        "cec_raw": cec.raw,
        "config_changed": config_changed,
        "on_page": on_page,
    })

    async def on_gamepad_change(connected: bool, name: str) -> None:
        bluetooth.note_seen(name)
        await emit({"type": "event", "name": "gamepad", "connected": connected, "device": name})
        if connected and cfg["cec"]["tv_on_gamepad_connect"]:
            try:
                if not (await cec.power_status()).startswith("on"):
                    await cec.tv_on()
            except Exception as exc:
                log.debug("tv on after gamepad connect failed: %s", exc)

    async def on_keyboard_change(present: bool) -> None:
        await emit({"type": "event", "name": "keyboard_present", "present": present})

    remote_map = cfg["cec"]["remote"]

    async def on_remote(ui_cmd: str, down: bool) -> None:
        action = remote_map.get(ui_cmd)
        if not action:
            log.debug("unmapped TV remote key %s", ui_cmd)
            return
        if down:
            await dispatcher.press(action)
        else:
            await dispatcher.release(action)

    pads_mgr = GamepadManager(cfg, dispatcher, mouse, on_gamepad_change, on_keyboard_change)

    await cec.setup()
    # A USB adapter may come up powered off; paired pads only reconnect to a powered adapter.
    await sysinfo.run("bluetoothctl", "power", "on", timeout=10)
    tasks = [
        asyncio.create_task(server.run(), name="server"),
        asyncio.create_task(pads_mgr.run(), name="gamepads"),
        asyncio.create_task(mouse.run(), name="mouse"),
        asyncio.create_task(cec.monitor(on_remote), name="cec-monitor"),
        asyncio.create_task(status_loop(), name="status"),
        asyncio.create_task(bluetooth.reconnect_loop(cfg), name="bt-reconnect"),
    ]

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    log.info("shutting down")
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    vinput.close()


def run() -> None:
    parser = argparse.ArgumentParser(prog="pioneertv", description="Pioneer TV daemon")
    parser.add_argument("-c", "--config", help="path to config.toml")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()

    cfg = config.load(args.config)
    level = "debug" if args.verbose else cfg["daemon"]["log_level"]
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO),
                        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    log.info("pioneertv %s, config %s", __version__, cfg["_path"] or "(defaults)")
    asyncio.run(amain(cfg))
