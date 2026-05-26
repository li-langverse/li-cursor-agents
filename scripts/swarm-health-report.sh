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
MOCK_RUNTIME_TIMEOUT="${LI_MOCK_RUNTIME_TIMEOUT:-0}"
TS_UTC="$(date -u +%Y-%m-%dT%H-%M)"
REPORT_FILE="$REPORT_DIR/${TS_UTC}.md"
LATEST_LINK="$REPORT_DIR/latest.md"
RENDER_PY="$ROOT/scripts/lib/swarm-health-report-render.py"
CONTROL_PLANE="${LI_CONTROL_PLANE_DIR:-$ROOT/data/control-plane}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi
export GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
GH_TOKEN_PRESENT="no"
if [[ -n "${GH_TOKEN:-}" || -n "${GITHUB_TOKEN:-}" ]]; then
  GH_TOKEN_PRESENT="yes"
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
        if [[ "$MOCK_RUNTIME_TIMEOUT" == "1" ]]; then
          return 1
        fi
        if [[ "$MOCK_UNHEALTHY" == "1" ]]; then
          printf '%s' '{"async_swarm_running":false,"store":"supabase","db_enabled":true,"control_plane_store":"supabase","active_run_count":0,"sdk_slots_in_use":0,"sdk_max_concurrent":5,"active_runs_registered":0}' >"$out"
        else
          printf '%s' '{"async_swarm_running":true,"store":"supabase","db_enabled":true,"control_plane_store":"supabase","active_run_count":2,"sdk_slots_in_use":2,"sdk_max_concurrent":5,"active_runs_registered":2,"supervisor_loop_running":false}' >"$out"
        fi
        return 0
        ;;
      /api/research/runs*)
        printf '%s' '{"runs":[{"run_id":"dry-run-1","agent_id":"goal_researcher","vertical":"hpc","vertical_label":"HPC","goal_id":"g1","goal_title":"Dry goal","status":"finished","started_at":"2026-05-26T10:00:00.000Z","finished_at":"2026-05-26T10:05:00.000Z","summary":"Dry-run research summary."},{"run_id":"dry-run-2","agent_id":"numerics_researcher","vertical":null,"goal_id":null,"goal_title":null,"status":"error","error_category":"stale_running_reconciled","started_at":"2026-05-26T09:00:00.000Z","finished_at":"2026-05-26T09:01:00.000Z","summary":"Error: stale_running_reconciled"}]}' >"$out"
        return 0
        ;;
      /api/errors/summary*)
        printf '%s' '{"preset":"1d","label":"last 24 hours","total_errors":4,"stale_reconcile_count":3,"real_error_count":1,"unique_categories":2,"categories":[{"category":"stale_running_reconciled","error_key":"stale_running_reconciled","count":3,"by_agent":[],"sample_run_id":"a-1","latest_at":"2026-05-26T09:00:00.000Z"},{"category":"sdk_slot_timeout","error_key":"sdk_slot_timeout","count":1,"by_agent":[],"sample_run_id":"c-1","latest_at":"2026-05-26T08:00:00.000Z"}],"reporting_only":true}' >"$out"
        return 0
        ;;
      /api/runs*)
        printf '%s' '{"runs":[{"run_id":"dry-meta-1","agent_id":"swarm_observer","status":"finished","started_at":"2026-05-26T08:00:00.000Z","finished_at":"2026-05-26T08:10:00.000Z"},{"run_id":"dry-research-1","agent_id":"goal_researcher","status":"finished","started_at":"2026-05-26T10:00:00.000Z","finished_at":"2026-05-26T10:05:00.000Z"}],"active":[]}' >"$out"
        return 0
        ;;
      /api/handoffs*)
        printf '%s' '{"handoffs":[{"handoff_id":"dry-h1","status":"pending"}],"count":1,"store":"disk"}' >"$out"
        return 0
        ;;
      /api/interventions)
        printf '%s' '{"interventions":[],"briefing_generated_at":"2026-05-26T08:00:00.000Z"}' >"$out"
        return 0
        ;;
    esac
  fi
  if [[ "$MOCK_UNHEALTHY" == "1" && "$path" == "/api/runtime" ]]; then
    return 1
  fi
  curl -sf --max-time 15 "${BASE_URL}${path}" -o "$out"
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

