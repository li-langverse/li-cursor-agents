#!/usr/bin/env python3
"""Run UI/UX audits for internal targets. See README.md."""
from __future__ import annotations

import argparse
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AGENTS_ROOT = ROOT.parent
DEFAULT_MANIFEST = AGENTS_ROOT / "config" / "ux-targets.json"

sys.path.insert(0, str(ROOT))

from adapters.base import TargetConfig, should_skip_platform  # noqa: E402
from adapters.mock_data import mock_ui_result, mock_ux_result  # noqa: E402


def load_targets(manifest: Path) -> list[TargetConfig]:
    data = json.loads(manifest.read_text(encoding="utf-8"))
    return [TargetConfig.from_dict(t) for t in data.get("targets", [])]


def run_ui(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    skip = should_skip_platform(target)
    if skip:
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": skip,
        }
    if mock:
        return mock_ui_result(target, str(agents_root))
    # Real adapters: extend with Playwright/Xvfb when deps available
    return mock_ui_result(target, str(agents_root))


def run_ux(target: TargetConfig, agents_root: Path, mock: bool) -> dict:
    skip = should_skip_platform(target)
    if skip:
        return {
            "target_id": target.id,
            "repo": target.repo,
            "surface": target.surface,
            "surface_class": target.surface_class,
            "status": "skip",
            "skip_reason": skip,
        }
    if mock:
        return mock_ux_result(target, str(agents_root))
    return mock_ux_result(target, str(agents_root))


def aggregate(results: list[dict]) -> dict:
    failing = [r for r in results if r.get("status") == "fail"]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "platform": platform.system(),
        "summary": {
            "total": len(results),
            "failing": len(failing),
            "passing": sum(1 for r in results if r.get("status") == "pass"),
            "skipped": sum(1 for r in results if r.get("status") == "skip"),
        },
        "targets": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Li UX audit harness")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--target", help="Single target id")
    parser.add_argument("--mode", choices=["ui", "ux", "both"], default="both")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--mock", action="store_true", help="Fixture data for CI")
    parser.add_argument("--out-dir", type=Path, help="Write ui-audit.json / ux-audit.json here")
    args = parser.parse_args()

    targets = load_targets(args.manifest)
    if args.target:
        targets = [t for t in targets if t.id == args.target]
        if not targets:
            print(f"unknown target: {args.target}", file=sys.stderr)
            return 1

    if not args.all and not args.target:
        parser.error("specify --all or --target")

    ui_results: list[dict] = []
    ux_results: list[dict] = []

    for t in targets:
        if args.mode in ("ui", "both"):
            ui_results.append(run_ui(t, AGENTS_ROOT, args.mock))
        if args.mode in ("ux", "both"):
            ux_results.append(run_ux(t, AGENTS_ROOT, args.mock))

    out_dir = args.out_dir
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        if ui_results:
            (out_dir / "ui-audit.json").write_text(
                json.dumps(aggregate(ui_results), indent=2) + "\n", encoding="utf-8"
            )
        if ux_results:
            (out_dir / "ux-audit.json").write_text(
                json.dumps(aggregate(ux_results), indent=2) + "\n", encoding="utf-8"
            )

    payload = {"ui": aggregate(ui_results) if ui_results else None, "ux": aggregate(ux_results) if ux_results else None}
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
