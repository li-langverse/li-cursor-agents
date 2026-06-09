# Deploy li-db-studio-product goal worker (li-langverse GH_TOKEN in li-agents-secrets only).
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

foreach ($envFile in @(
        (Join-Path $Workspace ".env.github"),
        (Join-Path $Workspace "li-cursor-agents\.env")
    )) {
    if (-not (Test-Path $envFile)) { continue }
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            if ($k -in @('GH_TOKEN', 'GITHUB_TOKEN', 'CURSOR_API_KEY', 'CURSOR_SDK_KEY')) {
                $v = $matches[2].Trim()
                if (-not [string]::IsNullOrWhiteSpace($v)) { Set-Item -Path "env:$k" -Value $v }
            }
        }
    }
}

if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required from li/.env.github" }

$env:KUBECONFIG = $KubeConfig
Write-Host "==> deploy li-db-studio-product (li-langverse token -> li-agents-secrets)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
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

$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
kubectl @secretArgs | kubectl apply -f -

kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$env:GH_TOKEN `
    --dry-run=client -o yaml | kubectl apply -f -

kubectl -n $Namespace rollout restart deploy/li-db-studio-product 2>$null
kubectl -n $Namespace rollout status deploy/li-db-studio-product --timeout=180s

Write-Host "=== li-db-studio-product deployed ==="
Write-Host "  kubectl -n $Namespace logs deploy/li-db-studio-product -f"
