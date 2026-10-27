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

# Packages are installed when missing, never upgraded here: an install runs
# on every update that touches this script, and pulling a new Chromium (about
# 170 MB) over the box's Wi-Fi made a one-line change take most of an hour.
# Upgrades happen at night instead (pioneer-tv-upgrade.timer, upgrade.sh).
REQUIRED="labwc wlr-randr mpv python3-gi gir1.2-gtk-4.0 gir1.2-webkit-6.0 gir1.2-gtk4layershell-1.0 weston seatd v4l-utils bluez python3 python3-evdev python3-aiohttp rsync git curl pipewire pipewire-pulse wireplumber pipewire-alsa fonts-noto-core"
missing_required() { for p in $REQUIRED; do dpkg -s "$p" >/dev/null 2>&1 || return 0; done; return 1; }

echo "== preflight"
# Downloaded package files are only a cache; an SD card has no room to spare.
apt-get clean 2>/dev/null || true
FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
ROOT_DEV=$(findmnt -n -o SOURCE / || true)
if [ "$FREE_MB" -lt 1500 ] && [ "${PIONEER_TV_SKIP_APT:-0}" != "1" ]; then
  if ! missing_required; then
    # Everything is installed already: this run only upgrades (Chromium,
    # mostly), which needs a fraction of a fresh install's 1.5 GB.
    echo "warning: only ${FREE_MB} MB free on / (${ROOT_DEV}); upgrading the installed packages anyway." >&2
  else
    echo "Only ${FREE_MB} MB free on / (${ROOT_DEV}); the packages need about 1.5 GB." >&2
    echo "If the root filesystem was never expanded, run:" >&2
    echo "  sudo raspi-config nonint do_expand_rootfs && sudo reboot" >&2
    echo "Otherwise free space with: sudo apt-get clean; sudo journalctl --vacuum-size=50M" >&2
    echo "Set PIONEER_TV_IGNORE_SPACE=1 to try anyway." >&2
    [ "${PIONEER_TV_IGNORE_SPACE:-0}" = "1" ] || exit 1
  fi
fi

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
if ! apt-get update; then
  # A list cut short by a dropped connection breaks every apt command after
  # it ("Problem with MergeList ..."; seen on the box in October). Fetch the
  # lists afresh once; if the mirrors are just out of reach, carry on.
  echo "warning: apt-get update failed; fetching the package lists afresh" >&2
  find /var/lib/apt/lists -maxdepth 1 -type f ! -name lock -delete
  apt-get update || echo "warning: apt-get update failed, installing from the package lists we have" >&2
fi
# shellcheck disable=SC2086
apt-get install -y --no-upgrade --no-install-recommends $REQUIRED
# Raspberry Pi OS ships its own Chromium build (with Widevine and the V4L2
# decoder patches). On Trixie the package is chromium and chromium-browser is
# an empty transitional package, so ask for chromium first: asking for the
# dummy would report "already the newest version" and never upgrade.
apt-get install -y --no-upgrade --no-install-recommends chromium \
  || apt-get install -y --no-upgrade --no-install-recommends chromium-browser
# Nice to have; not present on every image.
# bluez-firmware carries the onboard chip's patch file; the kernel (hci_bcm)
# attaches the chip itself on Bookworm, no hciuart service needed.
for p in bluez-firmware firmware-brcm80211 libwidevinecdm0 fonts-noto-color-emoji; do
  apt-get install -y --no-upgrade --no-install-recommends "$p" || echo "warning: $p not available, continuing"
done
fi

# Self-repair. An SD card that loses power mid-write can leave installed files
# damaged, and nothing reinstalls a package apt believes is current: in
# October the box's Chromium binary and resources.pak no longer matched their
# checksums after a power cut, and Chromium segfaulted at every start. So the
# packages the screen depends on are checked against dpkg's checksums on every
# install and update, and any that fail are reinstalled.
echo "== verify"
# Sound too: in October a damaged module in libpipewire-0.3-modules made
# PipeWire crash at every start, and the TV had picture but no sound.
VERIFY="chromium chromium-common libwidevinecdm0 labwc libwlroots-0.20 weston libweston-14-0 libgbm1 mesa-libgallium libegl-mesa0 libegl1 libgles2 libdrm2 libwayland-client0 libwayland-server0 python3-aiohttp python3-evdev pipewire pipewire-bin pipewire-pulse libpipewire-0.3-0t64 libpipewire-0.3-modules libspa-0.2-modules wireplumber libwireplumber-0.5-0 libasound2t64 retroarch openssh-server openssh-sftp-server openssh-client"
BROKEN=""
for p in $VERIFY; do
  dpkg -s "$p" >/dev/null 2>&1 || continue
  # Lines for conffiles (" c ") are local edits, not damage.
  if dpkg --verify "$p" 2>/dev/null | grep -qv ' c /'; then BROKEN="$BROKEN $p"; fi
