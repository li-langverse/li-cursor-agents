# AGENTS.md

## Cursor Cloud specific instructions

This is a Node.js/TypeScript CLI tool that runs Cursor SDK agents with a self-improving adaptive scheduler. It uses a mock backend for CI/dev (no API key needed) and a real `@cursor/sdk` backend for production runs.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Build | `npm run build` |
| Run tests | `npm test` |
| Full CI check | `npm run ci` |
| List agents | `npm run list` |
| Run single agent (mock) | `CURSOR_MOCK=1 npm run agent -- --agent <id>` |
| Run adaptive overnight (mock) | `CURSOR_MOCK=1 npm run overnight -- --mock` |
| Run adaptive overnight (real) | `npm run overnight` |

### Running without a Cursor API key

Set `CURSOR_MOCK=1` to use the deterministic mock backend. This is the default for CI and is sufficient for development and testing. All tests use mock mode.

### Self-improving overnight system

The adaptive scheduler (`src/adaptive-scheduler.ts`) selects which agents to run each cycle based on:
- Run history (agents not recently run get priority)
- Error retry (failed agents are retried next cycle)
- Productivity scoring (agents with many findings get prioritized)
- Next-cycle recommendations from the previous cycle

After each cycle, a `self_improve` agent runs as a reflection pass, and a digest is written to `data/digests/`. History is persisted in `data/history.json`.

### Build requirement

The project must be compiled before running (`npm run build` produces `dist/`). The test script handles this automatically, but if running CLI commands directly you need a fresh build.

### No external services required

No databases, Docker, or external services are needed. Output is written to `data/runs/` as markdown and JSON files. The optional preflight system gracefully degrades to a fixture file at `fixtures/mock-briefing.json` when the sibling `benchmarks` repo is absent.
