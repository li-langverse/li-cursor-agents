---
workflow_repo: li-research-gateway
branch: cursor/li-research-r0
org: li-langverse
token_source: li/.env.github (GH_TOKEN only — never beelink-cleanup/.env)
plan: docs/plans/academic-research-service.md
---

# li-research — R0 product track (li-langverse)

## Credential rule

Use **only** `li-langverse` token. Never push to `cap-jmk-launchpad/*`. HTTP stays in `li-httpd` / `li-net`, not `lic`.

## North star

R0 scaffolds: `li-research-gateway` (li-api-kit skeleton), `li-research-mcp` stub, `li-research-ingest` package layout, lidb `006_research.sql`, `/v1/research` route stub in `li-api-kit`, OpenAPI `research-v1.yaml`.

## Repos and branches

| Repo | Branch | Role |
|------|--------|------|
| `li-research-gateway` | `cursor/li-research-r0` | Main API + orchestrator scaffold |
| `li-research-mcp` | `cursor/li-research-r0` | MCP tools stub (stdio server) |
| `li-research-ingest` | `cursor/li-research-r0` | Bulk ingest CLI layout |
| `lidb` | `cursor/li-research-r0` | `migrations/006_research.sql` |
| `li-api-kit` | `cursor/li-research-r0` | Add `/v1/research` route + ServiceId |
| `token-telemetry-service` | `cursor/li-research-r0` | Register `li-research` product_id in docs/stub |

Create missing repos in `li-langverse` before implementation (private).

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `r0-repos` | Create `li-research-gateway`, `li-research-mcp`, `li-research-ingest` if missing |
| 1 | `r0-schema` | `lidb/migrations/006_research.sql` with paper_record, citation_edge, research_job tables |
| 2 | `r0-openapi` | `li-research-gateway/openapi/research-v1.yaml` with papers/search + jobs stubs |
| 3 | `r0-gateway` | `li-api-kit` route `/v1/research` + `li-research` ServiceId |
| 4 | `r0-mcp` | `li-research-mcp` package.json + README listing tool names |

Primary `--cwd`: `li-research-gateway` after phase 0.

## Do not

- Add HTTP/DB code to **lic**.
- Store provider API keys in product repos (Vault-only).
- Implement full Feynman workflows in R0 (R1 scope).

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
ORG="${LI_GITHUB_ORG:-li-langverse}"
for repo in li-research-gateway li-research-mcp li-research-ingest; do
  test -d "$WS/$repo/.git" || { echo "missing $repo clone"; exit 1; }
done
test -f "$WS/li-research-gateway/openapi/research-v1.yaml"
test -f "$WS/li-research-gateway/README.md"
test -f "$WS/li-research-mcp/README.md"
test -f "$WS/li-research-ingest/README.md"
LIDB="$WS/lidb"
test -d "$LIDB/.git"
grep -r paper_record "$LIDB/migrations" >/dev/null 2>&1
KIT="$WS/li-api-kit"
test -d "$KIT/.git"
grep -r li-research "$KIT/src" >/dev/null 2>&1 || grep -r research-gateway "$KIT/src" >/dev/null 2>&1
echo "wp-li-research-r0-product gate: OK"
```
