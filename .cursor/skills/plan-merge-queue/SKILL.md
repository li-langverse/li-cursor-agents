---
name: plan-merge-queue
description: >-
  Decide which li-langverse PRs to merge first, detect stacked branches and
  redundant PRs before auto-merge. Use before pr-auto-merge-sweep or adding
  merge-approved labels in bulk.
---

# Plan merge queue

Run **before** `pr-auto-merge.py --execute` or org-wide sweep so you do not merge the wrong PR first or leave superseded PRs open.

## Script (source of truth)

```bash
python3 scripts/pr-merge-queue-plan.py
cat data/latest/pr-merge-queue-plan.json
```

Options: `--repo lic`, `--json`

## Read the report

| Field | Meaning |
|-------|---------|
| `merge_first` | Best next PR with `merge-approved` + gate ready |
| `merge_order` | Full ranked list (`priority_score` lower = earlier) |
| `stacks` | Merge parent PR before child (child bases on parent branch) |
| `redundant` | Pairs that overlap or subsume — close/rebase after merge |
| `warnings` | Human-readable stack + redundancy notes |

## Vision order (default scoring)

1. Package mirrors / **CI on main** workflows  
2. **benchmarks** (catalog, ingest, agent automation)  
3. **lic** (compiler, types, physics)  
4. **lip** / **lit** / **lis**  
5. **roadmap** governance last  

Title hints (`ci.yml`, `fix(types)`, `agent-kit`) adjust score within tier.

## Auto-merge safely

```bash
# Plan only
python3 scripts/pr-merge-queue-plan.py

# Merge one PR at a time following plan (skips redundant + not-first)
python3 scripts/pr-auto-merge-sweep.py --use-plan --execute
```

After each merge, **re-run the plan** — redundancy and `merge_first` change when `main` moves.

## Redundancy actions

| Signal | Suggested action |
|--------|------------------|
| Branch B contains all commits of A | Merge B, **close A** |
| >85% file overlap, same base | Human: keep one PR |
| Stacked PR (base = other's head) | Merge **parent** first |
| Title/body says "supersedes" | Close superseded issue/PR after merge |

Do not auto-close PRs without human or comment confirmation unless policy says otherwise.

## Workflow with review

1. Reviewer: `merge-approved-pr` checklist on PR  
2. Planner: `pr-merge-queue-plan.py` — confirm not redundant  
3. Add `merge-approved` only on PRs that are `merge_first` or safely parallel  
4. `pr-auto-merge-sweep.py --use-plan --execute` OR manual `pr-auto-merge.py`  
5. Re-plan; close redundant PRs; repeat  

## Related

- `merge-approved-pr` — single-PR review  
- `pr-merge-gate.py` — gate per PR  
- [git-workflow.md](../../../docs/ecosystem/git-workflow.md) — normal push only  
- Automation [merge-queue-digest.md](../../automations/merge-queue-digest.md)
