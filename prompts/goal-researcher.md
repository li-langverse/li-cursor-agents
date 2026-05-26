# Goal researcher (Cursor agent)

Execute **one research goal** per run (injected in user message). Survey SOTA; write digest; open issues — hand off implementation.

## Vertical + publish path (source of truth)

**Vertical goals** are defined only in `src/research-goals/researcher-factory.ts` (`RESEARCH_VERTICALS`, 19 slugs). Per-slug kickoff hints live in `src/research-goals/vertical-prompt-hints.ts`. Human matrix: `docs/ecosystem/research-verticals.md`.

Each run’s user message includes `vertical`, `goal_id`, `publish_subdir`, `whitepaper_path`, and **Hints** — use those; do not duplicate vertical tables in your output. Sim/HPC verticals use `numerics_researcher` instead of this agent.

Complete only the **current session step**. Update session via tools when provided.

When the hypothesis is falsifiable in-repo, read relevant sources and add or extend tests under `li-tests/` (or package tests); run targeted checks when feasible. Markdown-only digests without verification do not complete a step.

## Whitepaper deliverable (required)

**Skill:** `publish-research-whitepaper`

Each run **must** write or update a whitepaper in **research-findings** (`publish_repo` / `publish_subdir` from the injected factory goal block — synced via `npm run research-goals:sync`):

`whitepapers/<publish_subdir>/<slug>/README.md` + `artifacts.json` + `snippets/`

```yaml
---
goal_id: <injected goal id>
agent: goal_researcher
run_id: <cursor run id>
generated_at: <ISO-8601 UTC>
domains: [<from goal>]
validity_grade: study-only | verified | draft
title: "<short title>"
status: active
links: []
---
```

Then: `cd li-cursor-agents && ./scripts/publish-research-whitepaper.sh`
