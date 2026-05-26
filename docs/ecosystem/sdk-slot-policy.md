# SDK slot policy

Cursor SDK runs share a cross-process slot pool (`data/control-plane/sdk-slots/`). `LI_SDK_MAX_CONCURRENT` caps how many sessions may hold a slot at once (default **5** in `scripts/env.defaults.sh`).

## Slot budget (steady async swarm)

| Consumer | Slots | Notes |
|----------|-------|--------|
| Research lane | 1 | `research_goal_agent` loop |
| Implement lane | 1 | `code_implementer` loop |
| Agent worker pool | 6 | All other registry agents on staggered continuous loops |
| **Total (lanes + pool)** | **5** | Matches default `LI_SDK_MAX_CONCURRENT=5` |

Lanes and the worker pool compete for the same slot files. When all slots are busy, workers skip the cycle and retry after idle backoff (no hard failure).

## Burst / plan execution

`scripts/swarm-plan-execute.sh` (WP-3) and manual burst runs may need **up to 8** parallel `run-agent` children **without** the worker pool also claiming slots.

Set:

```bash
export LI_SWARM_PAUSE_WORKERS=1
```

Effects:

- `startAsyncSwarm()` still starts research / implement / maintenance lanes but **does not** start the agent worker pool.
- If the pool was already running, each worker loop treats pause as idle (no `runAgent` calls until pause is cleared and the swarm is restarted).

Clear pause and restart async swarm (or dashboard **Stop agents** → **Start agents**) to resume pool workers.

## Runtime visibility

`GET /api/runtime` includes:

| Field | Meaning |
|-------|---------|
| `sdk_max_concurrent` | Effective cap (`LI_SDK_MAX_CONCURRENT`) |
| `sdk_slots_in_use` | Non-stale cross-process slot lock files held |
| `sdk_sessions_active` | In-process SDK depth in this dashboard process |
| `active_run_count` | **In SDK now** — `min(max(slots_in_use, in-process), sdk_max)`; not the length of `active_runs` |
| `active_runs_registered` | Running tracks in the worker heartbeat (may exceed cap while waiting for a slot) |
| `workers_paused` | `LI_SWARM_PAUSE_WORKERS` is set |

If `active_runs` is much larger than `active_run_count`, see [concurrent-runs-troubleshooting.md](./concurrent-runs-troubleshooting.md).

## Tuning

- Raise `LI_SDK_MAX_CONCURRENT` only when the host has API quota and CPU for more parallel SDK sessions (stay within your Cursor account limit).
- Lower it (e.g. `2`) on laptops or when debugging slot timeouts (`LI_SDK_SLOT_MAX_WAIT_MS`).
- Reclaim stale locks after crashes: `./scripts/sweep-hung-agents.sh --apply`, delete orphaned files under `data/control-plane/sdk-slots/`, or restart the dashboard (boot calls `reclaimAllStaleSdkSlots()`). See [hung-agent-sweep.md](./hung-agent-sweep.md).

See also [swarm-architecture.md](./swarm-architecture.md), [agent-automations.md](./agent-automations.md), and `docs/sdk-matrix-troubleshooting.md`.
