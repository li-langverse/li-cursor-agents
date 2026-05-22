# Li cursor agents — dual-mode scheduling

## Async swarm (default for `keep-agents`)

**Target behavior:** user clicks **Start agents** once on the dashboard (or `LI_AUTO_START_ASYNC_SWARM=1` on server boot) — research, implement, maintenance, and worker loops run **continuously** until **Stop agents**. Each loop checks the work queue (`GET /api/queue`), handoffs, and sessions; mostly in parallel (`LI_SDK_MAX_CONCURRENT`, default 4). **Mock runs** (`CURSOR_MOCK=1`, `--mock`) are for CI/tests only — artifacts go under `data/runs/mock/` and are **not** listed in dashboard history or Supabase.

No supervisor tick queue. On dashboard start (`LI_AUTO_START_ASYNC_SWARM=1`):

| Loop | Role |
|------|------|
| Research lane | Goal-directed research (continuous) |
| Implement lane | Architect + `code_implementer` handoffs |
| Maintenance lane | Briefing enrich + scorecards (no LLM) |
| Agent worker pool | All other registry agents on staggered intervals (`LI_SDK_MAX_CONCURRENT` parallel SDK slots, default 4) |

```bash
npm run agents:async-swarm          # foreground (Ctrl+C stops)
./scripts/keep-agents-running.sh   # dashboard + async swarm in background
curl -X POST http://127.0.0.1:9477/api/async-swarm/stop
```

Env: `LI_ASYNC_AGENT_INTERVAL_MS` (default 180000), `LI_AUTO_START_SUPERVISOR=1` to use legacy supervisor instead.

## Local SDK lanes (default for development)

| Lane | Command | Role |
|------|---------|------|
| Research | `npm run agents:research-lane` | Goal-directed research; session-first |
| Implement | `npm run agents:implement-lane` | `package_architect` → `code_implementer` handoffs |
| Maintenance | `npm run agents:maintenance-lane -- --once` | Refresh briefing + `swarm_scorecard` (no LLM) |
| Briefing enrich | `npm run briefing:enrich -- --benchmarks-root ../benchmarks` | Post-process `agent-briefing.json` after benchmarks preflight |
| Supervisor | `npm run supervisor` | Heap + briefing `recommended_agents` |

Dashboard footer toggles **Research lane** / **Implement lane**; **Run all (handoff)** runs one tick per phase.

Env: `LI_SWARM_HANDOFF_PHASES=0` restores legacy parallel spawn for run-all.

### Goal-directed SDK loop (reusable)

Any plan or human-written goal — no per-project agent id:

```bash
export CURSOR_API_KEY=crsr_...
./scripts/goal-directed-loop.sh \
  --agent code_implementer \
  --workflow-repo lic \
  --cwd ../lic \
  --goal-file ./my-goal.md \
  --max 10
```

Single shot: `npm run build && node dist/cli/run-agent.js --agent code_implementer --workflow-repo lic --cwd ../lic --goal-file goal.md`

Env fallbacks: `LI_AGENT_GOAL`, `LI_AGENT_EXTRA_INSTRUCTION`, `LI_GOAL_AGENT`, `LI_REPO_WORKFLOW_REPO`.

**lic httpd plan:** `../lic/scripts/httpd-plan-loop.py` writes each YAML todo as a goal file and invokes `code_implementer` (override with `LI_HTTPD_PLAN_AGENT`).

### Goal implementation → `lic`

| Env | Effect |
|-----|--------|
| _(automatic)_ | `goal_implementation` handoffs (`game_engine_ux`, `cad_fundamentals`) clone **lic** via `workflowRepo` |
| `LI_REPO_WORKFLOW_OPEN_PR=1` | `code_implementer` opens PR after commit+push (default: push only) |
| `LI_BENCHMARKS_DISPATCH_TOKEN` | `gh` token to dispatch `swarm-audit-refresh` on **benchmarks** |
| `LI_BENCHMARKS_DISPATCH_ON_MAINTENANCE=1` | Maintenance lane tick also dispatches benchmarks refresh |
| `npm run swarm:dispatch-benchmarks` | Manual `repository_dispatch` (use `--dry-run` to verify token path) |

## Optional Cursor Automations

Cloud Automations can mirror the same agent prompts under `benchmarks/.cursor/automations/` when budget allows. Lanes remain the source of truth for handoffs and sessions (`agent_handoffs`, `research_sessions`).

## GHA cron (this repo)

| Workflow | Schedule | What runs |
|----------|----------|-----------|
| `swarm-maintenance-cron.yml` | Every 12h + dispatch | Fixture `agent-briefing.py` + `agents:maintenance-lane --once` (scorecards, no LLM) |
| `swarm-audit-cron.yml` | Weekly Mon 09:00 UTC + dispatch | Handoff/heap unit tests + briefing key check; optional `LI_BENCHMARKS_DISPATCH_TOKEN` → benchmarks repo |

Production audits (`plan-completion-audit`, `ecosystem-explorer`) stay in **benchmarks** / **lic** repos; GHA here only refreshes what local lanes read from `data/latest/`.

**benchmarks** `scripts/agent-briefing.py` calls `li-cursor-agents` `briefing:enrich` when `LI_CURSOR_AGENTS_ROOT` is built (`dist/cli/enrich-briefing.js`). **benchmarks** workflow `swarm-audit-refresh.yml` handles `repository_dispatch` type `swarm-audit-refresh` from `swarm-audit-cron.yml`.

Supervisor ticks call `enrichBriefingObject` so `recommended_agents` includes swarm lane priorities (`package_architect`, `code_implementer`, eligible research goals). Implement lane prompts include full `config/goal-scaffolds/*.md` content.
