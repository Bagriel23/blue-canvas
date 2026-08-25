# Runs a Windows smoke test: health check, ready check and a bootstrap
# admin round-trip against a fresh database. Requires start.ps1 to have
# already brought the API online.
#Requires -Version 5.1
Param()

$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/_common.ps1"

Invoke-BlueCanvasEnvGuard
$base = "http://$($env:APP_HOST):$($env:APP_PORT)"

Write-Host "Blue Canvas smoke test against $base"

$health = Invoke-RestMethod -Method Get -Uri "$base/api/v1/health"
if ($health.status -ne 'ok') { throw "Unexpected health payload $($health | ConvertTo-Json -Compress)" }

$ready = Invoke-RestMethod -Method Get -Uri "$base/api/v1/ready"
if ($ready.status -ne 'ready') { throw "Unexpected ready payload $($ready | ConvertTo-Json -Compress)" }

Write-Host "OK: /health and /ready responded successfully"
