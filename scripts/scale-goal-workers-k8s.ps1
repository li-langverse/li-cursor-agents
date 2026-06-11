# Scale homelab goal-directed workers (0 = stop, 1 = run).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [ValidateSet("0", "1")]
    [string]$Replicas = "0",
    [ValidateSet("all", "world-studio", "typography-fx", "li-toml", "proof-explorer", "li-parallel", "klaut-research-product", "klaut-research-ingest", "db-studio-product", "ph-ml-wave13", "lios-kernel")]
    [string]$Worker = "all"
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig

$map = @{
    "world-studio"      = "li-world-studio-gui-product-visual"
    "typography-fx"     = "li-world-studio-typography-fx-animation"
    "li-toml"           = "li-li-toml-config"
    "proof-explorer"    = "li-proof-explorer"
    "li-parallel"       = "li-li-parallel"
    "klaut-research-product" = "klaut-li-research-product"
    "klaut-research-ingest" = "klaut-research-ingest"
    "db-studio-product" = "li-db-studio-product"
    "ph-ml-wave13"      = "li-ph-ml-wave13"
    "lios-kernel"       = "li-lios-kernel"
}

$targets = if ($Worker -eq "all") { $map.Values } else { @($map[$Worker]) }

foreach ($deploy in $targets) {
    Write-Host "==> scale deployment/${deploy} replicas=${Replicas}"
    kubectl -n $Namespace scale "deployment/${deploy}" --replicas=$Replicas
}

kubectl -n $Namespace get pods -l 'app in (li-world-studio-gui-product-visual,li-world-studio-typography-fx-animation,li-li-toml-config,li-proof-explorer)'
