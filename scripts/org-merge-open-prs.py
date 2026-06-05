#!/usr/bin/env python3
"""Merge li-langverse open PRs via REST (avoids GraphQL rate limit).

Usage:
  export GH_TOKEN=...
  python scripts/org-merge-open-prs.py --dry-run
  python scripts/org-merge-open-prs.py --merge-green
  python scripts/org-merge-open-prs.py --fix-dirty   # update branch via API where possible
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

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


def req(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
    url = path if path.startswith("http") else f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=headers(), method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else {"message": str(e)}
        except json.JSONDecodeError:
            payload = {"message": raw or str(e)}
        return e.code, payload


def gh_search_prs() -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        q = urllib.parse.quote(f"org:{ORG} is:open is:pr")
        status, data = req("GET", f"/search/issues?q={q}&per_page=100&page={page}")
        if status != 200:
            raise SystemExit(f"search failed {status}: {data}")
        items = data.get("items", [])
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(2)  # search rate limit
    return out


def get_pr(repo: str, num: int) -> dict:
    status, data = req("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
    if status != 200:
        raise RuntimeError(f"pull {repo}#{num}: {status} {data}")
    return data


def check_runs(repo: str, sha: str) -> list[dict]:
    status, data = req("GET", f"/repos/{ORG}/{repo}/commits/{sha}/check-runs?per_page=100")
    if status != 200:
        return []
    return data.get("check_runs", [])


def ci_ok(runs: list[dict]) -> tuple[bool, str]:
    if not runs:
        return False, "no_checks"
    for run in runs:
        if run.get("status") != "completed":
            return False, "pending"
        if run.get("conclusion") == "failure":
            return False, "failure"
    return True, "ok"


@dataclass
class PrRow:
    repo: str
    number: int
    title: str
    mergeable: bool | None
    mergeable_state: str
    draft: bool
    ci: str
    head: str


def classify(issue: dict) -> PrRow:
    repo = issue["repository_url"].rstrip("/").split("/")[-1]
    num = issue["number"]
    pr = get_pr(repo, num)
    runs = check_runs(repo, pr["head"]["sha"])
    ok, ci = ci_ok(runs)
    return PrRow(
        repo=repo,
        number=num,
        title=issue.get("title", "")[:80],
        mergeable=pr.get("mergeable"),
        mergeable_state=pr.get("mergeable_state") or "unknown",
        draft=bool(pr.get("draft")),
        ci=ci if ok else ci,
        head=pr["head"]["sha"][:7],
    )


def squash_merge(repo: str, num: int) -> tuple[bool, str]:
    status, data = req(
        "PUT",
        f"/repos/{ORG}/{repo}/pulls/{num}/merge",
        {"merge_method": "squash"},
    )
    if status == 200:
        return True, data.get("sha", "merged")[:7]
    msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
    return False, f"{status}:{msg}"


def update_branch(repo: str, num: int) -> tuple[bool, str]:
    status, data = req(
        "PUT",
        f"/repos/{ORG}/{repo}/pulls/{num}/update-branch",
        {"expected_head_sha": get_pr(repo, num)["head"]["sha"]},
    )
    if status in (200, 202):
        return True, "updated"
    msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
    return False, f"{status}:{msg}"


def queue_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "goal-directed-sprints" / "org-pr-merge-queue.json"


def queue_age_minutes(path: Path) -> float | None:
    if not path.exists():
        return None
    age_ms = (datetime.now(timezone.utc).timestamp() * 1000) - (path.stat().st_mtime * 1000)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        updated = data.get("updatedAt")
        if updated:
            parsed = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            age_ms = (datetime.now(timezone.utc) - parsed).total_seconds() * 1000
    except (json.JSONDecodeError, ValueError, TypeError, OSError):
        pass
    return max(0.0, age_ms / 60_000)


def maybe_serve_cached_queue(max_age_minutes: float | None) -> bool:
    if max_age_minutes is None or max_age_minutes <= 0:
        return False
    path = queue_path()
    age = queue_age_minutes(path)
    if age is None or age > max_age_minutes:
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    report = data.get("report") or {}
    total = report.get("total")
    if total is None:
        return False
    print(f"open_prs={total}", flush=True)
    print(json.dumps(report, indent=2))
    print(f"queue_cache_hit age_minutes={age:.1f} path={path}", flush=True)
    return True


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--merge-green", action="store_true")
    p.add_argument("--fix-dirty", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument(
        "--max-age-minutes",
        type=float,
        default=0,
        help="Skip GitHub classify when org-pr-merge-queue.json is newer than this many minutes",
    )
    args = p.parse_args()

    if args.dry_run and not args.merge_green and not args.fix_dirty:
        if maybe_serve_cached_queue(args.max_age_minutes):
            return

    issues = gh_search_prs()
    print(f"open_prs={len(issues)}", flush=True)

    rows: list[PrRow] = []
    for i, issue in enumerate(issues, 1):
        if args.limit and i > args.limit:
            break
        repo = issue["repository_url"].rstrip("/").split("/")[-1]
        num = issue["number"]
        try:
            row = classify(issue)
            rows.append(row)
        except Exception as e:
            print(f"ERR {repo}#{num} {e}", flush=True)
        if i % 10 == 0:
            print(f"  classified {i}/{len(issues)}", flush=True)
            time.sleep(0.3)

    green = [
        r
        for r in rows
        if not r.draft
        and r.ci == "ok"
        and r.mergeable_state == "clean"
        and r.mergeable is True
    ]
    blocked = [r for r in rows if r.mergeable_state == "blocked" and r.ci == "ok"]
    dirty = [r for r in rows if r.mergeable_state == "dirty"]
    fail = [r for r in rows if r.ci in ("failure", "pending")]

    report = {
        "total": len(issues),
        "classified": len(rows),
        "green_clean": len(green),
        "blocked_ci_ok": len(blocked),
        "dirty": len(dirty),
        "ci_not_ok": len(fail),
    }
    print(json.dumps(report, indent=2))

    out_path = queue_path()
    os.makedirs(out_path.parent, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "report": report,
                "green": [r.__dict__ for r in green],
                "blocked": [r.__dict__ for r in blocked],
                "dirty": [r.__dict__ for r in dirty],
                "ci_not_ok": [r.__dict__ for r in fail],
            },
            f,
            indent=2,
        )
    print(f"wrote {out_path}")

    if args.dry_run and not args.merge_green and not args.fix_dirty:
        return

    merged = 0
    if args.merge_green:
        for r in green:
            if args.dry_run:
                print(f"WOULD_MERGE {r.repo}#{r.number} {r.title}")
                continue
            ok, msg = squash_merge(r.repo, r.number)
            print(f"MERGE {r.repo}#{r.number} -> {msg}")
            if ok:
                merged += 1
            time.sleep(0.5)

    if args.fix_dirty:
        for r in dirty:
            if args.dry_run:
                print(f"WOULD_UPDATE {r.repo}#{r.number}")
                continue
            ok, msg = update_branch(r.repo, r.number)
            print(f"UPDATE {r.repo}#{r.number} -> {msg}")
            time.sleep(0.5)

    print(f"merged={merged}")


if __name__ == "__main__":
    main()
