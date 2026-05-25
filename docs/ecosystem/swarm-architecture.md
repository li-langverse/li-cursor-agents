# Goal-directed async swarm

Single control plane in **li-cursor-agents** schedules research, implement, maintenance, and worker-pool agents from YAML goals and handoffs. **lic** keeps backlogs, gate scripts, and worktrees as **data** — not long-running systemd plan loops.

## Operator entry

```bash
cd li-cursor-agents
source ~/Documents/Cursor/.env   # CURSOR_API_KEY, GH_TOKEN
./scripts/install-agents-swarm-systemd.sh
```

## Goal registry

| File | Lane | Examples |
|------|------|----------|
| `config/research-goals.yaml` | Research | `md_sim_algorithms`, `chem_sim_algorithms`, `offensive_security`, `swarm_coverage` |
| `config/implement-goals.yaml` | Implement | `httpd_parity`, `sim_algorithms`, `compiler_studio` |

Cadence and `agent` fields replace per-repo `li-*-plan-loop` systemd units.

## Retiring lic plan loops

```bash
cd lic
./scripts/backup-swarm-state.sh          # before migration
./scripts/retire-goal-plan-loops.sh      # dry-run (default)
./scripts/retire-goal-plan-loops.sh --apply
```

`--apply` touches `DISABLE_AUTOSTART` in each loop data dir and `systemctl --user disable` units. It does **not** `systemctl stop` running services.

## Architecture diagram

See the unified migration plan (`goal_directed_swarm_unified`) for the Mermaid control-plane diagram (dashboard, async swarm, SDK slot pool, goal registry, lanes, lic data).

## Related docs

- `docs/ecosystem/agent-automations.md` — lanes and briefing merge
- `lic/.cursor/skills/goal-plan-loop-persistent/SKILL.md` — **deprecated**; use this doc instead
