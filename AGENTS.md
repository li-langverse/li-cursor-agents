# Agent instructions (li-cursor-agents)

1. **Roadmap agent-kit** — `./scripts/sync-agent-kit.sh` after `../roadmap/agent-kit/` changes; `./scripts/check-agent-kit-sync.sh` on PRs.
2. **Shared policy** — `li-pr-only.mdc`, `li-ecosystem-gates.mdc`, `li-release-notes.mdc` (synced from roadmap).
3. **Commit when done** — verified slice → feature branch commit, push, open/update PR; do not self-merge.
4. **Preflight** — sibling `benchmarks` `scripts/agent-briefing.py`; agents read `data/latest/agent-briefing.json`.
5. **Org agent-kit audit** — `python3 ../benchmarks/scripts/ensure-org-agent-kit.py --local-only` → `agent_kit_maintainer` for drifted repos.
6. **Local CI (save GHA quota)** — `npm run ci:local` (host, full tests) or `npm run ci:local:quick` (Docker, unit only). Repo: `../li-local-ci`. Cloud GHA is `workflow_dispatch` only.

Skills: `li-ecosystem-discipline`, `write-li-release-notes` (from agent-kit).
