#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from _gh_search_retry import search_issues

ORG = "li-langverse"
BASELINE = Path(__file__).resolve().parents[1] / "data" / "goal-directed-sprints" / "org-pr-merge-baseline.json"


def baseline_keys() -> set[tuple[str, int]]:
    if not BASELINE.exists():
        return set()
    return {
        (p["repo"], int(p["number"]))
        for p in json.loads(BASELINE.read_text(encoding="utf-8")).get("prs", [])
    }


def count_open(new_only: bool = False) -> int:
    baseline = baseline_keys() if new_only else set()
    items = search_issues(f"org:{ORG} is:open is:pr")
    n = 0
    for item in items:
        key = (item["repository_url"].rstrip("/").split("/")[-1], int(item["number"]))
        if not new_only or key not in baseline:
            n += 1
    return n


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--new-only", action="store_true")
    p.add_argument("--require-zero", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    label = "new_open_prs" if args.new_only else "open_prs"
    c = count_open(args.new_only)
    print(json.dumps({label: c}) if args.json else f"org-pr-merge: {label}={c}")
    if args.require_zero:
        sys.exit(0 if c == 0 else 1)


if __name__ == "__main__":
    main()
