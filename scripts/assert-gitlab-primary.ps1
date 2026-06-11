# Assert GitLab origin/main is ahead of (or equal to) GitHub mirror for li-langverse repos.
param(
    [string[]]$Repos = @("lic", "benchmarks", "li-cursor-agents"),
    [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = "Stop"
$fail = 0

foreach ($name in $Repos) {
    $dir = Join-Path $WorkspaceRoot $name
    if (-not (Test-Path (Join-Path $dir ".git"))) {
        Write-Warning "skip $name (no .git)"
        continue
    }
    Push-Location $dir
    try {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $null = git fetch origin main 2>&1
        $null = git fetch github main 2>&1
        $ErrorActionPreference = $prevEap
        $gitlab = (git rev-parse origin/main).Trim()
        $github = (git rev-parse github/main 2>$null).Trim()
        if (-not $github) {
            Write-Host "OK $name - GitLab $gitlab (no github/main ref)"
            continue
        }
        git merge-base --is-ancestor $github $gitlab 2>$null
        if ($LASTEXITCODE -eq 0) {
            if ($gitlab -eq $github) {
                Write-Host "OK $name - in sync ($gitlab)"
            } else {
                Write-Host "OK $name - GitLab ahead (gitlab=$gitlab github=$github)"
            }
        } else {
            Write-Host "FAIL $name - GitHub ahead of GitLab (gitlab=$gitlab github=$github)" -ForegroundColor Red
            Write-Host "      Fix: merge github/main into main, push origin main, run gitlab-github-mirror"
            $fail++
        }
    } finally {
        Pop-Location
    }
}

if ($fail -gt 0) { exit 1 }
Write-Host ""
Write-Host "GitLab-primary check passed ($($Repos.Count) repos)."
