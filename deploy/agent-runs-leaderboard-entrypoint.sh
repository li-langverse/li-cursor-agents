#!/usr/bin/env bash
# K8s entrypoint: perpetual agent-runs leaderboard heartbeat (long-lived SDK session).
set -euo pipefail

AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"

apply_daemon_overlay() {
  local f key path dest
  shopt -s nullglob
  for f in /config/daemon-dist__*; do
    key="$(basename "$f")"
    path="${key#daemon-dist__}"
    path="${path//__//}"
    dest="${AGENTS_ROOT}/dist/${path}"
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest"
  done
  shopt -u nullglob
}

if compgen -G "/config/daemon-dist__*" >/dev/null; then
  echo "agent-runs-leaderboard-entrypoint: overlay dist from /config (daemon-dist__* keys)"
  apply_daemon_overlay
fi

echo "agent-runs-leaderboard-entrypoint: long-lived daemon agents=${AGENTS_ROOT}"
exec node "${AGENTS_ROOT}/dist/cli/agent-runs-leaderboard-daemon.js" start
