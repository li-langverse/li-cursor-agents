"""Playwright capture + axe for MkDocs static sites (optional extended audit)."""
from __future__ import annotations

import contextlib
import json
import os
import socket
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .pixel_diff import pixel_diff_ratio
from .static_site import site_url_path_prefix

PIXEL_THRESHOLD = 0.04
VIEWPORTS: dict[str, tuple[int, int]] = {
    "desktop": (1280, 720),
    "mobile": (375, 812),
}

# slug -> (relative html path from site root, viewports to capture, optional setup)
CAPTURES: dict[str, tuple[str, tuple[str, ...], str | None]] = {
    "home": ("index.html", ("desktop", "mobile"), None),
    "nav-mobile": ("index.html", ("mobile",), "open_drawer"),
    "master-plan": (
        "superpowers/plans/2026-05-14-li-master-plan/index.html",
        ("desktop", "mobile"),
        None,
    ),
}

AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js"


def baselines_dir(agents_root: Path) -> Path:
    override = os.environ.get("LI_DOCS_BASELINES_DIR")
    if override:
        return Path(override).resolve()
    return agents_root / "ux-harness" / "baselines" / "docs"


def artifacts_dir(target_id: str, agents_root: Path) -> Path:
    out = agents_root / "ux-harness" / "artifacts" / target_id
    out.mkdir(parents=True, exist_ok=True)
    return out


def playwright_enabled() -> bool:
    if os.environ.get("LI_DOCS_PLAYWRIGHT", "").strip() in ("0", "false", "no"):
        return False
    if os.environ.get("LI_DOCS_PLAYWRIGHT", "").strip() in ("1", "true", "yes"):
        try:
            import playwright  # noqa: F401

            return True
        except ImportError:
            return False
    return False


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@contextlib.contextmanager
def serve_site(site_dir: Path):
    site_dir = site_dir.resolve()
    port = _free_port()
    handler = partial(SimpleHTTPRequestHandler, directory=str(site_dir))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=2)


def _open_mobile_drawer(page) -> None:
    for selector in (
        'label[for="__drawer"]',
        ".md-nav__button",
        'button[aria-label="Open navigation"]',
        ".hamburger",
    ):
        loc = page.locator(selector).first
        if loc.count() > 0:
            loc.click()
            page.wait_for_timeout(200)
            return


def _run_axe(page) -> list[dict[str, Any]]:
    page.add_script_tag(url=AXE_CDN)
    raw = page.evaluate(
        """async () => {
            if (typeof axe === 'undefined') return [];
            const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
            return (results.violations || []).map(v => ({
                id: v.id,
                impact: v.impact,
                nodes: (v.nodes || []).length,
            }));
        }"""
    )
    return list(raw or [])


def audit_docs_playwright(
    site_dir: Path,
    agents_root: Path,
    *,
    target_id: str = "lic-docs",
    mkdocs_config: Path | None = None,
) -> dict[str, Any]:
    """Capture screenshots, axe violations, and baseline pixel diff."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"ok": False, "skip_reason": "playwright not installed"}

    if not (site_dir / "index.html").is_file():
        return {"ok": False, "skip_reason": f"MkDocs site not built (missing {site_dir / 'index.html'})"}

    prefix = site_url_path_prefix(site_dir, mkdocs_config)
    baseline_root = baselines_dir(agents_root)
    out_dir = artifacts_dir(target_id, agents_root)
    artifacts: list[str] = []
    axe_all: list[dict[str, Any]] = []
    diffs: list[float] = []
    per_capture: list[dict[str, Any]] = []
    missing_baselines: list[str] = []

    with serve_site(site_dir) as base_url, sync_playwright() as p:
        browser = p.chromium.launch()
        for slug, (rel_path, viewports, setup) in CAPTURES.items():
            page_path = rel_path.replace("\\", "/")
            url = f"{base_url}/{page_path.lstrip('/')}"
            for vp_name in viewports:
                width, height = VIEWPORTS[vp_name]
                page = browser.new_page(viewport={"width": width, "height": height})
                page.goto(url, wait_until="networkidle")
                if setup == "open_drawer":
                    _open_mobile_drawer(page)
                shot_name = f"{slug}-{vp_name}.png"
                shot_path = out_dir / shot_name
                page.screenshot(path=str(shot_path), full_page=True)
                artifacts.append(str(shot_path))

                baseline_path = baseline_root / shot_name
                ratio = 0.0
                if baseline_path.is_file():
                    ratio = pixel_diff_ratio(baseline_path, shot_path)
                    diffs.append(ratio)
                else:
                    missing_baselines.append(shot_name)

                if vp_name == "desktop" and slug == "home":
                    axe_all.extend(_run_axe(page))
                page.close()
                per_capture.append(
                    {
                        "slug": slug,
                        "viewport": vp_name,
                        "url": url,
                        "artifact": str(shot_path),
                        "baseline": str(baseline_path) if baseline_path.is_file() else None,
                        "ratio": ratio,
                    }
                )
        browser.close()

    max_ratio = max(diffs) if diffs else 0.0
    has_baselines = bool(diffs)
    baseline_status = (
        "missing"
        if missing_baselines and not has_baselines
        else ("drift" if max_ratio > PIXEL_THRESHOLD else "ok")
    )
    return {
        "ok": True,
        "artifacts": artifacts,
        "axe_violations": axe_all,
        "pixel_diff": {"max_ratio": max_ratio, "threshold": PIXEL_THRESHOLD, "captures": per_capture},
        "baseline_status": baseline_status,
        "missing_baselines": missing_baselines,
        "site_prefix": prefix,
        "mode": "playwright",
    }
