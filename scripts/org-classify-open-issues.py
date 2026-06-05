#!/usr/bin/env python3
"""Classify open li-langverse issues into action buckets (org-issue-zero sprint).

Usage:
  python scripts/org-classify-open-issues.py --dry-run
  python scripts/org-classify-open-issues.py --limit 50
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ORG = "li-langverse"
API = "https://api.github.com"
OUT = os.path.join(
    os.path.dirname(__file__), "..", "data", "goal-directed-sprints", "org-issue-queue.json"
)

CLOSE_LABELS = {"duplicate", "invalid", "wontfix", "wont-fix", "spam"}
IMPLEMENT_LABELS = {"plan-approved", "bug", "enhancement", "good first issue"}
PLANNER_LABELS = {"plan-needed", "ecosystem-gap", "master-plan-gap"}


from _gh_token import gh_token


def headers() -> dict[str, str]:
    token = gh_token()
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


def search_open_issues() -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        q = urllib.parse.quote(f"org:{ORG} is:open is:issue")
        status, data = api("GET", f"/search/issues?q={q}&per_page=100&page={page}")
        if status != 200 or not isinstance(data, dict):
            raise SystemExit(f"search failed {status}: {data}")
        items = data.get("items", [])
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(2)
    return out


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def label_names(issue: dict) -> set[str]:
    return {lbl["name"].lower() for lbl in issue.get("labels", [])}


def linked_prs(body: str) -> list[int]:
    return [int(m) for m in re.findall(r"(?:#|pull/)(\d+)", body or "")]


def pr_merged(repo: str, num: int) -> bool:
    status, data = api("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
    if status != 200 or not isinstance(data, dict):
        return False
    return bool(data.get("merged"))


def normalize_title(title: str) -> str:
    t = title.lower().strip()
    t = re.sub(r"\[.*?\]", "", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return " ".join(t.split())


def classify_issue(issue: dict, title_index: dict[str, list[tuple[str, int]]]) -> dict:
    repo = issue["repository_url"].rstrip("/").split("/")[-1]
    num = int(issue["number"])
    title = issue.get("title", "")
    body = issue.get("body") or ""
    labels = label_names(issue)
    updated = parse_iso(issue.get("updated_at"))
    age_days = (datetime.now(timezone.utc) - updated).days if updated else 0

    row: dict = {
        "repo": repo,
        "number": num,
        "title": title[:120],
        "html_url": issue.get("html_url", ""),
        "labels": sorted(labels),
        "updated_at": issue.get("updated_at"),
        "classification_note": "",
        "suggested_reason": "",
        "close_summary": "",
        "close_evidence": "",
    }

    # Explicit label routing
    if labels & {"duplicate"}:
        row["classification_note"] = "label:duplicate"
        row["suggested_reason"] = "duplicate"
        row["close_summary"] = title
        row["close_evidence"] = "GitHub label `duplicate`"
        return {**row, "_bucket": "close_duplicate"}

    if labels & CLOSE_LABELS:
        reason = "wontfix" if "wontfix" in labels or "wont-fix" in labels else "spam"
        row["suggested_reason"] = reason
        row["classification_note"] = f"labels:{','.join(sorted(labels & CLOSE_LABELS))}"
        row["close_summary"] = title
        row["close_evidence"] = f"Closing labels present: {sorted(labels & CLOSE_LABELS)}"
        return {**row, "_bucket": "close_wontfix" if reason == "wontfix" else "close_spam"}

    # plan-approved wins over plan-needed — avoid re-planning approved work
    if labels & IMPLEMENT_LABELS:
        row["classification_note"] = "ready for implementation"
        return {**row, "_bucket": "implement"}

    if labels & PLANNER_LABELS:
        row["classification_note"] = "needs plan before implementation"
        return {**row, "_bucket": "route_planner"}

    # Linked merged PRs in body
    for pr_num in linked_prs(body)[:5]:
        if pr_merged(repo, pr_num):
            row["suggested_reason"] = "already_implemented"
            row["close_summary"] = title
            row["close_evidence"] = f"Body references merged PR #{pr_num}"
            row["classification_note"] = "merged_pr_reference"
            return {**row, "_bucket": "close_done"}

    if re.search(r"\b(fixed|resolved|implemented)\s+(on|in)\s+main\b", body, re.I):
        row["suggested_reason"] = "already_implemented"
        row["close_summary"] = title
        row["close_evidence"] = "Issue body states fix is on main"
        row["classification_note"] = "body_main_fixed"
        return {**row, "_bucket": "close_done"}

    # Explorer / automation noise titles
    if re.search(r"explorer finding|automation burst|mock issue", title, re.I):
        row["suggested_reason"] = "spam"
        row["close_summary"] = title
        row["close_evidence"] = "Title matches explorer/automation noise pattern"
        row["classification_note"] = "title_spam_pattern"
        return {**row, "_bucket": "close_spam"}

    # Duplicate title clusters (same repo, similar title)
    norm = normalize_title(title)
    key = f"{repo}:{norm[:60]}"
    peers = title_index.get(key, [])
    if len(peers) > 1:
        keep = min(peers, key=lambda x: x[1])[1]
        if num != keep:
            row["suggested_reason"] = "duplicate"
            row["close_summary"] = title
            row["close_evidence"] = f"Duplicate title cluster; keep issue #{keep}"
            row["classification_note"] = "title_cluster"
            return {**row, "_bucket": "close_duplicate"}

    # Master plan / PH tracking — defer
    if re.search(r"\bPH-[A-Z0-9]", title) or "master-plan" in labels:
        row["classification_note"] = "master-plan or PH-* tracking"
        return {**row, "_bucket": "defer_master_plan"}

    if age_days >= 120 and not labels:
        row["classification_note"] = f"stale {age_days}d, no labels"
        return {**row, "_bucket": "stale_needs_human"}

    row["classification_note"] = "unclassified — agent must decide"
    return {**row, "_bucket": "needs_triage"}


def queue_age_minutes(path: str) -> float | None:
    if not os.path.isfile(path):
        return None
    age_ms = (datetime.now(timezone.utc).timestamp() * 1000) - (os.path.getmtime(path) * 1000)
    try:
        data = json.loads(open(path, encoding="utf-8").read())
        updated = data.get("updatedAt")
        if updated:
            parsed = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            age_ms = (datetime.now(timezone.utc) - parsed).total_seconds() * 1000
    except (json.JSONDecodeError, ValueError, TypeError, OSError):
        pass
    return max(0.0, age_ms / 60_000)


def maybe_serve_cached_queue(max_age_minutes: float) -> bool:
    if max_age_minutes <= 0:
        return False
    age = queue_age_minutes(OUT)
    if age is None or age > max_age_minutes:
        return False
    try:
        data = json.loads(open(OUT, encoding="utf-8").read())
    except (json.JSONDecodeError, OSError):
        return False
    report = data.get("report") or {}
    total = report.get("total_open")
    if total is None:
        return False
    print(f"open_issues={total}", flush=True)
    print(json.dumps(report, indent=2))
    print(f"issue_queue_cache_hit age_minutes={age:.1f}", flush=True)
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Only print summary, still writes queue")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument(
        "--max-age-minutes",
        type=float,
        default=0,
        help="Skip classify when org-issue-queue.json is newer than this many minutes",
    )
    args = ap.parse_args()

    if maybe_serve_cached_queue(args.max_age_minutes):
        return

    issues = search_open_issues()
    print(f"open_issues={len(issues)}", flush=True)

    title_index: dict[str, list[tuple[str, int]]] = {}
    for issue in issues:
        repo = issue["repository_url"].rstrip("/").split("/")[-1]
        num = int(issue["number"])
        key = f"{repo}:{normalize_title(issue.get('title', ''))[:60]}"
        title_index.setdefault(key, []).append((repo, num))

    buckets: dict[str, list] = {
        "implement": [],
        "route_planner": [],
        "close_done": [],
        "close_duplicate": [],
        "close_wontfix": [],
        "close_spam": [],
        "close_superseded": [],
        "stale_needs_human": [],
        "defer_master_plan": [],
        "needs_triage": [],
    }

    for i, issue in enumerate(issues, 1):
        if args.limit and i > args.limit:
            break
        classified = classify_issue(issue, title_index)
        bucket = classified.pop("_bucket")
        buckets[bucket].append(classified)
        if i % 20 == 0:
            print(f"  classified {i}/{len(issues)}", flush=True)
        time.sleep(0.15)

    classified_n = sum(len(v) for v in buckets.values())
    report = {
        "total_open": len(issues),
        "classified": classified_n,
        "partial": bool(args.limit and classified_n < len(issues)),
        "limit": args.limit or None,
        **{k: len(v) for k, v in buckets.items()},
    }
    payload = {"updatedAt": datetime.now(timezone.utc).isoformat(), "report": report, **buckets}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(json.dumps(report, indent=2))
    print(f"wrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
