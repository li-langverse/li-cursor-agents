---
name: publish-research-whitepaper
description: >-
  Publish goal-directed research as a whitepaper in the research-findings repo —
  README with frontmatter, snippets/, artifacts.json; rebuild index via script.
  Use when finishing numerics_researcher, goal_researcher, or security_auditor
  research-mode runs.
---

# Publish research whitepaper

Every **research-mode** run must leave a scannable whitepaper in **research-findings** (sibling of `li-cursor-agents` under `li-langverse`).

## Paths

| Item | Default |
|------|---------|
| Repo root | `../research-findings` from `li-cursor-agents` |
| Override | `LI_RESEARCH_FINDINGS_ROOT` |
| Whitepaper dir | `whitepapers/YYYY-MM/<goal_id>/<slug>/` |
| Template | `research-findings/templates/whitepaper-template.md` |

`slug` = backlog todo id or short kebab (e.g. `md-r1-stability-matrix`).

## Required files (each run)

1. **`README.md`** — copy template; fill executive summary, analysis, grade matrix, recommendations.
2. **`artifacts.json`** — machine metadata (see schema below).
3. **`snippets/`** — any code blocks referenced from README (`.li`, `.toml`, `.md`, …).

## README frontmatter (required)

```yaml
---
goal_id: <from research-goals.yaml>
agent: <agent id>
run_id: <cursor run id>
generated_at: <ISO-8601 UTC>
domains: [scientific_computing, hpc]
validity_grade: study-only | verified | draft
title: "<short title>"
status: active | superseded | draft
links:
  - lic/docs/...
  - https://li-langverse.github.io/benchmarks/
---
```

**validity_grade:** `study-only` until bench/test evidence is attached; `verified` only when manifest/bench ids are cited and reproducible.

## artifacts.json schema

```json
{
  "version": 1,
  "goal_id": "md_sim_algorithms",
  "agent": "numerics_researcher",
  "run_id": "numerics_researcher-123",
  "generated_at": "2026-05-25T12:00:00Z",
  "slug": "md-r1-stability-matrix",
  "title": "...",
  "domains": ["scientific_computing", "hpc"],
  "validity_grade": "study-only",
  "status": "active",
  "links": ["lic/docs/..."],
  "markdown_path": "whitepapers/2026-05/.../README.md",
  "snippets_dir": "whitepapers/2026-05/.../snippets"
}
```

## After writing

```bash
cd li-cursor-agents
./scripts/publish-research-whitepaper.sh
```

Commits **index.yaml** + **SCAN.md** in the same PR/commit as the whitepaper when possible.

## Still required in lic/benchmarks

Whitepapers **supplement** (do not replace):

- `docs/numerics/studies/` or `docs/security/studies/` for deep dives linked from whitepaper
- `li-tests/`, `benchmarks/` file changes when claiming implementation progress

## Config

`config/research-goals.yaml` — `publish_repo: research-findings` and `whitepaper_root` per goal (or defaults block).
