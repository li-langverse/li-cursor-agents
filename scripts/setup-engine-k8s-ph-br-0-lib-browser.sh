#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"
source "$ROOT/scripts/lib/apply-li-agents-secrets.sh"
require_li_agents_tokens || exit 1
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-ph-br-0-lib-browser-workspace.yaml"
kubectl apply -f "$K8S/configmap-ph-br-0-lib-browser.yaml"
kubectl apply -f "$K8S/configmap-ph-br-0-lib-browser-entrypoint.yaml"
apply_li_agents_secrets "$NS"
kubectl apply -f "$K8S/deployment-ph-br-0-lib-browser.yaml"
echo "Start: kubectl -n $NS scale deploy/li-ph-br-0-lib-browser --replicas=1"
