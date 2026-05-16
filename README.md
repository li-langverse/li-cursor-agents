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
npm run agent -- --agent ecosystem_explorer

# Real SDK run (local dev)
export CURSOR_API_KEY="..."
npm run agent -- --agent pr_review --benchmarks ../benchmarks
```

## Architecture

| Piece | Role |
|-------|------|
| `scripts/agent-briefing.py` (benchmarks) | Preflight JSON only |
| `src/backends/mock-backend.ts` | Deterministic output for CI |
| `src/backends/cursor-sdk-backend.ts` | Real `@cursor/sdk` local agent |
| `prompts/*.md` | Synced from benchmarks automations |

## Agents

```bash
npm run list
```

| id | Web in prod |
|----|-------------|
| `ecosystem_explorer` | yes |
| `implementation_gaps` | yes |
| `numerics_research` | yes |
| `pr_review`, `pr_alignment`, … | optional |

## Environment

| Var | Purpose |
|-----|---------|
| `CURSOR_API_KEY` | Real SDK (from Cursor dashboard) |
| `CURSOR_MOCK=1` | Force mock |
| `BENCHMARKS_ROOT` | Path to `li-langverse/benchmarks` for preflight |
| `CURSOR_MODEL` | Default `composer-2` |

## CI policy

**Never** call the real SDK in GitHub Actions. Workflow sets `CURSOR_MOCK=1` and verifies mock runs + unit tests.

## Link from benchmarks

```bash
# in benchmarks checkout (sibling clone)
./scripts/cursor-agent-run.sh --agent orchestrator --mock
```

## Create GitHub repo

```bash
gh repo create li-langverse/li-cursor-agents --public --source=. --remote=origin
```
