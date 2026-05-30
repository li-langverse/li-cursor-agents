#!/usr/bin/env python3
import json
import os

QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)

with open(QUEUE, encoding="utf-8") as f:
    d = json.load(f)

for key in ("green", "blocked", "dirty"):
    for row in d.get(key, []):
        if row["number"] in (519, 210) or "519" in row["title"] or "210" in row["title"]:
            print(f"{key}: {row['repo']}#{row['number']} ci={row['ci']} state={row['mergeable_state']} {row['title']}")
