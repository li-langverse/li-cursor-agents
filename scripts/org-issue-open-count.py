#!/usr/bin/env python3
"""Count open issues in li-langverse org."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
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


def count_open() -> int:
    page, n = 1, 0
    while True:
        q = urllib.parse.quote(f"org:{ORG} is:open is:issue")
        req = urllib.request.Request(
            f"{API}/search/issues?q={q}&per_page=100&page={page}",
            headers=headers(),
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
        items = data.get("items", [])
        n += len(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(1)
    return n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--require-zero", action="store_true")
    args = ap.parse_args()
    c = count_open()
    if args.json:
        print(json.dumps({"open_issues": c}))
    else:
        print(f"org-issue-zero: open_issues={c}")
    if args.require_zero:
        sys.exit(0 if c == 0 else 1)


if __name__ == "__main__":
    main()
