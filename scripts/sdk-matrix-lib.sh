#!/usr/bin/env bash
# Shared helpers for SDK matrix verify scripts (sequential vs parallel).
sdk_matrix_root() {
  cd "$(dirname "${BASH_SOURCE[1]}")/.." && pwd
}

sdk_matrix_load_env() {
  local root="$1"
  if [[ -f "$root/.env" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$root/.env"
    set +a
  fi
}

sdk_matrix_require_api_key() {
  if [[ -z "${CURSOR_API_KEY:-}" && -z "${CURSOR_SDK_KEY:-}" && -z "${CURSOR_SDK:-}" ]]; then
    echo "ERROR: CURSOR_API_KEY required in .env" >&2
    exit 1
  fi
}

sdk_matrix_stop_control_plane() {
  local port="${LI_AGENT_DASHBOARD_PORT:-9477}"
  echo "==> stop control plane on :${port} (free SDK slots)"
  if curl -sf -m 3 -X POST "http://127.0.0.1:${port}/api/async-swarm/stop" \
    -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1; then
    echo "    POST /api/async-swarm/stop"
  fi
  sleep 1
  if lsof -ti ":${port}" >/dev/null 2>&1; then
    echo "    killing listener on :${port}"
    lsof -ti ":${port}" | xargs kill 2>/dev/null || true
    sleep 1
  fi
  pkill -f "dist/cli/async-swarm.js" 2>/dev/null || true
  pkill -f "dist/cli/serve-dashboard.js" 2>/dev/null || true
  pkill -f "dist/cli/supervisor.js" 2>/dev/null || true
  sleep 1
}

sdk_matrix_reclaim_locks() {
  local root="$1"
  echo "==> reclaim stale SDK slot locks"
  (
    cd "$root"
    node -e "
      import { reclaimAllStaleSdkSlots } from './dist/backends/sdk-session-lock.js';
      const n = reclaimAllStaleSdkSlots();
      console.log('    reclaimed', n, 'lock file(s)');
    "
  )
}

sdk_matrix_base_env() {
  export LI_E2E_SDK=1
  export LI_E2E_SDK_ALL_LEAVES=1
  export LI_LIVE_TRACE_FLUSH_MS=0
  export LI_WORKSPACE_SWEEP_FORCE_LLM=1
  export LI_SWARM_MERGE_RECOMMENDATIONS=0
  unset CURSOR_MOCK

  if [[ "${LI_E2E_USE_SUPABASE:-}" != "1" ]]; then
    export LI_CONTROL_PLANE_STORE=disk
    export LI_STACK_SKIP_SUPABASE=1
    export LI_LIVE_STREAM_DB=0
    unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY || true
  fi
}

sdk_matrix_append_timing() {
  local file="$1"
  local mode="$2"
  local agent="$3"
  local seconds="$4"
  local status="${5:-ok}"
  mkdir -p "$(dirname "$file")"
  printf '%s\n' \
    "{\"mode\":\"${mode}\",\"agent\":\"${agent}\",\"seconds\":${seconds},\"status\":\"${status}\",\"at\":\"$(date -Iseconds)\"}" \
    >>"$file"
}

sdk_matrix_list_agents() {
  local root="$1"
  (
    cd "$root"
    VERIFY_AGENT="${VERIFY_AGENT:-}" node -e "
      import { ALL_LEAF_AGENTS } from './dist/e2e/all-leaves-shared.js';
      const one = process.env.VERIFY_AGENT?.trim();
      if (one) {
        if (!ALL_LEAF_AGENTS.some((a) => a.id === one)) {
          console.error('unknown VERIFY_AGENT:', one);
          process.exit(1);
        }
        console.log(one);
      } else {
        for (const a of ALL_LEAF_AGENTS) console.log(a.id);
      }
    "
  )
}
