#!/usr/bin/env python3
import argparse
import json
import os

DEFAULT = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", default=DEFAULT)
    args = ap.parse_args()

    with open(args.queue, encoding="utf-8") as f:
        d = json.load(f)

    r = d["report"]
    print(json.dumps(r, indent=2))
    for key in ("green", "blocked", "dirty"):
        rows = d.get(key, [])
        print(f"\n{key} ({len(rows)}):")
        for row in rows[:50]:
            print(
                f"  {row['repo']}#{row['number']} ci={row['ci']} "
                f"state={row['mergeable_state']} {row['title'][:55]}"
            )


if __name__ == "__main__":
    main()
