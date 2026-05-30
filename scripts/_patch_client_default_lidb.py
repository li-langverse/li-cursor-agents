#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/db/client.ts"
t = p.read_text(encoding="utf-8")
t = t.replace(
    "/** Control-plane persistence backend. Default: supabase. */",
    "/** Control-plane persistence backend. Default: lidb (native embed). */",
)
t = t.replace(
    " * - `LI_CONTROL_PLANE_STORE=supabase|disk|lidb` (default supabase)",
    " * - `LI_CONTROL_PLANE_STORE=supabase|disk|lidb` (default lidb)",
)
t = t.replace('  return "supabase";\n}', '  return "lidb";\n}')
t = t.replace(
    "LI_CONTROL_PLANE_STORE=supabase (default) but Supabase is not configured.",
    "LI_CONTROL_PLANE_STORE=supabase but Supabase is not configured.",
)
p.write_text(t, encoding="utf-8")
print("patched client.ts default lidb")
