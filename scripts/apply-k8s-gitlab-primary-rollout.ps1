# Apply GitLab-primary k8s-git-auth + entrypoint configmaps and restart goal-directed workers.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

$env:KUBECONFIG = $KubeConfig
Write-Host "==> GitLab-primary rollout (namespace=$Namespace)"

kubectl apply -f (Join-Path $K8s "configmap-k8s-git-auth.yaml")

$entrypointConfigmaps = @(
    "configmap-li-parallel-entrypoint.yaml",
    "configmap-ph-sci-electrochemistry-entrypoint.yaml",
    "configmap-ph-sci-simulation-gap-close-entrypoint.yaml",
    "configmap-ph-sci-gap-close-phase2-entrypoint.yaml",
    "configmap-ph-ml-wave13-entrypoint.yaml",
    "configmap-ph-br-0-lib-browser-entrypoint.yaml"
)
foreach ($cm in $entrypointConfigmaps) {
    $path = Join-Path $K8s $cm
    if (Test-Path $path) {
        Write-Host "==> apply $cm"
        kubectl apply -f $path
    }
}

$envConfigmaps = @(
    "configmap-proof-explorer.yaml",
    "configmap-li-toml-config.yaml",
    "configmap-pure-li-https.yaml",
    "configmap-physics-codegen-matrix.yaml",
    "configmap-li-parallel.yaml",
    "configmap-ph-sci-electrochemistry.yaml",
    "configmap-ph-sci-simulation-gap-close.yaml",
    "configmap-ph-sci-gap-close-phase2.yaml",
    "configmap-ph-ml-wave13.yaml",
    "configmap-libernetes-control.yaml",
    "configmap-libernetes-licontainers.yaml",
    "configmap-libernetes-livm.yaml",
    "configmap-libernetes-platform.yaml",
    "configmap-lios-kernel.yaml"
)
foreach ($cm in $envConfigmaps) {
    $path = Join-Path $K8s $cm
    if (Test-Path $path) {
        kubectl apply -f $path
    }
}

$deployments = @(
    "deployment-li-parallel.yaml",
    "deployment-li-toml-config.yaml",
    "deployment-proof-explorer.yaml",
    "deployment-ph-sci-electrochemistry.yaml",
    "deployment-ph-sci-simulation-gap-close.yaml",
    "deployment-ph-sci-gap-close-phase2.yaml",
    "deployment-ph-ml-wave13.yaml",
    "deployment-ph-br-0-lib-browser.yaml",
    "deployment-pure-li-https.yaml",
    "deployment-physics-codegen-matrix.yaml",
    "deployment-libernetes-control.yaml",
    "deployment-libernetes-licontainers.yaml",
    "deployment-libernetes-livm.yaml",
    "deployment-libernetes-platform.yaml",
    "deployment-lios-kernel.yaml",
    "deployment-li-db-studio-product.yaml",
    "deployment-li-research-product.yaml",
    "deployment-li-research-ingest.yaml",
    "deployment-world-studio-typography-fx-animation.yaml",
    "deployment-world-studio-aimd-demo.yaml",
    "deployment-world-studio-gui-demo-recorder.yaml"
)
foreach ($dep in $deployments) {
    $path = Join-Path $K8s $dep
    if (Test-Path $path) {
        Write-Host "==> apply $dep"
        kubectl apply -f $path
    }
}

Write-Host "==> refresh goal-loop bundles"
$proofExtra = @{ "entrypoint.sh" = (Join-Path $Root "deploy\proof-explorer-k8s-entrypoint.sh") }
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-proof-explorer-bundle" -ExtraFiles $proofExtra

