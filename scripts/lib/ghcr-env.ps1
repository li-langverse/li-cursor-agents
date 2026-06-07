# Shared env load + GHCR push token resolution for org swarm deploy scripts.

function Load-LiSwarmEnvFiles {
    param(
        [string]$AgentsRoot,
        [string]$WorkspaceRoot
    )
    foreach ($envFile in @(
            (Join-Path $WorkspaceRoot ".env"),
            (Join-Path $WorkspaceRoot ".env.github"),
            (Join-Path $AgentsRoot ".env")
        )) {
        if (-not (Test-Path $envFile)) { continue }
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $k = $matches[1].Trim()
                $v = $matches[2].Trim().Trim('"')
                if ($v) { Set-Item -Path "env:$k" -Value $v }
            }
        }
    }
}

function Resolve-GhcrPushToken {
    foreach ($name in @("GHCR_PUSH_TOKEN", "GHCR_TOKEN", "GH_TOKEN_OVERVIEW_PAGE")) {
        $v = (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue).Value
        if ($v -and $v -match '^ghp_') { return @{ Token = $v; Source = $name } }
    }
    $swarm = (Get-Item -Path "env:GH_SWARM_TOKEN" -ErrorAction SilentlyContinue).Value
    if ($swarm -and $swarm -match '^ghp_') { return @{ Token = $swarm; Source = "GH_SWARM_TOKEN" } }
    return $null
}
