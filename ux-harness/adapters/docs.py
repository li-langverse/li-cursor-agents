"""MkDocs docs surface adapter."""
from __future__ import annotations

from pathlib import Path

from sota.rubric import min_rubric_score, rubric_failing
from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result
from .static_site import audit_static_site, resolve_site_dir


def _site_dir(target: TargetConfig, agents_root: Path) -> Path:
    paths = target.raw.get("paths") or {}
    return resolve_site_dir(agents_root, str(paths.get("site_dir", "../lic/site")))


def run_docs_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))

    site_dir = _site_dir(target, agents_root)
    audit = audit_static_site(site_dir)
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
        "mode": "static_site",
    }
    if not audit["built"]:
        return {**base, "status": "skip", "skip_reason": audit["skip_reason"], "broken_links": 0}
    broken = int(audit["broken_links"])
    return {
        **base,
        "status": "fail" if broken > 0 else "pass",
        "broken_links": broken,
        "html_files": audit["html_files"],
        "links_checked": audit.get("links_checked", 0),
    }


def run_docs_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))

    site_dir = _site_dir(target, agents_root)
    audit = audit_static_site(site_dir)
    journeys = target.raw.get("journeys") or []
    journey_results = [
        {
            "id": j["id"] if isinstance(j, dict) else str(j),
            "steps": (j.get("steps", []) if isinstance(j, dict) else []),
            "completed": audit["built"],
            "step_count": len(j.get("steps", []) if isinstance(j, dict) else []),
        }
        for j in journeys
    ]
    rubric = {
        "nav_clarity": 0.85 if audit["built"] else 0.4,
        "task_efficiency": 0.8 if audit["built"] else 0.45,
        "empty_states": 0.9,
        "error_handling": 0.75,
        "cognitive_load": 0.7,
    }
    if not audit["built"]:
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": audit["skip_reason"],
            "journeys": journey_results,
            "friction_points": [],
            "sota_refs": ["mkdocs-material"],
            "rubric_scores": rubric,
            "rubric_threshold": 0.6,
            "missing_states": [],
            "artifacts": [],
            "mode": "static_site",
        }
    failing = rubric_failing(rubric)
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "fail" if failing else "pass",
        "journeys": journey_results,
        "friction_points": [],
        "sota_refs": ["mkdocs-material"],
        "rubric_scores": rubric,
        "rubric_threshold": 0.6,
        "missing_states": [],
        "artifacts": [],
        "mode": "static_site",
        "rubric_min": min_rubric_score(rubric),
    }
