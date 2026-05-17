#!/usr/bin/env python3
"""E2E preflight — fixture briefing + heap_plan + org_roadmap."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT.parent
OUT = ROOT / "data" / "latest" / "agent-briefing.json"
VARIANT = os.environ.get("E2E_BRIEFING_VARIANT", "v1")
NAME = "e2e-swarm-briefing.json" if VARIANT == "v1" else "e2e-swarm-briefing-v2.json"
SRC = FIXTURES / NAME


def main() -> int:
    if not SRC.is_file():
        print(f"missing fixture: {SRC}", file=sys.stderr)
        return 1
    data = json.loads(SRC.read_text(encoding="utf-8"))
    data["org_roadmap"] = {
        "loaded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "vision_url": "https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/vision-and-roadmap.md",
        "engineering_standards_url": "https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/engineering-standards.md",
        "master_plan_url": "https://github.com/li-langverse/lic/blob/main/docs/superpowers/plans/2026-05-14-li-master-plan.md",
        "pillars": ["easy", "ai-first", "secure", "provable", "blazingly-fast"],
        "current_ph": "PH-7e (e2e fixture)",
        "master_plan_open_items": 0,
    }
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from heap_plan import build_heap_plan

    rec = data.get("recommended_agents") or []
    data["heap_plan"] = build_heap_plan(rec)
    data.setdefault("implementation_queue", {"work_queue": [], "sources": []})
    data["swarm_scorecard"] = {
        "pending_handoffs": 0,
        "pending_placement": 0,
        "ready_to_implement": 0,
        "by_domain": {"ecosystem": 1},
        "active_research_session": None,
        "research_lane_enabled": True,
        "implement_lane_enabled": True,
    }
    data["research_goals_status"] = [
        {
            "goal_id": "provability_holes",
            "title": "Proof gaps (fixture)",
            "agent": "proof_gap_researcher",
            "priority": 9,
            "eligible": True,
        }
    ]
    data["provability_scorecard"] = {
        "open_plan_findings": 0,
        "provability_goal_priority": 9,
        "trigger_goal_id": "provability_holes",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} from {NAME} (+ heap)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
