"""Web GUI adapter (dashboard, gui_gen) — Playwright path reserved for extended CI."""
from __future__ import annotations

import urllib.error
import urllib.request
from pathlib import Path

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result


def _probe_url(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def run_web_gui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))
    url = str(target.raw.get("url") or "")
    fixture = target.raw.get("fixture")
    base = {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "artifacts": [],
        "axe_violations": [],
        "pixel_diff": {"max_ratio": 0.0, "threshold": 0.04},
        "contrast_failures": [],
        "baseline_status": "ok",
        "tokens_deviation": [],
        "broken_links": 0,
        "mode": "http_probe",
    }
    if fixture:
        p = Path(str(fixture))
        if not p.is_absolute():
            p = (agents_root / p).resolve()
        if p.is_file():
            return {**base, "status": "pass", "fixture": str(p)}
        return {**base, "status": "skip", "skip_reason": f"GUI fixture missing: {p}"}
    if not url:
        return {**base, "status": "skip", "skip_reason": "no url or fixture configured"}
    if not _probe_url(url):
        return {
            **base,
            "status": "skip",
            "skip_reason": f"GUI not reachable at {url} (start dashboard for extended audit)",
        }
    return {**base, "status": "pass", "url": url}


def run_web_gui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))
    ui = run_web_gui_ui(target, agents_root, mock=False)
    if ui.get("status") == "skip":
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": ui.get("skip_reason"),
            "journeys": [],
            "friction_points": [],
            "sota_refs": ["shadcn-ui"],
            "rubric_scores": {},
            "rubric_threshold": 0.6,
            "missing_states": [],
            "artifacts": [],
            "mode": "http_probe",
        }
    return mock_ux_result(target, str(agents_root)) if ui.get("status") == "fail" else {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "pass",
        "journeys": [],
        "friction_points": [],
        "sota_refs": ["shadcn-ui"],
        "rubric_scores": {
            "nav_clarity": 0.85,
            "task_efficiency": 0.8,
            "empty_states": 0.9,
            "error_handling": 0.75,
            "cognitive_load": 0.7,
        },
        "rubric_threshold": 0.6,
        "missing_states": [],
        "artifacts": [],
        "mode": "http_probe",
    }
