---
workflow_repo: lis
branch: feat/lip-registry-agent-first
plan: docs/superpowers/specs/2026-06-08-lip-registry-agent-first-design.md
---

# lip registry — agent-first (Phase 1–2)

**Repos:** `lis` (primary), `lic` (liserver edge fixes if needed), `lidb` (audit schema when wiring audit)  
**Branch:** `feat/lip-registry-agent-first` (lis); `cursor/ph-ml-li-array` (lic httpd only if edge blocked)  
**Agent:** `code_implementer`  
**Spec:** `lis/docs/superpowers/specs/2026-06-08-lip-registry-agent-first-design.md`

## North star

Cursor agents publish packages via **MCP `lip-registry`** or **`lip --json`** using only:

```bash
LIP_REGISTRY_URL=https://lip.lilangverse.xyz/v1
LIP_REGISTRY_TOKEN=…
```

No Host-header hacks, no `:30422` bypass in agent scripts.

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| **P1** | `GET /v1/agent/capabilities`, `POST /v1/publish/validate`, `remediation` on registry errors | pending |
| **P2** | `scripts/lip-cli.sh` — `publish|validate|whoami --json`, reads `LIP_REGISTRY_TOKEN` + `~/.config/lip/credentials.toml` | pending |
| **P3** | `mcp/lip-registry/` stdio MCP server (Phase 1 tools) + `.cursor/mcp.json.example` | pending |
| **P4** | OpenAPI sync, `tests/registry-agent-first.test`, docs | pending |
| **P5** | Cluster smoke: `job-lip-put-smoke` green via liserver `:80` (coordinate lic rebuild if needed) | pending |

## Reference scripts (use, do not duplicate blindly)

| Script | Purpose |
|--------|---------|
| `lis/scripts/lip-multipeer-e2e.sh` | Full publish flow via liserver `:80` |
| `lis/deploy/k8s/registry/job-lip-put-smoke.yaml` | PUT smoke |
| `lis/routes/registry/handlers.py` | REST dispatch |
| `lis/routes/registry/audit_log.py` | Access log pattern |
| `lis/openapi/registry-v1.yaml` | Contract |
| `lic/runtime/li_rt_net.c` | PUT proxy (branch `cursor/ph-ml-li-array`) |

## Iteration rules

1. Read phase table; pick **first pending** phase.
2. Implement minimal diff; commit + push to `feat/lip-registry-agent-first`.
3. Run **progress gate** every iteration.
4. Mark phase **done** only when progress gate proves that phase.
5. When all P1–P5 done, **completion gate** must pass.

## Do not

- Build OIDC/device flow in this sprint (Phase 4 of spec — separate sprint).
- Add human web UI.
- Break existing `tests/registry-api.test`.

## Progress gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
bash scripts/lip-agent-first-progress-gate.sh
```

## Completion gate

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
bash scripts/lip-agent-first-completion-gate.sh
```

## Deliverables (every iteration)

1. Implement next pending phase.
2. Run progress gate; fix failures.
3. Push branch; note PR URL in commit or iteration log if opened.
4. Update Phase status table when gate proves phase done.
