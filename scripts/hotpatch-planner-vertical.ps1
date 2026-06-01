#!/usr/bin/env pwsh
# Hot-patch homelab cluster with planner code + dashboard without rebuilding GHCR image.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$Root/dist/cli/org-planner-supervisor.js")) {
  Push-Location $Root
  npm run build | Out-Null
  Pop-Location
}

$env:KUBECONFIG = if ($env:KUBECONFIG) { $env:KUBECONFIG } else { "$env:USERPROFILE\.kube\config-homelab" }
$Ns = "li-swarm"

Write-Host "Creating ConfigMap li-org-planner-hotfix in $Ns..."
$plannerArgs = @("create", "configmap", "li-org-planner-hotfix", "-n", $Ns, "--dry-run=client", "-o", "yaml")
Get-ChildItem "$Root/dist/org-planner/*.js" | ForEach-Object {
  $plannerArgs += "--from-file=$($_.Name)=$($_.FullName)"
}
$plannerArgs += "--from-file=org-planner-supervisor.js=$Root/dist/cli/org-planner-supervisor.js"
$plannerArgs += "--from-file=org-planner-worker.js=$Root/dist/cli/org-planner-worker.js"
& kubectl @plannerArgs | kubectl apply -f -

Write-Host "Patching li-org-planner-supervisor deployment with hotfix mounts..."
$patch = @'
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "supervisor",
          "volumeMounts": [
            { "name": "planner-hotfix", "mountPath": "/app/dist/org-planner" },
            { "name": "planner-hotfix", "mountPath": "/app/dist/cli/org-planner-supervisor.js", "subPath": "org-planner-supervisor.js" },
            { "name": "planner-hotfix", "mountPath": "/app/dist/cli/org-planner-worker.js", "subPath": "org-planner-worker.js" },
            { "name": "sprint-data", "mountPath": "/app/data/goal-directed-sprints" }
          ]
        }],
        "volumes": [
          { "name": "planner-hotfix", "configMap": { "name": "li-org-planner-hotfix" } },
          { "name": "sprint-data", "persistentVolumeClaim": { "claimName": "li-agents-sprint-data" } }
        ]
      }
    }
  }
}
'@
$patch | kubectl patch deployment li-org-planner-supervisor -n $Ns --type=strategic -p -

Write-Host "Scaling planner supervisor to 1..."
kubectl -n $Ns scale deployment/li-org-planner-supervisor --replicas=1

# Dashboard hotfix
$DashRoot = Join-Path $Root "apps/org-supervisor-dashboard"
if (-not (Test-Path "$DashRoot/dist/index.html")) {
  Push-Location $DashRoot
  npm run build | Out-Null
  Pop-Location
}

Write-Host "Creating ConfigMap li-org-supervisor-dashboard-hotfix..."
$dashArgs = @(
  "create", "configmap", "li-org-supervisor-dashboard-hotfix", "-n", $Ns,
  "--dry-run=client", "-o", "yaml",
  "--from-file=constants.mjs=$DashRoot/server/constants.mjs",
  "--from-file=data.mjs=$DashRoot/server/data.mjs"
)
Get-ChildItem "$DashRoot/dist/assets/*" | ForEach-Object {
  $dashArgs += "--from-file=$($_.Name)=$($_.FullName)"
}
& kubectl @dashArgs | kubectl apply -f -

# index.html as key
kubectl create configmap li-org-supervisor-dashboard-index -n $Ns `
  --from-file=index.html="$DashRoot/dist/index.html" `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Host "Patching li-org-supervisor-dashboard deployment..."
$dashPatch = @'
{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "dashboard",
          "volumeMounts": [
            { "name": "dash-server", "mountPath": "/app/apps/org-supervisor-dashboard/server/constants.mjs", "subPath": "constants.mjs" },
            { "name": "dash-server", "mountPath": "/app/apps/org-supervisor-dashboard/server/data.mjs", "subPath": "data.mjs" },
            { "name": "dash-index", "mountPath": "/app/apps/org-supervisor-dashboard/dist/index.html", "subPath": "index.html" },
            { "name": "dash-assets", "mountPath": "/app/apps/org-supervisor-dashboard/dist/assets" },
            { "name": "sprint-data", "mountPath": "/app/data/goal-directed-sprints", "readOnly": true }
          ]
        }],
        "volumes": [
          { "name": "dash-server", "configMap": { "name": "li-org-supervisor-dashboard-hotfix" } },
          { "name": "dash-index", "configMap": { "name": "li-org-supervisor-dashboard-index" } },
          { "name": "dash-assets", "configMap": { "name": "li-org-supervisor-dashboard-hotfix" } },
          { "name": "sprint-data", "persistentVolumeClaim": { "claimName": "li-agents-sprint-data" } }
        ]
      }
    }
  }
}
'@
$dashPatch | kubectl patch deployment li-org-supervisor-dashboard -n $Ns --type=strategic -p -

kubectl -n $Ns rollout restart deployment/li-org-supervisor-dashboard
kubectl -n $Ns rollout restart deployment/li-org-planner-supervisor

Write-Host "Waiting for rollouts..."
kubectl -n $Ns rollout status deployment/li-org-planner-supervisor --timeout=120s
kubectl -n $Ns rollout status deployment/li-org-supervisor-dashboard --timeout=120s

Write-Host "Done. Dashboard: http://192.168.10.32:30478/"
kubectl -n $Ns logs deploy/li-org-planner-supervisor --tail=15
