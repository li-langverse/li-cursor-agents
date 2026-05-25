# Sourced by keep-agents-running, start-stack, start-control-plane.
# Override in li-cursor-agents/.env (see .env.example).
ROOT="${LI_CURSOR_AGENTS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

_abs_dir() {
  local p="$1"
  if [[ -d "$p" ]]; then
    (cd "$p" && pwd)
  else
    echo "$p"
  fi
}

_abs_file() {
  local p="$1"
  if [[ -f "$p" ]]; then
    echo "$(cd "$(dirname "$p")" && pwd)/$(basename "$p")"
  else
    echo "$p"
  fi
}

export LI_CURSOR_AGENTS_ROOT="$ROOT"

# After sourcing .env, call this so relative sibling paths still resolve correctly.
li_resolve_env_paths() {
  local root="${1:-$ROOT}"
  if [[ -n "${BENCHMARKS_ROOT:-}" && "${BENCHMARKS_ROOT}" != /* ]]; then
    export BENCHMARKS_ROOT="$(_abs_dir "$root/$BENCHMARKS_ROOT")"
  else
    export BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-$(_abs_dir "$root/../benchmarks")}"
  fi
  if [[ -n "${LI_LOCAL_CI_ROOT:-}" && "${LI_LOCAL_CI_ROOT}" != /* ]]; then
    export LI_LOCAL_CI_ROOT="$(_abs_dir "$root/$LI_LOCAL_CI_ROOT")"
  else
    export LI_LOCAL_CI_ROOT="${LI_LOCAL_CI_ROOT:-$(_abs_dir "$root/../li-local-ci")}"
  fi
  if [[ -n "${LI_GITHUB_ENV:-}" && "${LI_GITHUB_ENV}" != /* ]]; then
    export LI_GITHUB_ENV="$(_abs_file "$root/$LI_GITHUB_ENV")"
  fi
}

li_resolve_env_paths "$ROOT"
export LI_GITHUB_ENV="${LI_GITHUB_ENV:-$(_abs_file "$ROOT/../.env.github")}"

# Local CI instead of GitHub Actions (merge queue / pr_merger)
export LI_USE_LOCAL_CI="${LI_USE_LOCAL_CI:-1}"
export LI_LOCAL_CI_SWEEP_LIMIT="${LI_LOCAL_CI_SWEEP_LIMIT:-2}"
export LI_LOCAL_CI_MAX_AGE_HOURS="${LI_LOCAL_CI_MAX_AGE_HOURS:-48}"
export LI_LOCAL_CI_PRUNE="${LI_LOCAL_CI_PRUNE:-always}"
export LI_LOCAL_CI_SKIP_GH="${LI_LOCAL_CI_SKIP_GH:-1}"

# Disk-conscious: no LLVM docker image unless explicit
export LI_LOCAL_CI_BUILD_LIC="${LI_LOCAL_CI_BUILD_LIC:-0}"

# Isolated gh clones under data/workspaces/ (see npm run workspace:prune)
export LI_WORKSPACE_PRUNE="${LI_WORKSPACE_PRUNE:-always}"
export LI_WORKSPACE_PRUNE_MAX_AGE_DAYS="${LI_WORKSPACE_PRUNE_MAX_AGE_DAYS:-7}"
export LI_WORKSPACE_PRUNE_KEEP_PER_REPO="${LI_WORKSPACE_PRUNE_KEEP_PER_REPO:-5}"
export LI_WORKSPACE_PRUNE_MAX_RUNS_PER_REPO="${LI_WORKSPACE_PRUNE_MAX_RUNS_PER_REPO:-20}"
export LI_WORKSPACE_PRUNE_INTERVAL_MS="${LI_WORKSPACE_PRUNE_INTERVAL_MS:-3600000}"

# Supervisor defaults (sensible for one machine)
export LI_SUPERVISOR_INTERVAL_MS="${LI_SUPERVISOR_INTERVAL_MS:-120000}"
export LI_AGENTS_COOLDOWN_MS="${LI_AGENTS_COOLDOWN_MS:-300000}"
export LI_SUPERVISOR_MAX_TASKS="${LI_SUPERVISOR_MAX_TASKS:-2}"

# Cursor SDK: parallel sessions (async swarm) + gap when max=1 + retries on instant error
export LI_SDK_MAX_CONCURRENT="${LI_SDK_MAX_CONCURRENT:-4}"
export LI_SDK_SESSION_GAP_MS="${LI_SDK_SESSION_GAP_MS:-8000}"
export LI_SDK_MAX_ATTEMPTS="${LI_SDK_MAX_ATTEMPTS:-3}"
export LI_SDK_RETRY_BACKOFF_MS="${LI_SDK_RETRY_BACKOFF_MS:-4000}"
export LI_BRIEFING_PROMPT_MAX_CHARS="${LI_BRIEFING_PROMPT_MAX_CHARS:-16000}"
export LI_HEAP_MAX_NUMERICS_PER_TICK="${LI_HEAP_MAX_NUMERICS_PER_TICK:-1}"

# Local Cursor SDK: `default` (Auto) is reliable; `composer-2` often instant-errors on Agent.create
export CURSOR_MODEL="${CURSOR_MODEL:-default}"
export CURSOR_SDK_FALLBACK_MODEL="${CURSOR_SDK_FALLBACK_MODEL:-default}"
export LI_AGENT_DASHBOARD_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
export LI_AUTO_START_SUPERVISOR="${LI_AUTO_START_SUPERVISOR:-0}"
export LI_AUTO_START_ASYNC_SWARM="${LI_AUTO_START_ASYNC_SWARM:-1}"
export LI_ASYNC_AGENT_INTERVAL_MS="${LI_ASYNC_AGENT_INTERVAL_MS:-120000}"

# Prefer host lic CI (brew llvm) over 2GB docker image
export LI_LOCAL_CI_LIC_MODE="${LI_LOCAL_CI_LIC_MODE:-host}"

# Control-plane store: supabase (default, Docker) or disk (JSON under data/)
export LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-supabase}"
# Legacy alias for disk: LI_STACK_SKIP_SUPABASE=1
export LI_STACK_SKIP_SUPABASE="${LI_STACK_SKIP_SUPABASE:-0}"
