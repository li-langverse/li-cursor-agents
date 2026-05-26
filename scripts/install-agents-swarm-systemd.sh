#!/usr/bin/env bash
# Install user systemd: dashboard, optional async-swarm, watchdog timer.
# Disable: touch data/control-plane/DISABLE_AUTOSTART
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
DATA_DIR="$ROOT/data/control-plane"
LOG_DIR="$ROOT/logs"
PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
DASHBOARD_HOST="${LI_AGENT_DASHBOARD_HOST:-127.0.0.1}"
SDK_MAX="${LI_SDK_MAX_CONCURRENT:-5}"
_store_cli="${LI_CONTROL_PLANE_STORE:-}"
STORE="${_store_cli:-supabase}"
if [[ -f "$ENV_FILE" && -z "$_store_cli" ]]; then
  # shellcheck disable=SC1090
  _store_from_env="$(
    (set -a; source "$ENV_FILE"; set +a; printf '%s' "${LI_CONTROL_PLANE_STORE:-}") 2>/dev/null
  )"
  [[ -n "$_store_from_env" ]] && STORE="$_store_from_env"
fi
DISABLE_AUTOSTART="${DATA_DIR}/DISABLE_AUTOSTART"
# shellcheck source=lib/li-stack-env.sh
source "$ROOT/scripts/lib/li-stack-env.sh"
NODE_BIN="$(li_resolve_preferred_node_bin)"
NODE_DIR="$(dirname "$NODE_BIN")"
NPM_BIN="${NPM_BIN:-$(command -v npm 2>/dev/null || true)}"
NPM_DIR=""
[[ -n "$NPM_BIN" ]] && NPM_DIR="$(dirname "$NPM_BIN")"
SERVICE_PATH="$NODE_DIR${NPM_DIR:+:$NPM_DIR}:/usr/local/bin:/usr/bin:/bin"
INSTALL_WATCHDOG=1
INSTALL_ASYNC=1
INSTALL_SWEEP=1
INSTALL_HEALTH_REPORT=1
for arg in "$@"; do
  case "$arg" in
    --no-watchdog) INSTALL_WATCHDOG=0 ;;
    --no-sweep) INSTALL_SWEEP=0 ;;
    --no-health-report) INSTALL_HEALTH_REPORT=0 ;;
    --dashboard-only) INSTALL_ASYNC=0 ;;
    --lan) DASHBOARD_HOST="0.0.0.0" ;;
  esac
done
DASHBOARD_AUTO_SWARM=1
DASHBOARD_EXTERNAL_SWARM=0
if [[ "$INSTALL_ASYNC" == "1" ]]; then
  DASHBOARD_AUTO_SWARM=0
  DASHBOARD_EXTERNAL_SWARM=1
fi
chmod +x "$ROOT"/scripts/lib/agents-swarm-systemd-wrapper.sh "$ROOT"/scripts/agents-*.sh "$ROOT"/scripts/sweep-hung-agents.sh "$ROOT"/scripts/swarm-health-report.sh
mkdir -p "$DATA_DIR" "$LOG_DIR" "$SERVICE_DIR"
command -v loginctl >/dev/null && loginctl enable-linger "$(whoami)" 2>/dev/null || true
cat >"$SERVICE_DIR/li-agents-dashboard.service" <<EOF
[Unit]
Description=Li agents dashboard :${PORT}
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$ROOT
Environment=HOME=$HOME PATH=$SERVICE_PATH LI_CURSOR_ENV_FILE=$ENV_FILE LI_CURSOR_AGENTS_ROOT=$ROOT
Environment=NODE_BIN=$NODE_BIN LI_AGENT_DASHBOARD_PORT=$PORT LI_AGENT_DASHBOARD_HOST=$DASHBOARD_HOST LI_CONTROL_PLANE_STORE=$STORE
Environment=LI_SDK_MAX_CONCURRENT=$SDK_MAX LI_AUTO_START_ASYNC_SWARM=${DASHBOARD_AUTO_SWARM} LI_SWARM_DETACHED=1 LI_SWARM_EXTERNAL=${DASHBOARD_EXTERNAL_SWARM} LI_AUTO_START_SUPERVISOR=0
ExecStart=$ROOT/scripts/agents-dashboard-systemd.sh
Restart=always
RestartSec=30
StandardOutput=append:${LOG_DIR}/agents-dashboard-systemd.log
StandardError=append:${LOG_DIR}/agents-dashboard-systemd.log
[Install]
WantedBy=default.target
EOF
if [[ "$INSTALL_ASYNC" == "1" ]]; then
  cat >"$SERVICE_DIR/li-agents-async-swarm.service" <<EOF
