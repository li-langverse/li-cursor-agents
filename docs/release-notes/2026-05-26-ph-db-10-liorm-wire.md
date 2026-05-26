# Release notes: 2026-05-26 — ph-db-10-liorm-wire (WP-E)

**PH / REQ:** PH-DB-10  
**Branch:** `cursor/wp-e-ph-db-10-liorm`

## Summary

Wires `li-cursor-agents` control-plane **lidb** path to real **liorm/liq** via `scripts/lidb-liorm-bridge.py` (Python subprocess). Default store remains **supabase**.

## Delivered

| Area | Change |
|------|--------|
| Bridge | `scripts/lidb-liorm-bridge.py` — probe, `read_liq`, `upsert_agent_run`, `upsert_control_plane_state` |
| TS | `src/db/lidb-liorm.ts`, `src/db/lidb-persist.ts`; `runLiqQuery` + `persist.ts` use engine when probe ok |
| Backfill | `node scripts/backfill-control-plane-db.mjs --store=lidb` |
| E2E | `npm run test:e2e:lidb` (mock); `npm run test:e2e:lidb-engine` (real embed) |
| Docs | `docs/plans/schema-parity-control-plane-db-r0-4.md`, migration checklist, liq MCP skill |

## Blockers (lidb API / schema)

- `agent_handoffs` not in `CATALOG_ALLOWLIST` — handoffs persist todo
- Reports/interventions: native catalog tables missing — e2e todo
- `DELETE` / full Supabase column set on `agent_runs` — embed subset only
- `control_plane_state` upsert fails until native migration lands

## Verify

```bash
npm run build && npm test
npm run test:e2e:lidb
LI_LIDB_REPO=../lidb npm run test:e2e:lidb-engine
```
