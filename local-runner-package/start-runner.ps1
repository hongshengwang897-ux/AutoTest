$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = netstat -ano | Select-String "127.0.0.1:3210\s+0.0.0.0:0\s+LISTENING" | Select-Object -First 1
if ($listener) {
  Write-Host "AutoTest Local Runner is already running."
  exit 0
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js was not found. Run install-and-start.bat first."
  exit 1
}

$env:AUTOTEST_LOCAL_RUNNER = "1"
$env:AUTOTEST_ALLOWED_ORIGINS = "http://172.16.18.100:5173,http://127.0.0.1:5173,http://localhost:5173"

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $env:ComSpec
$startInfo.Arguments = "/k node engine\local-runner.js"
$startInfo.WorkingDirectory = $packageRoot
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
[void][System.Diagnostics.Process]::Start($startInfo)

Write-Host "AutoTest Local Runner started."
Start-Sleep -Seconds 2
