#!/usr/bin/env python3
"""Capture Playwright screenshot baselines for web_gui HTML fixtures."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.web_gui_playwright import (  # noqa: E402
    FIXTURE_CAPTURES,
    VIEWPORTS,
    baselines_dir,
    serve_fixture_dir,
)


def _fixture_for_target(target_id: str) -> Path | None:
    manifest = json.loads((AGENTS_ROOT / "config" / "ux-targets.json").read_text(encoding="utf-8"))
    for t in manifest.get("targets", []):
        if t.get("id") == target_id and t.get("fixture"):
            p = Path(str(t["fixture"]))
            if not p.is_absolute():
                p = (AGENTS_ROOT / p).resolve()
            return p if p.is_file() else None
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture web_gui fixture baselines")
    parser.add_argument("--target", required=True, choices=sorted(FIXTURE_CAPTURES.keys()))
    args = parser.parse_args()

    fixture = _fixture_for_target(args.target)
    if fixture is None:
        print(f"fixture not found for target {args.target}", file=sys.stderr)
        return 1

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — pip install playwright && playwright install chromium", file=sys.stderr)
        return 1

    out_dir = baselines_dir(args.target, AGENTS_ROOT)
    out_dir.mkdir(parents=True, exist_ok=True)
    viewports = FIXTURE_CAPTURES[args.target]

    with serve_fixture_dir(fixture) as url, sync_playwright() as p:
        browser = p.chromium.launch()
        for vp_name in viewports:
            width, height = VIEWPORTS[vp_name]
            page = browser.new_page(viewport={"width": width, "height": height})
            page.goto(url, wait_until="networkidle")
            shot_path = out_dir / f"home-{vp_name}.png"
            page.screenshot(path=str(shot_path), full_page=True)
            page.close()
            print(f"wrote {shot_path}")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
