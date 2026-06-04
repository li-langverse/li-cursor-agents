---
workflow_repo: token-telemetry-service
branch: cursor/li-db-studio-product-p0
org: li-langverse
token_source: li/.env.github (GH_TOKEN only — never beelink-cleanup/.env)
plan: docs/plans/li-db-studio-platform-plan.md
---

# li-db studio — li-langverse product track

## Credential rule

Use **only** `li-langverse` token from `li/.env.github`. Never push to `cap-jmk-launchpad/*`. HTTP/runtime code stays in `li-httpd` / `li-net`, not `lic`.

## North star

Phase P0 contracts + scaffolds: unified token pool schema, TTS OpenAPI + bridge skeleton, `li-api-kit` template, `li-db-studio` operator shell. Products remain keyless; TTS is sole metering egress (WP-030).

## Repos and branches

| Repo | Branch | Role |
|------|--------|------|
| `token-telemetry-service` | `cursor/li-db-studio-product-p0` | TTS bridge (TS), authorize/usage stubs |
| `li-api-kit` | `cursor/li-db-studio-product-p0` | Service skeleton (health, metrics, TTS client) |
| `li-db-studio` | `cursor/li-db-studio-product-p0` | DataStudio UI scaffold |
| `lidb` | `cursor/li-db-studio-schema-p0` | SQL migrations: token_pool, telemetry_events |

Create missing repos in org `li-langverse` before implementation (private).

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `p0-repos` | Ensure three product repos exist; initial README + package.json or Li scaffold |
| 1 | `p1-schema` | Migrations in `lidb` + mirrored SQL in `li-db-studio/migrations/` |
| 2 | `p2-tts-contract` | `token-telemetry-service/openapi/tts-v1.yaml` + stub handlers |
| 3 | `p3-api-kit` | `li-api-kit` healthz/readyz/metrics + Dockerfile |
| 4 | `p4-studio-shell` | `li-db-studio` app reads TTS pool API (mock OK in P0) |

Primary `--cwd`: `token-telemetry-service` after phase 0.

## Do not

- Add HTTP/DB code to **lic**.
- Store provider API keys in product repos (Vault-only per plan).
- Use cap-jmk-launchpad token for any git push.

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
ORG="${LI_GITHUB_ORG:-li-langverse}"
for repo in token-telemetry-service li-api-kit li-db-studio; do
  test -d "$WS/$repo/.git" || { echo "missing $repo clone"; exit 1; }
done
test -f "$WS/token-telemetry-service/openapi/tts-v1.yaml"
test -f "$WS/li-api-kit/README.md"
test -f "$WS/li-db-studio/README.md"
LIDB="$WS/lidb"
test -d "$LIDB/.git"
grep -r token_pool "$LIDB" >/dev/null 2>&1 || grep -r token_pool "$WS/li-db-studio/migrations" >/dev/null 2>&1
grep -r telemetry_events "$LIDB" >/dev/null 2>&1 || grep -r telemetry_events "$WS/li-db-studio/migrations" >/dev/null 2>&1
echo "wp-li-product gate: OK"
```
