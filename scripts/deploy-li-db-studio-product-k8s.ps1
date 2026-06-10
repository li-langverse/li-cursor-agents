# Deploy li-db-studio-product goal worker (GITLAB_TOKEN + GH_TOKEN in li-agents-secrets).
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

$env:KUBECONFIG = $KubeConfig
Write-Host "==> deploy li-db-studio-product (GITLAB_TOKEN + GH_TOKEN -> li-agents-secrets)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path $K8s "configmap-k8s-git-auth.yaml")
kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "configmap-li-db-studio-product.yaml")
kubectl apply -f (Join-Path $K8s "deployment-li-db-studio-product.yaml")

$goalProductSrc = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals\wp-li-product.md",
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals\wp-li-product.md",
    (Join-Path $Root "data\goal-directed-sprints\wp-li-product.md")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $goalProductSrc) { Write-Error "wp-li-product.md not found in klaut.pro or data/goal-directed-sprints" }
$goalProduct = Join-Path $env:TEMP "wp-li-product-lf.md"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($goalProduct, ([System.IO.File]::ReadAllText($goalProductSrc)).Replace("`r`n", "`n"), $utf8)
$extra = @{
    "entrypoint.sh"    = (Join-Path $Root "deploy\li-db-studio-product-entrypoint.sh")
    "wp-li-product.md" = $goalProduct
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-db-studio-product-bundle" -ExtraFiles $extra

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl -n $Namespace rollout restart deploy/li-db-studio-product 2>$null
kubectl -n $Namespace rollout status deploy/li-db-studio-product --timeout=180s

Write-Host "=== li-db-studio-product deployed ==="
Write-Host "  kubectl -n $Namespace logs deploy/li-db-studio-product -f"
