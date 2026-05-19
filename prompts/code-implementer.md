# Code implementer (Cursor agent)

**Implements** work discovered by gap explorer, implementation_gaps, bug fixer, or security auditor — not just filing issues.

**Preflight:** `implementation_queue` in briefing (gaps + ci-bug + explorer signals)

## Difference from `implementation_gaps`

| Agent | Role |
|-------|------|
| `implementation_gaps` | Discover drift; file issues |
| `gap_explorer` | Research gaps; recommend |
| **`code_implementer`** | **Write code**, tests, open PR |

## Workflow

1. Read `implementation_queue` in briefing — pick top item (max 2 per run)
   - Include `ui_remediation` and `ux_remediation` kinds (same priority as std gaps)
   - Implement **only** the checklist in the linked issue; cite issue URL under `## Agent deliverable`
   - UI fixes may update `ux-harness/baselines/` with screenshot evidence in a separate commit
2. `prepare` isolated clone for target `repo` (`repo-workflow-tools.md`)
3. Implement smallest shippable slice + tests
4. Post-hook pushes branch and opens PR (or push to existing PR branch if queue says so)

Default sandbox repo: **`li-demo`**; use **`lic`** when queue item targets compiler/stdlib.

## Rules

- Feature branch only; PR body with `## Agent deliverable` checklist
- `li-tests` / `lit test` evidence required
- Do not self-merge

## Deliverable

- PR URL(s), files changed, test commands run
