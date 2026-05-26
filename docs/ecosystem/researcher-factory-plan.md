# Researcher factory — implementation plan

**Status:** implemented on `feat/goal-directed-swarm`.

## Goal

Single tunable module for **19 user verticals** (+ auxiliary research goals) so agent assignment, cadence, and publish paths change in one place—not 19 hand-edited YAML blocks.

**Source of truth:** `src/research-goals/researcher-factory.ts` at runtime.  
**Export artifact:** `config/research-goals.yaml` via `npm run research-goals:sync`.

## Design

| Piece | Path |
|-------|------|
| Factory + vertical specs | `src/research-goals/researcher-factory.ts` |
| Prompt / scaffold hints | `src/research-goals/vertical-prompt-hints.ts` |
| Runtime loader | `src/research-goals/load-goals.ts` → `buildResearchGoalsFromFactory()` |
| YAML sync CLI | `src/cli/sync-research-goals-from-factory.ts` |

**Agent rules**

- `numerics_researcher`: sim/HPC-heavy verticals (`NUMERICS_VERTICAL_SLUGS`).
- `goal_researcher`: systems/platform/ML/AI verticals.
- `autoresearch`: **not** duplicated per vertical—bench novelty only; listed in `researchLongRunAgentIds()` for optional long-run scripts.

Override YAML only when `LI_RESEARCH_GOALS_PATH` points at a custom file (tests, experiments).

## Work packages

### Sequential WP-0 (done first)

- [x] Read `load-goals.ts`, `lane-agent-ids.ts`, `research-lane.ts`, `run-researchers-long.sh`
- [x] This plan file

### Parallel group A

| WP | Deliverable |
|----|-------------|
| A1 | `researcher-factory.ts` — types, `RESEARCH_VERTICALS`, `buildResearchGoalsFromFactory()`, `listVerticals()`, tuning constants |
| A2 | `sync-research-goals-from-factory.ts` + `npm run research-goals:sync` |
| A3 | `vertical-prompt-hints.ts` — frontmatter + kickoff hint lines |

### Parallel group B (after A)

| WP | Deliverable |
|----|-------------|
| B1 | `load-goals.ts` uses factory; YAML parser kept for `LI_RESEARCH_GOALS_PATH` |
| B2 | `researchLaneAgentIds()` / `pickNextGoal*` unchanged (consume `loadResearchGoals`) |
| B3 | `run-researchers-long.sh` + `research-verticals.md` reference factory agent list |

### Sequential WP-C

- [x] `researcher-factory.test.ts` — 19 verticals, unique slugs, publish paths, agent rules
- [x] `npm test` + `npm run build`
- [x] Commit + push `feat/goal-directed-swarm`

### Sequential WP-D (optional)

- [x] `/api/goals` includes `vertical` + `publish_subdir` when present
- [x] `research-verticals.md` — factory tuning + index sync note

## Adding a vertical (3 lines)

In `researcher-factory.ts`, append to `RESEARCH_VERTICALS`:

```typescript
verticalRow("my_topic", "my_topic_sota", "My topic — SOTA and Li gaps", ["ecosystem"], {
  priority: 6,
  cadenceHours: 24,
  session: true,
}),
```

Then: `npm run research-goals:sync` and commit `config/research-goals.yaml`.

## Out of scope

- 19 separate agent registry entries
- Per-vertical systemd loops
- Breaking `lic-worktrees/sim-*-research` docs for md/chem
