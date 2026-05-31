# Apply li-cursor-agents Supabase migrations to homelab (majico-staging postgres-0).
# Usage: $env:KUBECONFIG = "$env:USERPROFILE\.kube\config-homelab"; .\scripts\apply-homelab-supabase-migrations.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$migDir = Join-Path $root "supabase\migrations"
$files = @(
  "20260517120000_control_plane.sql",
  "20260517140000_agent_run_input_trace.sql",
  "20260517150000_interventions_latest.sql",
  "20260517151000_swarm_handoffs_sessions.sql",
  "20260517152000_research_sessions_hypotheses.sql",
  "20260518170000_dashboard_query_indexes.sql",
  "20260518180000_db_native_control_plane.sql",
  "20260519100000_worker_status.sql",
  "20260531120000_org_supervisor_cycles.sql",
  "20260531130000_org_supervisor_cycles_research.sql"
)

foreach ($f in $files) {
  $path = Join-Path $migDir $f
  Write-Host "=== $f ==="
  $sql = Get-Content -Raw $path
  $sql | kubectl exec -i -n majico-staging postgres-0 -- psql -U postgres -d postgres -v ON_ERROR_STOP=0 2>&1 | Out-Host
}

Write-Host "=== grants + PostgREST reload ==="
kubectl exec -n majico-staging postgres-0 -- psql -U postgres -d postgres -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role; NOTIFY pgrst, 'reload schema';"

Write-Host "=== public tables ==="
kubectl exec -n majico-staging postgres-0 -- psql -U postgres -d postgres -c "\dt public.*"
