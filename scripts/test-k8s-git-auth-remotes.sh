#!/usr/bin/env bash
# Functional smoke: li_git_ensure_remotes migrates github origin → gitlab.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../deploy/k8s-git-auth.sh
source "$ROOT/deploy/k8s-git-auth.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

export GITLAB_TOKEN="test-gitlab-token"
export GH_TOKEN="test-github-token"
export LI_GIT_HOST="gitlab.lilangverse.xyz"
export LI_GIT_GROUP="li-langverse"
export LI_GITHUB_ORG="li-langverse"
li_git_primary_setup

git -C "$tmpdir" init -q
git -C "$tmpdir" remote add origin "https://github.com/li-langverse/lic.git"
git -C "$tmpdir" config user.email "test@test"
git -C "$tmpdir" config user.name "test"
echo x > "$tmpdir/README.md"
git -C "$tmpdir" add README.md
git -C "$tmpdir" commit -q -m init

li_git_ensure_remotes "$tmpdir" "lic"

origin="$(git -C "$tmpdir" remote get-url origin)"
github="$(git -C "$tmpdir" remote get-url github)"
pushurl="$(git -C "$tmpdir" config --get remote.github.pushurl || true)"

[[ "$origin" == *"gitlab"* ]] || { echo "FAIL: origin not gitlab: $origin" >&2; exit 1; }
[[ "$github" == *"github.com"* ]] || { echo "FAIL: github mirror missing: $github" >&2; exit 1; }
[[ "$pushurl" == "DISABLED" ]] || { echo "FAIL: github push not disabled: $pushurl" >&2; exit 1; }

echo "test-k8s-git-auth-remotes: ok"
