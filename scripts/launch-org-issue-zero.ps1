# Launch org-issue-zero goal-directed sprint (li-cursor-agents).
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root
if (-not $env:GH_TOKEN) {
  $envFile = Join-Path (Split-Path $Root -Parent) ".env.github"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
    }
  }
}
python scripts/org-issue-open-count.py
Write-Host "Starting goal-directed loop with org_issue_triage / code_implementer..."
if (Test-Path "scripts/goal-directed-loop.sh") {
  bash scripts/goal-directed-loop.sh --goal-file data/goal-directed-sprints/org-issue-zero.md --workflow-repo li-cursor-agents
} else {
  Write-Host "Run agent manually with prompts/org-issue-triage-agent.md and org-issue-zero.md"
}
