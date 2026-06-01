#!/usr/bin/env bash
# Deploy physics-codegen-matrix goal-directed worker on engine cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  exit 1
fi
if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GH_TOKEN or GITHUB_TOKEN required" >&2
  exit 1
fi
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
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
kubectl -n "$NS" create secret generic li-agents-secrets \
  --from-literal=GH_TOKEN="$TOKEN" \
  --from-literal=CURSOR_API_KEY="$CURSOR_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$K8S/deployment-physics-codegen-matrix.yaml"
kubectl -n "$NS" rollout restart deploy/li-physics-codegen-matrix
kubectl -n "$NS" rollout status deploy/li-physics-codegen-matrix --timeout=180s || true
echo "Done. Detached worker runs until physics-codegen-completion-gate.sh passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-physics-codegen-matrix"
