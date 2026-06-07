# Self-heal homelab KUBECONFIG before org-swarm kubectl/gh operations.
# Prevents the default "localhost:8080" failure when ~/.kube/config-homelab is missing.

function Test-OrgSwarmKubeClusterReachable {
    param(
        [Parameter(Mandatory = $true)][string]$KubeConfig,
        [int]$TimeoutSec = 20
    )
    if (-not (Test-Path -LiteralPath $KubeConfig)) {
        return @{ Ok = $false; Reason = "missing_kubeconfig"; Path = $KubeConfig }
    }
    $content = Get-Content -LiteralPath $KubeConfig -Raw -ErrorAction SilentlyContinue
    if (-not $content -or $content.Trim().Length -lt 10) {
        return @{ Ok = $false; Reason = "empty_kubeconfig"; Path = $KubeConfig }
    }
    if ($content -match 'localhost:8080' -and $content -notmatch 'server:\s*https?://(?!127\.0\.0\.1|localhost)') {
        return @{ Ok = $false; Reason = "localhost_only_kubeconfig"; Path = $KubeConfig }
    }

    $prev = $env:KUBECONFIG
    $env:KUBECONFIG = $KubeConfig
    try {
        $out = kubectl cluster-info --request-timeout="${TimeoutSec}s" 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            $tail = $out.Trim().Split([Environment]::NewLine) | Select-Object -Last 3
            return @{ Ok = $false; Reason = "kubectl_unreachable"; Path = $KubeConfig; Detail = ($tail -join " ") }
        }
        if ($out -match 'localhost:8080|connection refused|actively refused') {
            return @{ Ok = $false; Reason = "kubectl_localhost_fallback"; Path = $KubeConfig; Detail = $out.Trim() }
        }
        return @{ Ok = $true; Reason = "ok"; Path = $KubeConfig }
    } finally {
        $env:KUBECONFIG = $prev
    }
}

function Ensure-OrgSwarmKubeconfig {
    param(
        [string]$Dest = $(Join-Path $env:USERPROFILE ".kube\config-homelab"),
        [switch]$Quiet
    )
    $syncScript = Join-Path $PSScriptRoot "..\sync-kubeconfig-from-beelink.ps1"
    if (-not (Test-Path -LiteralPath $syncScript)) {
        throw "missing sync script: $syncScript"
    }
    . $syncScript

    $attempts = @(
        { Sync-KubeconfigFromBeelink -Dest $Dest | Out-Null; $Dest },
        {
            $beelink = if ($env:BEELINK_CLEANUP_ROOT) { $env:BEELINK_CLEANUP_ROOT } else { "C:\Users\Julian\Documents\Programming\beelink-cleanup" }
            $fetch = Join-Path $beelink "scripts\fetch-kubeconfig-from-blackpearl.ps1"
            if (Test-Path -LiteralPath $fetch) {
                try {
                    & $fetch -BeelinkRoot $beelink
                } catch {
                    if (-not $Quiet) {
                        Write-Warning "fetch-kubeconfig retry skipped: $($_.Exception.Message)"
                    }
                }
                Sync-KubeconfigFromBeelink -Dest $Dest | Out-Null
            }
            $Dest
        }
    )

    foreach ($attempt in $attempts) {
        $path = & $attempt
        if (-not $path) { $path = $Dest }
        $check = Test-OrgSwarmKubeClusterReachable -KubeConfig $path
        if ($check.Ok) {
            $env:KUBECONFIG = $path
            if (-not $Quiet) { Write-Host "kubeconfig ok: $path" }
            return $path
        }
        if (-not $Quiet) {
            Write-Warning "kubeconfig check failed ($($check.Reason)): $($check.Detail)"
        }
    }

    $final = Test-OrgSwarmKubeClusterReachable -KubeConfig $Dest
    $msg = @(
        "Homelab kubeconfig is not reachable.",
        "Expected: $Dest",
        "Reason: $($final.Reason)",
        "Fix: run beelink-cleanup/scripts/fetch-kubeconfig-from-blackpearl.ps1 or set KUBECONFIG to a valid homelab config.",
        "Never rely on default kubectl (localhost:8080); always call Ensure-OrgSwarmKubeconfig first."
    ) -join " "
    throw $msg
}
