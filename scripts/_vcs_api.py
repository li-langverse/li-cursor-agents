"""Unified PR/MR API for org-swarm (GitLab primary, GitHub fallback)."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
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


def search_open_prs() -> list[dict[str, Any]]:
    if vcs_provider() == "github":
        return _github_search_open_prs()
    return _gitlab_search_open_mrs()


def _github_search_open_prs() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        q = urllib.parse.quote(f"org:{ORG} is:open is:pr")
        status, data = _github_req("GET", f"/search/issues?q={q}&per_page=100&page={page}")
        if status != 200:
            raise SystemExit(f"GitHub search failed {status}: {data}")
        items = data.get("items", [])
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(2)
    return out


def _gitlab_search_open_mrs() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    page = 1
    group = urllib.parse.quote(gitlab_group(), safe="")
    while True:
        status, data = _gitlab_req(
            "GET",
            f"/groups/{group}/merge_requests?state=opened&include_subgroups=true"
            f"&scope=all&per_page=100&page={page}",
        )
        if status != 200 or not isinstance(data, list):
            raise SystemExit(f"GitLab MR search failed {status}: {data}")
        for mr in data:
            path = str(mr.get("references", {}).get("full", "")).split("!")[0]
            repo = path.rsplit("/", 1)[-1] if path else ""
            if not repo:
                web = str(mr.get("web_url", ""))
                repo = web.rsplit("/-/merge_requests/", 1)[0].rsplit("/", 1)[-1]
            out.append(
                {
                    "number": int(mr.get("iid", 0)),
                    "title": mr.get("title", ""),
                    "updated_at": mr.get("updated_at"),
                    "repository_url": f"https://{gitlab_host()}/{gitlab_group()}/{repo}",
                    "repo": repo,
                    "project_id": mr.get("project_id"),
                }
            )
        if len(data) < 100:
            break
        page += 1
        time.sleep(0.3)
    return out


def repo_from_issue(issue: dict[str, Any]) -> str:
    if issue.get("repo"):
        return str(issue["repo"])
    return issue["repository_url"].rstrip("/").split("/")[-1]


def pr_number(issue: dict[str, Any]) -> int:
    return int(issue["number"])


def get_pr(repo: str, num: int) -> dict[str, Any]:
    if vcs_provider() == "github":
        status, data = _github_req("GET", f"/repos/{ORG}/{repo}/pulls/{num}")
        if status != 200:
            raise RuntimeError(f"GitHub pull {repo}#{num}: {status} {data}")
        return data
    status, data = _gitlab_req(
        "GET",
        f"/projects/{_encode_project(repo)}/merge_requests/{num}",
    )
    if status != 200:
        raise RuntimeError(f"GitLab MR {repo}#{num}: {status} {data}")
    return data


def _gitlab_mergeable_state(mr: dict[str, Any]) -> tuple[bool | None, str]:
    has_conflicts = bool(mr.get("has_conflicts"))
    merge_status = str(mr.get("merge_status") or "unknown")
    detailed = str(mr.get("detailed_merge_status") or "")
    if has_conflicts:
        return False, "dirty"
    if merge_status == "can_be_merged":
        return True, "clean"
    if detailed in ("conflict", "not_open", "draft_status"):
        return False, "dirty"
    if merge_status == "cannot_be_merged":
        return False, "blocked"
    return None, merge_status


def _github_mergeable_state(pr: dict[str, Any]) -> tuple[bool | None, str]:
    return pr.get("mergeable"), str(pr.get("mergeable_state") or "unknown")


def check_runs(repo: str, sha: str) -> list[dict[str, Any]]:
    if vcs_provider() == "github":
        status, data = _github_req(
            "GET",
            f"/repos/{ORG}/{repo}/commits/{sha}/check-runs?per_page=100",
        )
        if status != 200:
            return []
        return data.get("check_runs", [])
    status, data = _gitlab_req(
        "GET",
        f"/projects/{_encode_project(repo)}/repository/commits/{sha}/statuses?per_page=100",
    )
    if status != 200 or not isinstance(data, list):
        return []
    return data


def ci_ok(runs: list[dict[str, Any]]) -> tuple[bool, str]:
    if not runs:
        return False, "no_checks"
    if vcs_provider() == "gitlab":
        for run in runs:
            st = str(run.get("status", "")).lower()
            if st in ("pending", "running", "created"):
                return False, "pending"
            if st == "failed":
                return False, "failure"
        return True, "ok"
    for run in runs:
        if run.get("status") != "completed":
            return False, "pending"
        if run.get("conclusion") == "failure":
            return False, "failure"
    return True, "ok"


def ci_ok_for_mr(repo: str, num: int, pr: dict[str, Any] | None = None) -> tuple[bool, str]:
    if pr is None:
        pr = get_pr(repo, num)
    if vcs_provider() == "gitlab":
        status, pipelines = _gitlab_req(
            "GET",
            f"/projects/{_encode_project(repo)}/merge_requests/{num}/pipelines?per_page=5",
        )
        if status != 200 or not isinstance(pipelines, list) or not pipelines:
            head = pr.get("head_pipeline")
            if isinstance(head, dict) and head.get("status"):
                pipelines = [head]
            else:
                return False, "no_checks"
        for pipe in pipelines:
            st = str(pipe.get("status", "")).lower()
            if st in ("running", "pending", "created", "preparing", "waiting_for_resource"):
                return False, "pending"
            if st == "failed":
                return False, "failure"
            if st == "success":
                return True, "ok"
        return False, "no_checks"
    sha = pr.get("head", {}).get("sha") or ""
    if not sha:
        return False, "no_checks"
    return ci_ok(check_runs(repo, sha))


def head_sha(pr: dict[str, Any]) -> str:
    if vcs_provider() == "gitlab":
        return str(pr.get("sha") or "")[:7]
    return str(pr.get("head", {}).get("sha") or "")[:7]


def is_draft(pr: dict[str, Any]) -> bool:
    if vcs_provider() == "gitlab":
        return bool(pr.get("draft") or pr.get("work_in_progress"))
    return bool(pr.get("draft"))


def squash_merge(repo: str, num: int) -> tuple[bool, str]:
    if vcs_provider() == "github":
        status, data = _github_req(
            "PUT",
            f"/repos/{ORG}/{repo}/pulls/{num}/merge",
            {"merge_method": "squash"},
        )
        if status == 200:
            return True, str(data.get("sha", "merged"))[:7]
        msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
        return False, f"{status}:{msg}"
    status, data = _gitlab_req(
        "PUT",
        f"/projects/{_encode_project(repo)}/merge_requests/{num}/merge",
        {"squash": True, "should_remove_source_branch": False},
    )
    if status in (200, 201):
        sha = ""
        if isinstance(data, dict):
            sha = str(data.get("merge_commit_sha") or data.get("squash_commit_sha") or "merged")
        return True, sha[:7] or "merged"
    msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
    return False, f"{status}:{msg}"


def update_branch(repo: str, num: int) -> tuple[bool, str]:
    if vcs_provider() == "github":
        pr = get_pr(repo, num)
        status, data = _github_req(
            "PUT",
            f"/repos/{ORG}/{repo}/pulls/{num}/update-branch",
            {"expected_head_sha": pr["head"]["sha"]},
        )
        if status in (200, 202):
            return True, "updated"
        msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
        return False, f"{status}:{msg}"
    status, data = _gitlab_req(
        "PUT",
        f"/projects/{_encode_project(repo)}/merge_requests/{num}/rebase",
    )
    if status in (200, 201, 202):
        return True, "rebased"
    msg = data.get("message", str(data)) if isinstance(data, dict) else str(data)
    return False, f"{status}:{msg}"


def classify_issue(issue: dict[str, Any], pr: dict[str, Any] | None = None) -> dict[str, Any]:
    repo = repo_from_issue(issue)
    num = pr_number(issue)
    if pr is None:
        pr = get_pr(repo, num)
    ok, ci = ci_ok_for_mr(repo, num, pr)
    if vcs_provider() == "gitlab":
        mergeable, mergeable_state = _gitlab_mergeable_state(pr)
        html_url = str(pr.get("web_url") or f"https://{gitlab_host()}/{gitlab_group()}/{repo}/-/merge_requests/{num}")
    else:
        mergeable, mergeable_state = _github_mergeable_state(pr)
        html_url = str(pr.get("html_url") or f"https://github.com/{ORG}/{repo}/pull/{num}")
    return {
        "repo": repo,
        "number": num,
        "title": (issue.get("title") or pr.get("title") or "")[:80],
        "mergeable": mergeable,
        "mergeable_state": mergeable_state,
        "draft": is_draft(pr),
        "ci": ci if ok else ci,
        "head": head_sha(pr),
        "html_url": html_url,
    }
