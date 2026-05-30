#!/usr/bin/env python3
"""Fix dirty PRs from queue JSON without re-classifying all PRs."""
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


def get_pr(repo: str, num: int) -> dict:
    url = f"{API}/repos/{ORG}/{repo}/pulls/{num}"
    r = urllib.request.Request(url, headers=headers(), method="GET")
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read().decode())


def update_branch(repo: str, num: int) -> tuple[bool, str]:
    head_sha = get_pr(repo, num)["head"]["sha"]
    url = f"{API}/repos/{ORG}/{repo}/pulls/{num}/update-branch"
    data = json.dumps({"expected_head_sha": head_sha}).encode()
    r = urllib.request.Request(url, data=data, headers=headers(), method="PUT")
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return True, "updated"
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
            msg = payload.get("message", raw)
        except json.JSONDecodeError:
            msg = raw or str(e)
        return False, f"{e.code}:{msg}"


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    with open(QUEUE, encoding="utf-8") as f:
        dirty = json.load(f).get("dirty", [])
    if limit:
        dirty = dirty[:limit]
    print(f"updating {len(dirty)} dirty PRs", flush=True)
    ok_count = 0
    for row in dirty:
        repo, num = row["repo"], row["number"]
        ok, msg = update_branch(repo, num)
        print(f"UPDATE {repo}#{num} -> {msg}", flush=True)
        if ok:
            ok_count += 1
        time.sleep(0.3)
    print(f"updated={ok_count}", flush=True)


if __name__ == "__main__":
    main()
