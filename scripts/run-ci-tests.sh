#!/usr/bin/env bash
# CI-safe tests: mock only, concurrency=1, excludes slow/hanging e2e suites.
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

# Exclude demo-repo pool (run via npm run test:e2e:demo-repo) and live SDK suites.
shopt -s nullglob
E2E=(
  dist/e2e/*.e2e.js
)
FILTERED=()
for f in "${E2E[@]}"; do
  case "$(basename "$f")" in
    demo-repo-parallel-agents.e2e.js|agent-all-leaves.e2e.js|agent-all-leaves-sdk.e2e.js|agent-function-audit.e2e.js|dashboard-live-runs.e2e.js|dashboard-run-trace.e2e.js|swarm-full.e2e.js|sdk-parallel-live.e2e.js|sdk-live.e2e.js)
      continue
      ;;
  esac
  FILTERED+=("$f")
done

node --test --test-concurrency=1 dist/**/*.test.js "${FILTERED[@]}"
node scripts/test-log-timestamps.mjs
python3 ux-harness/tests/test_harness.py
