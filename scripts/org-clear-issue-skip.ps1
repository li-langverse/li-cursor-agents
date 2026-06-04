# Clear org-issue failure skip cooldowns on the sprint PVC (via issue supervisor pod).
param(
    [string]$Namespace = "li-swarm",
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab"
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig
$path = "data/goal-directed-sprints/org-issue-skip.json"
$empty = "{}" + [Environment]::NewLine

kubectl -n $Namespace exec deploy/li-org-issue-supervisor -- sh -c "echo '{}' > /app/$path" 2>&1 | Out-Host
Write-Host "Cleared $path in $Namespace"
