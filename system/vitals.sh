#!/bin/bash
# Pioneer TV vitals: one line to the journal every ten seconds with memory,
# swap, memory pressure, load, temperature, throttling and the biggest
# process. When the box freezes, the last lines before it (journalctl -b -1
# -u pioneer-tv-vitals) say whether memory was running out or the GPU was
# hot, which the kernel's own log may not. Run by pioneer-tv-vitals.service.
while :; do
  read -r avail swap_total swap_free < <(awk '/^MemAvailable:/ {a=$2} /^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2}
    END {print int(a/1024), int(t/1024), int(f/1024)}' /proc/meminfo)
  psi=$(awk '/^full/ {sub("avg10=", "", $2); print $2}' /proc/pressure/memory 2>/dev/null)
  read -r load _ < /proc/loadavg
  temp=$(awk '{printf "%.0f", $1/1000}' /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
  throttled=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)
  top=$(ps -eo rss=,comm= --sort=-rss | awk 'NR==1 {printf "%s %dM", $2, $1/1024}')
  echo "mem ${avail}M free, swap $((swap_total - swap_free))/${swap_total}M, mem-psi ${psi:--}, load ${load}, ${temp:--}C, throttled ${throttled:--}, top ${top}"
  sleep 10
done
