# Build, push (or sideload to engine), and apply li-proof-explorer on homelab.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [string]$EngineHost = "192.168.10.32",
    [string]$EngineUser = "s4il0r",
    [string]$Image = "ghcr.io/li-langverse/li-cursor-agents:proof-explorer",
    [string]$GitRef = "main",
    [switch]$SkipBuild,
    [switch]$ImportToEngine,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent
$UseKanikoJob = $false

foreach ($envFile in @(
        (Join-Path $Workspace ".env.github"),
        (Join-Path $Workspace "li-cursor-agents\.env"),
        (Join-Path $Workspace ".env"),
        (Join-Path $Workspace "lic\.env")
    )) {
    if (-not (Test-Path $envFile)) { continue }
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            if ($k -in @('GH_TOKEN', 'GITHUB_TOKEN', 'CURSOR_API_KEY', 'CURSOR_SDK_KEY')) {
                Set-Item -Path "env:$k" -Value $matches[2].Trim()
            }
        }
    }
}

if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required (set or add to .env.github)" }

if (-not $SkipBuild) {
    Write-Host "==> docker build $Image"
    Push-Location $Root
    try {
        docker build -f deploy/Dockerfile.proof-explorer -t $Image . 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Local docker build failed (is Docker Desktop running?). Will use in-cluster Kaniko job."
            $script:UseKanikoJob = $true
        }
    } finally {
        Pop-Location
    }
} else {
    $script:UseKanikoJob = $true
}

$pushed = $false
if (-not $UseKanikoJob) {
    Write-Host "==> docker login ghcr.io"
    $env:GH_TOKEN | docker login ghcr.io -u "li-langverse" --password-stdin 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> docker push $Image"
        docker push $Image 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) { $pushed = $true }
    }
}

if (-not $pushed -and -not $ImportToEngine) {
    Write-Host "==> Image not pushed locally; will run Kaniko build job on engine after secrets apply"
    $script:UseKanikoJob = $true
}

if (-not $pushed -and $ImportToEngine) {
    Write-Host "==> ghcr push skipped; sideloading to engine $EngineUser@$EngineHost"
    $tar = Join-Path $env:TEMP "li-cursor-agents-proof-explorer.tar"
    docker save -o $tar $Image
    scp $tar "${EngineUser}@${EngineHost}:/tmp/li-cursor-agents-proof-explorer.tar"
    ssh "${EngineUser}@${EngineHost}" "sudo k3s ctr images import /tmp/li-cursor-agents-proof-explorer.tar && rm -f /tmp/li-cursor-agents-proof-explorer.tar"
    Remove-Item -Force $tar -ErrorAction SilentlyContinue
}

if ($SkipDeploy) {
    Write-Host "SkipDeploy set; image ready."
    exit 0
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply (namespace=$Namespace)"
kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "pvc-proof-explorer-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-proof-explorer.yaml")

$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
kubectl @secretArgs | kubectl apply -f -

# GHCR pull secret (same token; needs read:packages for private images)
kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$env:GH_TOKEN `
    --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f (Join-Path $K8s "deployment-proof-explorer.yaml")

if ($UseKanikoJob) {
    Write-Host "==> Kaniko build job (clone ref=$GitRef + push to ghcr.io)"
    kubectl -n $Namespace delete job build-proof-explorer-image --ignore-not-found
    $jobYaml = Get-Content (Join-Path $K8s "job-build-proof-explorer-image.yaml") -Raw
    $jobYaml = $jobYaml -replace 'value: "main"', "value: `"$GitRef`""
    $jobYaml | kubectl apply -f -
    kubectl -n $Namespace wait --for=condition=complete job/build-proof-explorer-image --timeout=900s
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Kaniko job did not complete - check: kubectl -n $Namespace logs job/build-proof-explorer-image -c kaniko"
    }
    kubectl -n $Namespace rollout restart deploy/li-proof-explorer
}

Write-Host ""
Write-Host "=== li-proof-explorer ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-proof-explorer -w"
Write-Host "  kubectl -n $Namespace logs -f deploy/li-proof-explorer -c proof-explorer"
Write-Host ""

kubectl -n $Namespace rollout status deploy/li-proof-explorer --timeout=600s
kubectl -n $Namespace get pods -l app=li-proof-explorer -o wide
