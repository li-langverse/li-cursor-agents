# Sync homelab kubeconfig: fetch from blackpearl (if key present), then symlink into ~/.kube.
function Sync-KubeconfigFromBeelink {
    param(
        [string]$BeelinkRoot = $(if ($env:BEELINK_CLEANUP_ROOT) { $env:BEELINK_CLEANUP_ROOT } else { "C:\Users\Julian\Documents\Programming\beelink-cleanup" }),
        [string]$Dest = $(Join-Path $env:USERPROFILE ".kube\config-homelab")
    )

    $canonical = Join-Path $BeelinkRoot ".kube\config-homelab"
    $fetch = Join-Path $BeelinkRoot "scripts\fetch-kubeconfig-from-blackpearl.ps1"
    $link = Join-Path $BeelinkRoot "scripts\link-kubeconfig-homelab.ps1"

    if ((Test-Path -LiteralPath $fetch) -and -not (Test-Path -LiteralPath $canonical)) {
        try {
            & $fetch -BeelinkRoot $BeelinkRoot
        } catch {
            Write-Host "sync-kubeconfig: fetch skipped ($($_.Exception.Message))"
        }
    }

    if (Test-Path -LiteralPath $canonical) {
        if (Test-Path -LiteralPath $link) {
            & $link -BeelinkRoot $BeelinkRoot
            if ($env:KUBECONFIG) { return $env:KUBECONFIG }
        } else {
            $destDir = Split-Path $Dest -Parent
            New-Item -ItemType Directory -Force -Path $destDir | Out-Null
            if (Test-Path -LiteralPath $Dest) { Remove-Item -LiteralPath $Dest -Force }
            New-Item -ItemType SymbolicLink -Path $Dest -Target $canonical | Out-Null
            Write-Host "sync-kubeconfig: linked $Dest -> $canonical"
        }
        $env:KUBECONFIG = $Dest
        return $Dest
    }

    # Legacy: copy from alternate paths under beelink-cleanup
    $candidates = @(
        (Join-Path $BeelinkRoot "config-homelab"),
        (Join-Path $BeelinkRoot "kube\config-homelab"),
        (Join-Path $BeelinkRoot ".kube\config")
    )
    $src = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($src) {
        New-Item -ItemType Directory -Force -Path (Split-Path $canonical -Parent) | Out-Null
        Copy-Item -LiteralPath $src -Destination $canonical -Force
        Write-Host "sync-kubeconfig: staged $src -> $canonical"
        if (Test-Path -LiteralPath $link) { & $link -BeelinkRoot $BeelinkRoot }
        $env:KUBECONFIG = $Dest
        return $Dest
    }

    if (Test-Path -LiteralPath $Dest) {
        Write-Host "sync-kubeconfig: using existing $Dest"
        $env:KUBECONFIG = $Dest
        return $Dest
    }

    # Last resort: copy canonical directly to dest (no symlink) for environments that block symlinks.
    if (Test-Path -LiteralPath $canonical) {
        $destDir = Split-Path $Dest -Parent
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item -LiteralPath $canonical -Destination $Dest -Force
        Write-Host "sync-kubeconfig: copied $canonical -> $Dest"
        $env:KUBECONFIG = $Dest
        return $Dest
    }

    Write-Warning "sync-kubeconfig: no kubeconfig - add beelink-cleanup/homelab key and run fetch-kubeconfig-from-blackpearl.ps1"
    return $null
}

if ($MyInvocation.InvocationName -ne '.') {
    Sync-KubeconfigFromBeelink | Out-Null
}
