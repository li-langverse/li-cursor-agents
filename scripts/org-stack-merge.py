#!/usr/bin/env python3
"""Phase G: stack multiple PR branches into one integration branch (no commits dropped).

Usage:
  python scripts/org-stack-merge.py --repo lic --numbers 557,558,559 --branch org-merge/lic-stack-1
  python scripts/org-stack-merge.py --dry-run --repo lic --numbers 557,558
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

ORG = "li-langverse"
ROOT = os.environ.get("LI_SIBLING_REPOS_ROOT") or os.path.join(
    os.path.dirname(__file__), "..", ".."
)


def run(cmd: list[str], cwd: str) -> None:
    print(f"$ {' '.join(cmd)}", flush=True)
    p = subprocess.run(cmd, cwd=cwd, check=False, text=True, capture_output=True)
    if p.stdout:
        print(p.stdout.rstrip())
    if p.returncode != 0:
        if p.stderr:
            print(p.stderr.rstrip(), file=sys.stderr)
        raise SystemExit(p.returncode)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--numbers", required=True, help="Comma-separated PR numbers, merge order")
    ap.add_argument("--branch", required=True, help="Integration branch name")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    nums = [int(x.strip()) for x in args.numbers.split(",") if x.strip()]
    local = os.path.join(ROOT, args.repo)
    if not os.path.isdir(os.path.join(local, ".git")):
        raise SystemExit(f"no local repo at {local}")

    if args.dry_run:
        print(f"would stack {len(nums)} PRs in {args.repo} -> {args.branch}")
        for n in nums:
            print(f"  merge pull/{n}/head")
        return

    run(["git", "fetch", "origin", "main"], local)
    run(["git", "checkout", "-B", args.branch, "origin/main"], local)

    for n in nums:
        run(["git", "fetch", "origin", f"pull/{n}/head"], local)
        run(
            [
                "git",
                "merge",
                "FETCH_HEAD",
                "-m",
                f"stack: merge PR #{n} into {args.branch}",
            ],
            local,
        )

    run(["git", "push", "-u", "origin", args.branch], local)
    print(
        json.dumps(
            {
                "repo": args.repo,
                "branch": args.branch,
                "stacked_prs": nums,
                "next": (
                    f"Open PR {args.branch} -> main on {ORG}/{args.repo}; "
                    "merge when CI green; close superseded PRs only after commits on main."
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
