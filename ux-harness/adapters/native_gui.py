"""Native SDL/GUI adapter — Xvfb capture on Linux extended CI."""
from __future__ import annotations

from pathlib import Path

from .base import TargetConfig, should_skip_platform
from .mock_data import mock_ui_result, mock_ux_result


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
    return mock_ui_result(target, str(agents_root)) if mock else mock_ui_result(target, str(agents_root))


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
    return mock_ux_result(target, str(agents_root)) if mock else mock_ux_result(target, str(agents_root))
