#!/usr/bin/env bash
# Deploy PH-ML Wave 13 goal-directed worker on engine cluster (runs until program-complete gate passes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  echo "  export KUBECONFIG=/path/to/engine-kubeconfig" >&2
  exit 1
fi
if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GH_TOKEN or GITHUB_TOKEN required for li-agents-secrets" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-proof-explorer-workspace.yaml" 2>/dev/null || true
kubectl apply -f "$K8S/configmap-ph-ml-wave13.yaml"
kubectl apply -f "$K8S/configmap-ph-ml-wave13-entrypoint.yaml"
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
kubectl -n "$NS" create secret generic li-agents-secrets \
  --from-literal=GH_TOKEN="$TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -
if [[ -n "${CURSOR_API_KEY:-}" ]]; then
  kubectl -n "$NS" create secret generic li-agents-secrets \
    --from-literal=GH_TOKEN="$TOKEN" \
    --from-literal=CURSOR_API_KEY="$CURSOR_API_KEY" \
    --dry-run=client -o yaml | kubectl apply -f -
fi
kubectl apply -f "$K8S/deployment-ph-ml-wave13.yaml"
kubectl -n "$NS" rollout status deploy/li-ph-ml-wave13 --timeout=180s || true
echo "Done. Worker runs until ph-ml-program-complete-gates.sh passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-ph-ml-wave13"