#!/usr/bin/env python3
"""Merge li-langverse open PRs via REST (avoids GraphQL rate limit).

Usage:
  export GH_TOKEN=...
  python scripts/org-merge-open-prs.py --dry-run
  python scripts/org-merge-open-prs.py --dry-run --incremental
  python scripts/org-merge-open-prs.py --merge-green
  python scripts/org-merge-open-prs.py --fix-dirty   # update branch via API where possible
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

ORG = "li-langverse"
API = "https://api.github.com"
QUEUE_BUCKETS = ("green", "blocked", "dirty", "ci_not_ok")
RefreshAction = Literal["reuse", "lightweight", "full"]


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
    classified_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out = {
            "repo": self.repo,
            "number": self.number,
            "title": self.title,
            "mergeable": self.mergeable,
            "mergeable_state": self.mergeable_state,
            "draft": self.draft,
            "ci": self.ci,
            "head": self.head,
        }
        if self.classified_at:
            out["classifiedAt"] = self.classified_at
        return out


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def pr_key(repo: str, number: int | str) -> tuple[str, int]:
    return (repo, int(number))


def heads_match(cached_head: str | None, live_head: str | None) -> bool:
    if not cached_head or not live_head:
        return False
    return cached_head[:7] == live_head[:7]


def priority_buckets() -> set[str]:
    raw = os.environ.get("LI_ORG_PR_PRIORITY_BUCKETS", "dirty,ci_not_ok,blocked")
    return {b.strip() for b in raw.split(",") if b.strip()}


def green_stale_minutes() -> float:
    try:
        return max(5.0, float(os.environ.get("LI_ORG_PR_GREEN_STALE_MINUTES", "60")))
    except ValueError:
        return 60.0


def incremental_refresh_enabled() -> bool:
    return os.environ.get("LI_ORG_PR_INCREMENTAL_REFRESH", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def sprint_data_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "goal-directed-sprints"


def queue_path() -> Path:
    return sprint_data_dir() / "org-pr-merge-queue.json"


def active_claim_keys() -> set[tuple[str, int]]:
    path = sprint_data_dir() / "org-pr-active.json"
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    prs = data.get("prs")
    if not isinstance(prs, dict):
        return set()
    out: set[tuple[str, int]] = set()
    for entry in prs.values():
        if not isinstance(entry, dict):
            continue
        status = str(entry.get("status", ""))
        if status not in ("claimed", "running"):
            continue
        repo = entry.get("repo")
        number = entry.get("number")
        if repo and number is not None:
            out.add(pr_key(str(repo), number))
    return out


def load_cached_index(path: Path) -> dict[tuple[str, int], dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    out: dict[tuple[str, int], dict[str, Any]] = {}
    for bucket in QUEUE_BUCKETS:
        rows = data.get(bucket)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            repo = row.get("repo")
            number = row.get("number")
            if not repo or number is None:
                continue
            key = pr_key(str(repo), number)
            out[key] = {**row, "_bucket": bucket}
    return out


def pr_row_from_cache(cached: dict[str, Any], title: str) -> PrRow:
    return PrRow(
        repo=str(cached["repo"]),
        number=int(cached["number"]),
        title=(title or str(cached.get("title", "")))[:80],
        mergeable=cached.get("mergeable"),
        mergeable_state=str(cached.get("mergeable_state") or "unknown"),
        draft=bool(cached.get("draft")),
        ci=str(cached.get("ci") or "unknown"),
        head=str(cached.get("head") or ""),
        classified_at=cached.get("classifiedAt"),
    )


def classify_pr(issue: dict, pr: dict | None = None) -> PrRow:
    repo = issue["repository_url"].rstrip("/").split("/")[-1]
    num = int(issue["number"])
    if pr is None:
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
        classified_at=now_iso(),
    )


def decide_refresh_action(
    *,
    has_cache: bool,
    bucket: str | None,
    classified_at: datetime | None,
    issue_updated_at: datetime | None,
    head_cached: str,
    head_live: str | None,
    in_active_claim: bool,
    priority: set[str],
    green_stale_min: float,
    now: datetime,
) -> RefreshAction:
    if not has_cache:
        return "full"
    if in_active_claim:
        return "full"
    if bucket in priority:
        return "full"
    if bucket == "green" and classified_at is not None:
        age_min = (now - classified_at).total_seconds() / 60.0
        if age_min >= green_stale_min:
            return "full"
    if issue_updated_at and classified_at and issue_updated_at > classified_at:
        if head_live is not None:
            return "reuse" if heads_match(head_cached, head_live) else "full"
        return "lightweight"
    if head_live is not None and not heads_match(head_cached, head_live):
        return "full"
    return "reuse"


def bucket_rows(rows: list[PrRow]) -> dict[str, list[PrRow]]:
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
    return {"green": green, "blocked": blocked, "dirty": dirty, "ci_not_ok": fail}


def write_queue(path: Path, rows: list[PrRow], report: dict[str, Any]) -> None:
    buckets = bucket_rows(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "updatedAt": now_iso(),
                "report": report,
                "green": [r.to_dict() for r in buckets["green"]],
                "blocked": [r.to_dict() for r in buckets["blocked"]],
                "dirty": [r.to_dict() for r in buckets["dirty"]],
                "ci_not_ok": [r.to_dict() for r in buckets["ci_not_ok"]],
            },
            f,
            indent=2,
        )


def classify_all(issues: list[dict], limit: int = 0) -> tuple[list[PrRow], dict[str, int]]:
    rows: list[PrRow] = []
    stats = {"full_classify": 0, "errors": 0}
    for i, issue in enumerate(issues, 1):
        if limit and i > limit:
            break
        repo = issue["repository_url"].rstrip("/").split("/")[-1]
        num = int(issue["number"])
        try:
            rows.append(classify_pr(issue))
            stats["full_classify"] += 1
        except Exception as e:
            stats["errors"] += 1
            print(f"ERR {repo}#{num} {e}", flush=True)
        if i % 10 == 0:
            print(f"  classified {i}/{len(issues)}", flush=True)
            time.sleep(0.3)
    return rows, stats


def classify_incremental(
    issues: list[dict],
    cache_index: dict[tuple[str, int], dict[str, Any]],
    active_keys: set[tuple[str, int]],
    limit: int = 0,
) -> tuple[list[PrRow], dict[str, int]]:
    priority = priority_buckets()
    green_stale = green_stale_minutes()
    now = datetime.now(timezone.utc)
    open_keys = set()
    rows: list[PrRow] = []
    stats = {
        "cache_reused": 0,
        "lightweight": 0,
        "full_classify": 0,
        "new": 0,
        "removed": 0,
        "errors": 0,
    }

    for i, issue in enumerate(issues, 1):
        if limit and i > limit:
            break
        repo = issue["repository_url"].rstrip("/").split("/")[-1]
        num = int(issue["number"])
        key = pr_key(repo, num)
        open_keys.add(key)
        cached = cache_index.get(key)
        issue_updated = parse_iso(issue.get("updated_at"))
        classified_at = parse_iso(cached.get("classifiedAt") if cached else None)
        bucket = str(cached.get("_bucket")) if cached else None
        head_cached = str(cached.get("head") or "") if cached else ""

        action = decide_refresh_action(
            has_cache=cached is not None,
            bucket=bucket,
            classified_at=classified_at,
            issue_updated_at=issue_updated,
            head_cached=head_cached,
            head_live=None,
            in_active_claim=key in active_keys,
            priority=priority,
            green_stale_min=green_stale,
            now=now,
        )

        try:
            if action == "reuse" and cached is not None:
                rows.append(pr_row_from_cache(cached, issue.get("title", "")))
                stats["cache_reused"] += 1
                continue

            if action == "lightweight":
                pr = get_pr(repo, num)
                stats["lightweight"] += 1
                action = decide_refresh_action(
                    has_cache=True,
                    bucket=bucket,
                    classified_at=classified_at,
                    issue_updated_at=issue_updated,
                    head_cached=head_cached,
                    head_live=pr["head"]["sha"],
                    in_active_claim=key in active_keys,
                    priority=priority,
                    green_stale_min=green_stale,
                    now=now,
                )
                if action == "reuse" and cached is not None:
                    rows.append(pr_row_from_cache(cached, issue.get("title", "")))
                    stats["cache_reused"] += 1
                    continue
                rows.append(classify_pr(issue, pr))
                stats["full_classify"] += 1
                if cached is None:
                    stats["new"] += 1
                continue

            if cached is None:
                stats["new"] += 1
            rows.append(classify_pr(issue))
            stats["full_classify"] += 1
        except Exception as e:
            stats["errors"] += 1
            print(f"ERR {repo}#{num} {e}", flush=True)
            if cached is not None:
                rows.append(pr_row_from_cache(cached, issue.get("title", "")))
                stats["cache_reused"] += 1

        if i % 25 == 0:
            print(f"  incremental {i}/{len(issues)}", flush=True)
            time.sleep(0.2)

    stats["removed"] = len(set(cache_index.keys()) - open_keys)
    return rows, stats


def queue_age_minutes(path: Path) -> float | None:
    if not path.exists():
        return None
    age_ms = (datetime.now(timezone.utc).timestamp() * 1000) - (path.stat().st_mtime * 1000)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        updated = data.get("updatedAt")
        if updated:
            parsed = parse_iso(updated)
            if parsed is not None:
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
    p.add_argument(
        "--incremental",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Re-classify only priority-bucket PRs, active claims, and stale/changed heads",
    )
    p.add_argument("--full", action="store_true", help="Force full classify of every open PR")
    args = p.parse_args()

    if args.dry_run and not args.merge_green and not args.fix_dirty:
        if maybe_serve_cached_queue(args.max_age_minutes):
            return

    issues = gh_search_prs()
    print(f"open_prs={len(issues)}", flush=True)

    out_path = queue_path()
    cache_index = load_cached_index(out_path)
    use_incremental = (
        not args.full
        and incremental_refresh_enabled()
        and (args.incremental if args.incremental is not None else bool(cache_index))
        and args.dry_run
        and not args.merge_green
        and not args.fix_dirty
    )

    if use_incremental:
        active_keys = active_claim_keys()
        rows, stats = classify_incremental(issues, cache_index, active_keys, args.limit)
        mode = "incremental"
    else:
        rows, stats = classify_all(issues, args.limit)
        mode = "full"

    buckets = bucket_rows(rows)
    report = {
        "total": len(issues),
        "classified": len(rows),
        "green_clean": len(buckets["green"]),
        "blocked_ci_ok": len(buckets["blocked"]),
        "dirty": len(buckets["dirty"]),
        "ci_not_ok": len(buckets["ci_not_ok"]),
        "refresh_mode": mode,
        "refresh_stats": stats,
    }
    print(json.dumps(report, indent=2))

    write_queue(out_path, rows, report)
    print(f"wrote {out_path}")

    if args.dry_run and not args.merge_green and not args.fix_dirty:
        return

    merged = 0
    if args.merge_green:
        for r in buckets["green"]:
            if args.dry_run:
                print(f"WOULD_MERGE {r.repo}#{r.number} {r.title}")
                continue
            ok, msg = squash_merge(r.repo, r.number)
            print(f"MERGE {r.repo}#{r.number} -> {msg}")
            if ok:
                merged += 1
            time.sleep(0.5)

    if args.fix_dirty:
        for r in buckets["dirty"]:
            if args.dry_run:
                print(f"WOULD_UPDATE {r.repo}#{r.number}")
                continue
            ok, msg = update_branch(r.repo, r.number)
            print(f"UPDATE {r.repo}#{r.number} -> {msg}")
            time.sleep(0.5)

    print(f"merged={merged}")


if __name__ == "__main__":
    main()
