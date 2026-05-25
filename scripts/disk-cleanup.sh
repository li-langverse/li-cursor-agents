#!/usr/bin/env bash
# Reclaim disk from Cursor global DB, Docker caches, and stale agent workspace clones.
# Safe to run daily via launchd (see install-disk-cleanup-launchd.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${LI_DISK_CLEANUP_LOG_DIR:-${HOME}/Library/Logs/li-disk-cleanup}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

exec >>"$LOG_FILE" 2>&1
echo "=== disk-cleanup $(date -Iseconds) ==="

cursor_global="${HOME}/Library/Application Support/Cursor/User/globalStorage"
state_db="${cursor_global}/state.vscdb"

cleanup_cursor() {
  if [[ ! -f "$state_db" ]]; then
    echo "cursor: no state.vscdb — skip"
    return 0
  fi

  local before_kb
  before_kb="$(du -sk "$state_db" 2>/dev/null | awk '{print $1}')"

  rm -f "${state_db}.backup"
  echo "cursor: removed state.vscdb.backup (if present)"

  if pgrep -qx Cursor 2>/dev/null || pgrep -f "/Applications/Cursor.app" >/dev/null 2>&1; then
    echo "cursor: Cursor is running — skipped VACUUM (re-run when quit or wait for nightly job)"
    return 0
  fi

  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "cursor: sqlite3 missing — skipped VACUUM"
    return 0
  fi

  echo "cursor: pruning agent session blobs (agentKv:blob:*)…"
  sqlite3 "$state_db" "DELETE FROM cursorDiskKV WHERE key LIKE 'agentKv:blob:%';"

  if [[ "${LI_DISK_CLEANUP_PRUNE_CHAT:-}" == "1" ]]; then
    echo "cursor: pruning chat/composer rows (LI_DISK_CLEANUP_PRUNE_CHAT=1)…"
    sqlite3 "$state_db" "DELETE FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' OR key LIKE 'composer.%' OR key LIKE 'composerData%';"
  fi

  echo "cursor: wal_checkpoint + VACUUM (may take several minutes on large DBs)…"
  sqlite3 "$state_db" "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"

  local after_kb
  after_kb="$(du -sk "$state_db" 2>/dev/null | awk '{print $1}')"
  echo "cursor: state.vscdb ${before_kb}KB -> ${after_kb}KB"
}

cleanup_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker: not installed — skip"
    return 0
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "docker: daemon not running — skip"
    return 0
  fi

  if [[ "${LI_DISK_CLEANUP_DOCKER_FULL:-}" == "1" ]]; then
    echo "docker: full prune (LI_DISK_CLEANUP_DOCKER_FULL=1)…"
    docker system prune -af --volumes
  else
    echo "docker: prune dangling/unused (set LI_DISK_CLEANUP_DOCKER_FULL=1 for aggressive)…"
    docker system prune -f --volumes
  fi
}

cleanup_workspaces() {
  local workspaces="${LI_WORKSPACE_ROOT:-$ROOT/data/workspaces}"
  local retention_days="${LI_WORKSPACE_RETENTION_DAYS:-1}"

  if [[ ! -d "$workspaces" ]]; then
    echo "workspaces: none at $workspaces — skip"
    return 0
  fi

  # Layout: workspaces/<org>/<repo>/<runId>/repo
  local removed=0
  while IFS= read -r -d '' run_dir; do
    rm -rf "$run_dir"
    removed=$((removed + 1))
  done < <(find "$workspaces" -mindepth 3 -maxdepth 3 -type d -mtime +"${retention_days}" -print0 2>/dev/null || true)

  echo "workspaces: removed ${removed} run dir(s) older than ${retention_days}d under ${workspaces}"
}

cleanup_cursor
cleanup_docker
cleanup_workspaces

echo "=== done $(date -Iseconds) ==="
