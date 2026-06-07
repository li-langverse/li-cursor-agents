#!/usr/bin/env bash
# K8s entrypoint: li-research warm index ingest track (li-langverse).
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required (li-langverse only)}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH="${LI_GOAL_BRANCH:-cursor/li-research-r1b}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/wp-li-research-r1b-warm-ingest.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-180}"

INGEST_ROOT="${WORKSPACE}/li-research-ingest"
LIDB_ROOT="${WORKSPACE}/lidb"

echo "li-research-ingest-entrypoint: org=${ORG}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-li-research-ingest@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-research-ingest-agent}"

clone_or_sync() {
  local org_repo="$1" dest="$2" branch="$3"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    if ! gh repo view "${org_repo}" >/dev/null 2>&1; then
      echo "li-research-ingest-entrypoint: waiting for ${org_repo} (product worker creates it)" >&2
      return 1
    fi
    gh repo clone "${org_repo}" "$dest" -- --branch "$branch" 2>/dev/null || {
      gh repo clone "${org_repo}" "$dest"
      git -C "$dest" checkout -B "$branch"
    }
    return 0
  fi
  git -C "$dest" fetch origin --prune
  if git -C "$dest" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$dest" checkout -f -B "$branch" "origin/${branch}"
    git -C "$dest" reset --hard "origin/${branch}"
  else
    git -C "$dest" checkout -B "$branch"
  fi
}

seed_goal() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints"
  if [[ -f /config/wp-li-research-r1b-warm-ingest.md ]]; then
    cp -f /config/wp-li-research-r1b-warm-ingest.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  fi
}

resolve_goal_file() {
  if [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]]; then
    echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"
    return 0
  fi
  if [[ -f /config/wp-li-research-r1b-warm-ingest.md ]]; then
    echo "/config/wp-li-research-r1b-warm-ingest.md"
    return 0
  fi
  return 1
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH"
  export LI_GOAL_WORKSPACE="$WORKSPACE"
  local goal_path
  goal_path="$(resolve_goal_file)"
  export LI_GOAL_FILE="$goal_path"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo li-research-ingest \
    --cwd "$INGEST_ROOT" \
    --goal-file "$goal_path" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

sync_workspace() {
  clone_or_sync "${ORG}/li-research-ingest" "$INGEST_ROOT" "$BRANCH" || true
  clone_or_sync "${ORG}/lidb" "$LIDB_ROOT" "$BRANCH" || true
}

seed_goal
test -f "$(resolve_goal_file)" || { echo "missing goal file" >&2; exit 1; }

while true; do
  sync_workspace
  set +e
  run_goal_loop
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    finish_on_goal_complete
  fi
  echo "li-research-ingest-entrypoint: retry in ${LOOP_SLEEP}s (exit $rc)" >&2
  sleep "$LOOP_SLEEP"
done
