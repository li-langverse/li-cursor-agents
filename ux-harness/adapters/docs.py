"""MkDocs docs surface adapter (v1: delegates to mock in CI)."""
from __future__ import annotations

from pathlib import Path

from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result


def run_docs_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ui_result(target, str(agents_root))
    return mock_ui_result(target, str(agents_root))


def run_docs_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    if mock:
        return mock_ux_result(target, str(agents_root))
    return mock_ux_result(target, str(agents_root))
