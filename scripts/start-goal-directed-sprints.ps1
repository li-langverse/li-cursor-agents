# Launch parallel goal-directed SDK sprints (outside async swarm).
# Pattern: li-cursor-agents/scripts/goal-directed-loop.sh + per-sprint goal file.
param(
    [int]$Max = 0,  # 0 = no iteration cap; stop on completion gate only
    [string]$UntilLocal = "",
    [ValidateSet("all", "studio", "lig", "ph-ml", "ph-ml-li-array", "world-studio", "world-studio-runnable", "world-studio-gui-library", "world-studio-gui-polish", "world-studio-aimd-demo", "benchmarks", "benchmarks-dashboard", "li-toml-config", "swarm", "org-prs", "org-prs-dirty", "org-prs-ci")]
    [string]$Sprint = "all",
    [switch]$DryRun,
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$Work = Split-Path $PSScriptRoot -Parent
$Goals = Join-Path $Work "data\goal-directed-sprints"
$Logs = Join-Path $Goals "logs"
$Agents = Join-Path $Work "li-cursor-agents"
$Bash = "C:\Program Files\Git\bin\bash.exe"

New-Item -ItemType Directory -Force -Path $Logs | Out-Null

# Secrets load order (later wins): .env.github -> li-cursor-agents/.env -> .env
# Empty values are ignored so a blank line cannot wipe an earlier token.
foreach ($f in @(
        (Join-Path $Work ".env.github"),
        (Join-Path $Work "li-cursor-agents\.env"),
        (Join-Path $Work ".env")
    )) {
    if (-not (Test-Path $f)) { continue }
    Get-Content $f | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $k = $matches[1].Trim()
            $v = $matches[2].Trim()
            if ($k -in @('CURSOR_MOCK', 'CURSOR_SDK')) { return }
            if ([string]::IsNullOrWhiteSpace($v)) { return }
            Set-Item -Path "env:$k" -Value $v
        }
    }
}
Remove-Item Env:CURSOR_MOCK, Env:CURSOR_SDK -ErrorAction SilentlyContinue
if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GITHUB_TOKEN -and $env:GH_TOKEN) { $env:GITHUB_TOKEN = $env:GH_TOKEN }
if (-not $env:CURSOR_API_KEY -and $env:CURSOR_SDK_KEY) { $env:CURSOR_API_KEY = $env:CURSOR_SDK_KEY }

$env:LI_CONTROL_PLANE_STORE = "disk"
$env:LI_SDK_TERMINAL_STREAM = "1"
$env:LI_CURSOR_AGENTS_ROOT = $Agents
$env:BENCHMARKS_ROOT = Join-Path $Work "benchmarks"
$env:LIC_ROOT = Join-Path $Work "lic"
$env:LI_SWARM_EXTERNAL = "1"
$env:PATH = "C:\Program Files\Git\bin;C:\Program Files\LLVM\bin;" + $env:PATH
# lic prebuild (implementer gate) ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â clang 22 on PATH; set LLVM_DIR when cmake package exists
$llvmCmake = "C:\Program Files\LLVM\lib\cmake\llvm"
if (Test-Path $llvmCmake) {
    $env:LLVM_DIR = $llvmCmake
}
$env:CC = "clang"
$env:CXX = "clang++"

if (-not (Test-Path $Bash)) {
    throw "Git Bash required at $Bash"
}
if (-not $env:CURSOR_API_KEY -and -not $env:CURSOR_SDK_KEY) {
    throw "CURSOR_API_KEY not set. Add to li-cursor-agents\.env or workspace .env"
}

if (-not (Test-Path (Join-Path $Agents "dist\cli\run-agent.js"))) {
    Write-Host "Building li-cursor-agents..."
    Push-Location $Agents
    npm ci 2>&1 | Out-Host
    npm run build 2>&1 | Out-Host
    Pop-Location
}
if ($BuildOnly) { exit 0 }

