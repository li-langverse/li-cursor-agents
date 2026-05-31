#!/usr/bin/env python3
"""Close a GitHub issue with a mandatory audit comment (org-issue-zero sprint).

Usage:
  python scripts/org-close-issue.py --repo lic --number 42 \\
    --reason already_implemented \\
    --summary "Fixed on main in #548" \\
    --evidence "git log main shows commit abc123; PR #548 merged 2026-05-30"

  python scripts/org-close-issue.py --from-queue --limit 5 --dry-run
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
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-issue-close-audit.jsonl"
)
QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-issue-queue.json"
)

REASON_LABELS = {
    "already_implemented": "Work is already on `main` or merged via linked PR",
    "duplicate": "Duplicate of another issue; tracking consolidated",
    "wontfix": "Out of scope or rejected by product/engineering policy",
    "spam": "Explorer/automation noise or invalid filing",
    "superseded": "Replaced by newer issue, plan item, or master-plan tracking",
    "not_actionable": "No concrete acceptance criteria or cannot reproduce",
    "stale_no_response": "Stale with no author response after hygiene comment",
}


def headers() -> dict[str, str]:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN required")
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


def format_comment(reason: str, summary: str, evidence: str) -> str:
    hint = REASON_LABELS.get(reason, reason)
    return (
        "**Closed by org-issue-zero sprint** (li-cursor-agents automated triage)\n\n"
        f"| Field | Value |\n|-------|-------|\n"
        f"| **reason_code** | `{reason}` |\n"
        f"| **reason** | {hint} |\n"
        f"| **summary** | {summary} |\n"
        f"| **evidence** | {evidence} |\n"
        f"| **closed_at** | {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} |\n\n"
        "Review closures in `li-cursor-agents/data/goal-directed-sprints/org-issue-close-audit.jsonl`."
    )


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

    body = format_comment(reason, summary, evidence)
    audit_row = {
        "repo": repo,
        "number": num,
        "reason": reason,
        "summary": summary,
        "evidence": evidence,
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
    }

    if dry_run:
        print(f"[dry-run] would comment+close {repo}#{num} ({reason})")
        append_audit(audit_row)
        return True, "dry_run"

    status, _ = api(
        "POST",
        f"/repos/{ORG}/{repo}/issues/{num}/comments",
        {"body": body},
    )
    if status not in (200, 201):
        return False, f"comment failed {status}"

    status, _ = api(
        "PATCH",
        f"/repos/{ORG}/{repo}/issues/{num}",
        {"state": "closed", "state_reason": "completed" if reason == "already_implemented" else "not_planned"},
    )
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
