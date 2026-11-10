#!/bin/bash
# Pioneer TV self-update. Started detached by the daemon (systemd-run) so it
# survives the daemon restart it causes. Pulls the repo, reinstalls (which restarts).
set -euo pipefail

REPO=$(cat /etc/pioneer-tv/repo)
STATE=/var/lib/pioneer-tv
mkdir -p "$STATE"
cd "$REPO"
# We run as root but the checkout belongs to the user who cloned it; git
# refuses to touch a repository owned by someone else ("dubious ownership").
OWNER=$(stat -c %U "$REPO")
git() { if [ "$OWNER" != root ]; then runuser -u "$OWNER" -- git "$@"; else command git "$@"; fi; }

log() { echo "[update] $*"; }
finish() {
  local status=$1 msg=$2
  printf '{"status":"%s","message":"%s","from":"%s","to":"%s","time":%d}\n' \
    "$status" "$msg" "${FROM:-}" "$(git rev-parse --short HEAD 2>/dev/null || echo '?')" "$(date +%s)" > "$STATE/last-update.json"
}
trap 'finish failed "update script failed"' ERR

BRANCH=$(git rev-parse --abbrev-ref HEAD)
FROM=$(git rev-parse --short HEAD)
log "repo $REPO, branch $BRANCH, at $FROM"

git fetch --quiet origin "$BRANCH"
TO=$(git rev-parse --short "origin/$BRANCH")
if [ "$FROM" = "$TO" ] && [ "${PIONEER_TV_FORCE:-0}" != "1" ]; then
  log "already up to date ($FROM)"
  finish ok "already up to date"
  exit 0
fi

CHANGED=$(git diff --name-only "HEAD..origin/$BRANCH" || true)
git merge --ff-only --quiet "origin/$BRANCH"
log "updated $FROM -> $TO"

# Only spend time on apt when the installer itself changed, or when forced.
if echo "$CHANGED" | grep -q '^system/install.sh$' || [ "${PIONEER_TV_FORCE:-0}" = "1" ]; then
  log "running full install"
  "$REPO/system/install.sh"
else
  PIONEER_TV_SKIP_APT=1 "$REPO/system/install.sh"
fi

finish ok "updated $FROM -> $TO"
# install.sh has restarted the daemon and the display (Chromium loads the
# extension at start) once; a second restart here killed Chromium within a
# second of its start.
log "done"
