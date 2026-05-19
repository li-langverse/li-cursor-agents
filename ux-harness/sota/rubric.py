"""Score UX rubric dimensions from journey results."""
from __future__ import annotations

from typing import Any

DEFAULT_THRESHOLD = 0.6


def min_rubric_score(rubric_scores: dict[str, float]) -> float:
    if not rubric_scores:
        return 1.0
    return min(float(v) for v in rubric_scores.values())


def rubric_failing(rubric_scores: dict[str, float], threshold: float = DEFAULT_THRESHOLD) -> bool:
    return min_rubric_score(rubric_scores) < threshold


def overall_ux_status(entry: dict[str, Any], threshold: float = DEFAULT_THRESHOLD) -> str:
    scores = entry.get("rubric_scores") or {}
    friction = entry.get("friction_points") or []
    missing = entry.get("missing_states") or []
    if friction or missing or rubric_failing(scores, threshold):
        return "fail"
    return "pass"
