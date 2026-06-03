#!/usr/bin/env bash
set -euo pipefail
: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

STUDIO_ROOT="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_STUDIO_ROOT:-/workspace/studio}"
LIC_ROOT="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_LIC_ROOT:-/workspace/lic}"
GOAL_FILE_REL="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_GOAL_FILE:-data/goal-directed-sprints/world-studio-gui-demo-recorder.md}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
AGENT="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_AGENT:-world_studio_builder}"
STUDIO_BRANCH="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_STUDIO_BRANCH:-cursor/world-studio-gui-demo-recorder}"
LIC_BRANCH="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_LIC_BRANCH:-cursor/world-studio-gui-demo-recorder}"
LOOP_SLEEP="${LI_WORLD_STUDIO_GUI_DEMO_RECORDER_LOOP_SLEEP_SEC:-60}"

echo "world-studio-gui-demo-recorder-entrypoint: studio=${STUDIO_ROOT} branch=${STUDIO_BRANCH}"

[[ -f /config/k8s-goal-loop-common.sh ]] && source /config/k8s-goal-loop-common.sh

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"

auth_git_url() { echo "$1" | sed "s#https://#https://x-access-token:${GH_TOKEN}@#"; }

sync_repo() {
  local root="$1" branch="$2"
  [[ -d "$root/.git" ]] || return 0
  local url; url="$(git -C "$root" remote get-url origin)"
  url="$(echo "$url" | sed 's#https://x-access-token:[^@]*@#https://#')"
  git -C "$root" remote set-url origin "$(auth_git_url "$url")"
  git -C "$root" fetch origin --prune "refs/heads/${branch}:refs/remotes/origin/${branch}" || git -C "$root" fetch origin --prune
  if git -C "$root" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$root" checkout -B "$branch" "origin/${branch}"
    git -C "$root" reset --hard "origin/${branch}"
  else
    echo "WARN origin/${branch} missing in ${root}" >&2
    git -C "$root" checkout -B "$branch"
  fi
}

sync_workspace() {
  sync_repo "$STUDIO_ROOT" "$STUDIO_BRANCH"
  sync_repo "$LIC_ROOT" "$LIC_BRANCH"
  export LIC_ROOT
  if [[ ! -f "$STUDIO_ROOT/$GOAL_FILE_REL" ]]; then
    echo "missing goal $STUDIO_ROOT/$GOAL_FILE_REL" >&2
    exit 1
  fi
  echo "goal file ok"
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$STUDIO_BRANCH"
  export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" --workflow-repo studio --cwd "$STUDIO_ROOT" \
    --goal-file "$STUDIO_ROOT/$GOAL_FILE_REL" --max 0 --sleep "$LOOP_SLEEP"
}

while true; do
  sync_workspace
  set +e; run_goal_loop; rc=$?; set -e
  [[ "$rc" -eq 0 ]] && finish_on_goal_complete
  echo "loop stopped (exit $rc) — retry in ${LOOP_SLEEP}s" >&2
  sleep "$LOOP_SLEEP"
done
