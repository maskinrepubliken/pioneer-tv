"""Gamepad discovery and event handling.

Any evdev device that reports BTN_SOUTH (or BTN_GAMEPAD) is treated as a
gamepad. Buttons and axes are mapped through the config to Dispatcher actions.
"""
from __future__ import annotations

import asyncio
import collections
import copy
import logging
import os
import time
from typing import Callable, Coroutine

import evdev
from evdev import ecodes as e

from .actions import Dispatcher

log = logging.getLogger("pioneertv.gamepad")

# Rolling record of raw events from every pad: /api/input/events and the
# Testa section of the settings page.
TRACE: collections.deque = collections.deque(maxlen=300)


def _trace(dev_name: str, kind: str, code: str, value, mapped) -> None:
    TRACE.append({"t": time.time(), "device": dev_name, "kind": kind, "code": code, "value": value, "mapped": mapped})


def describe(action) -> str | None:
    """Short human label for a mapping, for the trace."""
    if not action:
        return None
    if "mouse" in action:
        return f"mus {action['mouse']}"
    if "negative" in action or "positive" in action:
        return " / ".join(describe(action.get(k)) or "-" for k in ("negative", "positive"))
    if "key" in action:
        mods = "+".join(m.replace("KEY_LEFT", "") for m in action.get("modifiers", []))
        return (mods + "+" if mods else "") + action["key"].replace("KEY_", "")
    if "mouse_button" in action:
        return action["mouse_button"].replace("BTN_", "mus ")
    if "cec" in action:
        return "TV " + action["cec"]
    if "system" in action:
        return action["system"]
    return "?"

# Per-device quirks by name substring: axis inversion and button overrides
# (merged over the configured button map). The Nintendo driver reports stick
# Y with up as positive; the SteelSeries Stratus XL numbers its buttons in
# order (X=BTN_C, Y=BTN_NORTH, L1=BTN_WEST, R1=BTN_Z, L2=BTN_TL, R2=BTN_TR)
# and has no Start or Guide; holding Y opens the menu, holding B goes back.
QUIRKS = [
    ("Pro Controller", {"invert": ["ABS_Y", "ABS_RY"]}),
    ("Joy-Con", {"invert": ["ABS_Y", "ABS_RY"]}),
    ("Nintendo", {"invert": ["ABS_Y", "ABS_RY"]}),
    ("Stratus XL", {"invert": ["ABS_Y", "ABS_RZ"], "buttons": {
        "BTN_B": {"key": "KEY_ESC", "long": {"system": "back"}},
        "BTN_C": {"key": "KEY_SPACE"},                                  # X
        "BTN_NORTH": {"system": "keyboard", "long": {"system": "menu"}},  # Y; held, the menu: no Start or Guide
        "BTN_WEST": {"key": "KEY_TAB", "modifiers": ["KEY_LEFTSHIFT"]}, # L1: previous focusable
        "BTN_Z": {"key": "KEY_TAB"},                                    # R1: next focusable
        "BTN_TL": {"cec": "volume_down", "repeat": True},               # L2
        "BTN_TR": {"cec": "volume_up", "repeat": True},                 # R2
        "KEY_HOMEPAGE": {"system": "home"},   # pause: only reports after a long hold
    }}),
    # 8BitDo Ultimate 2C on its 2.4 GHz dongle (2dc8:310a, xpad). xpad reports
    # the left face button (X) as BTN_NORTH and the top one (Y) as BTN_WEST,
    # the reverse of where they sit; swapped back so X is OK/space and Y opens
    # the keyboard, as on every other pad. Verified on
    # the box button by button; everything else matches the defaults.
    ("Ultimate 2C", {"buttons": {
        "BTN_NORTH": {"key": "KEY_SPACE"},                                  # X
        "BTN_WEST": {"system": "keyboard"},                                 # Y
    }}),
]


# Buttons that still reach the shell while a game has the pad (see passthrough).
SHELL_BUTTONS = {e.BTN_MODE, e.BTN_START, e.KEY_HOMEPAGE}


