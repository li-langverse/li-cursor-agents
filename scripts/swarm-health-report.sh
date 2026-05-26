#!/usr/bin/env bash
# Periodic swarm health snapshot → logs/swarm-health-reports/*.md
# Exit 1 when dashboard unit is not active or async_swarm_running is false.
#
#   LI_DRY_RUN=1          — mock API/systemd; always writes report (healthy mocks)
#   LI_MOCK_UNHEALTHY=1   — with dry-run: simulate dashboard down / swarm off (exit 1)
#   LI_REPORT_DIR=...     — override report directory (tests)
#   LI_AGENT_DASHBOARD_PORT=9477
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
BASE_URL="http://127.0.0.1:${PORT}"
REPORT_DIR="${LI_REPORT_DIR:-$ROOT/logs/swarm-health-reports}"
DRY_RUN="${LI_DRY_RUN:-0}"
MOCK_UNHEALTHY="${LI_MOCK_UNHEALTHY:-0}"
TS_UTC="$(date -u +%Y-%m-%dT%H-%M)"
REPORT_FILE="$REPORT_DIR/${TS_UTC}.md"
LATEST_LINK="$REPORT_DIR/latest.md"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

mkdir -p "$REPORT_DIR"

systemctl_user_active() {
  local unit="$1"
  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$MOCK_UNHEALTHY" == "1" && "$unit" == "li-agents-dashboard.service" ]]; then
      echo "inactive"
      return
    fi
    echo "active"
    return
  fi
  systemctl --user is-active "$unit" 2>/dev/null || echo "unknown"
}

curl_api() {
  local path="$1"
  local out="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    case "$path" in
      /api/runtime)
        if [[ "$MOCK_UNHEALTHY" == "1" ]]; then
          printf '%s' '{"async_swarm_running":false,"store":"supabase","db_enabled":true,"control_plane_store":"supabase","active_run_count":0,"sdk_slots_in_use":0,"sdk_max_concurrent":5,"active_runs_registered":0}' >"$out"
        else
          printf '%s' '{"async_swarm_running":true,"store":"supabase","db_enabled":true,"control_plane_store":"supabase","active_run_count":2,"sdk_slots_in_use":2,"sdk_max_concurrent":5,"active_runs_registered":2,"supervisor_loop_running":false}' >"$out"
        fi
        return 0
        ;;
      /api/research/runs*)
        printf '%s' '{"runs":[{"run_id":"dry-run-1","agent_id":"researcher-hpc","vertical":"hpc","vertical_label":"HPC","goal_id":"g1","goal_title":"Dry goal","status":"completed","started_at":"2026-05-26T10:00:00.000Z","finished_at":"2026-05-26T10:05:00.000Z","summary":"Dry-run research summary."}]}' >"$out"
        return 0
        ;;
      /api/errors/summary*)
        printf '%s' '{"preset":"1d","label":"last 24 hours","total_errors":0,"categories":[],"reporting_only":true}' >"$out"
        return 0
        ;;
    esac
  fi
  if [[ "$MOCK_UNHEALTHY" == "1" && "$path" == "/api/runtime" ]]; then
    return 1
  fi
  curl -sf --max-time 15 "${BASE_URL}${path}" -o "$out"
}

json_get() {
  local file="$1"
  shift
  python3 - "$file" "$@" <<'PY'
import json, sys
path = sys.argv[1]
keys = sys.argv[2:]
try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    print("")
    sys.exit(0)
cur = data
for k in keys:
    if isinstance(cur, dict):
        cur = cur.get(k)
    else:
        cur = None
        break
if cur is None:
    print("")
elif isinstance(cur, bool):
    print("true" if cur else "false")
else:
    print(cur)
PY
}

researchers_long_pgrep() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "0"
    return
  fi
  local n=""
  n="$(pgrep -fc "run-researchers-long" 2>/dev/null)" || true
  echo "${n:-0}"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

DASH_STATUS="$(systemctl_user_active li-agents-dashboard.service)"
ASYNC_STATUS="$(systemctl_user_active li-agents-async-swarm.service)"

RUNTIME_OK=0
RUNTIME_FILE="$TMP/runtime.json"
if curl_api "/api/runtime" "$RUNTIME_FILE"; then
  RUNTIME_OK=1
fi

RESEARCH_FILE="$TMP/research.json"
RESEARCH_OK=0
if curl_api "/api/research/runs?limit=10" "$RESEARCH_FILE"; then
  RESEARCH_OK=1
fi

ERRORS_FILE="$TMP/errors.json"
ERRORS_OK=0
if curl_api "/api/errors/summary?range=1d" "$ERRORS_FILE"; then
  ERRORS_OK=1
fi

LONG_PGREP="$(researchers_long_pgrep)"

EXIT_CODE=0
if [[ "$DASH_STATUS" != "active" ]]; then
  EXIT_CODE=1
