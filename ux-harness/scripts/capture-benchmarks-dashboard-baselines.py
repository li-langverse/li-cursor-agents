#!/usr/bin/env python3
"""Capture benchmarks-dashboard PNG baselines via Playwright (optional extended CI)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "baselines" / "benchmarks-dashboard"
PORT = os.environ.get("LI_BENCHMARKS_DASHBOARD_PORT", "3100")
BASE_PATH = os.environ.get("NEXT_PUBLIC_BASE_PATH", "")

VIEWPORTS: dict[str, tuple[int, int]] = {
    "desktop-1280x720": (1280, 720),
    "desktop-1920x1080": (1920, 1080),
    "mobile-390x844": (390, 844),
}

ROUTES = [
    ("home", "/"),
    ("gpu-matrix", "/gpu-matrix/"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture benchmarks-dashboard baselines")
    parser.add_argument("--base-url", default=f"http://127.0.0.1:{PORT}{BASE_PATH}")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — skip capture", file=sys.stderr)
        return 0

    base_url = args.base_url.rstrip("/")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for vp_name, (width, height) in VIEWPORTS.items():
            out_dir = BASE / vp_name
            out_dir.mkdir(parents=True, exist_ok=True)
            page = browser.new_page(viewport={"width": width, "height": height})
            for slug, route in ROUTES:
                page.goto(f"{base_url}{route}", wait_until="networkidle")
                page.screenshot(path=str(out_dir / f"{slug}.png"), full_page=True)
            page.close()
        browser.close()
    print(f"wrote baselines under {BASE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
