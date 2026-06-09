# Build, push, and deploy org swarm stack on homelab engine cluster.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [string]$Image = "ghcr.io/li-langverse/li-cursor-agents:latest",
    [switch]$SkipBuild,
    [switch]$SkipCleanup,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\resolve-org-swarm-kubeconfig.ps1")
if (-not $SkipDeploy) {
    $KubeConfig = Ensure-OrgSwarmKubeconfig -Dest $KubeConfig
} else {
    . (Join-Path $PSScriptRoot "sync-kubeconfig-from-beelink.ps1")
    $synced = Sync-KubeconfigFromBeelink -Dest $KubeConfig
    if ($synced) { $env:KUBECONFIG = $synced; $KubeConfig = $synced }
}
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent

. (Join-Path $PSScriptRoot "lib\ghcr-env.ps1")
Load-LiSwarmEnvFiles -AgentsRoot $Root -WorkspaceRoot $Workspace

if (-not $env:CURSOR_API_KEY) { Write-Warning "CURSOR_API_KEY not set — implementer jobs may fail" }

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
$pushed = $false

if (-not $SkipBuild) {
    if (-not $cli) {
        Write-Error "podman or docker required for image build"
    }
    Write-Host "==> $cli build $Image"
    Push-Location $Root
    try {
        & $cli build -f deploy/Dockerfile -t $Image . 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "image build failed" }
    } finally {
        Pop-Location
    }

    $resolved = Resolve-GhcrPushToken
    if (-not $resolved) {
        Write-Error "Classic GHCR push token required (ghp_* with write:packages). Set GHCR_TOKEN or GHCR_PUSH_TOKEN in li/.env"
    }
    $loginToken = $resolved.Token
    Write-Host "==> ghcr push token from $($resolved.Source)"
    Write-Host "==> $cli login ghcr.io"
    $loginToken | & $cli login ghcr.io -u "li-langverse" --password-stdin 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "ghcr login failed" }

    Write-Host "==> $cli push $Image"
    & $cli push $Image 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "image push failed" }
    $pushed = $true
}

if ($SkipDeploy) {
    Write-Host "SkipDeploy — image ready: $Image (pushed=$pushed)"
    exit 0
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply org swarm manifests (namespace=$Namespace)"
kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path $K8s "namespace.yaml")

$swarmTok = $env:GH_SWARM_TOKEN
if (-not $swarmTok) { $swarmTok = $env:GH_TOKEN }
if (-not $swarmTok) { Write-Error "GH_SWARM_TOKEN required (set in li/.env)" }

$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_SWARM_TOKEN=$swarmTok",
    "--from-literal=GH_TOKEN=$swarmTok",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
if ($env:SUPABASE_URL) { $secretArgs += "--from-literal=SUPABASE_URL=$($env:SUPABASE_URL)" }
if ($env:SUPABASE_SERVICE_ROLE_KEY) { $secretArgs += "--from-literal=SUPABASE_SERVICE_ROLE_KEY=$($env:SUPABASE_SERVICE_ROLE_KEY)" }

