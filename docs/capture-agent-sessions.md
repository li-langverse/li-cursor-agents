# Capturing agent / supervisor errors

Run from `li-cursor-agents` root:

```bash
bash scripts/capture-agent-errors.sh
# writes: data/capture/<UTC-timestamp>/snapshot.md, *.errors.txt, *.tail.txt
```

Repeat on an interval while the swarm runs, then search:

```bash
grep -Rhi error data/capture/session-*/
```

Session folders are gitignored (`data/capture/`).

## Reading `/api/status` (state vs runtime)

The dashboard `GET /api/status` JSON mixes **two layers**:

1. **`state`** — The last **persisted** control-plane document (Supabase and/or the `state.json` mirror). It includes fields like `supervisor_loop_running` that were written when state was last saved. The supervisor runs in a **separate process**; that save can lag a tick behind what the dashboard process already knows.

2. **Top-level `supervisor_loop_running`** and **`runtime`** — Derived from the **live** dashboard view: `isSupervisorLoopRunning()` (child PID still attached) and `runtimeSnapshot()`, which treats the loop as on if **either** the child is alive **or** the persisted flag is true.

So you can occasionally see **`state.supervisor_loop_running: false`** while **`supervisor_loop_running: true`** at the top level: the file/DB row has not caught up yet, but the dashboard already sees the subprocess. Prefer the **top-level** flag or **`/api/runtime`** for “is the loop actually on right now?”.

This is not a database migration issue; fixing migrations does not reconcile that field—it is eventual consistency between processes.
