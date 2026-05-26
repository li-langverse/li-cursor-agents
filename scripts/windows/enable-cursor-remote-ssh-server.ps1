# Prepare this Windows PC as a Cursor Remote-SSH host (OpenSSH + firewall).
# Requires Administrator. Client must use extension: anysphere.remote-ssh (not Microsoft).
param(
    [switch]$SkipSshdConfig
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "Re-launching elevated..."
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath
    ) -Wait
    exit $LASTEXITCODE
}

& (Join-Path $PSScriptRoot "repair-openssh-firewall.ps1")

if (-not $SkipSshdConfig) {
    $cfg = "$env:ProgramData\ssh\sshd_config"
    $text = Get-Content $cfg -Raw
  $replacements = @{
        '(?m)^#AllowTcpForwarding yes' = 'AllowTcpForwarding yes'
        '(?m)^#PermitTTY yes'          = 'PermitTTY yes'
    }
    foreach ($k in $replacements.Keys) {
        if ($text -match $k) { $text = $text -replace $k, $replacements[$k] }
    }
    if ($text -notmatch '(?m)^AllowTcpForwarding yes') { $text += "`nAllowTcpForwarding yes`n" }
    if ($text -notmatch '(?m)^PermitTTY yes') { $text += "`nPermitTTY yes`n" }
    Set-Content -Path $cfg -Value $text -NoNewline
    Restart-Service sshd
    Write-Host "sshd_config: AllowTcpForwarding + PermitTTY enabled"
}

Write-Host ""
Write-Host "On the CLIENT machine (laptop):"
Write-Host "  1. Extension: anysphere.remote-ssh (@id:anysphere.remote-ssh)"
Write-Host "  2. Ctrl+Shift+P -> Remote-SSH: Connect to Host -> li-windows"
Write-Host "  3. Open folder: C:/Users/$env:USERNAME/Documents/Programming/li"
