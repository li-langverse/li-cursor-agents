#!/usr/bin/env python3
"""Print org-issue-queue.json bucket counts."""
import json
import os
import sys

QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-issue-queue.json"
)


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else QUEUE
    with open(path, encoding="utf-8") as f:
        q = json.load(f)
    print(json.dumps(q.get("report", {}), indent=2))
    for key, rows in q.items():
        if key == "report" or not isinstance(rows, list):
            continue
        print(f"\n{key} ({len(rows)}):")
        for r in rows[:15]:
            print(f"  {r['repo']}#{r['number']} {r.get('classification_note','')}")
        if len(rows) > 15:
            print(f"  ... +{len(rows) - 15} more")


if __name__ == "__main__":
    main()
