#!/usr/bin/env python3
"""Count open issues in li-langverse org (GitLab primary)."""
from __future__ import annotations

import argparse
import json
import sys

from _vcs_issue_api import search_open_issues


def count_open() -> int:
    return len(search_open_issues())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--require-zero", action="store_true")
    args = ap.parse_args()
    c = count_open()
    if args.json:
        print(json.dumps({"open_issues": c}))
    else:
        print(f"org-issue-zero: open_issues={c}")
    if args.require_zero:
        sys.exit(0 if c == 0 else 1)


if __name__ == "__main__":
    main()
