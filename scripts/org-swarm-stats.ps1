# Live org-swarm queue stats from homelab PVC (self-heals kubeconfig first).
param(
    [string]$Namespace = "li-swarm",
    [string]$KubeConfig = $(Join-Path $env:USERPROFILE ".kube\config-homelab")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\resolve-org-swarm-kubeconfig.ps1")
$null = Ensure-OrgSwarmKubeconfig -Dest $KubeConfig -Quiet

$py = "import json; q=json.load(open('/app/data/goal-directed-sprints/org-issue-queue.json')); r=q['report']; print(json.dumps({'queue_updated':q.get('updatedAt'),'open':r.get('total_open'),'implement':r.get('implement'),'route_planner':r.get('route_planner'),'needs_triage':r.get('needs_triage',0),'defer_master_plan':r.get('defer_master_plan',0),'close_done':r.get('close_done',0)}, indent=2))"

$pod = kubectl -n $Namespace get pods -l app=li-org-planner-supervisor -o jsonpath='{.items[0].metadata.name}' 2>&1
if ($LASTEXITCODE -ne 0 -or -not $pod) {
    throw "planner supervisor pod not found in $Namespace"
}

$stats = kubectl -n $Namespace exec $pod -- python3 -c $py 2>&1
if ($LASTEXITCODE -ne 0) { throw $stats }
Write-Output $stats

$closeAudit = kubectl -n $Namespace exec $pod -- sh -c "wc -l < /app/data/goal-directed-sprints/org-issue-close-audit.jsonl 2>/dev/null || echo 0" 2>&1
Write-Host "triage_close_audit_lines=$($closeAudit.Trim())"

$stab = kubectl -n $Namespace exec $pod -- sh -c "tail -1 /app/data/goal-directed-sprints/org-swarm-stability-audit.jsonl 2>/dev/null || true" 2>&1
if ($stab -and $stab.Trim()) { Write-Host "stability_audit=$($stab.Trim())" }
