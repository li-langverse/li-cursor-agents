#!/usr/bin/env bash
# Read-only grouped error report (no DB writes). Uses GET /api/errors/summary or in-process fallback.
# Usage: ./scripts/report-swarm-errors.sh [range]
#   range: 1d | 7d | 30d | all (default 1d)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
RANGE="${1:-1d}"
PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
URL="http://127.0.0.1:${PORT}/api/errors/summary?range=${RANGE}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

format_json() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

if curl -sf --max-time 15 "$URL" | format_json; then
  exit 0
fi

echo "Dashboard unreachable at $URL — building summary in-process (read-only)…" >&2
cd "$ROOT"
export LI_CURSOR_AGENTS_ROOT="$ROOT"
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh" 2>/dev/null || true
if [[ ! -f "$ROOT/dist/control-plane/run-errors-summary.js" ]]; then
  npm run build -s >&2
fi
RANGE="$RANGE" exec node --input-type=module <<'NODE'
import { loadRuntimeEnv } from "./dist/env.js";
import { buildRunErrorsSummary } from "./dist/control-plane/run-errors-summary.js";
import { parseStatsTimeRange } from "./dist/control-plane/stats-time-range.js";

loadRuntimeEnv();
const params = new URLSearchParams({ range: process.env.RANGE ?? "1d" });
const timeRange = parseStatsTimeRange(params);
const summary = await buildRunErrorsSummary(50_000, timeRange);
console.log(JSON.stringify({ ...summary, reporting_only: true }, null, 2));
NODE
