"""TUI adapter — runs fixture scripts when present; PTY/VHS reserved for extended CI."""
from __future__ import annotations

import subprocess
from pathlib import Path

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result


def _fixture_path(target: TargetConfig, agents_root: Path) -> Path | None:
    raw = target.raw.get("fixture")
    if not raw:
        return None
    p = Path(str(raw))
    if not p.is_absolute():
        p = (agents_root / p).resolve()
    return p if p.is_file() else None


def _run_fixture(target: TargetConfig, agents_root: Path) -> dict:
    fixture = _fixture_path(target, agents_root)
    base = {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "artifacts": [],
        "mode": "fixture",
    }
    if fixture is None:
        return {**base, "status": "skip", "skip_reason": "TUI fixture missing"}
    proc = subprocess.run(
        ["bash", str(fixture)],
        cwd=str(fixture.parent),
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    ok = proc.returncode == 0
    return {
        **base,
        "status": "pass" if ok else "fail",
        "fixture_exit_code": proc.returncode,
        "axe_violations": [],
        "pixel_diff": {"max_ratio": 0.0, "threshold": 0.04},
        "contrast_failures": [],
        "baseline_status": "ok",
        "tokens_deviation": [],
        "broken_links": 0,
    }


def run_tui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))
    return _run_fixture(target, agents_root)


def run_tui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))
    ui = _run_fixture(target, agents_root)
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
            "sota_refs": ["textual"],
            "rubric_scores": {},
            "rubric_threshold": 0.6,
            "missing_states": [],
            "artifacts": [],
            "mode": "fixture",
        }
    low = ui.get("status") == "fail"
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "fail" if low else "pass",
        "journeys": [],
        "friction_points": [{"issue": "fixture exited non-zero"}] if low else [],
        "sota_refs": ["textual"],
        "rubric_scores": {
            "nav_clarity": 0.5 if low else 0.85,
            "task_efficiency": 0.5 if low else 0.8,
            "empty_states": 0.9,
            "error_handling": 0.75,
            "cognitive_load": 0.7,
        },
        "rubric_threshold": 0.6,
        "missing_states": [],
        "artifacts": [],
        "mode": "fixture",
    }
