# Blue Canvas start script for Windows/Laragon.
# Requires: Node.js 24, npm 11.19.0, Laragon MariaDB/MySQL running on
# DATABASE_HOST:DATABASE_PORT. Assumes the working directory is the
# repository root.
#Requires -Version 5.1
Param()

$ErrorActionPreference = 'Stop'

Import-Module "$PSScriptRoot/_common.ps1"

Invoke-BlueCanvasEnvGuard
Invoke-BlueCanvasNpmCi
Write-Host 'Building Blue Canvas workspaces...'
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'root build failed' }
& npm run build -w @blue-canvas/mcp-server
if ($LASTEXITCODE -ne 0) { throw 'MCP build failed' }
& npm run build -w @blue-canvas/web
if ($LASTEXITCODE -ne 0) { throw 'web build failed' }

Write-Host 'Starting Blue Canvas application server...'
$serverArgs = @('run', 'start', '-w', '@blue-canvas/server')
$serverProcess = Start-Process -FilePath 'npm' -ArgumentList $serverArgs -PassThru -NoNewWindow
$serverProcess.Id | Out-File -FilePath (Join-Path $PSScriptRoot '.pid.api') -Encoding ascii

Write-Host 'Starting Blue Canvas MCP server...'
$mcpEnv = @{
  BLUE_CANVAS_API_URL = "http://$($env:APP_HOST):$($env:APP_PORT)"
  MCP_HOST            = '127.0.0.1'
  MCP_PORT            = '5011'
}
foreach ($key in $mcpEnv.Keys) { Set-Item -Path "env:$key" -Value $mcpEnv[$key] }
$mcpArgs = @('run', 'start', '-w', '@blue-canvas/mcp-server')
$mcpProcess = Start-Process -FilePath 'npm' -ArgumentList $mcpArgs -PassThru -NoNewWindow
$mcpProcess.Id | Out-File -FilePath (Join-Path $PSScriptRoot '.pid.mcp') -Encoding ascii

Write-Host 'Starting Blue Canvas web preview...'
$webArgs = @('run', 'preview', '-w', '@blue-canvas/web')
$webProcess = Start-Process -FilePath 'npm' -ArgumentList $webArgs -PassThru -NoNewWindow
$webProcess.Id | Out-File -FilePath (Join-Path $PSScriptRoot '.pid.web') -Encoding ascii

Write-Host 'Blue Canvas is starting. Use scripts/windows/stop.ps1 to stop.'
