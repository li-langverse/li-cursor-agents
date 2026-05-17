#!/usr/bin/env bash
# Local always-on supervisor + web dashboard (two processes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-$ROOT/../benchmarks}"
GITHUB_ENV="${LI_GITHUB_ENV:-$ROOT/../.env.github}"
if [[ -f "$GITHUB_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$GITHUB_ENV"
  set +a
  export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"
fi
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
unset CURSOR_MOCK

cd "$ROOT"
npm run build

npm run dashboard &
DASH_PID=$!
trap 'kill "$DASH_PID" 2>/dev/null || true' EXIT

echo "Dashboard: http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT:-9477}/"
echo "Supervisor: cursor-sdk (CURSOR_API_KEY from .env — tests use CURSOR_MOCK=1)"
echo "Supervisor loop starting in this terminal — watch for [supervisor] info/tick lines."
echo "Or use the dashboard footer: Start loop / Stop loop."
npm run supervisor -- --benchmarks "$BENCHMARKS_ROOT" "$@"
