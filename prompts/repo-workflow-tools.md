# Repo workflow tools (platform agents)

Use **isolated workspaces** under `data/workspaces/<org>/<repo>/<run>/repo` — never commit directly on a developer's dirty sibling clone unless debugging.

## Prerequisites

- `GH_TOKEN` / `GITHUB_TOKEN` in `../.env.github` (or `.env`)
- `gh` CLI authenticated (`gh auth status`)
- `npm run build` in `li-cursor-agents`

## CLI (deterministic)

```bash
cd li-cursor-agents
./scripts/agent-repo-workflow.sh agent-kit-rollout          # all drifted repos from briefing
./scripts/agent-repo-workflow.sh agent-kit-rollout --dry-run

# Manual steps for ci_maintainer / docs_maintainer:
./scripts/agent-repo-workflow.sh prepare --repo lip --branch chore/ci-template
# edit files under printed cloneDir
./scripts/agent-repo-workflow.sh commit-pr \
  --repo lip \
  --workspace data/workspaces/li-langverse/lip/<run>/repo \
  --branch chore/ci-template \
  --base main \
  --title "chore(ci): add org workflow" \
  --body "…"
```

## Swarm attribution (traceability)

Post-hook runs stamp GitHub artifacts without HTML comments in PR bodies:

| Surface | Marker |
|---------|--------|
| Commit message | `Li-Agent-Run: <run_id>` + `Li-Agent-Id: <agent_id>` trailers |
| Branch | `chore/agent-<agent_id>-<suffix>` |
| PR labels | `li-swarm`, `agent:<agent_id>` |
| PR body | Plain markdown lines: swarm run id + agent id (human-readable) |
| Control plane | `agent_runs.meta.swarm_attribution` + `GET /api/swarm/artifacts` |

Query: `GET /api/swarm/artifacts?run_id=…&branch=…&pr=li-demo#7`

## PR body template (code-changing agents)

```markdown
<!-- li-agent -->
## Agent deliverable
- [x] Branch pushed and PR opened (not draft)
- [x] CI triggered on PR
- [x] Tests added / updated — paths: `…`
- [x] Bench evidence (numerics/autoresearch only) — `li-tests/`, `benchmarks/`, or https://li-langverse.github.io/benchmarks/
- [x] Release notes / CHANGELOG if required by repo policy
- [ ] merge-approved (human adds after review)
```

`agent-pr-deliverable-gate.py` and `pr-merge-gate.py` fail PRs missing `## Agent deliverable` with at least one `- [x]`. Label `agent-incomplete` blocks merge until the agent finishes.

## Guaranteed push (post-hook)

For workflow agents (`code_implementer`, `bug_fixer`, `docs_maintainer`, `ci_maintainer`, numerics agents):

1. The runner prepares an isolated workspace (`li-demo` for docs/CI by default, `lic` for numerics).
2. Edit files in that clone during your run.
3. **Push before you stop** — commit and `git push -u origin <branch>` on the workflow branch.
4. After you finish, the **supervisor post-hook** runs `commit` → `push` (including commits already on branch) → `gh pr create` when enabled (requires `GH_TOKEN`).

`LI_REPO_WORKFLOW_BRANCH` + `LI_REPO_WORKFLOW_TRACK_REMOTE=1` check out `origin/<branch>` instead of a fresh `chore/agent-*` branch. Disable PR: `LI_REPO_WORKFLOW_OPEN_PR=0`.

Skip push in tests: `LI_REPO_WORKFLOW_SKIP_PUSH=1`. Fixture tests: `LI_REPO_WORKFLOW_USE_FIXTURE=1` (local `fixtures/li-demo-workflow`).

## Rules

- Feature branch only; **never** push to `main` / `dev` / `master`
- **Do not self-merge** — open PR and stop
- `roadmap` is governance: PR for human review
- Preserved paths: see `roadmap/agent-kit/manifest.toml` `[preserve]`
