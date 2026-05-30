#!/usr/bin/env python3
"""Re-run GitHub Actions for PRs with missing or stale CI (Phase R).

Usage:
  python scripts/org-rerun-stale-ci.py --dry-run
  python scripts/org-rerun-stale-ci.py --limit 10
  python scripts/org-rerun-stale-ci.py --repo lidb --number 19
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
from typing import Any

ORG = "li-langverse"
API = "https://api.github.com"
QUEUE = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-pr-merge-queue.json"
)
DEFAULT_MAX_AGE_DAYS = 7


def headers() -> dict[str, str]:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN required")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def api(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
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


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def workflow_runs(repo: str, sha: str) -> list[dict]:
    status, data = api("GET", f"/repos/{ORG}/{repo}/actions/runs?head_sha={sha}&per_page=20")
    if status != 200 or not isinstance(data, dict):
        return []
    return data.get("workflow_runs", []) or []


def check_runs(repo: str, sha: str) -> list[dict]:
    status, data = api("GET", f"/repos/{ORG}/{repo}/commits/{sha}/check-runs?per_page=100")
    if status != 200 or not isinstance(data, dict):
        return []
    return data.get("check_runs", []) or []


def needs_rerun(repo: str, sha: str, max_age_days: int) -> tuple[bool, str]:
    runs = check_runs(repo, sha)
    if not runs:
        w = workflow_runs(repo, sha)
        if not w:
            return True, "no_checks"
        runs = w
    now = datetime.now(timezone.utc)
    for run in runs:
        st = run.get("status")
        if st in ("queued", "in_progress", "pending"):
            return False, "running"
    newest = None
    for run in runs:
        t = parse_iso(run.get("started_at") or run.get("created_at"))
        if t and (newest is None or t > newest):
            newest = t
    if newest and (now - newest).days >= max_age_days:
        return True, "stale"
    if not runs:
        return True, "no_checks"
    # no_checks from classifier: still try rerun
    only_failure = all(
        run.get("conclusion") in ("failure", "cancelled", "timed_out", None)
        for run in runs
        if run.get("status") == "completed"
    )
    if only_failure and runs:
        return False, "failure_needs_code_fix"
    return True, "rerun_requested"


def rerun_workflows(repo: str, sha: str) -> tuple[int, str]:
    wruns = workflow_runs(repo, sha)
    if not wruns:
        status, data = api(
            "POST",
            f"/repos/{ORG}/{repo}/dispatches",
            {"ref": sha, "event_type": "org-pr-rerun"},
        )
        if status == 204:
            return 1, "repository_dispatch"
        return 0, f"no_workflow_runs:{status}"

    n = 0
    for wr in wruns[:5]:
        run_id = wr.get("id")
        if not run_id:
            continue
        status, _ = api("POST", f"/repos/{ORG}/{repo}/actions/runs/{run_id}/rerun")
        if status == 201:
            n += 1
        time.sleep(0.5)
    return n, f"reran_{n}_workflows"


def get_pr(repo: str, num: int) -> dict:
    status, data = api("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
    if status != 200 or not isinstance(data, dict):
        raise SystemExit(f"pull {repo}#{num}: {status} {data}")
    return data


def queue_rows() -> list[dict]:
    with open(QUEUE, encoding="utf-8") as f:
        q = json.load(f)
    seen: set[tuple[str, int]] = set()
    out: list[dict] = []
    for key in ("dirty", "ci_not_ok", "blocked", "green"):
        for r in q.get(key, []):
            k = (r["repo"], int(r["number"]))
            if k not in seen:
                seen.add(k)
                out.append(r)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-age-days", type=int, default=DEFAULT_MAX_AGE_DAYS)
    ap.add_argument("--repo")
    ap.add_argument("--number", type=int)
    ap.add_argument("--force", action="store_true", help="Rerun even when latest conclusion is failure")
    args = ap.parse_args()

    if args.repo and args.number:
        rows = [{"repo": args.repo, "number": args.number}]
    else:
        rows = queue_rows()
    if args.limit:
        rows = rows[: args.limit]

    done = 0
    for row in rows:
        repo, num = row["repo"], int(row["number"])
        pr = get_pr(repo, num)
        sha = pr["head"]["sha"]
        need, why = needs_rerun(repo, sha, args.max_age_days)
        if why == "failure_needs_code_fix" and not args.force:
            print(f"skip {repo}#{num} ({why})")
            continue
        if not need and why not in ("no_checks", "rerun_requested", "stale"):
            print(f"skip {repo}#{num} ({why})")
            continue
        print(f"{'[dry-run] ' if args.dry_run else ''}{repo}#{num} sha={sha[:7]} ({why})")
        if args.dry_run:
            done += 1
            continue
        n, msg = rerun_workflows(repo, sha)
        print(f"  -> {msg}")
        if n:
            done += 1
        time.sleep(1)

    print(f"org-rerun-stale-ci: processed {done}", file=sys.stderr)


if __name__ == "__main__":
    main()