$sprints = @(
    @{
        Id       = "studio"
        Agent    = "code_implementer"
        Repo     = "lic"
        Cwd      = "../lic"
        GoalRel  = "../data/goal-directed-sprints/studio-gpu-decorator.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_STACK_SKIP_SUPABASE = "1"
        }
    },
        @{
        Id       = "lig"
        Agent    = "code_implementer"
        Repo     = "lic"
        Cwd      = "../lic"
        GoalRel  = "../data/goal-directed-sprints/lig-lkir-ph-hw.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_STACK_SKIP_SUPABASE = "1"
        }
    },
    @{
        Id       = "ph-ml-li-array"
        Agent    = "code_implementer"
        Repo     = "lic"
        Cwd      = "../lic"
        GoalRel  = "../lic/data/goal-directed-sprints/ph-ml-li-array-competitive.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "60"
            LIC = "../lic/build-wsl/compiler/lic/lic"
        }
    },
    @{
        Id       = "ph-ml"
        Agent    = "code_implementer"
        Repo     = "lic"
        Cwd      = "../lic"
        GoalRel  = "../lic/data/goal-directed-sprints/ph-ml-dl-rl-llm-wave13-final.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "60"
            LIC = "../lic/build-wsl/compiler/lic/lic"
        }
    },
    @{
        Id       = "world-studio-runnable"
        Agent    = "world_studio_builder"
        Repo     = "lic"
        Cwd      = "../lic"
        GoalRel  = "../data/goal-directed-sprints/world-studio-runnable-installer.md"
        ExtraEnv = @{
            WORLD_STUDIO_GATES_WSL = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "45"
            LIC = "../lic/build-wsl/compiler/lic/lic"
        }
    },
    @{
        Id       = "world-studio"
        Agent    = "world_studio_builder"
        Repo     = "lic"
        Cwd      = "../lic"
        GoalRel  = "../data/goal-directed-sprints/world-studio-master-plan.md"
        ExtraEnv = @{
            WORLD_STUDIO_GATES_WSL = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "45"
        }
    },
    @{
        Id       = "world-studio-gui-library"
        Agent    = "world_studio_builder"
        Repo     = "studio"
        Cwd      = "../studio"
        GoalRel  = "../data/goal-directed-sprints/world-studio-gui-library-plan.md"
        ExtraEnv = @{
            WORLD_STUDIO_GATES_WSL = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "45"
            LIC = "../lic/build-wsl/compiler/lic/lic"
        }
    },
    @{
        Id       = "world-studio-gui-polish"
        Agent    = "world_studio_builder"
        Repo     = "studio"
        Cwd      = "../studio"
        GoalRel  = "../data/goal-directed-sprints/world-studio-gui-polish.md"
        ExtraEnv = @{
            LI_GOAL_GATE_PREFER_CWD = "1"
            WORLD_STUDIO_GATES_WSL = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "45"
            LIC = "../lic/build-wsl/compiler/lic/lic"
        }
    },
    @{
        Id       = "world-studio-aimd-demo"
        Agent    = "world_studio_builder"
        Repo     = "studio"
        Cwd      = "../studio"
        GoalRel  = "../studio/data/goal-directed-sprints/world-studio-aimd-demo.md"
        ExtraEnv = @{
            LI_GOAL_GATE_PREFER_CWD = "0"
            WORLD_STUDIO_GATES_WSL = "1"
            LI_GOAL_LOOP_SLEEP_SEC = "60"
            LIC = "../lic/build-wsl/compiler/lic/lic"
        }
    },
    @{
        Id       = "benchmarks"
        Agent    = "bug_fixer"
        Repo     = "benchmarks"
        Cwd      = "../benchmarks"
        GoalRel  = "../data/goal-directed-sprints/benchmarks-fix.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_STACK_SKIP_SUPABASE = "1"
            SKIP_EXPLOITS = "1"
            BENCH_MIN_RUNS = "3"
        }
    },
    @{
        Id       = "benchmarks-dashboard"
        Agent    = "bug_fixer"
        Repo     = "benchmarks"
        Cwd      = "../benchmarks"
        GoalRel  = "../data/goal-directed-sprints/benchmarks-dashboard-completeness.md"
        # Windows: skip lic prebuild gate until LLVM_DIR cmake is installed; ingest/catalog is Python-first
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_STACK_SKIP_SUPABASE = "1"
        }
    },    @{
        Id       = "li-toml-config"
        Agent    = "code_implementer"
        Repo     = "li-httpd"
        Cwd      = "../li-httpd"
        GoalRel  = "../data/goal-directed-sprints/li-toml-config-migration.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_GOAL_LOOP_SLEEP_SEC             = "120"
            LI_TOML_ROOT                       = "../li-toml"
        }
    },
    @{
        Id       = "swarm"
        Agent    = "code_implementer"
        Repo     = "li-cursor-agents"
        Cwd      = "."
        GoalRel  = "../data/goal-directed-sprints/self-healing-swarm.md"
    },
    @{
        Id       = "org-prs"
        Agent    = "code_implementer"
        Repo     = "li-cursor-agents"
        Cwd      = ".."
        GoalRel  = "../data/goal-directed-sprints/org-pr-merge-zero-new.md"
        ExtraEnv = @{
            LI_SKIP_IMPLEMENTER_PREFLIGHT_GATE = "1"
            LI_STACK_SKIP_SUPABASE             = "1"
            LI_GOAL_LOOP_SLEEP_SEC             = "120"
        }
    }
)

