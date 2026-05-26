# Remote access (office LAN + VPN)

Use your **VPN** first when away from the office, then connect to the same `192.168.10.x` addresses as on site.

| Machine | IP (LAN) | SSH | RDP |
|---------|----------|-----|-----|
| Windows dev PC | `192.168.10.31` | `ssh julian@192.168.10.31` | `mstsc /v:192.168.10.31` |
| Ubuntu (GNOME) | `192.168.10.32` | `ssh <user>@192.168.10.32` | port **3389** (GNOME Remote Desktop or xrdp) |

Pin each host with a static IP (Windows: `scripts/windows/set-static-ipv4.ps1`).

## Windows (.31) — one-time setup

Administrator PowerShell from `li-cursor-agents`:

```powershell
.\scripts\windows\repair-openssh-firewall.ps1
.\scripts\windows\enable-remote-desktop.ps1
.\scripts\windows\set-static-ipv4.ps1   # if not already static
```

Sign in to RDP with your **Windows password** for user `julian`.

## Ubuntu (.32) — on that machine

```bash
cd li-cursor-agents   # or copy scripts/linux/enable-gnome-remote-desktop.sh
chmod +x scripts/linux/enable-gnome-remote-desktop.sh
./scripts/linux/enable-gnome-remote-desktop.sh
```

Then: **Settings → Sharing → Remote Desktop → On** and set credentials.

If you previously used **xrdp** instead of GNOME’s built-in RDP, keep that stack; port 3389 is already open on `.32`.

## From another computer

1. Connect **VPN** (same one you used when GNOME RDP worked).
2. **Ping** `192.168.10.31` / `.32` — if ping fails, fix VPN or routing before RDP/SSH.
3. **RDP**
   - Windows: Remote Desktop / `mstsc` → `192.168.10.31`
   - Ubuntu: Remmina, GNOME Connections, or `xfreerdp /v:192.168.10.32`
4. **SSH / Cursor**: `ssh julian@192.168.10.31` or Remote-SSH in Cursor.

## Optional: SSH config (laptop)

```sshconfig
Host win-dev
    HostName 192.168.10.31
    User julian

Host ubuntu-dev
    HostName 192.168.10.32
    User julian
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| RDP timeout | VPN up? Same subnet? Firewall on Public profile (run `repair-openssh-firewall.ps1` pattern for RDP). |
| SSH works, RDP fails | `Get-Service TermService` on Windows; Sharing → Remote Desktop on Ubuntu. |
| Works at office, not remote | VPN must route `192.168.10.0/24` (split tunnel may block LAN). |

Boot persistence: `enable-boot-ssh-and-cursor.ps1` (SSH + Cursor worker); run `enable-remote-desktop.ps1` once for RDP.
