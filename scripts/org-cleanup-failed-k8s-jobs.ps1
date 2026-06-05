# Delete completed/failed/stuck Batch Jobs in li-swarm.
param(
    [string]$Namespace = "li-swarm",
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [switch]$DryRun,
    [switch]$IncludeStuckActive
)

$ErrorActionPreference = "Stop"
$env:KUBECONFIG = $KubeConfig

$jobs = kubectl get jobs -n $Namespace -o json 2>$null | ConvertFrom-Json
if (-not $jobs -or -not $jobs.items) {
    Write-Host "No jobs in $Namespace"
    exit 0
}

$stuckReasons = @(
    "CreateContainerConfigError",
    "ImagePullBackOff",
    "ErrImagePull",
    "InvalidImageName"
)

$toDelete = @()
foreach ($job in $jobs.items) {
    $name = $job.metadata.name
    $succeeded = $job.status.succeeded -eq 1
    $failed = ($job.status.failed -ge 1) -or ($job.status.conditions | Where-Object { $_.type -eq "Failed" })
    $active = ($job.status.active -ge 1)

    if ($active -and $IncludeStuckActive) {
        $pods = kubectl get pods -n $Namespace -l "job-name=$name" -o json 2>$null | ConvertFrom-Json
        $stuck = $false
        foreach ($pod in ($pods.items | ForEach-Object { $_ })) {
            foreach ($cs in ($pod.status.containerStatuses | ForEach-Object { $_ })) {
                $reason = $cs.state.waiting.reason
                if ($stuckReasons -contains $reason) { $stuck = $true; break }
            }
            if ($stuck) { break }
        }
        if ($stuck) {
            $toDelete += $name
            continue
        }
    }

    if ($active) { continue }
    if ($succeeded -or $failed) {
        $toDelete += $name
    }
}

Write-Host "Found $($toDelete.Count) jobs to delete in $Namespace"
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
