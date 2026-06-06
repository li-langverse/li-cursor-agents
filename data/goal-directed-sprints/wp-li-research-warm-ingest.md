---
workflow_repo: li-research-ingest
branch: cursor/li-research-r1
org: li-langverse
token_source: li/.env.github (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — warm index ingest (second Intenso)

## Storage (cluster)

Warm index PVC is bound on **engine** second Intenso:

| Mount in pod | Host path |
|--------------|-----------|
| `/warm-index` | `/srv/homelab/intenso-research/li-research/warm-index` |

First Intenso (`sdb`) is **lip-registry only** — never write ingest data there.

## North star

Implement bulk ingest into `/warm-index/staging/` targeting **100–200 GB** warm corpus:

1. S2 **abstracts** (priority)
2. S2 **papers** metadata
3. S2 **citations** edges (subset)
4. arXiv CS/ML OAI metadata

Use Semantic Scholar Datasets API + arXiv OAI. Secrets (S2 API key) via env `S2_API_KEY` from Vault later — for now document in README.

## Repos

| Repo | Branch |
|------|--------|
| `li-research-ingest` | `cursor/li-research-r1` |
| `lidb` | `cursor/li-research-r1` |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `paths` | `config/datasets.toml` with `warm_index = "/warm-index"` paths |
| 1 | `s2-abstracts` | `scripts/ingest-s2-abstracts.sh` downloads to `/warm-index/staging/s2/abstracts` |
| 2 | `s2-papers` | `scripts/ingest-s2-papers.sh` metadata only |
| 3 | `arxiv` | `scripts/ingest-arxiv-oai.sh` CS/ML subset |
| 4 | `loader-stub` | `scripts/load-into-lidb.sh` stub reading staging → lidb 006 schema |
| 5 | `runbook` | README: resume, diffs, disk check (`du -sh /warm-index`) |

Primary `--cwd`: `li-research-ingest`.

## Do not

- Write to `/srv/homelab/external` (LiP disk).
- Download full OpenAlex 1.6 TB mirror.

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
INGEST="$WS/li-research-ingest"
WARM="${WARM_INDEX_PATH:-/warm-index}"
test -d "$INGEST/.git"
test -f "$INGEST/config/datasets.toml"
test -x "$INGEST/scripts/ingest-s2-abstracts.sh" || test -f "$INGEST/scripts/ingest-s2-abstracts.sh"
test -f "$INGEST/scripts/ingest-arxiv-oai.sh"
test -d "$WARM/staging" || mkdir -p "$WARM/staging"
# Ingest worker must have /warm-index mounted; smoke download or marker
test -f "$WARM/staging/.ingest-bootstrap-ok" || test -d "$WARM/staging/s2"
echo "wp-li-research-warm-ingest gate: OK"
```
