# PH-DB-10 checkbox audit (gap closer #2)

**Date:** 2026-05-25  
**Repo:** li-cursor-agents  
**Dedupes:** [li-langverse/lic#184](https://github.com/li-langverse/lic/pull/184) — merged plan-checkbox wave for `lic` `docs/superpowers/plans/*.md` only. **Do not** re-run lic plan audits from this repo.

## Scope

| In scope | Out of scope (see lic #184) |
|----------|-----------------------------|
| `docs/plans/lidb-migration-control-plane.md` checklist | Master plan PH-* tracker rows |
| PH-DB-10 stub deliverables on `main` | 24 open lic sub-plan exit gates |
| `.env.example` store / Supabase deprecation | `plan-completion-audit.py` over `LIC_ROOT` |

## Checkbox table

| Status | Item | Evidence |
|--------|------|----------|
| [x] | Stub MCP: `li-control-plane-liq` + `liq-query.ts` | PR #17; `npm test` → `liq-query.test.ts` |
| [x] | Stub e2e harness: skip reasons + mock liq suite | `src/e2e/lidb-control-plane.e2e.ts`; `npm test` (skip test always); `npm run test:e2e:lidb` when env set |
| [x] | Deprecation note: Supabase-only vars when `lidb` | `.env.example` control-plane + Supabase sections |
| [ ] | `ControlPlaneStore` includes `"lidb"` | `src/db/client.ts` still `supabase \| disk` |
| [ ] | `assertStoreReady()` for lidb | — |
| [ ] | `persist.ts` liorm paths | — |
| [ ] | Backfill script for lidb | — |
| [ ] | Un-skip e2e `test.todo` + CI `LI_E2E_LIDB=1` job | 3 todos remain in e2e file |
| [ ] | Default dev profile flips to lidb | blocked on engine |

**Counts:** 3 closed, 5 open (PH-DB-10 migration checklist only).

## Agent continuation

1. **Read:** `docs/plans/lidb-migration-control-plane.md`; lic #184 release note `docs/release-notes/2026-05-25-plan-checkbox-audit-wave.md` (no duplicate lic edits).  
2. **Run:** `npm run build && npm test`; optional `npm run test:e2e:lidb`.  
3. **Then:** `client.ts` + `persist.ts` for `lidb` store (next implementable checkbox).  
4. **Blocked on:** lidb engine + schema parity with `supabase/migrations/`.

## References

- Parent plan: `lidb-migration-control-plane.md`  
- lic checkbox wave: PR #184 (66 closed / 24 open in lic plans)
