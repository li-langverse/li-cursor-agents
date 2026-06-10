# Configure GitLab-primary remotes on local li-langverse clones (org policy).
# origin -> GitLab; github -> fetch-only mirror. Token-free URLs (use GITLAB_TOKEN via credential helper).
param(
    [string[]]$Repos = @("studio", "lic", "li-cursor-agents", "benchmarks", "lib", "li-httpd", "lis", "lit"),
    [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [string]$GitLabHost = "gitlab.lilangverse.xyz",
    [string]$GitLabGroup = "li-langverse",
    [string]$GitHubOrg = "li-langverse"
)

$ErrorActionPreference = "Stop"
$gitlabBase = "https://${GitLabHost}/${GitLabGroup}"
$githubBase = "https://github.com/${GitHubOrg}"

function Test-GitRemote {
    param([string]$Name)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $null = git remote get-url $Name 2>$null
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    return $ok
}

function Set-LiLangverseRemotes {
    param([string]$RepoDir, [string]$RepoName)

    if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
        Write-Host "skip: $RepoName (no .git)"
        return
    }

    $originUrl = "${gitlabBase}/${RepoName}.git"
    $githubUrl = "${githubBase}/${RepoName}.git"

    Push-Location $RepoDir
    try {
        if (Test-GitRemote "origin") {
            $cur = (git remote get-url origin).Trim()
            if ($cur -match "github\.com") {
                if (-not (Test-GitRemote "github")) {
                    git remote add github $cur
                }
            }
            git remote set-url origin $originUrl
        } else {
            git remote add origin $originUrl
        }

        if (Test-GitRemote "github") {
            git remote set-url github $githubUrl
        } else {
            git remote add github $githubUrl
        }
        git config remote.github.fetch "+refs/heads/*:refs/remotes/github/*"
        git remote set-url --push github DISABLED 2>$null
        if ($LASTEXITCODE -ne 0) {
            git config remote.github.pushurl DISABLED
        }

        if (Test-GitRemote "gitlab") {
            git remote remove gitlab
        }

        Write-Host "OK: $RepoName - origin=GitLab, github=mirror (fetch-only)"
    } finally {
        Pop-Location
    }
}

foreach ($name in $Repos) {
    $dir = Join-Path $WorkspaceRoot $name
    if (-not (Test-Path $dir)) {
        Write-Host "skip: $name (directory missing)"
        continue
    }
    Set-LiLangverseRemotes -RepoDir $dir -RepoName $name
}

Write-Host ""
Write-Host "Homelab-k3s and cap-jmk-launchpad repos are GitHub-primary - not modified."
Write-Host "Auth: copy .env.gitlab.example to li/.env.gitlab, then homelab-k3s/scripts/windows-git-auth-setup.ps1"
