# Deploy li-db-studio-klaut goal worker (cap-jmk GH_TOKEN in klaut-agents-secrets only).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$BeelinkRoot = "C:\Users\Julian\Documents\Programming\beelink-cleanup"
$LiAgentsEnv = Join-Path (Split-Path $Root -Parent) "li-cursor-agents\.env"
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

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

$env:KUBECONFIG = $KubeConfig
Write-Host "==> deploy li-db-studio-klaut (cap-jmk token -> klaut-agents-secrets)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "configmap-li-db-studio-klaut.yaml")
kubectl apply -f (Join-Path $K8s "deployment-li-db-studio-klaut.yaml")

$goalKlautSrc = "C:\Users\Julian\Documents\Programming\klaut.pro\goals\wp-klaut-homelab.md"
if (-not (Test-Path $goalKlautSrc)) {
    $goalKlautSrc = Join-Path $Root "data\goal-directed-sprints\wp-klaut-homelab.md"
}
$goalKlaut = Join-Path $env:TEMP "wp-klaut-homelab-lf.md"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($goalKlaut, ([System.IO.File]::ReadAllText($goalKlautSrc)).Replace("`r`n", "`n"), $utf8)
$extra = @{
    "entrypoint.sh"       = (Join-Path $Root "deploy\li-db-studio-klaut-entrypoint.sh")
    "wp-klaut-homelab.md" = $goalKlaut
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-db-studio-klaut-bundle" -ExtraFiles $extra

$secretArgs = @(
    "create", "secret", "generic", "klaut-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
kubectl @secretArgs | kubectl apply -f -

kubectl -n $Namespace rollout restart deploy/li-db-studio-klaut 2>$null
kubectl -n $Namespace rollout status deploy/li-db-studio-klaut --timeout=180s

Write-Host "=== li-db-studio-klaut deployed ==="
Write-Host "  kubectl -n $Namespace logs deploy/li-db-studio-klaut -f"
