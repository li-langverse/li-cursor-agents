# Apply a ConfigMap bundling goal-directed-loop scripts (+ optional extra files) for K8s workers.
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$ConfigMapName,
    [hashtable]$ExtraFiles = @{}
)

$ErrorActionPreference = "Stop"
$bundleDir = Join-Path $env:TEMP "$ConfigMapName-bundle"
if (Test-Path $bundleDir) { Remove-Item -Recurse -Force $bundleDir }
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

$scriptPairs = @(
    @("goal-directed-loop.sh", "scripts\goal-directed-loop.sh"),
    @("goal-loop-self-unblock.sh", "scripts\goal-loop-self-unblock.sh"),
    @("k8s-goal-loop-common.sh", "deploy\k8s-goal-loop-common.sh")
)
foreach ($pair in $scriptPairs) {
    $dest = Join-Path $bundleDir $pair[0]
    $src = Join-Path $Root $pair[1]
    if (-not (Test-Path $src)) { throw "missing bundle source: $src" }
    $text = ([System.IO.File]::ReadAllText($src)).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($dest, $text, (New-Object System.Text.UTF8Encoding $false))
}

foreach ($key in $ExtraFiles.Keys) {
    $src = $ExtraFiles[$key]
    if (-not (Test-Path $src)) { throw "missing extra bundle file: $src" }
    $dest = Join-Path $bundleDir $key
    if ($src.EndsWith(".sh")) {
        $text = ([System.IO.File]::ReadAllText($src)).Replace("`r`n", "`n")
        [System.IO.File]::WriteAllText($dest, $text, (New-Object System.Text.UTF8Encoding $false))
    } else {
        Copy-Item -Force $src $dest
    }
}

python -c @"
import pathlib, subprocess, os, sys
bundle = pathlib.Path(r'$bundleDir')
env = {**os.environ, 'KUBECONFIG': os.environ.get('KUBECONFIG', '')}
proc = subprocess.run(
    ['kubectl', '-n', '$Namespace', 'apply', '-f', '-'],
    input=subprocess.check_output([
        'kubectl', '-n', '$Namespace', 'create', 'configmap',
        '$ConfigMapName',
        '--from-file', str(bundle),
        '--dry-run=client', '-o', 'yaml',
    ]),
    env=env,
)
sys.exit(proc.returncode)
"@
if ($LASTEXITCODE -ne 0) { throw "ConfigMap $ConfigMapName apply failed" }
