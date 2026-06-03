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
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent

function Load-EnvFile([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim()
            if ($v) { Set-Item -Path "env:$k" -Value $v }
        }
    }
}

foreach ($envFile in @(
        (Join-Path $Workspace ".env"),
        (Join-Path $Workspace ".env.github"),
        (Join-Path $Root ".env")
    )) {
    Load-EnvFile $envFile
}

if (-not $env:GH_SWARM_TOKEN) { Write-Error "GH_SWARM_TOKEN required (set in li/.env)" }
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

    $loginToken = $env:GHCR_PUSH_TOKEN
    if (-not $loginToken) { $loginToken = $env:GH_TOKEN }
    if (-not $loginToken) { $loginToken = $env:GH_TOKEN_OVERVIEW_PAGE }
    if (-not $loginToken) { $loginToken = $env:GH_SWARM_TOKEN }
    if (-not $loginToken) { Write-Error "GHCR_PUSH_TOKEN (write:packages) or GH_TOKEN required for ghcr push" }
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

$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_SWARM_TOKEN=$($env:GH_SWARM_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
if ($env:SUPABASE_URL) { $secretArgs += "--from-literal=SUPABASE_URL=$($env:SUPABASE_URL)" }
if ($env:SUPABASE_SERVICE_ROLE_KEY) { $secretArgs += "--from-literal=SUPABASE_SERVICE_ROLE_KEY=$($env:SUPABASE_SERVICE_ROLE_KEY)" }
kubectl @secretArgs | kubectl apply -f -

$loginToken = $env:GH_SWARM_TOKEN
kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$loginToken `
    --dry-run=client -o yaml | kubectl apply -f -

$manifests = @(
    "rbac-org-issue-supervisor.yaml",
    "rbac-org-pr-supervisor.yaml",
    "rbac-org-research-supervisor.yaml",
    "configmap-org-issue-supervisor.yaml",
    "configmap-org-pr-supervisor.yaml",
    "configmap-org-reviewer-supervisor.yaml",
    "configmap-org-research-supervisor.yaml",
    "configmap-org-supervisor-dashboard.yaml",
    "deployment-org-issue-supervisor.yaml",
    "deployment-org-pr-supervisor.yaml",
    "deployment-org-reviewer-supervisor.yaml",
    "deployment-org-research-supervisor.yaml",
    "deployment-org-supervisor-dashboard.yaml",
    "deployment-org-issue-worker.yaml",
    "cronjob-org-issue-worker.yaml",
    "cronjob-org-issue-supervisor-wake.yaml",
    "cronjob-org-pr-supervisor-wake.yaml",
    "cronjob-org-reviewer-supervisor-wake.yaml",
    "cronjob-org-research-supervisor-wake.yaml",
    "service-org-supervisor-dashboard.yaml"
)
foreach ($m in $manifests) {
    $p = Join-Path $K8s $m
    if (Test-Path $p) { kubectl apply -f $p }
}

$deploys = @(
    "li-org-issue-supervisor",
    "li-org-pr-supervisor",
    "li-org-reviewer-supervisor",
    "li-org-research-supervisor",
    "li-org-supervisor-dashboard",
    "li-org-issue-worker"
)
foreach ($d in $deploys) {
    kubectl -n $Namespace rollout restart "deploy/$d" 2>$null
    kubectl -n $Namespace rollout status "deploy/$d" --timeout=180s 2>$null
}

Write-Host "==> org swarm deployed; image=$Image"

if (-not $SkipCleanup) {
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