find_previous_report() {
  local prev=""
  prev="$(find "$REPORT_DIR" -maxdepth 1 -type f -name '20*.md' 2>/dev/null | sort | tail -n 1)"
  if [[ -n "$prev" && "$(basename "$prev")" == "$(basename "$REPORT_FILE")" ]]; then
    prev="$(find "$REPORT_DIR" -maxdepth 1 -type f -name '20*.md' 2>/dev/null | sort | tail -n 2 | head -n 1)"
  fi
  echo "$prev"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PREV_REPORT="$(find_previous_report)"

DASH_STATUS="$(systemctl_user_active li-agents-dashboard.service)"
ASYNC_STATUS="$(systemctl_user_active li-agents-async-swarm.service)"

RUNTIME_FILE="$TMP/runtime.json"
RESEARCH_FILE="$TMP/research.json"
ERRORS_FILE="$TMP/errors.json"
RUNS_FILE="$TMP/runs.json"
HANDOFFS_FILE="$TMP/handoffs.json"
INTERVENTIONS_FILE="$TMP/interventions.json"
CONTEXT_FILE="$TMP/context.json"

RUNTIME_OK=0
if curl_api "/api/runtime" "$RUNTIME_FILE"; then
  RUNTIME_OK=1
fi

RESEARCH_OK=0
if curl_api "/api/research/runs?limit=10" "$RESEARCH_FILE"; then
  RESEARCH_OK=1
fi

ERRORS_OK=0
if curl_api "/api/errors/summary?range=1d" "$ERRORS_FILE"; then
  ERRORS_OK=1
fi

RUNS_OK=0
if curl_api "/api/runs" "$RUNS_FILE"; then
  RUNS_OK=1
fi

HANDOFFS_OK=0
if curl_api "/api/handoffs?limit=30" "$HANDOFFS_FILE"; then
  HANDOFFS_OK=1
fi

INTERVENTIONS_OK=0
if curl_api "/api/interventions" "$INTERVENTIONS_FILE"; then
  INTERVENTIONS_OK=1
fi

LONG_PGREP="$(researchers_long_pgrep)"

EXIT_CODE=0
if [[ "$DASH_STATUS" != "active" ]]; then
  EXIT_CODE=1
fi
if [[ "$RUNTIME_OK" != "1" ]]; then
  EXIT_CODE=1
else
  ASYNC_RUNNING="$(python3 - "$RUNTIME_FILE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    d = json.load(f)
v = d.get("async_swarm_running")
print("true" if v is True or v == "true" else "false")
PY
)"
  if [[ "$ASYNC_RUNNING" != "true" ]]; then
    EXIT_CODE=1
  fi
fi

PREV_JSON="null"
if [[ -n "$PREV_REPORT" ]]; then
  PREV_JSON="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$PREV_REPORT")"
fi

python3 - "$CONTEXT_FILE" <<PY
import json, os, sys
ctx = {
    "root": ${ROOT@Q},
    "base_url": ${BASE_URL@Q},
    "generated_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "hostname": "$(hostname 2>/dev/null || echo unknown)",
    "exit_code": $EXIT_CODE,
    "dash_status": ${DASH_STATUS@Q},
    "async_status": ${ASYNC_STATUS@Q},
    "dry_run": $([[ "$DRY_RUN" == "1" ]] && echo True || echo False),
    "long_pgrep": int(${LONG_PGREP:-0}),
    "prev_report_file": json.loads(${PREV_JSON@Q}),
    "runtime_file": ${RUNTIME_FILE@Q} if $RUNTIME_OK else None,
    "research_file": ${RESEARCH_FILE@Q} if $RESEARCH_OK else None,
    "errors_file": ${ERRORS_FILE@Q} if $ERRORS_OK else None,
    "runs_file": ${RUNS_FILE@Q} if $RUNS_OK else None,
    "handoffs_file": ${HANDOFFS_FILE@Q} if $HANDOFFS_OK else None,
    "interventions_file": ${INTERVENTIONS_FILE@Q} if $INTERVENTIONS_OK else None,
    "interventions_path": os.path.join(${CONTROL_PLANE@Q}, "interventions.json"),
    "env_file": ${ENV_FILE@Q},
    "gh_token_present": ${GH_TOKEN_PRESENT@Q},
}
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(ctx, f)
PY

python3 "$RENDER_PY" "$CONTEXT_FILE" >"$REPORT_FILE"

ln -sfn "$(basename "$REPORT_FILE")" "$LATEST_LINK"

echo "wrote $REPORT_FILE"
exit "$EXIT_CODE"
