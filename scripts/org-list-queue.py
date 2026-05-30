#!/usr/bin/env python3
"""Print org-pr-merge-queue buckets."""
import json
import os

QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)


def main() -> None:
    with open(QUEUE, encoding="utf-8") as f:
        q = json.load(f)
    for key in ("green", "blocked", "dirty", "ci_not_ok"):
        rows = q.get(key, [])
        print(f"=== {key} ({len(rows)}) ===")
        for r in rows:
            print(
                f"  {r['repo']}#{r['number']} "
                f"state={r.get('mergeable_state', '?')} ci={r.get('ci', '?')}"
            )


if __name__ == "__main__":
    main()
