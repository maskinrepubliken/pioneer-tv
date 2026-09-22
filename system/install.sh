#!/bin/bash
# Installs Pioneer TV on Raspberry Pi OS (64-bit, Bookworm or Trixie) on a
# Raspberry Pi 4 with 4 GB. Run as root from the repo:
#   sudo system/install.sh
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
TARGET=/opt/pioneer-tv
USER_NAME=${PIONEER_TV_USER:-pi}
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
BOOT=/boot/firmware
[ -d "$BOOT" ] || BOOT=/boot

MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo unknown)
case "$MODEL" in
  *"Pi 4"*|*"Pi 400"*|*"Compute Module 4"*) ;;
  *) echo "warning: Pioneer TV is built for a Raspberry Pi 4 (4 GB); this is '$MODEL'. Continuing anyway." >&2 ;;
esac
# 720p: players cap stream quality to the window, and 1080p in a browser drops
# frames on this board under every flag set we measured.
MODE=1280x720@60
mkdir -p /etc/pioneer-tv
rm -f /etc/pioneer-tv/mode   # an older installer let the mode be chosen
echo "== board: $MODEL ($MODE)"

echo "== preflight"
FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
ROOT_DEV=$(findmnt -n -o SOURCE / || true)
if [ "$FREE_MB" -lt 1500 ] && [ "${PIONEER_TV_SKIP_APT:-0}" != "1" ]; then
  echo "Only ${FREE_MB} MB free on / (${ROOT_DEV}); the packages need about 1.5 GB." >&2
  echo "If the root filesystem was never expanded, run:" >&2
  echo "  sudo raspi-config nonint do_expand_rootfs && sudo reboot" >&2
  echo "Otherwise free space with: sudo apt-get clean; sudo journalctl --vacuum-size=50M" >&2
  echo "Set PIONEER_TV_IGNORE_SPACE=1 to try anyway." >&2
  [ "${PIONEER_TV_IGNORE_SPACE:-0}" = "1" ] || exit 1
fi

REQUIRED="weston seatd v4l-utils bluez python3 python3-evdev python3-aiohttp rsync git curl pipewire pipewire-pulse wireplumber pipewire-alsa fonts-noto-core"
missing_required() { for p in $REQUIRED; do dpkg -s "$p" >/dev/null 2>&1 || return 0; done; return 1; }
# Skipping apt is for quick reinstalls; a required package that is not there yet gets installed anyway.
if [ "${PIONEER_TV_SKIP_APT:-0}" = "1" ] && missing_required; then
  echo "== packages: required packages missing, installing despite PIONEER_TV_SKIP_APT"
  PIONEER_TV_SKIP_APT=0
fi
if [ "${PIONEER_TV_SKIP_APT:-0}" != "1" ]; then
echo "== packages"
export DEBIAN_FRONTEND=noninteractive
# A box on weak Wi-Fi may not reach the mirrors right now; the packages it
# already has are what matters, so a failed refresh is a warning.
apt-get update || echo "warning: apt-get update failed, installing from the package lists we have" >&2
# shellcheck disable=SC2086
apt-get install -y --no-install-recommends $REQUIRED
# Raspberry Pi OS ships its own Chromium build (with Widevine and the V4L2
# decoder patches). On Trixie the package is chromium and chromium-browser is
# an empty transitional package, so ask for chromium first: asking for the
# dummy would report "already the newest version" and never upgrade.
apt-get install -y --no-install-recommends chromium \
  || apt-get install -y --no-install-recommends chromium-browser
# Nice to have; not present on every image.
# bluez-firmware carries the onboard chip's patch file; the kernel (hci_bcm)
# attaches the chip itself on Bookworm, no hciuart service needed.
for p in bluez-firmware firmware-brcm80211 libwidevinecdm0 zram-tools fonts-noto-color-emoji; do
  apt-get install -y --no-install-recommends "$p" || echo "warning: $p not available, continuing"
done
fi

