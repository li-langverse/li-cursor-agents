#!/usr/bin/env bash
# One-shot Job: live SDK matrix (70 cells, resumable).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"
# shellcheck source=lib/apply-li-agents-secrets.sh
source "$ROOT/scripts/lib/apply-li-agents-secrets.sh"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context" >&2
  exit 1
fi
require_li_agents_tokens || exit 1
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required" >&2
  exit 1
fi

echo "==> scale down always-on worker (avoid quota contention)"
kubectl -n "$NS" scale deploy/li-physics-codegen-matrix --replicas=0 || true

echo "==> sync scripts to PVC via temporary pod copy"
POD=$(kubectl -n "$NS" get pod -l app=li-physics-codegen-matrix -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [[ -z "$POD" ]]; then
  kubectl -n "$NS" scale deploy/li-physics-codegen-matrix --replicas=1
  kubectl -n "$NS" rollout status deploy/li-physics-codegen-matrix --timeout=120s
  POD=$(kubectl -n "$NS" get pod -l app=li-physics-codegen-matrix -o jsonpath='{.items[0].metadata.name}')
fi

BENCH_MATRIX="$(cd "$ROOT/../benchmarks/scripts/physics-codegen-matrix" && pwd)"
kubectl cp "$BENCH_MATRIX/." "$NS/$POD:/workspace/benchmarks/scripts/physics-codegen-matrix/"

echo "==> patch /app dist token_usage if needed"
kubectl -n "$NS" cp "$ROOT/dist/agent-run-trace.js" "$POD:/app/dist/agent-run-trace.js" 2>/dev/null || {
  echo "WARN: could not update /app/dist — image may lack token_usage" >&2
}

apply_li_agents_secrets "$NS"
kubectl -n "$NS" delete job li-physics-codegen-live --ignore-not-found
kubectl apply -f "$K8S/job-physics-codegen-live.yaml"
echo "Job started. Logs:"
echo "  kubectl -n $NS logs -f job/li-physics-codegen-live"
