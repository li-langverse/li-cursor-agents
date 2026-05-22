---
name: push-li-github
description: >-
  Commit and push agent work via li-cursor-agents repo-workflow post-hook or lic
  scripts. Use for guaranteedPush agents after CI-verified changes. PR-only.
---

# Push Li org repos (agent runner)

**Canonical runner:** `li-cursor-agents` — skills live under `.cursor/skills/` in this package.

## Isolated clone workflow (default for implementers)

1. Agent runs in `data/workspaces/<org>/<repo>/<run>/repo` (see `repo-workflow-tools.md`).
2. Post-hook runs `commitPushOpenPrAfterAgentRun` when the workspace is dirty.
3. Do **not** ask the human to `git push` if the post-hook succeeded.

Manual recovery:

```bash
cd li-cursor-agents
npm run repo-workflow -- commit-pr --repo <name> --workspace <cloneDir> --branch <b> --title "..." --body-file /tmp/body.md
```

## Lic monorepo (compiler / std / benches in-tree)

From a **lic** checkout:

```bash
./scripts/agent-push-github.sh "feat(scope): short description"
```

Requires `GH_TOKEN` in Cursor workspace `../../.env` (never commit or paste tokens).

## Do not

- Force-push `main`/`master` without explicit user request
- Self-merge — open PR only (`li-pr-only`)
- Commit `.env.github` or secrets
