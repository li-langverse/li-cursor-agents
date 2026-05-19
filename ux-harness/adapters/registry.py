"""Dispatch UI/UX audits to surface adapters by manifest adapter name."""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from . import docs, native_gui, tui, web_gui
from .base import TargetConfig
from .mock_data import mock_ui_result, mock_ux_result

UiFn = Callable[[TargetConfig, Path, bool], dict]
UxFn = Callable[[TargetConfig, Path, bool], dict]

_UI: dict[str, UiFn] = {
    "docs": docs.run_docs_ui,
    "web_gui": web_gui.run_web_gui_ui,
    "native_gui": native_gui.run_native_gui_ui,
    "tui": tui.run_tui_ui,
}

_UX: dict[str, UxFn] = {
    "docs": docs.run_docs_ux,
    "web_gui": web_gui.run_web_gui_ux,
    "native_gui": native_gui.run_native_gui_ux,
    "tui": tui.run_tui_ux,
}


def run_adapter_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    fn = _UI.get(target.adapter)
    if fn is None:
        return mock_ui_result(target, str(agents_root))
    return fn(target, agents_root, mock)


def run_adapter_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    fn = _UX.get(target.adapter)
    if fn is None:
        return mock_ux_result(target, str(agents_root))
    return fn(target, agents_root, mock)
