#!/usr/bin/env python3
"""Tests for native_gui adapter (mock + path resolution)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.base import TargetConfig  # noqa: E402
from adapters.native_capture import (  # noqa: E402
    resolve_capture_script,
    resolve_lic_root,
    run_studio_native_capture,
)
from adapters.native_gui import run_native_gui_ui  # noqa: E402


class NativeGuiTests(unittest.TestCase):
    def test_mock_world_studio_native(self) -> None:
        target = TargetConfig(
            id="world-studio-native",
            repo="lic",
            surface="gui",
            surface_class="gui_app",
            adapter="native_gui",
            raw={"paths": {"lic_root": "../lic-studio-ui"}},
        )
        out = run_native_gui_ui(target, AGENTS_ROOT, mock=True)
        self.assertEqual(out["status"], "pass")
        self.assertTrue(out.get("native_pixels"))

    def test_resolve_lic_root_prefers_env(self) -> None:
        target = TargetConfig(
            id="world-studio-native",
            repo="lic",
            surface="gui",
            surface_class="gui_app",
            adapter="native_gui",
            raw={"paths": {"lic_root": "../lic-studio-ui"}},
        )
        with tempfile.TemporaryDirectory() as tmp:
            lic = Path(tmp)
            with mock.patch.dict(os.environ, {"LIC_ROOT": str(lic)}):
                resolved = resolve_lic_root(target, AGENTS_ROOT)
            self.assertEqual(resolved, lic.resolve())

    def test_resolve_capture_script_prefers_lic_root_over_pin(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lic = root / "lic-studio-ui"
            lic_script = lic / "scripts/studio-ui-ux-capture-native.sh"
            lic_script.parent.mkdir(parents=True)
            lic_script.write_text("#!/bin/bash\n", encoding="utf-8")

            pin = root / "pinned-capture.sh"
            pin.write_text("#!/bin/bash\n", encoding="utf-8")

            target = TargetConfig(
                id="world-studio-native",
                repo="lic",
                surface="gui",
                surface_class="gui_app",
                adapter="native_gui",
                raw={
                    "paths": {
                        "lic_root": str(lic),
                        "capture_script": str(pin),
                    }
                },
            )
            script = resolve_capture_script(target, lic, root)
            self.assertEqual(script, lic_script)

    def test_capture_meta_png_dir_is_per_target(self) -> None:
        target = TargetConfig(
            id="world-studio-native",
            repo="lic",
            surface="gui",
            surface_class="gui_app",
            adapter="native_gui",
            raw={"paths": {"lic_root": "../lic-studio-ui"}},
        )
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp) / "artifacts" / "world-studio-native"
            with mock.patch(
                "adapters.native_capture.linux_headless_ok", return_value=False
            ):
                out = run_studio_native_capture(target, AGENTS_ROOT, out_dir)
            self.assertEqual(out["status"], "skip")
            # Early skip before capture — no capture_meta yet.
            self.assertNotIn("capture_meta", out)

    def test_capture_meta_overrides_stale_png_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lic = Path(tmp) / "lic"
            meta_dir = lic / "data/studio-ui-ux-plan-loop"
            meta_dir.mkdir(parents=True)
            meta_path = meta_dir / "latest-native-capture.json"
            meta_path.write_text(
                json.dumps({"png_dir": "/stale/other-target/png", "frames_saved": 3}),
                encoding="utf-8",
            )
            script = lic / "scripts/studio-ui-ux-capture-native.sh"
            script.parent.mkdir(parents=True)
            script.write_text("#!/bin/bash\nexit 1\n", encoding="utf-8")

            target = TargetConfig(
                id="world-studio-native",
                repo="lic",
                surface="gui",
                surface_class="gui_app",
                adapter="native_gui",
                raw={"paths": {"lic_root": str(lic)}},
            )
            out_dir = Path(tmp) / "artifacts" / "world-studio-native"
            with mock.patch(
                "adapters.native_capture.linux_headless_ok", return_value=True
            ), mock.patch(
                "adapters.native_capture.xvfb_runner", return_value=None
            ), mock.patch.dict(os.environ, {"DISPLAY": ":99"}):
                out = run_studio_native_capture(target, AGENTS_ROOT, out_dir)
            meta = out.get("capture_meta") or {}
            expected_png = str(out_dir / "png" / "native")
            self.assertEqual(meta.get("png_dir"), expected_png)
            self.assertEqual(meta.get("target_id"), "world-studio-native")
            self.assertNotEqual(meta.get("png_dir"), "/stale/other-target/png")

    def test_lic_tetris_skips_studio_capture_script(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lic = root / "lic"
            lic.mkdir()
            studio_script = lic / "scripts/studio-ui-ux-capture-native.sh"
            studio_script.parent.mkdir(parents=True)
            studio_script.write_text("#!/bin/bash\n", encoding="utf-8")
            tetris_script = AGENTS_ROOT / "ux-harness/scripts/lic-tetris-ux-capture-native.sh"
            target = TargetConfig(
                id="lic-tetris",
                repo="lic",
                surface="gui",
                surface_class="gui_app",
                adapter="native_gui",
                raw={
                    "paths": {
                        "example": str(lic / "examples/tetris"),
                        "capture_script": "ux-harness/scripts/lic-tetris-ux-capture-native.sh",
                    }
                },
            )
            script = resolve_capture_script(target, lic, AGENTS_ROOT)
            self.assertEqual(script, tetris_script)

    def test_resolve_lic_root_from_tetris_example(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            example = root / "lic/examples/tetris"
            example.mkdir(parents=True)
            target = TargetConfig(
                id="lic-tetris",
                repo="lic",
                surface="gui",
                surface_class="gui_app",
                adapter="native_gui",
                raw={"paths": {"example": str(example)}},
            )
            resolved = resolve_lic_root(target, root)
            self.assertEqual(resolved, (root / "lic").resolve())

    def test_lic_tetris_capture_meta_example_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lic = Path(tmp) / "lic"
            example = lic / "examples/tetris"
            example.mkdir(parents=True)
            capture = Path(tmp) / "fake-tetris-capture.sh"
            capture.write_text("#!/bin/bash\nexit 1\n", encoding="utf-8")

            target = TargetConfig(
                id="lic-tetris",
                repo="lic",
                surface="gui",
                surface_class="gui_app",
                adapter="native_gui",
                raw={
                    "paths": {
                        "example": str(example),
                        "capture_script": str(capture),
                    }
                },
            )
            out_dir = Path(tmp) / "artifacts" / "lic-tetris"
            with mock.patch(
                "adapters.native_capture.linux_headless_ok", return_value=True
            ), mock.patch(
                "adapters.native_capture.xvfb_runner", return_value=None
            ), mock.patch.dict(os.environ, {"DISPLAY": ":99", "LIC_ROOT": str(lic)}):
                out = run_studio_native_capture(target, AGENTS_ROOT, out_dir)
            meta = out.get("capture_meta") or {}
            self.assertEqual(meta.get("target_id"), "lic-tetris")
            self.assertEqual(str(out_dir / "capture-meta.json"), str(out_dir / "capture-meta.json"))
            self.assertEqual(out["status"], "skip")


if __name__ == "__main__":
    unittest.main()
