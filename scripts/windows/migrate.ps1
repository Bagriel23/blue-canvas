# Runs Prisma migrations against the configured DATABASE_*.
#Requires -Version 5.1
Param()

$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/_common.ps1"

Invoke-BlueCanvasEnvGuard
Invoke-BlueCanvasNpmCi
& npm run db:migrate
