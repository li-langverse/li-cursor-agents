# Ensure a GitLab PAT in a K8s secret is valid. Reuses when API test passes.
# Revokes and mints only when the secret token is missing/invalid, then patches the secret
# in the same run — never revoke without updating the cluster secret.
param(
    [ValidateSet("GoalWorker", "Mirror")]
    [string]$Profile = "GoalWorker",
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$GitlabNamespace = "gitlab",
    [string]$GitlabPod = "gitlab-0",
    [string]$GitlabApiUrl = "https://gitlab.lilangverse.xyz",
    [switch]$SuspendMirrorCron
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig

$Profiles = @{
    GoalWorker = @{
        PatName    = "k8s-goal-worker-git"
        PatScopes  = "api,read_repository,write_repository"
        SecretName = "li-agents-secrets"
        MintScript = "_create_k8s_gitlab_pat.rb"
        CronJob    = $null
    }
    Mirror = @{
        PatName    = "gitlab-github-mirror-k8s"
        PatScopes  = "read_api,read_repository"
        SecretName = "gitlab-github-mirror-secrets"
        MintScript = "_create_k8s_gitlab_mirror_pat.rb"
        CronJob    = "gitlab-github-mirror"
    }
}

$cfg = $Profiles[$Profile]
$ScriptsDir = $PSScriptRoot
$PatOutPath = "/tmp/k8s-gitlab-pat-out"
$RailsMintPath = "/tmp/k8s-gitlab-pat-mint.rb"

function Get-SecretGitlabToken {
    param([string]$Secret)
    $b64 = kubectl -n $Namespace get secret $Secret -o jsonpath='{.data.GITLAB_TOKEN}' 2>$null
    if (-not $b64) { return $null }
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

function Test-GitlabPatApi {
    param([string]$Token)
    if (-not $Token) { return $false }
    try {
        $uri = "$GitlabApiUrl/api/v4/user"
        $resp = Invoke-WebRequest -Uri $uri -Headers @{ "PRIVATE-TOKEN" = $Token } -UseBasicParsing -TimeoutSec 20
        return $resp.StatusCode -eq 200
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
            return $false
        }
        throw
    }
}

function Patch-SecretGitlabToken {
    param([string]$Secret, [string]$Token)
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Token))
    $patchPath = Join-Path $env:TEMP "k8s-gitlab-pat-patch.json"
    (@{ data = @{ GITLAB_TOKEN = $b64 } } | ConvertTo-Json -Compress) | Set-Content $patchPath -NoNewline
    try {
        kubectl -n $Namespace patch secret $Secret --type=merge --patch-file $patchPath | Out-Null
    } finally {
        Remove-Item $patchPath -Force -ErrorAction SilentlyContinue
    }
}

function Set-MirrorCronSuspended {
    param([bool]$Suspended)
    if (-not $cfg.CronJob) { return }
    $val = if ($Suspended) { "true" } else { "false" }
    kubectl -n $Namespace patch cronjob $cfg.CronJob --type=merge -p "{`"spec`":{`"suspend`":$val}}" | Out-Null
}

$existing = Get-SecretGitlabToken -Secret $cfg.SecretName
if (Test-GitlabPatApi -Token $existing) {
    Write-Host "OK: $($cfg.PatName) token in $($cfg.SecretName) is valid (reused, no revoke)"
    exit 0
}

Write-Host "WARN: $($cfg.SecretName) GITLAB_TOKEN missing or invalid — minting $($cfg.PatName) and patching secret"

$cronWasSuspended = $false
if ($Profile -eq "Mirror" -and ($SuspendMirrorCron -or $cfg.CronJob)) {
    $suspendFlag = kubectl -n $Namespace get cronjob $cfg.CronJob -o jsonpath='{.spec.suspend}' 2>$null
    if ($suspendFlag -ne "true") {
        Write-Host "==> Suspending cronjob/$($cfg.CronJob) during PAT rotation"
        Set-MirrorCronSuspended -Suspended $true
        $cronWasSuspended = $true
    }
}

try {
    $mintLocal = Join-Path $ScriptsDir $cfg.MintScript
    $mintLib = Join-Path $ScriptsDir "_mint_k8s_gitlab_pat.rb"
    if (-not (Test-Path $mintLocal)) { throw "mint script not found: $mintLocal" }
    if (-not (Test-Path $mintLib)) { throw "mint lib not found: $mintLib" }
    $mintLibRemote = "/tmp/_mint_k8s_gitlab_pat.rb"
    Get-Content $mintLib -Raw | kubectl exec -i -n $GitlabNamespace $GitlabPod -- tee $mintLibRemote | Out-Null
    Get-Content $mintLocal -Raw | kubectl exec -i -n $GitlabNamespace $GitlabPod -- tee $RailsMintPath | Out-Null
    kubectl exec -n $GitlabNamespace $GitlabPod -- gitlab-rails runner "ENV['MINT_LIB']='$mintLibRemote'; load '$RailsMintPath'" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "gitlab-rails runner failed" }

    $newToken = (kubectl exec -n $GitlabNamespace $GitlabPod -- cat $PatOutPath 2>$null).Trim()
    kubectl exec -n $GitlabNamespace $GitlabPod -- sh -c "rm -f '$PatOutPath' '$RailsMintPath' '/tmp/_mint_k8s_gitlab_pat.rb'" 2>$null | Out-Null
    if (-not $newToken) { throw "mint produced empty token" }
    if (-not (Test-GitlabPatApi -Token $newToken)) { throw "minted token failed API test" }

    Patch-SecretGitlabToken -Secret $cfg.SecretName -Token $newToken
    Write-Host "OK: patched $($cfg.SecretName) with new $($cfg.PatName) token"
} finally {
    if ($cronWasSuspended) {
        Write-Host "==> Resuming cronjob/$($cfg.CronJob)"
        Set-MirrorCronSuspended -Suspended $false
    }
}
