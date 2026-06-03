# Delete completed/failed Batch Jobs in li-swarm to reduce namespace clutter.
param(
    [string]$Namespace = "li-swarm",
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [switch]$DryRun,
    [switch]$IncludeStuckActive
)

$env:KUBECONFIG = $KubeConfig

$jobs = kubectl get jobs -n $Namespace -o json 2>$null | ConvertFrom-Json
if (-not $jobs -or -not $jobs.items) {
    Write-Host "No jobs in $Namespace"
    exit 0
}

$stuckActive = @()
if ($IncludeStuckActive) {
    $pods = kubectl get pods -n $Namespace -o json 2>$null | ConvertFrom-Json
    $badReasons = @("CreateContainerConfigError", "StartError", "ImagePullBackOff", "ErrImagePull")
    foreach ($job in $jobs.items) {
        if (($job.status.active -ge 1) -and ($job.status.succeeded -ne 1)) {
            $jobName = $job.metadata.name
            $jobPods = @($pods.items | Where-Object {
                $_.metadata.name -like "$jobName-*" -or $_.metadata.labels."job-name" -eq $jobName
            })
            if ($jobPods.Count -eq 0) { continue }
            $allBad = $true
            foreach ($pod in $jobPods) {
                $waiting = $pod.status.containerStatuses[0].state.waiting
                if ($waiting -and ($badReasons -contains $waiting.reason)) { continue }
                $terminated = $pod.status.containerStatuses[0].state.terminated
                if ($terminated -and ($badReasons -contains $terminated.reason)) { continue }
                $allBad = $false
                break
            }
            if ($allBad) { $stuckActive += $jobName }
        }
    }
    Write-Host "Stuck active jobs (infra failure): $($stuckActive.Count)"
}

$toDelete = @()
foreach ($job in $jobs.items) {
    $name = $job.metadata.name
    if ($stuckActive -contains $name) {
        $toDelete += $name
        continue
    }
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
