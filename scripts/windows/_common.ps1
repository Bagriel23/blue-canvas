# Shared helpers for Blue Canvas Windows scripts. Loaded via Import-Module.
#Requires -Version 5.1

$script:RequiredEnv = @(
  'APP_HOST',
  'APP_PORT',
  'ASSET_STORAGE_ROOT',
  'SETUP_SECRET',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD'
)

function Invoke-BlueCanvasEnvGuard {
  $missing = @()
  foreach ($name in $script:RequiredEnv) {
    if (-not (Get-Item -Path "env:$name" -ErrorAction SilentlyContinue)) {
      $missing += $name
    }
  }
  if ($missing.Count -gt 0) {
    $joined = $missing -join ', '
    throw "Missing required Blue Canvas environment variables: $joined"
  }
}

function Invoke-BlueCanvasNpmCi {
  if (-not (Test-Path 'node_modules/.package-lock.json')) {
    Write-Host 'Installing npm workspaces (npm ci)...'
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  }
}

Export-ModuleMember -Function Invoke-BlueCanvasEnvGuard, Invoke-BlueCanvasNpmCi
