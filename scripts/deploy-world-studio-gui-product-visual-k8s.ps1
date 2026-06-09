# Deploy li-world-studio-gui-product-visual goal-directed agent on homelab engine cluster.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root
Assert-K8sAgentsDeployTokens
if (-not $env:CURSOR_API_KEY -and -not $env:CURSOR_SDK_KEY) {
    Write-Warning "CURSOR_API_KEY not set - pod may fail agent runs"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-world-studio-gui-product-visual (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "pvc-world-studio-gui-product-visual-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-world-studio-gui-product-visual.yaml")
kubectl apply -f (Join-Path $K8s "deployment-world-studio-gui-product-visual.yaml")

$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\world-studio-gui-product-visual-entrypoint.sh")
}
. (Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1") `
    -Root $Root -Namespace $Namespace -ConfigMapName "li-world-studio-gui-product-visual-bundle" `
    -ExtraFiles $extra

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl -n $Namespace rollout restart deploy/li-world-studio-gui-product-visual 2>$null
kubectl -n $Namespace rollout status deploy/li-world-studio-gui-product-visual --timeout=180s

Write-Host ""
Write-Host "=== li-world-studio-gui-product-visual deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-world-studio-gui-product-visual -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-world-studio-gui-product-visual --tail=80 -f"
