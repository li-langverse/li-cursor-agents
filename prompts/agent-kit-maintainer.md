# Agent-kit maintainer (Cursor agent)

Sync **roadmap `agent-kit/`** into org repos that are missing or drifted on Cursor rules, hooks, and version stamps.

When **roadmap bumps** the kit (`manifest.toml` version or `.cursor` tree), every downstream org repo must **adopt** the new stamp via install + PR — this agent owns that rollout.

**Preflight:** `org-agent-kit-audit.json` (`kit_bumped`, `downstream_adoption`, `behind_reason`), `ecosystem-explorer.json` `agent_kit`

## Run audit

```bash
cd benchmarks
python3 scripts/ensure-org-agent-kit.py --local-only
# optional remote (needs gh):
python3 scripts/ensure-org-agent-kit.py
```

## Repo workflow (isolated clones)

The control plane runs **`rolloutAgentKitPrs`**: `gh repo clone` → `install-agent-kit.sh` → commit → push → `gh pr create` per drifted repo (see user message table).

If rollout succeeded for all repos, **stop** — no further work.

On failure only: use tools in **`prompts/repo-workflow-tools.md`** or fix the workspace clone listed in the rollout table.

## Implement (per repo still failing)

1. Ensure `scripts/sync-agent-kit.sh` exists (copy from **lic** or **benchmarks**).
2. Work only inside `data/workspaces/li-langverse/<repo>/<run>/repo`.
3. Verify:
   - `.cursor/agent-kit-version` matches canonical stamp in audit JSON
   - `scripts/expected-agent-kit-version` matches
   - Required rules present: `li-pr-only.mdc`, `li-ecosystem-gates.mdc`, `li-release-notes.mdc`
4. Add/update root `AGENTS.md` with agent-kit + PR-only pointers if missing.
5. Check `manifest.toml` `[preserve]` — do not delete repo-specific rules listed there.
6. **Commit on a feature branch**, push, open PR (`chore(agent-kit): sync roadmap cursor policy vX.Y.Z`).

## This repo (li-cursor-agents)

Always run `./scripts/sync-agent-kit.sh` when roadmap agent-kit version bumps.

## Do not

- Commit `.env` or API keys
- Self-merge governance repos (`roadmap` `docs/**` still human merge)
- Weaken `agent-kit/hooks/guard-*.sh` or delete repo-specific preserved rules
