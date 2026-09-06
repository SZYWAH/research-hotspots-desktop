[CmdletBinding()]
param(
  [string]$ReleaseRoot = (Join-Path $PSScriptRoot '..\release\windows'),
  [string]$WorkRoot = (Join-Path $PSScriptRoot '..\src-tauri\target\windows-install-smoke'),
  [string]$ExternalDatabase = '',
  [string]$FinalInstallDir = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProductName = 'Research Hotspots Desktop'
$PreviousVersion = '0.22.0-beta.2'
$CurrentVersion = '0.22.0-beta.3'
$PreviousFullInstaller = Join-Path $ReleaseRoot "$PreviousVersion\Research-Hotspots-Desktop_${PreviousVersion}_x64-full-setup.exe"
$CurrentFullInstaller = Join-Path $ReleaseRoot "$CurrentVersion\Research-Hotspots-Desktop_${CurrentVersion}_x64-full-setup.exe"
$CurrentLiteInstaller = Join-Path $ReleaseRoot "$CurrentVersion\Research-Hotspots-Desktop_${CurrentVersion}_x64-lite-setup.exe"
$IsolatedInstallDir = Join-Path $WorkRoot 'isolated-install'
$SeedDatabase = Join-Path $PSScriptRoot '..\release-assets\default-library\research-hotspots-v7.sqlite'
if ([string]::IsNullOrWhiteSpace($ExternalDatabase)) {
  $ExternalDatabase = Join-Path $WorkRoot 'external-library\research-hotspots-v7.sqlite'
}
if ([string]::IsNullOrWhiteSpace($FinalInstallDir)) {
  $FinalInstallDir = Join-Path $WorkRoot 'final-install'
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Get-UninstallEntries {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($root in $roots) {
    Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
      Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -eq $ProductName } |
      Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString, PSPath
  }
}

function Wait-For-UninstallEntry([string]$Version, [int]$TimeoutSeconds = 30) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $entry = Get-UninstallEntries | Where-Object { $_.DisplayVersion -eq $Version } | Select-Object -First 1
    if ($null -ne $entry) { return $entry }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Uninstall registry entry for $Version was not created."
}

function Invoke-Installer([string]$Installer, [string]$InstallDir) {
  Assert-True (Test-Path -LiteralPath $Installer -PathType Leaf) "Installer missing: $Installer"
  $process = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$InstallDir") -Wait -PassThru -WindowStyle Hidden
  Assert-True ($process.ExitCode -eq 0) "Installer exited with code $($process.ExitCode): $Installer"
}

function Invoke-Uninstaller($Entry) {
  $escapedQuote = ([string][char]92) + [char]34
  $command = ([string]$Entry.UninstallString).Replace($escapedQuote, [string][char]34).Trim()
  Assert-True (-not [string]::IsNullOrWhiteSpace($command)) 'UninstallString is empty.'
  if ($command.StartsWith('"')) {
    $closing = $command.IndexOf('"', 1)
    Assert-True ($closing -gt 1) "Invalid quoted UninstallString: $command"
    $executable = $command.Substring(1, $closing - 1)
  } else {
    $executable = ($command -split '\s+', 2)[0]
  }
  Assert-True (Test-Path -LiteralPath $executable -PathType Leaf) "Uninstaller missing: $executable"
  $process = Start-Process -FilePath $executable -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  Assert-True ($process.ExitCode -eq 0) "Uninstaller exited with code $($process.ExitCode)."
}

