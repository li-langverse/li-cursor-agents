# Agent instructions (li-cursor-agents)

1. **Roadmap agent-kit** — `./scripts/sync-agent-kit.sh` after `../roadmap/agent-kit/` changes; `./scripts/check-agent-kit-sync.sh` on PRs.
2. **Shared policy** — `li-pr-only.mdc`, `li-ecosystem-gates.mdc`, `li-release-notes.mdc` (synced from roadmap).
3. **Commit + push every slice** — after `npm test` (or scoped tests) passes: commit on the feature branch, `../li/scripts/with-github-env.sh git push -u origin HEAD`, open/update PR; do not self-merge. Do not leave verified work uncommitted.
4. **Preflight** — sibling `benchmarks` `scripts/agent-briefing.py`; agents read `data/latest/agent-briefing.json`.
5. **Org agent-kit audit** — `python3 ../benchmarks/scripts/ensure-org-agent-kit.py --local-only` → `agent_kit_maintainer` for drifted repos.
6. **Local CI (GHA quota)** — Merge agents use `benchmarks/scripts/local-ci-sweep.py` + `li-local-ci run-pr` (see `../li-local-ci`). Supervisor runs sweep before `pr_merger` / `pr_reviewer`. Disable: `LI_USE_LOCAL_CI=0`. Dev checks: `npm run ci:local`.

Skills: `li-ecosystem-discipline`, `write-li-release-notes` (from agent-kit).
