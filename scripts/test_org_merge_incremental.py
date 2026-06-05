#!/usr/bin/env python3
"""Unit tests for incremental PR queue refresh decisions."""
from __future__ import annotations

import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


def load_merge_module():
    import sys

    path = Path(__file__).resolve().parent / "org-merge-open-prs.py"
    spec = importlib.util.spec_from_file_location("org_merge_open_prs", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


merge = load_merge_module()


class DecideRefreshActionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
        self.priority = {"dirty", "ci_not_ok", "blocked"}

    def test_reuses_fresh_green_pr(self) -> None:
        classified = self.now - timedelta(minutes=10)
        action = merge.decide_refresh_action(
            has_cache=True,
            bucket="green",
            classified_at=classified,
            issue_updated_at=classified,
            head_cached="abc1234",
            head_live=None,
            in_active_claim=False,
            priority=self.priority,
            green_stale_min=60.0,
            now=self.now,
        )
        self.assertEqual(action, "reuse")

    def test_full_for_priority_bucket(self) -> None:
        action = merge.decide_refresh_action(
            has_cache=True,
            bucket="dirty",
            classified_at=self.now - timedelta(minutes=5),
            issue_updated_at=self.now - timedelta(minutes=5),
            head_cached="abc1234",
            head_live=None,
            in_active_claim=False,
            priority=self.priority,
            green_stale_min=60.0,
            now=self.now,
        )
        self.assertEqual(action, "full")

    def test_lightweight_when_issue_touched(self) -> None:
        classified = self.now - timedelta(minutes=30)
        updated = self.now - timedelta(minutes=5)
        action = merge.decide_refresh_action(
            has_cache=True,
            bucket="green",
            classified_at=classified,
            issue_updated_at=updated,
            head_cached="abc1234",
            head_live=None,
            in_active_claim=False,
            priority=self.priority,
            green_stale_min=60.0,
            now=self.now,
        )
        self.assertEqual(action, "lightweight")

    def test_full_when_head_changed(self) -> None:
        action = merge.decide_refresh_action(
            has_cache=True,
            bucket="green",
            classified_at=self.now - timedelta(minutes=10),
            issue_updated_at=self.now - timedelta(minutes=5),
            head_cached="abc1234",
            head_live="def5678deadbeef",
            in_active_claim=False,
            priority=self.priority,
            green_stale_min=60.0,
            now=self.now,
        )
        self.assertEqual(action, "full")


if __name__ == "__main__":
    unittest.main()
