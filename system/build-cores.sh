#!/bin/bash
# Pioneer TV: RetroArch and the cores the box plays games with
# (daemon/pioneertv/games.py, and docs/superpowers/specs/2026-10-15-retroarch-games-design.md).
#
# NES, SNES and Genesis come from Debian (Nestopia, snes9x, Genesis Plus GX).
# Debian has no N64 or DOS core, and libretro's own aarch64 builds are for
# desktop OpenGL while Debian's RetroArch and the Pi's GPU speak GLES, so
# mupen64plus_next (GLES3, ARM64 recompiler) and DOSBox Pure are built here
# from pinned commits. That takes a while on the Pi, so this runs in the
# background as pioneer-tv-cores.service after an install, and skips any
# core already built from its commit.
set -eu

OUT=/var/lib/pioneer-tv/cores
WORK=/var/cache/pioneer-tv/build
APT="apt-get -o DPkg::Lock::Timeout=900 install -y --no-upgrade --no-install-recommends"
export DEBIAN_FRONTEND=noninteractive

case "$(uname -m)" in
  aarch64) ;;
  *) echo "not a 64-bit Arm board: no games on the box"; exit 0 ;;
esac
MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)
case "$MODEL" in
  *"Raspberry Pi 5"*) PLATFORM=rpi5_64 ;;
  *"Raspberry Pi 4"*|*"Raspberry Pi 400"*|*"Compute Module 4"*) PLATFORM=rpi4_64 ;;
  *) echo "no games on ${MODEL:-this board}"; exit 0 ;;
esac

echo "== retroarch and Debian's cores"
$APT retroarch libretro-core-info libretro-nestopia libretro-snes9x libretro-genesisplusgx

# fetch <repo> <commit> <dir>: the source at a commit, resumed until whole
# (the box's Wi-Fi drops out now and then).
fetch() {
  local repo=$1 commit=$2 dir=$3 tar="$WORK/$(basename "$repo")-$2.tar.gz"
  for i in $(seq 1 30); do
    if curl -sSfL -C - --retry 5 --retry-delay 5 -o "$tar" \
         "https://codeload.github.com/$repo/tar.gz/$commit" && gzip -t "$tar" 2>/dev/null; then
      break
    fi
    gzip -t "$tar" 2>/dev/null || { [ "$i" -ge 3 ] && rm -f "$tar"; }
    echo "download interrupted, retrying ($i)"; sleep 10
  done
  gzip -t "$tar"
  rm -rf "$dir" && mkdir -p "$dir"
  tar xzf "$tar" -C "$dir" --strip-components=1
  rm -f "$tar"
}

# build <name> <repo> <commit> <make arguments...>: <name>_libretro.so into $OUT.
build() {
  local name=$1 repo=$2 commit=$3; shift 3
  local core="$OUT/${name}_libretro.so" stamp="$OUT/$name.commit"
  if [ -f "$core" ] && [ "$(cat "$stamp" 2>/dev/null)" = "$commit" ]; then
    echo "$name $commit already built"
    return 0
  fi
  echo "== $name ($commit)"
  fetch "$repo" "$commit" "$WORK/$name"
  local start=$(date +%s)
  (cd "$WORK/$name" && nice -n 10 make -j3 "$@")
  echo "$name built in $(( $(date +%s) - start )) s"
  install -m 0644 "$WORK/$name/${name}_libretro.so" "$core.new"
  mv "$core.new" "$core"
  echo "$commit" > "$stamp"
  rm -rf "$WORK/$name"
}

echo "== build tools"
$APT build-essential libgles-dev libegl-dev zlib1g-dev libpng-dev curl ca-certificates
mkdir -p "$WORK" "$OUT"

build mupen64plus_next libretro/mupen64plus-libretro-nx 12edd2c74a517ff86dfa8cfc71ad75e4c10486d5 platform="$PLATFORM"
build dosbox_pure libretro/dosbox-pure cdaea10ce8cac231bc341ca05d4c5e4e5fe0fbd5

echo "cores in $OUT: $(ls "$OUT" | grep -c '_libretro.so$')"
