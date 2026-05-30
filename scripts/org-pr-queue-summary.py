#!/usr/bin/env python3
import json
import os

QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)

with open(QUEUE, encoding="utf-8") as f:
    d = json.load(f)

r = d["report"]
print(json.dumps(r, indent=2))
for key in ("green", "blocked", "dirty"):
    rows = d.get(key, [])
    print(f"\n{key} ({len(rows)}):")
    for row in rows[:50]:
        print(f"  {row['repo']}#{row['number']} ci={row['ci']} state={row['mergeable_state']} {row['title'][:55]}")
