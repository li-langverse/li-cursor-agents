#!/usr/bin/env python3
"""Capture lic-docs PNG baselines via Playwright (extended audit / baseline refresh)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from adapters.docs_playwright import CAPTURES, VIEWPORTS, baselines_dir, serve_site  # noqa: E402
from adapters.static_site import resolve_site_dir  # noqa: E402


def _open_mobile_drawer(page) -> None:
    for selector in (
        'label[for="__drawer"]',
        ".md-nav__button",
        'button[aria-label="Open navigation"]',
    ):
        loc = page.locator(selector).first
        if loc.count() > 0:
            loc.click()
            page.wait_for_timeout(200)
            return


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture lic-docs UI baselines")
    parser.add_argument(
        "--site-dir",
        help="Built MkDocs site directory (default: LIC_ROOT/site or ../lic/site)",
    )
    parser.add_argument(
        "--fixture",
        action="store_true",
        help="Use ux-harness/fixtures/docs-site instead of lic build",
    )
    args = parser.parse_args()

    agents_root = ROOT.parent
    if args.fixture:
        fixture = ROOT / "fixtures" / "docs-site"
        import importlib.util

        spec = importlib.util.spec_from_file_location("docs_fixture_gen", fixture / "generate.py")
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.write_docs_fixture(fixture)
        site_dir = fixture
    elif args.site_dir:
        site_dir = Path(args.site_dir).resolve()
    else:
        lic_root = os.environ.get("LIC_ROOT")
        if lic_root:
            site_dir = Path(lic_root).resolve() / "site"
        else:
            site_dir = resolve_site_dir(agents_root, "../lic/site")

    if not (site_dir / "index.html").is_file():
        print(f"site not built: {site_dir}", file=sys.stderr)
        return 1

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — pip install playwright && playwright install chromium", file=sys.stderr)
        return 1

    out_dir = baselines_dir(agents_root)
    out_dir.mkdir(parents=True, exist_ok=True)

    with serve_site(site_dir) as base_url, sync_playwright() as p:
        browser = p.chromium.launch()
        for slug, (rel_path, viewports, setup) in CAPTURES.items():
            url = f"{base_url}/{rel_path.lstrip('/')}"
            for vp_name in viewports:
                width, height = VIEWPORTS[vp_name]
                page = browser.new_page(viewport={"width": width, "height": height})
                page.goto(url, wait_until="networkidle")
                if setup == "open_drawer":
                    _open_mobile_drawer(page)
                out_path = out_dir / f"{slug}-{vp_name}.png"
                page.screenshot(path=str(out_path), full_page=True)
                page.close()
                print(f"wrote {out_path}")
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
