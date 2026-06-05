# Deploy li-agent-runs-leaderboard perpetual heartbeat on homelab engine cluster.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent

foreach ($envFile in @(
        (Join-Path $Workspace ".env.github"),
        (Join-Path $Workspace "li-cursor-agents\.env"),
        (Join-Path $Workspace ".env")
    )) {
    if (-not (Test-Path $envFile)) { continue }
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            if ($k -in @('CURSOR_API_KEY', 'CURSOR_SDK_KEY', 'GH_TOKEN', 'GITHUB_TOKEN')) {
                $v = $matches[2].Trim()
                if (-not [string]::IsNullOrWhiteSpace($v)) {
                    Set-Item -Path "env:$k" -Value $v
                }
            }
        }
    }
}

if (-not $env:CURSOR_API_KEY -and $env:CURSOR_SDK_KEY) { $env:CURSOR_API_KEY = $env:CURSOR_SDK_KEY }
if (-not $env:CURSOR_API_KEY) {
    Write-Error "CURSOR_API_KEY required for real SDK agent runs (see li-cursor-agents/.env.example)"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-agent-runs-leaderboard (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-agent-runs-leaderboard.yaml")
kubectl apply -f (Join-Path $K8s "deployment-agent-runs-leaderboard.yaml")

$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\agent-runs-leaderboard-entrypoint.sh")
}
. (Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1") `
    -Root $Root -Namespace $Namespace -ConfigMapName "li-agent-runs-leaderboard-bundle" `
    -ExtraFiles $extra

$ghToken = if ($env:GH_TOKEN) { $env:GH_TOKEN } elseif ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { "unused" }
$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_TOKEN=$ghToken",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
kubectl @secretArgs | kubectl apply -f -

if ($env:GH_TOKEN) {
    kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
        --docker-server=ghcr.io `
        --docker-username=li-langverse `
        --docker-password=$env:GH_TOKEN `
        --dry-run=client -o yaml | kubectl apply -f -
}

kubectl -n $Namespace rollout restart deploy/li-agent-runs-leaderboard 2>$null
kubectl -n $Namespace rollout status deploy/li-agent-runs-leaderboard --timeout=180s

Write-Host ""
Write-Host "=== li-agent-runs-leaderboard deployed (forever heartbeat) ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-agent-runs-leaderboard -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-agent-runs-leaderboard --tail=80 -f"
Write-Host ""
Write-Host "Tune interval: kubectl -n $Namespace edit configmap li-agent-runs-leaderboard"
Write-Host "  LI_AGENT_RUNS_LEADERBOARD_LOOP_SLEEP_SEC (default 180)"
