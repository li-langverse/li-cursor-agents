# Apply GitLab CI/CD variables for li-langverse migration pipelines.
#
# Purpose:
#   Idempotently upsert group- or project-level CI variables needed after the
#   GitHub Actions → GitLab CI migration (see MIGRATION.md). Prefers group
#   li-langverse; falls back to per-project variables when the PAT lacks Owner
#   access on the group.
#
# Prerequisites:
#   - li/.env.local and/or li/.env.gitlab with:
#       GITLAB_TOKEN          (required) - GitLab API + pipeline clone/push
#       GH_PACKAGES or GHCR_TOKEN (required) - GHCR image publish jobs
#       GHCR_USER             (optional) - defaults to gitlab-ci
#   - PAT scopes: api (minimum). Group variables need Owner (access_level 50);
#     Maintainer (40) can set project-level variables on CI repos.
#   - Network reachability to gitlab.lilangverse.xyz API.
#
# Variables applied:
#   GITLAB_TOKEN              masked, protected  ← env GITLAB_TOKEN
#   GHCR_TOKEN                masked, protected  ← env GH_PACKAGES or GHCR_TOKEN
#   GHCR_USER                 plain, unprotected ← env GHCR_USER or gitlab-ci
#   LI_BENCHMARKS_DISPATCH_TOKEN (optional, -IncludeDispatch)
#                             masked, protected  ← env LI_BENCHMARKS_DISPATCH_TOKEN or GITLAB_TOKEN
#
# Usage (from li-cursor-agents repo root):
#   .\scripts\apply-gitlab-ci-variables.ps1
#   .\scripts\apply-gitlab-ci-variables.ps1 -DryRun
#   .\scripts\apply-gitlab-ci-variables.ps1 -Force
#   .\scripts\apply-gitlab-ci-variables.ps1 -IncludeDispatch
#   .\scripts\apply-gitlab-ci-variables.ps1 -Projects lic,benchmarks -SkipGroup
#
# Pipeline schedules (GitLab UI, not this script): SCHEDULE_KIND per MIGRATION.md.
# Manual-only variables (not persisted here): DISPATCH_BENCHMARKS, FUZZ_MAX_TOTAL_TIME_INPUT.

param(
    [string]$GitlabApiUrl = "https://gitlab.lilangverse.xyz/api/v4",
    [string]$GroupPath = "li-langverse",
    [int]$GroupId = 0,
    [string[]]$Projects = @("lic", "benchmarks", "li-cursor-agents", "li-httpd", "lib"),
    [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
    [switch]$Force,
    [switch]$DryRun,
    [switch]$SkipGroup,
    [switch]$IncludeDispatch
)

$ErrorActionPreference = "Stop"

function Import-DotEnvKeys {
    param(
        [string[]]$Paths,
        [string[]]$Keys
    )
    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) { continue }
        Get-Content $path | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $k = $matches[1].Trim()
                if ($k -in $Keys -and -not (Get-Item -Path "env:$k" -ErrorAction SilentlyContinue)) {
                    $v = $matches[2].Trim().Trim('"').Trim("'")
                    if ($v) { Set-Item -Path "env:$k" -Value $v }
                }
            }
        }
    }
}

function Get-GitlabHeaders {
    param([string]$Token)
    return @{ "PRIVATE-TOKEN" = $Token }
}

function Resolve-GitlabGroupId {
    param(
        [string]$Path,
        [int]$PreferredId,
        [hashtable]$Headers
    )
    if ($PreferredId -gt 0) {
        Write-Host "  using group id $PreferredId ($Path)"
        return $PreferredId
    }
    $encoded = [uri]::EscapeDataString($Path)
    $uri = "$GitlabApiUrl/groups/$encoded"
    if ($DryRun) {
        Write-Host "[dry-run] GET $uri (resolve group id)"
        return 4
    }
    $group = Invoke-RestMethod -Uri $uri -Headers $Headers -Method Get
    Write-Host "  resolved group id $($group.id) ($Path)"
    return [int]$group.id
}

function Get-ExistingVariableKeys {
    param(
        [string]$Scope,
        [string]$Target,
        [hashtable]$Headers
    )
    $encoded = [uri]::EscapeDataString($Target)
    $uri = if ($Scope -eq "group") {
        "$GitlabApiUrl/groups/$encoded/variables?per_page=100"
    } else {
        "$GitlabApiUrl/projects/$encoded/variables?per_page=100"
    }
    if ($DryRun) {
        Write-Host "[dry-run] GET $uri"
        return @()
    }
    try {
        $vars = Invoke-RestMethod -Uri $uri -Headers $Headers -Method Get
        return @($vars | ForEach-Object { $_.key })
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        return @{ Error = $status; Message = $_.Exception.Message }
    }
}

function Set-GitlabVariable {
    param(
        [string]$Scope,
        [string]$Target,
        [hashtable]$Headers,
        [hashtable]$VarDef,
        [string[]]$ExistingKeys
    )
    $key = $VarDef.key
    $encodedTarget = [uri]::EscapeDataString($Target)
    $baseUri = if ($Scope -eq "group") {
        "$GitlabApiUrl/groups/$encodedTarget/variables"
    } else {
        "$GitlabApiUrl/projects/$encodedTarget/variables"
    }

    $body = @{
        key           = $key
        value         = $VarDef.value
        masked        = [bool]$VarDef.masked
        protected     = [bool]$VarDef.protected
        raw           = [bool]$VarDef.raw
        variable_type = "env_var"
    }

    $exists = $ExistingKeys -contains $key
    if ($exists -and -not $Force) {
        Write-Host "  skip $key (exists; use -Force to update)"
        return "skipped"
    }

    try {
        if ($exists) {
            Write-Host "  update $key"
            if ($DryRun) {
                Write-Host "[dry-run] PUT $baseUri/$key"
            } else {
                Invoke-RestMethod -Uri "$baseUri/$key" -Method Put -Headers $Headers -Body $body | Out-Null
            }
            return "updated"
        }
        Write-Host "  create $key"
        if ($DryRun) {
            Write-Host "[dry-run] POST $baseUri"
        } else {
            Invoke-RestMethod -Uri $baseUri -Method Post -Headers $Headers -Body $body | Out-Null
        }
        return "created"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Warning "  failed $key ($status): $($_.Exception.Message)"
        return "failed"
    }
}

