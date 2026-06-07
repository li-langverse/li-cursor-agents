"""Resolve GitHub token — swarm token preferred; backup on rate limit."""
from __future__ import annotations

import os
from typing import Callable, TypeVar

T = TypeVar("T")

_TOKEN_KEYS = (
    "GH_SWARM_TOKEN",
    "GH_SWARM_TOKEN_BACKUP",
    "GH_TOKEN_BACKUP",
    "GH_TOKEN",
    "GITHUB_TOKEN",
)


def gh_token_candidates() -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for key in _TOKEN_KEYS:
        val = os.environ.get(key, "").strip()
        if not val or val in seen:
            continue
        seen.add(val)
        out.append(val)
    return out


def gh_token() -> str:
    candidates = gh_token_candidates()
    if not candidates:
        raise SystemExit("GH_SWARM_TOKEN or GH_TOKEN required")
    return candidates[0]


def _is_rate_limit(status: int, body: str) -> bool:
    if status == 429:
        return True
    if status == 403 and "rate limit" in body.lower():
        return True
    return False


def with_github_token_failover(fn: Callable[[str], T]) -> T:
    candidates = gh_token_candidates()
    if not candidates:
        raise SystemExit("GH_SWARM_TOKEN or GH_TOKEN required")
    last: T | None = None
    for i, token in enumerate(candidates):
        result = fn(token)
        last = result
        if isinstance(result, tuple) and len(result) >= 2:
            status, body = result[0], result[1]
            if _is_rate_limit(int(status), str(body)) and i + 1 < len(candidates):
                continue
        return result
    assert last is not None
    return last
