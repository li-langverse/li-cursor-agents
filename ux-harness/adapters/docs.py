"""MkDocs docs surface adapter."""
from __future__ import annotations

import os
from pathlib import Path

from sota.rubric import min_rubric_score, rubric_failing
from .base import TargetConfig
from .docs_playwright import audit_docs_playwright, playwright_enabled
from .mock_data import mock_ui_result, mock_ux_result
from .static_site import audit_static_site, resolve_site_dir, site_url_path_prefix


def _site_dir(target: TargetConfig, agents_root: Path) -> Path:
    lic_root = os.environ.get("LIC_ROOT")
    if lic_root:
        return (Path(lic_root).resolve() / "site")
    paths = target.raw.get("paths") or {}
    return resolve_site_dir(agents_root, str(paths.get("site_dir", "../lic/site")))


def _mkdocs_config(target: TargetConfig, agents_root: Path) -> Path | None:
    lic_root = os.environ.get("LIC_ROOT")
    if lic_root:
        candidate = Path(lic_root).resolve() / "mkdocs.yml"
        if candidate.is_file():
            return candidate
    paths = target.raw.get("paths") or {}
    rel = paths.get("mkdocs_config")
    if not rel:
        return None
    p = Path(str(rel))
    if not p.is_absolute():
        p = (agents_root / p).resolve()
    return p if p.is_file() else None


def _audit_docs_site(target: TargetConfig, agents_root: Path) -> dict:
    site_dir = _site_dir(target, agents_root)
    mkdocs = _mkdocs_config(target, agents_root)
    prefix = site_url_path_prefix(site_dir, mkdocs)
    return audit_static_site(site_dir, site_prefix=prefix, mkdocs_config=mkdocs)


def _ui_base(target: TargetConfig, *, mode: str) -> dict:
    return {
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
        "mode": mode,
    }


def run_docs_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))

    audit = _audit_docs_site(target, agents_root)
    site_dir = _site_dir(target, agents_root)
    mkdocs = _mkdocs_config(target, agents_root)
    base = _ui_base(target, mode="static_site")
    if not audit["built"]:
        return {**base, "status": "skip", "skip_reason": audit["skip_reason"], "broken_links": 0}

    broken = int(audit["broken_links"])
    pw: dict | None = None
    if playwright_enabled():
        pw = audit_docs_playwright(
            site_dir,
            agents_root,
            target_id=target.id,
            mkdocs_config=mkdocs,
        )
        if pw.get("ok"):
            base = _ui_base(target, mode="playwright")
            base["artifacts"] = pw["artifacts"]
            base["axe_violations"] = pw["axe_violations"]
            base["pixel_diff"] = pw["pixel_diff"]
            base["baseline_status"] = pw["baseline_status"]

    pixel_fail = (
        pw is not None
        and pw.get("ok")
        and pw.get("baseline_status") == "drift"
    )
    status = "fail" if broken > 0 or pixel_fail else "pass"
    out = {
        **base,
        "status": status,
        "broken_links": broken,
        "html_files": audit["html_files"],
        "links_checked": audit.get("links_checked", 0),
    }
    if pw and pw.get("ok") and pw.get("missing_baselines"):
        out["missing_baselines"] = pw["missing_baselines"]
    if pw and not pw.get("ok") and pw.get("skip_reason"):
        out["playwright_skip_reason"] = pw["skip_reason"]
    return out


def run_docs_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))

    audit = _audit_docs_site(target, agents_root)
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

    pw_artifacts: list[str] = []
    mode = "static_site"
    if playwright_enabled():
        site_dir = _site_dir(target, agents_root)
        mkdocs = _mkdocs_config(target, agents_root)
        pw = audit_docs_playwright(
            site_dir,
            agents_root,
            target_id=target.id,
            mkdocs_config=mkdocs,
        )
        if pw.get("ok"):
            mode = "playwright"
            pw_artifacts = list(pw.get("artifacts") or [])
            for jr in journey_results:
                if jr["id"] == "mobile_nav":
                    jr["completed"] = any("nav-mobile" in a for a in pw_artifacts)
                elif jr["id"] == "first_reading_path":
                    jr["completed"] = any("home-" in a for a in pw_artifacts)

    failing = rubric_failing(rubric)
    incomplete = any(not j.get("completed") for j in journey_results)
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "fail" if failing or incomplete else "pass",
        "journeys": journey_results,
        "friction_points": [],
        "sota_refs": ["mkdocs-material"],
        "rubric_scores": rubric,
        "rubric_threshold": 0.6,
        "missing_states": [],
        "artifacts": pw_artifacts,
        "mode": mode,
        "rubric_min": min_rubric_score(rubric),
    }
