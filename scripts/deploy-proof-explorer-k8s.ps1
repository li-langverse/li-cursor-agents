# Deploy li-proof-explorer goal-directed agent on homelab engine cluster.
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

if (-not $env:CURSOR_API_KEY -and -not $env:CURSOR_SDK_KEY) {
    Write-Warning "CURSOR_API_KEY not set - pod may fail agent runs"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-proof-explorer (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "pvc-proof-explorer-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-proof-explorer.yaml")
kubectl apply -f (Join-Path $K8s "deployment-proof-explorer.yaml")

$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\proof-explorer-k8s-entrypoint.sh")
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-proof-explorer-bundle" -ExtraFiles $extra

Apply-K8sAgentsSecrets -Namespace $Namespace

kubectl -n $Namespace rollout restart deploy/li-proof-explorer 2>$null
kubectl -n $Namespace rollout status deploy/li-proof-explorer --timeout=180s

Write-Host ""
Write-Host "=== li-proof-explorer deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-proof-explorer -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-proof-explorer --tail=80 -f"
