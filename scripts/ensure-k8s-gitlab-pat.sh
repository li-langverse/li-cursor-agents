#!/usr/bin/env bash
# Ensure a GitLab PAT in a K8s secret is valid. Reuses when API test passes.
# Revokes and mints only when the secret token is missing/invalid, then patches the secret
# in the same run — never revoke without updating the cluster secret.
set -euo pipefail

PROFILE="${1:-GoalWorker}"
KUBECONFIG="${KUBECONFIG:-${HOME}/.kube/config-homelab}"
NAMESPACE="${NAMESPACE:-li-swarm}"
GITLAB_NAMESPACE="${GITLAB_NAMESPACE:-gitlab}"
GITLAB_POD="${GITLAB_POD:-gitlab-0}"
GITLAB_API_URL="${GITLAB_API_URL:-https://gitlab.lilangverse.xyz}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAT_OUT_PATH="/tmp/k8s-gitlab-pat-out"
RAILS_MINT_PATH="/tmp/k8s-gitlab-pat-mint.rb"
MINT_LIB_REMOTE="/tmp/_mint_k8s_gitlab_pat.rb"

export KUBECONFIG

case "$PROFILE" in
  GoalWorker)
    PAT_NAME="k8s-goal-worker-git"
    PAT_SCOPES="api,read_repository,write_repository"
    SECRET_NAME="li-agents-secrets"
    MINT_SCRIPT="_create_k8s_gitlab_pat.rb"
    CRONJOB=""
    ;;
  Mirror)
    PAT_NAME="gitlab-github-mirror-k8s"
    PAT_SCOPES="read_api,read_repository"
    SECRET_NAME="gitlab-github-mirror-secrets"
    MINT_SCRIPT="_create_k8s_gitlab_mirror_pat.rb"
    CRONJOB="gitlab-github-mirror"
    ;;
  *)
    echo "ERROR: profile must be GoalWorker or Mirror (got: $PROFILE)" >&2
    exit 1
    ;;
esac

get_secret_token() {
  local b64
  b64="$(kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" -o jsonpath='{.data.GITLAB_TOKEN}' 2>/dev/null || true)"
  [[ -z "$b64" ]] && return 0
  printf '%s' "$b64" | base64 -d
}

api_test_token() {
  local token="$1"
  [[ -z "$token" ]] && return 1
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "PRIVATE-TOKEN: ${token}" "${GITLAB_API_URL}/api/v4/user")"
  [[ "$code" == "200" ]]
}

patch_secret_token() {
  local token="$1"
  local b64
  b64="$(printf '%s' "$token" | base64 -w0 2>/dev/null || printf '%s' "$token" | base64)"
  kubectl -n "$NAMESPACE" patch secret "$SECRET_NAME" --type=merge \
    -p "{\"data\":{\"GITLAB_TOKEN\":\"${b64}\"}}" >/dev/null
}

existing="$(get_secret_token || true)"
if api_test_token "$existing"; then
  echo "OK: ${PAT_NAME} token in ${SECRET_NAME} is valid (reused, no revoke)"
  exit 0
fi

echo "WARN: ${SECRET_NAME} GITLAB_TOKEN missing or invalid — minting ${PAT_NAME} and patching secret"

cron_was_suspended=0
if [[ -n "$CRONJOB" ]]; then
  suspend_flag="$(kubectl -n "$NAMESPACE" get cronjob "$CRONJOB" -o jsonpath='{.spec.suspend}' 2>/dev/null || true)"
  if [[ "$suspend_flag" != "true" ]]; then
    echo "==> Suspending cronjob/${CRONJOB} during PAT rotation"
    kubectl -n "$NAMESPACE" patch cronjob "$CRONJOB" --type=merge -p '{"spec":{"suspend":true}}' >/dev/null
    cron_was_suspended=1
  fi
fi

cleanup() {
  if [[ "$cron_was_suspended" == "1" ]]; then
    echo "==> Resuming cronjob/${CRONJOB}"
    kubectl -n "$NAMESPACE" patch cronjob "$CRONJOB" --type=merge -p '{"spec":{"suspend":false}}' >/dev/null || true
  fi
}
trap cleanup EXIT

cat "${SCRIPT_DIR}/_mint_k8s_gitlab_pat.rb" | kubectl exec -i -n "$GITLAB_NAMESPACE" "$GITLAB_POD" -- tee "$MINT_LIB_REMOTE" >/dev/null
cat "${SCRIPT_DIR}/${MINT_SCRIPT}" | kubectl exec -i -n "$GITLAB_NAMESPACE" "$GITLAB_POD" -- tee "$RAILS_MINT_PATH" >/dev/null
kubectl exec -n "$GITLAB_NAMESPACE" "$GITLAB_POD" -- gitlab-rails runner "ENV['MINT_LIB']='${MINT_LIB_REMOTE}'; load '${RAILS_MINT_PATH}'"
new_token="$(kubectl exec -n "$GITLAB_NAMESPACE" "$GITLAB_POD" -- cat "$PAT_OUT_PATH" | tr -d '\r')"
kubectl exec -n "$GITLAB_NAMESPACE" "$GITLAB_POD" -- sh -c "rm -f '${PAT_OUT_PATH}' '${RAILS_MINT_PATH}' '${MINT_LIB_REMOTE}'" >/dev/null || true
[[ -n "$new_token" ]] || { echo "ERROR: mint produced empty token" >&2; exit 1; }
api_test_token "$new_token" || { echo "ERROR: minted token failed API test" >&2; exit 1; }
patch_secret_token "$new_token"
echo "OK: patched ${SECRET_NAME} with new ${PAT_NAME} token"
