# Restores a backup produced by scripts/windows/backup.ps1.
#Requires -Version 5.1
Param(
  [Parameter(Mandatory)] [string]$Source,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot/_common.ps1"

Invoke-BlueCanvasEnvGuard

if (-not [System.IO.Path]::IsPathRooted($env:ASSET_STORAGE_ROOT)) {
  throw 'ASSET_STORAGE_ROOT must be an absolute path'
}

if (-not ("BlueCanvas_NativeMethods" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class BlueCanvas_NativeMethods
{
    [StructLayout(LayoutKind.Sequential)]
    private struct FileInformation
    {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(
        string name,
        uint access,
        uint share,
        IntPtr security,
        uint creation,
        uint flags,
        IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle handle,
        out FileInformation information);

    public static string GetFileIdentity(string path)
    {
        using (SafeFileHandle handle = CreateFile(
            path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero))
        {
            if (handle.IsInvalid)
                throw new IOException("Cannot open asset root for identity");
            FileInformation information;
            if (!GetFileInformationByHandle(handle, out information))
                throw new IOException("Cannot read asset root identity");
            return string.Format(
                "{0:x8}:{1:x8}{2:x8}",
                information.VolumeSerialNumber,
                information.FileIndexHigh,
                information.FileIndexLow);
        }
    }
}
'@
}

function Test-PathWithin {
  Param([string]$Candidate, [string]$Base)
  $normalizedBase = $Base.TrimEnd([char[]]@('\', '/'))
  return $Candidate.Equals($normalizedBase, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Candidate.StartsWith($normalizedBase + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparseComponents {
  Param([string]$Path)
  $current = Get-Item -LiteralPath $Path -Force
  while ($null -ne $current) {
    if (($current.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing reparse point in ASSET_STORAGE_ROOT: $($current.FullName)"
    }
    $parent = $current.Parent
    if ($null -eq $parent -or $parent.FullName -eq $current.FullName) { break }
    $current = Get-Item -LiteralPath $parent.FullName -Force
  }
}

function Assert-NoReparseTree {
  Param([string]$Path)
  Assert-NoReparseComponents $Path
  foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) {
    if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing reparse point in asset tree: $($child.FullName)"
    }
    if ($child.PSIsContainer) {
      Assert-NoReparseTree $child.FullName
    }
  }
}

function Assert-PrivateDirectory {
  Param([string]$Path)
  $acl = Get-Acl -LiteralPath $Path
  $allowed = @($acl.Owner, 'NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')
  $unsafe = @($acl.Access | Where-Object {
    $_.AccessControlType -eq 'Allow' -and
      $allowed -notcontains $_.IdentityReference.Value
  })
  if ($unsafe.Count -gt 0) {
    throw 'ASSET_STORAGE_ROOT must grant access only to its owner, SYSTEM, and Administrators'
  }
}

$assetRootInput = $env:ASSET_STORAGE_ROOT
$assetRoot = Get-Item -LiteralPath $assetRootInput -Force
if (-not $assetRoot.PSIsContainer) { throw 'ASSET_STORAGE_ROOT must be a real directory' }
$assetRootFull = [System.IO.Path]::GetFullPath($assetRoot.FullName)
if ($assetRootFull.Equals([System.IO.Path]::GetPathRoot($assetRootFull), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing filesystem root'
}
Assert-NoReparseComponents $assetRootFull
Assert-PrivateDirectory $assetRootFull

$userProfile = [Environment]::GetFolderPath('UserProfile')
if ($userProfile -and (Test-PathWithin $assetRootFull $userProfile)) {
  throw 'Refusing a path inside the user profile'
}
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and $repoRoot) {
  $repoFull = [System.IO.Path]::GetFullPath($repoRoot.Trim())
  if (Test-PathWithin $assetRootFull $repoFull) { throw 'Refusing a path inside the repository' }
}
$marker = Join-Path $assetRootFull '.blue-canvas-assets-root'
$markerItem = Get-Item -LiteralPath $marker -Force -ErrorAction Stop
if ($markerItem.PSIsContainer -or ($markerItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Asset root marker must be a regular file'
}
if ((Get-Content -LiteralPath $marker -Raw).TrimEnd("`r", "`n") -ne 'blue-canvas-assets-v1') {
  throw 'Unexpected Blue Canvas asset root marker'
}

$assetRootIdentity = [BlueCanvas_NativeMethods]::GetFileIdentity($assetRootFull)
$markerIdentity = [BlueCanvas_NativeMethods]::GetFileIdentity($marker)

function Assert-AssetRootIdentity {
  $current = Get-Item -LiteralPath $assetRootInput -Force -ErrorAction Stop
  if (-not $current.PSIsContainer -or ($current.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Asset root changed during restore'
  }
  $currentFull = [System.IO.Path]::GetFullPath($current.FullName)
  if (-not $currentFull.Equals($assetRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Asset root changed during restore'
  }
  if ([BlueCanvas_NativeMethods]::GetFileIdentity($currentFull) -ne $assetRootIdentity) {
    throw 'Asset root identity changed during restore'
  }
  Assert-NoReparseComponents $currentFull
  Assert-PrivateDirectory $currentFull
  $currentMarker = Get-Item -LiteralPath $marker -Force -ErrorAction Stop
  if ($currentMarker.PSIsContainer -or ($currentMarker.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Asset root marker changed during restore'
  }
  if ([BlueCanvas_NativeMethods]::GetFileIdentity($marker) -ne $markerIdentity) {
    throw 'Asset root marker identity changed during restore'
  }
  if ((Get-Content -LiteralPath $marker -Raw).TrimEnd("`r", "`n") -ne 'blue-canvas-assets-v1') {
    throw 'Asset root marker changed during restore'
  }
}

$sourceFull = (Resolve-Path -LiteralPath $Source -ErrorAction Stop).Path
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

Assert-AssetRootIdentity
Assert-NoReparseTree $assetRootFull
$children = @(Get-ChildItem -LiteralPath $assetRootFull -Force)
foreach ($child in $children) {
  if ($child.FullName.Equals($marker, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
  Assert-AssetRootIdentity
  $currentChild = Get-Item -LiteralPath $child.FullName -Force -ErrorAction Stop
  if (($currentChild.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing reparse point during asset cleanup: $($currentChild.FullName)"
  }
  if ($currentChild.PSIsContainer) {
    [System.IO.Directory]::Delete($currentChild.FullName, $true)
  } else {
    [System.IO.File]::Delete($currentChild.FullName)
  }
}
Assert-AssetRootIdentity
& tar -xzf $assetsFile -C $assetRootFull
if ($LASTEXITCODE -ne 0) { throw 'Asset archive extraction failed' }
Assert-AssetRootIdentity
Assert-NoReparseTree $assetRootFull

Write-Host "Restored from $sourceFull into $env:DATABASE_NAME"
