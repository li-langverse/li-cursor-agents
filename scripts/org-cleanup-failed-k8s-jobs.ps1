# Delete completed/failed Batch Jobs in li-swarm to reduce namespace clutter.
param(
    [string]$Namespace = "li-swarm",
    [switch]$DryRun
)

$jobs = kubectl get jobs -n $Namespace -o json 2>$null | ConvertFrom-Json
if (-not $jobs -or -not $jobs.items) {
    Write-Host "No jobs in $Namespace"
    exit 0
}

$toDelete = @()
foreach ($job in $jobs.items) {
    $name = $job.metadata.name
    $succeeded = $job.status.succeeded -eq 1
    $failed = ($job.status.failed -ge 1) -or ($job.status.conditions | Where-Object { $_.type -eq "Failed" })
    $active = ($job.status.active -ge 1)
    if ($active) { continue }
    if ($succeeded -or $failed) {
        $toDelete += $name
    }
}

Write-Host "Found $($toDelete.Count) terminal jobs in $Namespace"
if ($DryRun) {
    $toDelete | Select-Object -First 20 | ForEach-Object { Write-Host "  [dry-run] $_" }
    if ($toDelete.Count -gt 20) { Write-Host "  ... and $($toDelete.Count - 20) more" }
    exit 0
}

$deleted = 0
foreach ($name in $toDelete) {
    kubectl delete job $name -n $Namespace --ignore-not-found 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $deleted++ }
}
Write-Host "Deleted $deleted jobs"
