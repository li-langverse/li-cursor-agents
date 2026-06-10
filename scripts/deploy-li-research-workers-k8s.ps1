# Deploy all three li-research goal-directed workers on li-swarm (engine).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [ValidateSet("R1b", "R1")]
    [string]$Sprint = "R1b",
    [switch]$SkipProduct,
    [switch]$SkipKlaut,
    [switch]$SkipIngest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$LiRoot = Split-Path $Root -Parent
. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
$BeelinkRoot = "C:\Users\Julian\Documents\Programming\beelink-cleanup"
$KlautProGoals = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals",
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals",
    "C:\Users\Julian\Documents\Programming\lauchpad\klaut-pro\goals"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $KlautProGoals) {
    $KlautProGoals = Join-Path $Root "data\goal-directed-sprints"
}
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

function Normalize-GoalFile([string]$Src) {
    $dest = Join-Path $env:TEMP ("$(Split-Path $Src -Leaf)-lf.md")
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($dest, ([System.IO.File]::ReadAllText($Src)).Replace("`r`n", "`n"), $utf8)
    return $dest
}

# li-langverse: always load from li/ tree — never reuse cap-jmk token from a prior step.
function Load-LiLangverseEnv {
    $env:GH_TOKEN = $null
    $env:GITHUB_TOKEN = $null
    $env:GITLAB_TOKEN = $null
    Load-K8sAgentsEnv -WorkspaceRoot $LiRoot -AgentsRoot $Root
    Assert-K8sAgentsDeployTokens
}

function Apply-LiAgentsSecrets {
    param([string]$Ns)
    Apply-K8sAgentsSecrets -Namespace $Ns -RequireGitLab
}

# cap-jmk-launchpad homelab token only.
function Load-KlautHomelabEnv {
    $env:GH_TOKEN = $null
    $env:GITHUB_TOKEN = $null
    Get-Content (Join-Path $BeelinkRoot ".env") | ForEach-Object {
        if ($_ -match '^GH_TOKEN=(.+)$') { $env:GH_TOKEN = $Matches[1].Trim() }
    }
    if (-not $env:GH_TOKEN) {
        Write-Error "GH_TOKEN required from beelink-cleanup/.env for klaut worker"
    }
    $LiAgentsEnv = Join-Path $Root ".env"
    if (Test-Path $LiAgentsEnv) {
        Get-Content $LiAgentsEnv | ForEach-Object {
            if ($_ -match '^CURSOR_API_KEY=(.+)$') { $env:CURSOR_API_KEY = $Matches[1].Trim() }
        }
    }
}

$env:KUBECONFIG = $KubeConfig
Write-Host "==> deploy li-research workers sprint=$Sprint (namespace=$Namespace node=$EngineNode)"

$GoalIngest = if ($Sprint -eq "R1b") { "wp-li-research-r1b-warm-ingest.md" } else { "wp-li-research-warm-ingest.md" }
$GoalProduct = if ($Sprint -eq "R1b") { "wp-li-research-r1b-product.md" } else { "wp-li-research-r1-product.md" }
$GoalKlaut = if ($Sprint -eq "R1b") { "wp-li-research-r1b-klaut.md" } else { "wp-li-research-r1-klaut.md" }
$BundleIngest = if ($Sprint -eq "R1b") { "wp-li-research-r1b-warm-ingest.md" } else { "wp-li-research-warm-ingest.md" }
$BundleProduct = if ($Sprint -eq "R1b") { "wp-li-research-r1b-product.md" } else { "wp-li-research-r1-product.md" }
$BundleKlaut = if ($Sprint -eq "R1b") { "wp-li-research-r1b-klaut.md" } else { "wp-li-research-r1-klaut.md" }

function Scale-LiResearchWorkers {
    param(
        [string]$Ns,
        [switch]$SkipProduct,
        [switch]$SkipKlaut,
        [switch]$SkipIngest
    )
    if (-not $SkipProduct) { kubectl -n $Ns scale "deploy/li-research-product" --replicas=1 2>$null }
    if (-not $SkipKlaut) { kubectl -n $Ns scale "deploy/li-research-klaut" --replicas=1 2>$null }
    if (-not $SkipIngest) { kubectl -n $Ns scale "deploy/li-research-ingest" --replicas=1 2>$null }
}

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
kubectl apply -f (Join-Path $K8s "configmap-k8s-git-auth.yaml")
kubectl apply -f (Join-Path $K8s "configmap-goal-worker-runtime.yaml")
kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")

