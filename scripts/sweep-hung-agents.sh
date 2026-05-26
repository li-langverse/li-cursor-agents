#!/usr/bin/env bash
# Sweep hung agent processes: stale SDK locks, idle run-agent, orphan async-swarm, legacy plan-loop.
#
# Default: dry-run (report only). Use --apply to SIGTERM/SIGKILL candidates.
# Protected unless --force: serve-dashboard.js and systemd/detached async-swarm trees.
#
# Usage:
#   ./scripts/sweep-hung-agents.sh
#   ./scripts/sweep-hung-agents.sh --apply
#   LI_AGENT_MAX_RUN_AGE_MS=7200000 LI_SWEEP_GRACE_MS=1800000 ./scripts/sweep-hung-agents.sh --apply
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
cd "$ROOT"
source "$ROOT/scripts/env.defaults.sh"
[[ -f "$ROOT/.env" ]] && { set -a; source "$ROOT/.env"; set +a; }
li_resolve_env_paths "$ROOT"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
if [[ ! -f "$ROOT/dist/cli/sweep-hung-agents.js" ]]; then
  npm run build >/dev/null 2>&1
fi
exec "$NODE_BIN" "$ROOT/dist/cli/sweep-hung-agents.js" "$@"
