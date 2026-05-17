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
export BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-$(_abs_dir "$ROOT/../benchmarks")}"
export LI_LOCAL_CI_ROOT="${LI_LOCAL_CI_ROOT:-$(_abs_dir "$ROOT/../li-local-ci")}"
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
export LI_AGENT_DASHBOARD_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
export LI_AUTO_START_SUPERVISOR="${LI_AUTO_START_SUPERVISOR:-1}"

# Prefer host lic CI (brew llvm) over 2GB docker image
export LI_LOCAL_CI_LIC_MODE="${LI_LOCAL_CI_LIC_MODE:-host}"

# Stack: skip Supabase by default on low disk (set LI_STACK_USE_SUPABASE=1 to enable)
if [[ -z "${LI_STACK_SKIP_SUPABASE+x}" ]]; then
  avail_gb="$(df -g / 2>/dev/null | awk 'NR==2 {print $4}')"
  if [[ -n "$avail_gb" && "$avail_gb" -lt 8 ]]; then
    export LI_STACK_SKIP_SUPABASE=1
  fi
fi
