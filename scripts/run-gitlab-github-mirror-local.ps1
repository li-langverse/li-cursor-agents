# Run GitLab → GitHub mirror locally (GitLab is source of truth; updates GitHub only).
param(
    [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $WorkspaceRoot

$official = $env:GH_MIRROR_TOKEN
if (-not $official) { $official = $env:GH_TOKEN }
$backup = $env:GITHUB_BACKUP_TOKEN
if (-not $backup) { $backup = $env:BACKUP_GH_TOKEN }
if (-not $backup) { $backup = $official }

if (-not $env:GITLAB_TOKEN) { throw "GITLAB_TOKEN required (li/.env.gitlab or .env.local)" }
if (-not $official) { throw "GH_MIRROR_TOKEN or GH_TOKEN required for GITHUB_OFFICIAL_TOKEN" }

$mirrorRoot = Join-Path $WorkspaceRoot "gitlab-github-mirror"
if (-not (Test-Path (Join-Path $mirrorRoot "scripts\mirror-all.sh"))) {
    throw "gitlab-github-mirror checkout not found at $mirrorRoot"
}

$env:GITHUB_OFFICIAL_TOKEN = $official
$env:GITHUB_BACKUP_TOKEN = $backup
$env:GITLAB_HOST = "gitlab.lilangverse.xyz"
$env:GITLAB_API_URL = if ($env:GITLAB_API_URL) { $env:GITLAB_API_URL } else { "https://gitlab.lilangverse.xyz" }
$env:GITLAB_GIT_SCHEME = "https"
$env:WORK_DIR = Join-Path $env:TEMP "git-mirror-work"
New-Item -ItemType Directory -Force -Path $env:WORK_DIR | Out-Null

Write-Host "==> mirror-all.sh (GitLab primary -> GitHub mirror)"
Push-Location $mirrorRoot
try {
    bash scripts/mirror-all.sh
    if ($LASTEXITCODE -ne 0) { throw "mirror-all.sh failed with exit $LASTEXITCODE" }
} finally {
    Pop-Location
}

Write-Host "==> done. Verify with .\scripts\assert-gitlab-primary.ps1"
