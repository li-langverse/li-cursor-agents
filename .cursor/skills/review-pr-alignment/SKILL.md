---
name: review-pr-alignment
description: >-
  Check open PRs against plan-approved labels, merge queue order, vision/PH
  traceability, and redundant stacks. Agent reasoning — use with pr-alignment-agent.
---

# Review PR alignment

Use for **PR alignment agent** and before adding `merge-approved`.

## Preflight

```bash
python3 scripts/pr-merge-queue-plan.py
python3 scripts/run-pr-program.py
cat data/latest/pr-merge-queue-plan.json
```

## Checklist (each PR)

| # | Question |
|---|----------|
| 1 | Feature work? → needs `plan-approved`, not only `plan-needed` |
| 2 | In `redundant` list? → close, don't merge |
| 3 | Correct merge order vs `merge_first`? |
| 4 | Linked issue / PH / PKG in body? |
| 5 | Scope matches title (no drive-by)? |
| 6 | Depends on unmerged PR? → block until dependency merges |

## Verdicts

- **aligned** — ready for `pr-review-agent`
- **needs plan** — comment + `plan-needed`
- **superseded** — close with pointer
- **defer** — wait for dependency CI

## Do not

Merge or add `merge-approved` here — use `merge-approved-pr` after standards review.
