# Build and push ghcr.io/li-langverse/li-cursor-agents:latest (org swarm worker image).
# Easiest when local PAT lacks write:packages: use publish-org-image-via-actions.ps1 instead.
param(
    [string]$Image = "ghcr.io/li-langverse/li-cursor-agents:latest",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Workspace = Split-Path $Root -Parent

function Load-EnvFile([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim().Trim('"')
            if ($v) { Set-Item -Path "env:$k" -Value $v }
        }
    }
}

foreach ($envFile in @(
        (Join-Path $Workspace ".env.github"),
        (Join-Path $Workspace ".env"),
        (Join-Path $Root ".env")
    )) {
    Load-EnvFile $envFile
}

$pushToken = $env:GHCR_PUSH_TOKEN
if (-not $pushToken) { $pushToken = $env:GH_TOKEN }
if (-not $pushToken) { $pushToken = $env:GH_TOKEN_OVERVIEW_PAGE }
if (-not $pushToken) { $pushToken = $env:GH_SWARM_TOKEN }
if (-not $pushToken) {
    Write-Error @"
No push token found. Add to li/.env.github:

  GHCR_PUSH_TOKEN=ghp_...   # classic PAT with write:packages only

Or run: .\scripts\publish-org-image-via-actions.ps1
"@
}

function Resolve-ContainerCli {
    foreach ($cmd in @("podman", "docker")) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) {
            try {
                & $cmd info 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) { return $cmd }
            } catch { }
        }
    }
    return $null
}

$cli = Resolve-ContainerCli
if (-not $cli) { Write-Error "podman or docker required (start Docker Desktop or podman machine)" }

if (-not $SkipBuild) {
    Write-Host "==> $cli build -f deploy/Dockerfile -t $Image"
    Push-Location $Root
    try {
        & $cli build -f deploy/Dockerfile -t $Image . 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "image build failed" }
    } finally {
        Pop-Location
    }
}

Write-Host "==> $cli login ghcr.io (user li-langverse)"
$pushToken | & $cli login ghcr.io -u "li-langverse" --password-stdin 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "ghcr login failed" }

Write-Host "==> $cli push $Image"
& $cli push $Image 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Error @"
Push failed (permission_denied usually means missing write:packages on the PAT).

Fix (pick one):
  1. GitHub → Settings → Developer settings → PAT (classic) → enable write:packages
     Save as GHCR_PUSH_TOKEN in li/.env.github, re-run this script.
  2. Actions UI: li-langverse/li-cursor-agents → Publish org-issue worker image → Run workflow
  3. .\scripts\publish-org-image-via-actions.ps1 -Ref main
"@
}

Write-Host "OK pushed $Image"
