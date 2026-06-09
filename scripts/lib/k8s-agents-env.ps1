# Shared env + secret helpers for homelab K8s goal-directed workers (GitLab-primary).
function Load-K8sAgentsEnv {
    param(
        [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
        [string]$AgentsRoot = (Split-Path $PSScriptRoot -Parent)
    )

    $keys = @('GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'CURSOR_API_KEY', 'CURSOR_SDK_KEY', 'GH_SWARM_TOKEN', 'GHCR_TOKEN', 'GHCR_PUSH_TOKEN')
    $files = @(
        (Join-Path $env:USERPROFILE "launchpad\.env"),
        (Join-Path $WorkspaceRoot "beelink-cleanup\.env"),
        (Join-Path $WorkspaceRoot ".env.github"),
        (Join-Path $AgentsRoot ".env"),
        (Join-Path $WorkspaceRoot ".env"),
        (Join-Path $WorkspaceRoot "li-cursor-agents\.env")
    )

    foreach ($envFile in $files) {
        if (-not (Test-Path $envFile)) { continue }
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $k = $matches[1].Trim()
                if ($k -in $keys) {
                    $v = $matches[2].Trim().Trim('"').Trim("'")
                    if (-not [string]::IsNullOrWhiteSpace($v)) {
                        Set-Item -Path "env:$k" -Value $v
                    }
                }
            }
        }
    }

    if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
    if (-not $env:GH_TOKEN -and $env:GH_SWARM_TOKEN) { $env:GH_TOKEN = $env:GH_SWARM_TOKEN }
}

function Apply-K8sAgentsSecrets {
    param(
        [string]$Namespace = "li-swarm",
        [switch]$RequireGitLab
    )

    if (-not $env:GH_TOKEN) {
        throw "GH_TOKEN required (GitHub API + GHCR pull secret)"
    }
    if ($RequireGitLab -and -not $env:GITLAB_TOKEN) {
        throw "GITLAB_TOKEN required for GitLab-primary git (org policy). Add to launchpad/.env or beelink-cleanup/.env"
    }
    if (-not $env:GITLAB_TOKEN) {
        Write-Warning "GITLAB_TOKEN not set — workers may use GitHub for git until secret is patched"
    }

    $secretArgs = @(
        "create", "secret", "generic", "li-agents-secrets",
        "--from-literal=GH_TOKEN=$($env:GH_TOKEN)",
        "-n", $Namespace, "--dry-run=client", "-o", "yaml"
    )
    if ($env:GH_SWARM_TOKEN) {
        $secretArgs += "--from-literal=GH_SWARM_TOKEN=$($env:GH_SWARM_TOKEN)"
    } elseif ($env:GH_TOKEN) {
        $secretArgs += "--from-literal=GH_SWARM_TOKEN=$($env:GH_TOKEN)"
    }
    if ($env:GITLAB_TOKEN) { $secretArgs += "--from-literal=GITLAB_TOKEN=$($env:GITLAB_TOKEN)" }
    if ($env:CURSOR_API_KEY) { $secretArgs += "--from-literal=CURSOR_API_KEY=$($env:CURSOR_API_KEY)" }
    if ($env:CURSOR_SDK_KEY) { $secretArgs += "--from-literal=CURSOR_SDK_KEY=$($env:CURSOR_SDK_KEY)" }

    kubectl @secretArgs | kubectl apply -f -

    kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
        --docker-server=ghcr.io `
        --docker-username=li-langverse `
        --docker-password=$env:GH_TOKEN `
        --dry-run=client -o yaml | kubectl apply -f -
}

function Restart-K8sGoalDirectedWorkers {
    param([string]$Namespace = "li-swarm")

    $deploys = kubectl -n $Namespace get deploy -l app.kubernetes.io/component=goal-directed-agent -o jsonpath='{.items[*].metadata.name}' 2>$null
    if (-not $deploys) {
        $deploys = @(
            'li-proof-explorer', 'li-pure-li-https', 'li-ph-ml-wave13',
            'li-world-studio-gui-demo-recorder', 'li-world-studio-gui-product-visual',
            'li-world-studio-typography-fx-animation', 'li-world-studio-aimd-demo',
            'li-li-parallel', 'li-ph-sci-simulation-gap-close'
        ) -join ' '
    }
    foreach ($d in ($deploys -split '\s+')) {
        if ([string]::IsNullOrWhiteSpace($d)) { continue }
        Write-Host "==> rollout restart deploy/$d"
        kubectl -n $Namespace rollout restart "deploy/$d" 2>$null
        kubectl -n $Namespace rollout status "deploy/$d" --timeout=180s 2>$null
    }
}
