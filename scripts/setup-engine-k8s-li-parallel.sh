#!/usr/bin/env bash
# Deploy li-parallel native HPC goal-directed worker on engine cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"
# shellcheck source=lib/apply-li-agents-secrets.sh
source "$ROOT/scripts/lib/apply-li-agents-secrets.sh"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  echo "  export KUBECONFIG=\$HOME/.kube/config-homelab" >&2
  exit 1
fi
require_li_agents_tokens || exit 1
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required for li-agents-secrets" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-li-parallel-workspace.yaml"
kubectl apply -f "$K8S/configmap-li-parallel.yaml"
kubectl apply -f "$K8S/configmap-li-parallel-entrypoint.yaml"
apply_li_agents_secrets "$NS"
kubectl apply -f "$K8S/deployment-li-parallel.yaml"
kubectl -n "$NS" scale deploy/li-li-parallel --replicas=1
kubectl -n "$NS" rollout restart deploy/li-li-parallel
kubectl -n "$NS" rollout status deploy/li-li-parallel --timeout=180s || true
echo "Done. Worker runs until check-li-parallel-killer-gate.sh passes (progress: check-li-parallel-full-suite.sh)."
echo "Watch: kubectl -n $NS logs -f deploy/li-li-parallel"
