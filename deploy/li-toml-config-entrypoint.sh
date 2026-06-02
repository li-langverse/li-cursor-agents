#!/usr/bin/env bash
# K8s entrypoint: sync workspace repos + run goal-directed-loop for li-toml config migration.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH_HTTPD="${LI_GOAL_BRANCH_HTTPD:-cursor/li-toml-config-migration}"
BRANCH_BENCH="${LI_GOAL_BRANCH_BENCHMARKS:-feat/li-toml-config-pipeline}"
BRANCH_TOML="${LI_GOAL_BRANCH_LI_TOML:-cursor/li-toml-config-migration}"
GOAL_FILE="${LI_GOAL_FILE:-data/goal-directed-sprints/li-toml-config-migration.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_MAX="${LI_GOAL_LOOP_MAX:-0}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"

HTTPD_ROOT="${WORKSPACE}/li-httpd"
BENCH_ROOT="${WORKSPACE}/benchmarks"
LIC_ROOT="${WORKSPACE}/lic"
TOML_ROOT="${WORKSPACE}/li-toml"

echo "li-toml-config-entrypoint: workspace=${WORKSPACE} branch_httpd=${BRANCH_HTTPD}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-li-toml-agent@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-toml-config-agent}"

clone_or_sync() {
  local org_repo="$1" dest="$2" branch="$3"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    echo "li-toml-config-entrypoint: clone ${org_repo} -> ${dest} (${branch})"
    gh repo clone "${org_repo}" "$dest" -- --branch "$branch" 2>/dev/null || {
      gh repo clone "${org_repo}" "$dest"
      git -C "$dest" checkout -B "$branch"
    }
    return 0
  fi
  echo "li-toml-config-entrypoint: sync ${dest}"
  git -C "$dest" fetch origin --prune
  if git -C "$dest" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$dest" checkout -f -B "$branch" "origin/${branch}"
  else
    git -C "$dest" checkout -B "$branch"
  fi
}

# lic: compiler pin only (main)
clone_or_sync "${ORG}/lic" "$LIC_ROOT" "main"
clone_or_sync "${ORG}/li-httpd" "$HTTPD_ROOT" "$BRANCH_HTTPD"
clone_or_sync "${ORG}/benchmarks" "$BENCH_ROOT" "$BRANCH_BENCH"

if gh repo view "${ORG}/li-toml" >/dev/null 2>&1; then
  clone_or_sync "${ORG}/li-toml" "$TOML_ROOT" "$BRANCH_TOML"
else
  echo "li-toml-config-entrypoint: li-toml repo not found — agent must create in phase 0"
fi

# Sprint goal + loop state: seed from /config bundle, persist loop on workspace PVC.
mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints" "${AGENTS_ROOT}/data/li-toml-config-loop"
if [[ -f /config/li-toml-config-migration.md ]]; then
  cp -f /config/li-toml-config-migration.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
fi
if [[ ! -f "${AGENTS_ROOT}/data/li-toml-config-loop/state.json" && -f /config/state.json ]]; then
  cp -f /config/state.json "${AGENTS_ROOT}/data/li-toml-config-loop/"
fi
if [[ ! -f "${AGENTS_ROOT}/data/li-toml-config-loop/iteration-log.md" && -f /config/iteration-log.md ]]; then
  cp -f /config/iteration-log.md "${AGENTS_ROOT}/data/li-toml-config-loop/"
fi

test -f "${AGENTS_ROOT}/${GOAL_FILE}" || {
  echo "li-toml-config-entrypoint: missing goal file ${AGENTS_ROOT}/${GOAL_FILE}" >&2
  exit 1
}

export LIC_ROOT="$LIC_ROOT"
export BENCHMARKS_ROOT="$BENCH_ROOT"
export LI_TOML_ROOT="$TOML_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LI_GOAL_LOOP_SLEEP_SEC="$LOOP_SLEEP"

cd "$AGENTS_ROOT"
exec ./scripts/goal-directed-loop.sh \
  --agent "$AGENT" \
  --workflow-repo li-httpd \
  --cwd "$HTTPD_ROOT" \
  --benchmarks "$BENCH_ROOT" \
  --goal-file "$GOAL_FILE" \
  --max "$LOOP_MAX"
