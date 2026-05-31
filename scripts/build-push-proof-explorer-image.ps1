# Build with Podman, push (or sideload to engine), and apply li-proof-explorer on homelab.
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
$UsePodmanJob = $false

function Resolve-ContainerCli {
    if (Get-Command podman -ErrorAction SilentlyContinue) {
        try {
            podman info 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { return "podman" }
        } catch { }
    }
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        try {
            docker info 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { return "docker" }
        } catch { }
    }
    return $null
}

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

$cli = Resolve-ContainerCli

if (-not $SkipBuild) {
    if (-not $cli) {
        Write-Warning "Local podman/docker unavailable. Will use in-cluster Podman job on engine."
        $UsePodmanJob = $true
    } else {
        Write-Host "==> $cli build $Image"
        Push-Location $Root
        try {
            & $cli build -f deploy/Dockerfile.proof-explorer -t $Image . 2>&1 | Out-Host
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Local $cli build failed. Will use in-cluster Podman job."
                $UsePodmanJob = $true
            }
        } finally {
            Pop-Location
        }
    }
} else {
    $UsePodmanJob = $true
}

$pushed = $false
if (-not $UsePodmanJob -and $cli) {
    Write-Host "==> $cli login ghcr.io"
    $env:GH_TOKEN | & $cli login ghcr.io -u "li-langverse" --password-stdin 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> $cli push $Image"
        & $cli push $Image 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) { $pushed = $true }
    }
}

if (-not $pushed -and -not $ImportToEngine) {
    Write-Host "==> Image not pushed locally; will run Podman build job on engine after secrets apply"
    $UsePodmanJob = $true
}

if (-not $pushed -and $ImportToEngine -and $cli) {
    Write-Host "==> ghcr push skipped; sideloading to engine $EngineUser@$EngineHost via $cli"
    $tar = Join-Path $env:TEMP "li-cursor-agents-proof-explorer.tar"
    & $cli save -o $tar $Image
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

kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$env:GH_TOKEN `
    --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f (Join-Path $K8s "deployment-proof-explorer.yaml")

if ($UsePodmanJob) {
    Write-Host "==> Podman build job (clone ref=$GitRef + push to ghcr.io)"
    kubectl -n $Namespace delete job build-proof-explorer-image --ignore-not-found
    $jobYaml = Get-Content (Join-Path $K8s "job-build-proof-explorer-image.yaml") -Raw
    $jobYaml = $jobYaml -replace 'value: "main"', "value: `"$GitRef`""
    $jobYaml | kubectl apply -f -
    kubectl -n $Namespace wait --for=condition=complete job/build-proof-explorer-image --timeout=1800s
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Podman job did not complete - check: kubectl -n $Namespace logs job/build-proof-explorer-image -c podman"
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
