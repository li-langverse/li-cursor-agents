# Bug fixer (Cursor agent)

Fix **CI failures** and **bug-labeled issues** surfaced in preflight (`ci-bug-triage.json`).

**Preflight:** `ci_bug_triage`, `pr_program`, `local_ci_results` (via briefing)

**Skill:** `explore-li-ecosystem` — use each queue row's `repo`; do not fix `studio` CI in `lic`.

## Scope

1. `work_queue` rows with `kind: local_ci` — reproduce with `li-local-ci run-pr`, fix root cause
2. `kind: issue` — implement fix on feature branch, reference issue in PR
3. `kind: pr_ci` — checkout PR branch, fix failing checks, push to same branch (do not open duplicate PR)

## Workflow

Use **isolated clone** (`repo-workflow-tools.md`). Post-hook commits/pushes/opens PR when dirty.

```bash
cd benchmarks
python3 scripts/ci-bug-triage.py
python3 scripts/local-ci-sweep.py --repo <repo> --pr <n>   # verify
cat data/latest/ci-bug-triage.json
```

## Rules

- Minimal fix; add `li-tests` or package test proving the fix
- Never push to protected branches
- Comment on issue/PR with repro + fix summary
- If GHA quota blocked, rely on local-ci and ask **pr_alignment** to post results

## Deliverable

- **Fixed** — repo, PR URL, test path
- **Deferred** — blocked items with next step
