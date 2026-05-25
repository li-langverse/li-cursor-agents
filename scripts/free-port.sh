#!/usr/bin/env bash
# free_port PORT [TIMEOUT_SEC] — terminate listeners on TCP PORT; exit 1 if still busy.
free_port() {
  local port="$1"
  local timeout_sec="${2:-12}"
  local start now elapsed

  if ! lsof -ti ":${port}" >/dev/null 2>&1; then
    return 0
  fi

  start=$(date +%s)
  while lsof -ti ":${port}" >/dev/null 2>&1; do
    now=$(date +%s)
    elapsed=$((now - start))
    if (( elapsed >= timeout_sec )); then
      echo "ERROR: port ${port} still in use after ${timeout_sec}s:" >&2
      lsof -nP -iTCP:"${port}" 2>/dev/null | head -20 >&2 || true
      return 1
    fi

    local listen_pids all_pids
    listen_pids=$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ' | xargs echo 2>/dev/null || true)
    all_pids=$(lsof -ti ":${port}" 2>/dev/null | sort -u | tr '\n' ' ' | xargs echo 2>/dev/null || true)
    local targets="${listen_pids:-$all_pids}"
    if [[ -z "${targets// }" ]]; then
      sleep 0.2
      continue
    fi

    if (( elapsed == 0 )); then
      echo "==> Stopping process on :${port} (PIDs: ${targets})"
    fi

    # shellcheck disable=SC2086
    kill ${targets} 2>/dev/null || true
    sleep 0.4
    if lsof -ti ":${port}" >/dev/null 2>&1; then
      # shellcheck disable=SC2086
      kill -9 ${targets} 2>/dev/null || true
      # Re-scan — child processes may have inherited the socket
      all_pids=$(lsof -ti ":${port}" 2>/dev/null | sort -u | tr '\n' ' ' | xargs echo 2>/dev/null || true)
      if [[ -n "${all_pids// }" ]]; then
        # shellcheck disable=SC2086
        kill -9 ${all_pids} 2>/dev/null || true
      fi
    fi
    sleep 0.3
  done
  return 0
}
