#!/usr/bin/env bash
# Deploy Pure Li HTTPS goal-directed worker on engine cluster (runs until completion gate passes).
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

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-pure-li-https-workspace.yaml"
kubectl apply -f "$K8S/configmap-pure-li-https.yaml"
apply_li_agents_secrets "$NS"
kubectl apply -f "$K8S/deployment-pure-li-https.yaml"
kubectl -n "$NS" rollout status deploy/li-pure-li-https --timeout=180s || true
echo "Done. Worker runs until pure-li-https-completion-gate passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-pure-li-https"
