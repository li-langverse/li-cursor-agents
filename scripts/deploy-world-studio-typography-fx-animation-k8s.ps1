# Deploy li-world-studio-typography-fx-animation goal-directed agent on homelab engine cluster.
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
if (-not $env:CURSOR_API_KEY -and -not $env:CURSOR_SDK_KEY) {
    Write-Warning "CURSOR_API_KEY not set - pod may fail agent runs"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-world-studio-typography-fx-animation (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "pvc-world-studio-typography-fx-animation-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-world-studio-typography-fx-animation.yaml")
kubectl apply -f (Join-Path $K8s "deployment-world-studio-typography-fx-animation.yaml")

$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\world-studio-typography-fx-animation-entrypoint.sh")
}
. (Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1") `
    -Root $Root -Namespace $Namespace -ConfigMapName "li-world-studio-typography-fx-animation-bundle" `
    -ExtraFiles $extra

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl -n $Namespace rollout restart deploy/li-world-studio-typography-fx-animation 2>$null
kubectl -n $Namespace rollout status deploy/li-world-studio-typography-fx-animation --timeout=180s

Write-Host ""
Write-Host "=== li-world-studio-typography-fx-animation deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-world-studio-typography-fx-animation -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-world-studio-typography-fx-animation --tail=80 -f"
Write-Host ""
Write-Host "Prerequisite: push studio goal/plan/gates to branch cursor/world-studio-typography-fx-animation before worker can pass gates."
