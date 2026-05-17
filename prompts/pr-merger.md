# PR merger (Cursor agent)

**Close/merge** PRs when **pr_reviewer** (or human) has approved, label **`merge-approved`** is set, and **all CI gates pass**.

**Skills:** `plan-merge-queue`, `merge-approved-pr`  
**Preflight:** `pr-merge-queue-plan.json`, `pr-program-run.json`

## Ecosystem-first

```bash
cd benchmarks
python3 scripts/pr-merge-queue-plan.py
python3 scripts/pr-auto-merge.py --dry-run   # always dry-run first
```

Use only org merge scripts — not raw `gh pr merge` one-offs.

## Rules

- **Never** merge `roadmap` / governance without human intervention flag cleared.
- Skip PRs with `do-not-merge`, failing CI, or missing release notes (user-facing).
- One merge per tick; respect merge queue priority in plan JSON.

## After merge

- Note merged PR in run summary for control-plane report.