echo "== files"
mkdir -p "$TARGET" /etc/pioneer-tv "$HOME_DIR/.config"
rsync -a --delete "$REPO/extension/" "$TARGET/extension/"
rsync -a --delete "$REPO/daemon/" "$TARGET/daemon/"
rsync -a "$REPO/system/" "$TARGET/system/"
chmod +x "$TARGET/system/start-chromium.sh" "$TARGET/system/update.sh" "$TARGET/system/chromium-debug.sh" "$TARGET/system/open-launcher.py"
mkdir -p /var/lib/pioneer-tv
[ -f /etc/pioneer-tv/config.toml ] || cp "$REPO/daemon/config.example.toml" /etc/pioneer-tv/config.toml
# Config migrations: rewrite lines that still carry an old default verbatim.
sed -i \
  -e 's|^BTN_EAST   = { key = "KEY_ESC" }$|BTN_EAST   = { key = "KEY_ESC", long = { system = "back" } }       # hold B: one page back|' \
  -e 's|^BTN_NORTH  = { system = "keyboard" }$|BTN_NORTH  = { system = "keyboard", long = { system = "menu" } }  # hold Y: quick menu|' \
  -e 's|^color = "#b5122b"$|color = "#b8940c"|' \
  -e 's|^auto_connect = false$|auto_connect = true|' \
  -e 's|^reconnect_interval = 60 .*|reconnect_interval = 300     # seconds|' \
  -e 's|^tagline = "Serier, nyheter och dokumentärer"$|tagline = "Public service"|' \
  -e 's|100\.123\.142\.8:8080/|100.123.142.8:8081/|g' \
  -e 's|8081/search?searchTerm={query}|8081/search?search={query}|' \
  -e 's|^name = "RomM"$|name = "Spel"|' \
  -e 's|^tagline = "Retrospel"$|tagline = "RomM"|' \
  -e 's|^hz = 30$|hz = 60              # pointer steps per second; the extension applies them per frame|' \
  -e 's|^mode = "virtual"     # the extension draws and drives the pointer; "uinput" crashes Weston on the Pi 3$|mode = "virtual"     # the extension draws and drives the pointer; "uinput" is a real mouse device (see README)|' \
  /etc/pioneer-tv/config.toml
# New default services are appended once; edit or remove them on the Tjänster page.
if ! grep -q '^id = "romm"' /etc/pioneer-tv/config.toml; then
  sed -n '/^\[\[services\]\]$/,$p' "$REPO/daemon/config.example.toml" | awk 'BEGIN{RS=""; ORS="\n\n"} /id = "romm"/' >> /etc/pioneer-tv/config.toml
fi
[ -f /etc/pioneer-tv/chromium.env ] || cp "$REPO/system/chromium.env" /etc/pioneer-tv/chromium.env
sed "s/@MODE@/$MODE/" "$REPO/system/weston.ini" > "$HOME_DIR/.config/weston.ini"
cat > /etc/pioneer-tv/board.env <<EOF
# Written by install.sh; start-chromium.sh reads the window size from it.
PIONEER_TV_WIDTH=${MODE%%x*}
PIONEER_TV_HEIGHT=$(echo "$MODE" | sed 's/^[0-9]*x//; s/@.*//')
EOF
chown -R "$USER_NAME:$USER_NAME" "$HOME_DIR/.config"
cp "$REPO/system/99-pioneer-tv.rules" /etc/udev/rules.d/
# Sound: PipeWire runs as the kiosk user; WirePlumber sends everything to HDMI.
mkdir -p "$HOME_DIR/.config/wireplumber/wireplumber.conf.d"
cp "$REPO/system/wireplumber-pioneer-tv.conf" "$HOME_DIR/.config/wireplumber/wireplumber.conf.d/50-pioneer-tv.conf"
# Chromium policies: no translate bubble, password prompts, notifications, sign-in.
mkdir -p /etc/chromium/policies/managed
cp "$REPO/system/chromium-policies.json" /etc/chromium/policies/managed/pioneer-tv.json
cp "$REPO/system/pioneer-tv-daemon.service" "$REPO/system/pioneer-tv-weston.service" "$REPO/system/pioneer-tv-governor.service" /etc/systemd/system/

echo "$REPO" > /etc/pioneer-tv/repo

echo "== groups"
usermod -aG video,render,input,audio "$USER_NAME"

echo "== kernel / firmware"
# The FAT boot partition ends up read-only after an unclean shutdown.
mount -o remount,rw "$BOOT" 2>/dev/null || true
if touch "$BOOT/.pioneer-tv-write-test" 2>/dev/null; then
  rm -f "$BOOT/.pioneer-tv-write-test"
  grep -q '^dtoverlay=vc4-kms-v3d' "$BOOT/config.txt" || echo 'dtoverlay=vc4-kms-v3d' >> "$BOOT/config.txt"
  grep -q '^disable_overscan=1' "$BOOT/config.txt" || echo 'disable_overscan=1' >> "$BOOT/config.txt"
  # temp_soft_limit is a Pi 3B+ knob; the Pi 4 has no soft limit (it scales
  # voltage and frequency instead), so an earlier install's line is removed.
  sed -i '/^temp_soft_limit=/d' "$BOOT/config.txt"
  if grep -q 'video=HDMI-A-1' "$BOOT/cmdline.txt"; then
    sed -i "s/video=HDMI-A-1:[^ ]*/video=HDMI-A-1:${MODE}D/" "$BOOT/cmdline.txt"
  else
    sed -i "1 s/\$/ video=HDMI-A-1:${MODE}D/" "$BOOT/cmdline.txt"
  fi
else
  echo "warning: $BOOT is not writable (read-only after an unclean shutdown?)." >&2
  echo "  Repair with: sudo umount $BOOT && sudo fsck.fat -a $(findmnt -n -o SOURCE "$BOOT" || echo /dev/mmcblk0p1) && sudo mount $BOOT" >&2
  echo "  Skipping config.txt/cmdline.txt (video mode); rerun the installer afterwards." >&2
