#!/usr/bin/env bash
# Ubuntu: enable GNOME Remote Desktop (RDP) — same stack that works with GNOME clients.
# Run on the Linux machine (e.g. 192.168.10.32) as your desktop user, then approve in Settings if prompted.
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as your normal user (not root). sudo is used only where needed." >&2
  exit 1
fi

echo "==> Packages"
sudo apt-get update -qq
sudo apt-get install -y gnome-remote-desktop

echo "==> Enable and start user service"
systemctl --user enable gnome-remote-desktop.service
systemctl --user start gnome-remote-desktop.service

echo "==> Firewall (if ufw active)"
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q 'Status: active'; then
  sudo ufw allow 3389/tcp comment 'GNOME RDP'
  sudo ufw reload
fi

echo ""
echo "Next steps (on the Ubuntu machine):"
echo "  1. Settings -> Sharing -> Remote Desktop -> ON"
echo "  2. Set username/password (or use system login)"
echo "  3. Note this machine's LAN IP: $(hostname -I | awk '{print $1}')"
echo ""
echo "From VPN/LAN, connect with any RDP client to that IP (port 3389)."
systemctl --user --no-pager status gnome-remote-desktop.service || true
