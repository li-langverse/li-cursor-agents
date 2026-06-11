# Transfer li-langverse research product repos to klaut-pro with klaut-* names.
# Creates cursor/klaut-research-r1b from cursor/li-research-r1b (or main for token-telemetry).
param(
    [switch]$DryRun,
    [switch]$SkipTransfer,
    [switch]$SkipBranches
)

$ErrorActionPreference = "Stop"

$Transfers = @(
    @{ Src = "li-research-gateway"; Dst = "klaut-research-gateway"; BranchFrom = "cursor/li-research-r1b" },
    @{ Src = "li-research-mcp"; Dst = "klaut-research-mcp"; BranchFrom = "cursor/li-research-r1b" },
    @{ Src = "li-research-ingest"; Dst = "klaut-research-ingest"; BranchFrom = "cursor/li-research-r1b" },
    @{ Src = "li-api-kit"; Dst = "klaut-api-kit"; BranchFrom = "cursor/li-research-r1b" },
    @{ Src = "token-telemetry-service"; Dst = "klaut-token-telemetry"; BranchFrom = "main" }
)
$NewBranch = "cursor/klaut-research-r1b"
$TmpRoot = Join-Path $env:TEMP "klaut-research-migrate-$(Get-Date -Format 'yyyyMMddHHmmss')"

function Wait-GhRateLimit {
    $core = gh api rate_limit --jq '.resources.core' | ConvertFrom-Json
    if ($core.remaining -gt 10) { return }
    $resetAt = [DateTimeOffset]::FromUnixTimeSeconds([int64]$core.reset).LocalDateTime
    $waitSec = [math]::Max(5, [int](($resetAt - (Get-Date)).TotalSeconds) + 5)
    Write-Host "GitHub API rate limit low ($($core.remaining)); waiting ${waitSec}s until $resetAt"
    Start-Sleep -Seconds $waitSec
}

function Test-GhRepo {
    param([string]$FullName)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $out = gh repo view $FullName 2>$null
    $ErrorActionPreference = $prev
    return [bool]$out
}

function Ensure-Transferred {
    param([hashtable]$Map)
    $dstFull = "klaut-pro/$($Map.Dst)"
    if (Test-GhRepo $dstFull) {
        Write-Host "  exists: $dstFull"
        return
    }
    $srcFull = "li-langverse/$($Map.Src)"
    if (-not (Test-GhRepo $srcFull)) {
        Write-Error "Source missing: $srcFull"
    }
    if ($DryRun) {
        Write-Host "  [dry-run] transfer $srcFull -> $dstFull"
        return
    }
    Wait-GhRateLimit
    Write-Host "  transfer $srcFull -> $dstFull"
    gh api -X POST "repos/$srcFull/transfer" -f new_owner=klaut-pro -f new_name=$($Map.Dst) | Out-Null
}

function Gh-ApiOk {
    param([string]$Path)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    gh api $Path 2>$null | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    return $ok
}

function Ensure-KlautBranch {
    param([hashtable]$Map)
    $repo = "klaut-pro/$($Map.Dst)"
    if ($DryRun) {
        Write-Host "  [dry-run] branch $NewBranch on $repo from $($Map.BranchFrom)"
        return
    }
    if (Gh-ApiOk "repos/$repo/git/ref/heads/$([uri]::EscapeDataString($NewBranch))") {
        Write-Host "  branch exists: $repo@$NewBranch"
        return
    }
    $from = $Map.BranchFrom
    if (-not (Gh-ApiOk "repos/$repo/git/ref/heads/$([uri]::EscapeDataString($from))")) {
        Write-Warning "  skip branch: $repo missing $from"
        return
    }
    $sha = gh api "repos/$repo/git/ref/heads/$([uri]::EscapeDataString($from))" --jq .object.sha
    Wait-GhRateLimit
    gh api -X POST "repos/$repo/git/refs" -f ref="refs/heads/$NewBranch" -f sha=$sha | Out-Null
    Write-Host "  created $repo@$NewBranch from $from"
}

Write-Host "==> klaut research repo migration (DryRun=$DryRun)"
if (-not $SkipTransfer) {
    foreach ($m in $Transfers) {
        Write-Host "`n--- $($m.Src) -> $($m.Dst) ---"
        Ensure-Transferred -Map $m
    }
}

if (-not $SkipBranches) {
    foreach ($m in $Transfers) {
        Write-Host "`n--- branch $($m.Dst) ---"
        Ensure-KlautBranch -Map $m
    }
}

Write-Host "`n==> verify klaut-pro repos"
foreach ($m in $Transfers) {
    $repo = "klaut-pro/$($m.Dst)"
    $ok = gh repo view $repo --json name,defaultBranchRef --jq '.name' 2>$null
    if ($ok) { Write-Host "  OK $repo" } else { Write-Warning "  MISSING $repo" }
}

Write-Host "`nDone. Restart worker: kubectl -n li-swarm rollout restart deploy/klaut-li-research-product"
