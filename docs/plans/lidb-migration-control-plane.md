# PH-DB-10: Control-plane migration to lidb

**Status:** Stub / harness only (this repo)  
**Plan phase:** PH-DB-10 (after PH-DB-1..3 engine + `lis` bundle, PH-DB-2 `liorm`/`liq`)  
**Repo:** [li-cursor-agents](https://github.com/li-langverse/li-cursor-agents)

## North star

Replace Supabase-backed control-plane persistence and Postgres read MCP with:

| Today | PH-DB-10 target |
|-------|-----------------|
| `LI_CONTROL_PLANE_STORE=supabase` + Docker compose | `LI_CONTROL_PLANE_STORE=lidb` + `lis db start` (embedded **lidb**) |
| `@supabase/supabase-js` REST in `src/db/persist.ts` | **liorm** plans against lidb catalog |
| `li-control-plane-db` MCP + `src/db/read-query.ts` raw SQL | **liq** MCP (`read agent_runs limit 20`, allowlisted tables) |

Disk store (`LI_CONTROL_PLANE_STORE=disk`) stays for CI and offline dev; lidb is the production-shaped path without Docker.

## Dependencies (sequenced)

1. **PH-DB-1** — `lidb` scaffold: migrations, pg-subset, registry schema  
2. **PH-DB-2** — `liorm` + `liq` + security regression harness (`lidb/tests/security/`)  
3. **PH-DB-3** — `lis` bundle: `lis db start|migrate|status`, `LI_DATA_DIR`, registry-min profile  
4. **PH-DB-4..9** — registry vertical, Realtime/Auth parity slices (as needed for control-plane tables only)  
5. **PH-DB-10** — wire `li-cursor-agents` store + e2e + MCP swap (this document)

## In-repo deliverables (stub PR)

| Path | Purpose |
|------|---------|
| `src/e2e/lidb-control-plane.e2e.ts` | Skipped until `LI_CONTROL_PLANE_STORE=lidb` and `LI_E2E_LIDB=1`; `test.todo` checklist for persist/read/security/MCP |
| `src/db/read-query.ts` | Comment: Supabase SQL probe → future **liq** MCP |
| `docs/plans/lidb-migration-control-plane.md` | Agent continuation (below) |

Existing Supabase e2e remains: `src/e2e/control-plane-db.e2e.ts` (`LI_E2E_DB=1`).

## Migration checklist (implementation)

- [ ] Extend `ControlPlaneStore` in `src/db/client.ts`: `"lidb"` alongside `supabase` \| `disk`
- [ ] `assertStoreReady()` when `lidb`: require `lis db status` healthy or `LI_LIDB_URL`
- [ ] `persist.ts`: liorm execute paths for `agent_runs`, handoffs, etc. (schema parity with `supabase/migrations/`)
- [ ] Replace or alias MCP: `li-control-plane-liq` using `lidb/liq` catalog + allowlist (same tables as `schema-catalog.ts`)
- [ ] Backfill: extend `scripts/backfill-control-plane-db.mjs` for lidb import from disk cache
- [ ] Un-skip `lidb-control-plane.e2e.ts` todos; gate CI optional job `LI_E2E_LIDB=1`
- [ ] Deprecation note in `.env.example` for Supabase-only vars when `lidb` is default in dev profiles

## Security gates (must not regress)

- Read path: no raw mutating SQL from agents; liq compiles to parameterized plans (PH-DB-2 security tests)  
- Table allowlist unchanged (`CONTROL_PLANE_TABLES`)  
- MCP off by default in untrusted agents: keep `LI_CONTROL_PLANE_DB_MCP=0` / future `LI_CONTROL_PLANE_LIQ_MCP=0` pattern  
- CVE-oriented regression names in `lidb/tests/security/` run in ecosystem CI before enabling lidb store by default

## Agent continuation

1. Read: this file, `src/e2e/control-plane-db.e2e.ts`, `src/e2e/lidb-control-plane.e2e.ts`, `src/db/read-query.ts`, `src/mcp/control-plane-db-mcp.ts`, `../lidb/docs/liq-spec.md` (when PH-DB-2 PR lands)  
2. Confirm WP1–WP3 merged or available locally: `lidb` repo, `lis db start`, `liq` AST smoke  
3. Implement `configuredStore() === "lidb"` branch in `client.ts` + `persist.ts`; run `npm test` (disk mock unchanged)  
4. Flesh out `lidb-control-plane.e2e.ts` todos; add `test:e2e:lidb` script mirroring `LI_E2E_DB` pattern  
5. Open PR removing `test.todo` rows as each gate passes; update `CHANGELOG.md` [Unreleased]  
6. Blocked on: lidb engine accepting control-plane migrations — do not fake-pass e2e against Supabase URL

## References

- E2E (current): `LI_E2E_DB=1` + `control-plane-db.e2e.ts`  
- E2E (future): `LI_CONTROL_PLANE_STORE=lidb` + `LI_E2E_LIDB=1` + `lidb-control-plane.e2e.ts`  
- Skill: `.cursor/skills/explore-control-plane-db/SKILL.md` (update when liq MCP ships)  
- Proposal track: `../roadmap/proposals/lidb-li-data-platform.md` (PH-DB-0, when present)
