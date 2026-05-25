#!/usr/bin/env bash
# Install a daily launchd job (04:00 local) for scripts/disk-cleanup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.li-langverse.disk-cleanup"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
SCRIPT="${ROOT}/scripts/disk-cleanup.sh"

chmod +x "$SCRIPT"

cat >"$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>${SCRIPT}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>4</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/li-disk-cleanup/launchd.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/li-disk-cleanup/launchd.stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo "Installed ${PLIST_DEST}"
echo "Runs daily at 04:00 — logs in ~/Library/Logs/li-disk-cleanup/"
echo "Manual run: bash ${SCRIPT}"
echo "Unload: launchctl bootout gui/$(id -u)/${LABEL}"
