#!/usr/bin/env bash
# Deploy PH-ML Wave 13 goal-directed worker on engine cluster (runs until program-complete gate passes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
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
if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required for li-agents-secrets (load from li/.env or li-cursor-agents/.env)" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/pvc-ph-ml-wave13-workspace.yaml"
kubectl apply -f "$K8S/configmap-ph-ml-wave13.yaml"
kubectl apply -f "$K8S/configmap-ph-ml-wave13-entrypoint.yaml"
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
SECRET_ARGS=(--from-literal=GH_TOKEN="$TOKEN" --from-literal=CURSOR_API_KEY="$CURSOR_API_KEY")
if [[ -n "${SUPABASE_URL:-}" ]]; then
  SECRET_ARGS+=(--from-literal=SUPABASE_URL="$SUPABASE_URL")
fi
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SECRET_ARGS+=(--from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY")
fi
kubectl -n "$NS" create secret generic li-agents-secrets \
  "${SECRET_ARGS[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -
if [[ "${LI_BUILD_PROOF_EXPLORER_IMAGE:-0}" == "1" ]]; then
  echo "==> building proof-explorer image on engine (lic-ci LLVM 22 base)"
  kubectl -n "$NS" delete job build-proof-explorer-image --ignore-not-found
  kubectl apply -f "$K8S/job-build-proof-explorer-image.yaml"
  kubectl -n "$NS" wait --for=condition=complete job/build-proof-explorer-image --timeout=1800s || {
    echo "WARN: image build job did not complete — check: kubectl -n $NS logs job/build-proof-explorer-image -c podman" >&2
  }
fi
kubectl apply -f "$K8S/deployment-ph-ml-wave13.yaml"
kubectl -n "$NS" rollout restart deploy/li-ph-ml-wave13
kubectl -n "$NS" rollout status deploy/li-ph-ml-wave13 --timeout=180s || true
echo "Done. Worker runs until ph-ml-program-complete-gates.sh passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-ph-ml-wave13"
