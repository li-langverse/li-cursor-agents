---
workflow_repo: lib
---

# Sprint: Li Browser PH-BR-0 — Foundation (agentic-first browser)

**Repos:** `lib` (primary), `li-cursor-agents` (k8s worker only), `lic` (compiler dep)  
**Branch:** `cursor/ph-br-0-foundation`  
**Agent:** `code_implementer`  
**Plan:** `.cursor/plans/li_agentic_browser_741e42fc.plan.md` (workspace) or `li-cursor-agents` copy after sync

## Mission

Bootstrap **Li Browser** (`lib` CLI): repo skeleton, Token Economy Layer stubs, ACP/MCP stubs, `lib-test` pyramid, SOTA bench stubs. Agent can snapshot `about:li` with **≤100 te** intent payload. Worker must **self-unblock** (fix build, create missing files, push branch, open PR).

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| **BR0-1** | `lib` repo init — `li.toml` workspace, README, ADRs | pending |
| **BR0-2** | Schemas — `page-intent`, `snapshot-delta`, `page-snapshot-tree` | pending |
| **BR0-3** | `lib-token-economy` — encoder, id_dictionary, `tok_count_cl100k_base` stub | pending |
| **BR0-4** | `lib-acp` + `lib-mcp` — BrowserSession stubs, stdio MCP smoke | pending |
| **BR0-5** | `lib-test` — unit tests for te budgets + delta none ≤2 te | pending |
| **BR0-6** | `lib-chrome` stub — window shell opens `about:li` | pending |
| **BR0-7** | Benches — `agent_token_budget.toml`, `sota/manifest.toml` stubs | pending |

## Progress gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
./scripts/ph-br-0-progress-gate.sh
```

## Completion gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
./scripts/ph-br-0-completion-gate.sh
```

Requires: all BR0-* phases DONE, unit tests green, intent fixture `te ≤ 100`, delta-none `te ≤ 2`.

## Self-unblock playbook

1. **No `lib` repo on GitHub** — init local git, push `cursor/ph-br-0-foundation` via `gh repo create li-langverse/lib --private --source=. --push` (ask human if org permission denied).
2. **`lic` missing** — clone sibling `../lic` or `/workspace/lic`; run `scripts/build.sh`.
3. **Tests fail** — fix smallest failing unit test first; never skip te assertions.
4. **Stuck 5 loops** — run completion gate, write gaps to `data/goal-directed-loop-last-gaps.txt`, switch to next BR0 phase.
5. **K8s worker** — manifests live in `li-cursor-agents/deploy/k8s/engine/`; scale with `kubectl -n li-swarm scale deploy/li-ph-br-0-lib-browser --replicas=1`.

## Deliverables (every iteration)

1. Pick next pending BR0-* phase.
2. Implement in Li / JSON schemas per plan.
3. Run progress gate.
4. Commit + push `lib`; PR if branch ahead of main.
5. Update Phase status table when gates green.

## Read first

1. Plan: Token Economy Layer + Testing pyramid + PH-BR-0 exit gate
2. `studio/docs/game-dev/specs/studio-gui-control-rfc.md` — UiSession pattern
3. `lic/scripts/lis-mcp-li-engine.py` — MCP shape (replace stubs with real Li)

## Secrets

Never log `GH_TOKEN`, `CURSOR_API_KEY`. Use `li-agents-secrets` on cluster.
