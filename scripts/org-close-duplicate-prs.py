#!/usr/bin/env python3
"""Close superseded duplicate PRs with audit comments (org swarm hygiene).

Presets:
  studio-w0-dupes   — close studio #21-#65 (W0 landed via #19); keep #66+
  lic-phml-dupes    — close lic #703-#715; keep #716

Usage:
  python scripts/org-close-duplicate-prs.py --preset studio-w0-dupes --dry-run
  python scripts/org-close-duplicate-prs.py --repo studio --numbers 21,22,23 --keep 66
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ORG = "li-langverse"
API = "https://api.github.com"
AUDIT = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-close-audit.jsonl"
)

PRESETS: dict[str, dict] = {
    "studio-w0-dupes": {
        "repo": "studio",
        "range": (21, 65),
        "keep": {66},
        "reason": "W0 typography shipped via studio#19; duplicate agent PR stack",
        "anchor": "studio#19",
    },
    "lic-phml-dupes": {
        "repo": "lic",
        "range": (703, 715),
        "keep": {716},
        "reason": "PH-ML duplicate PR stack; keep lic#716 (CI green)",
        "anchor": "lic#716",
    },
}


from _gh_token import gh_token


def headers() -> dict[str, str]:
    token = gh_token()
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def api(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | None]:
    url = path if path.startswith("http") else f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else {"message": str(e)}
        except json.JSONDecodeError:
            payload = {"message": raw or str(e)}
        return e.code, payload


def append_audit(row: dict) -> None:
    os.makedirs(os.path.dirname(AUDIT), exist_ok=True)
    with open(AUDIT, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def close_pr(repo: str, num: int, reason: str, anchor: str, dry_run: bool) -> tuple[bool, str]:
    status, pr = api("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
    if status != 200 or not isinstance(pr, dict):
        return False, f"fetch failed ({status})"
    if pr.get("state") == "closed":
        return True, "already closed"
    title = pr.get("title", "")
    comment = (
        "**Closed by org swarm hygiene** (duplicate/superseded PR batch)\n\n"
        f"| Field | Value |\n|-------|-------|\n"
        f"| **reason** | {reason} |\n"
        f"| **anchor** | {anchor} |\n"
        f"| **title** | {title[:100]} |\n"
        f"| **closed_at** | {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} |\n"
    )
    if dry_run:
        print(f"  [dry-run] would close {repo}#{num}: {title[:60]}")
        return True, "dry-run"
    c_status, _ = api("POST", f"/repos/{ORG}/{repo}/issues/{num}/comments", {"body": comment})
    if c_status != 201:
        return False, f"comment failed ({c_status})"
    p_status, _ = api("PATCH", f"/repos/{ORG}/{repo}/pulls/{num}", {"state": "closed"})
    if p_status != 200:
        return False, f"close failed ({p_status})"
    append_audit(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "repo": repo,
            "number": num,
            "reason": reason,
            "anchor": anchor,
            "title": title[:120],
        }
    )
    print(f"  closed {repo}#{num}")
    return True, "closed"


def numbers_from_preset(preset: dict) -> list[int]:
    lo, hi = preset["range"]
    keep = preset.get("keep") or set()
    return [n for n in range(lo, hi + 1) if n not in keep]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", choices=sorted(PRESETS.keys()))
    ap.add_argument("--repo")
    ap.add_argument("--numbers", help="Comma-separated PR numbers")
    ap.add_argument("--keep", help="Comma-separated numbers to skip")
    ap.add_argument("--reason", default="duplicate/superseded")
    ap.add_argument("--anchor", default="main")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=2.0, help="Seconds between closes (rate limit)")
    args = ap.parse_args()

    if args.preset:
        preset = PRESETS[args.preset]
        repo = preset["repo"]
        nums = numbers_from_preset(preset)
        reason = preset["reason"]
        anchor = preset["anchor"]
    elif args.repo and args.numbers:
        repo = args.repo
        nums = [int(x.strip()) for x in args.numbers.split(",") if x.strip()]
        keep = {int(x.strip()) for x in (args.keep or "").split(",") if x.strip()}
        nums = [n for n in nums if n not in keep]
        reason = args.reason
        anchor = args.anchor
    else:
        ap.error("Provide --preset or --repo + --numbers")

    print(f"org-close-duplicate-prs: {repo} n={len(nums)} dry_run={args.dry_run}")
    closed_n = skip_n = fail_n = 0
    for i, num in enumerate(nums, 1):
        ok, msg = close_pr(repo, num, reason, anchor, args.dry_run)
        if not ok:
            fail_n += 1
            print(f"  FAIL {repo}#{num}: {msg}", file=sys.stderr)
        elif msg == "already closed":
            skip_n += 1
        elif msg == "dry-run":
            closed_n += 1
        else:
            closed_n += 1
        if i < len(nums):
            time.sleep(args.sleep)

    print(f"done: closed={closed_n} skipped={skip_n} failed={fail_n}")


if __name__ == "__main__":
    main()
