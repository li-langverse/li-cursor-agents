#!/usr/bin/env python3
"""E2E fixture stub — copies prebuilt ui-audit.json / ux-audit.json."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LATEST = ROOT / "data" / "latest"


def main() -> int:
    for name in ("ui-audit.json", "ux-audit.json"):
        src = LATEST / name
        if not src.is_file():
            print(f"missing fixture {src}", file=sys.stderr)
            return 1
    print(json.dumps({"ok": True, "fixtures": ["ui-audit.json", "ux-audit.json"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
