# Dashboard LAN access and tracking

The Li agents dashboard defaults to port **9477** (`LI_AGENT_DASHBOARD_PORT`). For phones or other machines on your LAN, bind to all interfaces:

```bash
export LI_AGENT_DASHBOARD_HOST=0.0.0.0   # default in repo systemd install is 0.0.0.0
export LI_AGENT_DASHBOARD_PORT=9477
```

Local-only (safer on untrusted networks): `LI_AGENT_DASHBOARD_HOST=127.0.0.1`.

## Copy-paste: track dashboard on this host

```bash
# Repo root (optional)
cd /home/s4il0r/Documents/Cursor/li-langverse/li-cursor-agents

# 1) Is anything listening on 9477? (127.0.0.1 vs 0.0.0.0)
ss -tlnp | grep 9477

# 2) User systemd unit
systemctl --user status li-agents-dashboard.service --no-pager

# 3) LAN addresses for this machine
hostname -I

# 4) Local API (use timeouts — API can block when swarm is busy)
curl -sf --connect-timeout 2 --max-time 8 http://127.0.0.1:9477/api/runtime | head -c 300 || echo LOCAL_RUNTIME_FAIL
curl -sf --connect-timeout 2 --max-time 5 http://127.0.0.1:9477/api/status   | head -c 300 || echo LOCAL_STATUS_FAIL

# 5) Same checks via primary LAN IP
LAN_IP=$(hostname -I | awk '{print $1}')
echo "LAN_IP=${LAN_IP}"
curl -sf --connect-timeout 2 --max-time 8 "http://${LAN_IP}:9477/api/runtime" | head -c 300 || echo LAN_RUNTIME_FAIL
curl -sf --connect-timeout 2 --max-time 5 "http://${LAN_IP}:9477/api/status"   | head -c 300 || echo LAN_STATUS_FAIL

# 6) Open UI from another device (browser)
echo "http://${LAN_IP}:9477/"
```

## Copy-paste: track from another machine on the LAN

Replace `ENGINE_IP` with the dashboard host’s LAN address (from `hostname -I` on that host).

```bash
ENGINE_IP=192.168.10.32   # example

ss -tlnp | grep 9477    # only on the dashboard host

curl -sf --connect-timeout 2 --max-time 8 "http://${ENGINE_IP}:9477/api/runtime" | head -c 300
curl -sf --connect-timeout 2 --max-time 5 "http://${ENGINE_IP}:9477/api/status"   | head -c 300

# Browser
xdg-open "http://${ENGINE_IP}:9477/"    # Linux desktop
# open "http://${ENGINE_IP}:9477/"      # macOS
```

## systemd: LAN bind + restart

User unit: `~/.config/systemd/user/li-agents-dashboard.service`

Ensure an `Environment=` line includes:

```ini
Environment=... LI_AGENT_DASHBOARD_HOST=0.0.0.0 LI_AGENT_DASHBOARD_PORT=9477 ...
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user restart li-agents-dashboard.service
ss -tlnp | grep 9477    # expect 0.0.0.0:9477 for LAN
```

Re-install from repo (writes units with `LI_AGENT_DASHBOARD_HOST=0.0.0.0`):

```bash
cd /home/s4il0r/Documents/Cursor/li-langverse/li-cursor-agents
./scripts/install-agents-swarm-systemd.sh
```

## Firewall

If LAN curl fails but `ss` shows `0.0.0.0:9477`, allow the port on the dashboard host (example):

```bash
sudo ufw allow 9477/tcp comment 'li-agents-dashboard'
```

## When API curls hang

`LISTEN` with a large recv-Q or curls that connect but time out usually mean the Node event loop is busy (swarm children, `gh`, briefing scripts). Use `systemctl --user status` and `ss -tlnp | grep 9477` to confirm the process is up; retry `/api/status` with `--max-time 5`, or check logs:

```bash
tail -f /home/s4il0r/Documents/Cursor/li-langverse/li-cursor-agents/logs/agents-dashboard-systemd.log
```
