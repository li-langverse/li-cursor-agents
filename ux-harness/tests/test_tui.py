#!/usr/bin/env python3
"""Tests for TUI adapter stdout capture and baseline diff."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.base import TargetConfig  # noqa: E402
from adapters.tui import run_tui_ui  # noqa: E402
from adapters.tui_baseline import compare_stdout_baseline, normalize_stdout  # noqa: E402


def _tui_target(target_id: str, fixture: str) -> TargetConfig:
    return TargetConfig(
        id=target_id,
        repo="li-cursor-agents",
        surface="tui",
        surface_class="tui_gen" if "gen" in target_id else "tui_app",
        adapter="tui",
        raw={"fixture": fixture},
    )


class TuiAdapterTests(unittest.TestCase):
    def test_gen_fixture_captures_stdout_artifact(self) -> None:
        target = _tui_target("tui-gen-fixture", "ux-harness/fixtures/tui-gen-demo.sh")
        out = run_tui_ui(target, AGENTS_ROOT, mock=False)
        self.assertEqual(out["status"], "pass")
        self.assertGreaterEqual(len(out["artifacts"]), 1)
        capture = Path(out["artifacts"][0])
        self.assertTrue(capture.is_file())
        self.assertIn("li-tui-gen", capture.read_text(encoding="utf-8"))
        self.assertEqual(out["baseline_status"], "ok")
        self.assertEqual(out["pixel_diff"]["max_ratio"], 0.0)

    def test_app_fixture_captures_stdout_artifact(self) -> None:
        target = _tui_target("tui-app-fixture", "ux-harness/fixtures/tui-demo.sh")
        out = run_tui_ui(target, AGENTS_ROOT, mock=False)
        self.assertEqual(out["status"], "pass")
        self.assertGreaterEqual(len(out["artifacts"]), 1)
        capture = Path(out["artifacts"][0])
        self.assertTrue(capture.is_file())
        self.assertIn("Goodbye.", capture.read_text(encoding="utf-8"))
        self.assertEqual(out["baseline_status"], "ok")
        self.assertEqual(out["pixel_diff"]["max_ratio"], 0.0)

    def test_layout_drift_records_pixel_diff(self) -> None:
        baseline = ROOT / "baselines" / "tui-gen-fixture" / "stdout.txt"
        self.assertTrue(baseline.is_file())
        drifted = "li-tui-gen v0 (fixture)\n┌ broken layout ─┐\n│ drifted panel  │\n└────────────────┘\n"
        diff = compare_stdout_baseline(drifted, baseline)
        self.assertGreater(diff["pixel_diff"]["max_ratio"], diff["pixel_diff"]["threshold"])
        self.assertEqual(diff["baseline_status"], "drift")

    def test_audit_json_includes_artifacts_for_both_fixtures(self) -> None:
        out_dir = ROOT / "artifacts" / "test-tui-out"
        out_dir.mkdir(parents=True, exist_ok=True)
        results: list[dict] = []
        for tid in ("tui-gen-fixture", "tui-app-fixture"):
            proc = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "run_audit.py"),
                    "--target",
                    tid,
                    "--mode",
                    "ui",
                ],
                cwd=str(AGENTS_ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            payload = json.loads(proc.stdout)
            results.append(payload["ui"]["targets"][0])
        for row in results:
            self.assertGreaterEqual(len(row["artifacts"]), 1)
            self.assertTrue(Path(row["artifacts"][0]).is_file())
            self.assertEqual(row["status"], "pass")

    def test_normalize_stdout_strips_trailing_blank_lines(self) -> None:
        self.assertEqual(normalize_stdout("a\nb\n\n\n"), "a\nb\n")


if __name__ == "__main__":
    unittest.main()
