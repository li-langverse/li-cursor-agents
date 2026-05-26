# Fix common Windows OpenSSH reachability issues (requires Administrator).
param(
    [string]$InterfaceAlias,
    [switch]$SkipNetworkPrivate
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

# Allow SSH on Public profile (home LAN is often misclassified as Public).
if (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue) {
    Set-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -Profile Domain, Private, Public -Enabled True
    Write-Host "OpenSSH-Server-In-TCP: enabled for Domain, Private, Public"
} else {
    New-NetFirewallRule -Name OpenSSH-Server-In-TCP -DisplayName "OpenSSH Server (sshd)" `
        -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 `
        -Profile Domain, Private, Public | Out-Null
    Write-Host "Created OpenSSH-Server-In-TCP for all profiles"
}

if (-not $SkipNetworkPrivate) {
    $alias = $InterfaceAlias
    if (-not $alias) {
        $alias = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1).InterfaceAlias
    }
    if ($alias) {
        Set-NetConnectionProfile -InterfaceAlias $alias -NetworkCategory Private
        Write-Host "Set network '$alias' to Private (recommended for trusted LAN)"
    }
}

$cfg = "$env:ProgramData\ssh\sshd_config"
if (Test-Path $cfg) {
    $text = Get-Content $cfg -Raw
    if ($text -notmatch '(?m)^PasswordAuthentication\s+yes') {
        if ($text -match '(?m)^#PasswordAuthentication\s+yes') {
            $text = $text -replace '(?m)^#PasswordAuthentication\s+yes', 'PasswordAuthentication yes'
        } else {
            $text += "`nPasswordAuthentication yes`n"
        }
        Set-Content -Path $cfg -Value $text -NoNewline
        Write-Host "Enabled PasswordAuthentication in sshd_config"
    }
}

Restart-Service sshd
Write-Host ""
Get-Service sshd | Format-Table Status, StartType
Get-NetConnectionProfile | Format-Table InterfaceAlias, NetworkCategory
(Get-NetFirewallRule -Name OpenSSH-Server-In-TCP).Profile
