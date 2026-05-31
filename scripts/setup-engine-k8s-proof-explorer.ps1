# Apply li-proof-explorer on the homelab engine cluster (Windows).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [string]$EngineHost = "192.168.10.32",
    [string]$EngineUser = "s4il0r",
    [string]$GitRef = "main",
    [switch]$SkipBuild,
    [switch]$ImportToEngine
)

$ErrorActionPreference = "Stop"
$BuildScript = Join-Path $PSScriptRoot "build-push-proof-explorer-image.ps1"
& $BuildScript @PSBoundParameters
