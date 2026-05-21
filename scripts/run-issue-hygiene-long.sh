#!/usr/bin/env bash
# Rotate live issue_hygiene passes (preflight refresh + SDK run).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCH="${BENCHMARKS_ROOT:-$ROOT/../benchmarks}"
LOG_DIR="${LI_HYGIENE_LOG_DIR:-$ROOT/logs}"
CYCLES="${LI_HYGIENE_CYCLES:-3}"
SLEEP_SEC="${LI_HYGIENE_SLEEP_SEC:-600}"

# shellcheck source=scripts/env.defaults.sh
source "$ROOT/scripts/env.defaults.sh" 2>/dev/null || true

export LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-disk}"
export BENCHMARKS_ROOT="$BENCH"
mkdir -p "$LOG_DIR"

for ((i = 1; i <= CYCLES; i++)); do
  echo "==> cycle $i/$CYCLES $(date -u +%Y-%m-%dT%H:%MZ)"
  (cd "$BENCH" && python3 scripts/issue-backlog-hygiene.py && python3 scripts/issue-feature-triage.py) || true
  LOG="$LOG_DIR/issue-hygiene-live-${i}.log"
  node "$ROOT/dist/cli/run-agent.js" --agent issue_hygiene --benchmarks "$BENCH" >"$LOG" 2>&1 || true
  echo "    log=$LOG exit=$?"
  if ((i < CYCLES)); then
    sleep "$SLEEP_SEC"
  fi
done

echo "==> done $CYCLES cycles"
