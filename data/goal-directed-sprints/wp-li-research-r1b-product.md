---
workflow_repo: li-research-gateway
branch: cursor/li-research-r1b
org: li-langverse
token_source: li/.env.github (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — R1b product (MCP + api-kit + container)

## Context

R1 passed on **gateway handlers + R0 MCP tool-name stubs**. R1b requires **pushed `cursor/li-research-r1b` branches**, MCP HTTP client, non-stub api-kit routing, and a buildable gateway image.

## North star

| Repo | Branch | Deliverable |
|------|--------|-------------|
| `li-research-gateway` | `cursor/li-research-r1b` | Search handlers + Dockerfile + `npm test` |
| `li-research-mcp` | `cursor/li-research-r1b` | MCP tools call gateway over HTTP (not name-only stubs) |
| `li-api-kit` | `cursor/li-research-r1b` | `/v1/research` proxy to real gateway URL (`stub: false`) |
| `lidb` | `cursor/li-research-r1b` | Schema sync if needed |

Gateway reads `/warm-index/staging` when ingest populates it; S2 API fallback when local miss.

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `branch` | Create `cursor/li-research-r1b` from R1 on gateway, mcp, li-api-kit |
| 1 | `mcp-http` | `li-research-mcp` implements `search_papers` → `POST .../papers/search` |
| 2 | `api-kit` | `li-api-kit` registry entry `li-research` with cluster/base URL, `stub: false` |
| 3 | `dockerfile` | Gateway `Dockerfile` + `/healthz` |
| 4 | `ci` | `npm test` or `npm run build` passes in gateway |
| 5 | `push` | All three repos pushed to `origin/cursor/li-research-r1b` |

Primary `--cwd`: `li-research-gateway`.

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
GW="$WS/li-research-gateway"
MCP="$WS/li-research-mcp"
KIT="$WS/li-api-kit"
BRANCH="cursor/li-research-r1b"

for repo in "$GW" "$MCP" "$KIT"; do
  test -d "$repo/.git"
  git -C "$repo" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"
done

test -f "$GW/openapi/research-v1.yaml"
grep -rq papers/search "$GW/src"
test -f "$GW/Dockerfile"

grep -rqE 'fetch\(|http://|https://|undici|axios|got\(' "$MCP/src"
grep -rq search_papers "$MCP/src"

grep -rq '/v1/research' "$KIT/src/gateway" || grep -rq '/v1/research' "$KIT/src"
grep -rq li-research "$KIT/src"
! grep -rq 'stub: true' "$KIT/src/registry.ts" 2>/dev/null \
  || grep -rq 'li-research-gateway' "$KIT/src"

cd "$GW"
if [ -f package.json ]; then
  npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null || true
  npm test --if-present || npm run build --if-present
fi

echo "wp-li-research-r1b-product gate: OK"
```