function To-GitBashPath {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        $p = (Resolve-Path -LiteralPath $Path).Path
    } else {
        $p = [System.IO.Path]::GetFullPath($Path)
    }
    $p = $p -replace '\\', '/'
    if ($p -match '^([A-Za-z]):') { return '/' + $Matches[1].ToLower() + $p.Substring(2) }
    return $p
}

function Start-SprintJob {
    param($Def)
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $log = Join-Path $Logs "$($Def.Id)-$stamp.log"
    $agentsUnix = To-GitBashPath $Agents
    $benchUnix = To-GitBashPath $env:BENCHMARKS_ROOT
    $licUnix = To-GitBashPath $env:LIC_ROOT

    $key = $env:CURSOR_API_KEY
    if (-not $key) { $key = $env:CURSOR_SDK_KEY }
    $gh = $env:GH_TOKEN
    if (-not $gh) { $gh = $env:GITHUB_TOKEN }
    $extraExports = ""
    if ($gh) {
        $extraExports += "export GH_TOKEN='$gh'`nexport GITHUB_TOKEN='$gh'`n"
    }
    if ($Def.ExtraEnv) {
        foreach ($ek in $Def.ExtraEnv.Keys) {
            $extraExports += "export $($ek)='$($Def.ExtraEnv[$ek])'`n"
        }
    }
    if ($env:LLVM_DIR) {
        $llvmUnix = To-GitBashPath $env:LLVM_DIR
        $extraExports += "export LLVM_DIR='$llvmUnix'`nexport CC=clang CXX=clang++`n"
    }
    $untilLocalExport = ""
    $untilLocalFlag = ""
    if ($UntilLocal) {
        $untilLocalExport = "export LI_GOAL_LOOP_UNTIL_LOCAL='$UntilLocal'`nexport LI_GOAL_LOOP_TZ='Europe/Berlin'`n"
        $untilLocalFlag = " --until-local $UntilLocal"
        Write-Host "  deadline: local $UntilLocal (Europe/Berlin)"
    }
    $loopBody = "./scripts/goal-directed-loop.sh --agent $($Def.Agent) --workflow-repo $($Def.Repo) --cwd $($Def.Cwd) --goal-file $($Def.GoalRel) --max $Max$untilLocalFlag"
    $inner = @(
        "set -uo pipefail"
        "cd '$agentsUnix'"
        "export CURSOR_API_KEY='$key'"
        "export LI_CURSOR_AGENTS_ROOT='$agentsUnix'"
        "export BENCHMARKS_ROOT='$benchUnix'"
        "export LIC_ROOT='$licUnix'"
        "export LI_SWARM_EXTERNAL=1"
        "export LI_SDK_TERMINAL_STREAM=1"
        $untilLocalExport
        $extraExports
        "./scripts/ensure-native-modules.sh || true"
        $loopBody
    ) -join "`n"
    if ($DryRun) {
        Write-Host "=== $($Def.Id) (dry-run) ==="
        $redacted = $inner -replace "export CURSOR_API_KEY='[^']*'", "export CURSOR_API_KEY='***'" -replace "export GH_TOKEN='[^']*'", "export GH_TOKEN='***'" -replace "export GITHUB_TOKEN='[^']*'", "export GITHUB_TOKEN='***'"
        Write-Host $redacted
        Write-Host "  log: $log"
        return
    }

    $sh = Join-Path $Logs "$($Def.Id)-$stamp.sh"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($sh, "#!/usr/bin/env bash`n$inner", $utf8NoBom)

    Write-Host "Starting sprint '$($Def.Id)' -> $log"
    $proc = Start-Process -FilePath $Bash -ArgumentList $sh `
        -RedirectStandardOutput $log -RedirectStandardError (Join-Path $Logs "$($Def.Id)-$stamp.err.log") `
        -PassThru -WindowStyle Hidden
    [PSCustomObject]@{ Id = $Def.Id; Pid = $proc.Id; Log = $log }
}
$started = @()
foreach ($def in $sprints) {
    if ($Sprint -ne "all" -and $def.Id -ne $Sprint) { continue }
    $goalPath = Join-Path $Work ($def.GoalRel -replace '^\.\./', '')
    if (-not (Test-Path $goalPath)) {
        throw "Missing goal file: $goalPath"
    }
    $job = Start-SprintJob -Def $def
    if ($job) { $started += $job }
}

if ($DryRun) { exit 0 }

Write-Host ""
Write-Host "Started $($started.Count) goal-directed sprint(s). Logs:"
$started | ForEach-Object { Write-Host "  $($_.Id) pid=$($_.Pid)  $($_.Log)" }
Write-Host ""
Write-Host "Monitor: Get-Content -Wait <log>"
Write-Host "Stop all: Get-Process -Id $($started.Pid -join ',') | Stop-Process"