$tomlGoal = Join-Path $Root "data\goal-directed-sprints\li-toml-config-migration.md"
$tomlState = Join-Path $Root "data\li-toml-config-loop\state.json"
$tomlLog = Join-Path $Root "data\li-toml-config-loop\iteration-log.md"
$tomlExtra = @{
    "entrypoint.sh"               = (Join-Path $Root "deploy\li-toml-config-entrypoint.sh")
    "li-toml-config-migration.md" = $tomlGoal
    "state.json"                  = $tomlState
    "iteration-log.md"            = $tomlLog
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-li-toml-config-bundle" -ExtraFiles $tomlExtra

$libBundleDir = Join-Path $env:TEMP "li-libernetes-git-bundle"
if (Test-Path $libBundleDir) { Remove-Item -Recurse -Force $libBundleDir }
New-Item -ItemType Directory -Force -Path $libBundleDir | Out-Null
foreach ($pair in @(
    @("entrypoint.sh", "deploy\proof-explorer-entrypoint.sh"),
    @("k8s-git-auth.sh", "deploy\k8s-git-auth.sh")
)) {
    $text = ([IO.File]::ReadAllText((Join-Path $Root $pair[1]))).Replace("`r`n", "`n")
    [IO.File]::WriteAllText((Join-Path $libBundleDir $pair[0]), $text, [Text.UTF8Encoding]::new($false))
}
kubectl -n $Namespace create configmap li-libernetes-git-bundle `
    --from-file="$libBundleDir" `
    --dry-run=client -o yaml | kubectl apply -f -

$liosGoal = Join-Path $Root "data\goal-directed-sprints\lios-kernel-m1.md"
if (-not (Test-Path $liosGoal)) {
    $liosGoal = Join-Path (Split-Path $Root -Parent) "li-cursor-agents-clone\data\goal-directed-sprints\lios-kernel-m1.md"
}
if (Test-Path $liosGoal) {
    $liosExtra = @{
        "entrypoint.sh"     = (Join-Path $Root "deploy\lios-kernel-entrypoint.sh")
        "lios-kernel-m1.md" = $liosGoal
    }
    . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-lios-kernel-bundle" -ExtraFiles $liosExtra
}


$worldStudioBundles = @(
    @{ Name = "li-world-studio-aimd-demo-bundle"; Entry = "deploy\world-studio-aimd-demo-entrypoint.sh" },
    @{ Name = "li-world-studio-gui-demo-recorder-bundle"; Entry = "deploy\world-studio-gui-demo-recorder-entrypoint.sh" },
    @{ Name = "li-world-studio-typography-fx-animation-bundle"; Entry = "deploy\world-studio-typography-fx-animation-entrypoint.sh" }
)
foreach ($b in $worldStudioBundles) {
    $extra = @{ "entrypoint.sh" = (Join-Path $Root $b.Entry) }
    . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName $b.Name -ExtraFiles $extra
}

$dbProductGoal = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals\wp-li-product.md",
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals\wp-li-product.md",
    (Join-Path $Root "data\goal-directed-sprints\wp-li-product.md")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($dbProductGoal) {
    $goalLf = Join-Path $env:TEMP "wp-li-product-rollout-lf.md"
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [IO.File]::WriteAllText($goalLf, ([IO.File]::ReadAllText($dbProductGoal)).Replace("`r`n", "`n"), $utf8)
    $dbExtra = @{
        "entrypoint.sh"    = (Join-Path $Root "deploy\li-db-studio-product-entrypoint.sh")
        "wp-li-product.md" = $goalLf
    }
    . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-db-studio-product-bundle" -ExtraFiles $dbExtra
}

$klautGoals = @(
    "C:\Users\Julian\Documents\Programming\klaut.pro\klaut-pro\goals",
    "C:\Users\Julian\Documents\Programming\klaut.pro\goals",
    (Join-Path $Root "data\goal-directed-sprints")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($klautGoals) {
    foreach ($pair in @(
        @("li-research-product-bundle", "deploy\li-research-product-entrypoint.sh", "wp-li-research-r1b-product.md"),
        @("li-research-ingest-bundle", "deploy\li-research-ingest-entrypoint.sh", "wp-li-research-r1b-warm-ingest.md")
    )) {
        $goalSrc = Join-Path $klautGoals $pair[2]
        if (-not (Test-Path $goalSrc)) { continue }
        $goalLf = Join-Path $env:TEMP ("$($pair[2])-rollout-lf.md")
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [IO.File]::WriteAllText($goalLf, ([IO.File]::ReadAllText($goalSrc)).Replace("`r`n", "`n"), $utf8)
        $extra = @{
            "entrypoint.sh" = (Join-Path $Root $pair[1])
            $pair[2]        = $goalLf
        }
        . $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName $pair[0] -ExtraFiles $extra
    }
}

$workers = @(
    "li-li-parallel", "li-li-toml-config", "li-proof-explorer",
    "li-ph-sci-electrochemistry", "li-ph-sci-simulation-gap-close", "li-ph-sci-gap-close-phase2",
    "li-ph-ml-wave13", "li-ph-br-0-lib-browser", "li-pure-li-https", "li-physics-codegen-matrix",
    "li-libernetes-control", "li-libernetes-licontainers", "li-libernetes-livm", "li-libernetes-platform",
    "li-lios-kernel", "li-world-studio-typography-fx-animation", "li-world-studio-aimd-demo", "li-world-studio-gui-demo-recorder",
    "li-db-studio-product", "li-research-product", "li-research-ingest"
)
foreach ($w in $workers) {
    if (kubectl get deploy -n $Namespace $w 2>$null) {
        Write-Host "==> restart $w"
        kubectl -n $Namespace rollout restart "deploy/$w"
    }
}

Write-Host "==> rollout status (best-effort)"
foreach ($w in $workers) {
    kubectl -n $Namespace rollout status "deploy/$w" --timeout=120s 2>$null
}

Write-Host "Done. Verify logs: no primary github.com fetches for lic/benchmarks."

