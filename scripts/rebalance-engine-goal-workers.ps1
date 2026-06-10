# Rebalance goal-directed workers on the engine node to stay within memory request budget.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$Node = "engine",
    [int]$MemoryRequestBudgetMi = 52000,
    [ValidateSet("Rebalance", "FreeMemory", "Status")]
    [string]$Mode = "Rebalance",
    [switch]$SkipScaleUp
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig

# Lower priority: demo, complete sprints, libernetes aux — scale down first when engine is full.
$IdleWhenPressure = @(
    "li-proof-explorer",
    "li-world-studio-gui-demo-recorder",
    "li-world-studio-typography-fx-animation",
    "li-world-studio-aimd-demo",
    "li-world-studio-gui-product-visual",
    "li-ph-sci-electrochemistry",
    "li-ph-sci-simulation-gap-close",
    "li-ph-sci-gap-close-phase2",
    "li-physics-codegen-matrix",
    "li-container-separate-repos",
    "li-libernetes-control",
    "li-libernetes-licontainers",
    "li-libernetes-livm",
    "li-libernetes-platform",
    "li-ph-br-0-lib-browser",
    "li-pure-li-https",
    "li-benchmark-nightly-green"
)

# Active sprints — prefer running after rebalance.
$PriorityActive = @(
    "li-li-parallel",
    "li-ph-ml-wave13",
    "li-research-ingest",
    "li-research-product",
    "li-db-studio-product",
    "li-lios-kernel",
    "li-li-toml-config"
)

function Get-EngineMemoryRequestsMi {
    param([string]$NodeName, [string]$Ns)
    $pods = kubectl get pods -n $Ns --field-selector "spec.nodeName=$NodeName" -o json | ConvertFrom-Json
    $total = 0
    foreach ($pod in $pods.items) {
        if ($pod.status.phase -notin @("Running", "Pending")) { continue }
        foreach ($c in $pod.spec.containers) {
            $mem = $c.resources.requests.memory
            if (-not $mem) { continue }
            if ($mem -match '^(\d+)Gi$') { $total += [int]$Matches[1] * 1024 }
            elseif ($mem -match '^(\d+)Mi$') { $total += [int]$Matches[1] }
        }
    }
    return $total
}

function Set-DeployReplicas {
    param([string]$Name, [int]$Replicas)
    $cur = kubectl -n $Namespace get deploy $Name -o jsonpath='{.spec.replicas}' 2>$null
    if ($LASTEXITCODE -ne 0) { return }
    if ([string]$cur -eq [string]$Replicas) { return }
    Write-Host "==> scale deploy/$Name replicas=$Replicas (was $cur)"
    kubectl -n $Namespace scale "deploy/$Name" --replicas=$Replicas | Out-Null
}

$usedMi = Get-EngineMemoryRequestsMi -NodeName $Node -Ns $Namespace
Write-Host "==> engine node $Node memory requests: ${usedMi}Mi / budget ${MemoryRequestBudgetMi}Mi"

if ($Mode -eq "Status") {
    kubectl -n $Namespace get deploy -l app.kubernetes.io/component=goal-directed-agent `
        -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,REPLICAS:.spec.replicas
    exit 0
}

if ($usedMi -ge $MemoryRequestBudgetMi -or $Mode -eq "FreeMemory") {
    Write-Host "==> scaling down idle/demo goal workers on $Node"
    foreach ($d in $IdleWhenPressure) {
        Set-DeployReplicas -Name $d -Replicas 0
    }
    Start-Sleep -Seconds 3
    $usedMi = Get-EngineMemoryRequestsMi -NodeName $Node -Ns $Namespace
    Write-Host "==> after scale-down: ${usedMi}Mi requested on $Node"
}

if (-not $SkipScaleUp -and $Mode -eq "Rebalance") {
    Write-Host "==> ensuring priority workers are scaled up"
    foreach ($d in $PriorityActive) {
        Set-DeployReplicas -Name $d -Replicas 1
    }
}

Write-Host ""
kubectl -n $Namespace get deploy -l app.kubernetes.io/component=goal-directed-agent `
    -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,REPLICAS:.spec.replicas
