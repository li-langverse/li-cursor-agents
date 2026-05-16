# AGENTS.md

## Cursor Cloud specific instructions

This is a Node.js/TypeScript CLI tool that runs Cursor SDK agents. It uses a mock backend for CI/dev (no API key needed) and a real `@cursor/sdk` backend for production runs.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Build | `npm run build` |
| Run tests | `npm test` |
| Full CI check | `npm run ci` |
| List agents | `npm run list` |
| Run agent (mock) | `CURSOR_MOCK=1 npm run agent -- --agent <id>` |

### Running without a Cursor API key

Set `CURSOR_MOCK=1` to use the deterministic mock backend. This is the default for CI and is sufficient for development and testing. All tests use mock mode.

### Build requirement

The project must be compiled before running (`npm run build` produces `dist/`). The test script handles this automatically, but if running CLI commands directly you need a fresh build.

### No external services required

No databases, Docker, or external services are needed. Output is written to `data/runs/` as markdown and JSON files. The optional preflight system gracefully degrades to a fixture file at `fixtures/mock-briefing.json` when the sibling `benchmarks` repo is absent.
