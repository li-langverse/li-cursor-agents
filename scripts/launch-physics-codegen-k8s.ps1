# Launch physics-codegen-matrix worker on homelab engine cluster.
# Loads tokens from li-cursor-agents/.env when present.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $name = $Matches[1]
      $val = $Matches[2].Trim().Trim('"').Trim("'")
      if ($name -match '^(GH_TOKEN|GITHUB_TOKEN|CURSOR_API_KEY|CURSOR_SDK_KEY|PHYSICS_CODEGEN_MODELS)$') {
        Set-Item -Path "env:$name" -Value $val
      }
    }
  }
}
$Kube = Join-Path $env:USERPROFILE ".kube\config-homelab"
if (Test-Path $Kube) { $env:KUBECONFIG = $Kube }
if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
$bashRoot = $Root -replace '\\', '/'
if ($bashRoot -match '^[A-Za-z]:') { $bashRoot = "/mnt/$($bashRoot[0].ToString().ToLower())/$($bashRoot.Substring(3))" }
wsl.exe bash -lc "cd '$bashRoot' && bash scripts/k8s-physics-codegen-readiness.sh"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
wsl.exe bash -lc "cd '$bashRoot' && bash scripts/setup-engine-k8s-physics-codegen-matrix.sh"
