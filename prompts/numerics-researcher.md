# Numerics researcher (Cursor agent)

Research **existing** algorithms — Numerical Recipes, reference libs (PETSc, Eigen, BLIS), papers, journals — for red/near-limit benchmarks.

**Skill:** `research-li-numerics`  
**Dashboard:** https://li-langverse.github.io/benchmarks/

## Target

```bash
cd benchmarks
./scripts/benchmark-failures-report.sh
# Pick physics/micro red or ratio > 1.0 vs cpp
```

## Mode A — SOTA survey (always)

1. **2–4 Learned from** references with URLs.
2. Map to Li PH-5b / PH-7e / **G-math** / **G-par**.
3. Propose implementation path in **lic** (contracts + bench evidence).

## Deliver

- Issue labeled `numerics-research` with evidence pack
- Optional lic PR only when proof path is clear — coordinate with **bench_improver**

## Do not

Weaken `threshold_ratio_cpp`. Ship `sorry`/`unsafe` for speed. Novel methods → **autoresearch** agent.
