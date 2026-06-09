#!/usr/bin/env python3
"""Close an org issue with a mandatory audit comment (org-issue-zero sprint).

GitLab primary (LI_VCS_PROVIDER=gitlab, GITLAB_TOKEN). GitHub fallback optional.

Usage:
  python scripts/org-close-issue.py --repo lic --number 42 \\
    --reason already_implemented \\
    --summary "Fixed on main in !548" \\
    --evidence "git log main shows commit abc123; MR !548 merged 2026-05-30"

  python scripts/org-close-issue.py --from-queue --limit 5 --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

from _vcs_issue_api import close_issue, format_close_comment, post_issue_comment

AUDIT = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-issue-close-audit.jsonl"
)
QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-issue-queue.json"
)

REASON_LABELS = {
    "already_implemented": "Work is already on `main` or merged via linked MR",
    "duplicate": "Duplicate of another issue; tracking consolidated",
    "wontfix": "Out of scope or rejected by product/engineering policy",
    "spam": "Explorer/automation noise or invalid filing",
    "superseded": "Replaced by newer issue, plan item, or master-plan tracking",
    "not_actionable": "No concrete acceptance criteria or cannot reproduce",
    "stale_no_response": "Stale with no author response after hygiene comment",
}


def append_audit(row: dict) -> None:
    os.makedirs(os.path.dirname(AUDIT), exist_ok=True)
    with open(AUDIT, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def close_one(
    repo: str,
    num: int,
    reason: str,
    summary: str,
    evidence: str,
    dry_run: bool,
) -> tuple[bool, str]:
    if reason not in REASON_LABELS:
        return False, f"unknown reason: {reason}"

    body = format_close_comment(reason, summary, evidence, REASON_LABELS)
    audit_row = {
        "repo": repo,
        "number": num,
        "reason": reason,
        "summary": summary,
        "evidence": evidence,
        "closed_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "dry_run": dry_run,
    }

    if dry_run:
        print(f"[dry-run] would comment+close {repo}#{num} ({reason})")
        append_audit(audit_row)
        return True, "dry_run"

    status, _ = post_issue_comment(repo, num, body)
    if status not in (200, 201):
        return False, f"comment failed {status}"

    state_reason = "completed" if reason == "already_implemented" else "not_planned"
    status, _ = close_issue(repo, num, state_reason=state_reason)
    if status != 200:
        return False, f"close failed {status}"

    append_audit(audit_row)
    return True, "closed"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo")
    ap.add_argument("--number", type=int)
    ap.add_argument("--reason", choices=sorted(REASON_LABELS.keys()))
    ap.add_argument("--summary", default="")
    ap.add_argument("--evidence", default="")
    ap.add_argument("--from-queue", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    closed = 0
    if args.from_queue:
        with open(QUEUE, encoding="utf-8") as f:
            q = json.load(f)
        rows: list[dict] = []
        for key in ("close_done", "close_duplicate", "close_wontfix", "close_spam", "close_superseded"):
            for r in q.get(key, []):
                rows.append({**r, "_bucket": key})
        if args.limit:
            rows = rows[: args.limit]
        for r in rows:
            reason = r.get("suggested_reason") or r["_bucket"].replace("close_", "")
            ok, msg = close_one(
                r["repo"],
                int(r["number"]),
                reason,
                r.get("close_summary", r.get("title", "")),
                r.get("close_evidence", r.get("classification_note", "")),
                args.dry_run,
            )
            print(f"{r['repo']}#{r['number']} -> {msg}")
            if ok:
                closed += 1
            time.sleep(0.5)
    else:
        if not args.repo or not args.number or not args.reason:
            raise SystemExit("--repo, --number, --reason required (or --from-queue)")
        ok, msg = close_one(
            args.repo,
            args.number,
            args.reason,
            args.summary,
            args.evidence,
            args.dry_run,
        )
        print(msg)
        closed = 1 if ok else 0

    print(f"org-close-issue: {closed} issues", file=sys.stderr)


if __name__ == "__main__":
    main()
