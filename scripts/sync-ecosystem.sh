#!/usr/bin/env bash
# Pull li-langverse siblings, sync agent skills/prompts into li-cursor-agents.
#
# Usage:
#   ./scripts/sync-ecosystem.sh              # pull + sync skills + prompts
#   ./scripts/sync-ecosystem.sh --quick      # sync only (no git pull)
#   ./scripts/sync-ecosystem.sh --pull-only
#   LI_ECOSYSTEM_REPOS="lic benchmarks" ./scripts/sync-ecosystem.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
li_resolve_env_paths "$ROOT"

LI_LANGVERSE_ROOT="${LI_LANGVERSE_ROOT:-$(_abs_dir "$ROOT/..")}"
REF="${LI_ECOSYSTEM_REF:-main}"
QUICK=0
PULL_ONLY=0
SYNC_KIT="${LI_ECOSYSTEM_SYNC_AGENT_KIT:-0}"

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --pull-only) PULL_ONLY=1 ;;
    -h | --help)
      echo "Usage: $0 [--quick] [--pull-only]"
      exit 0
      ;;
  esac
done

# Core repos required for skill/prompt sources + briefing
DEFAULT_REPOS=(
  roadmap
  benchmarks
  lic
  lip
  lit
  lis
  li-cursor-agents
  li-local-ci
)

if [[ -n "${LI_ECOSYSTEM_REPOS:-}" ]]; then
  # shellcheck disable=SC2206
  REPOS=($LI_ECOSYSTEM_REPOS)
else
  REPOS=("${DEFAULT_REPOS[@]}")
  if command -v gh >/dev/null 2>&1; then
    mapfile -t GH_REPOS < <(gh repo list li-langverse --limit 200 --json name -q '.[].name' 2>/dev/null || true)
    if [[ ${#GH_REPOS[@]} -gt 0 ]]; then
      REPOS=("${GH_REPOS[@]}")
    fi
  fi
fi

pull_repo() {
  local name="$1"
  local dir="$LI_LANGVERSE_ROOT/$name"
  if [[ "$name" == "li-cursor-agents" ]]; then
    dir="$ROOT"
  fi
  if [[ -d "$dir/.git" ]]; then
    echo "pull $name @ $REF"
    git -C "$dir" fetch --prune origin "$REF" 2>/dev/null || git -C "$dir" fetch --prune origin
    local remote_ref="origin/${REF}"
    if ! git -C "$dir" rev-parse --verify -q "$remote_ref" >/dev/null 2>&1; then
      remote_ref="origin/main"
    fi
    git -C "$dir" checkout -q "$REF" 2>/dev/null || git -C "$dir" checkout -q main 2>/dev/null || true
    if ! git -C "$dir" merge --ff-only "$remote_ref" 2>/dev/null; then
      echo "WARN: $name not fast-forward; leaving working tree as-is" >&2
    fi
    return 0
  fi
  if [[ "${LI_ECOSYSTEM_CLONE_MISSING:-1}" != "1" ]]; then
    echo "skip clone (missing): $name"
    return 0
  fi
  echo "clone $name"
  git clone --depth 1 --branch "$REF" "https://github.com/li-langverse/${name}.git" "$dir" \
    2>/dev/null || git clone --depth 1 "https://github.com/li-langverse/${name}.git" "$dir"
}

STATE_DIR="$ROOT/data/control-plane"
mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/ecosystem-sync-state.json"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ "$QUICK" -eq 0 ]]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "git required" >&2
    exit 1
  fi
  echo "==> ecosystem pull (root=$LI_LANGVERSE_ROOT ref=$REF repos=${#REPOS[@]})"
  for name in "${REPOS[@]}"; do
    pull_repo "$name" || echo "WARN: pull failed for $name" >&2
  done
fi

if [[ "$PULL_ONLY" -eq 1 ]]; then
  cat >"$STATE_FILE" <<EOF
{"last_sync_at":"$STARTED","mode":"pull-only","repo_count":${#REPOS[@]}}
EOF
  exit 0
fi

echo "==> sync agent skills (canonical: $ROOT/.cursor/skills)"
BENCHMARKS_ROOT="$BENCHMARKS_ROOT" LIC_ROOT="${LIC_ROOT:-$LI_LANGVERSE_ROOT/lic}" \
  bash "$ROOT/scripts/sync-agent-skills.sh"

echo "==> sync prompts from benchmarks"
BENCHMARKS_ROOT="$BENCHMARKS_ROOT" bash "$ROOT/scripts/sync-prompts.sh" || true

if [[ "$SYNC_KIT" == "1" ]] && [[ -x "$ROOT/scripts/sync-agent-kit.sh" ]]; then
  echo "==> sync agent-kit (optional)"
  bash "$ROOT/scripts/sync-agent-kit.sh" --check || bash "$ROOT/scripts/sync-agent-kit.sh" || true
fi

# Validate registry skills on disk
missing=0
for id in explore-control-plane-db audit-plan-completion explore-li-ecosystem \
  li-ecosystem-discipline plan-feature-from-issue review-pr-alignment merge-approved-pr \
  plan-merge-queue research-li-numerics numerics-autoresearch hpc-competitive-review; do
  if [[ ! -f "$ROOT/.cursor/skills/$id/SKILL.md" ]]; then
    echo "MISSING skill: $id" >&2
    missing=1
  fi
done
[[ "$missing" -eq 0 ]] || exit 1

ENDED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat >"$STATE_FILE" <<EOF
{
  "last_sync_at": "$ENDED",
  "started_at": "$STARTED",
  "li_langverse_root": "$LI_LANGVERSE_ROOT",
  "ref": "$REF",
  "repo_count": ${#REPOS[@]},
  "quick": $QUICK
}
EOF
echo "==> ecosystem sync done ($ENDED)"
