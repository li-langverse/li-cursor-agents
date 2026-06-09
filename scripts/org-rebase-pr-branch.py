#!/usr/bin/env python3
"""Rebase MR branch onto origin/main in a local sibling repo and push (GitLab primary)."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

from _vcs_api import get_pr, vcs_provider

# Sibling clones (lic, lip, …) live under the org workspace root, not li-cursor-agents/.
ROOT = os.environ.get("LI_SIBLING_REPOS_ROOT") or os.path.join(
    os.path.dirname(__file__), "..", ".."
)


def mr_head_ref(mr: dict) -> str:
    if vcs_provider() == "gitlab":
        return str(mr.get("source_branch") or "")
    return str(mr.get("head", {}).get("ref") or "")


def run(cmd: list[str], cwd: str) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    return p.returncode, out.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("repo")
    ap.add_argument("num", type=int)
    ap.add_argument("--ours-main", action="store_true", help="On conflict prefer main")
    args = ap.parse_args()

    mr = get_pr(args.repo, args.num)
    head_ref = mr_head_ref(mr)
    local = os.path.join(ROOT, args.repo)
    if not os.path.isdir(os.path.join(local, ".git")):
        raise SystemExit(f"no local repo at {local}")

    print(f"MR {args.repo}#{args.num} head={head_ref}", flush=True)

    if vcs_provider() == "gitlab":
        fetch_ref = head_ref
        local_head = f"mr-{args.num}-head"
        fetch_cmds = (
            ["git", "fetch", "origin", "main"],
            ["git", "fetch", "origin", f"{fetch_ref}:{local_head}"],
        )
    else:
        pull_ref = f"pull/{args.num}/head"
        local_head = f"pr-{args.num}-head"
        fetch_cmds = (
            ["git", "fetch", "origin", "main"],
            ["git", "fetch", "origin", f"{pull_ref}:{local_head}"],
        )

    for cmd in fetch_cmds:
        code, out = run(cmd, local)
        print(f"$ {' '.join(cmd)} -> {code}", flush=True)
        if code != 0:
            print(out)
            sys.exit(code)

    branch = f"mr-{args.num}-rebase" if vcs_provider() == "gitlab" else f"pr-{args.num}-rebase"
    for cmd in (
        ["git", "checkout", "-B", branch, local_head],
        ["git", "merge", "origin/main", "-m", f"merge main into {head_ref}"],
    ):
        code, out = run(cmd, local)
        print(f"$ {' '.join(cmd)} -> {code}", flush=True)
        if code != 0:
            print(out)
            if args.ours_main:
                code2, out2 = run(["git", "checkout", "--ours", "."], local)
                print(f"ours-main recovery -> {code2}")
                if code2 == 0:
                    run(["git", "add", "-A"], local)
                    run(["git", "commit", "--no-edit"], local)
            else:
                sys.exit(code)

    code, out = run(["git", "push", "origin", f"HEAD:{head_ref}"], local)
    print(f"push -> {code}")
    if code != 0:
        print(out)
        sys.exit(code)
    print("rebase push OK")


if __name__ == "__main__":
    main()
