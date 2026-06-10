# Patch li-agents-secrets with GITLAB_TOKEN and restart goal-directed workers (GitLab-primary remotes).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Workspace = Split-Path $Root -Parent

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root

$env:KUBECONFIG = $KubeConfig
Write-Host "==> Ensure valid GitLab PAT in li-agents-secrets"
& (Join-Path $PSScriptRoot "ensure-k8s-gitlab-pat.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

Write-Host "==> Apply li-agents-secrets (GITLAB_TOKEN + GH_TOKEN)"
Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab
& (Join-Path $PSScriptRoot "org-ensure-swarm-secrets.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

Write-Host "==> Apply GitLab-primary manifests + restart workers"
& (Join-Path $PSScriptRoot "apply-k8s-gitlab-primary-rollout.ps1") -KubeConfig $KubeConfig -Namespace $Namespace

Write-Host ""
Write-Host "=== GitLab-primary rollout complete ==="
Write-Host "  Verify: kubectl -n $Namespace exec deploy/li-proof-explorer -- git -C /workspace/lic remote -v"