fi
if [[ "$RUNTIME_OK" != "1" ]]; then
  EXIT_CODE=1
else
  ASYNC_RUNNING="$(json_get "$RUNTIME_FILE" async_swarm_running)"
  if [[ "$ASYNC_RUNNING" != "true" ]]; then
    EXIT_CODE=1
  fi
fi

{
  echo "# Swarm health report"
  echo ""
  echo "- **Generated (UTC):** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- **Host:** $(hostname 2>/dev/null || echo unknown)"
  echo "- **Repo:** \`$ROOT\`"
  echo "- **Dashboard:** ${BASE_URL}"
  echo "- **Overall:** $([[ "$EXIT_CODE" -eq 0 ]] && echo "OK" || echo "**UNHEALTHY**")"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "- **Mode:** dry-run (mocked probes)"
  fi
  echo ""
  echo "## systemd (user)"
  echo ""
  echo "| Unit | State |"
  echo "|------|-------|"
  echo "| \`li-agents-dashboard.service\` | ${DASH_STATUS} |"
  echo "| \`li-agents-async-swarm.service\` | ${ASYNC_STATUS} |"
  echo ""
  echo "## Runtime API"
  echo ""
  if [[ "$RUNTIME_OK" != "1" ]]; then
    echo "Dashboard **unreachable** (\`GET /api/runtime\`)."
  else
    STORE="$(json_get "$RUNTIME_FILE" store)"
    DB="$(json_get "$RUNTIME_FILE" db_enabled)"
    ASYNC="$(json_get "$RUNTIME_FILE" async_swarm_running)"
    IN_SDK="$(json_get "$RUNTIME_FILE" active_run_count)"
    SLOTS="$(json_get "$RUNTIME_FILE" sdk_slots_in_use)"
    SDK_MAX="$(json_get "$RUNTIME_FILE" sdk_max_concurrent)"
    REGISTERED="$(json_get "$RUNTIME_FILE" active_runs_registered)"
    echo "| Field | Value |"
    echo "|-------|-------|"
    echo "| store | ${STORE:-—} |"
    echo "| db_enabled | ${DB:-—} |"
    echo "| async_swarm_running | ${ASYNC:-—} |"
    echo "| active_run_count (in SDK) | ${IN_SDK:-—} |"
    echo "| sdk_slots_in_use | ${SLOTS:-—} |"
    echo "| sdk_max_concurrent | ${SDK_MAX:-—} |"
    echo "| active_runs_registered | ${REGISTERED:-—} |"
  fi
  echo ""
  echo "## Research runs (last 10)"
  echo ""
  if [[ "$RESEARCH_OK" != "1" ]]; then
    echo "_Could not fetch \`GET /api/research/runs?limit=10\`._"
  else
    python3 - "$RESEARCH_FILE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
runs = data.get("runs") or []
if not runs:
    print("_No recent research runs._")
    sys.exit(0)
print("| status | vertical | goal | agent | summary |")
print("|--------|----------|------|-------|---------|")
for r in runs[:10]:
    def esc(s):
        return (s or "—").replace("|", "\\|").replace("\n", " ")[:120]
    print(
        f"| {esc(r.get('status'))} | {esc(r.get('vertical') or r.get('vertical_label'))} "
        f"| {esc(r.get('goal_title') or r.get('goal_id'))} | {esc(r.get('agent_id'))} "
        f"| {esc(r.get('summary'))} |"
    )
PY
  fi
  echo ""
  echo "## Errors (1d, deduped)"
  echo ""
  if [[ "$ERRORS_OK" != "1" ]]; then
    echo "_Could not fetch \`GET /api/errors/summary?range=1d\`._"
  else
    python3 - "$ERRORS_FILE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
label = data.get("label") or data.get("preset") or "1d"
total = data.get("total_errors")
if total is None:
    cats = data.get("categories") or []
    total = sum(int(c.get("count") or 0) for c in cats)
print(f"Window: **{label}** — **{total}** error(s) in grouped summary.")
cats = (data.get("categories") or [])[:8]
if not cats:
    print("\n_No categories in window._")
else:
    print("\n| category | count | sample agents |")
    print("|----------|-------|---------------|")
    for c in cats:
        agents = ", ".join((c.get("agents") or [])[:3])
        print(f"| {c.get('category','?')} | {c.get('count',0)} | {agents or '—'} |")
PY
  fi
  echo ""
  echo "## Optional: legacy researchers loop"
  echo ""
  echo "- \`run-researchers-long\` processes: **${LONG_PGREP}** (prefer \`li-agents-async-swarm\` + research lane)"
  echo ""
  echo "---"
  echo ""
  echo "Regenerate: \`$ROOT/scripts/swarm-health-report.sh\`"
} >"$REPORT_FILE"

ln -sfn "$(basename "$REPORT_FILE")" "$LATEST_LINK"

echo "wrote $REPORT_FILE"
exit "$EXIT_CODE"
