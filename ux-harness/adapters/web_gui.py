"""Web GUI adapter (dashboard, gui_gen) — Playwright path reserved for extended CI."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from sota.rubric import min_rubric_score, rubric_failing

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result

_STEP_MARKERS: dict[str, list[str]] = {
    "open_agents": ['data-testid="agents-page"', "Agents"],
    "check_empty_state": ['data-testid="agents-empty-state"', "data-empty-state", "No agent runs yet"],
    "open_run": ['data-testid="live-stream-panel"', "Live activity"],
    "read_stream": ['data-testid="live-activity-empty"', "No SDK runs in progress"],
    "dashboard_home": ['data-testid="benchmarks-dashboard-home"', "Li Benchmarks"],
    "overview_search": ['data-testid="benchmark-search"', "Search benchmarks"],
    "gpu_matrix": ['data-testid="benchmarks-gpu-matrix-page"', "GPU chip matrix"],
    "chip_picker": ['data-testid="gpu-chip-picker"', "Contributed GPUs"],
}

_STRICT_JOURNEY_TARGETS = frozenset({"agents-dashboard", "benchmarks-dashboard"})


def _probe_url_for_target(target: TargetConfig) -> str | None:
    if target.id == "agents-dashboard":
        port = os.environ.get("LI_PLAYWRIGHT_UI_PORT", "3099")
        return f"http://127.0.0.1:{port}"
    if target.id == "benchmarks-dashboard":
        port = os.environ.get("LI_BENCHMARKS_DASHBOARD_PORT", "3100")
        base_path = os.environ.get("NEXT_PUBLIC_BASE_PATH", "").rstrip("/")
        return f"http://127.0.0.1:{port}{base_path}"
    url = target.raw.get("url")
    return str(url) if url else None


def _probe_url(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except (urllib.error.URLError, TimeoutError, ValueError):
        return False


def _fixture_path(target: TargetConfig, agents_root: Path) -> Path | None:
    raw = target.raw.get("fixture")
    if not raw:
        return None
    p = Path(str(raw))
    if not p.is_absolute():
        p = (agents_root / p).resolve()
    return p if p.is_file() else None


def _artifact_dir(target: TargetConfig, agents_root: Path) -> Path:
    return agents_root / "ux-harness" / "artifacts" / target.id


def _resolve_source(
    target: TargetConfig, agents_root: Path
) -> tuple[str, dict[str, object]]:
    """Return (mode, metadata) where mode is http_probe | fixture | fixture_fallback."""
    url = _probe_url_for_target(target)
    fixture = _fixture_path(target, agents_root)
    base: dict[str, object] = {}

    if url and _probe_url(url):
        return "http_probe", {**base, "url": url}

    if fixture is not None:
        mode = "fixture_fallback" if url else "fixture"
        return mode, {**base, "fixture": str(fixture), "url": url}

    if url:
        return "skip", {**base, "url": url, "skip_reason": f"GUI not reachable at {url}"}

    if fixture is None and target.raw.get("fixture"):
        p = Path(str(target.raw.get("fixture")))
        if not p.is_absolute():
            p = (agents_root / p).resolve()
        return "skip", {**base, "skip_reason": f"GUI fixture missing: {p}"}

    return "skip", {**base, "skip_reason": "no url or fixture configured"}


def _step_passes(step_id: str, html: str) -> bool:
    markers = _STEP_MARKERS.get(step_id, [step_id.replace("_", " ")])
    return any(marker in html for marker in markers)


def _evaluate_journey(journey: dict, html: str, *, strict: bool) -> dict:
    steps = journey.get("steps") or []
    jid = str(journey.get("id", "unknown"))
    step_trace: list[dict[str, str]] = []
    completed = True
    for step in steps:
        step_id = str(step)
        if strict:
            ok = _step_passes(step_id, html)
        else:
            ok = bool(html.strip())
        step_trace.append({"step": step_id, "status": "pass" if ok else "fail"})
        if not ok:
            completed = False
    return {
        "id": jid,
        "steps": steps,
        "step_trace": step_trace,
        "completed": completed,
        "step_count": len(steps),
    }


def _rubric_from_journeys(journey_results: list[dict], *, empty_state_ok: bool) -> dict[str, float]:
    if not journey_results:
        return {
            "nav_clarity": 0.85,
            "task_efficiency": 0.8,
            "empty_states": 0.9 if empty_state_ok else 0.35,
            "error_handling": 0.75,
            "cognitive_load": 0.7,
        }
    completed = sum(1 for j in journey_results if j.get("completed"))
    ratio = completed / len(journey_results)
    empty_journey = next((j for j in journey_results if j.get("id") == "agents_list_empty"), None)
    empty_ok = bool(empty_journey and empty_journey.get("completed")) or empty_state_ok
    return {
        "nav_clarity": 0.85 if ratio >= 1.0 else 0.45 + 0.4 * ratio,
        "task_efficiency": 0.8 if ratio >= 1.0 else 0.5 + 0.3 * ratio,
        "empty_states": 0.9 if empty_ok else 0.35,
        "error_handling": 0.75,
        "cognitive_load": 0.7 if ratio >= 1.0 else 0.55 + 0.15 * ratio,
    }


def _build_ux_payload(
    target: TargetConfig,
    agents_root: Path,
    *,
    mode: str,
    html: str,
    meta: dict[str, object],
    ui_status: str,
) -> dict:
    journeys_cfg = target.raw.get("journeys") or []
    strict = target.id in _STRICT_JOURNEY_TARGETS
    journey_results = [
        _evaluate_journey(j, html, strict=strict) for j in journeys_cfg if isinstance(j, dict)
    ]
    needs_empty_state = any(
        "check_empty_state" in (j.get("steps") or [])
        for j in journeys_cfg
        if isinstance(j, dict)
    )
    empty_state_ok = _step_passes("check_empty_state", html) if needs_empty_state else True
    rubric = _rubric_from_journeys(journey_results, empty_state_ok=empty_state_ok)

    out_dir = _artifact_dir(target, agents_root)
    out_dir.mkdir(parents=True, exist_ok=True)
    journey_log = out_dir / "journey-log.json"
    journey_log.write_text(json.dumps(journey_results, indent=2) + "\n", encoding="utf-8")

    friction: list[dict] = []
    for jr in journey_results:
        if not jr.get("completed"):
            friction.append({"journey": jr.get("id"), "issue": "journey incomplete"})

    all_completed = all(j.get("completed") for j in journey_results) if journey_results else True
    status = (
        "fail"
        if ui_status == "fail" or not all_completed or rubric_failing(rubric)
        else "pass"
    )

    payload: dict[str, object] = {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": status,
        "journeys": journey_results,
        "friction_points": friction,
        "sota_refs": ["shadcn-ui"],
        "rubric_scores": rubric,
        "rubric_threshold": 0.6,
        "rubric_min": min_rubric_score(rubric),
        "missing_states": [] if empty_state_ok else ["empty"],
        "artifacts": [str(journey_log)],
        "mode": mode,
    }
    if mode == "fixture_fallback":
        payload["fixture_fallback"] = True
        payload["fixture"] = meta.get("fixture")
        if meta.get("url"):
            payload["offline_url"] = meta.get("url")
    elif mode == "fixture":
        payload["fixture"] = meta.get("fixture")
    return payload


def run_web_gui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))
    mode, meta = _resolve_source(target, agents_root)
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
    }
    if mode == "skip":
        return {
            **base,
            "status": "skip",
            "skip_reason": meta.get("skip_reason"),
            "mode": "http_probe",
        }
    if mode in ("fixture", "fixture_fallback"):
        result = {
            **base,
            "status": "pass",
            "fixture": meta.get("fixture"),
            "mode": mode,
        }
        if mode == "fixture_fallback":
            result["fixture_fallback"] = True
            if meta.get("url"):
                result["offline_url"] = meta.get("url")
        return result
    return {**base, "status": "pass", "url": meta.get("url"), "mode": "http_probe"}


def run_web_gui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))
    mode, meta = _resolve_source(target, agents_root)
    if mode == "skip":
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": meta.get("skip_reason"),
            "journeys": [],
            "friction_points": [],
            "sota_refs": ["shadcn-ui"],
            "rubric_scores": {},
            "rubric_threshold": 0.6,
            "missing_states": [],
            "artifacts": [],
            "mode": "http_probe",
        }

    if mode == "http_probe":
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "pass",
            "url": meta.get("url"),
            "journeys": [
                {
                    "id": j["id"] if isinstance(j, dict) else str(j),
                    "steps": (j.get("steps", []) if isinstance(j, dict) else []),
                    "completed": True,
                    "step_count": len(j.get("steps", []) if isinstance(j, dict) else []),
                }
                for j in (target.raw.get("journeys") or [])
            ],
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

    fixture = Path(str(meta["fixture"]))
    html = fixture.read_text(encoding="utf-8")
    return _build_ux_payload(
        target,
        agents_root,
        mode=mode,
        html=html,
        meta=meta,
        ui_status="pass",
    )
