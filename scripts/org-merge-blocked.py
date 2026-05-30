#!/usr/bin/env python3
"""Try squash-merge on blocked-but-CI-green PRs from queue JSON."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

ORG = "li-langverse"
API = "https://api.github.com"
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
    with open(QUEUE, encoding="utf-8") as f:
        data = json.load(f)
    blocked = data.get("blocked", [])
    print(f"attempting {len(blocked)} blocked PRs", flush=True)
    merged = 0
    for row in blocked:
        repo, num = row["repo"], row["number"]
        ok, msg = squash_merge(repo, num)
        print(f"MERGE {repo}#{num} -> {msg}", flush=True)
        if ok:
            merged += 1
        time.sleep(0.5)
    print(f"merged={merged}", flush=True)


if __name__ == "__main__":
    main()
