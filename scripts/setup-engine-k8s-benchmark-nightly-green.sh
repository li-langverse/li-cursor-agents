#!/usr/bin/env bash
# Deploy benchmark-nightly-green goal-directed worker on engine cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  exit 1
fi
if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GH_TOKEN or GITHUB_TOKEN required" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"
kubectl apply -f "$K8S/rbac-goal-workers-scale.yaml"
kubectl apply -f "$K8S/pvc-benchmark-nightly-green-workspace.yaml"
kubectl apply -f "$K8S/configmap-benchmark-nightly-green.yaml"
kubectl apply -f "$K8S/deployment-benchmark-nightly-green.yaml"

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

kubectl -n "$NS" create secret docker-registry ghcr-li-langverse \
  --docker-server=ghcr.io \
  --docker-username=li-langverse \
  --docker-password="$TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

# Bundle goal-loop scripts + entrypoint (requires bash + python for Invoke-K8sGoalLoopBundle equivalent)
BUNDLE_DIR="$(mktemp -d)"
trap 'rm -rf "$BUNDLE_DIR"' EXIT
for pair in \
  "goal-directed-loop.sh:scripts/goal-directed-loop.sh" \
  "goal-loop-self-unblock.sh:scripts/goal-loop-self-unblock.sh" \
  "k8s-goal-loop-common.sh:deploy/k8s-goal-loop-common.sh" \
  "entrypoint.sh:deploy/benchmark-nightly-green-entrypoint.sh"; do
  dest="${pair%%:*}"
  src="${ROOT}/${pair#*:}"
  sed 's/\r$//' "$src" > "$BUNDLE_DIR/$dest"
  chmod +x "$BUNDLE_DIR/$dest"
done

kubectl -n "$NS" create configmap li-benchmark-nightly-green-bundle \
  --from-file="$BUNDLE_DIR/goal-directed-loop.sh" \
  --from-file="$BUNDLE_DIR/goal-loop-self-unblock.sh" \
  --from-file="$BUNDLE_DIR/k8s-goal-loop-common.sh" \
  --from-file="$BUNDLE_DIR/entrypoint.sh" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "$NS" rollout restart deploy/li-benchmark-nightly-green 2>/dev/null || true
kubectl -n "$NS" rollout status deploy/li-benchmark-nightly-green --timeout=180s || true

echo "Done. Worker runs until benchmark-nightly-green-gate.sh passes."
echo "Watch: kubectl -n $NS logs -f deploy/li-benchmark-nightly-green"
