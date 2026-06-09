#!/usr/bin/env bash
# Deploy PH-SCI simulation gap-close Phase 2 goal-directed worker on engine cluster.
# Does NOT scale replicas to 1 — apply manifests only. Scale when ready:
#   kubectl -n li-swarm scale deploy/li-ph-sci-gap-close-phase2 --replicas=1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"
# shellcheck source=lib/apply-li-agents-secrets.sh
source "$ROOT/scripts/lib/apply-li-agents-secrets.sh"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  echo "  export KUBECONFIG=$HOME/.kube/config-homelab" >&2
  exit 1
fi
require_li_agents_tokens || exit 1

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-ph-sci-gap-close-phase2-workspace.yaml"
kubectl apply -f "$K8S/configmap-ph-sci-gap-close-phase2.yaml"
kubectl apply -f "$K8S/configmap-ph-sci-gap-close-phase2-entrypoint.yaml"
apply_li_agents_secrets "$NS"
kubectl apply -f "$K8S/deployment-ph-sci-gap-close-phase2.yaml"
echo "Done. Deployment applied at replicas=0."
echo "Start worker: kubectl -n $NS scale deploy/li-ph-sci-gap-close-phase2 --replicas=1"
echo "Watch: kubectl -n $NS logs -f deploy/li-ph-sci-gap-close-phase2"
