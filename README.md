# li-cursor-agents

Local **Cursor SDK** (`@cursor/sdk`) runner for li-langverse automations. **CI uses a mock backend** — no API key, no LLM.

Benchmarks repo keeps **preflight scripts** (`agent-briefing.py`); this repo runs **agents**.

## Agent-kit (roadmap Cursor rules)

This repo uses the same **roadmap `agent-kit/`** as lic/benchmarks (PR-only, ecosystem gates, release notes):

```bash
./scripts/sync-agent-kit.sh          # after ../roadmap/agent-kit changes
./scripts/check-agent-kit-sync.sh    # CI / pre-push
```

Org drift audit (feeds **agent_kit_maintainer**): `python3 ../benchmarks/scripts/ensure-org-agent-kit.py --local-only`

## Repo workflow (clone → PR)

Platform agents (`agent_kit_maintainer`, `ci_maintainer`, `docs_maintainer`) use **isolated workspaces** under `data/workspaces/` — not your sibling checkout.

Stale clones are pruned automatically (default: **20** max per repo, **5** always kept, delete older than **7 days**). Manual: `npm run workspace:prune` (`--dry-run`, `--force` for dirty clones).

Requires `GH_TOKEN` in `../.env.github` (see lic `scripts/with-github-env.sh`).

```bash
npm run repo-workflow -- agent-kit-rollout --dry-run
./scripts/agent-repo-workflow.sh agent-kit-rollout
```

Manual steps: `prepare` → edit clone → `commit-pr` (documented in `prompts/repo-workflow-tools.md`).

## Machine setup (recommended once)

Configures absolute paths, **local CI instead of GitHub Actions**, slim Docker image, and sensible supervisor limits for one Mac:

```bash
npm run setup    # writes .env keys, builds li-local-ci/node:22, runs doctor
npm run agents:keep
```

Defaults (override in `.env`): `LI_USE_LOCAL_CI=1`, `LI_LOCAL_CI_SWEEP_LIMIT=2`, `LI_SUPERVISOR_MAX_TASKS=2`, **Supabase on** (`LI_STACK_SKIP_SUPABASE=0`; needs Docker).

## Quick start (dashboard dev)

```bash
npm run setup
cp .env.example .env          # add CURSOR_API_KEY
npm run dev:all               # Supabase + API :9477 + Next.js UI :3000
```

## Quick start (full local stack)

```bash
npm run setup
cp .env.example .env          # if setup did not create it; add CURSOR_API_KEY
npm run stack                 # ensure Supabase + dashboard + supervisor (LI_STACK_SKIP_SUPABASE=1 for disk-only)
```

## Quick start (agents only)

```bash
npm ci
./scripts/sync-prompts.sh   # from ../benchmarks/.cursor/automations
npm run build

# Real SDK (default) — put CURSOR_API_KEY in .env
cp .env.example .env
npm run agent -- --agent pr_reviewer --benchmarks ../benchmarks

# Mock only for CI / explicit dry-run
npm run agent -- --agent gap_explorer --mock
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
| `pr_branch_opener` | Open PRs for branches with no pull request | no |
| `pr_alignment` | PRs vs vision / roadmap; close superseded PRs | no |
| `pr_reviewer` | Standards review before merge-approved | no |
| `pr_merger` | Merge when reviewed + CI green | no |
| `numerics_researcher` | Existing algos (books, libs, papers) | **yes** |
| `autoresearch` | Novel algos + bench proof | **yes** |
| `bench_improver` | Fix red dashboard rows in lic | no |
| `docs_maintainer` | Missing docs → implement | no |
| `ci_maintainer` | Missing org CI workflows | no |
| `agent_kit_maintainer` | Isolated clone → install agent-kit → open PRs | no |
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
LI_E2E_SDK=1 npm run test:e2e:sdk   # real SDK smoke (orchestrator)
LI_E2E_SDK=1 LI_E2E_SDK_ALL_LEAVES=1 npm run test:e2e:all-leaves-sdk   # every leaf agent + live onDelta stream
npm run test:verify-all-agents-sdk-stream   # **required** gate: real SDK stream + status=finished for all leaves
# Logs: logs/sdk-matrix/all.log and logs/sdk-matrix/<agent_id>.log
npm run test:playwright:mock        # browser: live stream UI (mocked API)
LI_PLAYWRIGHT_USE_SUPABASE=1 npm run test:playwright:integration   # browser + local test DB
```

Covers: heap caps → preflight → task queue → agent runs → report/interventions → anti-cycle → goal shift → **agent-matrix** (mock per leaf) → dashboard `/api/report` + `/api/heap`.

## Environment

