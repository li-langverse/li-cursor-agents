# PH-DB-10: Control-plane migration to lidb

**Status:** Stub / harness only (this repo)  
**Plan phase:** PH-DB-10 (after PH-DB-1..3 engine + `lis` bundle, PH-DB-2 `liorm`/`liq`)  
**Repo:** [li-cursor-agents](https://github.com/li-langverse/li-cursor-agents)

**Checkbox audit (dedupes lic [#184](https://github.com/li-langverse/lic/pull/184)):** [ph-db-10-checkbox-audit.md](./ph-db-10-checkbox-audit.md) — lic plan waves stay in **lic**; this file tracks PH-DB-10 only.

## North star

Replace Supabase-backed control-plane persistence and Postgres read MCP with:

| Today | PH-DB-10 target |
|-------|-----------------|
| `LI_CONTROL_PLANE_STORE=supabase` + Docker compose | `LI_CONTROL_PLANE_STORE=lidb` + `lis db start` (embedded **lidb**) |
| `@supabase/supabase-js` REST in `src/db/persist.ts` | **liorm** plans against lidb catalog |
| `li-control-plane-db` MCP + `src/db/read-query.ts` raw SQL | **liq** MCP (`read agent_runs limit 20`, allowlisted tables) |

Disk store (`LI_CONTROL_PLANE_STORE=disk`) stays for CI and offline dev; lidb is the production-shaped path without Docker.

## Store env (`LI_CONTROL_PLANE_STORE`)

| Value | Persistence | Agent read path |
|-------|-------------|-----------------|
| `supabase` (default) | Supabase REST + optional disk mirror | `li-control-plane-db` MCP + `read-query.ts` SQL |
| `disk` | JSON under `data/` | No DB MCP (disk cache only) |
| `lidb` | **liorm** → embedded lidb (PH-DB-10) | `li-control-plane-liq` MCP + `liq-query.ts` |

Legacy: `LI_STACK_SKIP_SUPABASE=1` → same as `disk`.

## Dependencies (sequenced)

1. **PH-DB-1** — `lidb` scaffold: migrations, pg-subset, registry schema  
2. **PH-DB-2** — `liorm` + `liq` + security regression harness (`lidb/tests/security/`)  
3. **PH-DB-3** — `lis` bundle: `lis db start|migrate|status`, `LI_DATA_DIR`, registry-min profile  
4. **PH-DB-4..9** — registry vertical, Realtime/Auth parity slices (as needed for control-plane tables only)  
5. **PH-DB-10** — wire `li-cursor-agents` store + e2e + MCP swap (this document)

## In-repo deliverables (stub PR)

| Path | Purpose |
|------|---------|
| `src/mcp/lidb-liq-mcp.ts` | MCP: `schema_snapshot`, `describe_table_liq`, `query_control_plane_liq` (mock via `liq-query.ts`) |
| `src/db/liq-query.ts` | Mock `read <table> limit N` + catalog snapshot until lidb engine wired |
| `src/e2e/lidb-control-plane.e2e.ts` | Skipped until `LI_CONTROL_PLANE_STORE=lidb` and `LI_E2E_LIDB=1`; `lidbE2eSkipReasons()` + partial live tests |
| `src/db/read-query.ts` | Deprecated for agents — prefer liq MCP |
| `src/mcp/mcp-config.ts` | `buildControlPlaneLiqMcpServers()` when store=lidb |
| `docs/plans/lidb-migration-control-plane.md` | Agent continuation (below) |

Existing Supabase e2e remains: `src/e2e/control-plane-db.e2e.ts` (`LI_E2E_DB=1`).

## Migration checklist (implementation)

- [ ] Extend `ControlPlaneStore` in `src/db/client.ts`: `"lidb"` alongside `supabase` \| `disk`
- [ ] `assertStoreReady()` when `lidb`: require `lis db status` healthy or `LI_LIDB_URL`
- [ ] `persist.ts`: liorm execute paths for `agent_runs`, handoffs, etc. (schema parity with `supabase/migrations/`)
- [x] Stub MCP: `li-control-plane-liq` + `liq-query.ts` mock (PH-DB-2/10 harness)
- [x] Stub e2e harness: `lidb-control-plane.e2e.ts` skip reasons + mock liq tests (`npm test` / `test:e2e:lidb`)
- [ ] Backfill: extend `scripts/backfill-control-plane-db.mjs` for lidb import from disk cache
- [ ] Un-skip `lidb-control-plane.e2e.ts` `test.todo` rows; gate CI optional job `LI_E2E_LIDB=1`
- [x] Deprecation note in `.env.example` for Supabase-only vars when `LI_CONTROL_PLANE_STORE=lidb`

## Security gates (must not regress)

- Read path: no raw mutating SQL from agents; liq compiles to parameterized plans (PH-DB-2 security tests)  
- Table allowlist unchanged (`CONTROL_PLANE_TABLES`)  
- MCP off by default in untrusted agents: keep `LI_CONTROL_PLANE_DB_MCP=0` / `LI_CONTROL_PLANE_LIQ_MCP=0` pattern  
- CVE-oriented regression names in `lidb/tests/security/` run in ecosystem CI before enabling lidb store by default

## Agent continuation

1. **Read:** this file; `src/mcp/lidb-liq-mcp.ts`; `src/db/liq-query.ts`; `src/e2e/lidb-control-plane.e2e.ts`; `src/e2e/control-plane-db.e2e.ts`; `src/db/read-query.ts` (deprecated for agents); `../lidb/docs/liq-spec.md` when PH-DB-2 lands  
2. **Run:** `npm run build && npm test` (disk store — includes `liq-query.test.ts`); optional lidb harness:  
   `LI_CONTROL_PLANE_STORE=lidb LI_E2E_LIDB=1 npm run build && LI_CONTROL_PLANE_STORE=lidb LI_E2E_LIDB=1 node --test dist/e2e/lidb-control-plane.e2e.js`  
3. **Then:** extend `configuredStore()` / `persist.ts` for `lidb`; wire `runLiqQuery` to real liorm when `LI_LIDB_URL` is set; remove `test.todo` rows in `lidb-control-plane.e2e.ts` as gates pass  
4. **Blocked on:** lidb engine + control-plane migrations accepting the same schema as `supabase/migrations/` — do not fake-pass persist e2e against Supabase URL  

## References

- E2E (current): `LI_E2E_DB=1` + `control-plane-db.e2e.ts`  
- E2E (future): `LI_CONTROL_PLANE_STORE=lidb` + `LI_E2E_LIDB=1` + `lidb-control-plane.e2e.ts`  
- MCP: `LI_CONTROL_PLANE_LIQ_MCP=0` disables liq tools; `LI_CONTROL_PLANE_LIQ_MCP=1` forces liq MCP even before default store flip  
- Skill: `.cursor/skills/explore-control-plane-db/SKILL.md` (update when liq MCP ships)  
- Proposal track: `../roadmap/proposals/lidb-li-data-platform.md` (PH-DB-0, when present)