class Gamepad:
    def __init__(self, dev: evdev.InputDevice, cfg: dict, dispatcher: Dispatcher, mouse, shared: dict | None = None) -> None:
        self.dev = dev
        self.cfg = cfg["gamepad"]
        self.dispatcher = dispatcher
        self.mouse = mouse
        # Shared with the manager: {"passthrough": bool}. In passthrough the pad
        # is left to the page (Chromium's Gamepad API, e.g. RomM's emulator):
        # no key translation, no pointer, only Guide (menu, hold: home) and a
        # long press on Start (menu), so there is always a way out.
        self.shared = shared if shared is not None else {"passthrough": False}
        # Who this pad is: [pads."<USB serial>"] in the config gives it a name
        # and its colours (pointer fill, focus ring, and the highlight that
        # stands in for ochre), e.g. the pink and the green 8BitDo, which
        # otherwise report the very same name.
        # Read from the config on every use, so a change on the settings page
        # (or PUT /api/settings) applies without reconnecting the pad.
        self.serial = usb_serial(dev)
        self.root_cfg = cfg
        if self.named:
            log.info("%s (%s) is %s", dev.name, self.serial, self.label)
        button_map = dict(self.cfg["buttons"])
        for needle, quirk in QUIRKS:
            if needle.lower() in dev.name.lower() and quirk.get("buttons"):
                button_map.update(quirk["buttons"])
                log.info("%s: using button profile", dev.name)
        # A pad without Start or Guide still needs a way to the menu: holding Y.
        keys = set(dev.capabilities().get(e.EV_KEY, []))
        if e.BTN_START not in keys and e.BTN_MODE not in keys and e.BTN_NORTH in keys:
            y = dict(button_map.get("BTN_NORTH") or {"system": "keyboard"})
            y.setdefault("long", {"system": "menu"})
            button_map["BTN_NORTH"] = y
        self.buttons: dict[int, dict] = {}
        # Each pad its own copies: the dispatcher keeps a held action's repeat
        # and long press by the action object, and with the config's dicts
        # shared, one pad's press could take over another's repeat and leave
        # it running (the TV's volume went on falling by itself).
        for name, action in button_map.items():
            code = getattr(e, name, None)
            if code is not None:
                self.buttons[code] = copy.deepcopy(action)
        self.axes: dict[int, dict] = {}
        for name, spec in self.cfg["axes"].items():
            code = getattr(e, name, None)
            if code is not None:
                self.axes[code] = copy.deepcopy(spec)
        self.absinfo = {code: info for code, info in dev.capabilities().get(e.EV_ABS, [])}
        # No ABS_RX/RY but a signed ABS_Z/RZ: that is the right stick (generic HID pads).
        if e.ABS_RX not in self.absinfo and e.ABS_Z in self.absinfo and self.absinfo[e.ABS_Z].min < 0:
            self.axes[e.ABS_Z] = {"mouse": "x"}
            if e.ABS_RZ in self.absinfo:
                self.axes[e.ABS_RZ] = {"mouse": "y"}
            log.info("%s: right stick on ABS_Z/ABS_RZ", dev.name)
        self.unipolar = {getattr(e, n) for n in self.cfg["unipolar_axes"] if hasattr(e, n)}
        invert = list(self.cfg.get("invert_axes") or [])
        for needle, quirk in QUIRKS:
            if needle.lower() in dev.name.lower():
                invert += quirk.get("invert", [])
        self.invert = {getattr(e, n) for n in invert if hasattr(e, n)}
        if self.invert:
            log.info("%s: inverting %s", dev.name, ", ".join(sorted(invert)))
        self.axis_state: dict[int, int] = {}  # -1, 0, +1 per digital-ised axis

    def normalize(self, code: int, value: int) -> float:
        info = self.absinfo.get(code)
        if info is None or info.max == info.min:
            return float(value)
        if code in self.unipolar and info.min >= 0:
            return (value - info.min) / (info.max - info.min)
        v = (value - info.min) / (info.max - info.min) * 2.0 - 1.0
        return -v if code in self.invert else v

    async def run(self) -> None:
        log.info("reading %s (%s)", self.dev.name, self.dev.path)
        try:
            async for ev in self.dev.async_read_loop():
                if ev.type == e.EV_KEY:
                    await self.on_key(ev.code, ev.value)
                elif ev.type == e.EV_ABS:
                    await self.on_abs(ev.code, ev.value)
        except (OSError, asyncio.CancelledError):
            pass
        finally:
            await self.release_everything()
            log.info("stopped %s", self.dev.name)

    def _own(self) -> dict:
        return ((self.root_cfg.get("pads") or {}).get(self.serial) or {}) if self.serial else {}

    @property
    def label(self) -> str:
        return self._own().get("name") or self.dev.name

    @property
    def named(self) -> bool:
        return bool(self._own().get("name"))

    @property
    def colors(self) -> dict:
        own = self._own()
        return {k: own[k] for k in ("pointer", "accent", "highlight") if own.get(k)}

    def identity(self) -> dict:
        return {"key": self.serial or self.dev.path, "name": self.label, "named": self.named, **self.colors}

    def mark_active(self) -> None:
        """This pad is the one in use: the extension takes its colours. Sent
        when the pad changes, and otherwise at most four times a second: the
        player matches each one against the browser gamepad that pressed at
        that moment to tell which of two identical pads is which (spela.js)."""
        key = self.serial or self.dev.path
        now = time.monotonic()
        if self.shared.get("active") == key and now - self.shared.get("active_at", 0.0) < 0.25:
            return
        self.shared["active_at"] = now
        self.shared["active"] = key
        notify = self.shared.get("notify_active")
        if notify:
            asyncio.get_running_loop().create_task(notify(self.identity()))

    async def on_key(self, code: int, value: int) -> None:
        if value == 1:
            self.mark_active()
        action = self.buttons.get(code)
        if value != 2:
            name = e.KEY.get(code) or e.BTN.get(code) or str(code)
            if isinstance(name, list):
                name = name[0]
            _trace(self.dev.name, "key", name, value, describe(action))
        if action is None or value == 2:  # 2 = autorepeat
            return
        if self.shared.get("passthrough") or self.shared.get("games"):
            if code not in SHELL_BUTTONS:
                return
            if code == e.BTN_START:
                action = self._passthrough_start
        if value:
            await self.dispatcher.press(action)
        else:
            await self.dispatcher.release(action)

    # Stable objects: the dispatcher keys its long-press state on identity.
    _passthrough_start = {"long": {"system": "menu"}}

    async def on_abs(self, code: int, value: int) -> None:
        v = self.normalize(code, value) if code in self.absinfo else float(value)
        if abs(v) > 0.6:
            self.mark_active()
        if self.shared.get("passthrough") or self.shared.get("games"):
            return
        spec = self.axes.get(code)
        # Pointer axes would flood the trace; hats, triggers and unmapped axes matter.
        if not (spec and "mouse" in spec) and (abs(v) > 0.5 or value == 0):
            _trace(self.dev.name, "abs", e.ABS.get(code, str(code)), value, describe(spec))
        if spec is None:
            return
        if "mouse" in spec:
            self.mouse.set_axis(spec["mouse"], v)
            return
        hat = code in (e.ABS_HAT0X, e.ABS_HAT0Y)
        threshold = 0.5 if hat else (self.cfg["trigger_threshold"] if code in self.unipolar else self.cfg["stick_deadzone"])
        new = 1 if v > threshold else (-1 if v < -threshold else 0)
        old = self.axis_state.get(code, 0)
        if new == old:
            return
        self.axis_state[code] = new
        if old:
            act = spec.get("positive" if old > 0 else "negative")
            if act:
                await self.dispatcher.release(act)
        if new:
            act = spec.get("positive" if new > 0 else "negative")
            if act:
                await self.dispatcher.press(act)

    async def release_everything(self) -> None:
        for code, state in list(self.axis_state.items()):
            if state:
                act = self.axes[code].get("positive" if state > 0 else "negative")
                if act:
                    await self.dispatcher.release(act)
        self.axis_state.clear()
        self.mouse.reset()


