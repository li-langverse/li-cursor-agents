#!/usr/bin/env bash
# Completion gate: zero open issues in li-langverse org.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${GH_TOKEN:?GH_TOKEN required}"
python3 scripts/org-issue-open-count.py --require-zero
echo "org-issue-zero: completion gate OK"
