# Apply a ConfigMap bundling goal-directed-loop scripts (+ optional extra files) for K8s workers.
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Namespace,
    [Parameter(Mandatory = $true)][string]$ConfigMapName,
    [hashtable]$ExtraFiles = @{},
    [string]$DistOverlayDir = ""
)

$ErrorActionPreference = "Stop"
$bundleDir = Join-Path $env:TEMP "$ConfigMapName-bundle"
if (Test-Path $bundleDir) { Remove-Item -Recurse -Force $bundleDir }
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

$scriptPairs = @(
    @("goal-directed-loop.sh", "scripts\goal-directed-loop.sh"),
    @("goal-loop-self-unblock.sh", "scripts\goal-loop-self-unblock.sh"),
    @("k8s-goal-loop-common.sh", "deploy\k8s-goal-loop-common.sh"),
    @("k8s-git-auth.sh", "deploy\k8s-git-auth.sh")
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

if ($DistOverlayDir -and (Test-Path $DistOverlayDir)) {
    $overlayDest = Join-Path $bundleDir "daemon-dist"
    New-Item -ItemType Directory -Force -Path $overlayDest | Out-Null
    Get-ChildItem -Path $DistOverlayDir -Recurse -File -Filter "*.js" | ForEach-Object {
        $rel = $_.FullName.Substring($DistOverlayDir.Length).TrimStart('\', '/')
        $destDir = Join-Path $overlayDest (Split-Path $rel -Parent)
        if ($destDir -and -not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        }
        Copy-Item -Force $_.FullName (Join-Path $overlayDest $rel)
    }
}

python -c @"
import pathlib, subprocess, os, sys
bundle = pathlib.Path(r'$bundleDir')
env = {**os.environ, 'KUBECONFIG': os.environ.get('KUBECONFIG', '')}
args = ['kubectl', '-n', '$Namespace', 'create', 'configmap', '$ConfigMapName']
for path in sorted(bundle.rglob('*')):
    if not path.is_file():
        continue
    rel = path.relative_to(bundle).as_posix()
    key = rel.replace('/', '__')
    args.extend(['--from-file', f'{key}={path}'])
args.extend(['--dry-run=client', '-o', 'yaml'])
proc = subprocess.run(
    ['kubectl', '-n', '$Namespace', 'apply', '-f', '-'],
    input=subprocess.check_output(args, env=env),
    env=env,
)
sys.exit(proc.returncode)
"@
if ($LASTEXITCODE -ne 0) { throw "ConfigMap $ConfigMapName apply failed" }
