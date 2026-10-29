"""Entry point: wires config, virtual input, gamepad, CEC, status and the server."""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import time

from . import __version__, bluetooth, config, settings, sysinfo, updater
from .actions import Dispatcher
from .cec import Cec
from .gamepad import GamepadManager, MouseDriver
from .games import Games
from .video import Video
from .audio import Audio
from .idle import Idle
from .server import Server
from .virtual_input import VirtualInput

log = logging.getLogger("pioneertv")

STATUS_INTERVAL = 10.0


async def amain(cfg: dict) -> None:
    settings.apply_overlay(cfg)
    server: Server

    async def emit(msg: dict) -> None:
        await server.broadcast(msg)

    idle: Idle | None = None          # made further down; CEC events may come first

    async def on_cec_event(msg: dict) -> None:
        """CEC events reach the extension; standby also sends the box home."""
        await emit(msg)
        if msg.get("name") == "tv" and msg.get("power") == "on" and idle:
            idle.tv_on()
        if msg.get("name") == "tv" and msg.get("power") == "standby" and idle:
            idle.tv_standby()
        if msg.get("name") == "tv" and msg.get("power") == "standby" and cfg["cec"].get("home_on_standby", True):
            log.info("TV went to standby: back to the launcher")
            await emit({"type": "event", "name": "home", "quiet": True})

    vinput = VirtualInput(with_mouse=cfg["mouse"].get("mode", "virtual") == "uinput")
    cec = Cec(cfg, on_cec_event)
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
            await pads_mgr.set_passthrough(bool(msg.get("on")))
        else:
            log.debug("unknown command %s", msg)

    # ------------------------------------------------------------ status
    last_status: dict = {}
    status_lock = asyncio.Lock()
    status_at = 0.0

    async def status(force: bool = False) -> dict:
        nonlocal status_at
        async with status_lock:
            if not force and last_status and time.monotonic() - status_at < 3:
                return last_status
            wifi, ts, ifaces, sysstat, ver, audio = await asyncio.gather(
                sysinfo.wifi_status(), sysinfo.tailscale_status(), sysinfo.interfaces(), sysinfo.system_status(),
                updater.version(), sysinfo.audio_status(),
            )
            batteries = sysinfo.gamepad_batteries()
            pads = [{"name": p.label, "path": p.dev.path, "battery": batteries.get(p.dev.name), **p.colors} for p in pads_mgr.pads()]
            last_status.clear()
            last_status.update({
                "type": "status",
                "wifi": wifi,
                "tailscale": ts,
                "interfaces": ifaces,
                "system": sysstat,
                "gamepads": pads,
                "active_pad": pads_mgr.active_pad(),
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
        """Broadcast status, and keep the TV's power state fresh: a TV switched
        off with its own remote does not always announce it."""
        ticks = 0
        while True:
            try:
                ticks += 1
                if cec.enabled:
                    was = cec.last_power
                    try:
                        now = await cec.power_status()
                    except Exception:
                        now = was
                    if now != was and now in ("on", "standby"):
                        log.info("TV power: %s -> %s", was, now)
                        await on_cec_event({"type": "event", "name": "tv", "power": now})
                s = await status()
                await emit(s)
            except Exception as exc:
                log.warning("status failed: %s", exc)
            await asyncio.sleep(STATUS_INTERVAL)

    # ------------------------------------------------------------ hooks
    async def system_action(name: str) -> tuple[bool, str]:
        commands = {
            "restart_ui": ["systemctl", "restart", "pioneer-tv-display"],
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
    })

    async def on_gamepad_change(connected: bool, name: str, label: str | None = None, at_start: bool = False) -> None:
        bluetooth.note_seen(name)
        await emit({"type": "event", "name": "gamepad", "connected": connected, "device": name, "label": label})
        if connected and not at_start and idle:
            idle.pad_connected()
        # A pad that was already on when the daemon started (a restart or an
        # update) is not someone reaching for it: it must not wake the TV.
        if connected and not at_start and cfg["cec"]["tv_on_gamepad_connect"]:
            try:
                if not (await cec.power_status()).startswith("on"):
                    await cec.tv_on()
            except Exception as exc:
                log.debug("tv on after gamepad connect failed: %s", exc)

    async def on_active_pad(pad: dict) -> None:
        # Into the cached status as well, so a status sent from the cache does
        # not hand back the previous pad's colours.
        if last_status:
            last_status["active_pad"] = pad
        await emit({"type": "event", "name": "active_pad", "pad": pad})

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

    pads_mgr = GamepadManager(cfg, dispatcher, mouse, on_gamepad_change, on_keyboard_change, on_active_pad)

    # Games, played in RetroArch out of sight (games.py).
    games = Games(cfg, emit, pads_mgr, dispatcher)
    server.hooks["games"] = games
    await games.reap_strays()

    # Films and series from Jellyfin, played in mpv (video.py).
    video = Video(cfg, emit, dispatcher, overlay=lambda: server.router.present)
    server.hooks["video"] = video
    await video.reap_strays()

    # Music and radio, played here so they play on from page to page (audio.py).
    audio = Audio(cfg, emit)
    server.hooks["audio"] = audio
    await audio.reap_strays()

    # Left alone: home, the screensaver, then the TV off (idle.py). A game or a film held on
    # its pause panel is not playing; left there, it is put away first.
    def playing() -> bool:
        game = games.state in ("loading", "running", "quitting")
        film = video.state in ("starting", "running", "stopping") and not video.held and not video.menu_paused
        return game or film

    async def put_away() -> bool:
        """Quit a held game (state saved) and stop a held film (position saved)."""
        did = False
        if games.state == "held":
            await games.quit()
            did = True
        if video.state != "idle":
            await video.stop()
            did = True
        return did

    idle = Idle(cfg, emit, tv_off=lambda: dispatcher.cec_command("tv_off"), busy=playing, audible=audio.playing,
                at_home=lambda: "/launcher/index.html" in (server.current_url or ""),
                pads=lambda: len(pads_mgr.pads()), put_away=put_away)
    server.hooks["idle"] = idle
    # Every cover at night, waiting while a film or a game plays (covers.py).
    server.covers.busy = playing
    dispatcher.on_input = idle.input
    mouse.on_move = idle.input

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
        asyncio.create_task(idle.run(), name="idle"),
        asyncio.create_task(server.covers.run_nightly(), name="covers"),
    ]

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()
    log.info("shutting down")
    try:
        await asyncio.wait_for(games.close(), 10)
    except Exception as exc:
        log.warning("closing the game: %s", exc)
    try:
        await asyncio.wait_for(video.close(), 8)
    except Exception as exc:
        log.warning("stopping the video: %s", exc)
    try:
        await asyncio.wait_for(audio.close(), 5)
    except Exception as exc:
        log.warning("stopping the music: %s", exc)
    for t in tasks:
        t.cancel()
    # Name whatever is slow to stop, so a long shutdown says why.
    _, pending = await asyncio.wait(tasks, timeout=5)
    if pending:
        log.warning("still stopping after 5 s: %s", ", ".join(t.get_name() for t in pending))
    await asyncio.gather(*tasks, return_exceptions=True)
    log.info("all tasks stopped")
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