| Var | Purpose |
|-----|---------|
| `CURSOR_API_KEY` | Real SDK (from [Cursor dashboard](https://cursor.com/dashboard) integrations) |
| `CURSOR_MOCK=1` | Mock backend (npm test / `--mock` only) |
| `BENCHMARKS_ROOT` | Path to `li-langverse/benchmarks` for preflight |
| `CURSOR_MODEL` | Default `default` (Cursor **Auto**); pin e.g. `gpt-5-mini` if needed |
| `LI_E2E_SDK=1` | Run live SDK e2e tests |
| `LI_E2E_SDK_ALL_LEAVES=1` | With `LI_E2E_SDK=1`, run **all leaf agents** (not default CI) |
| `LI_E2E_SDK_STREAM_WAIT_MS` | Max wait per agent for live stream (default 240000) |
| `LI_LIVE_TRACE_FLUSH_MS=0` | Immediate flush to dashboard/db-api (used in stream e2e) |

## CI policy

**Never** call the real SDK in GitHub Actions. Workflow sets `CURSOR_MOCK=1` and verifies mock runs + unit tests.

## Heap orchestration (Agentron-style)

The root **orchestrator** never dispatches more than **10 leaf agents** at once. Work is grouped into **sub-coordinators** (each ≤10 agents):

| Coordinator | Leaf agents |
|-------------|-------------|
| `coord_pull_requests` | pr_branch_opener, pr_alignment, pr_reviewer, pr_merger |
| `coord_numerics` | numerics_researcher, autoresearch, bench_improver |
| `coord_governance` | plan_verifier, implementation_gaps, issue_planner |
| `coord_ecosystem` | gap_explorer, docs_maintainer |
| `coord_platform` | ci_maintainer, agent_kit_maintainer |

Preflight writes `heap_plan` + `org_roadmap` into `agent-briefing.json` ([Agentron heap](https://docs.agentron.rocks/concepts/heap/)). Vision/pillars come from **roadmap** `vision-and-roadmap.md` and lic master plan PH tracker.

## Control plane (continuous supervisor + web GUI)

Agents run **continuously** with **no briefing cycles**: the supervisor polls preflight, dispatches only when `recommended_agents` or interventions change, and **dedupes** the same agent+reason for 6h per briefing hash.

```bash
cd li-cursor-agents
npm run build
npm run dashboard
# → http://127.0.0.1:9477/
```

**Async lanes (footer):**

| Button | Action |
|--------|--------|
| **Research lane** | Goal-directed research (session-first); `npm run agents:research-lane` |
| **Implement lane** | Handoff gate: `package_architect` → `code_implementer`; `npm run agents:implement-lane` |
| **Run all (handoff)** | One tick each: research → implement (set `LI_SWARM_HANDOFF_PHASES=0` for legacy parallel spawn) |

**Dashboard controls (footer):**

| Button | Action |
|--------|--------|
| **Supervisor mode** | Continuous loop: preflight → up to 3 agents per tick (sequential). Click again to stop. |
| **Run all (handoff)** | Phased handoffs (see above). |

Each **leaf/root** card has **Start** / **Stop** / **Resume**. Stop kills a running process and excludes the agent until Resume.

```bash
# CLI alternative (no dashboard)
export BENCHMARKS_ROOT=../benchmarks
npm run agents:keep   # dashboard + supervisor (cursor-sdk if .env has key)
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

### Swarm observer (self-healing)

Every supervisor tick runs a **programmatic observer** before dispatch:

| Signal | Auto-action |
|--------|-------------|
| Agent error streak (2+) | Retry with `observer:auto-retry` (per-agent budget, default 3) |
| `agent_incomplete_runs` in briefing | Retry that agent |
| Red benchmarks / dirty workspace / deliverable gaps | Dispatch `bug_fixer`, `workspace_sweeper`, or `implementation_gaps` |
| High error rate or many failed agents | Schedule **`swarm_observer`** meta-agent (prompt audit) |

Humans see **`swarm_degraded`** only when auto-heal is exhausted (e.g. missing API key, stuck supervisor). Dashboard: `GET /api/swarm/health`. Meta prompt: `prompts/swarm-observer.md`.

Env: `LI_OBSERVER_MAX_RETRIES_PER_AGENT`, `LI_OBSERVER_MAX_REMEDIATIONS_PER_TICK`, `LI_OBSERVER_STALE_AGENT_MS`.

**Dashboard → Settings** edits all runtime knobs (supervisor, observer, SDK, local CI, lanes, …). Values persist to `data/control-plane/runtime-settings.json` and apply immediately to the running ops server (restart only for port / store).

Env fallbacks: `LI_SUPERVISOR_INTERVAL_MS`, `LI_AGENTS_COOLDOWN_MS`, `LI_AGENT_DASHBOARD_PORT` (9477).

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
