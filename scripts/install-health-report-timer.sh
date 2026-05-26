#!/usr/bin/env bash
# Install user systemd timer: li-agents-health-report (every 20 min).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
LOG_DIR="$ROOT/logs"
INTERVAL="${LI_HEALTH_REPORT_INTERVAL:-20min}"

chmod +x "$ROOT/scripts/swarm-health-report.sh"

mkdir -p "$LOG_DIR/swarm-health-reports" "$SERVICE_DIR"

cat >"$SERVICE_DIR/li-agents-health-report.service" <<EOF
[Unit]
Description=Li agents swarm health markdown report
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT
Environment=HOME=$HOME LI_CURSOR_ENV_FILE=$ENV_FILE LI_CURSOR_AGENTS_ROOT=$ROOT
Environment=LI_AGENT_DASHBOARD_PORT=${LI_AGENT_DASHBOARD_PORT:-9477}
ExecStart=$ROOT/scripts/swarm-health-report.sh
EOF

cat >"$SERVICE_DIR/li-agents-health-report.timer" <<EOF
[Unit]
Description=Periodic swarm health report (every ${INTERVAL})

[Timer]
OnBootSec=5min
OnUnitActiveSec=${INTERVAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now li-agents-health-report.timer
systemctl --user start li-agents-health-report.service 2>/dev/null || true

echo "OK li-agents-health-report.timer (${INTERVAL})"
echo "Reports: $ROOT/logs/swarm-health-reports/ (latest.md symlink)"
systemctl --user list-timers li-agents-health-report.timer --no-pager 2>/dev/null || true
