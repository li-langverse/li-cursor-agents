# Release notes: 2026-05-25 — ph-db-lidb-store-stub

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PR:** (feat/lidb-control-plane-store)  
**PH / REQ:** PH-DB-10  
**Author:** agent

---

## Summary (one sentence)

Adds `ControlPlaneStore: "lidb"` with `assertStoreReady()` / disk-mirror persist and `lidb-persist.ts` liorm stub hooks (no secrets) ahead of real lidb engine wiring.

## Agent continuation (required)

1. **Read:** `docs/plans/ph-db-10-checkbox-audit.md`, `src/db/client.ts`, `src/db/lidb-persist.ts`, `src/db/persist.ts`, `../lidb/liorm/README.md`
2. **Run:** `npm run build && npm test`; optional `npm run test:e2e:lidb` with `LI_LIDB_MOCK=1`
3. **Then:** backfill script for lidb; wire `lidb-persist.ts` + `runLiqQuery` to real liorm when `LI_LIDB_URL` engine accepts `supabase/migrations/` schema
4. **Blocked on:** lidb engine migrations + liorm execute in **lidb** repo — **none** for merging this stub PR

## Changed (specific)

| Area | What | Evidence |
|------|------|----------|
| Store type | `ControlPlaneStore` includes `lidb`; `useLidbStore()`, `lidbStoreReady()` | `src/db/client.ts`, `client.test.ts` |
| Readiness | `assertStoreReady()` for lidb: `LI_LIDB_URL` or `LI_LIDB_MOCK=1` | `client.test.ts` |
| Persist | Disk mirror always; liorm stub hooks per table | `persist.ts`, `lidb-persist.ts`, `lidb-persist.test.ts` |
| State IPC | Mirror `state.json` when store=lidb | `src/control-plane/state.ts` |
| Docs | Checkbox audit 6/8 closed | `docs/plans/ph-db-10-checkbox-audit.md`, `lidb-migration-control-plane.md` |
| Env | Document `LI_LIDB_MOCK=1` | `.env.example` |

## Not changed (scope fence)

- Real liorm `execute()` against lidb engine — stub logs once when `LI_LIDB_URL` set without `LI_LIDB_MOCK=1`
- `scripts/backfill-control-plane-db.mjs` lidb import
- E2E `test.todo` rows in `lidb-control-plane.e2e.ts`
- Default dev profile flip to `lidb`
- lic plan checkbox waves (lic #184)

## Breaking changes

None.

## Security

N/A — no new secrets; connection URL remains env-only (`LI_LIDB_URL`). Stub persist does not accept credentials in repo.

## Performance

N/A — disk-mirror path only until liorm wired.

## Downstream

| Repo | Action |
|------|--------|
| lidb | PH-DB-2 liorm execute + control-plane schema migrations |
| lis | `lis db start` health check optional future enhancement for `assertStoreReady()` |

## CHANGELOG entry (paste into Unreleased)

```markdown
### Added
- **PH-DB-10 lidb store stub** — `ControlPlaneStore: "lidb"`, `assertStoreReady()` / `lidbStoreReady()`, `lidb-persist.ts` hooks + disk mirror (`docs/plans/ph-db-10-checkbox-audit.md`).
```
