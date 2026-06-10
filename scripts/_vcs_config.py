"""VCS provider config for org-swarm PR workers (GitLab primary)."""
from __future__ import annotations

import os

ORG = "li-langverse"


def vcs_provider() -> str:
    raw = os.environ.get("LI_VCS_PROVIDER", "gitlab").strip().lower()
    return "github" if raw == "github" else "gitlab"


def gitlab_host() -> str:
    return (
        os.environ.get("LI_GITLAB_HOST", "").strip()
        or os.environ.get("LI_GIT_HOST", "gitlab.lilangverse.xyz").strip()
    )


def gitlab_group() -> str:
    return (
        os.environ.get("LI_GITLAB_GROUP", "").strip()
        or os.environ.get("LI_GIT_GROUP", ORG).strip()
    )


def gitlab_api_host() -> str:
    """API hostname — in-cluster svc when homelab external TLS is unavailable."""
    host = gitlab_host()
    internal = os.environ.get("LI_GIT_INTERNAL_SVC", "").strip()
    if internal and "lilangverse.xyz" in host:
        return internal
    return host


def gitlab_api_scheme() -> str:
    host = gitlab_host()
    internal = os.environ.get("LI_GIT_INTERNAL_SVC", "").strip()
    if internal and "lilangverse.xyz" in host:
        return "http"
    return os.environ.get("LI_GITLAB_SCHEME", "https").strip() or "https"


def gitlab_api_base() -> str:
    return f"{gitlab_api_scheme()}://{gitlab_api_host()}/api/v4"
