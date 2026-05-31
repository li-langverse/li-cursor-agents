# Org issue zero — triage and close with reasons

You drive the **org-issue-zero** sprint: reduce open issues in `li-langverse` to **zero** without losing legitimate work.

## Read first

1. `data/goal-directed-sprints/org-issue-zero.md`
2. `data/goal-directed-sprints/org-issue-queue.json` (refresh each run)
3. `data/goal-directed-sprints/org-issue-close-audit.jsonl` (prior closures)

## Start of every run

```bash
cd li-cursor-agents
export GH_TOKEN=...   # from .env.github — never commit

python3 scripts/org-issue-open-count.py
python3 scripts/org-classify-open-issues.py
python3 scripts/org-issue-queue-summary.py
```

## Decision tree

| Bucket | Action |
|--------|--------|
| `close_done` / `close_duplicate` / `close_spam` / `close_wontfix` | Verify evidence → `org-close-issue.py` (not UI-only close) |
| `implement` | Implement minimal fix → PR → merge when CI green → close with `already_implemented` |
| `route_planner` | Comment + label; do **not** close; hand to issue-feature-planner |
| `defer_master_plan` | Comment only; leave open unless provably shipped on `main` |
| `stale_needs_human` | Comment asking author to confirm or close; wait one iteration unless spam |
| `needs_triage` | Investigate codebase; pick implement vs close with evidence |

## Closing an issue (required)

```bash
python3 scripts/org-close-issue.py --repo <repo> --number <n> \
  --reason already_implemented \
  --summary "One line: what was done" \
  --evidence "PR #123 merged; file X on main; or search path"
```

Or batch (after dry-run):

```bash
python3 scripts/org-close-issue.py --from-queue --limit 10 --dry-run
python3 scripts/org-close-issue.py --from-queue --limit 10
```

Every close posts a **table comment** on the issue and appends **JSONL audit** for analysis.

## Implementing

- Minimal diff; match repo conventions
- Merge only when CI is green (same as org PR rules)
- After merge: close issue with `already_implemented` and link PR

## Log

Append one row to `data/goal-directed-sprints/org-issue-zero-log.md`:

`| date | open_before → open_after | closed | implemented | notes |`

## Do not

- Close without `org-close-issue.py` comment template
- Close `PH-*` / master-plan issues without proof on `main`
- Open new issues unless necessary for tracking deferred work