function Apply-VariableSet {
    param(
        [string]$Scope,
        [string]$Target,
        [hashtable]$Headers,
        [array]$Defs
    )
    $existing = Get-ExistingVariableKeys -Scope $Scope -Target $Target -Headers $Headers
    if ($existing -is [hashtable] -and $existing.Error) {
        return @{ Error = $existing.Error; Message = $existing.Message }
    }
    $stats = @{ created = 0; updated = 0; skipped = 0; failed = 0 }
    foreach ($def in $Defs) {
        $result = Set-GitlabVariable -Scope $Scope -Target $Target -Headers $Headers -VarDef $def -ExistingKeys $existing
        $stats[$result]++
    }
    return $stats
}

# --- load env (li/.env.local then li/.env.gitlab) ---
$envFiles = @(
    (Join-Path $WorkspaceRoot ".env.local"),
    (Join-Path $WorkspaceRoot ".env.gitlab")
)
Import-DotEnvKeys -Paths $envFiles -Keys @(
    "GITLAB_TOKEN", "GHCR_TOKEN", "GH_PACKAGES", "GHCR_USER", "LI_BENCHMARKS_DISPATCH_TOKEN"
)

if (-not $env:GITLAB_TOKEN) {
    throw "GITLAB_TOKEN required in $WorkspaceRoot\.env.local or .env.gitlab"
}

$ghcrValue = $null
if ($env:GHCR_TOKEN) {
    $ghcrValue = $env:GHCR_TOKEN
} elseif ($env:GH_PACKAGES) {
    $ghcrValue = $env:GH_PACKAGES
} else {
    throw "GHCR_TOKEN or GH_PACKAGES required in .env.local or .env.gitlab for publish jobs"
}

$ghcrUser = if ($env:GHCR_USER) { $env:GHCR_USER } else { "gitlab-ci" }

$variableDefs = @(
    @{
        key       = "GITLAB_TOKEN"
        value     = $env:GITLAB_TOKEN
        masked    = $true
        protected = $true
        raw       = $false
    },
    @{
        key       = "GHCR_TOKEN"
        value     = $ghcrValue
        masked    = $true
        protected = $true
        raw       = $false
    },
    @{
        key       = "GHCR_USER"
        value     = $ghcrUser
        masked    = $false
        protected = $false
        raw       = $false
    }
)

if ($IncludeDispatch) {
    $dispatchValue = if ($env:LI_BENCHMARKS_DISPATCH_TOKEN) {
        $env:LI_BENCHMARKS_DISPATCH_TOKEN
    } else {
        $env:GITLAB_TOKEN
    }
    $variableDefs += @{
        key       = "LI_BENCHMARKS_DISPATCH_TOKEN"
        value     = $dispatchValue
        masked    = $true
        protected = $true
        raw       = $false
    }
}

$headers = Get-GitlabHeaders -Token $env:GITLAB_TOKEN
$groupApplied = $false

Write-Host "==> GitLab CI variables (group=$GroupPath, projects=$($Projects -join ', '))"
if ($DryRun) { Write-Host "    (dry-run - no writes)" }
if ($IncludeDispatch) { Write-Host "    (including LI_BENCHMARKS_DISPATCH_TOKEN)" }

if (-not $SkipGroup) {
    Write-Host "`n==> group $GroupPath"
    $resolvedGroupId = Resolve-GitlabGroupId -Path $GroupPath -PreferredId $GroupId -Headers $headers
    $groupTarget = "$resolvedGroupId"
    $groupResult = Apply-VariableSet -Scope "group" -Target $groupTarget -Headers $headers -Defs $variableDefs
    if ($groupResult -is [hashtable] -and $groupResult.Error) {
        $status = $groupResult.Error
        if ($status -eq 403) {
            Write-Warning "Group variables API returned 403 - needs Owner PAT (access_level 50)."
        } else {
            Write-Warning "Group variables API returned $status - $($groupResult.Message)"
        }
        Write-Warning "Maintainer tokens (access_level 40) can manage project variables only."
        Write-Host "Falling back to project-level variables."
    } elseif ($groupResult.failed -eq 0) {
        $groupApplied = $true
        Write-Host "Group variables applied (created=$($groupResult.created) updated=$($groupResult.updated) skipped=$($groupResult.skipped))"
    } else {
        Write-Warning "Group apply had failures; falling back to project-level variables."
    }
}

if (-not $groupApplied) {
    foreach ($project in $Projects) {
        $projectPath = "$GroupPath/$project"
        Write-Host "`n==> project $projectPath"
        $projectResult = Apply-VariableSet -Scope "project" -Target $projectPath -Headers $headers -Defs $variableDefs
        if ($projectResult -is [hashtable] -and $projectResult.Error) {
            Write-Warning "  cannot list variables ($($projectResult.Error)) - check Maintainer access on $projectPath"
            continue
        }
        Write-Host "  done (created=$($projectResult.created) updated=$($projectResult.updated) skipped=$($projectResult.skipped) failed=$($projectResult.failed))"
    }
}

Write-Host "`nDone. Schedule variables (SCHEDULE_KIND) must still be created in GitLab UI per MIGRATION.md."
