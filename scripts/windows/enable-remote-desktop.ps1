# Enable Windows Remote Desktop (RDP) for LAN / VPN access. Requires Administrator.
# Windows Pro/Enterprise/Education only (not Home).
param(
    [string[]]$AllowUsers = @($env:USERNAME),
    [switch]$DisableNla
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "Re-launching elevated..."
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
    if ($DisableNla) { $args += "-DisableNla" }
    foreach ($u in $AllowUsers) { if ($u -ne $env:USERNAME) { $args += "-AllowUsers"; $args += $u } }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args -Wait
    exit $LASTEXITCODE
}

$edition = (Get-ComputerInfo).WindowsProductName
if ($edition -notmatch 'Pro|Enterprise|Education|Server') {
    Write-Warning "RDP server may be unavailable on: $edition (Home supports RDP client only)."
}

Write-Host "==> Enable Remote Desktop"
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server" `
    -Name "fDenyTSConnections" -Value 0
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" `
    -Name "UserAuthentication" -Value $(if ($DisableNla) { 0 } else { 1 })

Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue
# Also allow on Public profile (same issue as OpenSSH on misclassified LAN).
Get-NetFirewallRule -DisplayGroup "Remote Desktop" | Set-NetFirewallRule -Profile Domain, Private, Public -Enabled True

Set-Service TermService -StartupType Automatic
Start-Service TermService
Start-Service UmRdpService -ErrorAction SilentlyContinue

foreach ($user in $AllowUsers) {
    $member = Get-LocalGroupMember -Group "Remote Desktop Users" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*\$user" -or $_.Name -eq $user }
    if (-not $member) {
        Add-LocalGroupMember -Group "Remote Desktop Users" -Member $user
        Write-Host "Added '$user' to Remote Desktop Users"
    }
}

Write-Host ""
Write-Host "RDP enabled. Connect with: mstsc /v:<this-pc-ip>"
Get-Service TermService | Format-Table Name, Status, StartType
Get-ItemProperty "HKLM:\System\CurrentControlSet\Control\Terminal Server" fDenyTSConnections |
    Select-Object fDenyTSConnections
(Get-NetFirewallRule -DisplayGroup "Remote Desktop" | Select-Object -First 1).Profile
