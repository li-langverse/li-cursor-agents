---
workflow_repo: li-research-ingest
branch: cursor/li-research-r0
org: li-langverse
token_source: li/.env.github (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — warm index ingest track

## North star

Scaffold bulk ingest for **100–200 GB warm corpus**: S2 abstracts + papers + citations + arXiv CS/ML OAI. Ingest writes to staging dir; load into lidb when schema ready.

## Repos

| Repo | Branch |
|------|--------|
| `li-research-ingest` | `cursor/li-research-r0` |
| `lidb` | `cursor/li-research-r0` |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `ingest-cli` | `src/cli.ts` or `scripts/ingest-s2-abstracts.sh` entrypoint |
| 1 | `ingest-config` | `config/datasets.toml` listing S2 dataset names + staging paths |
| 2 | `ingest-arxiv` | `scripts/ingest-arxiv-oai.sh` skeleton |
| 3 | `ingest-docs` | README with storage prerequisite (250 Gi PVC) |

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
test -d "$WS/li-research-ingest/.git"
test -f "$WS/li-research-ingest/README.md"
test -f "$WS/li-research-ingest/config/datasets.toml" || test -f "$WS/li-research-ingest/config/datasets.example.toml"
ls "$WS/li-research-ingest/scripts"/*.sh >/dev/null 2>&1 || test -f "$WS/li-research-ingest/package.json"
echo "wp-li-research-ingest gate: OK"
```
