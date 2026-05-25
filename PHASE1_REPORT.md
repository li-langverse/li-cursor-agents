# Phase 1 PR lifecycle report (lic + benchmarks)

**Date:** 2026-05-25  
**Scope:** Ordered merges, dedupe (cherry-pick before close), CI repair on `main`, no new gap-implementation work.

---

## `origin/main` snapshot

| Repo | SHA | CI on `main` (latest observed) |
|------|-----|--------------------------------|
| **lic** | `98cdd7c684dd88f734356eca71bfc35cfd584557` | **RED** — `build-and-test` / `build-and-test-macos` / `lake-build` failing; root cause includes unresolved merge markers in `benchmarks/harness/verify.py` on `main` |
| **benchmarks** | `2f8cdc31f6e86c716e12b275ee83e454bef3a1a1` | **GREEN** — last completed run: merge #71 (agent-kit) |

---

## lic — ordered queue (#189 → #185 → #184 → #186)

| PR | Title | Outcome | Notes |
|----|-------|---------|-------|
| **#189** | fix(ci): test-auth-bearer via main.li httpd | **MERGED** | `2026-05-25T09:51:40Z` |
| **#187** | feat(2f): prove_lean_ok manifest (G-test-verify) | **CLOSED** (not merged) | Superseded; content absorbed via **#185** |
| **#185** | feat(2f): close G-test-verify + G-* docs | **MERGED** | `2026-05-25T09:56:56Z` — absorbs #187 intent |
| **#184** | chore(plans): sync plan checkboxes | **MERGED** | `2026-05-25T10:04:06Z` |
| **#186** | feat(plan-tracker): 8p-a parallel + Vision-LLM | **CLOSED** | Deduped: superseded by **#200** / **#205** / **#207** (no cherry-pick needed) |

---

## lic — proof-db / fresh-* consolidation

**Foundation merged (stack landed on `main` today):**

| PR | Branch | State |
|----|--------|-------|
| #239 | feat/proof-database-arch | MERGED |
| #242 | feat/proof-database-foundation | MERGED |
| #234 | feat/proof-db-math-axioms | MERGED |
| #238 | feat/proof-db-physics-axioms | MERGED |
| #243 | feat/proof-db-rebuild-pipeline | MERGED |
| #244 | feat/proof-db-discrepancies | MERGED |
| #241 | feat/proof-db-ci-gate | MERGED |
| #246 | feat/proof-db-lean-bridge | MERGED |
| #247 | feat/proof-db-report | MERGED |

**Fresh-wave merged (representative):** #197, #209, #219, #221, #225, #226, #227, #230, #233, #207, …

**Closed + absorbed (cherry-pick / dedupe):**

| PR | Branch | Action |
|----|--------|--------|
| **#231** | feat/proof-db-rebuild | **CLOSED** — duplicate of #243 pipeline |
| **#248** | feat/ph-db-0-lidb-proposal | **CLOSED** — PH-DB-0 doc cross-link cherry-picked onto **#264**; bench commits already on `main` via #225 |
| #211 | feat/fresh-7e-tier1 | CLOSED (superseded) |
| #214 | feat/fresh-8p-jobs | CLOSED (superseded by #200 family) |

**Remote branches still present without open PRs** (safe to delete after #264 merges):  
`feat/proof-db-rebuild`, `feat/fresh-gap-sweep`, `feat/fresh-7e-tier1`, `feat/fresh-8p-jobs`, …

---

## lic — CI repair (this session)

| PR | Branch | Purpose | Status |
|----|--------|---------|--------|
| **#264** | `fix/main-verify-py-conflict` | Remove `verify.py` conflict markers + cherry-pick PH-DB-0 docs from #248 | **OPEN** — CI **RED** (`build-and-test`, `lake-build`, `registry-and-tier0` failing on latest push) |

**Merge attempt:** `gh pr merge 264` → **blocked** by branch protection (requires `merge-approved` label + green checks + human review).

---

## lic — remaining open PRs (post–Phase 1; not merged here)

| PR | Head | Merge state | CI (build-and-test) | Phase note |
|----|------|-------------|---------------------|------------|
| **#264** | fix/main-verify-py-conflict | BLOCKED (policy) | RED | **Phase 1** — unblocks `main` |
| #251 | feat/vertical-gap-bench-lig | BEHIND | FAILURE | Gap implementation — out of scope |
| #252 | feat/vertical-gap-mcp-chem | BLOCKED | FAILURE | Gap implementation — out of scope |
| #253 | feat/vertical-gap-sim-step-physics | BLOCKED | FAILURE | Gap implementation — out of scope |
| #245 | feat/lic-execution-resources | DIRTY (conflicts) | — | Stacked on native-parallel |
| #194 | cursor/compiler-studio-plan-loop | DIRTY | FAILURE | Studio wave |
| #195 | feat/studio-docs-def-not-proc | DIRTY | — | Docs |
| #188 | cursor/sim-algo-plan-loop | DIRTY | — | Sim |
| #183 | cursor/compiler-only-vc-witness | DIRTY | FAILURE | Compiler VC |

---

## benchmarks

| PR | Title | Outcome |
|----|-------|---------|
| **#70** | fix(audit): plan-completion-audit false positives | **MERGED** (when green — already merged `2026-05-25`) |
| **#72** | tier_db_registry skeleton | **OPEN** — CI green, **merge blocked** (branch policy / no `merge-approved`) |
| **#73** | WP3 release manifest foundation | **OPEN** — CI green, **merge blocked** |
| **#74** | PH-DB-G0 tier_db graph stubs | **OPEN** — UNSTABLE (new; out of Phase 1 gap scope) |

**Merge attempts:** `gh pr merge 72|73` → base branch policy prohibits merge without approval workflow.

---

## Human blockers

1. **Branch protection** — `merge-approved` label + reviewer merge required on both repos (agents cannot self-merge).
2. **lic `main` CI red** until **#264** is green and merged (conflict markers on `main` today).
3. **#264 CI** still failing beyond `verify.py` — needs log triage (`lake-build`, `registry-and-tier0`, `build-and-test`); may be stack/regression from #228/#250 merges.
4. **Gap PRs #251–#253** — intentionally left open; failing CI; not part of Phase 1.

---

## Recommended next actions (human)

1. Review and label **lic #264** `merge-approved` when CI green → merge to restore `main`.
2. Review **benchmarks #72**, **#73** (green CI) → `merge-approved` → merge.
3. Delete stale remote branches listed above after #264 lands.
4. Defer **#251–#253**, **#74**, and dirty studio/sim/compiler PRs to Phase 2 / gap implementation.

---

## Session artifacts

- **lic #264:** https://github.com/li-langverse/lic/pull/264  
- **Closed #248** with absorption comment pointing to #264.
