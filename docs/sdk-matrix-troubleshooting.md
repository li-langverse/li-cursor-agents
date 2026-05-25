# SDK matrix: stalls vs slow runs

## Idle watchdog (not a fixed wall timeout)

`scripts/sdk-matrix-isolated.sh` runs each agent until it exits. It only kills a run when **both** logs stop growing for the idle window:

- `SDK_MATRIX_IDLE_SEC` — default **180** (3 min). Set **120–300** for your tolerance.
- Poll interval: `SDK_MATRIX_IDLE_POLL_SEC` (default 15s).
- Monitors `logs/sdk-matrix/isolated-<agent>.log` and `all.log` byte size (includes waiting on `npm`, SDK stream, builds inside the agent).

Optional safety cap: `SDK_MATRIX_MAX_WALL_SEC` (default **0** = disabled). Agents may run for hours if logs keep updating.

Exit **124** = idle stall (no growth for `SDK_MATRIX_IDLE_SEC`).

## What looks like a hang

| Symptom | Typical cause | Fix |
|--------|----------------|-----|
| No log lines for 10+ min on one agent | `LI_SDK_SLOT_MAX_WAIT_MS` default **600000** (10 min) waiting on a stale cross-process lock | `npm run test:kill-stale`; isolated runner sets **120s** |
| Stuck after `>>> START agent` before stream | `pollUntilLiveStreamVisible` up to **180s** (`LI_E2E_SDK_STREAM_WAIT_MS`) | Normal for slow SDK; increase wait or check API key / network |
| Process survives after Ctrl+C | Orphan `node --test` + slot lock from dead PID | `kill-stale` reclaims locks when owner PID is gone |
| Full matrix stops at agent N | `verify-all-agents-sdk-stream.sh` **exits on first failure** unless `VERIFY_CONTINUE_ON_FAIL=1` | Use isolated script or continue flag |
| Heartbeat lines every 3s | `flushWorkerHeartbeat` during active SDK run (cosmetic; `unref` timer) | Not a hang — log growth resets idle timer |

## Recommended local workflow

```bash
npm run test:kill-stale
npm run test:sdk-matrix-isolated   # one agent per process, idle watchdog only
```

Per-agent only:

```bash
VERIFY_AGENT=pr_reviewer npm run test:verify-all-agents-sdk-stream
```

## Isolated runner env

`scripts/sdk-matrix-isolated.sh` sets:

- `LI_SDK_MAX_CONCURRENT=1`
- `LI_SDK_SLOT_MAX_WAIT_MS=120000` (fail fast on lock contention)
- `SDK_MATRIX_IDLE_SEC=180` (interrupt only when logs are silent)
- `SDK_MATRIX_MAX_WALL_SEC=0` (no per-agent wall cap unless you set one)
