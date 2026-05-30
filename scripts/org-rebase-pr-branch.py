#!/usr/bin/env python3
"""Rebase PR branch onto origin/main in a local sibling repo and push."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request

ORG = "li-langverse"
API = "https://api.github.com"
# Sibling clones (lic, lip, …) live under the org workspace root, not li-cursor-agents/.
ROOT = os.environ.get("LI_SIBLING_REPOS_ROOT") or os.path.join(
    os.path.dirname(__file__), "..", ".."
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

    pr = get_pr(args.repo, args.num)
    head_ref = pr["head"]["ref"]
    head_repo = pr["head"]["repo"]["full_name"]
    local = os.path.join(ROOT, args.repo)
    if not os.path.isdir(os.path.join(local, ".git")):
        raise SystemExit(f"no local repo at {local}")

    print(f"PR {args.repo}#{args.num} head={head_ref} from {head_repo}", flush=True)

    pull_ref = f"pull/{args.num}/head"
    local_head = f"pr-{args.num}-head"
    for cmd in (
        ["git", "fetch", "origin", "main"],
        ["git", "fetch", "origin", f"{pull_ref}:{local_head}"],
    ):
        code, out = run(cmd, local)
        print(f"$ {' '.join(cmd)} -> {code}", flush=True)
        if code != 0:
            print(out)
            sys.exit(code)

    branch = f"pr-{args.num}-rebase"
    for cmd in (
        ["git", "checkout", "-B", branch, local_head],
        ["git", "merge", "origin/main", "-m", f"merge main into {head_ref}"],
    ):
        code, out = run(cmd, local)
        print(f"$ {' '.join(cmd)} -> {code}", flush=True)
        if code != 0:
            print(out)
            if args.ours_main:
                run(["git", "checkout", "--ours", "."], local)
                run(["git", "add", "-A"], local)
                code2, out2 = run(
                    ["git", "commit", "-m", f"merge main into {head_ref} (prefer main)"],
                    local,
                )
                print(f"auto-resolve prefer-main -> {code2}", flush=True)
                if code2 != 0:
                    print(out2)
                    sys.exit(code2)
            else:
                print("CONFLICT — resolve manually", flush=True)
                sys.exit(1)

    push_ref = f"{branch}:{head_ref}"
    code, out = run(["git", "push", "--force-with-lease", "origin", push_ref], local)
    if code != 0:
        print(f"force-with-lease failed -> {code}", flush=True)
        print(out)
        code, out = run(["git", "push", "--force", "origin", push_ref], local)
    print(f"push -> {code}", flush=True)
    if code != 0:
        print(out)
        sys.exit(code)
    print("OK pushed", flush=True)


if __name__ == "__main__":
    main()