done
if [ -n "$BROKEN" ]; then
  echo "  damaged files in:$BROKEN; reinstalling"
  apt-get update -qq || true
  # shellcheck disable=SC2086
  apt-get install -y --reinstall --no-install-recommends $BROKEN || echo "warning: reinstall failed for:$BROKEN" >&2
else
  echo "  all checked packages intact"
fi

echo "== files"
mkdir -p "$TARGET" /etc/pioneer-tv "$HOME_DIR/.config"
rsync -a --delete "$REPO/extension/" "$TARGET/extension/"
rsync -a --delete "$REPO/daemon/" "$TARGET/daemon/"
rsync -a "$REPO/system/" "$TARGET/system/"
chmod +x "$TARGET/system/start-chromium.sh" "$TARGET/system/update.sh" "$TARGET/system/upgrade.sh" "$TARGET/system/chromium-debug.sh" "$TARGET/system/open-launcher.py" "$TARGET/system/build-cores.sh"
mkdir -p /var/lib/pioneer-tv
[ -f /etc/pioneer-tv/config.toml ] || cp "$REPO/daemon/config.example.toml" /etc/pioneer-tv/config.toml
# Config migrations: rewrite lines that still carry an old default verbatim.
sed -i \
  -e 's|^BTN_EAST   = { key = "KEY_ESC" }$|BTN_EAST   = { key = "KEY_ESC", long = { system = "back" } }       # hold B: one page back|' \
  -e 's|^BTN_SELECT = { system = "status", long = { cec = "tv_toggle" } }$|BTN_SELECT = { system = "status" }|' \
  -e 's|^BTN_MODE   = { system = "home" }$|BTN_MODE   = { system = "menu", long = { system = "home" } }      # hold Home: the start page|' \
  -e 's|^BTN_NORTH  = { system = "keyboard" }$|BTN_NORTH  = { system = "keyboard", long = { system = "menu" } }  # hold Y: quick menu|' \
  -e 's|^color = "#b5122b"$|color = "#b8940c"|' \
  -e 's|^auto_connect = false$|auto_connect = true|' \
  -e 's|^reconnect_interval = 60 .*|reconnect_interval = 300     # seconds|' \
  -e 's|^tagline = "Serier, nyheter och dokumentärer"$|tagline = "Public service"|' \
  -e 's|100\.123\.142\.8:808[01]/|100.123.142.8:8090/|g' \
  -e 's|/search?searchTerm={query}|/search?search={query}|' \
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
# The launcher's second row (live TV and radio) arrives once: in config.toml
# and in the settings page's overlay, which overrides it once services have
# been edited there. A box that already has a live row is left alone; the old
# lone SVT1 tile moves into the row.
python3 - "$REPO/daemon/config.example.toml" /etc/pioneer-tv/config.toml /etc/pioneer-tv/settings.json <<'PYEOF'
import json, re, sys, tomllib
example, config, overlay = sys.argv[1:4]
live = [s for s in tomllib.load(open(example, "rb"))["services"] if s.get("row") == "live"]
ids = {s["id"] for s in live}
text = open(config).read()
if not re.search(r'^row = "live"', text, re.M):
    blocks = re.split(r"(?m)^(?=\[\[services\]\])", text)
    kept = [b for b in blocks if not re.search(r'^id = "(%s)"' % "|".join(map(re.escape, ids)), b, re.M)]
    tail = open(example).read()
    tail = tail[tail.index("# The second row"):]
    open(config, "w").write("".join(kept).rstrip("\n") + "\n\n" + tail)
    print("  config.toml: added the live row")
try:
    ov = json.load(open(overlay))
except (OSError, ValueError):
    ov = None
if ov and isinstance(ov.get("services"), list) and not any(s.get("row") == "live" for s in ov["services"]):
    ov["services"] = [s for s in ov["services"] if s.get("id") not in ids] + [{k: str(v) for k, v in s.items()} for s in live]
    open(overlay, "w").write(json.dumps(ov, ensure_ascii=False, indent=2))
    print("  settings.json: added the live row")
PYEOF

# The Film & serier tile opens our own page (film.html, videos in mpv)
# instead of Jellyfin's web UI, once: in config.toml and in the settings
# page's services, wherever it still points at Jellyfin's /web/.
python3 - /etc/pioneer-tv/config.toml /etc/pioneer-tv/settings.json <<'PYEOF'
import json, re, sys
config, overlay = sys.argv[1:3]
FILM = "http://127.0.0.1:8765/ext/launcher/film.html?tv=1"
text = open(config).read()
# Split at every table, not only at [[services]]: a service block that is
# the last one before [jellyfin] must not reach into it (its url = ...).
blocks = re.split(r"(?m)^(?=\[)", text)
for i, b in enumerate(blocks):
    if b.startswith("[[services]]") and re.search(r'^id = "jellyfin"', b, re.M) and re.search(r'^url = "[^"]*/web/"', b, re.M):
        b = re.sub(r'^url = .*$', f'url = "{FILM}"', b, flags=re.M)
        b = re.sub(r'^search_url = .*$', f'search_url = "{FILM}#/search/{{query}}"', b, flags=re.M)
        b = re.sub(r"^# The server's Tailscale address.*\n", "", b, flags=re.M)
        blocks[i] = b
        print("  config.toml: Film & serier opens film.html")
