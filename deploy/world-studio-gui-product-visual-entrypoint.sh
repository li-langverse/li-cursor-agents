#!/usr/bin/env bash
# K8s entrypoint: sync studio+lic workspace, run goal-directed-loop until completion, then scale down.
set -euo pipefail

# shellcheck source=k8s-git-auth.sh
source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
li_git_primary_setup || exit 1

STUDIO_ROOT="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_STUDIO_ROOT:-/workspace/studio}"
LIC_ROOT="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_LIC_ROOT:-/workspace/lic}"
GOAL_FILE_REL="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_GOAL_FILE:-data/goal-directed-sprints/world-studio-gui-product-visual.md}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
AGENT="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_AGENT:-world_studio_builder}"
STUDIO_BRANCH="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_STUDIO_BRANCH:-cursor/world-studio-gui-product-visual}"
LIC_BRANCH="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_LIC_BRANCH:-cursor/world-studio-gui-product-visual}"
LOOP_SLEEP="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_LOOP_SLEEP_SEC:-${LI_GOAL_LOOP_SLEEP_SEC:-60}}"

echo "world-studio-gui-product-visual-entrypoint: studio=${STUDIO_ROOT} branch=${STUDIO_BRANCH}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

git config --global user.email "${LI_GIT_USER_EMAIL:-world-studio@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-world-studio}"

sync_repo() {
  local root="$1"
  local branch="$2"
  [[ -d "$root/.git" ]] || return 0
  li_git_ensure_remotes "$root" "$(basename "$root")"
  git -C "$root" fetch origin --prune
  if git -C "$root" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$root" checkout -B "$branch" "origin/${branch}"
    git -C "$root" reset --hard "origin/${branch}"
  else
    git -C "$root" checkout -B "$branch"
  fi
}

ensure_fixtures() {
  if [[ ! -f "$STUDIO_ROOT/fixtures/mock-briefing.json" && -f "$AGENTS_ROOT/fixtures/mock-briefing.json" ]]; then
    mkdir -p "$STUDIO_ROOT/fixtures"
    cp "$AGENTS_ROOT/fixtures/mock-briefing.json" "$STUDIO_ROOT/fixtures/mock-briefing.json"
  fi
}

sync_workspace() {
  sync_repo "$STUDIO_ROOT" "$STUDIO_BRANCH"
  sync_repo "$LIC_ROOT" "$LIC_BRANCH"
  export LIC_ROOT
  ensure_fixtures
  test -f "$STUDIO_ROOT/$GOAL_FILE_REL"
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$STUDIO_BRANCH"
  export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo studio \
    --cwd "$STUDIO_ROOT" \
    --goal-file "$STUDIO_ROOT/$GOAL_FILE_REL" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

while true; do
  sync_workspace

  set +e
  run_goal_loop
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    finish_on_goal_complete
  fi

  echo "world-studio-gui-product-visual-entrypoint: loop stopped without completion (exit $rc) — retry in ${LOOP_SLEEP}s" >&2
  sleep "$LOOP_SLEEP"
done
