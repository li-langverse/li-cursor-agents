#!/usr/bin/env python3
"""Close open PRs whose branch adds no commits vs origin/main (Phase E dedupe)."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ORG = "li-langverse"
API = "https://api.github.com"
ROOT = os.environ.get("LI_SIBLING_REPOS_ROOT") or os.path.join(
    os.path.dirname(__file__), "..", ".."
)
QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)


def headers() -> dict[str, str]:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN required")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def unique_commits(repo: str, num: int) -> bool:
    local = os.path.join(ROOT, repo)
    if not os.path.isdir(os.path.join(local, ".git")):
        return True
    subprocess.run(
        ["git", "fetch", "origin", "main", f"pull/{num}/head"],
        cwd=local,
        capture_output=True,
    )
    r = subprocess.run(
        ["git", "log", "--oneline", "origin/main..FETCH_HEAD"],
        cwd=local,
        capture_output=True,
        text=True,
    )
    return bool(r.stdout.strip())


def close_pr(repo: str, num: int) -> tuple[bool, str]:
    url = f"{API}/repos/{ORG}/{repo}/pulls/{num}"
    data = json.dumps({"state": "closed"}).encode()
    req = urllib.request.Request(url, data=data, headers=headers(), method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            json.loads(resp.read().decode())
            return True, "closed"
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return False, f"{e.code}:{raw[:200]}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", default=QUEUE, help="Queue JSON with dirty array")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.queue, encoding="utf-8") as f:
        rows = json.load(f).get("dirty", [])
    if args.limit:
        rows = rows[: args.limit]

    closed = 0
    for row in rows:
        repo, num = row["repo"], int(row["number"])
        if unique_commits(repo, num):
            print(f"SKIP {repo}#{num} (has unique commits)", flush=True)
            continue
        if args.dry_run:
            print(f"WOULD_CLOSE {repo}#{num}", flush=True)
            continue
        ok, msg = close_pr(repo, num)
        print(f"CLOSE {repo}#{num} -> {msg}", flush=True)
        if ok:
            closed += 1
        time.sleep(0.3)
    print(f"closed={closed}", flush=True)


if __name__ == "__main__":
    main()
