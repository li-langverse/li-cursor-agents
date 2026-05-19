"""Web GUI adapter (dashboard, gui_gen) — Playwright path reserved for extended CI."""
from __future__ import annotations

from pathlib import Path

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result


def run_web_gui_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    return mock_ui_result(target, str(agents_root)) if mock else mock_ui_result(target, str(agents_root))


def run_web_gui_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    return mock_ux_result(target, str(agents_root)) if mock else mock_ux_result(target, str(agents_root))
