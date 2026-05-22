---
name: research-li-numerics
description: >-
  Survey SOTA numerics and reference implementations; align with Li vision and
  numerical policy; produce evidence packs (stability, speed, accuracy, plots,
  animations). Use for physics kernels, integrators, and benchmark work in lic.
  For novel algorithms use numerics-autoresearch after this survey step.
---

# Research Li numerics

**Canonical methodology:** [research-methodology.md](https://github.com/li-langverse/benchmarks/blob/main/docs/numerics/research-methodology.md)

Use for **tier-0/1/2** kernels, **li-std-physics-***, and **catalog.toml** rows. Work in **lic**; ingest and dashboard in **benchmarks**.

**Org alignment (read first):**

- Skill **`ecosystem-first`** — harness, ingest, visuals; file **`ecosystem-gap`** if measurement missing
- Skill **`li-ecosystem-discipline`** — Learned from, CVE, release notes, PR-only
- [vision-and-roadmap](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/vision-and-roadmap.md) — PH-5b, PH-7e
- [lic numerical policy](https://github.com/li-langverse/lic/blob/main/docs/physics/numerical-policy.md)
- Automation [benchmark-visual-validation](https://github.com/li-langverse/benchmarks/tree/main/.cursor/automations/benchmark-visual-validation.md) — oracle = shared **cpp** cores

---

## Mode A — SOTA survey & numerical recipes

### 1. Frame the problem

- Governing equations, BCs, invariants (energy, mass, div **u** = 0, …)
- Stiffness, characteristic scales, failure modes (blow-up, resonance, locking)

### 2. Survey SOTA (required)

Research **published recipes** and **reference implementations**:

| Source type | Examples |
|-------------|----------|
| Texts / surveys | Hairer (ODE), LeVeque (hyperbolic), Trefethen (spectral), standard MD/stat mech |
| Libraries | PETSc, Eigen, FFTW, Kokkos patterns; Julia/Rust crates cited in org benches |
| Org oracle | `lic/benchmarks/common/*_core.c` — **cpp/rust/julia** share these kernels |

Document in the study:

- **2–4 “Learned from”** entries (citation + what you took)
- Why this discretization/integrator for Li (SIMD, pure-Li, GPU-later, etc.)
- Error/stability conditions (CFL, symplectic vs dissipative, preconditioner class)

### 3. Map to Li + benchmarks

- Implementation path under `lic/packages/` or `lic/benchmarks/tier*/`
- `params.toml` / tier-0 stability per numerical policy
- `benchmarks/catalog.toml` row + `./scripts/ingest/ingest-lic.sh`

### 4. Do not

- Copy harness into **benchmarks**
- Relax `threshold_ratio_cpp` or tier-0 tolerances without human approval
- Ship speed-only claims without stability + (for physics) **visual** evidence

---

## Mode B — Autoresearch (novel methods)

Agents **may** propose new equations, splittings, or Li-specific algorithms when SOTA is insufficient.

**Delegate to skill `numerics-autoresearch`** for full gates. Minimum extra requirements:

1. `docs/numerics/algorithms/<slug>.md` from [algorithm-note-template](../../../docs/numerics/algorithm-note-template.md)
2. PR labels: `novel-algorithm`, `numerics-research` (when available)
3. Explicit **novelty vs SOTA** table in algorithm note
4. Human-verifiable math (discrete equations, pseudocode, stability argument or parameter sweep)

Novel work **must still pass** quality criteria below — invention is not an excuse to skip evidence.

---

## Quality criteria (improvement required)

Accept only if **≥1 axis improves** and **no locked axis regresses**:

| Axis | Evidence |
|------|----------|
| **Stability** | tier-0; energy drift PNG; `md_stability_by_lang`; GIF sanity |
| **Speed** | `bench.py`; `ratio_vs_cpp` ≤ catalog threshold |
| **Accuracy** | error vs fine grid / reference solution |
| **Memory** | peak RSS if claimed win |

Default **locked:** stability + accuracy. Do not trade them for speed without documented human approval in the study.

---

## Evidence pack (every numerics PR)

Create **`docs/numerics/studies/YYYY-MM-DD-<slug>.md`** with:

1. Problem + SOTA summary (Mode A) or pointer to algorithm note (Mode B)
2. **Quality table** — before/after per axis
3. **Commands** — exact `bench.py`, ingest, render scripts
4. **Plots** — speed bars, stability time series, error norms
5. **Animations** — tier-2 GIFs where applicable
6. **Dashboard** link + ingest freshness

```bash
cd lic/benchmarks/harness
python3 bench.py <relevant-args>

cd benchmarks
LIC_ROOT=../lic ./scripts/render-benchmark-visuals.sh
./scripts/benchmark-failures-report.sh
python3 scripts/numerics-evidence-checklist.py \
  --study docs/numerics/studies/YYYY-MM-DD-slug.md \
  [--novel]
```

Attach **raw GitHub links** to PNG/GIF/zip (see benchmark-visual-validation §4).

---

## Workflow checklist

- [ ] Read vision PH-5b / PH-7e and numerical policy
- [ ] SOTA survey with Learned from (2–4)
- [ ] Implementation + tests in **lic**
- [ ] tier-0 stability + tier-2 (or tier-1) benches green
- [ ] Visuals rendered and vision-reviewed (physics)
- [ ] Study doc + checklist script pass
- [ ] `catalog.toml` + ingest if new bench
- [ ] Release notes (`write-li-release-notes`) before PR
- [ ] PR only; no self-merge; no force push

---

## Related

| Resource | Role |
|----------|------|
| `numerics-autoresearch` | Novel algorithm gates |
| `failed-benchmarks-maintainer` | Fix red dashboard rows |
| `benchmark-visual-validation` | GIF/PNG oracle review |
| [studies/README](../../../docs/numerics/studies/README.md) | Study file location |
