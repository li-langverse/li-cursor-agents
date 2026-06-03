# Deploy li-world-studio-gui-demo-recorder goal-directed agent.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent
foreach ($envFile in @(
        (Join-Path $Workspace ".env.github"),
        (Join-Path $Workspace ".env"),
        (Join-Path $Workspace "li-cursor-agents\.env")
    )) {
    if (-not (Test-Path $envFile)) { continue }
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            if ($k -in @('GH_TOKEN','GITHUB_TOKEN','CURSOR_API_KEY','CURSOR_SDK_KEY')) {
                $v = $matches[2].Trim()
                if ($v) { Set-Item -Path "env:$k" -Value $v }
            }
        }
    }
}
if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN) { Write-Error "GH_TOKEN required" }
$env:KUBECONFIG = $KubeConfig
kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "pvc-world-studio-gui-demo-recorder-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-world-studio-gui-demo-recorder.yaml")
kubectl apply -f (Join-Path $K8s "deployment-world-studio-gui-demo-recorder.yaml")
$extra = @{ "entrypoint.sh" = (Join-Path $Root "deploy\world-studio-gui-demo-recorder-entrypoint.sh") }
. (Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1") -Root $Root -Namespace $Namespace -ConfigMapName "li-world-studio-gui-demo-recorder-bundle" -ExtraFiles $extra
kubectl create secret generic li-agents-secrets --from-literal=GH_TOKEN=$env:GH_TOKEN -n $Namespace --dry-run=client -o yaml | kubectl apply -f -
if ($env:CURSOR_API_KEY) {
    kubectl create secret generic li-agents-secrets --from-literal=GH_TOKEN=$env:GH_TOKEN --from-literal=CURSOR_API_KEY=$env:CURSOR_API_KEY -n $Namespace --dry-run=client -o yaml | kubectl apply -f -
}
kubectl -n $Namespace rollout restart deploy/li-world-studio-gui-demo-recorder 2>$null
kubectl -n $Namespace rollout status deploy/li-world-studio-gui-demo-recorder --timeout=180s
Write-Host "=== li-world-studio-gui-demo-recorder deployed ==="
