# Restores a backup produced by scripts/windows/backup.ps1.
#Requires -Version 5.1
Param(
  [Parameter(Mandatory)] [string]$Source,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/_common.ps1"

Invoke-BlueCanvasEnvGuard

$assetRoot = Get-Item -LiteralPath $env:ASSET_STORAGE_ROOT -Force
if (-not $assetRoot.PSIsContainer -or $assetRoot.LinkType) { throw 'ASSET_STORAGE_ROOT must be a real directory' }
$assetRootFull = $assetRoot.FullName
if ($assetRootFull -eq [System.IO.Path]::GetPathRoot($assetRootFull)) { throw 'Refusing filesystem root' }
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and $repoRoot) {
  $repoFull = [System.IO.Path]::GetFullPath($repoRoot.Trim())
  if ($assetRootFull -eq $repoFull -or $assetRootFull.StartsWith($repoFull + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Refusing a path inside the repository' }
}
$marker = Join-Path $assetRootFull '.blue-canvas-assets-root'
if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw 'Missing Blue Canvas asset root marker' }

$sourceFull = Resolve-Path $Source
$dumpFile = Join-Path $sourceFull 'database.sql.gz'
$assetsFile = Join-Path $sourceFull 'assets.tar.gz'
$checksumFile = Join-Path $sourceFull 'SHA256SUMS'

foreach ($file in @($dumpFile, $assetsFile, $checksumFile)) {
  if (-not (Test-Path $file)) {
    throw "Missing $file"
  }
}

Push-Location $sourceFull
try {
  Get-Content 'SHA256SUMS' | ForEach-Object {
    $parts = $_ -split '\s+', 2
    $expected = $parts[0]
    $target = $parts[1]
    $actual = (Get-FileHash -Path $target -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected) {
      throw "Checksum mismatch for $target"
    }
  }
} finally {
  Pop-Location
}

$tableCount = & mysql `
  --host $env:DATABASE_HOST `
  --port $env:DATABASE_PORT `
  --user $env:DATABASE_USER `
  --password=$env:DATABASE_PASSWORD `
  --silent --skip-column-names `
  --execute "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$env:DATABASE_NAME'"

if ([int]$tableCount -gt 0 -and -not $Force) {
  throw 'Target database is not empty. Re-run with -Force to overwrite.'
}

& gunzip -c $dumpFile | & mysql `
  --host $env:DATABASE_HOST `
  --port $env:DATABASE_PORT `
  --user $env:DATABASE_USER `
  --password=$env:DATABASE_PASSWORD `
  $env:DATABASE_NAME

if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw 'Asset root changed during restore' }
Get-ChildItem -LiteralPath $assetRootFull -Force | Where-Object { $_.FullName -ne $marker } | Remove-Item -Recurse -Force
if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw 'Asset root changed during restore' }
& tar -xzf $assetsFile -C $assetRootFull

Write-Host "Restored from $sourceFull into $env:DATABASE_NAME"
