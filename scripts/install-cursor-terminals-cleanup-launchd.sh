#!/usr/bin/env bash
# Install macOS launchd job (backup scheduler) for stale Cursor terminal cleanup.
#   ./scripts/install-cursor-terminals-cleanup-launchd.sh
#   ./scripts/install-cursor-terminals-cleanup-launchd.sh --uninstall
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
INTERVAL="${LI_CURSOR_TERMINALS_CLEANUP_INTERVAL_SEC:-7200}"
LABEL="com.li-langverse.cursor-terminals-cleanup"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
TEMPLATE="$ROOT/scripts/com.li-langverse.cursor-terminals-cleanup.plist.in"
BASH_BIN="${BASH:-/bin/bash}"

mkdir -p "$ROOT/logs" "$HOME/Library/LaunchAgents"

bootout_if_loaded() {
  if launchctl print "gui/$(id -u)/${LABEL}" &>/dev/null; then
    launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
  fi
}

uninstall() {
  bootout_if_loaded
  rm -f "$PLIST_DST"
  echo "Uninstalled $LABEL"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

sed \
  -e "s|@@ROOT@@|$ROOT|g" \
  -e "s|@@BASH@@|$BASH_BIN|g" \
  -e "s|@@INTERVAL@@|$INTERVAL|g" \
  "$TEMPLATE" >"$PLIST_DST"

bootout_if_loaded
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "Installed $PLIST_DST"
echo "  Interval: ${LI_CURSOR_TERMINALS_CLEANUP_INTERVAL_SEC:-7200}s (StartInterval in plist; edit plist or reinstall to change)"
echo "  Log: $ROOT/logs/cursor-terminals-cleanup-launchd.log"
echo "  Run now: launchctl kickstart -k gui/$(id -u)/${LABEL}"
