---
name: explore-li-ecosystem
description: >-
  Scan the Li org for gaps and pick the correct workflow repo before edits (lic, studio, ui,
  sim, benchmarks). Use for ecosystem explorer discovery and goal-directed implementer runs.
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

## Workflow repo routing (implementers)

**Before any file edit**, choose the GitHub repo for the isolated clone (`LI_REPO_WORKFLOW_REPO` / `--workflow-repo`).

| Priority | Source |
|----------|--------|
| 1 | Goal frontmatter `workflow_repo:` or line `Workflow repo: <name>` |
| 2 | Briefing `implementation_queue[].repo` or issue/PR URL host repo |
| 3 | Path/topic table below |
| 4 | Agent default (`code_implementer` → `li-demo` only if no signal) |

| Repo | Edit here when |
|------|----------------|
| **lic** | `std/`, `li-tests/`, compiler, httpd (`li-tests/httpd/`, `scripts/httpd-*`), master-plan PH-2* |
| **studio** | World Studio UX, `PH-GD-*`, `PH-UX-*`, `world.li`, viewport/outliner |
| **ui** | `li-ui` package, shared UI components |
| **sim** | `li-sim`, simulation / numerics package code |
| **render** | `li-render` |
| **benchmarks** | `agent-briefing.py`, explorer digests, catalog only |
| **li-cursor-agents** | Agent registry, dashboard, prompts, skills |
| **lip** / **lit** | Package manager / test runner |
| **li-demo** | Agent-kit templates, CI snippets |

```bash
./scripts/goal-directed-loop.sh --goal-file goal.md --workflow-repo lic --cwd ../lic
```

`run-agent` infers `workflow_repo` from `--goal-file` when `--workflow-repo` is omitted (`src/agents/resolve-workflow-repo.ts`).

Do **not** land studio/ui/sim product code in **lic** unless the handoff or plan explicitly says lic hosts the scaffold.

---

## Related

- [ecosystem-explorer.md](../../../docs/ecosystem/ecosystem-explorer.md)
- `ecosystem-first` — catalog before one-offs
- `research-li-numerics` — after a specific kernel is chosen
- `repo-workflow-tools.md` — isolated clone + PR template