function Get-EntryInstallDirectory($Entry) {
  if ($Entry.PSObject.Properties['InstallLocation'] -and -not [string]::IsNullOrWhiteSpace([string]$Entry.InstallLocation)) {
    $location = ([string]$Entry.InstallLocation).Trim().Trim('"')
    return [IO.Path]::GetFullPath($location).TrimEnd('\')
  }
  $escapedQuote = ([string][char]92) + [char]34
  $command = ([string]$Entry.UninstallString).Replace($escapedQuote, [string][char]34).Trim()
  if ($command.StartsWith('"')) {
    $closing = $command.IndexOf('"', 1)
    Assert-True ($closing -gt 1) "Invalid quoted UninstallString: $command"
    return [IO.Path]::GetFullPath((Split-Path -Parent $command.Substring(1, $closing - 1))).TrimEnd('\')
  }
  return [IO.Path]::GetFullPath((Split-Path -Parent (($command -split '\s+', 2)[0]))).TrimEnd('\')
}

function Get-CredentialTargetDigest {
  $lines = (& cmdkey.exe /list 2>$null) | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^(Target|目标):' } | Sort-Object -Unique
  $joined = $lines -join "`n"
  $bytes = [Text.Encoding]::UTF8.GetBytes($joined)
  $stream = [IO.MemoryStream]::new($bytes, $false)
  try { (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash.ToLowerInvariant() } finally { $stream.Dispose() }
}

function Assert-FullResources([string]$InstallDir) {
  $seed = Join-Path $InstallDir 'default-library\research-hotspots-v7.sqlite'
  $manifest = Join-Path $InstallDir 'default-library\default-library-manifest.json'
  Assert-True (Test-Path -LiteralPath $seed -PathType Leaf) "Full seed missing: $seed"
  Assert-True (Test-Path -LiteralPath $manifest -PathType Leaf) "Full manifest missing: $manifest"
  $data = Get-Content -LiteralPath $manifest -Raw -Encoding utf8 | ConvertFrom-Json
  Assert-True ($data.manifestSchemaVersion -eq 5) 'Full manifest schema is not 5.'
  Assert-True ($data.databaseSchemaVersion -eq 13) 'Full manifest schema is not 13.'
  Assert-True ($data.appVersion -eq $CurrentVersion) "Full manifest app version is not $CurrentVersion."
  Assert-True ($null -ne $data.PSObject.Properties['libraryRevision'] -and [int64]$data.libraryRevision -ge 0) 'Full manifest library revision is invalid.'
  Assert-True ($data.paperCount -eq 25463 -and $data.hotspotCount -eq 160 -and $data.membershipCount -eq 25463) 'Full manifest V20 counts are invalid.'
  Assert-True (
    $data.embeddingCount -eq 25463 `
      -and $data.algorithmVersion -eq 'v20-semantic-e5-small-2' `
      -and $data.paperLayoutVersion -eq 'semantic-hierarchical-pca3-v2' `
      -and $data.projectionVersion -eq 'centroid-pca3-robust-whiten-v2' `
      -and $data.hotspotIdentityVersion -eq 'stable-field-key-sha256-v2'
  ) 'Full semantic manifest fields are invalid.'
  Assert-True ((Get-FileHash -LiteralPath $seed -Algorithm SHA256).Hash.ToLowerInvariant() -eq ([string]$data.sha256).ToLowerInvariant()) 'Installed Full seed SHA-256 mismatch.'
  Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir 'semantic-model\model.cpu-portable.onnx') -PathType Leaf) 'Full portable CPU semantic model is missing.'
  Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir 'semantic-model\model.gpu.onnx') -PathType Leaf) 'Full DirectML semantic model is missing.'
  Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir 'semantic-model\LICENSE-MIT.txt') -PathType Leaf) 'Full semantic model license is missing.'
}

function Assert-LiteResourcesAbsent([string]$InstallDir) {
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'default-library\research-hotspots-v7.sqlite'))) 'Lite unexpectedly contains the default database.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'default-library\default-library-manifest.json'))) 'Lite unexpectedly contains the default manifest.'
  Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir 'semantic-model\model.cpu-portable.onnx') -PathType Leaf) 'Lite portable CPU semantic model is missing.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'semantic-model\model.gpu.onnx'))) 'Lite unexpectedly contains the DirectML semantic model.'
  Assert-True (Test-Path -LiteralPath (Join-Path $InstallDir 'semantic-model\LICENSE-MIT.txt') -PathType Leaf) 'Lite semantic model license is missing.'
}

$running = Get-Process -Name 'research-hotspots-desktop' -ErrorAction SilentlyContinue
Assert-True ($null -eq $running) 'Research Hotspots Desktop is running; close it before the install audit.'

$resolvedWorkspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedWorkRoot = [IO.Path]::GetFullPath($WorkRoot)
$approvedWorkRoot = [IO.Path]::GetFullPath((Join-Path $resolvedWorkspace 'src-tauri\target\windows-install-smoke')).TrimEnd('\')
Assert-True ($resolvedWorkRoot.TrimEnd('\').Equals($approvedWorkRoot, [StringComparison]::OrdinalIgnoreCase)) 'WorkRoot must be the dedicated src-tauri\target\windows-install-smoke directory.'
$resolvedExternalDatabase = [IO.Path]::GetFullPath($ExternalDatabase)
$resolvedFinalInstallDir = [IO.Path]::GetFullPath($FinalInstallDir)
$resolvedWorkPrefix = $resolvedWorkRoot.TrimEnd('\') + '\'
Assert-True ($resolvedExternalDatabase.StartsWith($resolvedWorkPrefix, [StringComparison]::OrdinalIgnoreCase)) 'ExternalDatabase must stay inside WorkRoot.'
Assert-True (($resolvedFinalInstallDir.TrimEnd('\') + '\').StartsWith($resolvedWorkPrefix, [StringComparison]::OrdinalIgnoreCase)) 'FinalInstallDir must stay inside WorkRoot.'
$staleAuditEntries = @(Get-UninstallEntries | Where-Object { ((Get-EntryInstallDirectory $_).TrimEnd('\') + '\').StartsWith($resolvedWorkPrefix, [StringComparison]::OrdinalIgnoreCase) })
foreach ($entry in $staleAuditEntries) { Invoke-Uninstaller $entry }
$externalProductEntries = @(Get-UninstallEntries | Where-Object { -not ((Get-EntryInstallDirectory $_).TrimEnd('\') + '\').StartsWith($resolvedWorkPrefix, [StringComparison]::OrdinalIgnoreCase) })
Assert-True ($externalProductEntries.Count -eq 0) 'A Research Hotspots installation exists outside the isolated WorkRoot; refusing to modify a user installation.'
if (Test-Path -LiteralPath $WorkRoot) { Remove-Item -LiteralPath $WorkRoot -Recurse -Force }
New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null

Assert-True (Test-Path -LiteralPath $SeedDatabase -PathType Leaf) "Release seed missing: $SeedDatabase"
New-Item -ItemType Directory -Path (Split-Path -Parent $ExternalDatabase) -Force | Out-Null
Copy-Item -LiteralPath $SeedDatabase -Destination $ExternalDatabase
Assert-True (Test-Path -LiteralPath $ExternalDatabase -PathType Leaf) "Isolated external database missing: $ExternalDatabase"
$databaseHashBefore = if (Test-Path -LiteralPath $ExternalDatabase -PathType Leaf) { (Get-FileHash -LiteralPath $ExternalDatabase -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
$credentialDigestBefore = Get-CredentialTargetDigest
$registryWasMissingBefore = @((Get-UninstallEntries)).Count -eq 0

Invoke-Installer $PreviousFullInstaller $IsolatedInstallDir
$previousEntry = Wait-For-UninstallEntry $PreviousVersion
$previousRegisteredDir = Get-EntryInstallDirectory $previousEntry
$expectedIsolatedDir = [IO.Path]::GetFullPath($IsolatedInstallDir).TrimEnd('\')
Assert-True ($previousRegisteredDir -eq $expectedIsolatedDir) "Previous-version registry install directory mismatch: actual=$previousRegisteredDir expected=$expectedIsolatedDir"

Invoke-Installer $CurrentFullInstaller $IsolatedInstallDir
$currentEntry = Wait-For-UninstallEntry $CurrentVersion
Assert-True ((Get-EntryInstallDirectory $currentEntry) -eq [IO.Path]::GetFullPath($IsolatedInstallDir).TrimEnd('\')) 'Current-version registry install directory mismatch.'
Assert-FullResources $IsolatedInstallDir
Invoke-Uninstaller $currentEntry
Start-Sleep -Milliseconds 500
Assert-True (@((Get-UninstallEntries)).Count -eq 0) 'Uninstall registry entry remains after Full uninstall.'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $IsolatedInstallDir 'research-hotspots-desktop.exe'))) 'Application executable remains after Full uninstall.'

Invoke-Installer $CurrentLiteInstaller $IsolatedInstallDir
$liteEntry = Wait-For-UninstallEntry $CurrentVersion
Assert-LiteResourcesAbsent $IsolatedInstallDir
Invoke-Uninstaller $liteEntry
Start-Sleep -Milliseconds 500
Assert-True (@((Get-UninstallEntries)).Count -eq 0) 'Uninstall registry entry remains after Lite uninstall.'

if ($null -ne $databaseHashBefore) {
  Assert-True (Test-Path -LiteralPath $ExternalDatabase -PathType Leaf) 'External database was removed by install/uninstall.'
  Assert-True ((Get-FileHash -LiteralPath $ExternalDatabase -Algorithm SHA256).Hash.ToLowerInvariant() -eq $databaseHashBefore) 'External database changed during install/upgrade/uninstall.'
}
Assert-True ((Get-CredentialTargetDigest) -eq $credentialDigestBefore) 'Credential Manager target set changed during install/upgrade/uninstall.'

Invoke-Installer $CurrentFullInstaller $FinalInstallDir
$finalEntry = Wait-For-UninstallEntry $CurrentVersion
Assert-FullResources $FinalInstallDir

[ordered]@{
  ok = $true
  registryWasMissingBefore = $registryWasMissingBefore
  cleanInstallRegistryCreated = $true
  version = [string]$finalEntry.DisplayVersion
  finalInstallDir = [IO.Path]::GetFullPath($FinalInstallDir)
  fullResources = $true
  liteDefaultLibraryAbsent = $true
  liteCpuModelPresent = $true
  externalDatabasePreserved = $true
  credentialTargetsPreserved = $true
} | ConvertTo-Json -Compress
