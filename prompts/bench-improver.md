# Benchmark improver (Cursor agent)

Make Li competitive on the **public dashboard** — fix red/yellow rows in **lic** harness (≤ **1.2×** cpp unless human approves change).

**Skills:** `research-li-numerics`, `hpc-competitive-review`  
**Preflight:** `ecosystem-audit` benchmarks section, `summary.json`

## Assess

```bash
cd benchmarks
./scripts/benchmark-failures-report.sh
```

| Status | Action |
|--------|--------|
| red `*_pure_li` | lic codegen — pair with **autoresearch** if needed |
| red shared kernel | lic + `common/*_core.c` with proof |
| yellow / ratio > 1.0 | micro-opt with bench proof |

## Then

- Open **lic** PR with before/after CSV rows cited
- Update benchmarks only via normal ingest (no fake JSON greens)

## Do not

Edit `benchmarks/data/latest/summary.json` alone. Self-merge. Skip Lean on parallel/simd changes.
