# Shared helpers: Supabase env, REST probe, preferred Node (avoid Cursor bundled node).
li_source_env_supabase() {
  local root="$1"
  [[ -f "$root/.env.supabase" ]] || return 1
  set -a
  # shellcheck source=/dev/null
  source "$root/.env.supabase"
  set +a
}

li_supabase_rest_ready() {
  [[ -n "${SUPABASE_URL:-}" ]] || return 1
  local key="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-}}"
  [[ -n "$key" ]] || return 1
  local code
  code="$(
    curl -sf -o /dev/null -w "%{http_code}" \
      -H "apikey: ${key}" -H "Authorization: Bearer ${key}" \
      "${SUPABASE_URL%/}/rest/v1/" 2>/dev/null || echo "000"
  )"
  [[ "$code" == "200" ]]
}

li_resolve_preferred_node_bin() {
  local c explicit="${NODE_BIN:-}"
  local candidates=(
    "$explicit"
    "${HOME}/.local/node/bin/node"
    "/opt/homebrew/opt/node@24/bin/node"
    "/usr/local/opt/node@24/bin/node"
    "/usr/bin/node24"
    "/usr/local/bin/node24"
    "/opt/homebrew/bin/node"
    "/opt/homebrew/opt/node@22/bin/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
  )
  for c in "${candidates[@]}"; do
    if [[ -n "$c" && -x "$c" && "$c" != *".cursor-server/"* ]]; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  c="$(command -v node 2>/dev/null || true)"
  if [[ -n "$c" && -x "$c" && "$c" != *".cursor-server/"* ]]; then
    printf '%s\n' "$c"
    return 0
  fi
  if [[ -x "${HOME}/.local/node/bin/node" ]]; then
    printf '%s\n' "${HOME}/.local/node/bin/node"
    return 0
  fi
  [[ -n "$c" ]] && printf '%s\n' "$c" && return 0
  printf '%s\n' "node"
}

# Docker: direct socket, or sg docker when user is in group but session lacks it (systemd --user).
li_docker_ok() {
  command -v docker >/dev/null 2>&1 || return 1
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  if command -v sg >/dev/null 2>&1 && sg docker -c 'docker info' >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

li_docker() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
    return $?
  fi
  if command -v sg >/dev/null 2>&1; then
    sg docker -c "$(printf 'docker %q ' "$@")"
    return $?
  fi
  docker "$@"
}

li_supabase_failover_enabled() {
  [[ "${LI_SUPABASE_FAILOVER:-}" == "1" ]]
}

# Apply probe stdout (SUPABASE_* + LI_SUPABASE_ACTIVE_ENDPOINT) into the shell env.
li_apply_supabase_probe_lines() {
  local line key val
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in
      SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|LI_SUPABASE_ACTIVE_ENDPOINT)
        export "${key}=${val}"
        ;;
    esac
  done
}

# Probe primary → standby; optionally start standby when primary is down.
li_apply_supabase_failover() {
  local root="$1"
  local probe_out rc=1
  if ! li_supabase_failover_enabled; then
    return 1
  fi
  probe_out="$(
    LI_SUPABASE_PROBE_QUIET=1 LI_SUPABASE_ENSURE_QUIET=1 \
      "$root/scripts/supabase-health-probe.sh" 2>/dev/null || true
  )"
  if [[ -n "$probe_out" ]]; then
    li_apply_supabase_probe_lines <<<"$probe_out"
    return 0
  fi
  if [[ -x "$root/scripts/ensure-supabase-standby.sh" ]]; then
    LI_SUPABASE_ENSURE_QUIET=1 "$root/scripts/ensure-supabase-standby.sh" 2>/dev/null || true
  fi
  probe_out="$(
    LI_SUPABASE_PROBE_QUIET=1 LI_SUPABASE_ENSURE_QUIET=1 \
      "$root/scripts/supabase-health-probe.sh" 2>/dev/null || true
  )"
  if [[ -n "$probe_out" ]]; then
    li_apply_supabase_probe_lines <<<"$probe_out"
    return 0
  fi
  return 1
}
