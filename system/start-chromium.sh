#!/bin/bash
# Launches Chromium in kiosk mode with the Pioneer TV extension.
# Started by Weston's autolaunch (see weston.ini). Edit /etc/pioneer-tv/chromium.env
# to add flags or change the profile location.
#
# GPU: a Pi 4/5 (VideoCore VI/VII) composites and rasterises on the GPU. The
# Pi 3's VideoCore IV only offers OpenGL ES 2.0 while Chromium wants ES 3.0, so
# there Chromium runs with --disable-gpu; forcing the GPU on a Pi 3 gives a grey
# screen that never paints. The board comes from /etc/pioneer-tv/board.env.
set -u

# Board facts from the installer, then site overrides, so both take effect below.
[ -f /etc/pioneer-tv/board.env ] && . /etc/pioneer-tv/board.env
[ -f /etc/pioneer-tv/chromium.env ] && . /etc/pioneer-tv/chromium.env
BOARD=${PIONEER_TV_BOARD:-pi3}
WIDTH=${PIONEER_TV_WIDTH:-1280}
HEIGHT=${PIONEER_TV_HEIGHT:-720}
if [ -z "${PIONEER_TV_GPU_FLAGS+x}" ]; then
  if [ "$BOARD" = pi4 ]; then
    GPU_FLAGS="--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy"
  else
    GPU_FLAGS="--disable-gpu"
  fi
else
  GPU_FLAGS=$PIONEER_TV_GPU_FLAGS
fi
PIONEER_TV_DIR=${PIONEER_TV_DIR:-/opt/pioneer-tv}
EXT_ID=dpigdefepjjejbkidlabpjlnleidgjaf
PROFILE=${PIONEER_TV_PROFILE:-$HOME/.pioneer-tv/chromium}
CACHE=${PIONEER_TV_CACHE:-/dev/shm/pioneer-tv-cache}   # RAM: the SD card must never be in the playback path
EXTRA_FLAGS=${PIONEER_TV_CHROMIUM_FLAGS:-}

LOG=${PIONEER_TV_CHROMIUM_LOG:-$HOME/.pioneer-tv/chromium.log}
mkdir -p "$PROFILE" "$CACHE" "$(dirname "$LOG")"
# Weston does not pass our output to the journal; keep the last run's log.
exec > "$LOG" 2>&1

# Clear "restore session" prompts left by hard power cuts.
for f in "$PROFILE/Default/Preferences"; do
  [ -f "$f" ] && sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$f"
done

BIN=${PIONEER_TV_CHROMIUM_BIN:-$(command -v chromium-browser || command -v chromium)}
DEVTOOLS_PORT=${PIONEER_TV_DEVTOOLS_PORT:-9222}   # 127.0.0.1 only; used to open the launcher
echo "pioneer-tv: $($BIN --version 2>/dev/null), board $BOARD ${WIDTH}x${HEIGHT}, extension $PIONEER_TV_DIR/extension ($(grep -o '"version": "[^"]*"' "$PIONEER_TV_DIR/extension/manifest.json")), gpu: $GPU_FLAGS, extra: ${EXTRA_FLAGS:-none}"

# Open the launcher through the DevTools port once Chromium is up (see open-launcher.py).
python3 "$PIONEER_TV_DIR/system/open-launcher.py" "$DEVTOOLS_PORT" "$EXT_ID" 120 &

"$BIN" \
  --remote-debugging-port="$DEVTOOLS_PORT" \
  --ozone-platform=wayland \
  --kiosk \
  --window-size="$WIDTH,$HEIGHT" \
  --window-position=0,0 \
  --user-data-dir="$PROFILE" \
  --disk-cache-dir="$CACHE" \
  --disk-cache-size=200000000 \
  --load-extension="$PIONEER_TV_DIR/extension" \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI,MediaRouter,DisableLoadExtensionCommandLineSwitch \
  --autoplay-policy=no-user-gesture-required \
  --enable-accelerated-video-decode \
  $GPU_FLAGS \
  --password-store=basic \
  --check-for-update-interval=31536000 \
  --lang=sv-SE \
  $EXTRA_FLAGS \
  "about:blank" &
CHROMIUM_PID=$!
# Exit when Chromium exits so Weston's autolaunch watch restarts everything.
wait "$CHROMIUM_PID"