open(config, "w").write("".join(blocks))
try:
    ov = json.load(open(overlay))
except (OSError, ValueError):
    ov = None
if ov and isinstance(ov.get("services"), list):
    for s in ov["services"]:
        if s.get("id") == "jellyfin" and str(s.get("url", "")).rstrip("/").endswith("/web"):
            s["url"], s["search_url"] = FILM, FILM + "#/search/{query}"
            open(overlay, "w").write(json.dumps(ov, ensure_ascii=False, indent=2))
            print("  settings.json: Film & serier opens film.html")
PYEOF

sed "s/@MODE@/$MODE/" "$REPO/system/weston.ini" > "$HOME_DIR/.config/weston.ini"
cat > /etc/pioneer-tv/board.env <<EOF
# Written by install.sh; start-chromium.sh reads the window size from it.
PIONEER_TV_WIDTH=${MODE%%x*}
PIONEER_TV_HEIGHT=$(echo "$MODE" | sed 's/^[0-9]*x//; s/@.*//')
EOF
chown -R "$USER_NAME:$USER_NAME" "$HOME_DIR/.config"
# labwc's pointer, invisible (system/labwc/environment names the theme).
python3 "$REPO/system/blank-cursors.py" /usr/share/icons/pioneer-tv-blank
cp "$REPO/system/99-pioneer-tv.rules" /etc/udev/rules.d/
# Sound: PipeWire runs as the kiosk user; WirePlumber sends everything to HDMI.
mkdir -p "$HOME_DIR/.config/wireplumber/wireplumber.conf.d"
cp "$REPO/system/wireplumber-pioneer-tv.conf" "$HOME_DIR/.config/wireplumber/wireplumber.conf.d/50-pioneer-tv.conf"
# Chromium policies: no translate bubble, password prompts, notifications, sign-in.
mkdir -p /etc/chromium/policies/managed
cp "$REPO/system/chromium-policies.json" /etc/chromium/policies/managed/pioneer-tv.json
cp "$REPO/system/pioneer-tv-daemon.service" "$REPO/system/pioneer-tv-display.service" "$REPO/system/pioneer-tv-weston.service" \
   "$REPO/system/pioneer-tv-governor.service" \
   "$REPO/system/pioneer-tv-upgrade.service" "$REPO/system/pioneer-tv-upgrade.timer" \
   "$REPO/system/pioneer-tv-cores.service" /etc/systemd/system/

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
  # The box is never overclocked: both boots at 2.0 GHz (over_voltage=6,
  # GPU at 600 MHz) in October left damaged files on the SD card (PipeWire's
  # modules, then the SSH server would not start). Lines an earlier install
  # wrote are taken out; next boot.
  sed -i '/^arm_freq=/d; /^over_voltage=/d; /^gpu_freq=/d' "$BOOT/config.txt"
  # temp_soft_limit is a Pi 3B+ knob; the Pi 4 has no soft limit (it scales
  # voltage and frequency instead), so an earlier install's line is removed.
  sed -i '/^temp_soft_limit=/d' "$BOOT/config.txt"
  # The hardware watchdog that systemd pets (watchdog.conf, below).
  grep -q '^dtparam=watchdog=on' "$BOOT/config.txt" || echo 'dtparam=watchdog=on' >> "$BOOT/config.txt"
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

echo "== hangs and power cuts"
# A box that hangs resets itself (the hardware watchdog, 15 s; a kernel panic
# reboots after 10 s) instead of waiting for someone to pull the plug, and
# the journal is kept on the card, so the boot before a reset or a power cut
# can be read (journalctl -b -1).
# Each takes effect at once, and only when it changed: re-executing systemd
# under a running update leaves it complaining about the update's own unit.
mkdir -p /etc/systemd/system.conf.d /etc/systemd/journald.conf.d /var/log/journal
if ! cmp -s "$REPO/system/watchdog.conf" /etc/systemd/system.conf.d/pioneer-tv-watchdog.conf; then
  cp "$REPO/system/watchdog.conf" /etc/systemd/system.conf.d/pioneer-tv-watchdog.conf
  systemctl daemon-reexec 2>/dev/null || true