class MouseDriver:
    """Turns a stick position into pointer motion at a fixed rate: either
    real uinput events or, in virtual mode, pointer events for the extension."""

    def __init__(self, cfg: dict, vinput, emit=None) -> None:
        self.cfg = cfg["mouse"]
        self.vinput = vinput
        self.emit = emit
        self.x = 0.0
        self.y = 0.0
        self._rx = 0.0
        self._ry = 0.0

    def set_axis(self, axis: str, v: float) -> None:
        if axis == "x":
            self.x = v
        else:
            self.y = v

    def reset(self) -> None:
        self.x = self.y = 0.0

    def _speed(self, v: float) -> float:
        dz = self.cfg["deadzone"]
        if abs(v) < dz:
            return 0.0
        mag = (abs(v) - dz) / (1 - dz)
        return (mag ** self.cfg["curve"]) * self.cfg["max_speed"] * (1 if v > 0 else -1)

    async def run(self) -> None:
        dt = 1.0 / self.cfg["hz"]
        while True:
            await asyncio.sleep(dt)
            sx, sy = self._speed(self.x), self._speed(self.y)
            if not sx and not sy:
                self._rx = self._ry = 0.0
                continue
            self._rx += sx * dt
            self._ry += sy * dt
            dx, dy = int(self._rx), int(self._ry)
            self._rx -= dx
            self._ry -= dy
            if self.cfg.get("mode", "virtual") == "virtual":
                if self.emit and (dx or dy):
                    await self.emit({"type": "event", "name": "pointer", "dx": dx, "dy": dy})
            else:
                self.vinput.mouse_move(dx, dy)


