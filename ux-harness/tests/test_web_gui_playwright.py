#!/usr/bin/env python3
"""Unit tests for web_gui Playwright adapter (CI-safe when playwright absent)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.web_gui_playwright import _tokens_deviation  # noqa: E402


class WebGuiPlaywrightTests(unittest.TestCase):
    def test_tokens_deviation_flags_off_palette_color(self) -> None:
        html = '<div style="background:#1a2332"></div>'
        dev = _tokens_deviation(html)
        self.assertEqual(len(dev), 1)
        self.assertEqual(dev[0]["token"], "#1a2332")

    def test_tokens_deviation_ignores_approved_tokens(self) -> None:
        html = '<body style="background:#0d1117;color:#e6edf3"></body>'
        self.assertEqual(_tokens_deviation(html), [])

    def test_playwright_audit_world_studio_populates_artifacts(self) -> None:
        try:
            import playwright  # noqa: F401
        except ImportError:
            self.skipTest("playwright not installed")

        with tempfile.TemporaryDirectory() as tmp:
            baseline_dir = Path(tmp) / "baselines"
            env = {
                **os.environ,
                "LI_WEB_GUI_PLAYWRIGHT": "1",
                "LI_WEB_GUI_BASELINES_DIR": str(baseline_dir),
            }
            proc = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "run_audit.py"),
                    "--target",
                    "world-studio-demo",
                    "--mode",
                    "ui",
                    "--out-dir",
                    str(Path(tmp) / "out"),
                ],
                cwd=str(AGENTS_ROOT),
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
            ui = json.loads((Path(tmp) / "out" / "ui-audit.json").read_text())
            target = ui["targets"][0]
            self.assertEqual(target["status"], "pass")
            self.assertEqual(target["mode"], "playwright")
            self.assertGreater(len(target["artifacts"]), 0)
            self.assertIsInstance(target["axe_violations"], list)
            self.assertTrue(any("home-desktop.png" in a for a in target["artifacts"]))
            self.assertEqual(target["tokens_deviation"], [])

    def test_playwright_audit_gui_gen_populates_artifacts(self) -> None:
        try:
            import playwright  # noqa: F401
        except ImportError:
            self.skipTest("playwright not installed")

        env = {**os.environ, "LI_WEB_GUI_PLAYWRIGHT": "1"}
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "gui-gen-fixture",
                "--mode",
                "ui",
            ],
            cwd=str(AGENTS_ROOT),
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        target = payload["ui"]["targets"][0]
        self.assertEqual(target["status"], "pass")
        self.assertEqual(target["mode"], "playwright")
        self.assertGreater(len(target["artifacts"]), 0)
        self.assertIsInstance(target["axe_violations"], list)

    def test_token_deviation_fails_audit(self) -> None:
        try:
            import playwright  # noqa: F401
        except ImportError:
            self.skipTest("playwright not installed")

        with tempfile.TemporaryDirectory() as tmp:
            bad_fixture = Path(tmp) / "bad.html"
            bad_fixture.write_text(
                '<html><body style="background:#1a2332">bad</body></html>',
                encoding="utf-8",
            )
            env = {**os.environ, "LI_WEB_GUI_PLAYWRIGHT": "1"}
            from adapters.web_gui_playwright import audit_web_gui_playwright

            result = audit_web_gui_playwright(
                bad_fixture, AGENTS_ROOT, target_id="world-studio-demo"
            )
            self.assertTrue(result["ok"])
            self.assertTrue(result["tokens_deviation"])
            self.assertEqual(result["tokens_deviation"][0]["token"], "#1a2332")


if __name__ == "__main__":
    unittest.main()
