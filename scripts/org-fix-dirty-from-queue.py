#!/usr/bin/env python3
"""Fix dirty PRs/MRs from queue JSON without re-classifying all open items."""
from __future__ import annotations

import json
import os
import sys
import time

from _vcs_api import update_branch

QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    with open(QUEUE, encoding="utf-8") as f:
        dirty = json.load(f).get("dirty", [])
    if limit:
        dirty = dirty[:limit]
    print(f"updating {len(dirty)} dirty PRs", flush=True)
    ok_count = 0
    for row in dirty:
        repo, num = row["repo"], row["number"]
        ok, msg = update_branch(repo, num)
        print(f"UPDATE {repo}#{num} -> {msg}", flush=True)
        if ok:
            ok_count += 1
        time.sleep(0.3)
    print(f"updated={ok_count}", flush=True)


if __name__ == "__main__":
    main()
