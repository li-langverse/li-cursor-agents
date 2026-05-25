# Release notes: 2026-05-25 — ph-db-liq-mcp-stub

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PR:** (feat/ph-db-control-plane-liq)  
**PH / REQ:** PH-DB-2, PH-DB-10  
**Author:** agent

---

## Summary (one sentence)

Adds a mock **liq** MCP and query module for control-plane exploration when `LI_CONTROL_PLANE_STORE=lidb`, with e2e skip-reason harness and migration doc updates ahead of real lidb persist.

## Agent continuation (required)

1. **Read:** `docs/plans/lidb-migration-control-plane.md`, `src/db/liq-query.ts`, `src/mcp/lidb-liq-mcp.ts`, `../lidb/docs/liq-spec.md` (PH-DB-2)  
2. **Run:** `npm run build && npm test`; optional `npm run test:e2e:lidb`  
3. **Then:** wire `configuredStore() === "lidb"` in `client.ts` + `persist.ts`; replace mock rows in `runLiqQuery` with liorm when `LI_LIDB_URL` is set  
4. **Blocked on:** lidb engine migrations for control-plane tables — **none** for this stub PR merge  

## Changed (specific)

| Area | What | Evidence |
|------|------|----------|
| liq MCP | `schema_snapshot`, `describe_table_liq`, `query_control_plane_liq` | `src/mcp/lidb-liq-mcp.ts` |
| Mock liq | `read <table> limit N` + allowlist | `src/db/liq-query.ts`, `liq-query.test.ts` |
| MCP config | `buildControlPlaneLiqMcpServers`, `LI_CONTROL_PLANE_LIQ_MCP` | `src/mcp/mcp-config.ts` |
| E2E | `lidbE2eSkipReasons()`, partial tests when `LI_E2E_LIDB=1` | `src/e2e/lidb-control-plane.e2e.ts`, `test:e2e:lidb` |
| Docs | Store matrix `supabase\|disk\|lidb` | `docs/plans/lidb-migration-control-plane.md`, `.env.example` |
| Deprecation | Agents prefer liq over raw SQL | `src/db/read-query.ts` header |

## Not changed (scope fence)

- `persist.ts` / Supabase REST paths — still supabase or disk only  
- `configuredStore()` type — no `lidb` branch in `client.ts` yet  
- `cursor-sdk-backend` MCP wiring — still attaches Postgres MCP only when supabase  
- lidb security harness in ecosystem CI  

## Breaking changes

None.

## Security

N/A — mock read-only stub; mutating liq rejected in `parseReadLiq`; full gates in `lidb/tests/security/` before production default.

## Performance

N/A — no engine I/O.

## Downstream

| Repo | Action |
|------|--------|
| lidb | PH-DB-2 liq compiler + security tests |
| lis | `lis db start` for PH-DB-10 e2e |

## CHANGELOG entry (paste into Unreleased)

```markdown
### Added
- PH-DB-2/10 liq MCP stub for lidb control-plane read path (`lidb-liq-mcp.ts`, `liq-query.ts`).
```
