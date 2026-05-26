#!/usr/bin/env bash
# Run ON the Linux SSH host (Ubuntu) before Cursor Remote-SSH.
set -euo pipefail

echo "==> Packages (bash, wget/curl for cursor-server install)"
sudo apt-get update -qq
sudo apt-get install -y bash wget curl openssh-server ca-certificates

echo "==> sshd: TCP forwarding (required for Remote-SSH tunnels)"
CFG=/etc/ssh/sshd_config
sudo sed -i 's/^#*AllowTcpForwarding.*/AllowTcpForwarding yes/' "$CFG"
grep -q '^AllowTcpForwarding yes' "$CFG" || echo 'AllowTcpForwarding yes' | sudo tee -a "$CFG" >/dev/null
sudo systemctl restart ssh || sudo service ssh restart

echo "==> Reset stale Cursor server (if connect loops / terminal dead)"
rm -rf ~/.cursor-server
echo "    removed ~/.cursor-server (will reinstall on next connect)"

echo ""
echo "From your laptop: Cursor -> Remote-SSH: Connect to Host -> li-ubuntu"
echo "Open folder e.g. /home/$(whoami)/projects/li"
