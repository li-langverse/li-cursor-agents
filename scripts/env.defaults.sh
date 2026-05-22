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
export LI_LANGVERSE_ROOT="${LI_LANGVERSE_ROOT:-$(_abs_dir "$ROOT/..")}"

# Ecosystem pull + skill sync (see scripts/sync-ecosystem.sh)
export LI_ECOSYSTEM_AUTO_SYNC="${LI_ECOSYSTEM_AUTO_SYNC:-1}"
export LI_ECOSYSTEM_SYNC_INTERVAL_SEC="${LI_ECOSYSTEM_SYNC_INTERVAL_SEC:-3600}"
export LI_ECOSYSTEM_SYNC_ON_START="${LI_ECOSYSTEM_SYNC_ON_START:-1}"
export LI_ECOSYSTEM_REF="${LI_ECOSYSTEM_REF:-main}"
export LI_ECOSYSTEM_CLONE_MISSING="${LI_ECOSYSTEM_CLONE_MISSING:-1}"

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

# Supervisor defaults (sensible for one machine)
export LI_SUPERVISOR_INTERVAL_MS="${LI_SUPERVISOR_INTERVAL_MS:-120000}"
export LI_AGENTS_COOLDOWN_MS="${LI_AGENTS_COOLDOWN_MS:-300000}"
export LI_SUPERVISOR_MAX_TASKS="${LI_SUPERVISOR_MAX_TASKS:-2}"
# Run-all (parallel): 0 = spawn all leaf agents at once; set 4–12 if SDK rate-limits
export LI_SWARM_MAX_PARALLEL="${LI_SWARM_MAX_PARALLEL:-0}"
export LI_AGENT_DASHBOARD_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
export LI_WATCH_INTERVAL_SEC="${LI_WATCH_INTERVAL_SEC:-30}"
export LI_AUTO_START_SUPERVISOR="${LI_AUTO_START_SUPERVISOR:-1}"

# Prefer host lic CI (brew llvm) over 2GB docker image
export LI_LOCAL_CI_LIC_MODE="${LI_LOCAL_CI_LIC_MODE:-host}"

# Control-plane store: supabase (default, Docker) or disk (JSON under data/)
export LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-supabase}"
# Legacy alias for disk: LI_STACK_SKIP_SUPABASE=1
export LI_STACK_SKIP_SUPABASE="${LI_STACK_SKIP_SUPABASE:-0}"

# Cursor SDK: `default` = Auto (dynamic model). Override in .env to pin a model id.
export CURSOR_MODEL="${CURSOR_MODEL:-default}"