if (-not $SkipProduct) {
    Load-LiLangverseEnv

    Write-Host "==> li-research-product"
    kubectl apply -f (Join-Path $K8s "configmap-li-research-product.yaml")
    kubectl apply -f (Join-Path $K8s "deployment-li-research-product.yaml")
    $goalProduct = Normalize-GoalFile (Join-Path $KlautProGoals $GoalProduct)
    $extra = @{
        "entrypoint.sh"                 = (Join-Path $Root "deploy\li-research-product-entrypoint.sh")
        $BundleProduct                  = $goalProduct
    }
    . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-research-product-bundle" -ExtraFiles $extra

    Apply-LiAgentsSecrets -Ns $Namespace

    kubectl -n $Namespace rollout restart deploy/li-research-product 2>$null
    kubectl -n $Namespace rollout status deploy/li-research-product --timeout=300s
}

if (-not $SkipKlaut) {
    Load-KlautHomelabEnv

    Write-Host "==> li-research-klaut"
    kubectl apply -f (Join-Path $K8s "configmap-li-research-klaut.yaml")
    kubectl apply -f (Join-Path $K8s "deployment-li-research-klaut.yaml")
    $goalKlaut = Normalize-GoalFile (Join-Path $KlautProGoals $GoalKlaut)
    $extra = @{
        "entrypoint.sh"    = (Join-Path $Root "deploy\li-research-klaut-entrypoint.sh")
        $BundleKlaut       = $goalKlaut
    }
    . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-research-klaut-bundle" -ExtraFiles $extra

    $secretArgs = @(
        "create", "secret", "generic", "klaut-agents-secrets",
        "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
        "-n", $Namespace, "--dry-run=client", "-o", "yaml"
    )
    if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
    kubectl @secretArgs | kubectl apply -f -

    kubectl -n $Namespace rollout restart deploy/li-research-klaut 2>$null
    kubectl -n $Namespace rollout status deploy/li-research-klaut --timeout=300s
}

if (-not $SkipIngest) {
    Load-LiLangverseEnv

    Write-Host "==> li-research-ingest"
    kubectl apply -f (Join-Path $K8s "configmap-li-research-ingest.yaml")
    kubectl apply -f (Join-Path $K8s "secret-li-research-s2-api-key.yaml")
    kubectl apply -f (Join-Path $K8s "deployment-li-research-ingest.yaml")
    $goalIngest = Normalize-GoalFile (Join-Path $KlautProGoals $GoalIngest)
    $extra = @{
        "entrypoint.sh"    = (Join-Path $Root "deploy\li-research-ingest-entrypoint.sh")
        $BundleIngest       = $goalIngest
    }
    . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-research-ingest-bundle" -ExtraFiles $extra

    Apply-LiAgentsSecrets -Ns $Namespace

    kubectl -n $Namespace rollout restart deploy/li-research-ingest 2>$null
    kubectl -n $Namespace rollout status deploy/li-research-ingest --timeout=300s
}

Scale-LiResearchWorkers -Ns $Namespace -SkipProduct:$SkipProduct -SkipKlaut:$SkipKlaut -SkipIngest:$SkipIngest

Write-Host ""
Write-Host "=== li-research workers deployed (sprint=$Sprint) ==="
kubectl -n $Namespace get deploy -l 'app in (li-research-product,li-research-klaut,li-research-ingest)' `
    -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,REPLICAS:.spec.replicas
Write-Host ""
Write-Host "Logs:"
Write-Host "  kubectl -n $Namespace logs deploy/li-research-product -f --tail=50"
Write-Host "  kubectl -n $Namespace logs deploy/li-research-klaut -f --tail=50"
Write-Host "  kubectl -n $Namespace logs deploy/li-research-ingest -f --tail=50"
