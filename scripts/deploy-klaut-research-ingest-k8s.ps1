# Deploy klaut-research-ingest warm-index worker (klaut-pro — klaut-agents-secrets).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\klaut"
$BeelinkRoot = "C:\Users\Julian\Documents\Programming\beelink-cleanup"
$LiAgentsEnv = Join-Path $Root ".env"
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"
$GoalName = "wp-klaut-research-r1b-warm-ingest.md"
$GoalSources = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals\$GoalName",
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals\$GoalName"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $GoalSources) { Write-Error "Goal file $GoalName not found under klaut.pro/goals" }

$env:GH_TOKEN = gh auth token 2>$null
if (-not $env:GH_TOKEN) {
    Get-Content (Join-Path $BeelinkRoot ".env") | ForEach-Object {
        if ($_ -match '^GH_TOKEN=(.+)$') { $env:GH_TOKEN = $Matches[1].Trim() }
    }
}
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required (gh auth token or beelink-cleanup/.env)" }
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
Write-Host "==> deploy klaut-research-ingest (klaut-pro / klaut-agents-secrets)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path (Join-Path $Root "deploy\k8s\engine") "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path (Join-Path $Root "deploy\k8s\engine") "configmap-goal-worker-runtime.yaml")
kubectl apply -f (Join-Path $K8s "configmap-klaut-research-ingest.yaml")
kubectl apply -f (Join-Path $K8s "deployment-klaut-research-ingest.yaml")

$prevEa = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$oldS2 = kubectl -n $Namespace get secret li-research-s2-api-key -o jsonpath='{.data.s2-api-key}' 2>$null
$hasKlautS2 = kubectl -n $Namespace get secret klaut-research-s2-api-key 2>$null
$ErrorActionPreference = $prevEa
if ($oldS2 -and -not $hasKlautS2) {
    $plain = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($oldS2))
    kubectl create secret generic klaut-research-s2-api-key `
        --from-literal=s2-api-key=$plain -n $Namespace --dry-run=client -o yaml | kubectl apply -f -
} else {
    kubectl apply -f (Join-Path $K8s "secret-klaut-research-s2-api-key.yaml") 2>$null
}

$goalFile = Normalize-GoalFile $GoalSources
$extra = @{
    "entrypoint.sh"                           = (Join-Path $Root "deploy\klaut\klaut-research-ingest-entrypoint.sh")
    "wp-klaut-research-r1b-warm-ingest.md"    = $goalFile
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "klaut-research-ingest-bundle" -ExtraFiles $extra

$secretArgs = @(
    "create", "secret", "generic", "klaut-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
kubectl @secretArgs | kubectl apply -f -

kubectl -n $Namespace delete deploy/li-research-ingest --ignore-not-found 2>$null
kubectl -n $Namespace delete configmap li-research-ingest li-research-ingest-bundle --ignore-not-found 2>$null
kubectl -n $Namespace scale deploy/klaut-research-ingest --replicas=1 2>$null
kubectl -n $Namespace rollout restart deploy/klaut-research-ingest 2>$null
kubectl -n $Namespace rollout status deploy/klaut-research-ingest --timeout=300s

Write-Host ""
Write-Host "=== klaut-research-ingest deployed ==="
Write-Host "  kubectl -n $Namespace logs deploy/klaut-research-ingest -f --tail=50"