[Unit]
Description=Li agents async swarm
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$ROOT
Environment=HOME=$HOME PATH=$SERVICE_PATH LI_CURSOR_ENV_FILE=$ENV_FILE LI_CURSOR_AGENTS_ROOT=$ROOT
Environment=NODE_BIN=$NODE_BIN LI_CONTROL_PLANE_STORE=$STORE LI_SDK_MAX_CONCURRENT=$SDK_MAX
Environment=LI_AUTO_START_ASYNC_SWARM=1 LI_SWARM_DETACHED=0
ExecStart=$ROOT/scripts/agents-async-swarm-systemd.sh
Restart=on-failure
RestartSec=60
StandardOutput=append:${LOG_DIR}/agents-async-swarm-systemd.log
StandardError=append:${LOG_DIR}/agents-async-swarm-systemd.log
[Install]
WantedBy=default.target
EOF
fi
if [[ "$INSTALL_WATCHDOG" == "1" ]]; then
  cat >"$SERVICE_DIR/li-agents-swarm-watchdog.service" <<EOF
[Service]
Type=oneshot
WorkingDirectory=$ROOT
Environment=HOME=$HOME LI_CURSOR_ENV_FILE=$ENV_FILE LI_CURSOR_AGENTS_ROOT=$ROOT
ExecStart=$ROOT/scripts/agents-swarm-watchdog-systemd.sh
EOF
  cat >"$SERVICE_DIR/li-agents-swarm-watchdog.timer" <<EOF
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
Persistent=true
[Install]
WantedBy=timers.target
EOF
fi
if [[ "$INSTALL_SWEEP" == "1" ]]; then
  cat >"$SERVICE_DIR/li-agents-sweep.service" <<EOF
[Service]
Type=oneshot
WorkingDirectory=$ROOT
Environment=HOME=$HOME PATH=$SERVICE_PATH LI_CURSOR_ENV_FILE=$ENV_FILE LI_CURSOR_AGENTS_ROOT=$ROOT
Environment=NODE_BIN=$NODE_BIN LI_CONTROL_PLANE_STORE=$STORE LI_SDK_MAX_CONCURRENT=$SDK_MAX
ExecStart=$ROOT/scripts/sweep-hung-agents.sh --apply
EOF
  cat >"$SERVICE_DIR/li-agents-sweep.timer" <<EOF
[Timer]
OnBootSec=15min
OnUnitActiveSec=30min
Persistent=true
[Install]
WantedBy=timers.target
EOF
fi
systemctl --user daemon-reload
systemctl --user stop li-agents-dashboard.service 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
  # shellcheck source=free-port.sh
  source "$ROOT/scripts/free-port.sh"
  free_port "$PORT" 10 || true
fi
systemctl --user enable --now li-agents-dashboard.service
[[ "$INSTALL_ASYNC" == "1" ]] && systemctl --user enable li-agents-async-swarm.service
[[ "$INSTALL_WATCHDOG" == "1" ]] && systemctl --user enable --now li-agents-swarm-watchdog.timer
[[ "$INSTALL_SWEEP" == "1" ]] && systemctl --user enable --now li-agents-sweep.timer
if [[ "$INSTALL_HEALTH_REPORT" == "1" ]]; then
  LI_HEALTH_REPORT_INTERVAL="${LI_HEALTH_REPORT_INTERVAL:-20min}" \
    "$ROOT/scripts/install-health-report-timer.sh"
fi
if [[ "$DASHBOARD_HOST" == "0.0.0.0" ]]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "OK dashboard LAN http://${LAN_IP:-<host-ip>}:${PORT}/ (bind 0.0.0.0:${PORT}) — firewall: ufw allow ${PORT}/tcp"
else
  echo "OK dashboard http://127.0.0.1:${PORT}/ — LAN: reinstall with --lan or LI_AGENT_DASHBOARD_HOST=0.0.0.0"
fi
echo "Control plane store: ${STORE} (Supabase: npm run db:ensure + Docker; disk: LI_CONTROL_PLANE_STORE=disk in ${ENV_FILE})"
if [[ -f "$DISABLE_AUTOSTART" ]]; then
  echo "Autostart PAUSED (${DISABLE_AUTOSTART} exists) — rm -f to resume"
else
  echo "Autostart enabled — pause: touch ${DISABLE_AUTOSTART}"
fi
