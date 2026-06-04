#!/usr/bin/env bash
# Deploy PH-SCI simulation gap-close goal-directed worker on engine cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  echo "  export KUBECONFIG=\$HOME/.kube/config-homelab" >&2
  exit 1
fi
if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GH_TOKEN or GITHUB_TOKEN required for li-agents-secrets" >&2
  exit 1
fi
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required for li-agents-secrets" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-ph-sci-simulation-gap-close-workspace.yaml"
kubectl apply -f "$K8S/configmap-ph-sci-simulation-gap-close.yaml"
kubectl apply -f "$K8S/configmap-ph-sci-simulation-gap-close-entrypoint.yaml"
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
kubectl -n "$NS" create secret generic li-agents-secrets \
  --from-literal=GH_TOKEN="$TOKEN" \
  --from-literal=CURSOR_API_KEY="$CURSOR_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$K8S/deployment-ph-sci-simulation-gap-close.yaml"
kubectl -n "$NS" rollout restart deploy/li-ph-sci-simulation-gap-close
kubectl -n "$NS" rollout status deploy/li-ph-sci-simulation-gap-close --timeout=180s || true
echo "Done. Worker runs until ph-sci-phase0-gates.sh passes (then continues Phase 1+ per goal file)."
echo "Watch: kubectl -n $NS logs -f deploy/li-ph-sci-simulation-gap-close"
