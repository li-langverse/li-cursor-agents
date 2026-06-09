"""Unified Issue API for org-swarm (GitLab primary, GitHub fallback)."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from _gh_token import gh_token
from _vcs_config import ORG, gitlab_api_base, gitlab_group, gitlab_host, vcs_provider


def _gitlab_token() -> str:
    token = os.environ.get("GITLAB_TOKEN", "").strip()
    if not token:
        raise SystemExit("GITLAB_TOKEN required (GitLab-primary org swarm)")
    return token


def _encode_project(repo: str) -> str:
    return urllib.parse.quote(f"{gitlab_group()}/{repo}", safe="")


def _gitlab_req(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
    url = path if path.startswith("http") else f"{gitlab_api_base()}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "PRIVATE-TOKEN": _gitlab_token(),
            "Content-Type": "application/json",
        },
        method=method,
    )
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


def _github_req(method: str, path: str, body: dict | None = None) -> tuple[int, Any]:
    api = "https://api.github.com"
    url = path if path.startswith("http") else f"{api}{path}"
    payload = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {gh_token()}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            data = json.loads(raw) if raw else {"message": str(e)}
        except json.JSONDecodeError:
            data = {"message": raw or str(e)}
        return e.code, data


def _normalize_gitlab_issue(issue: dict) -> dict:
    path = str(issue.get("references", {}).get("full", "")).split("#")[0]
    repo = path.rsplit("/", 1)[-1] if path else ""
    if not repo:
        web = str(issue.get("web_url", ""))
        repo = web.rsplit("/-/issues/", 1)[0].rsplit("/", 1)[-1]
    iid = int(issue.get("iid", issue.get("number", 0)))
    labels = issue.get("labels") or []
    if labels and isinstance(labels[0], dict):
        label_names = [lbl.get("name", "") for lbl in labels]
    else:
        label_names = [str(l) for l in labels]
    state = "closed" if str(issue.get("state", "")).lower() == "closed" else "open"
    return {
        "number": iid,
        "title": issue.get("title", ""),
        "body": issue.get("description"),
        "state": state,
        "html_url": issue.get("web_url")
        or f"https://{gitlab_host()}/{gitlab_group()}/{repo}/-/issues/{iid}",
        "labels": [{"name": n} for n in label_names if n],
        "updated_at": issue.get("updated_at"),
        "repository_url": f"https://{gitlab_host()}/{gitlab_group()}/{repo}",
        "repo": repo,
    }


def search_open_issues() -> list[dict]:
    if vcs_provider() == "github":
        return _github_search_open_issues()
    return _gitlab_search_open_issues()


def _github_search_open_issues() -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        q = urllib.parse.quote(f"org:{ORG} is:open is:issue")
        status, data = _github_req("GET", f"/search/issues?q={q}&per_page=100&page={page}")
        if status != 200 or not isinstance(data, dict):
            raise SystemExit(f"GitHub issue search failed {status}: {data}")
        items = data.get("items", [])
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(2)
    return out


def _gitlab_search_open_issues() -> list[dict]:
    out: list[dict] = []
    page = 1
    group = urllib.parse.quote(gitlab_group(), safe="")
    while True:
        status, data = _gitlab_req(
            "GET",
            f"/groups/{group}/issues?state=opened&include_subgroups=true"
            f"&scope=all&per_page=100&page={page}",
        )
        if status != 200 or not isinstance(data, list):
            raise SystemExit(f"GitLab issue search failed {status}: {data}")
        for issue in data:
            out.append(_normalize_gitlab_issue(issue))
        if len(data) < 100:
            break
        page += 1
        time.sleep(0.3)
    return out


def get_issue(repo: str, num: int) -> dict:
    if vcs_provider() == "github":
        status, data = _github_req("GET", f"/repos/{ORG}/{repo}/issues/{num}")
        if status != 200 or not isinstance(data, dict):
            raise RuntimeError(f"GitHub issue {repo}#{num}: {status} {data}")
        return data
    status, data = _gitlab_req("GET", f"/projects/{_encode_project(repo)}/issues/{num}")
    if status != 200 or not isinstance(data, dict):
        raise RuntimeError(f"GitLab issue {repo}#{num}: {status} {data}")
    return _normalize_gitlab_issue(data)


def post_issue_comment(repo: str, num: int, body: str) -> tuple[int, Any]:
    if vcs_provider() == "github":
        return _github_req("POST", f"/repos/{ORG}/{repo}/issues/{num}/comments", {"body": body})
    return _gitlab_req(
        "POST",
        f"/projects/{_encode_project(repo)}/issues/{num}/notes",
        {"body": body},
    )


def close_issue(
    repo: str,
    num: int,
    *,
    state_reason: str = "not_planned",
) -> tuple[int, Any]:
    if vcs_provider() == "github":
        return _github_req(
            "PATCH",
            f"/repos/{ORG}/{repo}/issues/{num}",
            {"state": "closed", "state_reason": state_reason},
        )
    return _gitlab_req(
        "PUT",
        f"/projects/{_encode_project(repo)}/issues/{num}",
        {"state_event": "close"},
    )


def add_labels(repo: str, num: int, labels: list[str]) -> tuple[int, Any]:
    if vcs_provider() == "github":
        return _github_req(
            "POST",
            f"/repos/{ORG}/{repo}/issues/{num}/labels",
            {"labels": labels},
        )
    params = "&".join(f"add_labels[]={urllib.parse.quote(l)}" for l in labels)
    return _gitlab_req(
        "PUT",
        f"/projects/{_encode_project(repo)}/issues/{num}?{params}",
    )


def remove_label(repo: str, num: int, label: str) -> tuple[int, Any]:
    if vcs_provider() == "github":
        return _github_req("DELETE", f"/repos/{ORG}/{repo}/issues/{num}/labels/{label}")
    params = f"remove_labels[]={urllib.parse.quote(label)}"
    return _gitlab_req(
        "PUT",
        f"/projects/{_encode_project(repo)}/issues/{num}?{params}",
    )


def mr_merged(repo: str, num: int) -> bool:
    if vcs_provider() == "github":
        status, data = _github_req("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
        if status != 200 or not isinstance(data, dict):
            return False
        return bool(data.get("merged"))
    status, data = _gitlab_req("GET", f"/projects/{_encode_project(repo)}/merge_requests/{num}")
    if status != 200 or not isinstance(data, dict):
        return False
    return str(data.get("state", "")).lower() == "merged"


def close_mr(repo: str, num: int) -> tuple[bool, str]:
    if vcs_provider() == "github":
        status, _ = _github_req("PATCH", f"/repos/{ORG}/{repo}/pulls/{num}", {"state": "closed"})
        return status == 200, f"github_close_{status}"
    status, data = _gitlab_req(
        "PUT",
        f"/projects/{_encode_project(repo)}/merge_requests/{num}",
        {"state_event": "close"},
    )
    if status == 200:
        return True, "closed"
    msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
    return False, f"{status}:{msg}"


def post_mr_comment(repo: str, num: int, body: str) -> tuple[int, Any]:
    if vcs_provider() == "github":
        return _github_req("POST", f"/repos/{ORG}/{repo}/issues/{num}/comments", {"body": body})
    return _gitlab_req(
        "POST",
        f"/projects/{_encode_project(repo)}/merge_requests/{num}/notes",
        {"body": body},
    )


def get_mr(repo: str, num: int) -> dict:
    if vcs_provider() == "github":
        status, data = _github_req("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
        if status != 200 or not isinstance(data, dict):
            raise RuntimeError(f"GitHub PR {repo}#{num}: {status}")
        return data
    status, data = _gitlab_req("GET", f"/projects/{_encode_project(repo)}/merge_requests/{num}")
    if status != 200 or not isinstance(data, dict):
        raise RuntimeError(f"GitLab MR {repo}#{num}: {status}")
    return data


def mr_is_closed(mr: dict) -> bool:
    if vcs_provider() == "github":
        return str(mr.get("state", "")).lower() == "closed"
    return str(mr.get("state", "")).lower() in ("closed", "merged")


def format_close_comment(reason: str, summary: str, evidence: str, reason_labels: dict[str, str]) -> str:
    hint = reason_labels.get(reason, reason)
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
