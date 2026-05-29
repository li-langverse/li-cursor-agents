# Start Cursor My Machines worker for this repo (Task Scheduler / manual).
# --pool requires team/service API key: CURSOR_WORKER_POOL=1 and CURSOR_API_KEY.
param(
    [string]$WorkerName = $(if ($env:CURSOR_WORKER_NAME) { $env:CURSOR_WORKER_NAME } else { $env:COMPUTERNAME }),
    [string]$WorkerDir = $(if ($env:CURSOR_WORKER_DIR) { $env:CURSOR_WORKER_DIR } else { "" })
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$WorkerRoot = $Root
if ($WorkerDir) {
    $WorkerRoot = (Resolve-Path -LiteralPath $WorkerDir).Path
}
$LogDir = Join-Path $Root "data\runs"
$LogFile = Join-Path $LogDir "cursor-worker-launcher.log"
$WorkerOut = Join-Path $LogDir "cursor-worker-boot.log"
$WorkerErr = Join-Path $LogDir "cursor-worker-boot.err"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LogFile -Value $line
}

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [System.Environment]::GetEnvironmentVariable("Path", "User")

if (-not (Get-Command agent -ErrorAction SilentlyContinue)) {
    Write-Log "ERROR: agent CLI not in PATH"
    exit 1
}

Set-Location $Root
Write-Log "starting agent worker in $WorkerRoot (name=$WorkerName)"

$agentArgs = @("worker", "start", "--name", $WorkerName)
if ($WorkerDir) {
    $agentArgs += @("--worker-dir", $WorkerRoot)
}
if ($env:CURSOR_WORKER_POOL -eq "1" -and $env:CURSOR_API_KEY) {
    $agentArgs = @("worker", "start", "--pool", "--name", $WorkerName)
    if ($WorkerDir) {
        $agentArgs += @("--worker-dir", $WorkerRoot)
    }
    Write-Log "CURSOR_WORKER_POOL=1 with API key - using --pool"
}

$agent = (Get-Command agent).Source
$psArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $agent) + $agentArgs
Start-Process -FilePath "powershell.exe" `
    -ArgumentList $psArgs `
    -WorkingDirectory $WorkerRoot -WindowStyle Hidden `
    -RedirectStandardOutput $WorkerOut -RedirectStandardError $WorkerErr
Write-Log "worker process launched"
