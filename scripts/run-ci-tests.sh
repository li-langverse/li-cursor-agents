#!/usr/bin/env bash
# CI: unit tests only (no dist/e2e/*.e2e.js). Run e2e locally: npm run test:e2e, test:full, etc.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export LI_CONTROL_PLANE_STORE=disk
export LI_STACK_SKIP_SUPABASE=1
export CURSOR_MOCK=1
export LI_RESEARCH_WORKER_MAX_CYCLES=0
export LI_OBSERVER_DISABLE=1
export LI_PERSIST_MOCK_RUNS=0
export LI_AGENTS_COOLDOWN_MS=0

npm run build

UNIT=()
for f in dist/**/*.test.js; do
  case "$(basename "$f")" in
    run-handoff-phases-force.test.js|handoff-phased-run.test.js|handoff-run-coordinator.test.js|research-lane.test.js) continue ;;
  esac
  UNIT+=("$f")
done

node --test --test-concurrency=1 "${UNIT[@]}"
node scripts/test-log-timestamps.mjs
node scripts/test-org-triage-health.mjs
node scripts/test-org-swarm-stability.mjs
node scripts/test-org-swarm-infra.mjs
node scripts/test-swarm-health-report.mjs
node scripts/test-supabase-failover-probe.mjs
python3 ux-harness/tests/test_harness.py
python3 ux-harness/tests/test_static_site.py
python3 ux-harness/tests/test_web_gui_adapter.py
python3 -m unittest ux-harness.tests.test_tui ux-harness.tests.test_tui_adapter -v
