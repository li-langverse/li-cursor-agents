# Restart integration smoke (manual)

Automated coverage lives in:

- `src/db/reconcile-stale-runs.integration.test.ts` — stale DB rows → `stale_running_reconciled`, in-sdk count unchanged
- `src/worker/swarm-reconcile-resume.test.ts` — resume decision after restart
- `src/repo-workflow/restart-stack.test.ts` — systemd vs `keep-agents-running.sh`
- `src/control-plane/runtime-post-sigterm.test.ts` — slots + `active_run_count` after run end

Do **not** run the steps below against a production swarm unless `LI_TEST_MODE=1` and you accept a brief stack restart.

## Prerequisites

- Branch `feat/goal-directed-swarm` built: `npm run build`
- Optional isolated mode: `export LI_TEST_MODE=1 LI_AGENT_DASHBOARD_PORT=19477`

## A. Dashboard restart → reconcile + resume

1. Confirm stale running rows (Supabase):  
   `curl -s :9477/api/runtime | jq '{store, in_sdk:.active_run_count, listed:(.active_runs|length)}'`
2. Restart dashboard only:  
   `systemctl --user restart li-agents-dashboard.service`
3. Tail reconcile:  
   `grep reconcile logs/agents-dashboard-systemd.log | tail -20`
4. Expect log line `marked N stale agent_runs as error` when rows are older than `LI_STALE_RUNNING_RUN_MS` (default 30m).
5. If `worker_status.async_swarm_running` was true, async unit or reconcile should resume swarm (see `li-agents-async-swarm.service` logs).

## B. Workspace sweep must not pkill under systemd

1. `systemctl --user is-active li-agents-dashboard.service` → `active`
2. `LI_WORKSPACE_SWEEP_RESTART=1 npm run workspace:sweep -- --dry-run` (or a test repo)
3. When sweep triggers restart, logs should show **systemctl try-restart**, not `Stopping existing dashboard on :9477` from `keep-agents-running.sh`.

Forced flag without systemd: `LI_CONTROL_PLANE_SYSTEMD=1 bash scripts/keep-agents-running.sh` → exits after try-restart, no `lsof` kill.

## C. Full stack SIGTERM

1. `systemctl --user stop li-agents-async-swarm li-agents-dashboard`
2. `curl -s :9477/api/runtime` should fail
3. `systemctl --user start li-agents-dashboard` (and async-swarm if installed)
4. `curl -s :9477/api/runtime | jq '{in_sdk:.active_run_count, slots:.sdk_slots_in_use, registered:.active_runs_registered}'`  
   Expect `in_sdk` ≤ `sdk_max_concurrent`, not inflated by stale DB rows after reconcile.

## Safe CI-style check (no production port)

```bash
export LI_TEST_MODE=1 LI_CONTROL_PLANE_STORE=supabase
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=test
npm test
```
