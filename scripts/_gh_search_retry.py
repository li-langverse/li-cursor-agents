"""Shared GitHub search helper with rate-limit retry."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"


from _gh_token import gh_token


def headers() -> dict[str, str]:
    token = gh_token()
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _reset_wait_ms(resp: urllib.error.HTTPError | None) -> int:
    if resp is None:
        return 60_000
    reset = resp.headers.get("X-RateLimit-Reset")
    if reset and reset.isdigit():
        wait = int(reset) * 1000 - int(time.time() * 1000)
        return max(5_000, min(wait + 1_000, 900_000))
    retry_after = resp.headers.get("Retry-After")
    if retry_after and retry_after.isdigit():
        return max(5_000, int(retry_after) * 1000)
    return 60_000


def search_issues(query: str, *, max_attempts: int = 4) -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        url = f"{API}/search/issues?q={urllib.parse.quote(query)}&per_page=100&page={page}"
        data: dict | None = None
        for attempt in range(max_attempts):
            req = urllib.request.Request(url, headers=headers(), method="GET")
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = json.loads(resp.read().decode())
                break
            except urllib.error.HTTPError as err:
                body = err.read().decode()
                rate_limited = err.code in (403, 429) or "rate limit" in body.lower()
                if rate_limited and attempt + 1 < max_attempts:
                    wait_ms = _reset_wait_ms(err)
                    print(
                        f"GitHub rate limit (HTTP {err.code}); retry in {wait_ms // 1000}s",
                        file=os.sys.stderr,
                        flush=True,
                    )
                    time.sleep(wait_ms / 1000)
                    continue
                raise SystemExit(f"search failed HTTP {err.code}: {body[:500]}") from err
        if not isinstance(data, dict):
            raise SystemExit("search failed: empty response")
        items = data.get("items", [])
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(1)
    return out
