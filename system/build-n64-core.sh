#!/bin/bash
# Pioneer TV: RetroArch and its N64 core, for the games the box plays outside
# the browser (daemon/pioneertv/native.py).
#
# EmulatorJS can only interpret the N64's processor in WebAssembly, about 23
# frames a second in Super Mario 64 on a Pi 4. Debian's RetroArch is built for
# GLES, which is what the Pi's GPU speaks, but Debian has no N64 core, and
# libretro's own aarch64 builds are for desktop OpenGL. So mupen64plus_next is
# built here, for the Pi with GLES3 and its ARM64 recompiler, from a pinned
# commit. It takes a while on the Pi, so it runs in the background as
# pioneer-tv-cores.service after an install, and does nothing once the core
# of this commit is in place.
set -eu

COMMIT=12edd2c74a517ff86dfa8cfc71ad75e4c10486d5     # libretro/mupen64plus-libretro-nx, develop
OUT=/var/lib/pioneer-tv/cores
CORE=$OUT/mupen64plus_next_libretro.so
STAMP=$OUT/mupen64plus_next.commit
WORK=/var/cache/pioneer-tv/build
APT="apt-get -o DPkg::Lock::Timeout=900 install -y --no-upgrade --no-install-recommends"
export DEBIAN_FRONTEND=noninteractive

case "$(uname -m)" in
  aarch64) ;;
  *) echo "not a 64-bit Arm board: no native N64"; exit 0 ;;
esac
MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)
case "$MODEL" in
  *"Raspberry Pi 5"*) PLATFORM=rpi5_64 ;;
  *"Raspberry Pi 4"*|*"Raspberry Pi 400"*|*"Compute Module 4"*) PLATFORM=rpi4_64 ;;
  *) echo "no native N64 on ${MODEL:-this board}"; exit 0 ;;
esac

echo "== retroarch"
$APT retroarch libretro-core-info

if [ -f "$CORE" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$COMMIT" ]; then
  echo "mupen64plus_next $COMMIT already built"
  exit 0
fi

echo "== build tools"
$APT build-essential libgles-dev libegl-dev zlib1g-dev libpng-dev curl ca-certificates

echo "== source"
mkdir -p "$WORK" "$OUT"
cd "$WORK"
TAR=nx-$COMMIT.tar.gz
# The box's Wi-Fi drops out now and then: resume until the archive is whole.
for i in $(seq 1 30); do
  if curl -sSfL -C - --retry 5 --retry-delay 5 -o "$TAR" \
       "https://codeload.github.com/libretro/mupen64plus-libretro-nx/tar.gz/$COMMIT" && gzip -t "$TAR" 2>/dev/null; then
    break
  fi
  gzip -t "$TAR" 2>/dev/null || { [ "$i" -ge 3 ] && rm -f "$TAR"; }
  echo "download interrupted, retrying ($i)"; sleep 10
done
gzip -t "$TAR"
rm -rf src && mkdir src
tar xzf "$TAR" -C src --strip-components=1

echo "== build ($PLATFORM)"
cd src
start=$(date +%s)
nice -n 10 make platform="$PLATFORM" -j3
echo "built in $(( $(date +%s) - start )) s"
install -m 0644 mupen64plus_next_libretro.so "$CORE.new"
mv "$CORE.new" "$CORE"
echo "$COMMIT" > "$STAMP"
cd "$WORK" && rm -rf src "$TAR"
echo "mupen64plus_next installed to $CORE"
