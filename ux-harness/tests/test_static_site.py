#!/usr/bin/env python3
"""Unit tests for static-site docs adapter helpers."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(ROOT))

from adapters.static_site import audit_static_site  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
