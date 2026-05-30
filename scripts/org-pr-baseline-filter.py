#!/usr/bin/env python3
"""Filter org-pr queue by baseline snapshot (old vs new PRs).

Usage:
  python3 scripts/org-pr-baseline-filter.py --subset old --write-queue
  python3 scripts/org-pr-baseline-filter.py --subset new --write-queue
"""
from __future__ import annotations

import argparse
import json
import os

BASELINE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-baseline.json"
)
QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)


def pr_key(row: dict) -> str:
    return f"{row['repo']}#{row['number']}"


def load_baseline() -> set[str]:
    with open(BASELINE, encoding="utf-8") as f:
        data = json.load(f)
    return {pr_key(r) for r in data.get("prs", [])}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subset", choices=["old", "new"], required=True)
    ap.add_argument("--write-queue", action="store_true")
    args = ap.parse_args()

    with open(QUEUE, encoding="utf-8") as f:
        queue = json.load(f)

    baseline = load_baseline()
    out_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "data",
        "goal-directed-sprints",
        f"org-pr-merge-queue-{args.subset}.json",
    )

    def filter_rows(rows: list[dict]) -> list[dict]:
        if args.subset == "old":
            return [r for r in rows if pr_key(r) in baseline]
        return [r for r in rows if pr_key(r) not in baseline]

    filtered = {
        "report": queue.get("report", {}),
        "green": filter_rows(queue.get("green", [])),
        "blocked": filter_rows(queue.get("blocked", [])),
        "dirty": filter_rows(queue.get("dirty", [])),
        "ci_not_ok": filter_rows(queue.get("ci_not_ok", [])),
    }
    filtered["report"] = {
        **filtered["report"],
        "subset": args.subset,
        "baseline_size": len(baseline),
        "green": len(filtered["green"]),
        "blocked": len(filtered["blocked"]),
        "dirty": len(filtered["dirty"]),
        "ci_not_ok": len(filtered["ci_not_ok"]),
    }

    if args.write_queue:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(filtered, f, indent=2)
        print(f"wrote {out_path}")

    print(json.dumps(filtered["report"], indent=2))


if __name__ == "__main__":
    main()
