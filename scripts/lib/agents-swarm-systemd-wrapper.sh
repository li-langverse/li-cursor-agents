#!/usr/bin/env bash
set -euo pipefail
: "${AGENTS_SWARM_ROLE:?AGENTS_SWARM_ROLE required}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_DIR="${AGENTS_SWARM_DATA_DIR:-$ROOT/data/control-plane}"
DISABLE_FILE="${DATA_DIR}/DISABLE_AUTOSTART"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
if [[ -f "$DISABLE_FILE" ]]; then
  echo "agents-swarm-systemd[$AGENTS_SWARM_ROLE]: DISABLE_AUTOSTART — exit 0"
  exit 0
fi
mkdir -p "$DATA_DIR" "$ROOT/logs"
cd "$ROOT"
source "$ROOT/scripts/env.defaults.sh"
[[ -f "$ROOT/.env" ]] && { set -a; source "$ROOT/.env"; set +a; }
li_resolve_env_paths "$ROOT"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
"$ROOT/scripts/ensure-native-modules.sh"
npm run build >/dev/null 2>&1
case "$AGENTS_SWARM_ROLE" in
  dashboard)
    export LI_AUTO_START_SUPERVISOR=0 LI_AUTO_START_ASYNC_SWARM=1 LI_SWARM_DETACHED=1 LI_SWARM_EXTERNAL=0
    exec "$NODE_BIN" "$ROOT/dist/cli/serve-dashboard.js" --port "$PORT"
    ;;
  async-swarm)
    export LI_AUTO_START_ASYNC_SWARM=1 LI_SWARM_DETACHED=0
    exec "$NODE_BIN" "$ROOT/dist/cli/async-swarm.js" start
    ;;
  watchdog) exec "$NODE_BIN" "$ROOT/dist/cli/swarm-watchdog.js" ;;
  *) echo "unknown role" >&2; exit 2 ;;
esac
