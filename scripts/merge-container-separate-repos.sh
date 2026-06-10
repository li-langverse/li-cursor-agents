#!/usr/bin/env bash
# One-shot: merge feat/extern-def-container-seam → main on GitLab (in-cluster HTTP).
set -euo pipefail

: "${GITLAB_TOKEN:?GITLAB_TOKEN required}"

export LI_GIT_HOST="${LI_GIT_HOST:-gitlab.lilangverse.xyz}"
export LI_GIT_GROUP="${LI_GIT_GROUP:-li-langverse}"
export LI_GIT_SSL_VERIFY="${LI_GIT_SSL_VERIFY:-0}"
export LI_GIT_INTERNAL_SVC="${LI_GIT_INTERNAL_SVC:-gitlab.gitlab.svc}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../deploy/k8s-git-auth.sh
source "$ROOT/deploy/k8s-git-auth.sh"
li_git_primary_setup

WORKDIR="${TMPDIR:-/tmp}/lic-merge-$$"
rm -rf "$WORKDIR"
git clone "$(li_git_remote_url lic)" "$WORKDIR"
cd "$WORKDIR"

git fetch origin feat/extern-def-container-seam main
git checkout main
git merge --no-edit origin/feat/extern-def-container-seam
git push origin main

echo "MERGE_OK $(git rev-parse --short HEAD)"
rm -rf "$WORKDIR"
