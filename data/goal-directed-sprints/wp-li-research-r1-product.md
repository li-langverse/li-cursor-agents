---
workflow_repo: li-research-gateway
branch: cursor/li-research-r1
org: li-langverse
token_source: li/.env.github (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — R1 product (gateway + search API)

## North star

Working **sync paper search** against warm index path (local staging + API fallback):

- `li-research-gateway`: implement `POST /v1/research/papers/search`, `GET .../papers/{id}`
- Read staging under `/warm-index` when ingest worker populates it
- Merge `cursor/li-research-r1` into li-api-kit research route
- `li-research-mcp`: expose `research_search_papers` tool

## Repos

| Repo | Branch |
|------|--------|
| `li-research-gateway` | `cursor/li-research-r1` |
| `li-research-mcp` | `cursor/li-research-r1` |
| `li-api-kit` | `cursor/li-research-r1` |
| `lidb` | `cursor/li-research-r1` |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `search-handler` | gateway handler reads local index stub + S2 API fallback |
| 1 | `openapi-impl` | handlers match `openapi/research-v1.yaml` |
| 2 | `mcp-tools` | mcp server calls gateway HTTP |
| 3 | `dockerfile` | gateway container builds and `/healthz` works |

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
GW="$WS/li-research-gateway"
MCP="$WS/li-research-mcp"
test -d "$GW/.git"
test -f "$GW/openapi/research-v1.yaml"
grep -rq papers/search "$GW/src" || grep -rq paper_search "$GW/src"
test -d "$MCP/.git"
grep -rq research_search "$MCP/src" || grep -rq search_papers "$MCP/src"
KIT="$WS/li-api-kit"
grep -rq li-research "$KIT/src" || grep -rq research "$KIT/src/gateway"
echo "wp-li-research-r1-product gate: OK"
```
