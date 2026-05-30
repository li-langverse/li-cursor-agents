---
name: run-goal-directed-loop
description: >-
  Run markdown goal plans with a Completion gate and goal-directed-loop.sh until
  the gate passes. Use for sprint goal files, phase status tables, and autonomous
  code_implementer / bug_fixer loops without YAML plan-loop.py.
---

# Goal-directed loop (markdown plans)

Three steps:

1. **Write the plan** — Markdown goal file with phased deliverables (`### Phase A` …), a **phase status table** (`| **A** | **DONE** |`), and a `## Completion gate` section containing a `bash` code block (repo verification commands).
2. **Run the loop** — From `li-cursor-agents`:

   ```bash
   ./scripts/goal-directed-loop.sh --goal-file ../data/goal-directed-sprints/your-goal.md \
     --agent code_implementer --workflow-repo lic --cwd ../lic --max 12
   ```

   Optional: `--until-local 08:00` for a morning deadline. Omit `--once` to loop (default cap 999 iterations).

3. **Stop when the gate passes** — `goal-completion-gate.js` runs the bash block and requires every phase row to be **DONE**. The loop exits 0 only then; deadline or `--max` without gate success exits 1.

Env: `CURSOR_API_KEY`, `LI_GOAL_LOOP_STRICT_EXIT=1` (set by the loop), optional `BENCHMARKS_ROOT`.