#!/usr/bin/env bash
# Copy automation prompts from benchmarks (or BENCHMARKS_ROOT).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${BENCHMARKS_ROOT:-$ROOT/../benchmarks}"
AUTOMATIONS="$SRC/.cursor/automations"
if [[ ! -d "$AUTOMATIONS" && -d "$SRC/../.cursor/automations" ]]; then
  AUTOMATIONS="$(cd "$SRC/.." && pwd)/.cursor/automations"
fi
SRC="$AUTOMATIONS"
DST="$ROOT/prompts"
mkdir -p "$DST"
for f in agent-orchestrator.md ecosystem-explorer.md implementation-gaps-agent.md \
  plan-completion-audit.md issue-feature-planner.md issue-hygiene-agent.md org-issue-triage-agent.md pr-alignment-agent.md \
  pr-review-agent.md numerics-research-cycle.md ecosystem-health.md; do
  if [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$DST/$f"
    echo "synced $f"
  else
    echo "skip missing $f"
  fi
done
