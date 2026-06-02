#!/usr/bin/env bash
# Deploy World Studio GUI product-visual goal-directed worker on engine cluster
# (runs until completion gate passes).
#
# Important: keep this file with LF line endings (bash).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS="li-swarm"
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
kubectl apply -f "$K8S/pvc-world-studio-gui-product-visual-workspace.yaml"
kubectl apply -f "$K8S/configmap-world-studio-gui-product-visual.yaml"
kubectl apply -f "$K8S/configmap-world-studio-gui-product-visual-entrypoint.yaml"

TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
SECRET_ARGS=(--from-literal=GH_TOKEN="$TOKEN")
if [[ -n "${CURSOR_API_KEY:-}" ]]; then
  SECRET_ARGS+=(--from-literal=CURSOR_API_KEY="$CURSOR_API_KEY")
fi
if [[ -n "${CURSOR_SDK_KEY:-}" ]]; then
  SECRET_ARGS+=(--from-literal=CURSOR_SDK_KEY="$CURSOR_SDK_KEY")
fi

kubectl -n "$NS" create secret generic li-agents-secrets \
  "${SECRET_ARGS[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$K8S/deployment-world-studio-gui-product-visual.yaml"
kubectl -n "$NS" rollout restart deploy/li-world-studio-gui-product-visual || true
kubectl -n "$NS" rollout status deploy/li-world-studio-gui-product-visual --timeout=180s || true

echo "Done. Worker runs until world-studio-gui-product-visual completion gate passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-world-studio-gui-product-visual"

