# Enable OpenSSH Server + Cursor My Machines worker at Windows boot/logon.
# Run once as Administrator from this repo:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   cd <path-to>/li-cursor-agents
#   .\scripts\windows\enable-boot-ssh-and-cursor.ps1
param(
    [switch]$SkipSsh,
    [switch]$SkipCursorWorker,
    [string]$WorkerName = $(if ($env:CURSOR_WORKER_NAME) { $env:CURSOR_WORKER_NAME } else { $env:COMPUTERNAME }),
    [string]$TaskName = "LiCursorMyMachinesWorker"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$WorkerScript = Join-Path $PSScriptRoot "start-cursor-worker.ps1"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $SkipSsh) {
    if (-not (Test-IsAdmin)) {
        Write-Host "Re-launching elevated for OpenSSH setup..."
        $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -WorkerName `"$WorkerName`" -TaskName `"$TaskName`""
        if ($SkipCursorWorker) { $arg += " -SkipCursorWorker" }
        Start-Process powershell.exe -Verb RunAs -ArgumentList $arg -Wait
        exit $LASTEXITCODE
    }

    Write-Host "==> OpenSSH Server"
    $cap = Get-WindowsCapability -Online | Where-Object Name -eq "OpenSSH.Server~~~~0.0.1.0"
    if ($cap.State -ne "Installed") {
        Write-Host "    Installing OpenSSH.Server..."
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Host
    }
    Set-Service -Name sshd -StartupType Automatic
    Start-Service sshd
    if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name OpenSSH-Server-In-TCP -DisplayName "OpenSSH Server (sshd)" `
            -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }
    Get-Service sshd | Format-Table Name, Status, StartType -AutoSize
}

if (-not $SkipCursorWorker) {
    Write-Host ""
    Write-Host "==> Cursor My Machines worker at logon"
    if (-not (Test-Path $WorkerScript)) {
        throw "Missing worker script: $WorkerScript"
    }

    $taskArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WorkerScript`" -WorkerName `"$WorkerName`""
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument $taskArgs `
        -WorkingDirectory $RepoRoot

    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 2) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)

    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Force | Out-Null

    Write-Host "    Repo: $RepoRoot"
    Write-Host "    Worker name: $WorkerName"
    Write-Host "    Scheduled task: $TaskName (At logon)"
    Get-ScheduledTask -TaskName $TaskName | Format-Table TaskName, State -AutoSize
    Start-ScheduledTask -TaskName $TaskName
}

Write-Host ""
Write-Host "Done. After reboot:"
Write-Host "  - sshd: Automatic (Remote SSH)"
Write-Host "  - ${TaskName}: My Machines worker (pool: CURSOR_WORKER_POOL=1 + CURSOR_API_KEY)"
