# Deploy li-li-toml-config goal-directed agent on homelab engine cluster.
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

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root
Assert-K8sAgentsDeployTokens
if (-not $env:CURSOR_API_KEY -and -not $env:CURSOR_SDK_KEY) {
    Write-Warning "CURSOR_API_KEY not set - pod may fail agent runs"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-li-toml-config (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "configmap-li-toml-config.yaml")
kubectl apply -f (Join-Path $K8s "deployment-li-toml-config.yaml")

$goal = Join-Path $Root "data\goal-directed-sprints\li-toml-config-migration.md"
$state = Join-Path $Root "data\li-toml-config-loop\state.json"
$log = Join-Path $Root "data\li-toml-config-loop\iteration-log.md"
if (-not (Test-Path $state)) {
    $stateDir = Split-Path $state -Parent
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    '{"phase":"phase-0-prep"}' | Set-Content -Encoding utf8 $state
}
if (-not (Test-Path $log)) {
    "# li-toml config loop`n" | Set-Content -Encoding utf8 $log
}

$extra = @{
    "entrypoint.sh"                 = (Join-Path $Root "deploy\li-toml-config-entrypoint.sh")
    "li-toml-config-migration.md"   = $goal
    "state.json"                    = $state
    "iteration-log.md"              = $log
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-li-toml-config-bundle" -ExtraFiles $extra

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl -n $Namespace rollout restart deploy/li-li-toml-config 2>$null
kubectl -n $Namespace rollout status deploy/li-li-toml-config --timeout=180s

Write-Host ""
Write-Host "=== li-li-toml-config deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-li-toml-config -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-li-toml-config --tail=80 -f"
