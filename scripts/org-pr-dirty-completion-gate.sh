#!/usr/bin/env bash
# Phase C completion: no dirty PRs remain in baseline old subset.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

test -f data/goal-directed-sprints/org-pr-merge-baseline.json
test -f scripts/org-pr-baseline-filter.py
: "${GH_TOKEN:?GH_TOKEN required}"

python3 scripts/org-merge-open-prs.py --dry-run >/dev/null
python3 scripts/org-pr-baseline-filter.py --subset old --write-queue

DIRTY=$(python3 -c "
import json
from pathlib import Path
q = json.loads(Path('data/goal-directed-sprints/org-pr-merge-queue-old.json').read_text())
print(len(q.get('dirty', [])))
")

if [[ "$DIRTY" != "0" ]]; then
  echo "org-pr-dirty: FAIL — $DIRTY baseline dirty PRs remain" >&2
  python3 scripts/org-pr-queue-summary.py --queue data/goal-directed-sprints/org-pr-merge-queue-old.json 2>/dev/null || true
  exit 1
fi

echo "org-pr-dirty: completion gate OK (0 baseline dirty PRs)"
