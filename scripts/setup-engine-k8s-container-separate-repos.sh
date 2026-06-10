#!/usr/bin/env bash
# Deploy container-separate-repos goal-directed worker on engine cluster.
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

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-container-separate-repos-workspace.yaml"
kubectl apply -f "$K8S/configmap-container-separate-repos.yaml"
apply_li_agents_secrets "$NS"
kubectl apply -f "$K8S/deployment-container-separate-repos.yaml"
kubectl -n "$NS" rollout status deploy/li-container-separate-repos --timeout=180s || true
echo "Done. Worker runs until container-separate-repos-completion-gate passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-container-separate-repos"
echo "Goal:  /workspace/lic/data/goal-directed-sprints/container-separate-repos.md"
echo "Branch: feat/extern-def-container-seam"
