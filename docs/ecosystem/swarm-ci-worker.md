# Swarm CI worker

Always-on background loop (optional) that squash-merges **new** (non-baseline) org PRs that pass CI and carry swarm lane labels.

## Enable

```bash
export LI_SWARM_CI_WORKER_ALWAYS_ON=1
export GH_TOKEN=...
npm run agents:async-swarm
# or standalone:
npm run agents:swarm-ci-worker
```

One-shot:

```bash
npm run build && node dist/cli/swarm-ci-worker.js once
```

## Deferral

When `ORG_PR_SPRINT_ROLE` is `old-dirty` or `old-ci`, the worker defers to the goal-directed sprint coordinator.

## Cycle

1. `org-merge-open-prs.py --dry-run` refreshes the queue.
2. `org-pr-baseline-filter.py --subset new --write-queue` keeps non-baseline PRs.
3. Label filter (default `li-swarm` + lane `agent:*` maintainer labels).
4. `org-merge-from-queue.py` merges green/blocked up to `LI_SWARM_CI_WORKER_MERGE_LIMIT`.

## Env

- `LI_SWARM_CI_WORKER_ALWAYS_ON` — run with async swarm / CLI
- `LI_SWARM_CI_WORKER_INTERVAL_MS` — default 300000 (min 60000)
- `LI_SWARM_CI_WORKER_MERGE_LIMIT` — default 8
- `LI_SWARM_CI_WORKER_REQUIRE_LABELS` — default on
- `LI_SWARM_CI_WORKER_LABELS` — comma list (any-match)
