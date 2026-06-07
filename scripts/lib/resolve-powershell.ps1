# Prefer pwsh when available; fall back to Windows PowerShell (fixes "pwsh not recognized").
function Get-OrgSwarmPowerShell {
    foreach ($cmd in @("pwsh", "powershell")) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) {
            return $cmd
        }
    }
    throw "Neither pwsh nor powershell found on PATH"
}

function Invoke-OrgSwarmPowerShellFile {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments = @()
    )
    $shell = Get-OrgSwarmPowerShell
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) + $Arguments
    & $shell @args
    if ($LASTEXITCODE -ne 0) {
        throw "PowerShell script failed ($shell $ScriptPath): exit $LASTEXITCODE"
    }
}
