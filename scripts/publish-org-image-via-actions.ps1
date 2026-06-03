# Publish :latest via GitHub Actions (uses GITHUB_TOKEN packages:write — no local write:packages PAT).
param(
    [string]$Ref = "main",
    [string]$Repo = "li-langverse/li-cursor-agents"
)

$ErrorActionPreference = "Stop"
$wf = "Publish org-issue worker image"

Write-Host "==> gh workflow run '$wf' --repo $Repo --ref $Ref -f ref=$Ref"
gh workflow run $wf --repo $Repo --ref $Ref -f "ref=$Ref" 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "gh failed (rate limit or missing workflow scope). Use the UI instead:"
    Write-Host "  https://github.com/$Repo/actions/workflows/publish-org-issue-image.yml"
    Write-Host "  → Run workflow → ref = $Ref"
    exit $LASTEXITCODE
}

Write-Host "==> watching latest run..."
Start-Sleep -Seconds 3
gh run list --repo $Repo --workflow $wf --limit 1 2>&1 | Out-Host
Write-Host ""
Write-Host "When green, cluster pods using :latest will pull the new image on next create (imagePullPolicy IfNotPresent: delete pod or rollout restart)."
