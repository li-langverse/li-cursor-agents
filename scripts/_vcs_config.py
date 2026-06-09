"""VCS provider config for org-swarm PR workers (GitLab primary)."""
from __future__ import annotations

import os

ORG = "li-langverse"


def vcs_provider() -> str:
    raw = os.environ.get("LI_VCS_PROVIDER", "gitlab").strip().lower()
    return "github" if raw == "github" else "gitlab"


def gitlab_host() -> str:
    return os.environ.get("LI_GITLAB_HOST", "gitlab.lilangverse.xyz").strip()


def gitlab_group() -> str:
    return os.environ.get("LI_GITLAB_GROUP", ORG).strip()


def gitlab_api_base() -> str:
    host = gitlab_host()
    scheme = os.environ.get("LI_GITLAB_SCHEME", "https").strip() or "https"
    return f"{scheme}://{host}/api/v4"
