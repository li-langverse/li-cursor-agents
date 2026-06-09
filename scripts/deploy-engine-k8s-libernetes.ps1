# Deploy libernetes goal-directed workers with GitLab-primary git (org policy).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent

. (Join-Path $PSScriptRoot "sync-kubeconfig-from-beelink.ps1")
$synced = Sync-KubeconfigFromBeelink -Dest $KubeConfig
if ($synced) { $env:KUBECONFIG = $synced; $KubeConfig = $synced }

. (Join-Path $PSScriptRoot "lib\ghcr-env.ps1")
Load-LiSwarmEnvFiles -AgentsRoot $Root -WorkspaceRoot $Workspace

if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required (GHCR + github mirror)" }
if (-not $env:GITLAB_TOKEN) {
    Write-Error "GITLAB_TOKEN required for GitLab-primary git. Add to li/.env.local or beelink-cleanup/homelab-k3s/.env"
}

$workers = @(
    "libernetes-platform",
    "libernetes-licontainers",
    "libernetes-livm",
    "libernetes-control"
)

Write-Host "==> context: $(kubectl config current-context)"
kubectl apply -f (Join-Path $K8s "namespace.yaml")

$secretArgs = @(
    "create", "secret", "generic", "li-agents-secrets",
    "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
    "--from-literal=GITLAB_TOKEN=$($env:GITLAB_TOKEN)",
    "-n", $Namespace, "--dry-run=client", "-o", "yaml"
)
if ($env:GH_SWARM_TOKEN) { $secretArgs += "--from-literal=GH_SWARM_TOKEN=$($env:GH_SWARM_TOKEN)" }
elseif ($env:GH_TOKEN) { $secretArgs += "--from-literal=GH_SWARM_TOKEN=$($env:GH_TOKEN)" }
if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
kubectl @secretArgs | kubectl apply -f -
& (Join-Path $PSScriptRoot "org-ensure-swarm-secrets.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

function Convert-ShToLf {
    param([string]$SourcePath, [string]$DestPath)
    $content = [IO.File]::ReadAllText($SourcePath) -replace "`r`n", "`n" -replace "`r", "`n"
    [IO.File]::WriteAllText($DestPath, $content, [Text.UTF8Encoding]::new($false))
}

$bundleDir = Join-Path $env:TEMP "li-libernetes-git-bundle"
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
Convert-ShToLf -SourcePath (Join-Path $Root "deploy\proof-explorer-entrypoint.sh") -DestPath (Join-Path $bundleDir "entrypoint.sh")
Convert-ShToLf -SourcePath (Join-Path $Root "deploy\k8s-git-auth.sh") -DestPath (Join-Path $bundleDir "k8s-git-auth.sh")
Write-Host "==> apply li-libernetes-git-bundle (entrypoint + k8s-git-auth, LF)"
kubectl -n $Namespace create configmap li-libernetes-git-bundle `
    --from-file="$bundleDir" `
    --dry-run=client -o yaml | kubectl apply -f -

foreach ($w in $workers) {
    Write-Host "==> apply li-$w"
    kubectl apply -f (Join-Path $K8s "pvc-${w}-workspace.yaml")
    kubectl apply -f (Join-Path $K8s "configmap-${w}.yaml")
    kubectl apply -f (Join-Path $K8s "deployment-${w}.yaml")
    kubectl -n $Namespace rollout restart "deploy/li-${w}"
    kubectl -n $Namespace rollout status "deploy/li-${w}" --timeout=300s
}

Write-Host "Done. origin=gitlab.lilangverse.xyz/li-langverse (github=read-only mirror)"
foreach ($w in $workers) {
    Write-Host "  kubectl -n $Namespace logs -f deploy/li-${w}"
}
