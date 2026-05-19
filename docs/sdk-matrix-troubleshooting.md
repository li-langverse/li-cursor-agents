# SDK matrix: stalls vs slow runs

## What looks like a hang

| Symptom | Typical cause | Fix |
|--------|----------------|-----|
| No log lines for 10+ min on one agent | `LI_SDK_SLOT_MAX_WAIT_MS` default **600000** (10 min) waiting on a stale cross-process lock | `npm run test:kill-stale`; isolated runner sets 120s |
| Stuck after `>>> START agent` before stream | `pollUntilLiveStreamVisible` up to **180s** (`LI_E2E_SDK_STREAM_WAIT_MS`) | Normal for slow SDK; increase wait or check API key / network |
| Process survives after Ctrl+C | Orphan `node --test` + slot lock from dead PID | `kill-stale` reclaims locks when owner PID is gone |
| Full matrix stops at agent N | `verify-all-agents-sdk-stream.sh` **exits on first failure** unless `VERIFY_CONTINUE_ON_FAIL=1` | Use isolated script or continue flag |
| Heartbeat lines every 3s | `flushWorkerHeartbeat` during active SDK run (cosmetic; `unref` timer) | Not a hang |

## Recommended local workflow

```bash
npm run test:kill-stale
npm run test:sdk-matrix-isolated   # one agent per process, 12 min cap each
```

Per-agent only:

```bash
VERIFY_AGENT=pr_reviewer npm run test:verify-all-agents-sdk-stream
```

## Isolated runner env

`scripts/sdk-matrix-isolated.sh` sets:

- `LI_SDK_MAX_CONCURRENT=1`
- `LI_SDK_SLOT_MAX_WAIT_MS=120000` (fail fast on lock contention)
- `AGENT_TIMEOUT_SEC=720` wall clock per agent (`timeout` / `gtimeout`)
