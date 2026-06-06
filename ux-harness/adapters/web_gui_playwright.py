"""Playwright capture + axe for static HTML GUI fixtures (optional extended audit)."""
from __future__ import annotations

import contextlib
import os
import re
import socket
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .docs_playwright import AXE_CDN
from .pixel_diff import pixel_diff_ratio

PIXEL_THRESHOLD = 0.04
VIEWPORTS: dict[str, tuple[int, int]] = {
    "desktop": (1280, 720),
    "wide": (1920, 1080),
    "mobile": (375, 812),
}

# Li dark theme tokens — off-palette colors flagged in fixture HTML
_OFF_TOKEN_COLORS = frozenset({"#1a2332"})

_HEX_COLOR_RE = re.compile(r"#[0-9a-fA-F]{6}\b")

# target_id -> (viewports to capture,)
FIXTURE_CAPTURES: dict[str, tuple[str, ...]] = {
    "world-studio-demo": ("desktop", "wide", "mobile"),
    "gui-gen-fixture": ("desktop", "mobile"),
}


def baselines_dir(target_id: str, agents_root: Path) -> Path:
    override = os.environ.get("LI_WEB_GUI_BASELINES_DIR")
    if override:
        return Path(override).resolve() / target_id
    return agents_root / "ux-harness" / "baselines" / target_id


def artifacts_dir(target_id: str, agents_root: Path) -> Path:
    out = agents_root / "ux-harness" / "artifacts" / target_id
    out.mkdir(parents=True, exist_ok=True)
    return out


def playwright_enabled() -> bool:
    if os.environ.get("LI_WEB_GUI_PLAYWRIGHT", "").strip() in ("0", "false", "no"):
        return False
    if os.environ.get("LI_WEB_GUI_PLAYWRIGHT", "").strip() in ("1", "true", "yes"):
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
def serve_fixture_dir(fixture_path: Path):
    """Serve the fixture's parent directory over HTTP."""
    fixture_path = fixture_path.resolve()
    site_dir = fixture_path.parent
    port = _free_port()
    handler = partial(SimpleHTTPRequestHandler, directory=str(site_dir))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    rel = fixture_path.name
    try:
        yield f"http://127.0.0.1:{port}/{rel}"
    finally:
        httpd.shutdown()
        thread.join(timeout=2)


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


def _contrast_failures_from_axe(violations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for v in violations:
        if v.get("id") == "color-contrast":
            out.append(
                {
                    "rule": v.get("id"),
                    "impact": v.get("impact"),
                    "nodes": v.get("nodes", 0),
                }
            )
    return out


def _tokens_deviation(html: str) -> list[dict[str, str]]:
    found = {m.group(0).lower() for m in _HEX_COLOR_RE.finditer(html)}
    deviations: list[dict[str, str]] = []
    for color in sorted(found):
        if color in _OFF_TOKEN_COLORS:
            deviations.append({"token": color, "reason": "off-palette studio color"})
    return deviations



def audit_web_gui_playwright(
    fixture_path: Path,
    agents_root: Path,
    *,
    target_id: str,
) -> dict[str, Any]:
    """Capture screenshots, axe violations, token drift, and baseline pixel diff."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"ok": False, "skip_reason": "playwright not installed"}

    if not fixture_path.is_file():
        return {"ok": False, "skip_reason": f"fixture missing: {fixture_path}"}

    viewports = FIXTURE_CAPTURES.get(target_id, ("desktop", "mobile"))
    html = fixture_path.read_text(encoding="utf-8")
    tokens_deviation = _tokens_deviation(html)

    baseline_root = baselines_dir(target_id, agents_root)
    out_dir = artifacts_dir(target_id, agents_root)
    artifacts: list[str] = []
    axe_all: list[dict[str, Any]] = []
    diffs: list[float] = []
    per_capture: list[dict[str, Any]] = []
    missing_baselines: list[str] = []

    with serve_fixture_dir(fixture_path) as url, sync_playwright() as p:
        browser = p.chromium.launch()
        for vp_name in viewports:
            width, height = VIEWPORTS[vp_name]
            page = browser.new_page(viewport={"width": width, "height": height})
            page.goto(url, wait_until="networkidle")
            shot_name = f"home-{vp_name}.png"
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

            if vp_name == "desktop":
                axe_all.extend(_run_axe(page))
            page.close()
            per_capture.append(
                {
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
    contrast_failures = _contrast_failures_from_axe(axe_all)
    return {
        "ok": True,
        "artifacts": artifacts,
        "axe_violations": axe_all,
        "contrast_failures": contrast_failures,
        "tokens_deviation": tokens_deviation,
        "pixel_diff": {"max_ratio": max_ratio, "threshold": PIXEL_THRESHOLD, "captures": per_capture},
        "baseline_status": baseline_status,
        "missing_baselines": missing_baselines,
        "mode": "playwright",
    }
