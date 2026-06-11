#!/usr/bin/env bash
# List open catalog entry ids assigned to this proof-explorer shard.
set -euo pipefail
ROOT="${LIC_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$ROOT"
IDX="${LI_PROOF_EXPLORER_SHARD_INDEX:-0}"
TOTAL="${LI_PROOF_EXPLORER_SHARD_TOTAL:-1}"
python3 - <<PY
import os, re, pathlib
idx = int(os.environ.get("LI_PROOF_EXPLORER_SHARD_INDEX", "0"))
total = max(1, int(os.environ.get("LI_PROOF_EXPLORER_SHARD_TOTAL", "1")))
entries = pathlib.Path("docs/verification/proof-database/entries")
opens = []
for path in sorted(entries.glob("*.toml")):
    text = path.read_text(encoding="utf-8", errors="ignore")
    for block in re.split(r"\[\[entry\]\]", text)[1:]:
        if 'proof_status = "open"' not in block:
            continue
        m = re.search(r'id\s*=\s*"([^"]+)"', block)
        if not m:
            continue
        eid = m.group(1)
        if sum(ord(c) for c in eid) % total == idx:
            opens.append(eid)
print(f"wp-p15-shard-tranche: shard {idx}/{total} open={len(opens)}")
for eid in opens[:40]:
    print(f"  {eid}")
if len(opens) > 40:
    print(f"  ... and {len(opens) - 40} more")
PY
