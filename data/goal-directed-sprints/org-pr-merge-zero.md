# Sprint: li-langverse org — zero open pull requests

**Scope:** All repos in `li-langverse` (~231 open PRs at sprint start)  
**Stop when:** Completion gate passes (0 open PRs)  
**Do not** force-push `main` or mass-close PRs without merging useful commits.

## Mission

Clear every open pull request in the org by squash-merging (preferred), or fixing + merging. Loop until GitHub search reports **0 open PRs**.

## Read first

1. `data/goal-directed-sprints/org-pr-merge-final-report.md` — prior session (27 merged, blockers)
2. `data/goal-directed-sprints/org-pr-merge-queue.json` — classified queue (refresh each iteration)
3. `scripts/org-merge-open-prs.py` — classify + `--merge-green`
4. `scripts/org-merge-blocked.py` — merge blocked-but-CI-green via REST
5. `scripts/org-fix-dirty-from-queue.py` — update-branch (422 = needs local rebase)
6. `scripts/org-pr-queue-summary.py` — quick queue stats

## Status

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Refresh queue (`org-merge-open-prs.py --dry-run`) | **DONE** |
| **B** | Auto-merge green + blocked CI-green | **DONE** |
| **C** | Local rebase dirty PRs (batch per repo, push) | **in progress** (~105 dirty; session 17: rebased benchmarks#250 merged, lic#373/#376 pushed) |
| **D** | Fix CI failures on remaining PRs | **in progress** (lip/lit 0 open; lic#373/#376/#520 CI failing composable studio checks) |
| **E** | Close superseded duplicate sweeps (only if commit already on main) | **pending** |
| **F** | Verify 0 open PRs + update final report | **pending** |

### Phase A — Refresh queue

Each iteration start:

```bash
cd "$(dirname "$0")/.."  # workspace root via scripts/
python3 scripts/org-merge-open-prs.py --dry-run
python3 scripts/org-pr-queue-summary.py
python3 scripts/org-pr-open-count.py
```

Mark **A** **DONE** when `org-pr-merge-queue.json` exists with current counts logged in `data/goal-directed-sprints/org-pr-merge-zero-log.md`.

### Phase B — Auto merge

```bash
python3 scripts/org-merge-open-prs.py --merge-green
python3 scripts/org-merge-blocked.py
python3 scripts/org-pr-open-count.py
```

Mark **B** **DONE** when a pass merges ≥1 PR or both green and blocked queues are empty.

### Phase C — Local rebase dirty

For `dirty` rows in queue (172 at start): per repo checkout branch, `git fetch origin pull/N/head`, merge `origin/main`, resolve conflicts (prefer keeping PR intent + main safety), push, REST squash merge.

Batch size: **5–10 PRs per iteration** (heaviest: `lic`, `benchmarks`, `roadmap`, `lis`).

Mark **C** **DONE** when dirty count is 0 or all remaining dirty have documented blockers.

### Phase D — CI fixes

Fix failing checks with minimal diffs; re-push; merge when green.

Mark **D** **DONE** when `ci_not_ok` count is 0.

### Phase E — Dedupe sweeps

Only close without merge when the PR branch adds **no unique commits** vs `main` (prove with `git log main..branch`). Document each closure in the log.

Mark **E** **DONE** when no such duplicates remain or none found.

### Phase F — Ship report

Update `data/goal-directed-sprints/org-pr-merge-final-report.md` with ending count and merged/closed lists.

Mark **F** **DONE** when open PR count is 0.

## Progress gate

```bash
set -euo pipefail
# goal-directed-loop --cwd is workspace root (parent of li-cursor-agents)
test -f scripts/org-merge-open-prs.py
test -f scripts/org-pr-open-count.py
: "${GH_TOKEN:?GH_TOKEN required}"
python3 scripts/org-pr-open-count.py
echo "org-pr-merge-zero: progress gate OK"
```

## Completion gate

All phases **A–F** must be **DONE** in the status table above **and** open PR count must be zero.

```bash
set -euo pipefail
bash scripts/org-pr-merge-completion-gate.sh
```

## Rules

- Squash merge via REST: `PUT /repos/li-langverse/{repo}/pulls/{n}/merge` with `{"merge_method":"squash"}`
- Prefer REST over `gh pr merge` (GraphQL rate limits)
- Never force-push `main`
- Do not merge without green CI unless branch protection allows and checks passed on head SHA
- Update phase status table rows to **DONE** as each phase completes

## Agent

Use **`code_implementer`**. Workspace root is the working tree (`lic/`, `benchmarks/`, sibling repos).
