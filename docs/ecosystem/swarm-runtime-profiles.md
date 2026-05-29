# Swarm runtime profiles

Two common ways to run `li-agents-async-swarm.service`. Pick one via a systemd drop-in under `~/.config/systemd/user/li-agents-async-swarm.service.d/`.

## Full self-improvement (recommended)

Keeps the closed loop: refresh briefing, observe errors, retry/heal, research, implement handoffs, and continuous workers.

| Env | Value |
|-----|--------|
| `LI_MAINTENANCE_LANE_ENABLED` | unset or `1` (default **on**) |
| `LI_OBSERVER_DISABLE` | unset (observer lane **on** in async-swarm) |
| `LI_IMPLEMENT_LANE_ENABLED` | unset or `1` |
| `LI_SWARM_PAUSE_WORKERS` | unset (worker pool **on**) |
| `LI_SDK_MAX_CONCURRENT` | `4` (or lower on small hosts) |

**What runs**

- **Maintenance** (~5 min): `agent-briefing.json`, work queue, scorecards — no LLM
- **Observer** (~2 min): error streaks → retry; red bench → `bench_improver`; dirty tree → `workspace_sweeper`; gaps → `implementation_gaps`; degraded → `swarm_observer`
- **Research** (8 workers): goal sessions, vertical research
- **Implement**: handoffs → `code_implementer` / architect path
- **Worker pool** (22 agents): `recommended_agents`, proactive passes, meta graders

Install example:

```bash
mkdir -p ~/.config/systemd/user/li-agents-async-swarm.service.d
cp scripts/systemd/examples/async-swarm-full-self-improvement.conf \
  ~/.config/systemd/user/li-agents-async-swarm.service.d/profile.conf
systemctl --user daemon-reload
systemctl --user restart li-agents-async-swarm
```

## Research-only (lightweight)

Pauses most automation; useful when debugging research lane or saving SDK quota.

| Env | Value |
|-----|--------|
| `LI_SWARM_PAUSE_WORKERS` | `1` |
| `LI_IMPLEMENT_LANE_ENABLED` | `0` |
| `LI_OBSERVER_DISABLE` | `1` |

Maintenance still runs by default unless you set `LI_MAINTENANCE_LANE_ENABLED=0`.

```bash
cp scripts/systemd/examples/async-swarm-research-only.conf \
  ~/.config/systemd/user/li-agents-async-swarm.service.d/profile.conf
systemctl --user daemon-reload
systemctl --user restart li-agents-async-swarm
```

## Opt-outs

| Goal | Set |
|------|-----|
| Skip briefing refresh ticks | `LI_MAINTENANCE_LANE_ENABLED=0` |
| Skip programmatic retry/heal | `LI_OBSERVER_DISABLE=1` |
| Skip implement handoffs | `LI_IMPLEMENT_LANE_ENABLED=0` |
| Skip 22 continuous workers | `LI_SWARM_PAUSE_WORKERS=1` |

## Self-improvement (your definition)

| Mechanism | Profile |
|-----------|---------|
| Adapt prompts per goal | Research sessions + kickoff extras (all profiles with research on) |
| Learn from mistakes | Observer retries + briefing signals (**full** profile) |
| Health → fix errors | Observer lane + healers (**full** profile) |
| Route gaps to agents | `recommended_agents` + handoffs (**full** profile) |
| Invent new agent types | Not supported — fixed registry; use goals/handoffs |

Meta agents (`swarm_observer`, `ecosystem_grader`) may **recommend** prompt edits in reports; applying them is still a human PR on `li-cursor-agents`.

## Related

- [swarm-architecture.md](./swarm-architecture.md)
- [swarm-health-monitoring.md](./swarm-health-monitoring.md)
- [recent-error-learnings.md](./recent-error-learnings.md)
