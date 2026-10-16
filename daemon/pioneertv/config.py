"""Configuration: TOML file merged over built-in defaults."""
from __future__ import annotations

import copy
import tomllib
from pathlib import Path
from typing import Any

DEFAULT_PATHS = [Path("/etc/pioneer-tv/config.toml"), Path(__file__).resolve().parent.parent / "config.toml"]

DEFAULTS: dict[str, Any] = {
    "daemon": {"host": "127.0.0.1", "port": 8765, "log_level": "info"},
    "cec": {
        "enabled": True,
        "device": "/dev/cec0",
        "osd_name": "Pioneer TV",
        "tv_address": 0,
        "tv_on_gamepad_connect": True,
        "wake_on_input": True,      # a pad button while the TV is off turns it on instead
        "home_on_standby": True,    # the TV going to standby sends the box back to the launcher
        "monitor": True,
        # TV remote key (cec-ctl ui-cmd name) → action
        "remote": {
            "up": {"key": "KEY_UP"},
            "down": {"key": "KEY_DOWN"},
            "left": {"key": "KEY_LEFT"},
            "right": {"key": "KEY_RIGHT"},
            "select": {"key": "KEY_ENTER"},
            "exit": {"key": "KEY_ESC"},
            "back": {"key": "KEY_ESC"},
            "ac-back": {"key": "KEY_ESC"},
            "root-menu": {"system": "home"},
            "setup-menu": {"system": "menu"},
            "contents-menu": {"system": "menu"},
            "play": {"key": "KEY_SPACE"},
            "pause": {"key": "KEY_SPACE"},
            "stop": {"key": "KEY_SPACE"},
            "rewind": {"key": "KEY_LEFT"},
            "fast-forward": {"key": "KEY_RIGHT"},
        },
    },
    "gamepad": {
        "stick_deadzone": 0.45,      # left stick acts as a d-pad past this
        "trigger_threshold": 0.5,
        "long_press_ms": 800,
        "repeat_ms": 220,            # for actions marked repeat = true
        # Turning the TV off from the box puts the pads to sleep: their dongles
        # are cut off this long, past the minute an 8BitDo looks for one.
        "sleep_with_tv": True,
        "sleep_seconds": 90,
        "unipolar_axes": ["ABS_Z", "ABS_RZ", "ABS_BRAKE", "ABS_GAS", "ABS_THROTTLE"],
        "invert_axes": [],           # e.g. ["ABS_Y", "ABS_RY"]; Nintendo pads get this automatically
        "buttons": {
            # Pads whose d-pad is buttons rather than a hat (Nintendo, some 8BitDo modes).
            "BTN_DPAD_UP": {"key": "KEY_UP"},
            "BTN_DPAD_DOWN": {"key": "KEY_DOWN"},
            "BTN_DPAD_LEFT": {"key": "KEY_LEFT"},
            "BTN_DPAD_RIGHT": {"key": "KEY_RIGHT"},
            "BTN_SOUTH": {"key": "KEY_ENTER"},
            "BTN_EAST": {"key": "KEY_ESC", "long": {"system": "back"}},      # hold: one page back
            "BTN_WEST": {"key": "KEY_SPACE"},
            "BTN_NORTH": {"system": "keyboard"},   # Y: the keyboard, and only that
            "BTN_TL": {"key": "KEY_TAB", "modifiers": ["KEY_LEFTSHIFT"]},  # previous focusable
            "BTN_TR": {"key": "KEY_TAB"},                                  # next focusable
            "BTN_TL2": {"cec": "volume_down", "repeat": True},
            "BTN_TR2": {"cec": "volume_up", "repeat": True},
            "BTN_SELECT": {"system": "status"},
            "BTN_START": {"system": "menu"},
            "BTN_MODE": {"system": "menu", "long": {"system": "home"}},
            "BTN_THUMBL": {"mouse_button": "BTN_RIGHT"},
            "BTN_THUMBR": {"mouse_button": "BTN_LEFT"},
        },
        "axes": {
            "ABS_HAT0X": {"negative": {"key": "KEY_LEFT"}, "positive": {"key": "KEY_RIGHT"}},
            "ABS_HAT0Y": {"negative": {"key": "KEY_UP"}, "positive": {"key": "KEY_DOWN"}},
            "ABS_X": {"negative": {"key": "KEY_LEFT"}, "positive": {"key": "KEY_RIGHT"}},
            "ABS_Y": {"negative": {"key": "KEY_UP"}, "positive": {"key": "KEY_DOWN"}},
            "ABS_RX": {"mouse": "x"},
            "ABS_RY": {"mouse": "y"},
            "ABS_Z": {"positive": {"cec": "volume_down", "repeat": True}},
            "ABS_RZ": {"positive": {"cec": "volume_up", "repeat": True}},
        },
    },
    # mode "virtual": the extension draws and drives the pointer (no Wayland pointer, see README).
    # mode "uinput": a real virtual mouse device, for a compositor that can show a cursor.
    "mouse": {"mode": "virtual", "deadzone": 0.15, "max_speed": 1100.0, "curve": 2.0, "hz": 60},
    # volume_toast: our own "Volym +/−" note; off, since the TV shows its own volume.
    "ui": {"auto_keyboard": True, "volume_toast": False},
    "chromium": {"log_file": "/home/pi/.pioneer-tv/chromium.log"},
    "remote": {"token": ""},
    # RomM for the Spel pages: base URL and a client API token (see /romm/ in server.py).
    "romm": {"url": "", "api_key": ""},
    # Games: played in RetroArch on the TV's Weston (games.py). A console is
    # offered when its core is in place; pioneer-tv-cores.service installs
    # Debian's and builds the rest (system/build-cores.sh).
    "games": {
        "enabled": True,
        "retroarch": "/usr/bin/retroarch",
        "user": "pi",
        "wayland_display": "wayland-1",
        "dir": "/var/lib/pioneer-tv/games",
        "cache_mb": 800,
        "port": 55355,
        # Through PipeWire's PulseAudio side: N64 sound stuttered with
        # RetroArch's own pipewire driver and 64 ms (heard on the TV).
        "audio_driver": "pulse",
        "audio_latency": 128,
        "cores": {
            "nes": "/usr/lib/aarch64-linux-gnu/libretro/nestopia_libretro.so",
            "snes": "/usr/lib/aarch64-linux-gnu/libretro/snes9x_libretro.so",
            "genesis": "/usr/lib/aarch64-linux-gnu/libretro/genesis_plus_gx_libretro.so",
            "n64": "/var/lib/pioneer-tv/cores/mupen64plus_next_libretro.so",
            "dos": "/var/lib/pioneer-tv/cores/dosbox_pure_libretro.so",
        },
    },
    # Pads by the serial number of their USB device (a 2.4 GHz dongle):
    # {"<serial>": {"name": ..., "pointer": "#rrggbb", "accent": "#rrggbb",
    # "highlight": "#rrggbb"}}: pointer fill, focus ring, and what is ochre.
    "pads": {},
    "bluetooth": {"auto_connect": True, "reconnect_interval": 300},
    "services": [],
}


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load(path: str | None = None) -> dict:
    candidates = [Path(path)] if path else DEFAULT_PATHS
    for p in candidates:
        if p.is_file():
            with open(p, "rb") as f:
                data = tomllib.load(f)
            cfg = _merge(DEFAULTS, data)
            cfg["_path"] = str(p)
            return cfg
    cfg = copy.deepcopy(DEFAULTS)
    cfg["_path"] = None
    return cfg
