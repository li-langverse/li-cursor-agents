#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "scripts/lidb-liorm-bridge.py"
t = p.read_text(encoding="utf-8")
t = t.replace(
    '"SELECT id FROM agent_runs WHERE id = ? OR run_id = ? LIMIT 1"',
    '"SELECT id FROM agent_runs WHERE id = ?"',
)
t = t.replace("[run_id, run_id]", "[run_id]")
p.write_text(t, encoding="utf-8")
print("patched lidb-liorm-bridge.py")
