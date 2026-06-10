# Deploy li-lios-kernel goal-directed agent on homelab engine cluster.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$EngineNode = "engine"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root
Assert-K8sAgentsDeployTokens

$env:KUBECONFIG = $KubeConfig
Write-Host "==> kubectl apply li-lios-kernel (namespace=$Namespace)"

kubectl apply -f (Join-Path $K8s "configmap-k8s-git-auth.yaml")

kubectl label node $EngineNode li-langverse.io/node-pool=engine --overwrite 2>$null

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "deployment-lios-kernel.yaml")

$goal = Join-Path $Root "data\goal-directed-sprints\lios-kernel-m1.md"
$stateDir = Join-Path $Root "data\lios-kernel-loop"
$state = Join-Path $stateDir "state.json"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$log = Join-Path $Root "data\lios-kernel-loop\iteration-log.md"
if (-not (Test-Path $state)) {
    '{"phase":"m1-complete"}' | Set-Content -Encoding utf8 $state
}
if (-not (Test-Path $log)) {
    Set-Content -Encoding utf8 -Path $log -Value "# lios-kernel loop`n"
}

$extra = @{
    "entrypoint.sh"       = (Join-Path $Root "deploy\lios-kernel-entrypoint.sh")
    "k8s-git-auth.sh"     = (Join-Path $Root "deploy\k8s-git-auth.sh")
    "lios-kernel-m1.md"   = $goal
    "state.json"          = $state
    "iteration-log.md"    = $log
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-lios-kernel-bundle" -ExtraFiles $extra

kubectl apply -f (Join-Path $K8s "configmap-lios-kernel.yaml")

& (Join-Path $PSScriptRoot "ensure-k8s-gitlab-pat.ps1") -KubeConfig $KubeConfig -Namespace $Namespace
Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab
& (Join-Path $PSScriptRoot "org-ensure-swarm-secrets.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

kubectl -n $Namespace rollout restart deploy/li-lios-kernel 2>$null
kubectl -n $Namespace scale deploy/li-lios-kernel --replicas=1
kubectl -n $Namespace rollout status deploy/li-lios-kernel --timeout=180s

Write-Host ""
Write-Host "=== li-lios-kernel deployed ==="
Write-Host "  kubectl -n $Namespace get pods -l app=li-lios-kernel -w"
Write-Host "  kubectl -n $Namespace logs deploy/li-lios-kernel --tail=80 -f"



