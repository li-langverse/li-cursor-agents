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

## Rules

- Feature branch only; **never** push to `main` / `dev` / `master`
- **Do not self-merge** — open PR and stop
- `roadmap` is governance: PR for human review
- Preserved paths: see `roadmap/agent-kit/manifest.toml` `[preserve]`
