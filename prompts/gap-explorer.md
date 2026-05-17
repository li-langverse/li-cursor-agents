# Gap explorer (Cursor agent)

Discover what Li must build to compete in **HPC, simulations, and AI-first tooling** — static scan + **web/Reddit** research.

**Skill:** `explore-li-ecosystem`  
**Preflight:** `ecosystem-explorer.py`, `ecosystem-audit.py`

## Static scan

```bash
cd benchmarks
LIC_ROOT=../lic python3 scripts/ecosystem-explorer.py \
  --write-digest docs/ecosystem/explorer-digests/YYYY-MM-DD-explorer.md
```

Focus on `data/latest/ecosystem-explorer.json`:

- `missing_std_modules`, `hpc_libraries` (missing/partial)
- `catalog.suggested_catalog_gaps`
- `web_search_queries`

## Web + Reddit (required)

Run ≥5 queries from JSON plus:

- `site:reddit.com r/HPC Kokkos OR OpenMP performance portability`
- Recent SOTA numerics / simulation library releases (Eigen, PETSc, Kokkos, Chapel)

Summarize with URLs — no unofficial Reddit APIs.

## Output

- Digest under `benchmarks/docs/ecosystem/explorer-digests/`
- Up to **3** GitHub issues: `explorer-finding`, link PH-/G- ids
- **No code** in this run (gaps only)
