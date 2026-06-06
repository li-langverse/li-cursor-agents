#!/usr/bin/env python3
"""Unit tests for docs Playwright adapter and pixel diff (CI-safe)."""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))

from adapters.pixel_diff import pixel_diff_ratio, read_png_rgb  # noqa: E402


def _write_docs_fixture(root: Path) -> None:
    spec = importlib.util.spec_from_file_location(
        "docs_fixture_gen", ROOT / "fixtures" / "docs-site" / "generate.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.write_docs_fixture(root)


class PixelDiffTests(unittest.TestCase):
    def test_identical_pngs_zero_diff(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            baseline = ROOT / "baselines" / "docs" / "home-desktop.png"
            if not baseline.is_file():
                self.skipTest("docs baselines not seeded")
            current = Path(tmp) / "copy.png"
            current.write_bytes(baseline.read_bytes())
            self.assertEqual(pixel_diff_ratio(baseline, current), 0.0)
            w, h, rgb = read_png_rgb(baseline)
            self.assertGreater(w, 0)
            self.assertGreater(h, 0)
            self.assertEqual(len(rgb), w * h * 3)


class DocsPlaywrightTests(unittest.TestCase):
    def test_playwright_audit_populates_artifacts(self) -> None:
        try:
            import playwright  # noqa: F401
        except ImportError:
            self.skipTest("playwright not installed")

        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "site"
            baseline_dir = Path(tmp) / "baselines"
            _write_docs_fixture(site)
            (Path(tmp) / "mkdocs.yml").write_text("site_url: http://127.0.0.1/\n", encoding="utf-8")
            env = {
                **os.environ,
                "LI_DOCS_PLAYWRIGHT": "1",
                "LI_DOCS_BASELINES_DIR": str(baseline_dir),
                "LIC_ROOT": str(Path(tmp)),
            }
            proc = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "capture-docs-baselines.py"),
                    "--site-dir",
                    str(site),
                ],
                cwd=str(AGENTS_ROOT),
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)

            proc2 = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "run_audit.py"),
                    "--target",
                    "lic-docs",
                    "--mode",
                    "ui",
                    "--out-dir",
                    str(Path(tmp) / "out"),
                ],
                cwd=str(AGENTS_ROOT),
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
            self.assertEqual(proc2.returncode, 0, proc2.stderr)
            import json

            ui = json.loads((Path(tmp) / "out" / "ui-audit.json").read_text())
            target = ui["targets"][0]
            self.assertGreater(len(target["artifacts"]), 0)
            self.assertEqual(target["mode"], "playwright")
            self.assertEqual(target["status"], "pass")
            self.assertLessEqual(target["pixel_diff"]["max_ratio"], target["pixel_diff"]["threshold"])

    def test_pixel_diff_fails_on_css_change(self) -> None:
        try:
            import playwright  # noqa: F401
        except ImportError:
            self.skipTest("playwright not installed")

        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "site"
            baseline_dir = Path(tmp) / "baselines"
            _write_docs_fixture(site)
            (Path(tmp) / "mkdocs.yml").write_text("site_url: http://127.0.0.1/\n", encoding="utf-8")
            env = {
                **os.environ,
                "LI_DOCS_PLAYWRIGHT": "1",
                "LI_DOCS_BASELINES_DIR": str(baseline_dir),
                "LIC_ROOT": str(Path(tmp)),
            }
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "capture-docs-baselines.py"),
                    "--site-dir",
                    str(site),
                ],
                cwd=str(AGENTS_ROOT),
                check=True,
                env=env,
            )
            # Drift theme CSS
            index = site / "index.html"
            index.write_text(
                index.read_text(encoding="utf-8").replace("#4051b5", "#ff0000"),
                encoding="utf-8",
            )
            proc = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "run_audit.py"),
                    "--target",
                    "lic-docs",
                    "--mode",
                    "ui",
                ],
                cwd=str(AGENTS_ROOT),
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
            self.assertEqual(proc.returncode, 0)
            payload = __import__("json").loads(proc.stdout)
            target = payload["ui"]["targets"][0]
            self.assertEqual(target["status"], "fail")
            self.assertEqual(target["baseline_status"], "drift")
            self.assertGreater(target["pixel_diff"]["max_ratio"], target["pixel_diff"]["threshold"])


if __name__ == "__main__":
    unittest.main()
