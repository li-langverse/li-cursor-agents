# Free engine memory for GitLab / hosting headroom (scale li-swarm + suspend org wake cronjobs).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$Node = "engine",
    [switch]$ApplyManifests,
    [string]$RepoRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig
$K8s = Join-Path $RepoRoot "deploy\k8s\engine"
$Klaut = Join-Path $RepoRoot "deploy\k8s\klaut"

function Get-NodeMemoryRequestsMi {
    param([string]$NodeName)
    $pods = kubectl get pods -A --field-selector "spec.nodeName=$NodeName" -o json | ConvertFrom-Json
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

$before = Get-NodeMemoryRequestsMi -NodeName $Node
Write-Host "==> engine memory requests (Running+Pending pods): ${before}Mi"

if ($ApplyManifests) {
    Write-Host "==> kubectl apply gitlab-headroom manifests"
    Get-ChildItem $K8s -Filter "deployment-*.yaml" | ForEach-Object { kubectl apply -f $_.FullName | Out-Null }
    kubectl apply -f (Join-Path $Klaut "deployment-klaut-li-research-product.yaml") | Out-Null
    Get-ChildItem $K8s -Filter "cronjob-org*.yaml" | ForEach-Object { kubectl apply -f $_.FullName | Out-Null }
} else {
    & (Join-Path $PSScriptRoot "rebalance-engine-goal-workers.ps1") -KubeConfig $KubeConfig -Mode FreeMemory -SkipScaleUp
    $orgDeploys = @(
        "li-org-ga-supervisor","li-org-issue-supervisor","li-org-issue-triage-supervisor","li-org-issue-worker",
        "li-org-planner-supervisor","li-org-pr-merge-worker","li-org-pr-supervisor","li-org-research-supervisor",
        "li-org-reviewer-supervisor","li-org-supervisor-dashboard","li-org-unblocker-supervisor",
        "li-agent-runs-leaderboard","li-li-parallel","li-lios-kernel","li-research-ingest","li-ph-ml-wave13",
        "li-proof-explorer","li-pure-li-https","klaut-li-research-product"
    )
    foreach ($d in $orgDeploys) {
        kubectl -n $Namespace scale "deploy/$d" --replicas=0 2>$null | Out-Null
    }
    $cronPatch = '{"spec":{"suspend":true}}'
    Get-ChildItem $K8s -Filter "cronjob-org*.yaml" | ForEach-Object {
        $name = (Select-String -Path $_.FullName -Pattern 'name:\s+(\S+)' | Select-Object -First 1).Matches.Groups[1].Value
        if ($name) { kubectl -n $Namespace patch cronjob $name --type=merge -p $cronPatch | Out-Null }
    }
}

Start-Sleep -Seconds 8
$after = Get-NodeMemoryRequestsMi -NodeName $Node
$freed = $before - $after
Write-Host "==> after: ${after}Mi (freed ~${freed}Mi pod-request sum on $Node)"
kubectl describe node $Node | Select-String "memory\s+\d+"
