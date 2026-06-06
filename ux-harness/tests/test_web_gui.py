#!/usr/bin/env python3
"""Unit tests for web_gui adapter (offline fixture fallback)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.base import TargetConfig  # noqa: E402
from adapters.web_gui import run_web_gui_ui, run_web_gui_ux  # noqa: E402


def _agents_dashboard_target() -> TargetConfig:
    return TargetConfig.from_dict(
        {
            "id": "agents-dashboard",
            "repo": "li-cursor-agents",
            "surface": "gui",
            "surface_class": "gui_app",
            "adapter": "web_gui",
            "url": "http://127.0.0.1:3099",
            "offline_fixture": "ux-harness/fixtures/agents-dashboard-empty.html",
            "journeys": [
                {"id": "agents_list_empty", "steps": ["open_agents", "check_empty_state"]},
                {"id": "live_stream", "steps": ["open_run", "read_stream"]},
            ],
        }
    )


class WebGuiAdapterTests(unittest.TestCase):
    def test_offline_fixture_fallback_when_server_down(self) -> None:
        target = _agents_dashboard_target()
        ui = run_web_gui_ui(target, AGENTS_ROOT, mock=False)
        self.assertEqual(ui["status"], "pass")
        self.assertTrue(ui.get("fixture_fallback"))
        self.assertEqual(ui.get("mode"), "fixture_fallback")
        self.assertIn("offline fixture", ui.get("skip_reason", "").lower())

        ux = run_web_gui_ux(target, AGENTS_ROOT, mock=False)
        self.assertEqual(ux["status"], "pass")
        self.assertTrue(ux.get("fixture_fallback"))
        self.assertGreaterEqual(ux["rubric_scores"]["empty_states"], 0.8)
        journey_ids = [j["id"] for j in ux["journeys"]]
        self.assertIn("agents_list_empty", journey_ids)
        agents_journey = next(j for j in ux["journeys"] if j["id"] == "agents_list_empty")
        self.assertTrue(agents_journey["completed"])

    def test_primary_fixture_without_url_probe(self) -> None:
        target = TargetConfig.from_dict(
            {
                "id": "gui-gen-fixture",
                "repo": "li-cursor-agents",
                "surface": "gui",
                "surface_class": "gui_gen",
                "adapter": "web_gui",
                "fixture": "ux-harness/fixtures/gui-gen-demo.html",
                "journeys": [{"id": "gen_preview_loop", "steps": ["prompt", "preview", "edit"]}],
            }
        )
        ui = run_web_gui_ui(target, AGENTS_ROOT, mock=False)
        self.assertEqual(ui["status"], "pass")
        self.assertEqual(ui.get("mode"), "fixture")
        self.assertNotIn("fixture_fallback", ui)


if __name__ == "__main__":
    unittest.main()
