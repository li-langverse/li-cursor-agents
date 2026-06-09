#!/usr/bin/env bash
# Deploy all libernetes goal-directed workers on engine cluster (GitLab-primary git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NS=li-swarm
K8S="$ROOT/deploy/k8s/engine"

WORKERS=(
  libernetes-platform
  libernetes-licontainers
  libernetes-livm
  libernetes-control
)

load_env() {
  for f in \
    "$(dirname "$ROOT")/.env.gitlab" \
    "$(dirname "$ROOT")/.env.github" \
    "$ROOT/.env" \
    "${BEELINK_CLEANUP_ROOT:-$HOME/launchpad}/.env" \
    "${BEELINK_CLEANUP_ROOT:-$HOME/launchpad}/.env.gitlab"
  do
    [[ -f "$f" ]] || continue
    set -a
    # shellcheck disable=SC1090
    source "$f" 2>/dev/null || true
    set +a
  done
}

load_env

if ! kubectl config current-context &>/dev/null; then
  echo "ERROR: kubectl has no current-context. Set KUBECONFIG to engine cluster." >&2
  exit 1
fi
if [[ -z "${GITLAB_TOKEN:-}" && -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITLAB_TOKEN (preferred) or GH_TOKEN required for li-agents-secrets" >&2
  exit 1
fi

echo "==> context: $(kubectl config current-context)"
kubectl apply -f "$K8S/namespace.yaml"

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
SECRET_ARGS=(--from-literal=GH_TOKEN="$TOKEN")
if [[ -n "${GITLAB_TOKEN:-}" ]]; then
  SECRET_ARGS+=(--from-literal=GITLAB_TOKEN="$GITLAB_TOKEN")
fi
if [[ -n "${CURSOR_API_KEY:-}" ]]; then
  SECRET_ARGS+=(--from-literal=CURSOR_API_KEY="$CURSOR_API_KEY")
fi
if [[ -n "${CURSOR_SDK_KEY:-}" ]]; then
  SECRET_ARGS+=(--from-literal=CURSOR_SDK_KEY="$CURSOR_SDK_KEY")
fi
kubectl -n "$NS" create secret generic li-agents-secrets \
  "${SECRET_ARGS[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> apply GitLab-primary entrypoint bundle"
kubectl -n "$NS" create configmap li-libernetes-git-bundle \
  --from-file=entrypoint.sh="$ROOT/deploy/proof-explorer-entrypoint.sh" \
  --from-file=k8s-git-auth.sh="$ROOT/deploy/k8s-git-auth.sh" \
  --dry-run=client -o yaml | kubectl apply -f -

for w in "${WORKERS[@]}"; do
  echo "==> applying $w"
  kubectl apply -f "$K8S/pvc-${w}-workspace.yaml"
  kubectl apply -f "$K8S/configmap-${w}.yaml"
  kubectl apply -f "$K8S/deployment-${w}.yaml"
  kubectl -n "$NS" rollout status "deploy/li-${w}" --timeout=300s || true
done

echo "Done. origin=gitlab.lilangverse.xyz/li-langverse (github remote = read-only mirror)"
for w in "${WORKERS[@]}"; do
  echo "  kubectl -n $NS logs -f deploy/li-${w}"
done
