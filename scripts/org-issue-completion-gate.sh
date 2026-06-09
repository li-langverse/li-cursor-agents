#!/usr/bin/env bash
# Completion gate: zero open issues in li-langverse org (GitLab primary).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${GITLAB_TOKEN:?GITLAB_TOKEN required}"
python3 scripts/org-issue-open-count.py --require-zero
echo "org-issue-zero: completion gate OK"
