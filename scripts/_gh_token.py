"""Resolve GitHub token — swarm token preferred for org automation."""
from __future__ import annotations

import os


def gh_token() -> str:
    for key in ("GH_SWARM_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"):
        val = os.environ.get(key, "").strip()
        if val:
            return val
    raise SystemExit("GH_SWARM_TOKEN or GH_TOKEN required")
