#!/usr/bin/env bash
# Terminate stale Cursor agent shells and orphaned test processes.
#   ./scripts/cleanup-stale-cursor-terminals.sh
#   ./scripts/cleanup-stale-cursor-terminals.sh --dry-run
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi

if [[ "${LI_CURSOR_TERMINALS_CLEANUP:-1}" == "0" ]]; then
  echo "[cleanup-stale-cursor-terminals] disabled (LI_CURSOR_TERMINALS_CLEANUP=0)"
  exit 0
fi

exec python3 "$ROOT/scripts/cleanup-stale-cursor-terminals.py" "$@"
