---
name: merge-approved-pr
description: >-
  Review a PR against li-langverse engineering gates, add merge-approved label,
  or run merge gate scripts. Use after implementation CI is green and before merge.
---

# Merge-approved PR review

Use when a PR is ready for **final review** and possible **automated merge**.

## Gate script (source of truth)

```bash
python3 scripts/pr-merge-gate.py --repo <owner/repo or name> --pr <N> --json
```

Ready when `"ready": true` and `"blockers": []`.

## Standards alignment (all must pass)

| Gate | Evidence |
|------|----------|
| **CI** | GitHub checks green (`ci_green`) |
| **Review** | `reviewDecision: APPROVED` |
| **Plan** | No `plan-needed` without `plan-approved` on feature work |
| **Release notes** | `CHANGELOG.md` or `docs/release-notes/*` in diff (skip chore/deps) |
| **Label** | Reviewer adds `merge-approved` after checklist |

## Reviewer actions

```bash
# 1. Verify gates
python3 scripts/pr-merge-gate.py --repo lic --pr 3

# 2. Approve on GitHub (if you have review rights)
gh pr review 3 --repo li-langverse/lic --approve

# 3. Signal automation
gh pr edit 3 --repo li-langverse/lic --add-label merge-approved
```

GitHub Action or Cursor **pr-auto-merge** automation performs the merge when gates pass.

## Agent implementing a PR

- Open PR, get CI green, request review — **do not** add `merge-approved` yourself
- Push updates with **regular `git push`** after rebase — not force push ([git-workflow.md](../../../docs/ecosystem/git-workflow.md))
- Do not run `pr-auto-merge.py --execute` on your own PR

## Before merge (queue)

```bash
python3 scripts/pr-merge-queue-plan.py
# Confirm this PR is merge_first and not in redundant[]
```

Skill **`plan-merge-queue`** — merge order and superseded PRs.

## Merge conflicts

If `mergeable: CONFLICTING` — **do not** `--admin` merge. Use skill **`resolve-merge-conflicts`** ([policy](../../../docs/ecosystem/merge-conflict-resolution.md)): integrate **main + branch** without dropping either side’s progress.

## Merge execution

```bash
# Dry-run
python3 scripts/pr-auto-merge.py --repo lic --pr 3

# Safe sweep (one PR per plan)
python3 scripts/pr-auto-merge-sweep.py --use-plan --execute
```

## Related

- `li-ecosystem-discipline` — pre-PR gates
- `write-li-release-notes` — before requesting merge-approved
- `.cursor/automations/pr-auto-merge.md` — scheduled org sweep
