# Apply org-issue-worker on the engine Kubernetes cluster (Windows).
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Ns = "li-swarm"
$K8s = Join-Path $Root "deploy\k8s\engine"

$ctx = kubectl config current-context 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "kubectl has no current-context. Set KUBECONFIG to your engine cluster kubeconfig first."
}

if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
    $envFile = Join-Path (Split-Path $Root -Parent) ".env.github"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
            }
        }
    }
}
if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
    Write-Error "GH_TOKEN required"
}

Write-Host "context: $ctx"
kubectl get nodes -o wide

if ($env:LI_ENGINE_NODE_NAME) {
    $key = if ($env:LI_ENGINE_NODE_LABEL_KEY) { $env:LI_ENGINE_NODE_LABEL_KEY } else { "li-langverse.io/node-pool" }
    $val = if ($env:LI_ENGINE_NODE_LABEL_VALUE) { $env:LI_ENGINE_NODE_LABEL_VALUE } else { "engine" }
    kubectl label node $env:LI_ENGINE_NODE_NAME "${key}=${val}" --overwrite
}

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl apply -f (Join-Path $K8s "pvc-sprint-data.yaml")
kubectl apply -f (Join-Path $K8s "configmap.yaml")

$token = if ($env:GH_TOKEN) { $env:GH_TOKEN } else { $env:GITHUB_TOKEN }
kubectl -n $Ns create secret generic li-agents-secrets --from-literal=GH_TOKEN=$token --dry-run=client -o yaml | kubectl apply -f -

if ($env:LI_ORG_ISSUE_DEPLOY_ALWAYS_ON -eq "1") {
    kubectl apply -f (Join-Path $K8s "deployment-org-issue-worker.yaml")
} else {
    kubectl apply -f (Join-Path $K8s "cronjob-org-issue-worker.yaml")
}

kubectl -n $Ns get cronjob,deploy,pvc,configmap
Write-Host "Done."
