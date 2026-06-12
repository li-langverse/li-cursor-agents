# Build proof-explorer-llvm22 on engine via Podman, sideload into k3s, optional ghcr push.
# Overlays local toolchain/entrypoint fixes onto git clone before build.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$Image = "ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22",
    [string]$GitRef = "main",
    [int]$WaitTimeoutSec = 2400,
    [switch]$RestartShards
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Workspace = Split-Path $Root -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root
if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN) { throw "GH_TOKEN required for ghcr push/login" }
if (-not $env:GITLAB_TOKEN) { throw "GITLAB_TOKEN required for in-cluster git clone" }

$env:KUBECONFIG = $KubeConfig

Write-Host "==> overlays configmap from local li-cursor-agents"
$overlayFiles = @(
    "deploy\scripts\ensure-llvm22-toolchain.sh",
    "deploy\proof-explorer-k8s-entrypoint.sh",
    "deploy\Dockerfile.proof-explorer"
)
$cmArgs = @("create", "configmap", "li-proof-explorer-build-overlays", "-n", $Namespace)
foreach ($rel in $overlayFiles) {
    $p = Join-Path $Root $rel
    if (-not (Test-Path $p)) { throw "missing overlay file $p" }
    $name = ($rel -replace '[/\\]', '__')
    $cmArgs += "--from-file=${name}=$p"
}
$cmArgs += "--dry-run=client", "-o", "yaml"
kubectl @cmArgs | kubectl apply -f -

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$env:GH_TOKEN `
    --dry-run=client -o yaml | kubectl apply -f -

Write-Host "==> delete prior build job (if any)"
kubectl -n $Namespace delete job build-proof-explorer-image --ignore-not-found --wait=true 2>$null

$jobPath = Join-Path $K8s "job-build-proof-explorer-image.yaml"
$jobYaml = Get-Content $jobPath -Raw
$jobYaml = $jobYaml -replace 'namespace: li-swarm', "namespace: $Namespace"
$jobYaml = $jobYaml -replace 'value: "main"', "value: `"$GitRef`""
$jobYaml = $jobYaml -replace 'ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22', $Image
$jobYaml | kubectl apply -f -

Write-Host "==> wait for build job (timeout ${WaitTimeoutSec}s)"
kubectl -n $Namespace wait --for=condition=complete job/build-proof-explorer-image --timeout="${WaitTimeoutSec}s"
if ($LASTEXITCODE -ne 0) {
    kubectl -n $Namespace logs job/build-proof-explorer-image -c git-clone --tail=40 2>$null
    kubectl -n $Namespace logs job/build-proof-explorer-image -c podman --tail=60 2>$null
    throw "build-proof-explorer-image job failed"
}

kubectl -n $Namespace logs job/build-proof-explorer-image -c podman --tail=20

if ($RestartShards) {
    Write-Host "==> restart proof-explorer shards"
    foreach ($i in 0..5) {
        kubectl -n $Namespace rollout restart "deploy/li-proof-explorer-shard-$i" 2>$null
    }
    kubectl -n $Namespace rollout restart deploy/li-proof-explorer-unblocker 2>$null
}

Write-Host ""
Write-Host "=== proof-explorer image built: $Image ==="
