# Deploy klaut-li-research-product goal worker (klaut-pro GitHub — klaut-agents-secrets).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [ValidateSet("R1b", "R1")]
    [string]$Sprint = "R1b"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\klaut"
$BeelinkRoot = "C:\Users\Julian\Documents\Programming\beelink-cleanup"
$LiAgentsEnv = Join-Path $Root ".env"
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

$GoalName = if ($Sprint -eq "R1b") { "wp-klaut-li-research-r1b-product.md" } else { "wp-klaut-li-research-r1-product.md" }
$GoalSources = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals\$GoalName",
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals\$GoalName",
    (Join-Path $Root "data\goal-directed-sprints\$GoalName")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $GoalSources) {
    Write-Error "Goal file $GoalName not found under klaut.pro/goals"
}

$env:GH_TOKEN = $null
Get-Content (Join-Path $BeelinkRoot ".env") | ForEach-Object {
    if ($_ -match '^GH_TOKEN=(.+)$') { $env:GH_TOKEN = $Matches[1].Trim() }
}
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required from beelink-cleanup/.env" }
if (Test-Path $LiAgentsEnv) {
    Get-Content $LiAgentsEnv | ForEach-Object {
        if ($_ -match '^CURSOR_API_KEY=(.+)$') { $env:CURSOR_API_KEY = $Matches[1].Trim() }
    }
}

function Normalize-GoalFile([string]$Src) {
    $dest = Join-Path $env:TEMP ("$(Split-Path $Src -Leaf)-lf.md")
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($dest, ([System.IO.File]::ReadAllText($Src)).Replace("`r`n", "`n"), $utf8)
    return $dest
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> deploy klaut-li-research-product sprint=$Sprint (klaut-pro / klaut-agents-secrets)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path (Join-Path $Root "deploy\k8s\engine") "namespace.yaml")
kubectl apply -f (Join-Path (Join-Path $Root "deploy\k8s\engine") "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path (Join-Path $Root "deploy\k8s\engine") "configmap-goal-worker-runtime.yaml")
kubectl apply -f (Join-Path $K8s "configmap-klaut-li-research-product.yaml")
kubectl apply -f (Join-Path $K8s "deployment-klaut-li-research-product.yaml")

$goalFile = Normalize-GoalFile $GoalSources
$extra = @{
    "entrypoint.sh"                        = (Join-Path $Root "deploy\klaut\klaut-li-research-product-entrypoint.sh")
    "wp-klaut-li-research-r1b-product.md" = $goalFile
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "klaut-li-research-product-bundle" -ExtraFiles $extra

$secretArgs = @(
    "create", "secret", "generic", "klaut-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
kubectl @secretArgs | kubectl apply -f -

kubectl -n $Namespace delete deploy/li-research-product --ignore-not-found 2>$null
kubectl -n $Namespace scale deploy/klaut-li-research-product --replicas=1 2>$null
kubectl -n $Namespace rollout restart deploy/klaut-li-research-product 2>$null
kubectl -n $Namespace rollout status deploy/klaut-li-research-product --timeout=300s

Write-Host ""
Write-Host "=== klaut-li-research-product deployed ==="
Write-Host "  kubectl -n $Namespace logs deploy/klaut-li-research-product -f --tail=50"
