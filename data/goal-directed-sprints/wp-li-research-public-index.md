---
workflow_repo: li-research-ingest
branch: cursor/li-research-public-index
org: li-langverse
token_source: li/.env.github (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — public API warm index (no S2 key)

## North star

Build warm index from **public APIs only**:

1. **arXiv OAI** — CS/ML metadata (no key)
2. **OpenAlex REST** — Computer Science works via polite pool (`OPENALEX_MAILTO`)

No `S2_API_KEY` required. S2 bulk remains optional when a key is wired later.

Storage: `/warm-index` on engine NVMe (`/srv/homelab/nvme/li-research/warm-index`).

## Repos

| Repo | Branch |
|------|--------|
| `li-research-ingest` | `cursor/li-research-public-index` |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `openalex-script` | `scripts/ingest-openalex.sh` + `lib/openalex-fetch.sh` |
| 1 | `public-runner` | `scripts/run-public-ingest.sh` orchestrates arxiv → openalex |
| 2 | `arxiv` | Complete configured arXiv OAI sets |
| 3 | `openalex` | Paginate OpenAlex until ≥100 MiB combined public corpus |
| 4 | `state` | `.ingest-run-state.json` with `ingest_mode: public` |

Primary `--cwd`: `li-research-ingest`.

## Env

```
WARM_INGEST_MODE=public
WARM_INGEST_MIN_BYTES=104857600
OPENALEX_MAILTO=you@example.com
```

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
INGEST="$WS/li-research-ingest"
WARM="${WARM_INDEX_PATH:-/warm-index}"
MIN_BYTES="${WARM_INGEST_MIN_BYTES:-104857600}"
BRANCH="cursor/li-research-public-index"

test -d "$INGEST/.git"
git -C "$INGEST" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}" \
  || git -C "$INGEST" show-ref --verify --quiet "refs/heads/${BRANCH}"
test -f "$INGEST/scripts/public-index-gate.sh"
WARM_INDEX_PATH="$WARM" LI_RESEARCH_INGEST_ROOT="$INGEST" WARM_INGEST_MIN_BYTES="$MIN_BYTES" \
  bash "$INGEST/scripts/public-index-gate.sh"
```