fi
# Wi-Fi power saving on the Pi's radio causes latency spikes and stalls while
# streaming; keep the radio awake. Applies to every Wi-Fi connection.
if [ -d /etc/NetworkManager ]; then
  mkdir -p /etc/NetworkManager/conf.d
  printf '[connection]\nwifi.powersave = 2\n' > /etc/NetworkManager/conf.d/90-pioneer-tv-wifi.conf
  for c in $(nmcli -t -f NAME,TYPE connection show 2>/dev/null | awk -F: '$2 ~ /wireless/ {print $1}'); do
    nmcli connection modify "$c" 802-11-wireless.powersave 2 2>/dev/null || true
  done
  iw dev wlan0 set power_save off 2>/dev/null || true
fi
# Bluetooth: Xbox controllers need ERTM off to pair.
echo 'options bluetooth disable_ertm=1' > /etc/modprobe.d/pioneer-tv-bluetooth.conf
# BlueZ: answer pages from pads quickly, retry a dropped HID link ourselves,
# accept a pad that re-pairs, power the adapter as soon as it appears.
BT_CONF=/etc/bluetooth/main.conf
if [ -f "$BT_CONF" ]; then
  BT_BEFORE=$(md5sum "$BT_CONF")
  sed -i \
    -e 's|^#\?FastConnectable *=.*|FastConnectable = true|' \
    -e 's|^#\?JustWorksRepairing *=.*|JustWorksRepairing = always|' \
    -e 's|^#\?ReconnectUUIDs=\(.*\)|ReconnectUUIDs=00001124-0000-1000-8000-00805f9b34fb,\1|' \
    -e 's|^#\?ReconnectAttempts=.*|ReconnectAttempts=7|' \
    -e 's|^#\?ReconnectIntervals=.*|ReconnectIntervals=1,2,4,8,16,32,64|' \
    -e 's|^#\?AutoEnable=.*|AutoEnable=true|' \
    -e 's|^#\?ReverseServiceDiscovery *=.*|ReverseServiceDiscovery = false|' \
    "$BT_CONF"
  # Gamepads (Stratus XL among them) drop the link when BlueZ re-runs service
  # discovery on every incoming connection; the key must exist to be off.
  grep -q '^ReverseServiceDiscovery' "$BT_CONF" || sed -i '/^\[General\]/a ReverseServiceDiscovery = false' "$BT_CONF"
  # sed above may prepend the HID UUID twice on a rerun; keep one.
  sed -i 's|^ReconnectUUIDs=\(00001124-0000-1000-8000-00805f9b34fb,\)\+|ReconnectUUIDs=00001124-0000-1000-8000-00805f9b34fb,|' "$BT_CONF"
  [ "$BT_BEFORE" = "$(md5sum "$BT_CONF")" ] || systemctl try-restart bluetooth || true
fi
# uinput at boot
echo uinput > /etc/modules-load.d/pioneer-tv.conf

echo "== performance"
if [ -f /etc/default/zramswap ]; then
  sed -i 's/^#\?PERCENT=.*/PERCENT=60/; s/^#\?ALGO=.*/ALGO=lz4/' /etc/default/zramswap
fi
echo 'vm.swappiness=100' > /etc/sysctl.d/90-pioneer-tv.conf

echo "== services"
systemctl daemon-reload
systemctl disable getty@tty1.service || true
systemctl set-default graphical.target
systemctl enable seatd bluetooth pioneer-tv-governor.service
systemctl disable hciuart 2>/dev/null || true   # legacy; fails on Bookworm's kernel-attached Bluetooth
rfkill unblock bluetooth 2>/dev/null || true
systemctl enable zramswap 2>/dev/null || true
systemctl enable pioneer-tv-daemon.service pioneer-tv-weston.service
# The user's service manager (and with it PipeWire) must be up before the display starts.
loginctl enable-linger "$USER_NAME" || true
if systemctl --user --machine="$USER_NAME@.host" is-active pipewire >/dev/null 2>&1 || systemctl --user --machine="$USER_NAME@.host" list-units >/dev/null 2>&1; then
  systemctl --user --machine="$USER_NAME@.host" enable --now pipewire pipewire-pulse wireplumber 2>/dev/null || true
  systemctl --user --machine="$USER_NAME@.host" restart wireplumber 2>/dev/null || true
fi
# Pick up new code if the box is already running (no-op on first install).
systemctl try-restart pioneer-tv-daemon.service pioneer-tv-weston.service || true

cat <<MSG

Pioneer TV installed to $TARGET ($MODE).
  config:   /etc/pioneer-tv/config.toml
  chromium: /etc/pioneer-tv/chromium.env
Pair a gamepad with bluetoothctl (scan on / pair / trust / connect), then reboot.
MSG
