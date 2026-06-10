# Keep li-agents-secrets keys in sync (GH_SWARM_TOKEN <-> GH_TOKEN).
param(
    [string]$Namespace = "li-swarm",
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab"
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig

$ScriptsRoot = Split-Path $PSScriptRoot -Parent
$AgentsRoot = Split-Path $ScriptsRoot -Parent
$WorkspaceRoot = Split-Path $AgentsRoot -Parent
. (Join-Path $PSScriptRoot "lib\ghcr-env.ps1")
Load-LiSwarmEnvFiles -AgentsRoot $AgentsRoot -WorkspaceRoot $WorkspaceRoot

if (-not (kubectl get secret li-agents-secrets -n $Namespace 2>$null)) {
    Write-Host "li-agents-secrets missing in $Namespace (skip ensure)"
    exit 0
}

$gh = kubectl -n $Namespace get secret li-agents-secrets -o jsonpath='{.data.GH_TOKEN}' 2>$null
$swarm = kubectl -n $Namespace get secret li-agents-secrets -o jsonpath='{.data.GH_SWARM_TOKEN}' 2>$null

$patch = @{}
if ($gh -and -not $swarm) {
    $patch["GH_SWARM_TOKEN"] = $gh
    Write-Host "Patching GH_SWARM_TOKEN from GH_TOKEN"
}
if ($swarm -and -not $gh) {
    $patch["GH_TOKEN"] = $swarm
    Write-Host "Patching GH_TOKEN from GH_SWARM_TOKEN"
}

if ($patch.Count -gt 0) {
    $data = @{}
    foreach ($k in $patch.Keys) { $data[$k] = $patch[$k] }
    $json = @{ data = $data } | ConvertTo-Json -Compress
    $tmp = Join-Path $env:TEMP "li-agents-secrets-patch.json"
    [System.IO.File]::WriteAllText($tmp, $json)
    kubectl -n $Namespace patch secret li-agents-secrets --type=merge --patch-file $tmp
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Write-Host "li-agents-secrets patched in $Namespace"
} else {
    Write-Host "li-agents-secrets OK (GH_TOKEN + GH_SWARM_TOKEN present)"
}

$resolvedBackup = Resolve-GitHubBackupTokenFromEnv
if ($resolvedBackup) {
    Write-Host "GitHub backup token from $($resolvedBackup.Source)"
}

$backup = kubectl -n $Namespace get secret li-agents-secrets -o jsonpath='{.data.GH_SWARM_TOKEN_BACKUP}' 2>$null
if (-not $backup -and $env:GH_SWARM_TOKEN_BACKUP) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:GH_SWARM_TOKEN_BACKUP))
    $patchBackup = @{ data = @{ GH_SWARM_TOKEN_BACKUP = $b64 } } | ConvertTo-Json -Compress
    $tmp2 = Join-Path $env:TEMP "li-agents-secrets-backup.json"
    [System.IO.File]::WriteAllText($tmp2, $patchBackup)
    kubectl -n $Namespace patch secret li-agents-secrets --type=merge --patch-file $tmp2
    Remove-Item $tmp2 -Force -ErrorAction SilentlyContinue
    Write-Host "Patched GH_SWARM_TOKEN_BACKUP from local env"
} elseif ($backup) {
    Write-Host "li-agents-secrets OK (GH_SWARM_TOKEN_BACKUP present)"
}

$gitlabB64 = kubectl -n $Namespace get secret li-agents-secrets -o jsonpath='{.data.GITLAB_TOKEN}' 2>$null
$gitlabPatched = $false
if ($env:GITLAB_TOKEN) {
    $wantB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:GITLAB_TOKEN))
    if (-not $gitlabB64 -or $gitlabB64 -ne $wantB64) {
        $patchGitlab = @{ data = @{ GITLAB_TOKEN = $wantB64 } } | ConvertTo-Json -Compress
        $tmp3 = Join-Path $env:TEMP "li-agents-secrets-gitlab.json"
        [System.IO.File]::WriteAllText($tmp3, $patchGitlab)
        kubectl -n $Namespace patch secret li-agents-secrets --type=merge --patch-file $tmp3
        Remove-Item $tmp3 -Force -ErrorAction SilentlyContinue
        Write-Host "Patched GITLAB_TOKEN from local env (sync/rotate)"
        $gitlabPatched = $true
    } else {
        Write-Host "li-agents-secrets OK (GITLAB_TOKEN matches local env)"
    }
} elseif ($gitlabB64) {
    Write-Host "li-agents-secrets OK (GITLAB_TOKEN present; no local env to compare)"
} else {
    Write-Host "WARN: GITLAB_TOKEN missing in secret and local env"
}

if ($gitlabPatched) {
    foreach ($deploy in @(
            "li-org-issue-worker",
            "li-org-issue-supervisor",
            "li-org-issue-triage-supervisor",
            "li-org-pr-supervisor",
            "li-lios-kernel"
        )) {
        kubectl -n $Namespace rollout restart deploy/$deploy 2>$null
    }
    Write-Host "Restarted org swarm deploys for GITLAB_TOKEN pickup"
}