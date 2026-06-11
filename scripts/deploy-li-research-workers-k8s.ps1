# Deploy klaut homelab research worker on li-swarm (cap-jmk-launchpad). Ingest/product → deploy-klaut-research-*-k8s.ps1
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [ValidateSet("R1b", "R1")]
    [string]$Sprint = "R1b"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$BeelinkRoot = "C:\Users\Julian\Documents\Programming\beelink-cleanup"
$KlautProGoals = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals",
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals",
    (Join-Path $Root "data\goal-directed-sprints")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

function Normalize-GoalFile([string]$Src) {
    $dest = Join-Path $env:TEMP ("$(Split-Path $Src -Leaf)-lf.md")
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($dest, ([System.IO.File]::ReadAllText($Src)).Replace("`r`n", "`n"), $utf8)
    return $dest
}

$env:GH_TOKEN = $null
Get-Content (Join-Path $BeelinkRoot ".env") | ForEach-Object {
    if ($_ -match '^GH_TOKEN=(.+)$') { $env:GH_TOKEN = $Matches[1].Trim() }
}
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required from beelink-cleanup/.env for klaut worker" }
$LiAgentsEnv = Join-Path $Root ".env"
if (Test-Path $LiAgentsEnv) {
    Get-Content $LiAgentsEnv | ForEach-Object {
        if ($_ -match '^CURSOR_API_KEY=(.+)$') { $env:CURSOR_API_KEY = $Matches[1].Trim() }
    }
}

$GoalKlaut = if ($Sprint -eq "R1b") { "wp-li-research-r1b-klaut.md" } else { "wp-li-research-r1-klaut.md" }
$env:KUBECONFIG = $KubeConfig
Write-Host "==> deploy klaut homelab research worker sprint=$Sprint"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path $K8s "configmap-goal-worker-runtime.yaml")
kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")

Write-Host "==> li-research-klaut (homelab / cap-jmk-launchpad)"
kubectl apply -f (Join-Path $K8s "configmap-li-research-klaut.yaml")
kubectl apply -f (Join-Path $K8s "deployment-li-research-klaut.yaml")
$goalKlaut = Normalize-GoalFile (Join-Path $KlautProGoals $GoalKlaut)
$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\li-research-klaut-entrypoint.sh")
    $GoalKlaut      = $goalKlaut
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-research-klaut-bundle" -ExtraFiles $extra

$secretArgs = @(
    "create", "secret", "generic", "klaut-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
kubectl @secretArgs | kubectl apply -f -

kubectl -n $Namespace rollout restart deploy/li-research-klaut 2>$null
kubectl -n $Namespace scale deploy/li-research-klaut --replicas=1 2>$null
kubectl -n $Namespace rollout status deploy/li-research-klaut --timeout=300s

Write-Host ""
Write-Host "=== klaut homelab worker deployed ==="
Write-Host "  Product: .\scripts\deploy-klaut-li-research-product-k8s.ps1"
Write-Host "  Ingest:  .\scripts\deploy-klaut-research-ingest-k8s.ps1"
