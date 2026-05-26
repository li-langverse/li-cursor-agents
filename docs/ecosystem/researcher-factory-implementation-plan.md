# Researcher factory — implementation plan (WP tracker)

**Branch:** `feat/goal-directed-swarm`  
**Runtime source of truth:** `src/research-goals/researcher-factory.ts`  
**Prior design:** [researcher-factory-plan.md](./researcher-factory-plan.md)

## Sequential work packages

| WP | Status | Deliverable |
|----|--------|-------------|
| WP-0 | done | Inventory: `load-goals.ts`, `research-lane.ts`, `registry.ts`, `run-researchers-long.sh`, prompts |
| WP-1 | done | `researcher-factory.ts` — 19 `RESEARCH_VERTICALS`, auxiliary goals, agent routing |
| WP-2 | done | `research-goal-context.ts` — kickoff blocks, `ResearchFactoryContext`, run-input metadata |
| WP-3 | done | Research lane + session lifecycle inject factory vertical/publish/hints |
| WP-4 | done | `runner.ts` / `buildRunInput` — `research_vertical`, `publish_subdir` on traces |
| WP-5 | done | Prompts + `vertical-prompt-hints.ts` (all 19 slugs) + publish skill path |
| WP-6 | done | Tests: factory, context, YAML sync, lane integration |
| WP-final | done | `npm test`, `npm run build`, commit + push |

## Parallel execution groups (for agents)

### P1 — Registry + run context

- `src/agents/registry.ts` — `numerics_researcher`, `goal_researcher`, auxiliary researchers (no per-vertical agents)
- `src/runner.ts`, `src/types.ts` — `researchContext` on `AgentRunOptions`
- `src/lanes/research-lane.ts` — pass `factoryContext` into `runAgent`

### P2 — Prompts + hints

- `src/research-goals/vertical-prompt-hints.ts` — per-slug kickoff lines
- `prompts/goal-researcher.md`, `prompts/numerics-researcher.md`
- `.cursor/skills/publish-research-whitepaper/SKILL.md` — `publish_subdir` from factory

### P3 — Tests + YAML sync

- `researcher-factory.test.ts`, `research-goal-context.test.ts`, `research-goals-sync.test.ts`
- `research-lane.test.ts`, `load-goals.test.ts`
- Regression: committed `config/research-goals.yaml` matches `serializeResearchGoalsYaml(buildResearchGoalsFromFactory())`

### P4 — Docs

- `docs/ecosystem/research-verticals.md` — matrix + factory tuning note
- This file

## Agent model (not 19 agents)

| Agent | Role |
|-------|------|
| `numerics_researcher` | Verticals in `NUMERICS_VERTICAL_SLUGS` (sim/HPC) |
| `goal_researcher` | All other user verticals |
| `autoresearch` | Bench novelty only — **not** a vertical goal |
| `gap_explorer`, `stdlib_researcher`, `proof_gap_researcher`, … | Auxiliary goals in `AUXILIARY_RESEARCH_GOALS` |

Vertical context is injected per run via `buildResearchGoalKickoffExtra()` — not separate registry entries.

## Verify

```bash
npm run build
npm test
npm run research-goals:sync   # when changing RESEARCH_VERTICALS
```

## Out of scope

- 19 dedicated agent IDs / systemd loops per vertical
- Committing `data/` run artifacts
