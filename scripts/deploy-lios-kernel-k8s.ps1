# Deploy li-lios-kernel goal-directed agent on homelab engine cluster.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

. (Join-Path $PSScriptRoot "lib\ghcr-env.ps1")
Load-LiSwarmEnvFiles -AgentsRoot $Root -WorkspaceRoot $Workspace

if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN -and $env:GH_SWARM_TOKEN) { $env:GH_TOKEN = $env:GH_SWARM_TOKEN }
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required (gh CLI / GHCR pull)" }
if (-not $env:GITLAB_TOKEN) { Write-Warning "GITLAB_TOKEN not set — worker will fall back to GitHub for git clone/push" }

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-lios-kernel (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "deployment-lios-kernel.yaml")

$goal = Join-Path $Root "data\goal-directed-sprints\lios-kernel-m1.md"
$state = Join-Path $Root "data\lios-kernel-loop\state.json"
$log = Join-Path $Root "data\lios-kernel-loop\iteration-log.md"
if (-not (Test-Path $state)) {
    '{"phase":"m1-complete"}' | Set-Content -Encoding utf8NoBOM $state
}
if (-not (Test-Path $log)) {
    @"
# lios-kernel loop

| iter | phase | gate | notes |
|------|-------|------|-------|
"@ | Set-Content -Encoding utf8NoBOM $log
}

$extra = @{
    "entrypoint.sh"       = (Join-Path $Root "deploy\lios-kernel-entrypoint.sh")
    "lios-kernel-m1.md"   = $goal
    "state.json"          = $state
    "iteration-log.md"    = $log
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-lios-kernel-bundle" -ExtraFiles $extra

kubectl apply -f (Join-Path $K8s "configmap-lios-kernel.yaml")

$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
if ($env:GITLAB_TOKEN) { $secretArgs += "--from-literal=GITLAB_TOKEN=$($env:GITLAB_TOKEN)" }
kubectl @secretArgs | kubectl apply -f -

& (Join-Path $PSScriptRoot "org-ensure-swarm-secrets.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$env:GH_TOKEN `
    --dry-run=client -o yaml | kubectl apply -f -

kubectl -n $Namespace rollout restart deploy/li-lios-kernel 2>$null
kubectl -n $Namespace scale deploy/li-lios-kernel --replicas=1
kubectl -n $Namespace rollout status deploy/li-lios-kernel --timeout=180s

Write-Host ""
Write-Host "=== li-lios-kernel deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-lios-kernel -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-lios-kernel --tail=80 -f"
