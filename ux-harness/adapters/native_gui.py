"""Native SDL/GUI adapter — Xvfb capture on Linux extended CI."""
from __future__ import annotations

from pathlib import Path

from .base import TargetConfig, should_skip_platform
from .mock_data import mock_ui_result, mock_ux_result


def run_native_gui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    skip = should_skip_platform(target)
    if skip:
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": skip,
        }
    if mock:
        return mock_ui_result(target, str(agents_root))
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "skip",
        "skip_reason": "native GUI capture requires Linux Xvfb extended CI",
        "artifacts": [],
        "axe_violations": [],
        "pixel_diff": {"max_ratio": 0.0, "threshold": 0.04},
        "contrast_failures": [],
        "baseline_status": "ok",
        "tokens_deviation": [],
        "broken_links": 0,
        "mode": "native_gui",
    }


def run_native_gui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    skip = should_skip_platform(target)
    if skip:
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": skip,
        }
    if mock:
        return mock_ux_result(target, str(agents_root))
    ui = run_native_gui_ui(target, agents_root, mock=False)
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": ui.get("status", "skip"),
        "skip_reason": ui.get("skip_reason"),
        "journeys": [],
        "friction_points": [],
        "sota_refs": ["sdl2"],
        "rubric_scores": {},
        "rubric_threshold": 0.6,
        "missing_states": [],
        "artifacts": [],
        "mode": "native_gui",
    }
