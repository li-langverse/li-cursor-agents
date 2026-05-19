"""TUI adapter — PTY/VHS capture; fixtures until org TUI repos land."""
from __future__ import annotations

from pathlib import Path

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result


def run_tui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    return mock_ui_result(target, str(agents_root)) if mock else mock_ui_result(target, str(agents_root))


def run_tui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    return mock_ux_result(target, str(agents_root)) if mock else mock_ux_result(target, str(agents_root))
