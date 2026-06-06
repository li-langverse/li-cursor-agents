#!/usr/bin/env python3
"""Tests for web_gui adapter fixture fallback and journey execution."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent


class WebGuiAdapterTests(unittest.TestCase):
    def test_agents_dashboard_ux_fixture_fallback_when_offline(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "agents-dashboard",
                "--mode",
                "ux",
            ],
            cwd=str(AGENTS_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        target = payload["ux"]["targets"][0]
        self.assertEqual(target["status"], "pass")
        self.assertTrue(target.get("fixture_fallback"))
        self.assertEqual(target.get("mode"), "fixture_fallback")

        journeys = target.get("journeys") or []
        empty = next(j for j in journeys if j.get("id") == "agents_list_empty")
        self.assertTrue(empty.get("completed"))
        self.assertEqual(len(empty.get("step_trace") or []), 2)

        rubric = target.get("rubric_scores") or {}
        self.assertGreaterEqual(rubric.get("empty_states", 0), 0.8)

        artifacts = target.get("artifacts") or []
        self.assertTrue(any("journey-log.json" in a for a in artifacts))

    def test_agents_dashboard_ui_fixture_fallback_when_offline(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "agents-dashboard",
                "--mode",
                "ui",
            ],
            cwd=str(AGENTS_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        target = payload["ui"]["targets"][0]
        self.assertEqual(target["status"], "pass")
        self.assertTrue(target.get("fixture_fallback"))

    def test_gui_gen_fixture_still_passes(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "gui-gen-fixture",
                "--mode",
                "ux",
            ],
            cwd=str(AGENTS_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        target = payload["ux"]["targets"][0]
        self.assertEqual(target["status"], "pass")
        self.assertEqual(target.get("mode"), "fixture")
        self.assertNotIn("fixture_fallback", target)


if __name__ == "__main__":
    unittest.main()
