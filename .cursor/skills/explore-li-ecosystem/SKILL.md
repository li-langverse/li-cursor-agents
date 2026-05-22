---
name: explore-li-ecosystem
description: >-
  Scan the Li org for missing std/libs, catalog gaps, and HPC parity vs Eigen/Kokkos/PETSc;
  use web/Reddit search for external signals; file explorer-finding or ecosystem-gap issues.
---

# Explore Li ecosystem

Use for **discovery** (what to build next), not for merging PRs or fixing CI reds.

## When to use

- Weekly/biweekly **ecosystem explorer** automation
- Before a major **stdlib** or **physics package** roadmap pass
- When user asks: missing libraries, language improvements, Reddit/HPC comparisons

## Do not use for

- Red benchmark fixes → `research-li-numerics` + lic codegen
- CI/merge queue → `ecosystem-health`, `plan-merge-queue`, `merge-approved-pr`

---

## 1. Local scan (required)

```bash
cd benchmarks
LIC_ROOT=../lic python3 scripts/ecosystem-explorer.py \
  --write-digest docs/ecosystem/explorer-digests/latest.md
python3 scripts/ecosystem-audit.py   # optional: CI/bench posture
cat data/latest/ecosystem-explorer.json
```

Read:

- `missing_std_modules` — PH-IO blockers
- `hpc_libraries` where `li_status` is `missing` or `partial`
- `catalog.suggested_catalog_gaps`
- `web_search_queries`

---

## 2. External research (required in automation)

Run **3–6** queries from `web_search_queries` using Cursor **web search** (not scripted scraping).

| Channel | Focus |
|---------|--------|
| **Reddit** | `site:reddit.com r/HPC …`, r/ProgrammingLanguages language design |
| **Web** | Kokkos/PETSc/Eigen/FFTW parity, new systems languages |
| **GitHub** | LLVM parallel IR, upstream patterns |

For each hit worth tracking:

1. One-line **insight**
2. **Li implication** (stdlib / compiler / catalog / package)
3. **Priority** P0–P2 vs [vision-and-roadmap](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/vision-and-roadmap.md)

---

## 3. HPC library rubric

For each row in `hpc_libraries` with `li_status != "present"`:

| Library | Ask |
|---------|-----|
| Eigen / BLAS | Dense LA, decompositions — does `horner_pure_li` / matmul tier prove codegen? |
| Kokkos / OpenMP | Parallel loops — map to `std/execution` + LLVM lowering plan |
| PETSc / hypre | PDE solvers — physics packages vs real solvers |
| FFTW | FFT micro-bench missing? |
| SUNDIALS | Stiff ODE — tier-2 integrator depth |

Cross-check [catalog.toml](../../../catalog.toml) and lic `packages/li-std-physics-*`.

---

## 4. File issues (no code until plan-approved)

**Tooling missing in org:**

```bash
python3 scripts/file-ecosystem-gap-issue.py --repo lic --title "..." \
  --what-tried "..." --expected "..." --blocked "..."
```

**Feature / language / new bench:**

- Repo: usually `lic` or `benchmarks`
- Labels: `feature` or `ecosystem-gap`, **`explorer-finding`**, `plan-needed`
- Body: link digest `docs/ecosystem/explorer-digests/latest.md` or JSON snippet
- Cite Reddit/web URLs

---

## 5. Deliverable

Post or commit:

1. **Executive summary** (≤10 bullets): gaps, opportunities, risks
2. **Top 3 recommended issues** to open (titles + repos)
3. **Deferred** items (nice-to-have, out of PH scope)

Do **not** self-merge. Do **not** add Actions `cron:`.

---

## Related

- [ecosystem-explorer.md](../../../docs/ecosystem/ecosystem-explorer.md)
- `ecosystem-first` — catalog before one-offs
- `research-li-numerics` — after a specific kernel is chosen
