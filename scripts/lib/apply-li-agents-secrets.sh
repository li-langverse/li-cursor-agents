#!/usr/bin/env bash
# Apply li-agents-secrets with GitLab-primary token mapping.
apply_li_agents_secrets() {
  local ns="${1:-li-swarm}"
  local secret_name="${2:-li-agents-secrets}"
  local args=()

  local gh="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  local gl="${GITLAB_TOKEN:-}"

  [[ -n "$gl" ]] && args+=(--from-literal=GITLAB_TOKEN="$gl")
  [[ -n "$gh" ]] && args+=(--from-literal=GH_TOKEN="$gh")
  [[ -n "${CURSOR_API_KEY:-}" ]] && args+=(--from-literal=CURSOR_API_KEY="$CURSOR_API_KEY")
  [[ -n "${CURSOR_SDK_KEY:-}" ]] && args+=(--from-literal=CURSOR_SDK_KEY="$CURSOR_SDK_KEY")
  [[ -n "${SUPABASE_URL:-}" ]] && args+=(--from-literal=SUPABASE_URL="$SUPABASE_URL")
  [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && args+=(--from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY")

  if [[ ${#args[@]} -eq 0 ]] || { [[ -z "$gl" ]] && [[ -z "$gh" ]]; }; then
    echo "ERROR: GITLAB_TOKEN or GH_TOKEN required for ${secret_name}" >&2
    return 1
  fi

  kubectl -n "$ns" create secret generic "$secret_name" \
    "${args[@]}" \
    --dry-run=client -o yaml | kubectl apply -f -
}

require_li_agents_tokens() {
  if [[ "${LI_GIT_REQUIRE_GITLAB:-1}" == "1" && -z "${GITLAB_TOKEN:-}" ]]; then
    echo "ERROR: GITLAB_TOKEN required for GitLab-primary git (org policy; load from ~/launchpad/.env or li/.env.gitlab)" >&2
    return 1
  fi
  if [[ -z "${GITLAB_TOKEN:-}" && -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
    echo "ERROR: GITLAB_TOKEN or GH_TOKEN required (load from ~/launchpad/.env or li/.env.gitlab)" >&2
    return 1
  fi
}
