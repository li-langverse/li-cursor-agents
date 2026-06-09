#!/usr/bin/env python3
"""Close superseded duplicate MRs with audit comments (org swarm hygiene).

GitLab primary (LI_VCS_PROVIDER=gitlab, GITLAB_TOKEN). GitHub fallback optional.

Presets:
  studio-w0-dupes   — close studio !21-!65 (W0 landed via !19); keep !66+
  lic-phml-dupes    — close lic !703-!715; keep !716

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
from datetime import datetime, timezone

from _vcs_config import gitlab_host, gitlab_group, vcs_provider
from _vcs_issue_api import close_mr, get_mr, mr_is_closed, post_mr_comment

ORG = "li-langverse"
AUDIT = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-close-audit.jsonl"
)

PRESETS: dict[str, dict] = {
    "studio-w0-dupes": {
        "repo": "studio",
        "range": (21, 65),
        "keep": {66},
        "reason": "W0 typography shipped via studio!19; duplicate agent MR stack",
        "anchor": "studio!19",
    },
    "lic-phml-dupes": {
        "repo": "lic",
        "range": (703, 715),
        "keep": {716},
        "reason": "PH-ML duplicate MR stack; keep lic!716 (CI green)",
        "anchor": "lic!716",
    },
}


def append_audit(row: dict) -> None:
    os.makedirs(os.path.dirname(AUDIT), exist_ok=True)
    with open(AUDIT, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def mr_url(repo: str, num: int) -> str:
    if vcs_provider() == "gitlab":
        return f"https://{gitlab_host()}/{gitlab_group()}/{repo}/-/merge_requests/{num}"
    return f"https://github.com/{ORG}/{repo}/pull/{num}"


def close_one(repo: str, num: int, reason: str, anchor: str, dry_run: bool) -> tuple[bool, str]:
    try:
        mr = get_mr(repo, num)
    except RuntimeError as err:
        return False, f"fetch failed ({err})"
    if mr_is_closed(mr):
        return True, "already closed"
    title = mr.get("title", "")
    comment = (
        "**Closed by org swarm hygiene** (duplicate/superseded MR batch)\n\n"
        f"| Field | Value |\n|-------|-------|\n"
        f"| **reason** | {reason} |\n"
        f"| **anchor** | {anchor} |\n"
        f"| **title** | {title[:100]} |\n"
        f"| **url** | {mr_url(repo, num)} |\n"
        f"| **closed_at** | {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} |\n"
    )
    if dry_run:
        print(f"  [dry-run] would close {repo}!{num}: {title[:60]}")
        return True, "dry-run"
    c_status, _ = post_mr_comment(repo, num, comment)
    if c_status not in (200, 201):
        return False, f"comment failed ({c_status})"
    ok, msg = close_mr(repo, num)
    if not ok:
        return False, f"close failed ({msg})"
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
    print(f"  closed {repo}!{num}")
    return True, "closed"


def numbers_from_preset(preset: dict) -> list[int]:
    lo, hi = preset["range"]
    keep = preset.get("keep") or set()
    return [n for n in range(lo, hi + 1) if n not in keep]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", choices=sorted(PRESETS.keys()))
    ap.add_argument("--repo")
    ap.add_argument("--numbers", help="Comma-separated MR numbers")
    ap.add_argument("--keep", help="Comma-separated numbers to skip")
    ap.add_argument("--reason", default="duplicate/superseded")
    ap.add_argument("--anchor", default="main")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.5, help="Seconds between closes")
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
        ok, msg = close_one(repo, num, reason, anchor, args.dry_run)
        if not ok:
            fail_n += 1
            print(f"  FAIL {repo}!{num}: {msg}", file=sys.stderr)
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
