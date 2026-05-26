# Research loop recovery (WP-AGT-02)

Use when the research lane stops rotating (`last_research_tick_at` stale), vertical sessions are stuck `in_progress`, or SDK slots show 5/5 while `active_runs` lists zombie rows.

## Symptoms

| Signal | Likely cause |
|--------|----------------|
| `goal_researcher` same `goal_id` for days | `in_progress` session never reached `cycle_complete` |
| `numerics_researcher` always `md_sim_algorithms` | MD session file + no post-run advance (`numerics_researcher` was outside session agents) |
| Run `incomplete` with bench evidence on disk | Session step not advanced; audit marked premature |
| MCP `advance_research_session` no-op | Zombie session: empty `queue` but `current_focus` still set (fixed in `advanceResearchSession`) |
| `active_runs` ≫ SDK cap | Stale DB `running` rows — boot reconcile, or live swarm holding slots |

## Code fixes (2026-05-26)

1. **`numerics_researcher`** is in `RESEARCH_SESSION_AGENT_IDS` — lane resume, swarm continuation, and `applyResearchPostRun` now match `goal_researcher`.
2. **`advanceResearchSession`** clears `current_focus` when dequeuing the last step so `status` becomes `cycle_complete`.
3. **`findAnyInProgressSession`** auto-repairs zombie sessions (empty queue + stale focus).

## Local state repair (disk control plane)

When `LI_CONTROL_PLANE_STORE` is unset (default disk), edit under `data/`:

```bash
cd li-cursor-agents

# 1) Inspect sessions (only in_progress files are loaded by the lane)
ls -la data/research-sessions/
cat data/research-sessions/numerics_researcher.json
cat data/lanes/state.json

# 2) Optional: one-shot repair via Node (rebuild + script)
npm run build
node dist/cli/repair-research-sessions.js --apply   # disk + supabase when LI_CONTROL_PLANE_STORE=supabase

# 3) Stale SDK locks (dead PID only — do not delete live swarm locks)
./scripts/sweep-hung-agents.sh --dry-run
./scripts/sweep-hung-agents.sh --apply

# 4) Supabase store: reconcile stale running rows on dashboard/swarm boot
#    (marks error category stale_running_reconciled)
systemctl --user restart li-agents-dashboard.service
```

### MD → chemistry handoff

After MD `survey_sota` artifacts exist under `research-findings/whitepapers/…/md_sim_algorithms/`:

1. Set `data/research-sessions/numerics_researcher.json` to `goal_id: chem_sim_algorithms` **or** mark MD `cycle_complete` and add `md_sim_algorithms` to `data/lanes/state.json` → `goal_last_run_at`.
2. Ensure `research_lane_enabled: true` in `data/lanes/state.json`.
3. Restart async swarm (below) so `pickResearchWorkForAgent("numerics_researcher")` picks the chem session.

## Re-enable loops (autostart)

Autostart is **on** when `data/control-plane/DISABLE_AUTOSTART` is **absent**.

```bash
# Pause (safe during surgery)
touch data/control-plane/DISABLE_AUTOSTART
systemctl --user stop li-agents-async-swarm.service

# Resume
rm -f data/control-plane/DISABLE_AUTOSTART
systemctl --user restart li-agents-dashboard.service
# Dashboard reconcile may respawn async swarm when LI_AUTO_START_ASYNC_SWARM=1
systemctl --user restart li-agents-async-swarm.service
```

Check: `data/control-plane/swarm-health.json` → `disable_autostart: false`, `async_swarm.systemd_async_swarm: active`.

## Session ID mismatch (agent output)

Agents must use the **full** `session_id` from `## Research goal` / `## Continue session` blocks. MCP `load_research_session` / `advance_research_session` key on **`agent_id` only** — truncated IDs in prose do not affect the store. Post-run advancement uses `agent_id` after `finished` runs.

## Verify

```bash
npm test -- src/research-sessions/session-store.test.ts src/lanes/research-lane.test.ts
LI_RESEARCH_LANE_ONCE=1 node dist/cli/async-swarm.js research-lane  # or mock tick via tests
```

Dashboard: research lane tick updates `last_research_tick_at`; numerics next run should show `chem_sim_algorithms` when session file points at chemistry.

## Related

- [sdk-slot-policy.md](./sdk-slot-policy.md)
- [concurrent-runs-troubleshooting.md](./concurrent-runs-troubleshooting.md)
- [swarm-architecture.md](./swarm-architecture.md)
