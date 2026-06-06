"""Deterministic mock audit payloads for CI (--mock)."""
from __future__ import annotations

from typing import Any

from .base import TargetConfig

_AGENTIC_AI_SOTA = ["cursor-agent", "linear-app", "github-copilot-workspace"]
_DEFAULT_MOCK_SOTA = ["mkdocs-material", "shadcn-ui", "textual"]


def _mock_sota_refs(target_id: str) -> list[str]:
    refs = list(_DEFAULT_MOCK_SOTA)
    if target_id == "world-studio-demo":
        refs.extend(_AGENTIC_AI_SOTA)
    return refs


def mock_ui_result(target: TargetConfig, agents_root: str) -> dict[str, Any]:
    failing = target.id in ("lic-docs",)
    artifacts = [
        f"{agents_root}/ux-harness/artifacts/{target.id}/home.png",
    ]
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "fail" if failing else "pass",
        "artifacts": artifacts,
        "axe_violations": (
            [{"id": "color-contrast", "impact": "serious", "nodes": 2}]
            if failing
            else []
        ),
        "pixel_diff": {"max_ratio": 0.06 if failing else 0.0, "threshold": 0.04},
        "contrast_failures": (
            [{"selector": ".md-nav", "ratio": 3.2}] if target.id == "lic-docs" else []
        ),
        "baseline_status": "drift" if failing else "ok",
        "tokens_deviation": [],
        "broken_links": 0 if target.id != "lic-docs" else 1,
    }


def mock_ux_result(target: TargetConfig, agents_root: str) -> dict[str, Any]:
    low_rubric = target.id in ("tui-app-fixture",)
    journeys = target.raw.get("journeys") or []
    journey_results = []
    for j in journeys:
        jid = j["id"] if isinstance(j, dict) else str(j)
        journey_results.append(
            {
                "id": jid,
                "steps": (j.get("steps", []) if isinstance(j, dict) else []),
                "completed": not low_rubric,
                "step_count": len(j.get("steps", []) if isinstance(j, dict) else []),
            }
        )
    rubric = {
        "nav_clarity": 0.85 if not low_rubric else 0.45,
        "task_efficiency": 0.8 if not low_rubric else 0.5,
        "empty_states": 0.9 if not low_rubric else 0.35,
        "error_handling": 0.75,
        "cognitive_load": 0.7 if not low_rubric else 0.55,
    }
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "fail" if low_rubric else "pass",
        "journeys": journey_results,
        "friction_points": (
            [{"journey": "agents_list_empty", "issue": "No empty state when zero runs"}]
            if low_rubric
            else []
        ),
        "sota_refs": _mock_sota_refs(target.id),
        "rubric_scores": rubric,
        "rubric_threshold": 0.6,
        "missing_states": ["empty"] if low_rubric else [],
        "artifacts": [f"{agents_root}/ux-harness/artifacts/{target.id}/journey-log.json"],
    }
