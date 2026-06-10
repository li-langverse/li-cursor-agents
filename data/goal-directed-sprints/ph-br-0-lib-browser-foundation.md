---
workflow_repo: li-browser
---

# Sprint: Li Browser PH-BR-0 — Foundation (agentic-first browser)

**Repos:** `li-browser` (primary), `lic` (compiler), `li-cursor-agents` (k8s worker)  
**Branch:** `cursor/ph-br-0-foundation`  
**Agent:** `code_implementer`  
**Git remote:** `origin` → `https://gitlab.lilangverse.xyz/li-langverse/li-browser.git` (GitLab-primary)

## Mission

Bootstrap Li Browser (`li-browser` repo): Token Economy Layer, ACP/MCP stubs, `lib-test` pyramid, SOTA bench stubs. Intent snapshot **≤100 te**; delta-none **≤2 te**.

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| **BR0-1** | `li-browser` repo init — `li.toml`, README, ADRs | pending |
| **BR0-2** | JSON schemas (page-intent, snapshot-delta, tree) | pending |
| **BR0-3** | `lib-token-economy` encoder + id_dictionary | pending |
| **BR0-4** | `lib-acp` + `lib-mcp` stubs | pending |
| **BR0-5** | `lib-test` unit te budget tests | pending |
| **BR0-6** | `lib-chrome` stub — `about:li` | pending |
| **BR0-7** | Bench stubs + GitLab push | pending |

## Progress gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
./scripts/ph-br-0-progress-gate.sh
```

## Completion gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
./scripts/ph-br-0-completion-gate.sh
```

## Self-unblock (GitLab-primary)

1. Create `li-langverse/li-browser` on **GitLab** (not GitHub); push `origin`.
2. Enable GitHub push-mirror in GitLab project settings.
3. K8s worker uses `GITLAB_TOKEN` + `k8s-git-auth.sh` — never `GH_TOKEN` for git push.
4. Clone `lic` from `gitlab.lilangverse.xyz/li-langverse/lic.git` if missing.

## Deliverables (every iteration)

1. Next pending BR0-* phase.
2. Run progress gate.
3. `git push origin cursor/ph-br-0-foundation`
4. Update Phase status when gates green.
