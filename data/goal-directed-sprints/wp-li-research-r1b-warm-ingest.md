---
workflow_repo: li-research-ingest
branch: cursor/li-research-r1b
org: li-langverse
token_source: li/.env.github (GH_TOKEN only)
plan: docs/plans/academic-research-service.md
---

# li-research — R1b warm ingest (real corpus on second Intenso)

## Context

R1 passed on **scaffold only** (empty dirs + `.ingest-bootstrap-ok`). R1b requires **actual downloaded bytes** on `/warm-index`.

| Mount in pod | Host path |
|--------------|-----------|
| `/warm-index` | `/srv/homelab/nvme/li-research/warm-index` |

First Intenso (`sdb`) is **lip-registry only**.

## North star

Run bulk ingest into `/warm-index/staging/` on branch `cursor/li-research-r1b`:

1. S2 **abstracts** (priority — run first)
2. S2 **papers** metadata
3. arXiv CS/ML OAI metadata (incremental)
4. Resume-safe state in `/warm-index/staging/.ingest-run-state.json`

**Milestone for this sprint:** ≥ **1 GiB** under `staging/s2/` (env `WARM_INGEST_MIN_BYTES`, default `1073741824`). Full 100–200 GB continues after gate; do not stop scripts once gate passes — document resume in README.

## Repos

| Repo | Branch |
|------|--------|
| `li-research-ingest` | `cursor/li-research-r1b` (from `cursor/li-research-r1`) |
| `lidb` | `cursor/li-research-r1b` |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `branch` | Push `cursor/li-research-r1b` with R1 scripts + fixes |
| 1 | `runner` | `scripts/run-warm-ingest.sh` orchestrates abstracts → papers → arxiv with resume |
| 2 | `s2-abstracts` | Run `ingest-s2-abstracts.sh` until ≥1 GiB in `staging/s2/abstracts` |
| 3 | `state` | Write `staging/.ingest-run-state.json` (bytes, datasets, timestamps) |
| 4 | `manifest` | `staging/manifest.json` listing partition files + checksums |
| 5 | `runbook` | README: `S2_API_KEY`, resume, `du -sh /warm-index/staging` |

Use `S2_API_KEY` from env when set. If missing, document blocker in README but keep retrying download paths that work without key.

Primary `--cwd`: `li-research-ingest`.

## Do not

- Write to `/srv/homelab/external` (LiP disk).
- Pass gate with only `.ingest-bootstrap-ok` and empty dirs.

## Completion gate

```bash
set -eu
WS="${LI_GOAL_WORKSPACE:-/workspace}"
INGEST="$WS/li-research-ingest"
WARM="${WARM_INDEX_PATH:-/warm-index}"
MIN_BYTES="${WARM_INGEST_MIN_BYTES:-1073741824}"
BRANCH="cursor/li-research-r1b"

test -d "$INGEST/.git"
git -C "$INGEST" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}" \
  || git -C "$INGEST" show-ref --verify --quiet "refs/heads/${BRANCH}"
test -f "$INGEST/config/datasets.toml"
test -f "$INGEST/scripts/ingest-s2-abstracts.sh"
test -f "$INGEST/scripts/run-warm-ingest.sh" || test -f "$INGEST/scripts/ingest-all.sh"

ABSTRACTS="$WARM/staging/s2/abstracts"
test -d "$ABSTRACTS"
BYTES="$(du -sb "$WARM/staging/s2" 2>/dev/null | awk '{print $1}')"
test "${BYTES:-0}" -ge "$MIN_BYTES"

find "$ABSTRACTS" -type f \( -name '*.gz' -o -name '*.jsonl' -o -name '*.jsonl.gz' -o -name '*.parquet' \) -print -quit | grep -q .

test -f "$WARM/staging/.ingest-run-state.json" || test -f "$WARM/staging/manifest.json"

echo "wp-li-research-r1b-warm-ingest gate: OK (${BYTES} bytes in staging/s2)"
```
