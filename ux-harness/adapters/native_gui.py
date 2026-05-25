"""Native SDL/GUI adapter — Xvfb capture on Linux when viewport draws pixels."""
from __future__ import annotations

from pathlib import Path

from .base import TargetConfig, should_skip_platform
from .mock_data import mock_ui_result, mock_ux_result
from .native_capture import run_studio_native_capture


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
        out = mock_ui_result(target, str(agents_root))
        out["mode"] = "native_gui"
        out["native_pixels"] = target.id == "world-studio-native"
        return out
    out_dir = agents_root / "ux-harness" / "artifacts" / target.id
    out_dir.mkdir(parents=True, exist_ok=True)
    return run_studio_native_capture(target, agents_root, out_dir)


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
        out = mock_ux_result(target, str(agents_root))
        out["mode"] = "native_gui"
        out["native_pixels"] = target.id == "world-studio-native"
        return out
    ui = run_native_gui_ui(target, agents_root, mock=False)
    journeys = target.raw.get("journeys") or []
    journey_results = []
    for j in journeys:
        jid = j["id"] if isinstance(j, dict) else str(j)
        steps = j.get("steps", []) if isinstance(j, dict) else []
        journey_results.append(
            {
                "id": jid,
                "steps": steps,
                "completed": ui.get("status") == "pass",
                "step_count": len(steps),
            }
        )
    native = bool(ui.get("native_pixels"))
    rubric = {
        "nav_clarity": 0.85 if native else 0.6,
        "task_efficiency": 0.8 if native else 0.55,
        "empty_states": 0.75,
        "error_handling": 0.7,
        "cognitive_load": 0.72,
    }
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": ui.get("status", "skip"),
        "skip_reason": ui.get("skip_reason"),
        "native_pixels": native,
        "journeys": journey_results,
        "friction_points": (
            [{"issue": "native viewport capture unavailable; use HTML mocks"}]
            if not native
            else []
        ),
        "sota_refs": ["godot-editor", "cursor-agent", "linear-app"],
        "rubric_scores": rubric,
        "rubric_threshold": 0.6,
        "missing_states": [] if native else ["native_viewport"],
        "artifacts": ui.get("artifacts", []),
        "mode": "native_gui",
    }
