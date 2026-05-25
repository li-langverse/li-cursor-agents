#!/usr/bin/env bash
# Clean stale swarm data under data/ (mock runs, over-cap workspaces, old run logs).
#
# Default: dry-run. Use --apply to move removable trees into data/archive/YYYY-MM-DD.tar.gz
# (and delete source after a successful archive). Workspace prune uses npm run workspace:prune.
#
# Usage:
#   ./scripts/clean-swarm-data.sh
#   ./scripts/clean-swarm-data.sh --apply
#   LI_WORKSPACE_PRUNE_FORCE=1 ./scripts/clean-swarm-data.sh --apply
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
cd "$ROOT"
source "$ROOT/scripts/env.defaults.sh"
[[ -f "$ROOT/.env" ]] && { set -a; source "$ROOT/.env"; set +a; }
li_resolve_env_paths "$ROOT"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --dry-run) APPLY=false ;;
    -h|--help)
      echo "Usage: $0 [--dry-run|--apply]"
      exit 0
      ;;
  esac
done

DATA="$ROOT/data"
ARCHIVE_DIR="$DATA/archive"
DATE_TAG="$(date +%Y-%m-%d)"
ARCHIVE_TAR="$ARCHIVE_DIR/${DATE_TAG}-clean.tar.gz"
MAX_AGE_DAYS="${LI_WORKSPACE_PRUNE_MAX_AGE_DAYS:-7}"
RUN_KEEP_DAYS="${LI_RUN_ARTIFACT_MAX_AGE_DAYS:-7}"
RUN_KEEP_PER_AGENT="${LI_RUN_ARTIFACT_KEEP_PER_AGENT:-30}"
LOG_KEEP_DAYS="${LI_LOG_MAX_AGE_DAYS:-7}"

log() { printf '%s\n' "$*"; }
action() {
  if $APPLY; then
    log "[apply] $*"
  else
    log "[dry-run] $*"
  fi
}

bytes_of() {
  if [[ -e "$1" ]]; then
    du -sb "$1" 2>/dev/null | awk '{print $1}'
  else
    echo 0
  fi
}

TOTAL_BYTES=0
ARCHIVE_QUEUE=()
add_bytes() { TOTAL_BYTES=$((TOTAL_BYTES + $1)); }

