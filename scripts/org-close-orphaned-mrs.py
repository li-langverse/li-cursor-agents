#!/usr/bin/env python3
"""Close MRs whose source branch is missing from the project (misplaced/orphaned).

GitLab primary (LI_VCS_PROVIDER=gitlab, GITLAB_TOKEN).

Usage:
  python scripts/org-close-orphaned-mrs.py --repo li-cursor-agents --number 1
  python scripts/org-close-orphaned-mrs.py --scan --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone

from _vcs_api import _gitlab_req, get_pr, search_open_prs, vcs_provider
from _vcs_config import gitlab_group, gitlab_host
from _vcs_issue_api import close_mr, get_mr, mr_is_closed, post_mr_comment

AUDIT = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-close-audit.jsonl"
)


def _encode_project(repo: str) -> str:
    return urllib.parse.quote(f"{gitlab_group()}/{repo}", safe="")


def branch_exists_in_repo(repo: str, branch: str) -> bool:
    enc = urllib.parse.quote(branch, safe="")
    status, _ = _gitlab_req("GET", f"/projects/{_encode_project(repo)}/repository/branches/{enc}")
    return status == 200


def find_branch_in_group(branch: str, skip_repo: str) -> str | None:
    enc_branch = urllib.parse.quote(branch, safe="")
    group = urllib.parse.quote(gitlab_group(), safe="")
    status, data = _gitlab_req(
        "GET",
        f"/groups/{group}/projects?include_subgroups=true&per_page=100&search={urllib.parse.quote(branch[:40], safe='')}",
    )
    if status != 200 or not isinstance(data, list):
        return None
    for proj in data:
        path = str(proj.get("path_with_namespace") or "")
        name = path.rsplit("/", 1)[-1] if path else str(proj.get("path") or "")
        if not name or name == skip_repo:
            continue
        if branch_exists_in_repo(name, branch):
            return name
    return None


def append_audit(row: dict) -> None:
    os.makedirs(os.path.dirname(AUDIT), exist_ok=True)
    with open(AUDIT, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def close_orphaned(repo: str, num: int, dry_run: bool) -> tuple[bool, str]:
    if vcs_provider() != "gitlab":
        return False, "gitlab only"

    mr = get_mr(repo, num)
    if mr_is_closed(mr):
        return True, "already closed"

    branch = str(mr.get("source_branch") or "").strip()
    title = str(mr.get("title") or "")
    if not branch:
        return False, "no source_branch"

    if branch_exists_in_repo(repo, branch):
        return False, f"branch {branch!r} exists in {repo} — not orphaned"

    alt_repo = find_branch_in_group(branch, skip_repo=repo)
    alt_note = ""
    if alt_repo:
        alt_url = f"https://{gitlab_host()}/{gitlab_group()}/{alt_repo}/-/tree/{urllib.parse.quote(branch, safe='')}"
        alt_note = (
            f"\n\n**Correct repo:** `{alt_repo}` has branch `{branch}` "
            f"([view branch]({alt_url})). Open or track the MR there instead."
        )

    comment = (
        "**Closed by org swarm hygiene** (orphaned MR — source branch missing from project)\n\n"
        f"| Field | Value |\n|-------|-------|\n"
        f"| **reason** | Source branch `{branch}` does not exist in `{repo}` |\n"
        f"| **title** | {title[:100]} |\n"
        f"| **closed_at** | {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} |\n"
        f"{alt_note}\n\n"
        "Agent: `code_implementer` · script: `org-close-orphaned-mrs.py`"
    )

    if dry_run:
        print(f"  [dry-run] would close {repo}!{num}: branch {branch!r} missing")
        if alt_repo:
            print(f"            branch found in {alt_repo}")
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
            "reason": "orphaned_branch",
            "branch": branch,
            "alt_repo": alt_repo,
            "title": title[:120],
        }
    )
    print(f"  closed {repo}!{num} (orphaned branch {branch!r})")
    return True, "closed"


def scan_open(dry_run: bool, sleep_s: float) -> int:
    closed = fail = skip = 0
    for issue in search_open_prs():
        repo = issue.get("repo") or ""
        num = int(issue.get("number") or 0)
        if not repo or not num:
            continue
        try:
            ok, msg = close_orphaned(repo, num, dry_run)
        except RuntimeError as err:
            fail += 1
            print(f"  FAIL {repo}!{num}: {err}", file=sys.stderr)
            continue
        if not ok:
            if msg.startswith("branch"):
                skip += 1
            else:
                fail += 1
                print(f"  FAIL {repo}!{num}: {msg}", file=sys.stderr)
        elif msg in ("closed", "dry-run"):
            closed += 1
        elif msg == "already closed":
            skip += 1
        time.sleep(sleep_s)
    print(f"scan done: closed={closed} skipped={skip} failed={fail}")
    return 0 if fail == 0 else 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", help="Project repo name (e.g. li-cursor-agents)")
    ap.add_argument("--number", type=int, help="MR number (iid)")
    ap.add_argument("--scan", action="store_true", help="Scan all open group MRs")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.3)
    args = ap.parse_args()

    if args.scan:
        sys.exit(scan_open(args.dry_run, args.sleep))

    if not args.repo or not args.number:
        ap.error("Provide --repo and --number, or --scan")

    ok, msg = close_orphaned(args.repo, args.number, args.dry_run)
    if not ok:
        print(f"FAIL {args.repo}!{args.number}: {msg}", file=sys.stderr)
        sys.exit(1)
    print(f"OK {args.repo}!{args.number}: {msg}")


if __name__ == "__main__":
    main()