def is_gamepad(dev: evdev.InputDevice) -> bool:
    keys = dev.capabilities().get(e.EV_KEY, [])
    return e.BTN_SOUTH in keys or e.BTN_GAMEPAD in keys


def is_keyboard(dev: evdev.InputDevice) -> bool:
    """A real keyboard: letters and Enter, and not one of our virtual devices."""
    if dev.name.startswith("Pioneer TV"):
        return False
    keys = set(dev.capabilities().get(e.EV_KEY, []))
    return e.KEY_A in keys and e.KEY_Z in keys and e.KEY_ENTER in keys and e.BTN_SOUTH not in keys


def usb_base(dev: evdev.InputDevice) -> str:
    """The physical device an input node belongs to: its phys without the
    interface ("usb-0000:01:00.0-1.2/input1" -> "usb-0000:01:00.0-1.2")."""
    return (dev.phys or "").split("/input")[0]


def usb_device_dir(dev: evdev.InputDevice) -> str:
    """The sysfs folder of the USB device behind an input node, or ""."""
    try:
        here = os.path.realpath(f"/sys/class/input/{os.path.basename(dev.path)}/device")
    except OSError:
        return ""
    for _ in range(8):
        if os.path.isfile(os.path.join(here, "idVendor")):
            return here
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    return ""


def usb_serial(dev: evdev.InputDevice) -> str:
    """The serial number of the USB device behind an input node, or "". Each
    8BitDo 2.4 GHz dongle has its own (and is paired with one pad), and it
    follows the dongle from port to port, so it tells two identical pads apart."""
    here = usb_device_dir(dev)
    if not here:
        return ""
    try:
        with open(os.path.join(here, "serial")) as f:
            return f.read().strip()
    except OSError:
        return ""


# Dongles cut off by sleep_pads, so a daemon restart in the middle can bring
# them back (/run is cleared on boot, when they come back on their own).
ASLEEP_FILE = "/run/pioneer-tv/dongles-off"


def _authorize(path: str, on: bool) -> bool:
    try:
        with open(os.path.join(path, "authorized"), "w") as f:
            f.write("1" if on else "0")
        return True
    except OSError as exc:
        log.warning("%s: could not %s it: %s", path, "authorize" if on else "deauthorize", exc)
        return False


def same_hardware(dev: evdev.InputDevice, pads: list[evdev.InputDevice]) -> bool:
    """Whether dev is another interface of a gamepad. The 8BitDo Ultimate 2C's
    2.4 GHz dongle shows up as a gamepad plus a "Keyboard" and a "Mouse" with
    full key tables; that keyboard is the pad's own, not one someone typed on,
    and counting it switched the on-screen keyboard off and turned X into Space."""
    base = usb_base(dev)
    for pad in pads:
        if base and base == usb_base(pad):
            return True
        if (dev.info.vendor, dev.info.product) == (pad.info.vendor, pad.info.product) and dev.info.vendor:
            return True
    return False


