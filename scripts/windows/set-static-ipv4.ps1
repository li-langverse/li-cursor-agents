# Pin the active IPv4 settings as static so the address survives reboots.
# Requires Administrator. Re-run with -RevertToDhcp to undo.
param(
    [string]$InterfaceAlias,
    [string]$IPAddress,
    [byte]$PrefixLength = 0,
    [string]$Gateway,
    [string[]]$DnsServers,
    [switch]$RevertToDhcp
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PrimaryIPv4Config {
    $cfg = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
        Select-Object -First 1
    if (-not $cfg) {
        throw "No active IPv4 adapter with a default gateway found."
    }
    $alias = $cfg.InterfaceAlias
    $addr = Get-NetIPAddress -InterfaceAlias $alias -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -notlike "169.254.*" } |
        Sort-Object { $_.PrefixOrigin -eq "Dhcp" } -Descending |
        Select-Object -First 1
    $route = Get-NetRoute -InterfaceAlias $alias -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
        Select-Object -First 1
    $dns = (Get-DnsClientServerAddress -InterfaceAlias $alias -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses |
        Where-Object { $_ }
    if (-not $dns) { $dns = @($route.NextHop) }
    [pscustomobject]@{
        InterfaceAlias = $alias
        IPAddress      = $addr.IPAddress
        PrefixLength   = $addr.PrefixLength
        Gateway        = $route.NextHop
        DnsServers     = $dns
    }
}

if (-not (Test-IsAdmin)) {
    Write-Host "Re-launching elevated..."
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
    if ($InterfaceAlias) { $argList += "-InterfaceAlias", $InterfaceAlias }
    if ($IPAddress) { $argList += "-IPAddress", $IPAddress }
    if ($PrefixLength) { $argList += "-PrefixLength", $PrefixLength }
    if ($Gateway) { $argList += "-Gateway", $Gateway }
    if ($DnsServers) { $argList += "-DnsServers", ($DnsServers -join ",") }
    if ($RevertToDhcp) { $argList += "-RevertToDhcp" }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
    exit $LASTEXITCODE
}

if ($DnsServers -is [string]) {
    $DnsServers = $DnsServers -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

$detected = Get-PrimaryIPv4Config
$alias = if ($InterfaceAlias) { $InterfaceAlias } else { $detected.InterfaceAlias }
$ip = if ($IPAddress) { $IPAddress } else { $detected.IPAddress }
$prefix = if ($PrefixLength) { $PrefixLength } else { $detected.PrefixLength }
$gw = if ($Gateway) { $Gateway } else { $detected.Gateway }
$dns = if ($DnsServers) { $DnsServers } else { $detected.DnsServers }

Write-Host "Adapter: $alias"

if ($RevertToDhcp) {
    Write-Host "Reverting to DHCP..."
    Get-NetIPAddress -InterfaceAlias $alias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Remove-NetIPAddress -Confirm:$false
    Get-NetRoute -InterfaceAlias $alias -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
        Remove-NetRoute -Confirm:$false
    Set-DnsClientServerAddress -InterfaceAlias $alias -ResetServerAddresses
    Set-NetIPInterface -InterfaceAlias $alias -Dhcp Enabled
    Write-Host "DHCP enabled on $alias"
    Get-NetIPConfiguration -InterfaceAlias $alias | Format-List InterfaceAlias, IPv4Address, IPv4DefaultGateway
    exit 0
}

Write-Host "Static IPv4:"
Write-Host "  Address:  $ip/$prefix"
Write-Host "  Gateway:  $gw"
Write-Host "  DNS:      $($dns -join ', ')"

Set-NetIPInterface -InterfaceAlias $alias -Dhcp Disabled

Get-NetIPAddress -InterfaceAlias $alias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Remove-NetIPAddress -Confirm:$false
Get-NetRoute -InterfaceAlias $alias -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Remove-NetRoute -Confirm:$false

$null = New-NetIPAddress -InterfaceAlias $alias -IPAddress $ip -PrefixLength $prefix -DefaultGateway $gw
Set-DnsClientServerAddress -InterfaceAlias $alias -ServerAddresses $dns

Write-Host ""
Write-Host "Done. Verify:"
Get-NetIPInterface -InterfaceAlias $alias -AddressFamily IPv4 | Format-List InterfaceAlias, Dhcp
Get-NetIPConfiguration -InterfaceAlias $alias | Format-List InterfaceAlias, IPv4Address, IPv4DefaultGateway
Get-DnsClientServerAddress -InterfaceAlias $alias -AddressFamily IPv4 | Format-List ServerAddresses
