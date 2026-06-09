#!/usr/bin/env python3
"""Try squash-merge on blocked-but-CI-green PRs/MRs from queue JSON."""
from __future__ import annotations

import json
import os
import time

from _vcs_api import squash_merge

QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)


def main() -> None:
    with open(QUEUE, encoding="utf-8") as f:
        data = json.load(f)
    blocked = data.get("blocked", [])
    print(f"attempting {len(blocked)} blocked PRs", flush=True)
    merged = 0
    for row in blocked:
        repo, num = row["repo"], row["number"]
        ok, msg = squash_merge(repo, num)
        print(f"MERGE {repo}#{num} -> {msg}", flush=True)
        if ok:
            merged += 1
        time.sleep(0.5)
    print(f"merged={merged}", flush=True)


if __name__ == "__main__":
    main()