fi
if ! cmp -s "$REPO/system/journald.conf" /etc/systemd/journald.conf.d/pioneer-tv.conf; then
  cp "$REPO/system/journald.conf" /etc/systemd/journald.conf.d/pioneer-tv.conf
  systemd-tmpfiles --create --prefix /var/log/journal 2>/dev/null || true
  systemctl restart systemd-journald 2>/dev/null || true
  journalctl --flush 2>/dev/null || true
fi
echo 'kernel.panic = 10' > /etc/sysctl.d/91-pioneer-tv-panic.conf
sysctl -q -p /etc/sysctl.d/91-pioneer-tv-panic.conf 2>/dev/null || true

echo "== ssh keys"
# A fresh card knows no keys but the one it was set up with; the keys in
# system/authorized_keys are added (never removed), so the same machines can
# reach a reinstalled box.
mkdir -p "$HOME_DIR/.ssh"
touch "$HOME_DIR/.ssh/authorized_keys"
# A last line without its newline would have the first key glued onto it.
if [ -s "$HOME_DIR/.ssh/authorized_keys" ] && [ -n "$(tail -c1 "$HOME_DIR/.ssh/authorized_keys")" ]; then
  echo >> "$HOME_DIR/.ssh/authorized_keys"
fi
{ grep -v '^\(#\|$\)' "$REPO/system/authorized_keys" || true; } | while read -r key; do
  grep -qxF "$key" "$HOME_DIR/.ssh/authorized_keys" || echo "$key" >> "$HOME_DIR/.ssh/authorized_keys"
done
chown -R "$USER_NAME:$USER_NAME" "$HOME_DIR/.ssh"
chmod 700 "$HOME_DIR/.ssh"
chmod 600 "$HOME_DIR/.ssh/authorized_keys"

echo "== performance"
# Swap in compressed memory is Raspberry Pi OS's own now (rpi-swap, on
# /dev/zram0); zram-tools, which this installer used to add, fails at every
# boot trying to take the same device. Taken away where it is still there.
if dpkg -s zram-tools >/dev/null 2>&1; then
  systemctl disable zramswap 2>/dev/null || true
  apt-get purge -y zram-tools || true
fi
echo 'vm.swappiness=100' > /etc/sysctl.d/90-pioneer-tv.conf

echo "== services"
systemctl daemon-reload
systemctl disable getty@tty1.service || true
systemctl set-default graphical.target
systemctl enable seatd bluetooth pioneer-tv-governor.service
# SSH is how the box is looked after from elsewhere: make sure it runs (in
# October it did not come up after a boot that damaged files).
systemctl reset-failed ssh 2>/dev/null || true
systemctl enable --now ssh 2>/dev/null || true
systemctl disable hciuart 2>/dev/null || true   # legacy; fails on Bookworm's kernel-attached Bluetooth
rfkill unblock bluetooth 2>/dev/null || true
# The display is labwc (pioneer-tv-display.service), which lets the overlay
# draw over games and video; Weston (pioneer-tv-weston.service) stays
# installed, switched off, until labwc has proved itself.
systemctl disable pioneer-tv-weston.service 2>/dev/null || true
systemctl enable pioneer-tv-daemon.service pioneer-tv-display.service
systemctl enable --now pioneer-tv-upgrade.timer
# The user's service manager (and with it PipeWire) must be up before the display starts.
loginctl enable-linger "$USER_NAME" || true
if systemctl --user --machine="$USER_NAME@.host" is-active pipewire >/dev/null 2>&1 || systemctl --user --machine="$USER_NAME@.host" list-units >/dev/null 2>&1; then
  # A PipeWire that crashed until systemd gave up stays down: clear that first.
  systemctl --user --machine="$USER_NAME@.host" reset-failed pipewire pipewire-pulse wireplumber 2>/dev/null || true
  systemctl --user --machine="$USER_NAME@.host" enable --now pipewire pipewire-pulse wireplumber 2>/dev/null || true
  systemctl --user --machine="$USER_NAME@.host" restart wireplumber 2>/dev/null || true
fi
# Pick up new code if the box is already running (no-op on first install).
systemctl try-restart pioneer-tv-daemon.service pioneer-tv-display.service || true
# A box still on Weston changes over now (starting labwc stops it: Conflicts=).
if systemctl is-active -q pioneer-tv-weston.service; then systemctl start pioneer-tv-display.service || true; fi
# RetroArch and the game cores: long (downloads and builds), so in the
# background; it returns at once when they are already there.
systemctl start --no-block pioneer-tv-cores.service || true

cat <<MSG

Pioneer TV installed to $TARGET ($MODE).
  config:   /etc/pioneer-tv/config.toml
  chromium: /etc/pioneer-tv/chromium.env
Pair a gamepad with bluetoothctl (scan on / pair / trust / connect), then reboot.
MSG
