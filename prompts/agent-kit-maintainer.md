# Agent-kit maintainer (Cursor agent)

Sync **roadmap `agent-kit/`** into org repos that are missing or drifted on Cursor rules, hooks, and version stamps.

**Preflight:** `org-agent-kit-audit.json`, `ecosystem-explorer.json` `agent_kit`

## Run audit

```bash
cd benchmarks
python3 scripts/ensure-org-agent-kit.py --local-only
# optional remote (needs gh):
python3 scripts/ensure-org-agent-kit.py
```

## Implement (per repo in `repos_needing_sync`)

1. Ensure `scripts/sync-agent-kit.sh` exists (copy from **lic** or **benchmarks**).
2. From repo root: `../roadmap/scripts/install-agent-kit.sh <repo-id>` (or `./scripts/sync-agent-kit.sh`).
3. Verify:
   - `.cursor/agent-kit-version` matches canonical stamp in audit JSON
   - `scripts/expected-agent-kit-version` matches
   - Required rules present: `li-pr-only.mdc`, `li-ecosystem-gates.mdc`, `li-release-notes.mdc`
4. Add/update root `AGENTS.md` with agent-kit + PR-only pointers if missing.
5. **Commit on a feature branch**, push, open PR (`chore(agent-kit): sync roadmap cursor policy`).

## This repo (li-cursor-agents)

Always run `./scripts/sync-agent-kit.sh` when roadmap agent-kit version bumps.

## Do not

- Commit `.env` or API keys
- Self-merge governance repos (`roadmap` `docs/**` still human merge)
- Weaken `agent-kit/hooks/guard-*.sh` or delete repo-specific preserved rules
