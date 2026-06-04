#!/usr/bin/env python3
"""Unit tests for ux-harness (CI-safe, --mock only)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent


class HarnessTests(unittest.TestCase):
    def test_run_audit_mock_all(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--all",
                "--mock",
                "--out-dir",
                str(ROOT / "artifacts" / "test-out"),
            ],
            cwd=str(AGENTS_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        ui_path = ROOT / "artifacts" / "test-out" / "ui-audit.json"
        ux_path = ROOT / "artifacts" / "test-out" / "ux-audit.json"
        self.assertTrue(ui_path.is_file())
        self.assertTrue(ux_path.is_file())
        ui = json.loads(ui_path.read_text())
        self.assertGreater(ui["summary"]["failing"], 0)
        ux = json.loads(ux_path.read_text())
        self.assertGreater(ux["summary"]["failing"], 0)

    def test_rubric_failing(self) -> None:
        sys.path.insert(0, str(ROOT))
        from sota.rubric import rubric_failing, min_rubric_score

        scores = {"nav_clarity": 0.45, "task_efficiency": 0.8}
        self.assertTrue(rubric_failing(scores))
        self.assertEqual(min_rubric_score(scores), 0.45)

    def test_tui_demo_fixture_title_line_is_ascii(self) -> None:
        fixture = ROOT / "fixtures" / "tui-demo.sh"
        source = fixture.read_text(encoding="utf-8")
        self.assertNotIn("\u2014", source, "em dash breaks baseline diffs under non-UTF-8 locales")
        self.assertIn("Li TUI demo - press h for help", source)

    def test_tui_demo_fixture_capture_bytes_stable(self) -> None:
        fixture = ROOT / "fixtures" / "tui-demo.sh"
        env = os.environ.copy()
        env["LANG"] = "C"
        proc = subprocess.run(
            ["bash", str(fixture)],
            cwd=str(fixture.parent),
            capture_output=True,
            input=b"\n\n",
            env=env,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr.decode())
        title = b"Li TUI demo - press h for help, q to quit"
        self.assertIn(title, proc.stdout)
        self.assertNotIn(b"\xe2\x80\x94", proc.stdout, "UTF-8 em dash bytes must not appear in captures")


if __name__ == "__main__":
    unittest.main()
