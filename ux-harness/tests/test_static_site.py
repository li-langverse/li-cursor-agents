#!/usr/bin/env python3
"""Unit tests for static-site docs adapter helpers."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

from adapters.static_site import audit_static_site, site_url_path_prefix  # noqa: E402


class StaticSiteTests(unittest.TestCase):
    def test_missing_site_not_built(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            audit = audit_static_site(Path(tmp))
            self.assertFalse(audit["built"])
            self.assertIn("not built", audit["skip_reason"])

    def test_broken_internal_link_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text(
                '<a href="missing.html">bad</a>',
                encoding="utf-8",
            )
            audit = audit_static_site(root)
            self.assertTrue(audit["built"])
            self.assertEqual(audit["broken_links"], 1)

    def test_unquoted_href_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text(
                '<a href=page/index.html>ok</a><a href=missing.html>bad</a>',
                encoding="utf-8",
            )
            (root / "page").mkdir()
            (root / "page" / "index.html").write_text("<html></html>", encoding="utf-8")
            audit = audit_static_site(root, site_prefix="/")
            self.assertTrue(audit["built"])
            self.assertGreater(audit["links_checked"], 0)
            self.assertEqual(audit["broken_links"], 1)

    def test_site_url_prefix_resolves(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text("<html></html>", encoding="utf-8")
            (root / "docs").mkdir()
            (root / "docs" / "index.html").write_text(
                '<a href=/li-language/docs/index.html>home</a>',
                encoding="utf-8",
            )
            audit = audit_static_site(root, site_prefix="/li-language/")
            self.assertEqual(audit["links_checked"], 1)
            self.assertEqual(audit["broken_links"], 0)


if __name__ == "__main__":
    unittest.main()
