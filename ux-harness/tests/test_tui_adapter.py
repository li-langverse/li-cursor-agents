#!/usr/bin/env python3
"""Tests for TUI adapter non-interactive harness and journey execution."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent


class TuiAdapterTests(unittest.TestCase):
    def test_tui_app_fixture_ui_completes_quickly(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "tui-app-fixture",
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
        self.assertFalse(target.get("timeout"))

    def test_tui_app_fixture_ux_runs_journeys(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "tui-app-fixture",
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
        journeys = target.get("journeys") or []
        self.assertGreater(len(journeys), 0)
        key_nav = next(j for j in journeys if j.get("id") == "key_nav_help")
        self.assertTrue(key_nav.get("completed"))
        self.assertEqual(len(key_nav.get("step_trace") or []), 3)
        artifacts = target.get("artifacts") or []
        self.assertTrue(any("journey-log.json" in a for a in artifacts))

    def test_tui_gen_fixture_ux_journey(self) -> None:
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "run_audit.py"),
                "--target",
                "tui-gen-fixture",
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
        journeys = target.get("journeys") or []
        self.assertEqual(journeys[0]["id"], "cli_to_tui")
        self.assertTrue(journeys[0].get("completed"))


if __name__ == "__main__":
    unittest.main()
