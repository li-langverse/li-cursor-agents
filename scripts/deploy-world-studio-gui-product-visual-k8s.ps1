# Deploy li-world-studio-gui-product-visual goal-directed agent on homelab engine cluster.
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
            if ($k -in @('GH_TOKEN', 'GITHUB_TOKEN', 'CURSOR_API_KEY', 'CURSOR_SDK_KEY')) {
                $v = $matches[2].Trim()
                if (-not [string]::IsNullOrWhiteSpace($v)) {
                    Set-Item -Path "env:$k" -Value $v
                }
            }
        }
    }
}

if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required" }
if (-not $env:CURSOR_API_KEY -and -not $env:CURSOR_SDK_KEY) {
    Write-Warning "CURSOR_API_KEY not set - pod may fail agent runs"
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-world-studio-gui-product-visual (namespace=$Namespace)"

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "pvc-world-studio-gui-product-visual-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-world-studio-gui-product-visual.yaml")
kubectl apply -f (Join-Path $K8s "deployment-world-studio-gui-product-visual.yaml")

function Convert-ShToLf([string]$src, [string]$dest) {
    $text = (Get-Content -Raw $src) -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($dest, $text, (New-Object System.Text.UTF8Encoding $false))
}

$bundleDir = Join-Path $env:TEMP "li-ws-pv-bundle"
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
Convert-ShToLf (Join-Path $Root "deploy\world-studio-gui-product-visual-entrypoint.sh") (Join-Path $bundleDir "entrypoint.sh")
Convert-ShToLf (Join-Path $Root "scripts\goal-directed-loop.sh") (Join-Path $bundleDir "goal-directed-loop.sh")
Convert-ShToLf (Join-Path $Root "scripts\goal-loop-self-unblock.sh") (Join-Path $bundleDir "goal-loop-self-unblock.sh")
kubectl -n $Namespace create configmap li-world-studio-gui-product-visual-bundle `
    --from-file=$bundleDir `
    --dry-run=client -o yaml | kubectl apply -f -

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

kubectl -n $Namespace rollout restart deploy/li-world-studio-gui-product-visual 2>$null
kubectl -n $Namespace rollout status deploy/li-world-studio-gui-product-visual --timeout=180s

Write-Host ""
Write-Host "=== li-world-studio-gui-product-visual deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-world-studio-gui-product-visual -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-world-studio-gui-product-visual --tail=80 -f"
