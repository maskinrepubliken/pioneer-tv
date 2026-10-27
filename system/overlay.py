#!/usr/bin/python3
"""Pioneer TV overlay: the box's own panels over every window.

A WebKit view, transparent, on labwc's overlay layer (wlr-layer-shell, via
gtk4-layer-shell), showing the daemon's /ext/overlay/ page: every menu (the
main menu with Inställningar, the pause panels) and every toast, drawn
over Chromium, RetroArch and mpv alike. Started by
session.sh. The page says when its menu opens and closes; the window takes
the keyboard only then, so the rest of the time every key goes to the window
below and the overlay is only seen. A page that fails to load (the daemon
not up yet) is tried again every few seconds.
"""
import json
import os
import sys

# gtk4-layer-shell has to be loaded before libwayland: start again with it
# preloaded when it is not.
LIB = "libgtk4-layer-shell.so.0"
if LIB not in os.environ.get("LD_PRELOAD", ""):
    for d in ("/usr/lib/aarch64-linux-gnu", "/usr/lib/x86_64-linux-gnu", "/usr/lib"):
        if os.path.exists(os.path.join(d, LIB)):
            os.environ["LD_PRELOAD"] = ":".join(filter(None, [os.path.join(d, LIB), os.environ.get("LD_PRELOAD")]))
            os.execv(sys.executable, [sys.executable] + sys.argv)

os.environ.setdefault("GTK_A11Y", "none")     # no accessibility bus on the box

import gi  # noqa: E402

gi.require_version("Gdk", "4.0")
gi.require_version("Gtk", "4.0")
gi.require_version("Gtk4LayerShell", "1.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, GLib, Gtk, Gtk4LayerShell as Layer, WebKit  # noqa: E402

URL = os.environ.get("PIONEER_TV_OVERLAY_URL", "http://127.0.0.1:8765/ext/overlay/index.html")
RETRY_MS = 3000


class Overlay:
    def __init__(self, app: Gtk.Application) -> None:
        self.window = Gtk.Window(application=app, title="Pioneer TV overlay")
        Layer.init_for_window(self.window)
        Layer.set_layer(self.window, Layer.Layer.OVERLAY)
        Layer.set_namespace(self.window, "pioneer-tv-overlay")
        for edge in (Layer.Edge.TOP, Layer.Edge.BOTTOM, Layer.Edge.LEFT, Layer.Edge.RIGHT):
            Layer.set_anchor(self.window, edge, True)
        Layer.set_exclusive_zone(self.window, -1)     # over everything, moving nothing
        Layer.set_keyboard_mode(self.window, Layer.KeyboardMode.NONE)

        css = Gtk.CssProvider()
        css.load_from_string("window { background: transparent; }")
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        content = WebKit.UserContentManager()
        content.register_script_message_handler("pioneertv")
        content.connect("script-message-received::pioneertv", self.on_message)
        self.view = WebKit.WebView(user_content_manager=content)
        clear = Gdk.RGBA()
        clear.parse("rgba(0,0,0,0)")
        self.view.set_background_color(clear)
        self.view.connect("load-failed", self.on_load_failed)
        self.view.connect("web-process-terminated", lambda *_: self.retry())
        self.window.set_child(self.view)
        self.window.present()
        self.view.load_uri(URL)

    def on_message(self, _manager, value) -> None:
        try:
            msg = json.loads(value.to_string())
        except (ValueError, AttributeError):
            return
        if "keyboard" in msg:
            mode = Layer.KeyboardMode.EXCLUSIVE if msg["keyboard"] else Layer.KeyboardMode.NONE
            Layer.set_keyboard_mode(self.window, mode)

    def on_load_failed(self, _view, _event, uri, error) -> bool:
        print(f"overlay: {uri}: {error.message}; again in {RETRY_MS // 1000} s", file=sys.stderr, flush=True)
        self.retry()
        return True

    def retry(self) -> None:
        Layer.set_keyboard_mode(self.window, Layer.KeyboardMode.NONE)
        GLib.timeout_add(RETRY_MS, self.load)

    def load(self) -> bool:
        self.view.load_uri(URL)
        return False          # once, not every RETRY_MS


def main() -> None:
    app = Gtk.Application(application_id="se.maskinrepubliken.pioneertv.overlay")
    app.connect("activate", lambda a: setattr(a, "overlay", Overlay(a)))
    app.run([])


if __name__ == "__main__":
    main()
