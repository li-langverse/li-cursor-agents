---
name: explore-li-ecosystem
description: >-
  Map Li org repos and pick the correct workflow clone before editing. Use for
  goal-directed loops, code_implementer, bug_fixer, gap explorer, and any task
  that might touch lic, studio, ui, sim, benchmarks, or control-plane repos.
---

# Explore Li ecosystem (repo placement)

**Before any file edit**, decide which **GitHub repo** owns the change. Wrong-repo PRs are the main failure mode for goal-directed agents.

## Mandatory checks (in order)

1. **Explicit routing** — goal frontmatter `workflow_repo:`, handoff `work.target_repo`, briefing `implementation_queue[].repo`, or CLI `--workflow-repo` / `LI_REPO_WORKFLOW_REPO`. **Never override** these.
2. **Issue / PR URL** — `github.com/li-langverse/<repo>/` → that repo.
3. **Path signals** — table below (first strong match wins).
4. **Agent default** — `code_implementer` / `bug_fixer` → `li-demo` only when nothing else matches.

## Workflow repo routing table

| Repo | Edit here when paths or topic include |
|------|----------------------------------------|
| **lic** | `std/`, `li-tests/`, `build/`, `runtime/`, `compiler/`, `trusted.lean`, `docs/superpowers/plans/`, `docs/verification/`, **httpd** (`li-tests/httpd/`, `li-tests/routing/`, `scripts/httpd-*`, `docs/ecosystem/httpd-*`), master-plan **PH-2*** / **PH-5***, numerics proofs in-tree |
| **studio** | World Studio shell, `studio.toml`, game-dev UX plans, viewport/outliner, `PH-GD-*`, `PH-UX-*`, `world.li`, `docs/game-dev/world-studio-*` in **studio** repo (not lic) |
| **studio.ai** | Agent-facing studio AI, `@cursor/sdk` studio integration |
| **ui** | `li-ui` package, shared UI components shipped as org package |
| **sim** | `li-sim`, simulation algorithms, PDE/ODE package code |
| **render** | `li-render`, graphics pipeline package |
| **lis** | Standalone httpd **package** mirror (when issue explicitly targets `lis`, not lic monorepo httpd plan) |
| **lip** | Package registry, publish, `lip.toml` tooling |
| **lit** | Test runner, `lit` CLI, coverage gates |
| **benchmarks** | `agent-briefing.py`, explorer digests, catalog, swarm scorecards — **not** product code |
| **li-cursor-agents** | Agent registry, lanes, dashboard, `prompts/`, `.cursor/skills/`, control-plane |
| **roadmap** | Org vision, engineering standards, proposals — **human merge**; agents open PR only |
| **li-demo** | Agent-kit rollout templates, CI snippets, docs_maintainer/ci_maintainer sandboxes |

## Goal-directed loop (CLI)

Set **both** workflow repo and SDK cwd to the sibling clone:

```bash
# lic httpd / compiler work
./scripts/goal-directed-loop.sh \
  --goal-file ./goals/httpd-next.md \
  --workflow-repo lic \
  --cwd ../lic

# studio UX wave
./scripts/goal-directed-loop.sh \
  --goal-file ./goals/studio-ux-wave-a.md \
  --workflow-repo studio \
  --cwd ../studio
```

Goal file frontmatter (auto-detected by loop + `run-agent`):

```yaml
---
workflow_repo: lic
cwd: ../lic
---
```

Or one line in the goal body: `Workflow repo: studio`

## Isolated clone rules

- Edits happen only under `data/workspaces/li-langverse/<repo>/<run>/repo` (runner prepares this).
- **Do not** implement studio/ui/sim features inside **lic** unless the handoff or plan explicitly says lic hosts the scaffold (e.g. `game_engine_ux` v1 docs under `lic/docs/ecosystem/`).
- Splitting work across repos requires **separate PRs** per repo — one goal → one primary repo per run.

## MCP / briefing helpers

When unsure:

- `li-ecosystem-context`: `list_org_repos`, `search_repo_tree`, `describe_package`
- Briefing: `implementation_queue`, `org_packages`, `ecosystem_explorer.repos`
- `package_architect` + `record_placement_decision` for new cross-cutting features

## Related

- `repo-workflow-tools.md` — prepare / commit-pr CLI
- `li-ecosystem-discipline` — gates, CVE, release notes across repos
- `package-architect` — formal `package_placement` when scope is ambiguous
