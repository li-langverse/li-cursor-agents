#!/usr/bin/env bash
# Deploy PH-BR-0 Li Browser foundation goal-directed worker on engine cluster.
# Does NOT scale replicas to 1 — apply manifests only. Scale when ready:
#   kubectl -n li-swarm scale deploy/li-ph-br-0-lib-browser --replicas=1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  echo "  export KUBECONFIG=\$HOME/.kube/config-homelab" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-ph-br-0-lib-browser-workspace.yaml"
kubectl apply -f "$K8S/configmap-ph-br-0-lib-browser.yaml"
kubectl apply -f "$K8S/configmap-ph-br-0-lib-browser-entrypoint.yaml"

if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  if kubectl -n "$NS" get secret li-agents-secrets &>/dev/null; then
    echo "==> reusing existing li-agents-secrets"
  else
    echo "ERROR: GH_TOKEN or GITHUB_TOKEN required for li-agents-secrets" >&2
    exit 1
  fi
else
  if [[ -z "${CURSOR_API_KEY:-}" ]]; then
    if kubectl -n "$NS" get secret li-agents-secrets &>/dev/null; then
      echo "==> reusing existing li-agents-secrets (CURSOR_API_KEY from cluster)"
      TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
      kubectl -n "$NS" create secret generic li-agents-secrets \
        --from-literal=GH_TOKEN="$TOKEN" \
        --dry-run=client -o yaml | kubectl apply -f -
    else
      echo "ERROR: CURSOR_API_KEY required for new li-agents-secrets" >&2
      exit 1
    fi
  else
    TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
    kubectl -n "$NS" create secret generic li-agents-secrets \
      --from-literal=GH_TOKEN="$TOKEN" \
      --from-literal=CURSOR_API_KEY="$CURSOR_API_KEY" \
      --dry-run=client -o yaml | kubectl apply -f -
  fi
fi

kubectl apply -f "$K8S/deployment-ph-br-0-lib-browser.yaml"
echo "Done. Deployment applied at replicas=0."
echo "Start worker: kubectl -n $NS scale deploy/li-ph-br-0-lib-browser --replicas=1"
echo "Watch: kubectl -n $NS logs -f deploy/li-ph-br-0-lib-browser"
