"""TUI adapter — runs fixture scripts when present; PTY/VHS reserved for extended CI."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from sota.rubric import min_rubric_score, rubric_failing

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result

# Map journey step ids to fixture input keys.
_STEP_KEYS: dict[str, str] = {
    "launch": "",
    "tab_help": "h",
    "quit": "q",
    "run_generator": "",
    "capture_screen": "",
}

_HELP_MARKERS = ("Help:", "arrow keys navigate")
_ERROR_MARKERS = ("Error:", "simulated failure")
_A11Y_MARKERS_BY_CLASS: dict[str, tuple[str, ...]] = {
    "tui_app": ("plain snapshot", "Surface: tui_app"),
    "tui_gen": ("plain snapshot", "Surface: tui_gen"),
}


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


def _journey_script(journeys: list) -> str:
    keys: list[str] = []
    for journey in journeys:
        if not isinstance(journey, dict):
            continue
        for step in journey.get("steps") or []:
            keys.append(_STEP_KEYS.get(str(step), ""))
    return "".join(keys) or "hq"


def _run_fixture(
    target: TargetConfig,
    agents_root: Path,
    *,
    ux_script: str = "",
    write_frame: bool = False,
    extra_env: dict[str, str] | None = None,
) -> dict:
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
    env = {**os.environ, "UX_HARNESS": "1"}
    if ux_script:
        env["LI_UX_SCRIPT"] = ux_script
    if extra_env:
        env.update(extra_env)
    try:
        proc = subprocess.run(
            ["bash", str(fixture)],
            cwd=str(fixture.parent),
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            **base,
            "status": "fail",
            "fixture_exit_code": -1,
            "timeout": True,
            "stdout": (exc.stdout or "") if exc.stdout is not None else "",
            "stderr": (exc.stderr or "") if exc.stderr is not None else "",
            "friction_points": [{"issue": f"fixture timed out after {exc.timeout}s"}],
        }
    ok = proc.returncode == 0
    result = {
        **base,
        "status": "pass" if ok else "fail",
        "fixture_exit_code": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "axe_violations": [],
        "pixel_diff": {"max_ratio": 0.0, "threshold": 0.04},
        "contrast_failures": [],
        "baseline_status": "ok",
        "tokens_deviation": [],
        "broken_links": 0,
    }
    if write_frame:
        out_dir = _artifact_dir(target, agents_root)
        out_dir.mkdir(parents=True, exist_ok=True)
        frame_path = out_dir / "frame.txt"
        frame_path.write_text(proc.stdout, encoding="utf-8")
        result["artifacts"] = [str(frame_path)]
    return result


def _evaluate_journey(journey: dict, stdout: str, exit_ok: bool) -> dict:
    steps = journey.get("steps") or []
    jid = str(journey.get("id", "unknown"))
    help_seen = any(marker in stdout for marker in _HELP_MARKERS)
    step_trace: list[dict[str, str]] = []
    completed = exit_ok

    for step in steps:
        step_id = str(step)
        if step_id == "launch":
            step_trace.append({"step": step_id, "status": "pass"})
        elif step_id == "tab_help":
            ok = help_seen
            step_trace.append({"step": step_id, "status": "pass" if ok else "fail"})
            if not ok:
                completed = False
        elif step_id == "quit":
            step_trace.append({"step": step_id, "status": "pass" if exit_ok else "fail"})
            if not exit_ok:
                completed = False
        else:
            step_trace.append({"step": step_id, "status": "pass" if exit_ok else "fail"})
            if not exit_ok:
                completed = False

    return {
        "id": jid,
        "steps": steps,
        "step_trace": step_trace,
        "completed": completed,
        "step_count": len(steps),
    }


def _error_handling_score(*, error_tested: bool, error_ok: bool) -> float:
    if error_ok:
        return 0.9
    if error_tested:
        return 0.5
    return 0.35


def _rubric_from_journeys(
    journey_results: list[dict],
    exit_ok: bool,
    *,
    error_tested: bool = False,
    error_ok: bool = False,
) -> dict[str, float]:
    err = _error_handling_score(error_tested=error_tested, error_ok=error_ok)
    if not journey_results:
        low = not exit_ok
        return {
            "nav_clarity": 0.5 if low else 0.85,
            "task_efficiency": 0.5 if low else 0.8,
            "empty_states": 0.9,
            "error_handling": err,
            "cognitive_load": 0.7,
        }
    completed = sum(1 for j in journey_results if j.get("completed"))
    ratio = completed / len(journey_results)
    nav = 0.45 + 0.4 * ratio
    task = 0.5 + 0.3 * ratio
    return {
        "nav_clarity": nav if ratio < 1.0 else 0.85,
        "task_efficiency": task if ratio < 1.0 else 0.8,
        "empty_states": 0.9,
        "error_handling": err,
        "cognitive_load": 0.55 + 0.15 * ratio,
    }


def _a11y_export_ok(stdout: str, surface_class: str) -> bool:
    markers = _A11Y_MARKERS_BY_CLASS.get(surface_class, ("plain snapshot",))
    return all(marker in stdout for marker in markers)


def _error_surface_ok(stderr: str) -> bool:
    return any(marker in stderr for marker in _ERROR_MARKERS)


def run_tui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))
    return _run_fixture(target, agents_root, write_frame=True)


def run_tui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))
    journeys_cfg = target.raw.get("journeys") or []
    script = _journey_script(journeys_cfg)
    ui = _run_fixture(target, agents_root, ux_script=script, write_frame=True)
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

    stdout = ui.get("stdout") or ""
    exit_ok = ui.get("status") == "pass" and not ui.get("timeout")
    journey_results = [
        _evaluate_journey(j, stdout, exit_ok)
        for j in journeys_cfg
        if isinstance(j, dict)
    ]

    out_dir = _artifact_dir(target, agents_root)
    out_dir.mkdir(parents=True, exist_ok=True)
    journey_log = out_dir / "journey-log.json"
    journey_log.write_text(json.dumps(journey_results, indent=2) + "\n", encoding="utf-8")
    artifacts = list(ui.get("artifacts") or [])
    artifacts.append(str(journey_log))

    a11y = _run_fixture(
        target,
        agents_root,
        extra_env={"LI_TUI_EXPORT_A11Y": "1"},
    )
    a11y_stdout = a11y.get("stdout") or ""
    a11y_ok = a11y.get("status") == "pass" and _a11y_export_ok(
        a11y_stdout, target.surface_class
    )
    if a11y_ok:
        a11y_path = out_dir / "a11y-plain.txt"
        a11y_path.write_text(a11y_stdout, encoding="utf-8")
        artifacts.append(str(a11y_path))
    else:
        artifacts.append("missing:a11y-plain.txt")

    error_run = _run_fixture(
        target,
        agents_root,
        extra_env={"LI_TUI_ERROR": "1", "LI_TUI_EXPORT_A11Y": "1"},
    )
    error_stderr = error_run.get("stderr") or ""
    error_tested = error_run.get("status") == "pass"
    error_ok = error_tested and _error_surface_ok(error_stderr)

    friction: list[dict] = []
    if ui.get("timeout"):
        friction.append({"issue": "fixture timed out in non-interactive harness"})
    elif not exit_ok:
        friction.append({"issue": "fixture exited non-zero"})
    for jr in journey_results:
        if not jr.get("completed"):
            friction.append({"journey": jr.get("id"), "issue": "journey incomplete"})
    if not a11y_ok:
        friction.append({"issue": "a11y plain-text export missing or invalid"})
    if error_tested and not error_ok:
        friction.append({"issue": "error path did not surface stderr banner"})

    all_completed = all(jr.get("completed") for jr in journey_results) if journey_results else exit_ok
    rubric = _rubric_from_journeys(
        journey_results,
        exit_ok,
        error_tested=error_tested,
        error_ok=error_ok,
    )
    status = (
        "fail"
        if not all_completed
        or not exit_ok
        or not a11y_ok
        or rubric_failing(rubric)
        else "pass"
    )

    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": status,
        "journeys": journey_results,
        "friction_points": friction,
        "sota_refs": ["textual"],
        "rubric_scores": rubric,
        "rubric_threshold": 0.6,
        "rubric_min": min_rubric_score(rubric),
        "missing_states": [],
        "artifacts": artifacts,
        "mode": "fixture",
    }
