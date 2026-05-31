"""TUI adapter — runs fixture scripts when present; PTY/VHS reserved for extended CI."""
from __future__ import annotations

import subprocess
from pathlib import Path

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result
from .tui_baseline import baseline_path, compare_stdout_baseline, write_stdout_capture


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

    timed_out = False
    returncode = 1
    stdout = ""
    stderr = ""
    try:
        proc = subprocess.run(
            ["bash", str(fixture)],
            cwd=str(fixture.parent),
            capture_output=True,
            text=True,
            timeout=30,
            stdin=subprocess.DEVNULL,
            check=False,
        )
        returncode = proc.returncode
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", errors="replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")

    capture_path = write_stdout_capture(agents_root, target.id, stdout)
    diff = compare_stdout_baseline(stdout, baseline_path(agents_root, target.id))
    artifacts = [str(capture_path)]
    ok = returncode == 0 and not timed_out and diff["baseline_status"] != "drift"
    result = {
        **base,
        "status": "pass" if ok else "fail",
        "fixture_exit_code": returncode,
        "artifacts": artifacts,
        "stdout_capture": str(capture_path),
        "axe_violations": [],
        "pixel_diff": diff["pixel_diff"],
        "contrast_failures": [],
        "baseline_status": diff["baseline_status"],
        "line_diff": diff["line_diff"],
        "tokens_deviation": [],
        "broken_links": 0,
    }
    if timed_out:
        result["timeout"] = True
        result["skip_reason"] = "TUI fixture timed out after 30s"
    if stderr.strip():
        result["stderr_tail"] = stderr.strip()[-400:]
    return result


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
            "artifacts": ui.get("artifacts", []),
            "mode": "fixture",
        }
    low = ui.get("status") == "fail"
    friction: list[dict[str, str]] = []
    if ui.get("timeout"):
        friction.append({"issue": "fixture timed out"})
    elif ui.get("fixture_exit_code") not in (0, None):
        friction.append({"issue": "fixture exited non-zero"})
    elif ui.get("baseline_status") == "drift":
        friction.append({"issue": "stdout frame drift vs baseline"})
    return {
        "target_id": target.id,
        "repo": target.repo,
        "surface": target.surface,
        "surface_class": target.surface_class,
        "status": "fail" if low else "pass",
        "journeys": [],
        "friction_points": friction,
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
        "artifacts": ui.get("artifacts", []),
        "mode": "fixture",
    }
