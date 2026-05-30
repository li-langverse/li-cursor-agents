#!/usr/bin/env python3
"""Squash-merge green/blocked rows from a filtered org-pr queue JSON."""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request

ORG = "li-langverse"
API = "https://api.github.com"


def headers() -> dict[str, str]:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN required")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def squash_merge(repo: str, num: int) -> tuple[bool, str]:
    url = f"{API}/repos/{ORG}/{repo}/pulls/{num}/merge"
    data = json.dumps({"merge_method": "squash"}).encode()
    r = urllib.request.Request(url, data=data, headers=headers(), method="PUT")
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            payload = json.loads(resp.read().decode())
            return True, payload.get("sha", "merged")[:7]
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
            msg = payload.get("message", raw)
        except json.JSONDecodeError:
            msg = raw or str(e)
        return False, f"{e.code}:{msg}"


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
