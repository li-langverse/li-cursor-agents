# Goal-directed plan loop — reference

## lic scripts (httpd)

| Script | Role |
|--------|------|
| `scripts/httpd-plan-loop.py` | Core loop: pick todo → gates → SDK agent → recovery → pages |
| `scripts/httpd-plan-gates.sh` | Build/validate oracles; `HTTPD_GATES_SKIP_LIC_BUILD=1` |
| `scripts/httpd-plan-overnight.sh` | Batch `--max` then exec until-deadline |
| `scripts/httpd-plan-until-deadline.sh` | Repeat batches until `HTTPD_PLAN_UNTIL_LOCAL` |

Plan: `docs/superpowers/plans/2026-05-16-li-httpd-plan.md`  
Baseline: `docs/ecosystem/httpd-m1-baseline.md`

## li-cursor-agents CLI

```bash
cd li-cursor-agents
node dist/cli/run-agent.js \
  --agent code_implementer \
  --cwd /path/to/lic \
  --workflow-repo lic \
  --goal-file /path/to/goal.md \
  --benchmarks /path/to/benchmarks
```

Implement agents: `code_implementer`, `bug_fixer` — post-hook pushes unpublished commits; PR by default (`LI_REPO_WORKFLOW_OPEN_PR=0` to disable).

## Push loss prevention

| Failure mode | Mitigation |
|--------------|------------|
| Edits only in workspace clone | `LI_REPO_WORKFLOW_TRACK_REMOTE` + fixed branch |
| Agent commits, no push | Post-hook `pushUnpublishedCommits` |
| Crash before post-hook | `recover_unpushed_work()` in loop |
| Wrong branch | `HTTPD_PLAN_PR_BRANCH` / `LI_REPO_WORKFLOW_BRANCH` |

## Until-deadline algorithm

```
deadline = today 08:00 if now < 08:00 else tomorrow 08:00
while now < deadline - 5min:
  remaining_min = (deadline - now) / 60
  batch = clamp(remaining_min / MIN_PER_ITER, 1, BATCH_CAP)
  run plan-loop.py --max batch
  on failure: sleep 90s; on success: sleep 15s
```

## Generic env prefix (new plan)

When cloning for `ecosystem-plan-loop`:

| httpd name | Generic pattern |
|------------|-----------------|
| `HTTPD_PLAN_PR_BRANCH` | `<PREFIX>_PLAN_PR_BRANCH` |
| `HTTPD_GATES_SKIP_LIC_BUILD` | `<PREFIX>_GATES_SKIP_BUILD` |
| `LI_HTTPD_PLAN_LOOP` | `<PREFIX>_PLAN_LOOP=1` |
| `data/httpd-plan-loop/` | `data/<prefix>-plan-loop/` |

Keep `LI_REPO_WORKFLOW_*` and `LI_CURSOR_AGENTS_ROOT` unchanged.

## Gates without full compiler

```bash
export HTTPD_GATES_SKIP_LIC_BUILD=1
export HTTPD_RUN_BEARER_TEST=0
./scripts/httpd-plan-gates.sh
```

Full runtime gates need `lic` built + `clang` + optional `build/li-httpd` (`setup-li-devbox.sh --full`).

## Pages refresh

```bash
cd benchmarks
LIC_ROOT=../lic HTTPD_PAGES_SKIP_BENCH=1 ./scripts/refresh-live-sites.sh
```

Loop sets `HTTPD_REFRESH_PAGES=1` (disable: `HTTPD_REFRESH_PAGES=0`).
