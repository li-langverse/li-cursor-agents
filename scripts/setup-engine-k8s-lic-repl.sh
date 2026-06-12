#!/usr/bin/env bash
# Deploy lic-repl compile-and-run goal-directed worker on engine cluster.
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
kubectl apply -f "$K8S/pvc-lic-repl-workspace.yaml"
kubectl apply -f "$K8S/configmap-lic-repl.yaml"
kubectl apply -f "$K8S/configmap-lic-repl-entrypoint.yaml"
apply_li_agents_secrets "$NS"
if [[ "${LI_BUILD_PROOF_EXPLORER_IMAGE:-0}" == "1" ]]; then
  echo "==> building proof-explorer image on engine (lic-ci LLVM 22 base)"
  kubectl -n "$NS" delete job build-proof-explorer-image --ignore-not-found
  kubectl apply -f "$K8S/job-build-proof-explorer-image.yaml"
  kubectl -n "$NS" wait --for=condition=complete job/build-proof-explorer-image --timeout=1800s || {
    echo "WARN: image build job did not complete — check: kubectl -n $NS logs job/build-proof-explorer-image -c podman" >&2
  }
fi
kubectl apply -f "$K8S/deployment-lic-repl.yaml"
kubectl -n "$NS" scale deploy/li-lic-repl --replicas=1
kubectl -n "$NS" rollout restart deploy/li-lic-repl
kubectl -n "$NS" rollout status deploy/li-lic-repl --timeout=180s || true
echo "Done. Worker runs until lic-repl-gates.sh passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-lic-repl"