class GamepadManager:
    def __init__(self, cfg: dict, dispatcher: Dispatcher, mouse: MouseDriver,
                 on_change: Callable[..., Coroutine],
                 on_keyboard: Callable[[bool], Coroutine] | None = None,
                 on_active: Callable[[dict], Coroutine] | None = None) -> None:
        self.cfg = cfg
        self.dispatcher = dispatcher
        self.mouse = mouse
        self.on_change = on_change
        self.on_keyboard = on_keyboard
        self.active: dict[str, asyncio.Task] = {}
        self.instances: dict[str, Gamepad] = {}
        self.shared = {"passthrough": False, "active": None, "notify_active": on_active}
        self._passthrough_until = 0.0
        self.keyboards: set[str] = set()
        self.keyboard_present = False
        # Pads found by the first scan were there before the daemon started
        # (a restart, an update): not a pad just switched on.
        self.first_scan = True

    def pads(self) -> list[Gamepad]:
        return list(self.instances.values())

    async def sleep_pads(self) -> None:
        """Put the pads to sleep, with the TV going off. There is no command
        to switch a pad off over its dongle (xpad, the Xbox 360 protocol), but
        an 8BitDo that loses its dongle looks for it for about a minute and
        then switches itself off: so the dongles are cut off (USB authorized
        = 0) for gamepad.sleep_seconds and then let back in. A Bluetooth pad
        is disconnected and goes to sleep on its own."""
        seconds = float(self.cfg["gamepad"].get("sleep_seconds", 90))
        dongles: set[str] = set()
        for pad in self.pads():
            phys = (pad.dev.phys or "").lower()
            if phys.startswith("usb-"):
                path = usb_device_dir(pad.dev)
                if path:
                    dongles.add(path)
            elif pad.dev.uniq:                      # Bluetooth: its address
                try:
                    proc = await asyncio.create_subprocess_exec("bluetoothctl", "disconnect", pad.dev.uniq,
                                                                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                    await asyncio.wait_for(proc.wait(), 10)
                    log.info("%s: disconnected, to sleep", pad.label)
                except (OSError, asyncio.TimeoutError) as exc:
                    log.warning("%s: could not disconnect: %s", pad.label, exc)
        if not dongles:
            return
        off = [p for p in sorted(dongles) if _authorize(p, False)]
        if not off:
            return
        try:
            os.makedirs(os.path.dirname(ASLEEP_FILE), exist_ok=True)
            with open(ASLEEP_FILE, "w") as f:
                f.write("\n".join(off))
        except OSError:
            pass
        log.info("pads to sleep: %d dongle(s) cut off for %.0f s", len(off), seconds)
        asyncio.get_running_loop().call_later(seconds, lambda: asyncio.ensure_future(self.wake_dongles()))

    async def wake_dongles(self) -> None:
        """Let the dongles sleep_pads cut off back in (also after a restart)."""
        try:
            with open(ASLEEP_FILE) as f:
                paths = [l.strip() for l in f if l.strip()]
        except OSError:
            return
        for p in paths:
            _authorize(p, True)
        try:
            os.remove(ASLEEP_FILE)
        except OSError:
            pass
        log.info("dongles back: %d", len(paths))

    def active_pad(self) -> dict | None:
        """The pad last used, or the only one connected."""
        pads = self.pads()
        for pad in pads:
            if (pad.serial or pad.dev.path) == self.shared.get("active"):
                return pad.identity()
        return pads[0].identity() if len(pads) == 1 else None

    async def set_passthrough(self, on: bool, ttl: float = 12.0) -> bool:
        """Game mode. Kept alive by heartbeats; expires on its own if the page vanishes."""
        changed = on != self.shared["passthrough"]
        self.shared["passthrough"] = on
        self._passthrough_until = time.monotonic() + ttl if on else 0.0
        if changed:
            log.info("gamepad passthrough %s", "on" if on else "off")
            for pad in self.pads():
                await pad.release_everything()
            self.dispatcher.vinput.release_all()
        return changed

    def passthrough_expired(self) -> bool:
        return self.shared["passthrough"] and time.monotonic() > self._passthrough_until

    async def run(self) -> None:
        while True:
            try:
                await self.scan()
                if self.passthrough_expired():
                    await self.set_passthrough(False)
            except Exception as exc:
                log.warning("scan failed: %s", exc)
            await asyncio.sleep(2)

    async def scan(self) -> None:
        present = set()
        keyboards = set()
        candidates = []          # keyboards, judged once every gamepad of this scan is known
        for path in evdev.list_devices():
            if path in self.active:
                present.add(path)
                continue
            try:
                dev = evdev.InputDevice(path)
            except OSError:
                continue
            if is_gamepad(dev):
                present.add(path)
                pad = Gamepad(dev, self.cfg, self.dispatcher, self.mouse, self.shared)
                self.instances[path] = pad
                self.active[path] = asyncio.create_task(pad.run())
                log.info("gamepad connected: %s", pad.label)
                await self.on_change(True, dev.name, pad.label if pad.named else None, self.first_scan)
                continue
            if is_keyboard(dev):
                candidates.append(dev)
                continue
            dev.close()
        self.first_scan = False
        pads = [pad.dev for pad in self.instances.values()]
        for dev in candidates:
            if not same_hardware(dev, pads):
                keyboards.add(dev.path)
            dev.close()
        for path in list(self.active):
            if path not in present or self.active[path].done():
                self.active.pop(path).cancel()
                pad = self.instances.pop(path, None)
                name = pad.dev.name if pad else path
                log.info("gamepad removed: %s", pad.label if pad else path)
                await self.on_change(False, name, pad.label if pad and pad.named else None)
        if keyboards != self.keyboards:
            self.keyboards = keyboards
            self.keyboard_present = bool(keyboards)
            log.info("physical keyboard %s", "present" if keyboards else "absent")
            if self.on_keyboard:
                await self.on_keyboard(self.keyboard_present)
