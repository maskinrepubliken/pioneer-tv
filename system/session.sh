#!/bin/bash
# Pioneer TV display session, run by labwc (pioneer-tv-display.service,
# labwc -S): sets the TV's mode, starts the overlay, then Chromium. labwc
# exits when this does, so a Chromium that quits restarts the whole display
# under systemd, as with Weston before.
[ -f /etc/pioneer-tv/board.env ] && . /etc/pioneer-tv/board.env
WIDTH=${PIONEER_TV_WIDTH:-1280}
HEIGHT=${PIONEER_TV_HEIGHT:-720}
PIONEER_TV_DIR=${PIONEER_TV_DIR:-/opt/pioneer-tv}

# Players cap stream quality to the window size, and 1080p in a browser drops
# frames on a Pi 4: the TV gets 1280x720 (or its scaling when it has no such mode).
wlr-randr --output HDMI-A-1 --mode "${WIDTH}x${HEIGHT}@60" 2>&1 || wlr-randr --output HDMI-A-1 --custom-mode "${WIDTH}x${HEIGHT}@60" 2>&1 || true

# The overlay draws the box's own panels over any window (overlay.py).
if [ -x "$PIONEER_TV_DIR/system/overlay.py" ]; then
  "$PIONEER_TV_DIR/system/overlay.py" &
fi

exec "$PIONEER_TV_DIR/system/start-chromium.sh"
