# li-cursor-agents

Local **Cursor SDK** (`@cursor/sdk`) runner for li-langverse automations. **CI uses a mock backend** — no API key, no LLM.

Benchmarks repo keeps **preflight scripts** (`agent-briefing.py`); this repo runs **agents**.

## Quick start

```bash
npm ci
./scripts/sync-prompts.sh   # from ../benchmarks/.cursor/automations
npm run build

# CI / local without API key
export CURSOR_MOCK=1
npm run agent -- --agent gap_explorer

# Real SDK run (local dev)
export CURSOR_API_KEY="..."
npm run agent -- --agent pr_reviewer --benchmarks ../benchmarks
```

## Architecture

| Piece | Role |
|-------|------|
| `scripts/agent-briefing.py` (benchmarks) | Preflight JSON only |
| `src/backends/mock-backend.ts` | Deterministic output for CI |
| `src/backends/cursor-sdk-backend.ts` | Real `@cursor/sdk` local agent |
| `prompts/*.md` | Synced from benchmarks automations |

## Agents (full roster)

```bash
npm run list
```

| id | Role | Web |
|----|------|-----|
| `plan_verifier` | Open plans / PH trackers vs reality | no |
| `gap_explorer` | Ecosystem + HPC + Reddit/SOTA gaps | **yes** |
| `implementation_gaps` | Plan vs code drift | yes |
| `issue_planner` | Issues → implementation plans | no |
| `pr_alignment` | PRs vs vision / roadmap / philosophy | no |
| `pr_reviewer` | Standards review before merge-approved | no |
| `pr_merger` | Merge when reviewed + CI green | no |
| `numerics_researcher` | Existing algos (books, libs, papers) | **yes** |
| `autoresearch` | Novel algos + bench proof | **yes** |
| `bench_improver` | Fix red dashboard rows in lic | no |
| `docs_maintainer` | Missing docs → implement | no |
| `ci_maintainer` | Missing org CI workflows | no |
| `orchestrator` | Route from briefing | no |

Legacy briefing ids (`ecosystem_explorer`, `plan_completion`, …) still resolve via aliases.

## Cursor SDK API key (where to set it)

| Location | When |
|----------|------|
| **`li-cursor-agents/.env`** | Local / overnight on your machine (`cp .env.example .env`) |
| **Cursor → Cloud / Background Agent → Environment variables** | Overnight in a Cloud Agent VM — **restart the VM** after adding |
| **Shell export** | Ad hoc: `export CURSOR_API_KEY=...` in the same terminal as `npm run supervisor` |

Supported names (first match wins): `CURSOR_API_KEY`, `CURSOR_SDK_KEY`, `CURSOR_SDK`, `CURSOR_API_TOKEN`.

```bash
./scripts/check-sdk-key.sh   # shows which vars are set (no secret printed)
./scripts/sdk-smoke.sh       # one short live SDK call
```

See [docs/cloud-agent-secrets.md](docs/cloud-agent-secrets.md).

## E2E tests (swarm handoffs)

```bash
npm run test:e2e              # CI-safe: mock backend, fixture briefing, dashboard API
LI_E2E_SDK=1 npm run test:e2e:sdk   # real SDK (requires .env key)
```

Covers: heap caps → preflight → task queue → agent runs → report/interventions → anti-cycle → goal shift → **agent-matrix** (mock per leaf) → dashboard `/api/report` + `/api/heap`.

## Environment

| Var | Purpose |
|-----|---------|
| `CURSOR_API_KEY` | Real SDK (from [Cursor dashboard](https://cursor.com/dashboard) integrations) |
| `CURSOR_MOCK=1` | Force mock |
| `BENCHMARKS_ROOT` | Path to `li-langverse/benchmarks` for preflight |
| `CURSOR_MODEL` | Default `default` (Cursor **Auto**); pin e.g. `gpt-5-mini` if needed |
| `LI_E2E_SDK=1` | Run live SDK e2e tests |

## CI policy

**Never** call the real SDK in GitHub Actions. Workflow sets `CURSOR_MOCK=1` and verifies mock runs + unit tests.

## Heap orchestration (Agentron-style)

The root **orchestrator** never dispatches more than **10 leaf agents** at once. Work is grouped into **sub-coordinators** (each ≤10 agents):

| Coordinator | Leaf agents |
|-------------|-------------|
| `coord_pull_requests` | pr_alignment, pr_reviewer, pr_merger |
| `coord_numerics` | numerics_researcher, autoresearch, bench_improver |
| `coord_governance` | plan_verifier, implementation_gaps, issue_planner |
| `coord_ecosystem` | gap_explorer, docs_maintainer |
| `coord_platform` | ci_maintainer |

Preflight writes `heap_plan` + `org_roadmap` into `agent-briefing.json` ([Agentron heap](https://docs.agentron.rocks/concepts/heap/)). Vision/pillars come from **roadmap** `vision-and-roadmap.md` and lic master plan PH tracker.

## Control plane (continuous supervisor + web GUI)

Agents run **continuously** with **no briefing cycles**: the supervisor polls preflight, dispatches only when `recommended_agents` or interventions change, and **dedupes** the same agent+reason for 6h per briefing hash.

```bash
# Terminal 1 — dashboard (reports + human interventions)
npm run dashboard
# → http://127.0.0.1:9477/

# Terminal 2 — supervisor (mock for local dry-run)
export BENCHMARKS_ROOT=../benchmarks
CURSOR_MOCK=1 npm run supervisor -- --benchmarks ../benchmarks

# Or both:
./scripts/start-control-plane.sh --mock
```

| Piece | Role |
|-------|------|
| `npm run supervisor` | Loop: preflight → interventions → run up to 2 agents/tick |
| `npm run dashboard` | Web UI: interventions first, report, recent runs |
| `data/control-plane/latest-report.json` | Full report for the web UI |
| `data/control-plane/interventions.json` | Human intervention queue |
| `data/control-plane/state.json` | Dedup state, recent runs |

**Human interventions** (critical/high first): governance merges, ready-to-merge PRs, preflight failures, API key missing for web agents.

**No cycles:** skips agent dispatch when briefing hash unchanged; per-task cooldown; max 2 agents per tick.

Env: `LI_SUPERVISOR_INTERVAL_MS`, `LI_SUPERVISOR_COOLDOWN_MS`, `LI_AGENT_DASHBOARD_PORT` (9477).

## Link from benchmarks

```bash
cd ../benchmarks
./scripts/agent-preflight.sh
cd ../li-cursor-agents
npm run supervisor -- --once --benchmarks ../benchmarks --mock
```

## Create GitHub repo

```bash
gh repo create li-langverse/li-cursor-agents --public --source=. --remote=origin
```
