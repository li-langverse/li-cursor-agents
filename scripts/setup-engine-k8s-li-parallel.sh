#!/usr/bin/env bash
# Deploy li-parallel killer-package goal-directed worker (self-unblock, scale-down on complete).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  echo "  export KUBECONFIG=\$HOME/.kube/config-homelab" >&2
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  if kubectl -n "$NS" get secret li-agents-secrets &>/dev/null; then
    echo "==> reusing existing li-agents-secrets"
  else
    echo "ERROR: GH_TOKEN or GITHUB_TOKEN required" >&2
    exit 1
  fi
else
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
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/rbac-goal-workers-scale.yaml"
kubectl apply -f "$K8S/pvc-li-parallel-workspace.yaml"
kubectl apply -f "$K8S/configmap-li-parallel.yaml"

BUNDLE_DIR="$(mktemp -d)"
trap 'rm -rf "$BUNDLE_DIR"' EXIT
for pair in \
  "goal-directed-loop.sh:scripts/goal-directed-loop.sh" \
  "goal-loop-self-unblock.sh:scripts/goal-loop-self-unblock.sh" \
  "k8s-goal-loop-common.sh:deploy/k8s-goal-loop-common.sh" \
  "entrypoint.sh:deploy/li-parallel-k8s-entrypoint.sh"; do
  dest="${pair%%:*}"
  src="${ROOT}/${pair#*:}"
  sed 's/\r$//' "$src" > "$BUNDLE_DIR/$dest"
  chmod +x "$BUNDLE_DIR/$dest" 2>/dev/null || true
done

kubectl -n "$NS" create configmap li-li-parallel-bundle \
  --from-file="$BUNDLE_DIR/goal-directed-loop.sh" \
  --from-file="$BUNDLE_DIR/goal-loop-self-unblock.sh" \
  --from-file="$BUNDLE_DIR/k8s-goal-loop-common.sh" \
  --from-file="$BUNDLE_DIR/entrypoint.sh" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$K8S/deployment-li-parallel.yaml"
kubectl -n "$NS" scale deploy/li-li-parallel --replicas=1
kubectl -n "$NS" rollout restart deploy/li-li-parallel
kubectl -n "$NS" rollout status deploy/li-li-parallel --timeout=180s || true
echo "Done. Worker runs until check-li-parallel-goal-complete-gate.sh passes (engineering + proofs 100%)."
echo "Watch: kubectl -n $NS logs -f deploy/li-li-parallel"
