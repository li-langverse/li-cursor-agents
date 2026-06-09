#!/usr/bin/env bash
# Deploy physics-codegen-matrix goal-directed worker on engine cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"
# shellcheck source=lib/apply-li-agents-secrets.sh
source "$ROOT/scripts/lib/apply-li-agents-secrets.sh"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  exit 1
fi
require_li_agents_tokens || exit 1
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required" >&2
  exit 1
fi

echo "==> readiness"
bash "$ROOT/scripts/k8s-physics-codegen-readiness.sh" || {
  echo "WARN: readiness reported issues — continuing deploy anyway" >&2
}

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-physics-codegen-matrix-workspace.yaml"
kubectl apply -f "$K8S/configmap-physics-codegen-matrix.yaml"
kubectl apply -f "$K8S/configmap-physics-codegen-matrix-goal.yaml"
apply_li_agents_secrets "$NS"
kubectl apply -f "$K8S/deployment-physics-codegen-matrix.yaml"
kubectl -n "$NS" rollout restart deploy/li-physics-codegen-matrix
kubectl -n "$NS" rollout status deploy/li-physics-codegen-matrix --timeout=180s || true
echo "Done. Detached worker runs until physics-codegen-completion-gate.sh passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-physics-codegen-matrix"
