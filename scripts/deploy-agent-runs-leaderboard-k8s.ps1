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

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root

if (-not $env:CURSOR_API_KEY -and $env:CURSOR_SDK_KEY) { $env:CURSOR_API_KEY = $env:CURSOR_SDK_KEY }
if (-not $env:CURSOR_API_KEY) {
    Write-Error "CURSOR_API_KEY required for real SDK agent runs (see li-cursor-agents/.env.example)"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> npm run build (leaderboard daemon dist overlay)"
Push-Location $Root
npm run build
Pop-Location

$daemonOverlay = Join-Path $env:TEMP "li-agent-runs-leaderboard-daemon-overlay"
if (Test-Path $daemonOverlay) { Remove-Item -Recurse -Force $daemonOverlay }
New-Item -ItemType Directory -Force -Path (Join-Path $daemonOverlay "cli") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $daemonOverlay "agent-runs-leaderboard") | Out-Null
Copy-Item -Force (Join-Path $Root "dist\cli\agent-runs-leaderboard-daemon.js") (Join-Path $daemonOverlay "cli\")
Copy-Item -Force (Join-Path $Root "dist\agent-runs-leaderboard\*.js") (Join-Path $daemonOverlay "agent-runs-leaderboard\")

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
    -ExtraFiles $extra -DistOverlayDir $daemonOverlay

if ($env:GH_TOKEN) {
    Apply-K8sAgentsSecrets -Namespace $Namespace
} else {
    $secretArgs = @(
        "create", "secret", "generic", "li-agents-secrets",
        "-n", $Namespace, "--dry-run=client", "-o", "yaml"
    )
    if ($env:GITLAB_TOKEN) { $secretArgs += "--from-literal=GITLAB_TOKEN=$($env:GITLAB_TOKEN)" }
    if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
    if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
    kubectl @secretArgs | kubectl apply -f -
}

kubectl -n $Namespace rollout restart deploy/li-agent-runs-leaderboard 2>$null
kubectl -n $Namespace rollout status deploy/li-agent-runs-leaderboard --timeout=180s

Write-Host ""
Write-Host "=== li-agent-runs-leaderboard deployed (long-lived SDK session) ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-agent-runs-leaderboard -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-agent-runs-leaderboard --tail=80 -f"
Write-Host ""
Write-Host "Tune interval: kubectl -n $Namespace edit configmap li-agent-runs-leaderboard"
Write-Host "  LI_AGENT_RUNS_LEADERBOARD_LOOP_SLEEP_SEC (default 180)"
