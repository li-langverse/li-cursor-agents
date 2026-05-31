"""Line-diff baseline helpers for TUI stdout frame capture."""
from __future__ import annotations

import difflib
from pathlib import Path

PIXEL_DIFF_THRESHOLD = 0.04


def normalize_stdout(text: str) -> str:
    """Normalize captured stdout for stable line-diff comparison."""
    lines = [ln.rstrip() for ln in text.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines) + ("\n" if lines else "")


def baseline_path(agents_root: Path, target_id: str) -> Path:
    return agents_root / "ux-harness" / "baselines" / target_id / "stdout.txt"


def artifacts_dir(agents_root: Path, target_id: str) -> Path:
    return agents_root / "ux-harness" / "artifacts" / target_id


def write_stdout_capture(agents_root: Path, target_id: str, stdout: str) -> Path:
    out_dir = artifacts_dir(agents_root, target_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    capture_path = out_dir / "stdout.txt"
    capture_path.write_text(normalize_stdout(stdout), encoding="utf-8")
    return capture_path


def compare_stdout_baseline(capture: str, baseline_file: Path | None) -> dict:
    """Return pixel_diff + baseline_status fields for TUI stdout frames."""
    normalized = normalize_stdout(capture)
    if baseline_file is None or not baseline_file.is_file():
        return {
            "pixel_diff": {"max_ratio": 0.0, "threshold": PIXEL_DIFF_THRESHOLD},
            "baseline_status": "missing",
            "line_diff": {"changed_lines": 0, "total_lines": len(normalized.splitlines())},
        }
    baseline = normalize_stdout(baseline_file.read_text(encoding="utf-8"))
    ratio = difflib.SequenceMatcher(None, baseline, normalized).ratio()
    max_ratio = round(1.0 - ratio, 6)
    changed = sum(
        1
        for _ in difflib.unified_diff(
            baseline.splitlines(),
            normalized.splitlines(),
            lineterm="",
        )
        if _.startswith("+") or _.startswith("-")
    )
    total = max(len(baseline.splitlines()), len(normalized.splitlines()), 1)
    status = "drift" if max_ratio > PIXEL_DIFF_THRESHOLD else "ok"
    return {
        "pixel_diff": {"max_ratio": max_ratio, "threshold": PIXEL_DIFF_THRESHOLD},
        "baseline_status": status,
        "line_diff": {"changed_lines": changed, "total_lines": total},
    }
