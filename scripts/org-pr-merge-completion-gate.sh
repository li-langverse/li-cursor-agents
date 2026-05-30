#!/usr/bin/env bash
# Exit 0 when li-langverse has zero open pull requests.
# Run from workspace root (goal-directed-loop --cwd ..).
set -euo pipefail
python3 scripts/org-pr-open-count.py --require-zero
