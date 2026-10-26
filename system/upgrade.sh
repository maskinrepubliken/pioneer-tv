#!/bin/bash
# Nightly package upgrade for Pioneer TV (pioneer-tv-upgrade.timer, 04:30).
# Code updates never upgrade packages (see install.sh); the browser and the
# Widevine module are brought up to date here, while nobody is watching, and
# the screen is restarted only if something was actually upgraded.
set -u
PKGS="chromium chromium-common libwidevinecdm0"
version() { dpkg-query -W -f='${Version}\n' $PKGS 2>/dev/null | tr '\n' ' '; }
log() { echo "[upgrade] $*"; }

before=$(version)
log "before: $before"
export DEBIAN_FRONTEND=noninteractive
# Wait up to 15 min for a running apt or dpkg (an install, Debian's own timers).
LOCK="-o DPkg::Lock::Timeout=900"
apt-get $LOCK update -qq || { log "apt-get update failed; trying again tomorrow"; exit 0; }
# shellcheck disable=SC2086
apt-get $LOCK install -y --only-upgrade --no-install-recommends $PKGS || log "upgrade failed"
apt-get clean
after=$(version)
log "after:  $after"
if [ "$before" != "$after" ]; then
  log "upgraded; restarting the screen"
  systemctl try-restart pioneer-tv-display.service
else
  log "already current"
fi
