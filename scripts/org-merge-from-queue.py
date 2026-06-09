#!/usr/bin/env python3
"""Squash-merge green/blocked rows from a filtered org-pr queue JSON."""
from __future__ import annotations

import argparse
import json
import time

from _vcs_api import squash_merge


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--queue", required=True, help="Queue JSON (green/blocked arrays)")
    p.add_argument("--merge-green", action="store_true")
    p.add_argument("--merge-blocked", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    with open(args.queue, encoding="utf-8") as f:
        data = json.load(f)

    rows: list[dict] = []
    if args.merge_green:
        rows.extend(data.get("green", []))
    if args.merge_blocked:
        rows.extend(data.get("blocked", []))

    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    print(f"queue={args.queue} candidates={len(rows)}", flush=True)
    merged = 0
    for row in rows:
        repo, num = row["repo"], int(row["number"])
        if args.dry_run:
            print(f"WOULD_MERGE {repo}#{num}", flush=True)
            continue
        ok, msg = squash_merge(repo, num)
        print(f"MERGE {repo}#{num} -> {msg}", flush=True)
        if ok:
            merged += 1
        time.sleep(0.5)
    print(f"merged={merged}", flush=True)


if __name__ == "__main__":
    main()
