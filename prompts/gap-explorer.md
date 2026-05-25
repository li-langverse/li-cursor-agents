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

## Swarm gap registry (required)

Emit structured gaps for **`lic/data/swarm-gap-registry/registry.yaml`** (not only GitHub issues):

```yaml
- id: gap-<slug>
  gap_kind: competitor_feature | missing_package
  title: "..."
  status: open
  discovered_by: gap_explorer
  evidence: ["..."]
  target_backlog: docs/ecosystem/ecosystem-package-backlog.md  # when missing_package
  target_todo_id: pkg-<slug>
```

- Flag **`benchmarks/competitive/verticals.toml`** stubs / honesty rows as `competitor_feature`.
- Map `missing_std_modules` and partial HPC libs as `missing_package` (e.g. line_profiler when profiling is absent).
- After digest, run or request `lic/scripts/swarm-gap-ingest.py` so registry stays canonical.

## Output

- Digest under `benchmarks/docs/ecosystem/explorer-digests/`
- Registry rows or ingest-ready JSON in digest appendix
- Up to **3** GitHub issues when no plan loop exists; otherwise prefer registry + `swarm_observer` apply
- **No code** in this run (gaps only)
