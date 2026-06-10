# Deploy li-pure-li-https goal-directed worker (GitLab-primary, proof-explorer entrypoint bundle).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm"
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
Write-Host "==> deploy li-pure-li-https (namespace=$Namespace)"

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8s "configmap-k8s-git-auth.yaml")
kubectl apply -f (Join-Path $K8s "configmap-goal-worker-runtime.yaml")
kubectl apply -f (Join-Path $K8s "pvc-pure-li-https-workspace.yaml")
kubectl apply -f (Join-Path $K8s "configmap-pure-li-https.yaml")
kubectl apply -f (Join-Path $K8s "deployment-pure-li-https.yaml")

$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\proof-explorer-k8s-entrypoint.sh")
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-pure-li-https-bundle" -ExtraFiles $extra

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl -n $Namespace rollout restart deploy/li-pure-li-https 2>$null
kubectl -n $Namespace rollout status deploy/li-pure-li-https --timeout=180s

Write-Host "Done. kubectl -n $Namespace logs deploy/li-pure-li-https -f --tail=50"
