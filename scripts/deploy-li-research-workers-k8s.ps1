# Deploy all three li-research goal-directed workers on li-swarm (engine).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine",
    [ValidateSet("Public", "R1b", "R1")]
    [string]$Sprint = "Public",
    [switch]$SkipProduct,
    [switch]$SkipKlaut,
    [switch]$SkipIngest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$LiRoot = Split-Path $Root -Parent
$BeelinkRoot = "C:\Users\Julian\Documents\Programming\beelink-cleanup"
$KlautProGoals = "C:\Users\Julian\Documents\Programming\klaut.pro\goals"
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
    foreach ($envFile in @(
            (Join-Path $LiRoot ".env.github"),
            (Join-Path $LiRoot ".env"),
            (Join-Path $Root ".env")
        )) {
        if (-not (Test-Path $envFile)) { continue }
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $k = $matches[1].Trim()
                if ($k -in @('GH_TOKEN', 'GITHUB_TOKEN', 'CURSOR_API_KEY', 'CURSOR_SDK_KEY')) {
                    $v = $matches[2].Trim()
                    if (-not [string]::IsNullOrWhiteSpace($v)) { Set-Item -Path "env:$k" -Value $v }
                }
            }
        }
    }
    if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
    if (-not $env:GH_TOKEN) {
        Write-Error "GH_TOKEN required from li/.env.github (or li/.env) for li-langverse workers"
    }
}

function Apply-LiAgentsSecrets {
    param([string]$Ns)
    $secretArgs = @(
        "create", "secret", "generic", "li-agents-secrets",
        "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
        "-n", $Ns, "--dry-run=client", "-o", "yaml"
    )
    if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
    if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }
    kubectl @secretArgs | kubectl apply -f -

    kubectl -n $Ns create secret docker-registry ghcr-li-langverse `
        --docker-server=ghcr.io `
        --docker-username=li-langverse `
        --docker-password=$env:GH_TOKEN `
        --dry-run=client -o yaml | kubectl apply -f -
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

$GoalIngest = if ($Sprint -eq "Public") { "wp-li-research-public-index.md" } elseif ($Sprint -eq "R1b") { "wp-li-research-r1b-warm-ingest.md" } else { "wp-li-research-warm-ingest.md" }
$GoalProduct = if ($Sprint -eq "R1b") { "wp-li-research-r1b-product.md" } else { "wp-li-research-r1-product.md" }
$GoalKlaut = if ($Sprint -eq "R1b") { "wp-li-research-r1b-klaut.md" } else { "wp-li-research-r1-klaut.md" }
$BundleIngest = if ($Sprint -eq "Public") { "wp-li-research-public-index.md" } elseif ($Sprint -eq "R1b") { "wp-li-research-r1b-warm-ingest.md" } else { "wp-li-research-warm-ingest.md" }
$BundleProduct = if ($Sprint -eq "R1b") { "wp-li-research-r1b-product.md" } else { "wp-li-research-r1-product.md" }
$BundleKlaut = if ($Sprint -eq "R1b") { "wp-li-research-r1b-klaut.md" } else { "wp-li-research-r1-klaut.md" }

function Scale-LiResearchWorkers {
    param([string]$Ns)
    foreach ($d in @("li-research-product", "li-research-klaut", "li-research-ingest")) {
        kubectl -n $Ns scale "deploy/$d" --replicas=1 2>$null
    }
}

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null
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

Scale-LiResearchWorkers -Ns $Namespace

Write-Host ""
Write-Host "=== li-research workers deployed (sprint=$Sprint) ==="
kubectl -n $Namespace get deploy -l 'app in (li-research-product,li-research-klaut,li-research-ingest)' `
    -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,REPLICAS:.spec.replicas
Write-Host ""
Write-Host "Logs:"
Write-Host "  kubectl -n $Namespace logs deploy/li-research-product -f --tail=50"
Write-Host "  kubectl -n $Namespace logs deploy/li-research-klaut -f --tail=50"
Write-Host "  kubectl -n $Namespace logs deploy/li-research-ingest -f --tail=50"
