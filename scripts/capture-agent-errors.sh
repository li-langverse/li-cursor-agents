#!/usr/bin/env bash
# Snapshot li-cursor-agents + Supabase health for post-mortem analysis.
# Usage: bash scripts/capture-agent-errors.sh [OUT_DIR]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/data/capture/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

{
  echo "## meta"
  echo "captured_at_utc: $(ts)"
  echo "hostname: $(hostname)"
  echo "uname: $(uname -a)"
  echo
  echo "## docker"
  docker version 2>&1 | head -8 || true
  docker info 2>&1 | grep -E 'Storage Driver|Server Version|Firewall|Operating System' || true
  echo
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>&1 || true
  echo
  echo "## supabase"
  (cd "$ROOT" && supabase status -o json 2>/dev/null | head -c 4000) || true
  echo
  echo "## dashboard /api/status"
  curl -sf --max-time 5 "http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT:-9477}/api/status" 2>&1 | head -c 8000 || echo "(unreachable)"
  echo
  echo "## dashboard /api/runtime"
  curl -sf --max-time 5 "http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT:-9477}/api/runtime" 2>&1 || echo "(unreachable)"
  echo
} >"$OUT/snapshot.md"

# Log excerpts (repo ignores *.log but capture dir is explicit)
for f in "$ROOT/logs/keep-agents.log" "$ROOT/logs/watch-control-plane.log"; do
  if [[ -f "$f" ]]; then
    base=$(basename "$f")
    # Avoid matching "fail" inside benign tokens (e.g. fail_threshold); require failed/failure/etc.
    grep -iE 'error|warn|failed|failing|failure|exception|429|401|403|denied|nxdomain|crash' "$f" 2>/dev/null | tail -200 >"$OUT/${base}.errors.txt" || true
    tail -400 "$f" >"$OUT/${base}.tail.txt" || true
  fi
done

# Node / agent processes
ps aux 2>/dev/null | grep -E 'serve-dashboard|supervisor|run-agent' | grep -v grep >"$OUT/processes.txt" || true

echo "Wrote $OUT"
ls -la "$OUT"
