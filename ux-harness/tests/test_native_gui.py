#!/usr/bin/env python3
"""Tests for native_gui adapter (mock + path resolution)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.base import TargetConfig  # noqa: E402
from adapters.native_capture import resolve_lic_root, resolve_capture_script  # noqa: E402
from adapters.native_gui import run_native_gui_ui  # noqa: E402


class NativeGuiTests(unittest.TestCase):
    def test_mock_world_studio_native(self) -> None:
        target = TargetConfig(
            id="world-studio-native",
            repo="lic",
            surface="gui",
            surface_class="gui_app",
            adapter="native_gui",
            raw={"paths": {"lic_root": "../lic"}},
        )
        out = run_native_gui_ui(target, AGENTS_ROOT, mock=True)
        self.assertEqual(out["status"], "pass")
        self.assertTrue(out.get("native_pixels"))

    def test_resolve_paths(self) -> None:
        target = TargetConfig(
            id="world-studio-native",
            repo="lic",
            surface="gui",
            surface_class="gui_app",
            adapter="native_gui",
            raw={
                "paths": {
                    "lic_root": "../lic",
                    "capture_script": "../lic/scripts/studio-ui-ux-capture-native.sh",
                }
            },
        )
        lic = resolve_lic_root(target, AGENTS_ROOT)
        self.assertIsNotNone(lic)
        script = resolve_capture_script(target, lic, AGENTS_ROOT)
        self.assertIsNotNone(script)
        self.assertTrue(script.name.endswith("studio-ui-ux-capture-native.sh"))


if __name__ == "__main__":
    unittest.main()