if ($env:GH_SWARM_TOKEN_BACKUP) {
    $secretArgs += "--from-literal=GH_SWARM_TOKEN_BACKUP=$($env:GH_SWARM_TOKEN_BACKUP)"
} elseif ($env:GH_TOKEN_BACKUP) {
    $secretArgs += "--from-literal=GH_SWARM_TOKEN_BACKUP=$($env:GH_TOKEN_BACKUP)"
}
if ($env:GITLAB_TOKEN) {
    $secretArgs += "--from-literal=GITLAB_TOKEN=$($env:GITLAB_TOKEN)"
}
kubectl @secretArgs | kubectl apply -f -
Write-Host "==> ensure GH_SWARM_TOKEN + GH_TOKEN stay in sync"
& (Join-Path $PSScriptRoot "org-ensure-swarm-secrets.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

$loginToken = $env:GH_SWARM_TOKEN
kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$loginToken `
    --dry-run=client -o yaml | kubectl apply -f -

$manifests = @(
    "configmap.yaml",
    "rbac-org-issue-supervisor.yaml",
    "rbac-org-unblocker-supervisor.yaml",
    "rbac-org-pr-supervisor.yaml",
    "rbac-org-research-supervisor.yaml",
    "configmap-org-issue-supervisor.yaml",
    "configmap-org-issue-triage-supervisor.yaml",
    "configmap-org-unblocker-supervisor.yaml",
    "configmap-org-pr-supervisor.yaml",
    "configmap-org-reviewer-supervisor.yaml",
    "configmap-org-pr-merge-worker.yaml",
    "configmap-org-research-supervisor.yaml",
    "configmap-org-planner-supervisor.yaml",
    "configmap-org-supervisor-dashboard.yaml",
    "deployment-org-issue-supervisor.yaml",
    "deployment-org-issue-triage-supervisor.yaml",
    "deployment-org-unblocker-supervisor.yaml",
    "deployment-org-pr-supervisor.yaml",
    "deployment-org-reviewer-supervisor.yaml",
    "deployment-org-research-supervisor.yaml",
    "deployment-org-planner-supervisor.yaml",
    "deployment-org-supervisor-dashboard.yaml",
    "deployment-org-issue-worker.yaml",
    "deployment-org-pr-merge-worker.yaml",
    "cronjob-org-issue-worker.yaml",
    "cronjob-org-issue-supervisor-wake.yaml",
    "cronjob-org-issue-triage-supervisor-wake.yaml",
    "cronjob-org-unblocker-supervisor-wake.yaml",
    "cronjob-org-pr-supervisor-wake.yaml",
    "cronjob-org-reviewer-supervisor-wake.yaml",
    "cronjob-org-research-supervisor-wake.yaml",
    "service-org-supervisor-dashboard.yaml"
)
foreach ($m in $manifests) {
    $p = Join-Path $K8s $m
    if (Test-Path $p) { kubectl apply -f $p }
}

Write-Host "==> unsuspend org wake cronjobs + issue-worker cron"
$cronjobs = kubectl -n $Namespace get cronjob -o name 2>$null | ForEach-Object { $_ -replace "^cronjob\.batch/", "" }
$cronPatchFile = Join-Path $env:TEMP "li-org-cron-unsuspend.json"
[System.IO.File]::WriteAllText($cronPatchFile, '{"spec":{"suspend":false}}')
foreach ($cj in $cronjobs) {
    if ($cj -match "^li-org-") {
        kubectl -n $Namespace patch cronjob $cj --type=merge --patch-file $cronPatchFile 2>$null | Out-Null
    }
}

$deploys = @(
    "li-org-issue-supervisor",
    "li-org-issue-triage-supervisor",
    "li-org-unblocker-supervisor",
    "li-org-pr-supervisor",
    "li-org-reviewer-supervisor",
    "li-org-research-supervisor",
    "li-org-planner-supervisor",
    "li-org-supervisor-dashboard",
    "li-org-issue-worker",
    "li-org-pr-merge-worker"
)
foreach ($d in $deploys) {
    kubectl -n $Namespace rollout restart "deploy/$d" 2>$null
    kubectl -n $Namespace rollout status "deploy/$d" --timeout=180s 2>$null
}

Write-Host "==> org swarm deployed; image=$Image"

Write-Host "==> ensure swarm secrets after rollout"
& (Join-Path $PSScriptRoot "org-ensure-swarm-secrets.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

Write-Host "==> clear issue failure skip cooldowns"
& (Join-Path $PSScriptRoot "org-clear-issue-skip.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

if (-not $SkipCleanup) {
    Write-Host "==> cleanup failed/stuck k8s jobs"
    & (Join-Path $PSScriptRoot "org-cleanup-failed-k8s-jobs.ps1") -KubeConfig $KubeConfig -Namespace $Namespace -IncludeStuckActive

    Write-Host "==> duplicate PR cleanup (GH_SWARM_TOKEN)"
    $env:GH_SWARM_TOKEN = $env:GH_SWARM_TOKEN
    Push-Location $Root
    try {
        python scripts/org-close-duplicate-prs.py --preset studio-w0-dupes --sleep 2
        python scripts/org-close-duplicate-prs.py --preset lic-phml-dupes --sleep 2
    } finally {
        Pop-Location
    }
}

Write-Host "Done."
