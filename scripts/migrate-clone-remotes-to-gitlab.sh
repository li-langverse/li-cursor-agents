#!/usr/bin/env bash
# Rewrite origin → GitLab and add fetch-only github mirror on existing clones (background runners).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/git-primary-setup.sh
source "$ROOT/scripts/lib/git-primary-setup.sh"
li_git_primary_bootstrap "$ROOT" || {
  echo "ERROR: GITLAB_TOKEN required — load from ~/launchpad/.env" >&2
  exit 1
}

SCAN_ROOTS=(
  "$ROOT/data/workspaces"
)

migrated=0
skipped=0
for scan in "${SCAN_ROOTS[@]}"; do
  [[ -d "$scan" ]] || continue
  while IFS= read -r -d '' gitdir; do
    dir="$(dirname "$gitdir")"
    repo="$(basename "$dir")"
    if [[ "$repo" == "repo" ]]; then
      repo="$(basename "$(dirname "$dir")")"
    fi
    origin="$(git -C "$dir" remote get-url origin 2>/dev/null || true)"
    if [[ -z "$origin" ]]; then
      continue
    fi
    if [[ "$origin" == *"${LI_GIT_HOST}"* ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    li_git_ensure_remotes "$dir" "$repo"
    echo "migrated: $dir (repo=$repo)"
    migrated=$((migrated + 1))
  done < <(find "$scan" -type d -name .git -print0 2>/dev/null)
done

echo "Done — migrated ${migrated} clone(s), skipped ${skipped} already on GitLab."
