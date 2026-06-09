#!/usr/bin/env bash
# Apply org-issue-worker on the engine Kubernetes cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"
# shellcheck source=lib/apply-li-agents-secrets.sh
source "$ROOT/scripts/lib/apply-li-agents-secrets.sh"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to your engine cluster first." >&2
  echo "  export KUBECONFIG=/path/to/engine-kubeconfig" >&2
  exit 1
fi
require_li_agents_tokens || exit 1

echo "==> context: $(kubectl config current-context)"
echo "==> nodes:"
kubectl get nodes -o wide

ENGINE_LABEL="${LI_ENGINE_NODE_LABEL_KEY:-li-langverse.io/node-pool}"
ENGINE_VALUE="${LI_ENGINE_NODE_LABEL_VALUE:-engine}"
if [[ -n "${LI_ENGINE_NODE_NAME:-}" ]]; then
  kubectl label node "$LI_ENGINE_NODE_NAME" "${ENGINE_LABEL}=${ENGINE_VALUE}" --overwrite
else
  echo "Tip: LI_ENGINE_NODE_NAME=<node> to label the engine pool"
fi

kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-sprint-data.yaml"
kubectl apply -f "$K8S/configmap.yaml"
apply_li_agents_secrets "$NS"

if [[ "${LI_ORG_ISSUE_DEPLOY_ALWAYS_ON:-0}" == "1" ]]; then
  kubectl apply -f "$K8S/deployment-org-issue-worker.yaml"
else
  kubectl apply -f "$K8S/cronjob-org-issue-worker.yaml"
fi

echo "==> scheduled resources:"
kubectl -n "$NS" get cronjob,deploy,pvc,configmap 2>/dev/null || true
echo "Done. Watch: kubectl -n $NS logs -l app=li-org-issue-worker --tail=100 -f"
