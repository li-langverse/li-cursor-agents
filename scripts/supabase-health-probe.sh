#!/usr/bin/env bash
# Probe primary then standby PostgREST; print env lines to stdout (for eval/source).
# Never log secret values — only LI_SUPABASE_ACTIVE_ENDPOINT on stderr when not quiet.
#
#   LI_SUPABASE_FAILOVER_DRY_RUN=1  — skip curl; use env files only (tests)
#   LI_SUPABASE_PROBE_QUIET=1       — no stderr
# Exit 0 when an endpoint is healthy; 1 when both fail.
set -euo pipefail

_pkg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_env_root="${LI_SUPABASE_PROBE_ROOT:-$_pkg}"
# shellcheck source=lib/li-stack-env.sh
source "$_pkg/scripts/lib/li-stack-env.sh"
# shellcheck source=lib/supabase-failover-ports.sh
source "$_pkg/scripts/lib/supabase-failover-ports.sh"

_log() {
  if [[ "${LI_SUPABASE_PROBE_QUIET:-}" != "1" && "${LI_SUPABASE_ENSURE_QUIET:-}" != "1" ]]; then
    echo "$@" >&2
  fi
}

_probe_rest() {
  local url="$1"
  local key="$2"
  [[ -n "$url" && -n "$key" ]] || return 1
  if [[ "${LI_SUPABASE_FAILOVER_DRY_RUN:-}" == "1" ]]; then
    return 0
  fi
  local code
  code="$(
    curl -sf -o /dev/null -w "%{http_code}" \
      -H "apikey: ${key}" -H "Authorization: Bearer ${key}" \
      "${url%/}/rest/v1/" 2>/dev/null || echo "000"
  )"
  [[ "$code" == "200" ]]
}

_emit_env_file() {
  local file="$1"
  local endpoint="$2"
  [[ -f "$file" ]] || return 1
  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a
  local key="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-}}"
  [[ -n "${SUPABASE_URL:-}" && -n "$key" ]] || return 1
  if ! _probe_rest "${SUPABASE_URL}" "$key"; then
    return 1
  fi
  grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL)=' "$file" || true
  echo "LI_SUPABASE_ACTIVE_ENDPOINT=${endpoint}"
  return 0
}

_try_primary() {
  local f="$_env_root/.env.supabase"
  if [[ -f "$f" ]]; then
    _emit_env_file "$f" "primary" && return 0
  fi
  # Unwritten .env yet — probe default local URL with keys from environment
  local url key
  url="${SUPABASE_URL:-$(li_supabase_primary_url)}"
  key="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-}}"
  if _probe_rest "$url" "$key"; then
    [[ -n "${SUPABASE_URL:-}" ]] && echo "SUPABASE_URL=${SUPABASE_URL}"
    [[ -n "${SUPABASE_ANON_KEY:-}" ]] && echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
    [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] && echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
    [[ -n "${SUPABASE_DB_URL:-}" ]] && echo "SUPABASE_DB_URL=${SUPABASE_DB_URL}"
    echo "LI_SUPABASE_ACTIVE_ENDPOINT=primary"
    return 0
  fi
  return 1
}

_try_standby() {
  local f="$_env_root/.env.supabase.standby"
  _emit_env_file "$f" "standby"
}

if _try_primary; then
  _log "==> Supabase probe: primary OK"
  exit 0
fi

if _try_standby; then
  _log "==> Supabase probe: standby OK (primary down)"
  exit 0
fi

_log "==> Supabase probe: primary and standby unreachable"
exit 1
