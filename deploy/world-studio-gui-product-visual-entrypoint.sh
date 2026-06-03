#!/usr/bin/env bash
# K8s entrypoint: sync studio+lic workspace, run goal-directed-loop until completion,
# idle without CrashLoopBackOff, and resume if a stale/false completion is detected after sync.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

STUDIO_ROOT="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_STUDIO_ROOT:-/workspace/studio}"
LIC_ROOT="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_LIC_ROOT:-/workspace/lic}"
GOAL_FILE_REL="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_GOAL_FILE:-data/goal-directed-sprints/world-studio-gui-product-visual.md}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
AGENT="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_AGENT:-world_studio_builder}"
STUDIO_BRANCH="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_STUDIO_BRANCH:-cursor/world-studio-gui-product-visual}"
LIC_BRANCH="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_LIC_BRANCH:-cursor/world-studio-gui-product-visual}"
LOOP_SLEEP="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_LOOP_SLEEP_SEC:-${LI_GOAL_LOOP_SLEEP_SEC:-60}}"
IDLE_RECHECK_SEC="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_IDLE_RECHECK_SEC:-300}"
COMPLETION_GATE="${LI_WORLD_STUDIO_GUI_PRODUCT_VISUAL_COMPLETION_GATE:-scripts/world-studio-gui-product-visual-completion-gate.sh}"

echo "world-studio-gui-product-visual-entrypoint: studio=${STUDIO_ROOT} branch=${STUDIO_BRANCH}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-world-studio@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-world-studio}"

sync_repo() {
  local root="$1"
  local branch="$2"
  [[ -d "$root/.git" ]] || return 0
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

run_completion_gate() {
  local gate_path="$STUDIO_ROOT/$COMPLETION_GATE"
  [[ -f "$gate_path" ]] || gate_path="$STUDIO_ROOT/scripts/world-studio-gui-product-visual-completion-gate.sh"
  [[ -f "$gate_path" ]] || return 1
  bash "$gate_path"
}

sync_workspace() {
  sync_repo "$STUDIO_ROOT" "$STUDIO_BRANCH"
  sync_repo "$LIC_ROOT" "$LIC_BRANCH"
  export LIC_ROOT
  ensure_fixtures
  test -f "$STUDIO_ROOT/$GOAL_FILE_REL"
}

install_bundled_scripts() {
  for script in goal-directed-loop.sh goal-loop-self-unblock.sh; do
    if [[ -f "/config/${script}" ]]; then
      cp "/config/${script}" "${AGENTS_ROOT}/scripts/${script}"
      chmod +x "${AGENTS_ROOT}/scripts/${script}"
      echo "world-studio-gui-product-visual-entrypoint: installed /config/${script}"
    fi
  done
}

run_goal_loop() {
  install_bundled_scripts
  export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
  export LI_GOAL_LOOP_GATE_ONLY="${LI_GOAL_LOOP_GATE_ONLY:-1}"
  export LI_REPO_WORKFLOW_BRANCH="${LI_REPO_WORKFLOW_BRANCH:-$STUDIO_BRANCH}"
  export LI_REPO_WORKFLOW_TRACK_REMOTE="${LI_REPO_WORKFLOW_TRACK_REMOTE:-1}"
  export LI_GOAL_GATE_PREFER_CWD="${LI_GOAL_GATE_PREFER_CWD:-0}"
  export LI_GOAL_SYNC_CWD_AFTER_RUN="${LI_GOAL_SYNC_CWD_AFTER_RUN:-1}"
  export LI_GOAL_SELF_UNBLOCK="${LI_GOAL_SELF_UNBLOCK:-1}"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo studio \
    --cwd "$STUDIO_ROOT" \
    --goal-file "$STUDIO_ROOT/$GOAL_FILE_REL" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

idle_until_gate_fails() {
  echo "world-studio-gui-product-visual-entrypoint: GOAL COMPLETE — idle recheck every ${IDLE_RECHECK_SEC}s"
  while true; do
    sleep "$IDLE_RECHECK_SEC"
    echo "world-studio-gui-product-visual-entrypoint: recheck completion gate after origin sync"
    sync_workspace || {
      echo "world-studio-gui-product-visual-entrypoint: sync failed during idle recheck (retrying)" >&2
      continue
    }
    if ! run_completion_gate; then
      echo "world-studio-gui-product-visual-entrypoint: gate no longer passes — resuming sprint"
      return 0
    fi
    echo "world-studio-gui-product-visual-entrypoint: still complete after recheck"
  done
}

while true; do
  sync_workspace

  set +e
  run_goal_loop
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    idle_until_gate_fails
    continue
  fi

  echo "world-studio-gui-product-visual-entrypoint: loop stopped without completion (exit $rc) — retry in ${LOOP_SLEEP}s" >&2
  sleep "$LOOP_SLEEP"
done
