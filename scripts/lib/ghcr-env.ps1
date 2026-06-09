# Shared env load + GHCR push token resolution for org swarm deploy scripts.

function Import-DotEnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim().Trim('"')
            if ($v) { Set-Item -Path "env:$k" -Value $v }
        }
    }
}

function Get-BeelinkCleanupRoot {
    if ($env:BEELINK_CLEANUP_ROOT) { return $env:BEELINK_CLEANUP_ROOT }
    return "C:\Users\Julian\Documents\Programming\beelink-cleanup"
}

function Load-LiSwarmEnvFiles {
    param(
        [string]$AgentsRoot,
        [string]$WorkspaceRoot
    )
    $beelink = Get-BeelinkCleanupRoot
    foreach ($envFile in @(
            (Join-Path $WorkspaceRoot ".env"),
            (Join-Path $WorkspaceRoot ".env.local"),
            (Join-Path $WorkspaceRoot ".env.gitlab"),
            (Join-Path $WorkspaceRoot ".env.github"),
            (Join-Path $AgentsRoot ".env"),
            (Join-Path $beelink ".env"),
            (Join-Path $beelink "homelab-k3s\.env"),
            (Join-Path $beelink ".env.gitlab")
        )) {
        Import-DotEnvFile $envFile
    }
    Resolve-GitHubBackupTokenFromEnv | Out-Null
}

function Resolve-GitHubBackupTokenFromEnv {
    if ($env:GH_SWARM_TOKEN_BACKUP) {
        return @{ Token = $env:GH_SWARM_TOKEN_BACKUP; Source = "GH_SWARM_TOKEN_BACKUP" }
    }
    $primary = if ($env:GH_SWARM_TOKEN) { $env:GH_SWARM_TOKEN.Trim() } else { "" }
    foreach ($name in @("GH_TOKEN_BACKUP", "GH_TOKEN")) {
        $raw = (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue).Value
        $v = if ($raw) { $raw.Trim() } else { "" }
        if (-not $v) { continue }
        if ($primary -and $v -eq $primary) { continue }
        $env:GH_SWARM_TOKEN_BACKUP = $v
        return @{ Token = $v; Source = $name }
    }
    return $null
}

function Resolve-GhcrPushToken {
    foreach ($name in @("GHCR_PUSH_TOKEN", "GHCR_TOKEN", "GH_PACKAGES", "GH_TOKEN_OVERVIEW_PAGE")) {
        $v = (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue).Value
        if ($v -and $v -match '^ghp_') { return @{ Token = $v; Source = $name } }
    }
    $swarm = (Get-Item -Path "env:GH_SWARM_TOKEN" -ErrorAction SilentlyContinue).Value
    if ($swarm -and $swarm -match '^ghp_') { return @{ Token = $swarm; Source = "GH_SWARM_TOKEN" } }
    return $null
}
