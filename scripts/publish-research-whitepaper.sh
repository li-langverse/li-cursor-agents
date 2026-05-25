#!/usr/bin/env bash
# Rebuild research-findings/index.yaml and SCAN.md from whitepapers/**/artifacts.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LANGVERSE_ROOT="$(cd "${AGENTS_ROOT}/.." && pwd)"
FINDINGS_ROOT="${LI_RESEARCH_FINDINGS_ROOT:-${LANGVERSE_ROOT}/research-findings}"

if [[ ! -d "${FINDINGS_ROOT}/whitepapers" ]]; then
  echo "research-findings not found at ${FINDINGS_ROOT}" >&2
  exit 1
fi

python3 - "${FINDINGS_ROOT}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(sys.argv[1])
entries = []
for artifacts_path in sorted(root.glob("whitepapers/**/artifacts.json")):
    data = json.loads(artifacts_path.read_text())
    rel_dir = artifacts_path.parent.relative_to(root).as_posix()
    entries.append({
        "goal_id": data.get("goal_id", ""),
        "slug": data.get("slug", artifacts_path.parent.name),
        "path": rel_dir,
        "title": data.get("title", ""),
        "agent": data.get("agent", ""),
        "run_id": data.get("run_id", ""),
        "generated_at": data.get("generated_at", ""),
        "domains": data.get("domains", []),
        "validity_grade": data.get("validity_grade", ""),
        "status": data.get("status", "active"),
        "markdown_path": data.get("markdown_path", f"{rel_dir}/README.md"),
        "artifacts_path": artifacts_path.relative_to(root).as_posix(),
    })

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
catalog = {"version": 1, "updated_at": now, "whitepapers": entries}

index_path = root / "index.yaml"
lines = [
    f"version: {catalog['version']}",
    f"updated_at: \"{catalog['updated_at']}\"",
    "whitepapers:",
]
for e in entries:
    lines.append(f"  - goal_id: {e['goal_id']}")
    lines.append(f"    slug: {e['slug']}")
    lines.append(f"    path: {e['path']}")
    safe_title = e["title"].replace('"', "'")
    lines.append(f'    title: "{safe_title}"')
    lines.append(f"    agent: {e['agent']}")
    lines.append(f"    run_id: {e['run_id']}")
    lines.append(f"    generated_at: \"{e['generated_at']}\"")
    dom = ", ".join(e["domains"])
    lines.append(f"    domains: [{dom}]")
    lines.append(f"    validity_grade: {e['validity_grade']}")
    lines.append(f"    status: {e['status']}")
    lines.append(f"    markdown_path: {e['markdown_path']}")
    lines.append(f"    artifacts_path: {e['artifacts_path']}")
index_path.write_text("\n".join(lines) + "\n")

scan_lines = [
    "# Research whitepapers — quick scan",
    "",
    f"_Updated: {now}_ · rebuild: `li-cursor-agents/scripts/publish-research-whitepaper.sh`",
    "",
    "| Status | Grade | Goal | Title | Agent | Run | Path |",
    "|--------|-------|------|-------|-------|-----|------|",
]
for e in sorted(entries, key=lambda x: (x.get("status") != "active", x.get("generated_at", "")), reverse=True):
    scan_lines.append(
        f"| {e['status']} | {e['validity_grade']} | `{e['goal_id']}` | {e['title']} | {e['agent']} | `{e['run_id']}` | `{e['path']}` |"
    )
(root / "SCAN.md").write_text("\n".join(scan_lines) + "\n")
print(f"Wrote {index_path} ({len(entries)} whitepapers)")
print(f"Wrote {root / 'SCAN.md'}")
PY