archive_paths() {
  local label="$1"
  shift
  local paths=("$@")
  [[ ${#paths[@]} -gt 0 ]] || return 0
  local existing=()
  for p in "${paths[@]}"; do
    [[ -e "$p" ]] && existing+=("$p")
  done
  [[ ${#existing[@]} -gt 0 ]] || return 0

  local batch_bytes=0
  for p in "${existing[@]}"; do
    batch_bytes=$((batch_bytes + $(bytes_of "$p")))
  done
  add_bytes "$batch_bytes"
  action "archive $label (${#existing[@]} paths, ~$((batch_bytes / 1048576)) MiB) -> ${ARCHIVE_TAR##*/}"

  if ! $APPLY; then
    return 0
  fi
  ARCHIVE_QUEUE+=("${existing[@]}")
}

flush_archive_queue() {
  [[ ${#ARCHIVE_QUEUE[@]} -gt 0 ]] || return 0
  if ! $APPLY; then
    return 0
  fi
  mkdir -p "$ARCHIVE_DIR"
  local list_file rel p
  list_file="$(mktemp)"
  for p in "${ARCHIVE_QUEUE[@]}"; do
    rel="${p#"$ROOT"/}"
    [[ "$rel" == "$p" ]] && rel="${p#"$ROOT"}"
    rel="${rel#/}"
    printf '%s\n' "$rel" >>"$list_file"
  done
  tar -czf "$ARCHIVE_TAR" -C "$ROOT" -T "$list_file"
  rm -f "$list_file"
  for p in "${ARCHIVE_QUEUE[@]}"; do
    rm -rf "$p"
  done
  ARCHIVE_QUEUE=()
}

prune_run_artifacts() {
  local runs="$DATA/runs"
  [[ -d "$runs" ]] || return 0
  local now_ms max_ms keep
  now_ms=$(date +%s%3N)
  max_ms=$((RUN_KEEP_DAYS * 86400000))
  keep="$RUN_KEEP_PER_AGENT"

  mapfile -t files < <(find "$runs" -maxdepth 1 -type f \( -name '*.json' -o -name '*.md' \) ! -path '*/mock/*' -printf '%f\n')
  declare -A AGENT_LIST=()
  for f in "${files[@]}"; do
    local base="${f%.*}"
    local agent="${base%-*}"
    local ts="${base##*-}"
    [[ "$ts" =~ ^[0-9]{10,}$ ]] || continue
    AGENT_LIST["$agent"]+="${ts}:${f} "
  done

  for agent in "${!AGENT_LIST[@]}"; do
    local rank=0
    mapfile -t sorted < <(echo "${AGENT_LIST[$agent]}" | tr ' ' '\n' | grep -v '^$' | sort -t: -k1 -nr)
    for entry in "${sorted[@]}"; do
      rank=$((rank + 1))
      local ts="${entry%%:*}"
      local f="${entry#*:}"
      local age=$((now_ms - ts))
      if (( age > max_ms )) || (( rank > keep )); then
        local path="$runs/$f"
        local b
        b=$(bytes_of "$path")
        add_bytes "$b"
        action "prune run artifact $f (age_ms=$age rank=$rank)"
        $APPLY && rm -f "$path"
      fi
    done
  done
}

rotate_logs() {
  local logs="$ROOT/logs"
  [[ -d "$logs" ]] || return 0
  local cutoff
  cutoff=$(date -d "-${LOG_KEEP_DAYS} days" +%s 2>/dev/null || date -v-"${LOG_KEEP_DAYS}d" +%s)
  while IFS= read -r -d '' f; do
    local mtime
    mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    if (( mtime < cutoff )); then
      local b
      b=$(bytes_of "$f")
      add_bytes "$b"
      action "remove old log $(basename "$f")"
      $APPLY && rm -f "$f"
    elif [[ -f "$f" ]] && [[ $(stat -c %s "$f") -gt 10485760 ]]; then
      action "truncate large log $(basename "$f") (keep tail 2 MiB)"
      if $APPLY; then
        tail -c 2097152 "$f" >"${f}.tmp" && mv "${f}.tmp" "$f"
      fi
      add_bytes "$(($(stat -c %s "$f" 2>/dev/null || echo 0) - 2097152))"
    fi
  done < <(find "$logs" -maxdepth 1 -type f -name '*.log' -print0 2>/dev/null)
}

log "clean-swarm-data ($($APPLY && echo apply || echo dry-run)) max_workspace_age=${MAX_AGE_DAYS}d run_keep=${RUN_KEEP_DAYS}d/${RUN_KEEP_PER_AGENT}/agent"

# 1) Mock runs (CI/ephemeral)
if [[ -d "$DATA/runs/mock" ]]; then
  mapfile -t mock_files < <(find "$DATA/runs/mock" -mindepth 1 -maxdepth 1)
  if [[ ${#mock_files[@]} -gt 0 ]]; then
    archive_paths "runs/mock" "${mock_files[@]}"
  fi
fi

# 2) Test workspace clones (not production data/workspaces/)
if [[ -d "$DATA/workspaces-test" ]]; then
  archive_paths "workspaces-test" "$DATA/workspaces-test"
fi

# 3) Orphaned top-level *-plan-loop dirs (retired systemd loops)
mapfile -t plan_dirs < <(find "$DATA" -maxdepth 1 -type d -name '*-plan-loop' 2>/dev/null)
if [[ ${#plan_dirs[@]} -gt 0 ]]; then
  archive_paths "plan-loop" "${plan_dirs[@]}"
fi

flush_archive_queue

# 4) Run JSON/MD retention (newest N per agent + max age)
prune_run_artifacts

# 5) Isolated gh clones (respect LI_WORKSPACE_PRUNE_*; --force via env)
log "--- workspace:prune ---"
if $APPLY; then
  npm run workspace:prune -- --force 2>&1 | tail -8
else
  npm run workspace:prune -- --dry-run --force 2>&1 | tail -8
fi

rotate_logs

log "--- summary ---"
log "estimated reclaim: ~$((TOTAL_BYTES / 1048576)) MiB (excludes workspace:prune report above)"
$APPLY && log "archive: $ARCHIVE_TAR" || log "archive (on apply): $ARCHIVE_TAR"
