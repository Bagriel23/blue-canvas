# Stops Blue Canvas processes started by start.ps1.
#Requires -Version 5.1
Param()

$ErrorActionPreference = 'Stop'

foreach ($name in @('api', 'mcp')) {
  $pidFile = Join-Path $PSScriptRoot ".pid.$name"
  if (-not (Test-Path $pidFile)) { continue }
  $pidValue = Get-Content $pidFile
  if (-not $pidValue) { continue }
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($process) {
    Write-Host "Stopping $name (pid $pidValue)"
    Stop-Process -Id $pidValue -Force
  }
  Remove-Item $pidFile -Force
}
