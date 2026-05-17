# Li cursor agents — dual-mode scheduling

## Local SDK lanes (default for development)

| Lane | Command | Role |
|------|---------|------|
| Research | `npm run agents:research-lane` | Goal-directed research; session-first |
| Implement | `npm run agents:implement-lane` | `package_architect` → `code_implementer` handoffs |
| Maintenance | `npm run agents:maintenance-lane -- --once` | Refresh briefing + `swarm_scorecard` (no LLM) |
| Supervisor | `npm run supervisor` | Heap + briefing `recommended_agents` |

Dashboard footer toggles **Research lane** / **Implement lane**; **Run all (handoff)** runs one tick per phase.

Env: `LI_SWARM_HANDOFF_PHASES=0` restores legacy parallel spawn for run-all.

## Optional Cursor Automations

Cloud Automations can mirror the same agent prompts under `benchmarks/.cursor/automations/` when budget allows. Lanes remain the source of truth for handoffs and sessions (`agent_handoffs`, `research_sessions`).

## GHA cron (this repo)

| Workflow | Schedule | What runs |
|----------|----------|-----------|
| `swarm-maintenance-cron.yml` | Every 12h + dispatch | Fixture `agent-briefing.py` + `agents:maintenance-lane --once` (scorecards, no LLM) |
| `swarm-audit-cron.yml` | Weekly Mon 09:00 UTC + dispatch | Handoff/heap unit tests + briefing key check; optional `LI_BENCHMARKS_DISPATCH_TOKEN` → benchmarks repo |

Production audits (`plan-completion-audit`, `ecosystem-explorer`) stay in **benchmarks** / **lic** repos; GHA here only refreshes what local lanes read from `data/latest/`.
