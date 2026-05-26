# Release notes: 2026-05-26 — ph-db-10-control-plane-lidb-stub

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PH / REQ:** PH-DB-10  

---

## Summary (one sentence)

Wires opt-in `LI_CONTROL_PLANE_STORE=lidb` with disk-backed persist stubs, store-aware liq MCP config, and `test:e2e:lidb` harness — default Supabase path unchanged.

## Changed

| Area | What |
|------|------|
| Store | `ControlPlaneStore` + `useLidbStore`, `lidbReady`, `assertStoreReady` for lidb |
| Persist | Disk mirror for lidb; `persistControlPlaneStateLidb` stub until liorm |
| MCP | `buildControlPlaneLiqMcpServers`, `buildControlPlaneMcpServers` (SDK) |
| E2E | `lidb-control-plane.e2e.ts`, `npm run test:e2e:lidb` |
| Docs | Migration checklist + `.env.example` lidb vars |

## Blocked on real lidb engine

- liorm writes for `agent_runs`, handoffs, reports (e2e `test.todo` rows)
- `runLiqQuery` against `LI_LIDB_URL` without `LI_LIDB_MOCK`
- Backfill script + optional CI job `LI_E2E_LIDB=1`

## Breaking changes

None — `supabase` remains default.
