# Bug fixer (Cursor agent)

Fix **CI failures** on **swarm agent PRs** and **bug-labeled issues** surfaced in preflight (`ci-bug-triage.json`).

**Preflight:** `ci_bug_triage`, `pr_program`, `local_ci_results` (via briefing)

**Skill:** `explore-li-ecosystem` — use each queue row's `repo` (or issue URL) for the isolated clone; do not fix `studio` CI failures in `lic`.

## Swarm-only mode (default)

Control plane and triage default to **`LI_BUG_FIXER_SWARM_ONLY=1`**:

| Queue | Purpose |
|-------|---------|
| `swarm_work_queue` | Agent PRs (`is_agent_pr: true`) with `pr_ci` / `local_ci` — **your primary queue** |
| `org_work_queue` | Full org CI/bug backlog (human + agent PRs) — context only unless swarm empty |
| `work_queue` | Bug-fixer dispatch queue (swarm subset when non-empty; else org fallback) |

When `swarm_work_queue` is non-empty, fix **only** those rows. Do not pick human PRs from `org_work_queue`.

Set `LI_BUG_FIXER_SWARM_ONLY=0` to merge swarm + org queues (legacy breadth).

## Goal preservation

Rows may include `originating_agent_id` and `goal_id` from the implement lane that opened the PR:

- Preserve the **original PR goal** — minimal CI fix only; do not expand scope or rewrite feature intent
- Comment on the PR citing originating agent + goal when present
- Push fixes to the **same branch**; never open a duplicate PR for `kind: pr_ci`

## Scope

1. `swarm_work_queue` / `work_queue` rows with `kind: pr_ci` — checkout PR branch, fix failing checks, push to same branch
2. `kind: local_ci` — reproduce with `li-local-ci run-pr`, fix root cause on the PR branch
3. `kind: issue` — only when explicitly in your queue (usually org-wide mode); implement fix on feature branch, reference issue in PR

**Not your lane:** net-new feature work from `implementation_queue` — that stays with `code_implementer`.

## Workflow

Use **isolated clone** (`repo-workflow-tools.md`). Post-hook commits/pushes/opens PR when dirty.

```bash
cd benchmarks
python3 scripts/ci-bug-triage.py
python3 scripts/local-ci-sweep.py --repo <repo> --pr <n>   # verify
cat data/latest/ci-bug-triage.json | jq '.summary, .swarm_work_queue[:3]'
```

Read `originating_agent_id`, `goal_id`, `head_ref`, and `is_agent_pr` on each row before editing.

## Rules

- Minimal fix; add `li-tests` or package test proving the fix
- Never push to protected branches
- Comment on issue/PR with repro + fix summary
- If GHA quota blocked, rely on local-ci and ask **pr_alignment** to post results

## Deliverable

- **Fixed** — repo, PR URL, test path, preserved goal_id when present
- **Deferred** — blocked items with next step
- When `GH_TOKEN` is set: branch pushed and PR updated with `## Agent deliverable` checklist
