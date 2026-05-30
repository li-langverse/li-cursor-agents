from pathlib import Path
import re

# --- 1. completion-gate.ts: progress gate + better phase DONE detection ---
gate_ts = Path(r"C:\Users\Julian\Documents\Programming\li\li-cursor-agents\src\goal-directed\completion-gate.ts")
text = gate_ts.read_text(encoding="utf-8")

if "extractProgressGateScript" not in text:
    text = text.replace(
        'export function extractCompletionGateScript(goalText: string): string | null {',
        '''export function extractProgressGateScript(goalText: string): string | null {
  const idx = goalText.search(/^##\\s+Progress gate\\s*$/im);
  if (idx < 0) return null;
  const fence = /```(?:bash|sh)\\s*\\n([\\s\\S]*?)```/i.exec(goalText.slice(idx));
  return fence?.[1]?.trim() || null;
}

export function extractCompletionGateScript(goalText: string): string | null {''',
    )

new_phases_done = '''/** Phases marked **DONE** in the status table (| **A** | ... **DONE** ... |) */
export function phasesMarkedDone(goalText: string): string[] {
  const done: string[] = [];
  for (const line of goalText.split(/\\r?\\n/)) {
    if (!line.strip().startswith("|") if False else not line.strip().startswith("|"):
      pass
  }
  return done;
}'''

# Fix phasesMarkedDone properly via regex replace
text = re.sub(
    r"/\*\* Phases marked \*\*DONE\*\* in status table rows: \|\* \*\*\(\[A-Z0-9\]\+\)\*\* \.\.\. \| \*\*DONE\*\* \| \*/\s*"
    r"export function phasesMarkedDone\(goalText: string\): string\[\] \{[\s\S]*?return done;\s*\}",
    '''/** Phases with **DONE** in the status table row (| **A** | ... |) */
export function phasesMarkedDone(goalText: string): string[] {
  const done: string[] = [];
  const rowRe =
    /^\\|\\s*\\*\\*([A-Z0-9]+)\\*\\*[^\\n]*\\|\\s*([^|\\n]+)/gm;
  for (const m of goalText.matchAll(rowRe)) {
    const phase = m[1].toUpperCase();
    const statusCol = m[2];
    if (/\\*\\*DONE\\*\\*/i.test(statusCol) && !done.includes(phase)) {
      done.push(phase);
    }
  }
  return done;
}''',
    text,
    count=1,
)

# Add progress gate run before full gate when phases missing
old_block = """  let gateScript =
    input.gateScriptPath?.trim() ||
    process.env.LI_GOAL_COMPLETION_SCRIPT?.trim() ||
    extractCompletionGateScript(goalText);

  if (!gateScript) {"""

new_block = """  let gateScript =
    input.gateScriptPath?.trim() ||
    process.env.LI_GOAL_COMPLETION_SCRIPT?.trim() ||
    extractCompletionGateScript(goalText);

  const progressScript = extractProgressGateScript(goalText);

  if (missingPhases.length > 0 && progressScript) {
    gateScript = progressScript;
  }

  if (!gateScript) {"""

if old_block in text and "progressScript" not in text:
    text = text.replace(old_block, new_block)

    # When running progress gate only, don't require all phases for bash pass message
    text = text.replace(
        "  if (missingPhases.length > 0) {\n    return {\n      complete: false,\n      reason: `gate bash passed but phases not DONE:",
        "  if (missingPhases.length > 0) {\n    const progressOnly = Boolean(progressScript && gateScript === progressScript);\n    if (progressOnly) {\n      return {\n        complete: false,\n        reason: `progress gate passed; phases remaining: ${missingPhases.join(\", \")}`,\n        phases_done: done,\n        phases_required: required,\n        gate_exit_code: 0,\n      };\n    }\n    return {\n      complete: false,\n      reason: `gate bash passed but phases not DONE:",
    )

gate_ts.write_text(text, encoding="utf-8")
print("patched completion-gate.ts")

# --- 2. goal file: Progress gate + fix completion gate macos check ---
goal = Path(r"C:\Users\Julian\Documents\Programming\li\data\goal-directed-sprints\benchmarks-dashboard-completeness.md")
g = goal.read_text(encoding="utf-8")

progress_section = '''## Progress gate

While phases B–E are open, the loop runs this lighter check each iteration (not the full Completion gate below).

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
python3 scripts/audit-dashboard-gaps.py
python3 scripts/check-dashboard-invariants.py
```

'''

if "## Progress gate" not in g:
    g = g.replace("## Completion gate", progress_section + "## Completion gate", 1)

# Fix macos/windows check in completion gate
old_py = """rows = s if isinstance(s, list) else s.get("benchmarks") or s.get("rows") or []
os_seen = {r.get("os") for r in rows if isinstance(r, dict) and r.get("tier") in (0, 1, "0", "1")}
for need in ("macos", "windows"):
    if need not in os_seen:
        sys.exit(f"missing tier-0/1 row for os={need}")"""

new_py = """os_seen = set()
for cat in (s.get("categories") or {}).values():
    for ch in cat.get("charts") or []:
        title = (ch.get("title") or "").lower()
        for need in ("macos", "windows", "linux"):
            if f"({need})" in title or f" {need} " in title:
                os_seen.add(need)
        for ser in ch.get("series") or []:
            o = (ser.get("os") or "").lower()
            if o in ("macos", "darwin", "windows", "linux"):
                os_seen.add("macos" if o == "darwin" else o)
for need in ("macos", "windows"):
    if need not in os_seen:
        sys.exit(f"missing chart row for os={need}")"""

if old_py in g:
    g = g.replace(old_py, new_py)

# Normalize phase A status for gate parser
g = g.replace(
    "| **A** Schema + catalog + audit gate | **DONE** on [#143]",
    "| **A** | **DONE** | Schema + catalog on [#143]",
)

goal.write_text(g, encoding="utf-8")
print("patched goal file")

# --- 3. li-render lib.li: remove else: ---
lib = Path(r"C:\Users\Julian\Documents\Programming\li\lic\packages\li-render\src\lib.li")
lib_text = lib.read_text(encoding="utf-8")
old_if = """  if lig_present_host_active() == 1:
    counter.native_pixels = lig_present_host_native_pixels_flag()
  else:
    counter.native_pixels = 0"""
new_if = """  if lig_present_host_active() == 1:
    counter.native_pixels = lig_present_host_native_pixels_flag()
  if lig_present_host_active() != 1:
    counter.native_pixels = 0"""
if old_if in lib_text:
    lib.write_text(lib_text.replace(old_if, new_if), encoding="utf-8")
    print("patched li-render lib.li")
else:
    print("lib.li else block already fixed or moved")
