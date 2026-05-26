# Research verticals matrix

**19 user-facing verticals** are defined in **`src/research-goals/researcher-factory.ts`** (runtime source of truth) and exported to `config/research-goals.yaml` via `npm run research-goals:sync`. Goal-directed research runs through the **async swarm research lane** (`researchLaneAgentIds()`), not per-vertical systemd `sim-*` loops.

### Tuning a vertical (factory)

Edit `RESEARCH_VERTICALS` in `researcher-factory.ts` (agent routing uses `NUMERICS_VERTICAL_SLUGS`), then `npm run research-goals:sync` and commit the YAML artifact. Example:

```typescript
verticalRow("my_topic", "my_topic_sota", "My topic — SOTA and Li gaps", ["ecosystem"], {
  priority: 6,
  cadenceHours: 24,
  session: true,
}),
```

Kickoff hints: `src/research-goals/vertical-prompt-hints.ts`. Dashboard `/api/goals` exposes `vertical` and `publish_subdir` per row.

**SDK cap:** `LI_SDK_MAX_CONCURRENT=5` (see [sdk-slot-policy.md](./sdk-slot-policy.md)). The research lane holds **one** slot; `pickNextGoal` / `pickNextGoalForAgent` rotates all enabled goals by **priority** and **cadence_hours** over time. Do not spawn 19 parallel researchers.

| Vertical | `goal_id` | Agent | Session | Publish path | Notes |
|----------|-----------|-------|---------|--------------|-------|
| numerics | `numerics_sota` | `numerics_researcher` | no | `research-findings/whitepapers/2026-05/numerics_sota/` | PH-5b/7e; `autoresearch` for novel bench methods (separate agent, no vertical goal) |
| physics | `physics_sim` | `numerics_researcher` | yes | `…/physics_sim/` | PDE/FEM continuum |
| md | `md_sim_algorithms` | `numerics_researcher` | yes | `…/md_sim_algorithms/` | **sim worktree:** `lic-worktrees/sim-md-research` for deep bench gates |
| chemistry | `chem_sim_algorithms` | `numerics_researcher` | yes | `…/chem_sim_algorithms/` | **sim worktree:** `lic-worktrees/sim-chem-research` for QM gates |
| biology | `biology_systems` | `goal_researcher` | yes | `…/biology_systems/` | |
| bioengineering | `bioengineering_systems` | `goal_researcher` | yes | `…/bioengineering_systems/` | |
| engineering | `engineering_mechanical` | `goal_researcher` | yes | `…/engineering_mechanical/` | CAD kernels: `cad_fundamentals` (no vertical slug) |
| additive | `additive_manufacturing` | `goal_researcher` | yes | `…/additive_manufacturing/` | |
| robotics | `robotics_systems` | `goal_researcher` | yes | `…/robotics_systems/` | Dedicated agent later if ROS/I/O routine |
| gaming | `game_engine_ux` | `goal_researcher` | yes | `…/game_engine_ux/` | |
| database | `database_platform` | `goal_researcher` | yes | `…/database_platform/` | |
| server | `server_platform` | `goal_researcher` | yes | `…/server_platform/` | Ops/runtime; browser/WASM: `web_platform` |
| machine_learning | `ml_systems` | `goal_researcher` | yes | `…/ml_systems/` | |
| deep_learning | `deep_learning_systems` | `goal_researcher` | yes | `…/deep_learning_systems/` | |
| reinforcement_learning | `rl_systems` | `goal_researcher` | yes | `…/rl_systems/` | Overlaps `robotics_systems` for sim-to-real |
| simulation_science | `simulation_techniques` | `numerics_researcher` | yes | `…/simulation_techniques/` | Coupling, reference architectures |
| scientific_distributed_computing | `scientific_distributed_computing` | `numerics_researcher` | yes | `…/scientific_distributed_computing/` | MPI, partitions, cloud HPC |
| ai | `ai_ecosystem` | `goal_researcher` | yes | `…/ai_ecosystem/` | Training/inference tooling |
| agentic_ai | `agentic_ai_systems` | `goal_researcher` | yes | `…/agentic_ai_systems/` | Multi-agent, tool use; handoff `swarm_observer` |

Paths are relative to the **research-findings** repo unless prefixed with `research-findings/`.

## Scheduling (all verticals over time)

1. **Research lane** (`src/lanes/research-lane.ts`): one SDK slot; picks highest-priority goal past cadence.
2. **Per-agent workers** (`pickNextGoalForAgent`): `numerics_researcher` competes across physics/md/chem/simulation/HPC goals; `goal_researcher` across biology…agentic goals.
3. **Agent union** (`src/lanes/lane-agent-ids.ts`): every enabled goal’s `agent` is included in `researchLaneAgentIds()`.
4. **Scaffolds**: `config/goal-scaffolds/<goal_id>.md`.
5. **Legacy script** `scripts/run-researchers-long.sh`: default agent list from `researchLongRunAgentIds()` (factory) — prefer `npm run agents:async-swarm` + enabled research lane.

## Non-vertical goals (same lane, different role)

| `goal_id` | Agent | Role |
|-----------|-------|------|
| `cad_fundamentals` | `goal_researcher` | Geometry kernels (supports engineering/additive) |
| `web_platform` | `goal_researcher` | WASM/browser (complements `server_platform`) |
| `ecosystem_gaps` | `gap_explorer` | Org-wide signals |
| `stdlib_ecosystem` | `stdlib_researcher` | std audit |
| `provability_holes` | `proof_gap_researcher` | Proof gaps |
| `swarm_coverage` | `swarm_observer` | Meta swarm health |
| `offensive_security` | `security_auditor` | Security research |
| `ui_ux_quality` | `gui_ux_tester` | UX audit |

## Dedicated agents vs goals

| Area | Use |
|------|-----|
| Sim-heavy (md, chem, physics, simulation_science, HPC) | `numerics_researcher` + bench discipline |
| ML / DL / RL / AI / agentic | `goal_researcher` (no new registry ids) |
| Proved novel numerics | `autoresearch` agent (bench improvement), not a vertical goal |
| md / chem deep gates | Optional `lic-worktrees/sim-*-research` only — **not** duplicate swarm loops |

## Related

- `src/research-goals/researcher-factory.ts` — tune verticals
- `docs/ecosystem/researcher-factory-plan.md` — WP plan
- `config/research-goals.yaml` — generated export (`npm run research-goals:sync`)
- `config/implement-goals.yaml`
- **research-findings index:** after new verticals ship, sync whitepaper index in the research-findings repo (out of band; not automated here)
- [swarm-architecture.md](./swarm-architecture.md)
- [sdk-slot-policy.md](./sdk-slot-policy.md)
