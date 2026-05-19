#!/usr/bin/env python3
"""E2E fixture briefing — includes ui_audit / ux_audit for UX tester agents."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LATEST = ROOT / "data" / "latest"
OUT = LATEST / "agent-briefing.json"


def load_json(name: str) -> dict | None:
    path = LATEST / name
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    if os.environ.get("E2E_BRIEFING_PRESERVE") == "1" and OUT.is_file():
        print(json.dumps({"ok": True, "path": str(OUT), "preserved": True}))
        return 0

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from heap_plan import build_heap_plan  # noqa: E402

    rec = [
        {"agent": "docs_ui_tester", "reason": "e2e: ui-audit docs failures"},
        {"agent": "gui_ux_tester", "reason": "e2e: ux-audit gui friction"},
    ]
    data = {
        "generated_at": "2026-05-19T12:00:00Z",
        "recommended_agents": rec,
        "ui_audit": load_json("ui-audit.json"),
        "ux_audit": load_json("ux-audit.json"),
        "implementation_queue": load_json("implementation_queue.json") or {"work_queue": [], "sources": []},
        "org_roadmap": {
            "vision_url": "https://github.com/li-langverse/roadmap",
            "pillars": ["provable"],
            "loaded_at": "e2e",
        },
        "heap_plan": build_heap_plan(rec),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "path": str(OUT)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
