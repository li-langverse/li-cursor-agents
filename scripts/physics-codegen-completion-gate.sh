#!/usr/bin/env bash
# Exit 0 when physics-codegen-matrix pilot deliverables exist and token tests pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AGENTS_ROOT="$ROOT"
BENCH_ROOT="${BENCHMARKS_ROOT:-}"
if [[ -z "$BENCH_ROOT" ]]; then
  for candidate in "$ROOT/../benchmarks" "$ROOT/../../benchmarks" "/workspace/benchmarks"; do
    if [[ -f "$candidate/harness/bench.py" ]]; then
      BENCH_ROOT="$candidate"
      break
    fi
  done
fi

fail() {
  echo "physics-codegen-completion-gate: FAIL — $*" >&2
  exit 1
}

echo "==> token_usage in agent-run-trace"
grep -q 'token_usage' "$ROOT/src/agent-run-trace.ts" || fail "missing token_usage in agent-run-trace.ts"

echo "==> unit tests (agent-run-trace)"
npm run build >/dev/null 2>&1 || npm run build
node --test dist/agent-run-trace.test.js

echo "==> physics-codegen-matrix driver"
DRIVER="$BENCH_ROOT/scripts/physics-codegen-matrix/run-matrix.mjs"
[[ -f "$DRIVER" ]] || fail "missing $DRIVER"

echo "==> results JSON (pilot minimum)"
RESULTS="${PHYSICS_CODEGEN_RESULTS:-$BENCH_ROOT/results/physics-codegen-matrix.json}"
[[ -f "$RESULTS" ]] || fail "missing $RESULTS (run pilot matrix first)"

python3 - <<'PY' "$RESULTS"
import json, sys
path = sys.argv[1]
data = json.load(open(path, encoding="utf-8"))
rows = data if isinstance(data, list) else data.get("rows", [])
if len(rows) < 9:
    raise SystemExit(f"expected >= 9 pilot rows, got {len(rows)}")
passed = [r for r in rows if r.get("validity", {}).get("verify_within_1ulp")]
if len(passed) < len(rows):
    raise SystemExit(
        f"expected all rows verify_within_1ulp, got {len(passed)}/{len(rows)}"
    )
for r in passed:
    llm = r.get("llm") or {}
    if (llm.get("thinking_tokens") or 0) <= 0 and not llm.get("input_tokens"):
        raise SystemExit(f"missing token_usage on row {r.get('bench_id')}")
print(f"physics-codegen-completion-gate: OK ({len(rows)} rows, all verified)")
PY

echo "physics-codegen-completion-gate: pass"
exit 0
