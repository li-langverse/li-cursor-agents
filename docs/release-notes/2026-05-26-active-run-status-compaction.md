# Release notes: 2026-05-26 — active-run-status-compaction

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PR:** branch `cursor/fix-swarm-health-9031`  
**PH / REQ:** Agent swarm control plane  
**Author:** agent

---

## Summary (one sentence)

The dashboard runtime API stays responsive under active swarm load by compacting hot active-run heartbeat payloads and using light DB selects for running-row overlays.

## Agent continuation (required)

1. Read: `docs/ecosystem/swarm-health-monitoring.md`, `docs/ecosystem/dashboard-db-contract.md`, and `src/control-plane/active-run-snapshot.ts`.
2. Run: `npm run build`, `node --test dist/control-plane/active-run-snapshot.test.js`, `npm run test:health-report`, and `curl --max-time 5 http://127.0.0.1:9477/api/runtime`.
3. Then: monitor `logs/swarm-health-reports/latest.md` after the next timer tick and keep `real_error_count` separate from `stale_running_reconciled` rows.
4. Blocked on: unrelated dashboard API e2e mock-catalog assertions if a full `npm run test:dashboard-api` sweep is required.

## Changed (specific)

| Area | What | Evidence |
|------|------|----------|
| Runtime heartbeat | `src/worker/heartbeat.ts` stores compact active-run `run_input`, `run_trace`, and recent event payloads via `src/control-plane/active-run-snapshot.ts`. | `node --test dist/control-plane/active-run-snapshot.test.js` exits `0`. |
| Runtime API | `src/control-plane/runtime-for-api.ts`, `src/control-plane/runs-catalog.ts`, `src/db/runs.ts`, and `src/db-api/index.ts` avoid loading full run payloads on hot `/api/runtime` and running-row paths. | `curl --max-time 5 http://127.0.0.1:9477/api/runtime` exits `0`. |
| Health reporting | `scripts/swarm-health-report.sh`, `scripts/lib/swarm-health-report-render.py`, and `scripts/test-swarm-health-report.mjs` distinguish API timeouts while services are active from units being stopped. | `npm run test:health-report` exits `0`; `./scripts/swarm-health-report.sh` exits `0`. |
| Operator docs | `docs/ecosystem/swarm-health-monitoring.md` documents the timeout-active-services recommendation. | Manual doc review. |

## Not changed (scope fence)

- Agent scheduling policy and goal selection are unchanged.
- Supabase schema and migrations are unchanged.
- Cursor SDK concurrency caps and slot-lock behavior are unchanged.
- Legacy `lic` plan-loop services remain disabled; this PR does not re-enable them.

## Breaking changes

None — active-run detail APIs still load full data where needed; only hot status paths are compacted.

## Security

N/A — payload compaction reduces dashboard heartbeat size but does not change auth, secrets handling, or DB permissions.

## Performance

`/api/runtime` returned within a 5-second curl timeout after service restart and compaction; active heartbeat rows no longer carry unbounded prompt/trace bodies.

## Downstream

| Repo | Action |
|------|--------|
| lic / benchmarks / roadmap | N/A — dashboard/runtime API shape is compatible; large fields are truncated only in heartbeat/status rows. |

## CHANGELOG entry (paste into Unreleased)

```markdown
### Fixed
- **Swarm runtime API:** compact active-run heartbeat payloads and use light running-row DB selects so `/api/runtime` stays responsive while async swarm is active — [2026-05-26-active-run-status-compaction.md](docs/release-notes/2026-05-26-active-run-status-compaction.md).
```
