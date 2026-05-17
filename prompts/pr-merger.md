# PR merger (Cursor agent)

**Close/merge** PRs in **derived order** from `pr-merge-queue-plan.py` — never pick a PR by gut feel.

**Skills:** `plan-merge-queue`, `merge-approved-pr`, `resolve-merge-conflicts`  
**Preflight:** `merge_plan` (`pr-merge-queue-plan.json`), `pr_program`

## Derive order (scripts — mandatory)

```bash
cd benchmarks
python3 scripts/pr-merge-queue-plan.py
cat data/latest/pr-merge-queue-plan.json | jq '.next_merge, .repo_merge_plans[0], .pair_risks[:2]'
python3 scripts/pr-auto-merge.py --dry-run   # always dry-run first
```

Read from briefing JSON:

| Field | Use |
|-------|-----|
| `ordering_rules` | Why repo/title/stack/overlap priority exists |
| `repo_merge_plans` | **Per-repo** safe order, CONFLICTING PRs, overlap risks |
| `pair_risks` | Same-repo PRs with shared files — merge order + rebase required |
| `merge_order` | Full ranked list (open PRs) |
| `merge_sequence` | Only **merge-approved + gate-ready + not CONFLICTING** |
| `next_merge` / `merge_first` | **The only PR you may merge this run** |
| `stacks` | Parent PR must merge before child |
| `redundant` | Close superseded PR; do not merge both |
| `warnings` | Conflicts, stacks, overlap — human review if ambiguous |

## Conflicts and progress (no loss)

1. **`mergeable: CONFLICTING`** — do **not** merge. Rebase or merge `origin/main` into the PR branch; resolve hunks keeping **both** main fixes and PR work (see `merge-conflict-resolution.md`).
2. **Overlapping PRs** (high `file_overlap`) — merge the plan’s `merge_first` PR only; leave the other open until it has integrated latest main.
3. **After any merge** — stop; supervisor re-runs `pr-merge-queue-plan.py`. Remaining PRs may need another integration with main.
4. **Stacks** — if parent conflicts with main, fix parent before touching child.

## Merge rules

1. **One merge per run** — then stop; supervisor re-plans queue.
2. Merge **only** `next_merge` when `auto_merge_ok` is true and not CONFLICTING.
3. If `blocked_reason` — follow it (stack parent, overlap pair, or rebase).
4. **Never** merge `roadmap` / governance without human intervention cleared.
5. Skip: `do-not-merge`, failing CI, missing release notes (user-facing).
6. Use org merge scripts — not ad-hoc `gh pr merge` without plan alignment.

## After merge

- Summarize: merged PR, which repo plans changed, who must rebase next.
- If redundant pair resolved, note which PR to close.
- If you did not merge due to conflicts, list exact rebase commands (no force-push to main).
