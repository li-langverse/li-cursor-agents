#!/usr/bin/env python3
import json
import os
import sys
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


def get_pr(repo: str, num: int) -> dict:
    url = f"{API}/repos/{ORG}/{repo}/pulls/{num}"
    r = urllib.request.Request(url, headers=headers(), method="GET")
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    for spec in sys.argv[1:]:
        repo, num_s = spec.split("#")
        num = int(num_s)
        d = get_pr(repo, num)
        print(
            f"{repo}#{num} state={d.get('mergeable_state')} mergeable={d.get('mergeable')} "
            f"draft={d.get('draft')} head={d['head']['ref']} title={d['title'][:80]}"
        )


if __name__ == "__main__":
    main()
