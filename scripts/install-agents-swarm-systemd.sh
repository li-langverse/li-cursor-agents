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
NODE_BIN="${NODE_BIN:-$(command -v node)}"
NODE_DIR="$(dirname "$NODE_BIN")"
NPM_BIN="${NPM_BIN:-$(command -v npm 2>/dev/null || true)}"
NPM_DIR=""
[[ -n "$NPM_BIN" ]] && NPM_DIR="$(dirname "$NPM_BIN")"
SERVICE_PATH="$NODE_DIR${NPM_DIR:+:$NPM_DIR}:/usr/local/bin:/usr/bin:/bin"
INSTALL_WATCHDOG=1
INSTALL_ASYNC=1
for arg in "$@"; do
  case "$arg" in
    --no-watchdog) INSTALL_WATCHDOG=0 ;;
    --dashboard-only) INSTALL_ASYNC=0 ;;
    --lan) DASHBOARD_HOST="0.0.0.0" ;;
  esac
done
DASHBOARD_AUTO_SWARM=1
if [[ "$INSTALL_ASYNC" == "1" ]]; then
  DASHBOARD_AUTO_SWARM=0
fi
chmod +x "$ROOT"/scripts/lib/agents-swarm-systemd-wrapper.sh "$ROOT"/scripts/agents-*.sh
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
Environment=NODE_BIN=$NODE_BIN LI_AGENT_DASHBOARD_PORT=$PORT LI_AGENT_DASHBOARD_HOST=$DASHBOARD_HOST LI_CONTROL_PLANE_STORE=disk
Environment=LI_AUTO_START_ASYNC_SWARM=${DASHBOARD_AUTO_SWARM} LI_SWARM_DETACHED=1 LI_AUTO_START_SUPERVISOR=0
ExecStart=$ROOT/scripts/agents-dashboard-systemd.sh
Restart=on-failure
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
Environment=HOME=$HOME LI_CURSOR_ENV_FILE=$ENV_FILE LI_CURSOR_AGENTS_ROOT=$ROOT
Environment=LI_CONTROL_PLANE_STORE=disk LI_AUTO_START_ASYNC_SWARM=1 LI_SWARM_DETACHED=0
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
systemctl --user daemon-reload
systemctl --user enable --now li-agents-dashboard.service
[[ "$INSTALL_ASYNC" == "1" ]] && systemctl --user enable li-agents-async-swarm.service
[[ "$INSTALL_WATCHDOG" == "1" ]] && systemctl --user enable --now li-agents-swarm-watchdog.timer
if [[ "$DASHBOARD_HOST" == "0.0.0.0" ]]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "OK dashboard LAN http://${LAN_IP:-<host-ip>}:${PORT}/ (bind 0.0.0.0:${PORT}) — firewall: ufw allow ${PORT}/tcp"
else
  echo "OK dashboard http://127.0.0.1:${PORT}/ — LAN: reinstall with --lan or LI_AGENT_DASHBOARD_HOST=0.0.0.0"
fi
echo "DISABLE autostart: ${DATA_DIR}/DISABLE_AUTOSTART"
