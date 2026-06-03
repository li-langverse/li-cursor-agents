# Scale homelab goal-directed workers (0 = stop, 1 = run).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [ValidateSet("0", "1")]
    [string]$Replicas = "0",
    [ValidateSet("all", "world-studio", "li-toml", "proof-explorer")]
    [string]$Worker = "all"
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig

$map = @{
    "world-studio"   = "li-world-studio-gui-product-visual"
    "li-toml"        = "li-li-toml-config"
    "proof-explorer" = "li-proof-explorer"
}

$targets = if ($Worker -eq "all") { $map.Values } else { @($map[$Worker]) }

foreach ($deploy in $targets) {
    Write-Host "==> scale deployment/${deploy} replicas=${Replicas}"
    kubectl -n $Namespace scale "deployment/${deploy}" --replicas=$Replicas
}

kubectl -n $Namespace get pods -l 'app in (li-world-studio-gui-product-visual,li-li-toml-config,li-proof-explorer)'
