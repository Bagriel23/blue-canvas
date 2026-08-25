# Windows backup wrapper. Writes to backups/<timestamp>/database.sql.gz
# and assets.tar.gz using mysqldump and tar bundled with Laragon / Git Bash.
#Requires -Version 5.1
Param(
  [string]$Destination = "backups/$(Get-Date -Format 'yyyyMMddTHHmmssZ')"
)

$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/_common.ps1"

Invoke-BlueCanvasEnvGuard

$destinationFull = Join-Path (Get-Location) $Destination
New-Item -ItemType Directory -Force -Path $destinationFull | Out-Null

$dumpFile = Join-Path $destinationFull 'database.sql.gz'
$assetsFile = Join-Path $destinationFull 'assets.tar.gz'

& mysqldump `
  --host $env:DATABASE_HOST `
  --port $env:DATABASE_PORT `
  --user $env:DATABASE_USER `
  --password=$env:DATABASE_PASSWORD `
  --single-transaction `
  --routines `
  --triggers `
  --set-gtid-purged=OFF `
  $env:DATABASE_NAME | & gzip | Set-Content -Encoding Byte -Path $dumpFile

& tar --owner=0 --group=0 -czf $assetsFile -C $env:ASSET_STORAGE_ROOT .

Get-FileHash $dumpFile, $assetsFile -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash.ToLower())  $($_.Path)" } |
  Set-Content -Path (Join-Path $destinationFull 'SHA256SUMS')

Write-Host "Backup written to $destinationFull"
