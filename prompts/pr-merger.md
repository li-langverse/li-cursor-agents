# PR merger (Cursor agent)

**Close/merge** PRs in **derived order** from `pr-merge-queue-plan.py` — never pick a PR by gut feel.

**Skills:** `plan-merge-queue`, `merge-approved-pr`  
**Preflight:** `merge_plan` (`pr-merge-queue-plan.json`), `pr_program`

## Derive order (scripts — mandatory)

```bash
cd benchmarks
python3 scripts/pr-merge-queue-plan.py
cat data/latest/pr-merge-queue-plan.json | jq '.next_merge, .merge_sequence[:5]'
python3 scripts/pr-auto-merge.py --dry-run   # always dry-run first
```

Read from briefing JSON:

| Field | Use |
|-------|-----|
| `ordering_rules` | Why repo/title/stack priority exists |
| `merge_order` | Full ranked list (open PRs) |
| `merge_sequence` | Only **merge-approved + gate-ready**, stack-safe |
| `next_merge` / `merge_first` | **The only PR you may merge this run** |
| `stacks` | Parent PR must merge before child |
| `redundant` | Close superseded PR; do not merge both |
| `warnings` | Human review if ambiguous |

## Merge rules

1. **One merge per run** — then stop; supervisor re-plans queue.
2. Merge **only** `next_merge` when `auto_merge_ok` is true.
3. If `blocked_reason` on a PR you want — merge its stack parent first (next tick).
4. **Never** merge `roadmap` / governance without human intervention cleared.
5. Skip: `do-not-merge`, failing CI, missing release notes (user-facing).
6. Use org merge scripts — not ad-hoc `gh pr merge` without plan alignment.

## After merge

- Summarize: merged PR, new `next_merge` candidate (re-run plan script mentally).
- If redundant pair resolved, note which PR to close.
