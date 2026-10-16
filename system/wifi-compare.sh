#!/bin/bash
# Compare the box's Wi-Fi cards (the Pi's own radio and a USB card, say) on one
# network: signal, link rate, ping to the router and out, and a download.
# Each card in turn gets the network's saved profile, so the connection moves
# between cards and the box's address may change while it runs. Over SSH on
# Wi-Fi, start it detached and read the report afterwards:
#
#   sudo systemd-run --unit=wifi-compare system/wifi-compare.sh "Småhusbyn"
#   cat /tmp/wifi-compare.txt
#
# The network must be saved on the box already (Inställningar → Wi-Fi). The
# connection goes back to the card it was on when the test began.
set -uo pipefail

SSID=${1:-Småhusbyn}
OUT=${2:-/tmp/wifi-compare.txt}
DL_URL=${DL_URL:-https://speed.cloudflare.com/__down?bytes=50000000}
exec > >(tee "$OUT") 2>&1

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

# The saved profile for the SSID.
PROFILE=
while IFS=: read -r name type; do
  [ "$type" = 802-11-wireless ] || continue
  [ "$(nmcli -g 802-11-wireless.ssid connection show "$name" 2>/dev/null)" = "$SSID" ] && { PROFILE=$name; break; }
done < <(nmcli -t -f NAME,TYPE connection show)
[ -n "$PROFILE" ] || { echo "no saved profile for \"$SSID\"; add it under Inställningar → Wi-Fi first"; exit 1; }

mapfile -t DEVS < <(nmcli -t -f DEVICE,TYPE device | awk -F: '$2 == "wifi" {print $1}')
[ "${#DEVS[@]}" -ge 1 ] || { echo "no Wi-Fi cards"; exit 1; }
ORIG_DEV=$(nmcli -g GENERAL.DEVICES connection show "$PROFILE" 2>/dev/null | head -n1)
ORIG_IFNAME=$(nmcli -g connection.interface-name connection show "$PROFILE")
# A profile tied to wlan0 cannot come up on another card; loosen it for the test.
[ -n "$ORIG_IFNAME" ] && nmcli connection modify "$PROFILE" connection.interface-name ""

echo "Wi-Fi comparison for \"$SSID\" (profile \"$PROFILE\"), $(date '+%Y-%m-%d %H:%M')"
echo "cards: ${DEVS[*]}, connected now on: ${ORIG_DEV:-none}"
echo

card() {  # driver and bus, so the USB card is easy to tell apart
  local d=$1 drv bus
  drv=$(basename "$(readlink -f "/sys/class/net/$d/device/driver")" 2>/dev/null)
  case "$(readlink -f "/sys/class/net/$d/device")" in *usb*) bus=USB ;; *mmc*) bus=inbyggd ;; *) bus=? ;; esac
  echo "$drv, $bus"
}

declare -A SUMMARY
for d in "${DEVS[@]}"; do
  echo "== $d ($(card "$d"))"
  nmcli device wifi rescan ifname "$d" >/dev/null 2>&1; sleep 4
  echo "seen access points for \"$SSID\" (signal %, channel, rate):"
  nmcli -t -e no -f SSID,SIGNAL,CHAN,RATE device wifi list ifname "$d" 2>/dev/null |
    awk -F: -v s="$SSID" '$1 == s {printf "  %s%%  ch %s  %s\n", $2, $3, $4}' | sort -rn | head -n 6
  if ! nmcli -w 45 connection up "$PROFILE" ifname "$d" >/dev/null 2>&1; then
    echo "  could not connect"; SUMMARY[$d]="ingen anslutning"; echo; continue
  fi
  sleep 5
  gw=$(ip -4 route show default dev "$d" | awk '{print $3; exit}')
  sig=() rate=
  for _ in 1 2 3; do
    l=$(iw dev "$d" link)
    sig+=("$(awk '/signal:/ {print $2}' <<<"$l")")
    rate=$(awk -F': ' '/tx bitrate:/ {print $2}' <<<"$l")
    sleep 1
  done
  freq=$(iw dev "$d" link | awk '/freq:/ {print $2}')
  echo "link: ${freq:-?} MHz, signal ${sig[*]} dBm, tx ${rate:-?}"
  pg=$(ping -I "$d" -c 50 -i 0.2 -q "${gw:-1.1.1.1}" 2>/dev/null | tail -n 2 | tr '\n' ' ')
  pi=$(ping -I "$d" -c 30 -i 0.3 -q 1.1.1.1 2>/dev/null | tail -n 2 | tr '\n' ' ')
  echo "ping router ($gw): $pg"
  echo "ping 1.1.1.1:       $pi"
  bps=$(curl --interface "$d" -o /dev/null -s --max-time 25 -w '%{speed_download}' "$DL_URL")
  mbit=$(awk -v b="${bps:-0}" 'BEGIN {printf "%.1f", b * 8 / 1e6}')
  echo "download: $mbit Mbit/s"
  loss=$(grep -o '[0-9.]*% packet loss' <<<"$pg" | cut -d% -f1)
  avg=$(grep -o '= [0-9./]*' <<<"$pg" | cut -d/ -f2)
  SUMMARY[$d]="${sig[0]:-?} dBm, ${freq:-?} MHz, ${mbit} Mbit/s, router ${avg:-?} ms ${loss:-?}% förlust"
  echo
done

echo "== sammanfattning"
for d in "${DEVS[@]}"; do printf '  %-8s %-22s %s\n' "$d" "($(card "$d"))" "${SUMMARY[$d]}"; done
echo "  (signal närmare 0 är bättre: -55 bra, -70 svagt, -80 knappt)"

# Back as it was.
[ -n "$ORIG_IFNAME" ] && nmcli connection modify "$PROFILE" connection.interface-name "$ORIG_IFNAME"
if [ -n "$ORIG_DEV" ]; then
  nmcli -w 45 connection up "$PROFILE" ifname "$ORIG_DEV" >/dev/null 2>&1 || nmcli connection up "$PROFILE" >/dev/null 2>&1
fi
echo "report: $OUT"
