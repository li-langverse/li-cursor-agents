#!/usr/bin/env bash
# Enrich benchmarks data/latest/agent-briefing.json with swarm scorecards (no LLM).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCH="${1:-${BENCHMARKS_ROOT:-}}"
if [[ -z "$BENCH" ]]; then
  echo "usage: enrich-briefing-scorecards.sh <benchmarks-root>" >&2
  exit 1
fi
cd "$ROOT"
npm run build --silent
LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-disk}" \
  node dist/cli/enrich-briefing.js --benchmarks-root "$BENCH" --no-mirror
