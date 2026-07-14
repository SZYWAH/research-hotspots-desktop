param(
  [Parameter(Mandatory = $true)]
  [string]$LibraryPath,
  [string]$ConvertedImportDir,
  [int]$MinValidRows = 100000,
  [double]$MaxInvalidRate = 0.05,
  [double]$MaxDuplicateRate = 0.30,
  [string]$DatabaseDir,
  [string]$DatabasePath,
  [switch]$ImportBeforeAudit,
  [int]$MinImportedRows = 100000,
  [double]$MaxMissingAbstractRate = 0.35,
  [double]$MaxMissingYearRate = 0.35,
  [int]$MaxQueryMs = 5000,
  [int]$MinClusters = 10,
  [switch]$ExportStarMap,
  [string]$StarMapPath,
  [int]$MinStarMapHotspots = 10,
  [int]$MinStarMapEvidenceIds = 10,
  [int]$MinStarMapLinks = 1,
  [double]$MinStarMapEvidenceCoverage = 0.8,
  [double]$MinStarMapEvolutionCoverage = 0.8,
  [double]$MinStarMapSourceDistributionCoverage = 0.8,
  [switch]$RejectSampleStarMapSignals,
  [switch]$ExportHotspotEvidence,
  [string]$HotspotEvidencePath,
  [string]$HotspotEvidenceMarkdownPath,
  [int]$MinHotspotRepresentativePapers = 3,
  [switch]$GenerateHotspotReport,
  [string]$GeneratedHotspotReportPath,
  [string]$GeneratedHotspotReportHtmlPath,
  [int]$MinHotspotReportPapers = 3,
  [string]$ReportPath,
  [int]$MinReportCitations = 3,
  [int]$MinReportReferences = 3,
  [int]$MinReportChars = 1200,
  [string]$UiSmokePath,
  [string]$AiLiveSmokePath,
  [switch]$RequireLiveAi,
  [switch]$RequireTerminalReady,
  [switch]$SkipBaseline,
  [switch]$RunPressureTest,
  [switch]$RunTauriBuild,
  [switch]$LaunchExe
)

$ErrorActionPreference = "Stop"
$env:NO_COLOR = "1"
$env:FORCE_COLOR = "0"
$env:CLICOLOR = "0"
try {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [Console]::OutputEncoding = $utf8NoBom
  $OutputEncoding = $utf8NoBom
} catch {
  # Encoding setup is best-effort on older hosts.
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $Root "outputs"
$LogPath = Join-Path $OutputDir "v20_final_acceptance_gate.log"
$CargoHome = "D:\.cargo"
$OriginalLibraryResolved = Resolve-Path -LiteralPath $LibraryPath
$EffectiveLibraryResolved = $OriginalLibraryResolved
$LibraryReportPath = Join-Path $OutputDir "v20_real_library_preflight_user.json"
$AiReportPath = Join-Path $OutputDir "v20_ai_config_preflight_final.json"
$ImportReportPath = Join-Path $OutputDir "v20_import_library_final.json"
$BibliographyConversionReportPath = Join-Path $OutputDir "v20_bibliography_conversion_final.json"
$SqliteAuditPath = Join-Path $OutputDir "v20_sqlite_library_audit_final.json"
$StarMapExportPath = Join-Path $OutputDir "v20_star_map_export_final.json"
$HotspotEvidenceExportPath = Join-Path $OutputDir "v20_hotspot_evidence_final.json"
$DefaultHotspotEvidenceMarkdownPath = Join-Path $OutputDir "v20_hotspot_evidence_final.md"
$HotspotReportExportPath = Join-Path $OutputDir "v20_hotspot_report_final.md"
$HotspotReportHtmlExportPath = Join-Path $OutputDir "v20_hotspot_report_final.html"
$ReportAuditPath = Join-Path $OutputDir "v20_report_export_audit_final.json"
$SourceManifestPath = Join-Path $OutputDir "v20_source_manifest_final.json"
$SourceManifestMarkdownPath = Join-Path $OutputDir "V20_SOURCE_MANIFEST_FINAL.md"
$SummaryPath = Join-Path $OutputDir "v20_final_acceptance_gate_summary.json"
$BibliographyConversionRan = $false
$BibliographyConvertedPath = $null

if ($MinValidRows -le 0) {
  throw "-MinValidRows must be positive."
}
if ($MaxInvalidRate -lt 0 -or $MaxInvalidRate -gt 1) {
  throw "-MaxInvalidRate must be between 0 and 1."
}
if ($MaxDuplicateRate -lt 0 -or $MaxDuplicateRate -gt 1) {
  throw "-MaxDuplicateRate must be between 0 and 1."
}
if ($DatabaseDir -and $DatabasePath) {
  throw "Use either -DatabaseDir or -DatabasePath, not both."
}
if ($ImportBeforeAudit -and (-not $DatabaseDir -or $DatabasePath)) {
  throw "-ImportBeforeAudit requires -DatabaseDir and cannot be combined with -DatabasePath."
}
if ($MinImportedRows -le 0) {
  throw "-MinImportedRows must be positive."
}
if ($MaxMissingAbstractRate -lt 0 -or $MaxMissingAbstractRate -gt 1) {
  throw "-MaxMissingAbstractRate must be between 0 and 1."
}
if ($MaxMissingYearRate -lt 0 -or $MaxMissingYearRate -gt 1) {
  throw "-MaxMissingYearRate must be between 0 and 1."
}
if ($MaxQueryMs -le 0) {
  throw "-MaxQueryMs must be positive."
}
if ($MinClusters -le 0) {
  throw "-MinClusters must be positive."
}
if ($ExportStarMap -and $StarMapPath) {
  throw "Use either -ExportStarMap or -StarMapPath, not both."
}
if ($ExportStarMap -and (-not $DatabaseDir -and -not $DatabasePath)) {
  throw "-ExportStarMap requires -DatabaseDir or -DatabasePath."
}
if ($StarMapPath -and -not (Test-Path -LiteralPath $StarMapPath)) {
  throw "-StarMapPath does not exist: $StarMapPath"
}
if ($MinStarMapHotspots -le 0) {
  throw "-MinStarMapHotspots must be positive."
}
if ($MinStarMapEvidenceIds -le 0) {
  throw "-MinStarMapEvidenceIds must be positive."
}
if ($MinStarMapLinks -lt 0) {
  throw "-MinStarMapLinks must be non-negative."
}
if ($MinStarMapEvidenceCoverage -lt 0 -or $MinStarMapEvidenceCoverage -gt 1) {
  throw "-MinStarMapEvidenceCoverage must be between 0 and 1."
}
if ($MinStarMapEvolutionCoverage -lt 0 -or $MinStarMapEvolutionCoverage -gt 1) {
  throw "-MinStarMapEvolutionCoverage must be between 0 and 1."
}
if ($MinStarMapSourceDistributionCoverage -lt 0 -or $MinStarMapSourceDistributionCoverage -gt 1) {
  throw "-MinStarMapSourceDistributionCoverage must be between 0 and 1."
}
if ($ExportHotspotEvidence -and $HotspotEvidencePath) {
  throw "Use either -ExportHotspotEvidence or -HotspotEvidencePath, not both."
}
if ($ExportHotspotEvidence -and (-not $DatabaseDir -and -not $DatabasePath)) {
  throw "-ExportHotspotEvidence requires -DatabaseDir or -DatabasePath."
}
if ($HotspotEvidencePath -and -not (Test-Path -LiteralPath $HotspotEvidencePath)) {
  throw "-HotspotEvidencePath does not exist: $HotspotEvidencePath"
}
if ($MinHotspotRepresentativePapers -le 0) {
  throw "-MinHotspotRepresentativePapers must be positive."
}
if ($GenerateHotspotReport -and (-not $ExportHotspotEvidence -and -not $HotspotEvidencePath)) {
  throw "-GenerateHotspotReport requires -ExportHotspotEvidence or -HotspotEvidencePath."
}
if ($GenerateHotspotReport -and $ReportPath) {
  throw "Use either -GenerateHotspotReport or -ReportPath, not both."
}
if ($MinHotspotReportPapers -le 0) {
  throw "-MinHotspotReportPapers must be positive."
}
if ($ReportPath -and -not (Test-Path -LiteralPath $ReportPath)) {
  throw "-ReportPath does not exist: $ReportPath"
}
if ($UiSmokePath -and -not (Test-Path -LiteralPath $UiSmokePath)) {
  throw "-UiSmokePath does not exist: $UiSmokePath"
}
if ($AiLiveSmokePath -and -not (Test-Path -LiteralPath $AiLiveSmokePath)) {
  throw "-AiLiveSmokePath does not exist: $AiLiveSmokePath"
}
if ($MinReportCitations -le 0) {
  throw "-MinReportCitations must be positive."
}
if ($MinReportReferences -le 0) {
  throw "-MinReportReferences must be positive."
}
if ($MinReportChars -le 0) {
  throw "-MinReportChars must be positive."
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

function Write-Step {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Read-RedirectedText {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -eq 0) {
    return ""
  }

  $sampleLength = [Math]::Min($bytes.Length, 4000)
  $zeroCount = 0
  for ($index = 0; $index -lt $sampleLength; $index += 1) {
    if ($bytes[$index] -eq 0) {
      $zeroCount += 1
    }
  }

  if (($zeroCount / [double]$sampleLength) -gt 0.2) {
    return [System.Text.Encoding]::Unicode.GetString($bytes)
  }
  return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Write-CommandOutput {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return
  }
  $normalized = $Text -replace "`0", ""
  foreach ($line in ($normalized -split "`r?`n")) {
    if ($line.Length -eq 0) {
      continue
    }
    Write-Host $line
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  }
}

function Invoke-NativeLogged {
  param(
    [string]$Step,
    [string]$FilePath,
    [string[]]$ArgumentList = @()
  )
  Write-Step $Step
  $stdoutPath = Join-Path $OutputDir ".v20_final_gate_stdout.tmp"
  $stderrPath = Join-Path $OutputDir ".v20_final_gate_stderr.tmp"
  if (Test-Path -LiteralPath $stdoutPath) { Remove-Item -LiteralPath $stdoutPath -Force }
  if (Test-Path -LiteralPath $stderrPath) { Remove-Item -LiteralPath $stderrPath -Force }
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $Root -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    Write-CommandOutput (Read-RedirectedText $stdoutPath)
    Write-CommandOutput (Read-RedirectedText $stderrPath)
    $exitCode = $process.ExitCode
  } finally {
    if (Test-Path -LiteralPath $stdoutPath) { Remove-Item -LiteralPath $stdoutPath -Force }
    if (Test-Path -LiteralPath $stderrPath) { Remove-Item -LiteralPath $stderrPath -Force }
  }
  if ($exitCode -ne 0) {
    throw "Command failed: $Step (exit code $exitCode)"
  }
}

function Resolve-OrFullPath {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    return [string](Resolve-Path -LiteralPath $Path)
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Normalize-EvidencePath {
  param([object]$Path)
  if ($null -eq $Path) {
    return ""
  }
  $value = ([string]$Path).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ""
  }
  $value = $value -replace '^\\\\\?\\', ''
  $value = $value -replace '/', '\'
  try {
    $value = [System.IO.Path]::GetFullPath($value)
  } catch {
    $value = [System.IO.Path]::GetFullPath((Join-Path $Root $value))
  }
  return $value.ToLowerInvariant()
}

function Normalize-EvidenceIdList {
  param([object]$Values)
  $items = @()
  if ($null -ne $Values) {
    foreach ($item in @($Values)) {
      $text = ([string]$item).Trim()
      if (-not [string]::IsNullOrWhiteSpace($text)) {
        $items += $text
      }
    }
  }
  return $items
}

function Test-PathMatches {
  param(
    [object]$Left,
    [object]$Right
  )
  $leftPath = Normalize-EvidencePath $Left
  $rightPath = Normalize-EvidencePath $Right
  return (-not [string]::IsNullOrWhiteSpace($leftPath)) -and $leftPath -eq $rightPath
}

function Assert-EvidenceChainConsistency {
  param(
    [object]$SqliteAudit,
    [object]$StarMapExport,
    [object]$HotspotEvidence,
    [object]$ReportAudit,
    [object]$ExpectedReportPath
  )

  $failures = @()
  $sqliteDb = if ($SqliteAudit) { Normalize-EvidencePath $SqliteAudit.databasePath } else { "" }
  $starMapDb = if ($StarMapExport) { Normalize-EvidencePath $StarMapExport.databasePath } else { "" }
  $hotspotDb = if ($HotspotEvidence) { Normalize-EvidencePath $HotspotEvidence.databasePath } else { "" }

  if ($SqliteAudit -and $StarMapExport -and $sqliteDb -and $starMapDb -and $sqliteDb -ne $starMapDb) {
    $failures += "Star-map database path does not match SQLite audit database path."
  }
  if ($SqliteAudit -and $HotspotEvidence -and $sqliteDb -and $hotspotDb -and $sqliteDb -ne $hotspotDb) {
    $failures += "Hotspot evidence database path does not match SQLite audit database path."
  }
  if ($StarMapExport -and $HotspotEvidence -and $starMapDb -and $hotspotDb -and $starMapDb -ne $hotspotDb) {
    $failures += "Hotspot evidence database path does not match star-map database path."
  }

  $sqliteProject = if ($SqliteAudit) { ([string]$SqliteAudit.projectId).Trim() } else { "" }
  $starMapProject = if ($StarMapExport) { ([string]$StarMapExport.projectId).Trim() } else { "" }
  $hotspotProject = if ($HotspotEvidence) { ([string]$HotspotEvidence.projectId).Trim() } else { "" }
  if ($SqliteAudit -and $StarMapExport -and $sqliteProject -and $starMapProject -and $sqliteProject -ne $starMapProject) {
    $failures += "Star-map projectId does not match SQLite audit projectId."
  }
  if ($SqliteAudit -and $HotspotEvidence -and $sqliteProject -and $hotspotProject -and $sqliteProject -ne $hotspotProject) {
    $failures += "Hotspot evidence projectId does not match SQLite audit projectId."
  }
  if ($StarMapExport -and $HotspotEvidence -and $starMapProject -and $hotspotProject -and $starMapProject -ne $hotspotProject) {
    $failures += "Hotspot evidence projectId does not match star-map projectId."
  }

  $selectedHotspot = $null
  if ($StarMapExport -and $HotspotEvidence) {
    $selectedHotspotId = ([string]$HotspotEvidence.selectedHotspotId).Trim()
    if ([string]::IsNullOrWhiteSpace($selectedHotspotId)) {
      $failures += "Hotspot evidence selectedHotspotId is missing."
    } else {
      $selectedHotspot = @($StarMapExport.hotspots) | Where-Object { ([string]$_.id).Trim() -eq $selectedHotspotId } | Select-Object -First 1
      if (-not $selectedHotspot) {
        $failures += "Hotspot evidence selectedHotspotId is not present in star-map export."
      }
    }

    if ($selectedHotspot) {
      $hotspotRepresentativeIds = Normalize-EvidenceIdList $HotspotEvidence.representativeIds
      $starRepresentativeIds = Normalize-EvidenceIdList $selectedHotspot.representativeIds
      if ($starRepresentativeIds.Count -eq 0 -and $selectedHotspot.analysis) {
        $starRepresentativeIds = Normalize-EvidenceIdList $selectedHotspot.analysis.evidencePaperIds
      }
      if ($hotspotRepresentativeIds.Count -eq 0) {
        $failures += "Hotspot evidence representativeIds are missing."
      }
      foreach ($representativeId in $hotspotRepresentativeIds) {
        if ($starRepresentativeIds -notcontains $representativeId) {
          $failures += "Hotspot representative id is not present in selected star-map hotspot: $representativeId"
        }
      }
    }
  }

  if ($ReportAudit -and $ExpectedReportPath) {
    if (-not (Test-PathMatches $ReportAudit.reportPath $ExpectedReportPath)) {
      $failures += "Report audit path does not match the effective final report path."
    }
  }

  if ($failures.Count -gt 0) {
    throw "Final evidence chain consistency failed: $($failures -join '; ')"
  }

  return [ordered]@{
    passed = $true
    sqliteDatabasePath = if ($SqliteAudit) { [string]$SqliteAudit.databasePath } else { $null }
    starMapDatabasePath = if ($StarMapExport) { [string]$StarMapExport.databasePath } else { $null }
    hotspotEvidenceDatabasePath = if ($HotspotEvidence) { [string]$HotspotEvidence.databasePath } else { $null }
    selectedHotspotId = if ($HotspotEvidence) { [string]$HotspotEvidence.selectedHotspotId } else { $null }
    reportPath = if ($ReportAudit) { [string]$ReportAudit.reportPath } else { $null }
    failures = @()
  }
}

function Get-SafeFileStem {
  param([string]$Path)
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($Path) -replace '[^\w\.-]+', '_'
  $stem = $stem.Trim('_')
  if ([string]::IsNullOrWhiteSpace($stem)) {
    return "library"
  }
  return $stem
}

Set-Location $Root
Set-Content -LiteralPath $LogPath -Value ("V20 final acceptance gate started at {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) -Encoding UTF8

Write-Step "Project root: $Root"
Write-Step "Library path: $OriginalLibraryResolved"
Write-Step "Minimum valid rows: $MinValidRows"
Write-Step "Max invalid rate: $MaxInvalidRate"
Write-Step "Max duplicate rate: $MaxDuplicateRate"
Write-Step "Require live AI: $($RequireLiveAi.IsPresent)"
if ($DatabaseDir) { Write-Step "SQLite database dir audit: $DatabaseDir" }
if ($DatabasePath) { Write-Step "SQLite database path audit: $DatabasePath" }
if ($ExportStarMap) { Write-Step "Star-map export gate enabled." }
if ($StarMapPath) { Write-Step "Star-map export evidence: $StarMapPath" }
if ($ExportHotspotEvidence) { Write-Step "Hotspot evidence export gate enabled." }
if ($HotspotEvidencePath) { Write-Step "Hotspot evidence export evidence: $HotspotEvidencePath" }
if ($GenerateHotspotReport) { Write-Step "Hotspot report generation gate enabled." }
if ($ReportPath) { Write-Step "Report export audit: $ReportPath" }
if ($UiSmokePath) { Write-Step "UI smoke evidence: $UiSmokePath" }
if ($AiLiveSmokePath) { Write-Step "AI live smoke evidence: $AiLiveSmokePath" }

$libraryExtension = [System.IO.Path]::GetExtension([string]$OriginalLibraryResolved).ToLowerInvariant()
if ($libraryExtension -eq ".bib" -or $libraryExtension -eq ".ris") {
  $conversionRoot = if ($ConvertedImportDir) {
    Resolve-OrFullPath $ConvertedImportDir
  } elseif (Test-Path -LiteralPath "D:\") {
    "D:\ResearchHotspotsDesktop\imports"
  } else {
    Join-Path $OutputDir "imports"
  }
  if (-not (Test-Path -LiteralPath $conversionRoot)) {
    New-Item -ItemType Directory -Path $conversionRoot | Out-Null
  }
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $safeStem = Get-SafeFileStem -Path ([string]$OriginalLibraryResolved)
  $BibliographyConvertedPath = Join-Path $conversionRoot ("{0}-final-gate-{1}.jsonl" -f $safeStem, $timestamp)
  Invoke-NativeLogged "bibliography conversion final gate" "node.exe" @(
    (Join-Path $Root "scripts\v20_bibliography_to_jsonl.mjs"),
    [string]$OriginalLibraryResolved,
    "--output",
    $BibliographyConvertedPath,
    "--report",
    $BibliographyConversionReportPath
  )
  $EffectiveLibraryResolved = Resolve-Path -LiteralPath $BibliographyConvertedPath
  $BibliographyConversionRan = $true
  Write-Step "Effective library path after bibliography conversion: $EffectiveLibraryResolved"
}

if (-not $SkipBaseline) {
  $baselineArgs = @("-ExecutionPolicy", "Bypass", "-File", (Join-Path $Root "scripts\v20_acceptance_check.ps1"))
  if ($RunPressureTest) { $baselineArgs += "-RunPressureTest" }
  if ($RunTauriBuild) { $baselineArgs += "-RunTauriBuild" }
  if ($LaunchExe) { $baselineArgs += "-LaunchExe" }
  Invoke-NativeLogged "baseline V20 acceptance" "powershell.exe" $baselineArgs
} else {
  Write-Step "Skipping baseline acceptance by request."
}

Invoke-NativeLogged "strict real library preflight gate" "node.exe" @(
  (Join-Path $Root "scripts\v20_real_library_preflight.mjs"),
  $EffectiveLibraryResolved,
  "--output",
  $LibraryReportPath,
  "--min-valid-rows",
  [string]$MinValidRows,
  "--max-invalid-rate",
  [string]$MaxInvalidRate,
  "--max-duplicate-rate",
  [string]$MaxDuplicateRate,
  "--require-full-scan"
)

$libraryReportForManifest = Get-Content -LiteralPath $LibraryReportPath -Encoding UTF8 -Raw | ConvertFrom-Json
Invoke-NativeLogged "source manifest fingerprint final gate" "node.exe" @(
  (Join-Path $Root "scripts\v20_source_manifest.mjs"),
  "--source",
  $EffectiveLibraryResolved,
  "--output",
  $SourceManifestPath,
  "--markdown",
  $SourceManifestMarkdownPath,
  "--min-rows",
  [string]$MinValidRows,
  "--estimated-rows",
  [string]$libraryReportForManifest.validRows
)
$sourceManifest = Get-Content -LiteralPath $SourceManifestPath -Encoding UTF8 -Raw | ConvertFrom-Json

$aiArgs = @((Join-Path $Root "scripts\v20_ai_config_preflight.mjs"), "--output", $AiReportPath)
if ($RequireLiveAi -and -not $RequireTerminalReady) { $aiArgs += "--require-live" }
Invoke-NativeLogged "AI configuration final gate" "node.exe" $aiArgs

$importReport = $null
if ($ImportBeforeAudit) {
  $env:CARGO_HOME = $CargoHome
  $databaseDirForImport = Resolve-OrFullPath $DatabaseDir
  Invoke-NativeLogged "headless SQLite library import gate" "cargo.exe" @(
    "run",
    "--quiet",
    "--manifest-path",
    (Join-Path $Root "src-tauri\Cargo.toml"),
    "--bin",
    "import_library",
    "--",
    "--source",
    $EffectiveLibraryResolved,
    "--database-dir",
    $databaseDirForImport,
    "--output",
    $ImportReportPath
  )
  $importReport = Get-Content -LiteralPath $ImportReportPath -Encoding UTF8 -Raw | ConvertFrom-Json
}

$sqliteAudit = $null
if ($DatabaseDir -or $DatabasePath) {
  $env:CARGO_HOME = $CargoHome
  $auditArgs = @(
    "run",
    "--quiet",
    "--manifest-path",
    (Join-Path $Root "src-tauri\Cargo.toml"),
    "--bin",
    "audit_library",
    "--"
  )
  if ($DatabaseDir) {
    $auditArgs += @("--database-dir", (Resolve-Path -LiteralPath $DatabaseDir))
  }
  if ($DatabasePath) {
    $auditArgs += @("--database-path", (Resolve-Path -LiteralPath $DatabasePath))
  }
  $auditArgs += @(
    "--min-rows",
    [string]$MinImportedRows,
    "--max-missing-abstract-rate",
    [string]$MaxMissingAbstractRate,
    "--max-missing-year-rate",
    [string]$MaxMissingYearRate,
    "--max-query-ms",
    [string]$MaxQueryMs,
    "--min-clusters",
    [string]$MinClusters,
    "--require-indexes",
    "--output",
    $SqliteAuditPath
  )
  Invoke-NativeLogged "post-import SQLite library audit gate" "cargo.exe" $auditArgs
  $sqliteAudit = Get-Content -LiteralPath $SqliteAuditPath -Encoding UTF8 -Raw | ConvertFrom-Json
} else {
  Write-Step "Skipping post-import SQLite audit. Use -DatabaseDir or -DatabasePath after importing the real library."
}

$starMapExport = $null
if ($ExportStarMap) {
  $env:CARGO_HOME = $CargoHome
  $starMapArgs = @(
    "run",
    "--quiet",
    "--manifest-path",
    (Join-Path $Root "src-tauri\Cargo.toml"),
    "--bin",
    "export_star_map",
    "--"
  )
  if ($DatabaseDir) {
    $starMapArgs += @("--database-dir", (Resolve-Path -LiteralPath $DatabaseDir))
  }
  if ($DatabasePath) {
    $starMapArgs += @("--database-path", (Resolve-Path -LiteralPath $DatabasePath))
  }
  $starMapArgs += @(
    "--min-hotspots",
    [string]$MinStarMapHotspots,
    "--min-evidence-ids",
    [string]$MinStarMapEvidenceIds,
    "--min-links",
    [string]$MinStarMapLinks,
    "--min-evidence-coverage",
    [string]$MinStarMapEvidenceCoverage,
    "--min-evolution-coverage",
    [string]$MinStarMapEvolutionCoverage,
    "--min-source-distribution-coverage",
    [string]$MinStarMapSourceDistributionCoverage,
    "--require-evolution",
    "--require-source-distribution",
    "--output",
    $StarMapExportPath
  )
  if ($RejectSampleStarMapSignals) {
    $starMapArgs += "--reject-sample-signals"
  }
  Invoke-NativeLogged "star-map semantic export gate" "cargo.exe" $starMapArgs
  $starMapExport = Get-Content -LiteralPath $StarMapExportPath -Encoding UTF8 -Raw | ConvertFrom-Json
} elseif ($StarMapPath) {
  $starMapExport = Get-Content -LiteralPath $StarMapPath -Encoding UTF8 -Raw | ConvertFrom-Json
  if (-not [bool]$starMapExport.strictGate.passed) {
    throw "Star-map export gate failed: $StarMapPath"
  }
  $starMapPathSampleSignalCount = if ($null -ne $starMapExport.evidenceProfile.sampleSignalCount) { [int]$starMapExport.evidenceProfile.sampleSignalCount } else { 0 }
  if ($RejectSampleStarMapSignals -and $starMapPathSampleSignalCount -gt 0) {
    throw "Star-map export evidence contains sample-like signals while -RejectSampleStarMapSignals is set: $StarMapPath"
  }
  Write-Step "Star-map export evidence gate passed."
} else {
  Write-Step "Skipping star-map semantic export. Use -ExportStarMap or -StarMapPath after importing the real library."
}

$hotspotEvidence = $null
if ($ExportHotspotEvidence) {
  $env:CARGO_HOME = $CargoHome
  $resolvedHotspotMarkdownPath = if ($HotspotEvidenceMarkdownPath) { Resolve-OrFullPath $HotspotEvidenceMarkdownPath } else { $DefaultHotspotEvidenceMarkdownPath }
  $hotspotEvidenceArgs = @(
    "run",
    "--quiet",
    "--manifest-path",
    (Join-Path $Root "src-tauri\Cargo.toml"),
    "--bin",
    "export_hotspot_evidence",
    "--"
  )
  if ($DatabaseDir) {
    $hotspotEvidenceArgs += @("--database-dir", (Resolve-Path -LiteralPath $DatabaseDir))
  }
  if ($DatabasePath) {
    $hotspotEvidenceArgs += @("--database-path", (Resolve-Path -LiteralPath $DatabasePath))
  }
  $hotspotEvidenceArgs += @(
    "--max-papers",
    [string]([Math]::Max(12, $MinHotspotRepresentativePapers)),
    "--min-representative-papers",
    [string]$MinHotspotRepresentativePapers,
    "--require-evolution",
    "--require-source-distribution",
    "--output",
    $HotspotEvidenceExportPath,
    "--markdown-output",
    $resolvedHotspotMarkdownPath
  )
  Invoke-NativeLogged "hotspot evidence bundle export gate" "cargo.exe" $hotspotEvidenceArgs
  $hotspotEvidence = Get-Content -LiteralPath $HotspotEvidenceExportPath -Encoding UTF8 -Raw | ConvertFrom-Json
} elseif ($HotspotEvidencePath) {
  $hotspotEvidence = Get-Content -LiteralPath $HotspotEvidencePath -Encoding UTF8 -Raw | ConvertFrom-Json
  if (-not [bool]$hotspotEvidence.strictGate.passed) {
    throw "Hotspot evidence export gate failed: $HotspotEvidencePath"
  }
  if (@($hotspotEvidence.representativePapers).Count -lt $MinHotspotRepresentativePapers) {
    throw "Hotspot evidence has too few representative papers: expected at least $MinHotspotRepresentativePapers, actual $(@($hotspotEvidence.representativePapers).Count)"
  }
  if (@($hotspotEvidence.missingRepresentativeIds).Count -gt 0) {
    throw "Hotspot evidence contains missing representative paper ids: $HotspotEvidencePath"
  }
  Write-Step "Hotspot evidence export gate passed."
} else {
  Write-Step "Skipping hotspot evidence export. Use -ExportHotspotEvidence or -HotspotEvidencePath after importing the real library."
}

$generatedHotspotReportPath = $null
$generatedHotspotReportHtmlPath = $null
if ($GenerateHotspotReport) {
  $evidenceSourcePath = if ($ExportHotspotEvidence) { $HotspotEvidenceExportPath } else { Resolve-Path -LiteralPath $HotspotEvidencePath }
  $generatedHotspotReportPath = if ($GeneratedHotspotReportPath) { Resolve-OrFullPath $GeneratedHotspotReportPath } else { $HotspotReportExportPath }
  $generatedHotspotReportHtmlPath = if ($GeneratedHotspotReportHtmlPath) { Resolve-OrFullPath $GeneratedHotspotReportHtmlPath } else { $HotspotReportHtmlExportPath }
  Invoke-NativeLogged "hotspot evidence report export gate" "node.exe" @(
    (Join-Path $Root "scripts\v20_hotspot_report_export.mjs"),
    $evidenceSourcePath,
    "--output",
    $generatedHotspotReportPath,
    "--html-output",
    $generatedHotspotReportHtmlPath,
    "--min-papers",
    [string]$MinHotspotReportPapers
  )
} else {
  Write-Step "Skipping hotspot report generation. Use -GenerateHotspotReport with hotspot evidence for deterministic report export."
}

$reportAudit = $null
$effectiveReportPath = if ($ReportPath) { $ReportPath } elseif ($generatedHotspotReportPath) { $generatedHotspotReportPath } else { $null }
if ($effectiveReportPath) {
  Invoke-NativeLogged "exported report evidence audit gate" "node.exe" @(
    (Join-Path $Root "scripts\v20_report_export_audit.mjs"),
    (Resolve-Path -LiteralPath $effectiveReportPath),
    "--output",
    $ReportAuditPath,
    "--require-evidence",
    "--require-sections",
    "--require-references",
    "--min-citations",
    [string]$MinReportCitations,
    "--min-references",
    [string]$MinReportReferences,
    "--min-chars",
    [string]$MinReportChars,
    "--min-citation-coverage",
    "1"
  )
  $reportAudit = Get-Content -LiteralPath $ReportAuditPath -Encoding UTF8 -Raw | ConvertFrom-Json
} else {
  Write-Step "Skipping exported report audit. Use -ReportPath after generating a formal report."
}

$uiSmoke = $null
if ($UiSmokePath) {
  $uiSmoke = Get-Content -LiteralPath $UiSmokePath -Encoding UTF8 -Raw | ConvertFrom-Json
  if (-not [bool]$uiSmoke.gate.passed) {
    throw "UI smoke gate failed: $UiSmokePath"
  }
  $uiConsoleIssues = @($uiSmoke.consoleIssues).Count
  if ($uiConsoleIssues -gt 0) {
    throw "UI smoke gate has console issues: $uiConsoleIssues"
  }
  $requiredUiSmokeChecks = @(
    "defaultCanvas",
    "galaxyMapCanvas",
    "fullscreenCanvas",
    "fullscreenState",
    "consoleClean",
    "screenshotsNonBlank",
    "lowOverexposure"
  )
  foreach ($requiredUiSmokeCheck in $requiredUiSmokeChecks) {
    if (-not [bool]$uiSmoke.gate.checks.$requiredUiSmokeCheck) {
      throw "UI smoke gate missing required check: gate.checks.$requiredUiSmokeCheck"
    }
  }
  Write-Step "UI smoke evidence gate passed."
} else {
  Write-Step "Skipping UI smoke evidence. Use -UiSmokePath after star-map UI verification."
}

$aiLiveSmoke = $null
if ($AiLiveSmokePath) {
  $aiLiveSmoke = Get-Content -LiteralPath $AiLiveSmokePath -Encoding UTF8 -Raw | ConvertFrom-Json
  if (-not [bool]$aiLiveSmoke.strictGate.passed) {
    throw "AI live smoke gate failed: $AiLiveSmokePath"
  }
  if ([string]$aiLiveSmoke.mode -ne "network-enabled" -or -not [bool]$aiLiveSmoke.network.called) {
    throw "AI live smoke must be produced by a network-enabled run with --allow-network: $AiLiveSmokePath"
  }
  if (-not [bool]$aiLiveSmoke.reportAudit.passed) {
    throw "AI live smoke report audit must pass: $AiLiveSmokePath"
  }
  Write-Step "AI live smoke evidence gate passed."
} else {
  Write-Step "Skipping AI live smoke evidence. Use -AiLiveSmokePath after pnpm ai:live-smoke -- --allow-network --require-live."
}

$evidenceChain = Assert-EvidenceChainConsistency `
  -SqliteAudit $sqliteAudit `
  -StarMapExport $starMapExport `
  -HotspotEvidence $hotspotEvidence `
  -ReportAudit $reportAudit `
  -ExpectedReportPath $effectiveReportPath
Write-Step "Final evidence chain consistency gate passed."

$libraryReport = Get-Content -LiteralPath $LibraryReportPath -Encoding UTF8 -Raw | ConvertFrom-Json
$aiReport = Get-Content -LiteralPath $AiReportPath -Encoding UTF8 -Raw | ConvertFrom-Json
$remainingAppProcesses = @(Get-Process -Name "research-hotspots-desktop" -ErrorAction SilentlyContinue).Count
$libraryPathString = [string]$EffectiveLibraryResolved
$sourceLooksSample = $libraryPathString -match "(?i)(^|[\\/])(data[\\/]samples|samples)([\\/]|$)|sample|demo|fixture"
$sourceManifestReady = [bool](
  $sourceManifest -and
  [bool]$sourceManifest.source.terminalCandidate -and
  -not [string]::IsNullOrWhiteSpace([string]$sourceManifest.source.sha256)
)
$starMapSampleSignalCountForReadiness = if ($starMapExport) { [int]$starMapExport.evidenceProfile.sampleSignalCount } else { $null }
$starMapSampleClean = [bool]($starMapExport -and $starMapSampleSignalCountForReadiness -eq 0)
$starMapCoverageReady = [bool](
  $starMapExport -and
  [double]$starMapExport.evidenceProfile.evidenceCoverage -ge $MinStarMapEvidenceCoverage -and
  [double]$starMapExport.evidenceProfile.evolutionCoverage -ge $MinStarMapEvolutionCoverage -and
  [double]$starMapExport.evidenceProfile.sourceDistributionCoverage -ge $MinStarMapSourceDistributionCoverage
)
$realDataSourceReady = [bool](
  [bool]$libraryReport.strictGate.passed -and
  $MinValidRows -ge 100000 -and
  [int]$libraryReport.validRows -ge 100000 -and
  -not $SkipBaseline.IsPresent -and
  -not $sourceLooksSample -and
  $sourceManifestReady
)
$realImportedSqliteReady = [bool](
  $realDataSourceReady -and
  $sqliteAudit -and
  [bool]$sqliteAudit.strictGate.passed -and
  [int]$sqliteAudit.paperCount -ge 100000
)
$realStarMapReady = [bool](
  $realImportedSqliteReady -and
  $starMapExport -and
  [bool]$starMapExport.strictGate.passed -and
  $starMapCoverageReady -and
  $RejectSampleStarMapSignals.IsPresent -and
  $starMapSampleClean
)
$hotspotEvidenceReady = [bool](
  $realStarMapReady -and
  $hotspotEvidence -and
  [bool]$hotspotEvidence.strictGate.passed -and
  @($hotspotEvidence.representativePapers).Count -ge $MinHotspotRepresentativePapers -and
  @($hotspotEvidence.missingRepresentativeIds).Count -eq 0
)
$realReportReady = [bool](
  $hotspotEvidenceReady -and
  $reportAudit -and
  [bool]$reportAudit.strictGate.passed -and
  [int]$reportAudit.citationCount -ge $MinReportCitations -and
  [int]$reportAudit.referenceCount -ge $MinReportReferences
)
$evidenceChainReadyForFinal = [bool](
  $realReportReady -and
  $evidenceChain -and
  [bool]$evidenceChain.passed
)
$uiSmokeReadyForFinal = [bool]($uiSmoke -and [bool]$uiSmoke.gate.passed)
$liveAiReadyForFinal = [bool](
  $RequireLiveAi.IsPresent -and
  [bool]$aiReport.effective.readyForLiveAi -and
  $aiLiveSmoke -and
  [string]$aiLiveSmoke.mode -eq "network-enabled" -and
  [bool]$aiLiveSmoke.network.called -and
  [bool]$aiLiveSmoke.strictGate.passed -and
  [bool]$aiLiveSmoke.reportAudit.passed
)
$terminalGoalReady = [bool](
  $realDataSourceReady -and
  $realImportedSqliteReady -and
  $realStarMapReady -and
  $hotspotEvidenceReady -and
  $realReportReady -and
  $evidenceChainReadyForFinal -and
  $uiSmokeReadyForFinal -and
  $liveAiReadyForFinal
)
$finalReadinessWarnings = @(
  if (-not $realDataSourceReady) { "Final source data is not proven: use a non-sample 100000+ source file, keep MinValidRows at 100000 or higher, and do not use -SkipBaseline." }
  if (-not $sourceManifestReady) { "Final source manifest is missing, sample-like, below threshold, or lacks SHA-256." }
  if ($sourceLooksSample) { "Current LibraryPath looks like sample/demo data and cannot prove final completion." }
  if ($starMapExport -and -not $RejectSampleStarMapSignals.IsPresent) { "Final star-map acceptance should be re-run with -RejectSampleStarMapSignals." }
  if ($starMapExport -and -not $starMapSampleClean) { "Star-map export contains sample-like evidence IDs; this is acceptable for sample runs only." }
  if (-not $evidenceChainReadyForFinal) { "Final evidence chain is missing or not tied to the same SQLite database, hotspot, and report." }
  if (-not $uiSmokeReadyForFinal) { "Final UI smoke evidence is missing or failed." }
  if (-not $liveAiReadyForFinal) { "Final live AI evidence is missing, dry-run only, or live AI was not required for this run." }
)

$summary = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  projectRoot = [string]$Root
  originalLibraryPath = [string]$OriginalLibraryResolved
  libraryPath = [string]$EffectiveLibraryResolved
  bibliographyConversionRan = $BibliographyConversionRan
  bibliographyConvertedPath = if ($BibliographyConvertedPath) { [string]$BibliographyConvertedPath } else { $null }
  baselineSkipped = $SkipBaseline.IsPresent
  minValidRows = $MinValidRows
  realLibraryGatePassed = [bool]$libraryReport.strictGate.passed
  validRows = [int]$libraryReport.validRows
  invalidRows = [int]$libraryReport.invalidRows
  duplicateRows = [int]$libraryReport.duplicateRows
  sourceLooksSample = $sourceLooksSample
  sourceManifestRan = [bool]($null -ne $sourceManifest)
  sourceManifestPath = "outputs/v20_source_manifest_final.json"
  sourceManifestSha256 = if ($sourceManifest) { [string]$sourceManifest.source.sha256 } else { $null }
  sourceManifestSampleLike = if ($sourceManifest) { [bool]$sourceManifest.source.sampleLike } else { $null }
  sourceManifestTerminalCandidate = if ($sourceManifest) { [bool]$sourceManifest.source.terminalCandidate } else { $null }
  liveAiRequired = $RequireLiveAi.IsPresent
  terminalReadyRequired = $RequireTerminalReady.IsPresent
  readyForLiveAi = [bool]$aiReport.effective.readyForLiveAi
  aiLiveSmokeRan = [bool]($null -ne $aiLiveSmoke)
  aiLiveSmokePassed = if ($aiLiveSmoke) { [bool]$aiLiveSmoke.strictGate.passed } else { $null }
  aiLiveSmokeNetworkCalled = if ($aiLiveSmoke) { [bool]$aiLiveSmoke.network.called } else { $null }
  aiLiveSmokeReportAuditPassed = if ($aiLiveSmoke) { [bool]$aiLiveSmoke.reportAudit.passed } else { $null }
  headlessImportRan = [bool]($null -ne $importReport)
  headlessImportProcessedRows = if ($importReport) { [int]$importReport.import.processedRows } else { $null }
  headlessImportInsertedRows = if ($importReport) { [int]$importReport.import.inserted } else { $null }
  headlessImportUpdatedRows = if ($importReport) { [int]$importReport.import.updated } else { $null }
  headlessImportInvalidRows = if ($importReport) { [int]$importReport.import.invalidRows } else { $null }
  headlessImportDuplicateRows = if ($importReport) { [int]$importReport.import.duplicateRows } else { $null }
  sqliteAuditRan = [bool]($null -ne $sqliteAudit)
  sqliteAuditPassed = if ($sqliteAudit) { [bool]$sqliteAudit.strictGate.passed } else { $null }
  importedPaperCount = if ($sqliteAudit) { [int]$sqliteAudit.paperCount } else { $null }
  importedVisibleHotspots = if ($sqliteAudit) { [int]$sqliteAudit.clusterSmoke.visibleHotspotCount } else { $null }
  starMapExportRan = [bool]($null -ne $starMapExport)
  starMapExportPassed = if ($starMapExport) { [bool]$starMapExport.strictGate.passed } else { $null }
  starMapHotspotCount = if ($starMapExport) { [int]$starMapExport.hotspotCount } else { $null }
  starMapEvidenceIdCount = if ($starMapExport) { [int]$starMapExport.evidenceIdCount } else { $null }
  starMapSemanticLinkCount = if ($starMapExport) { [int]$starMapExport.semanticLinkCount } else { $null }
  starMapEvidenceCoverage = if ($starMapExport) { [double]$starMapExport.evidenceProfile.evidenceCoverage } else { $null }
  starMapEvolutionCoverage = if ($starMapExport) { [double]$starMapExport.evidenceProfile.evolutionCoverage } else { $null }
  starMapSourceDistributionCoverage = if ($starMapExport) { [double]$starMapExport.evidenceProfile.sourceDistributionCoverage } else { $null }
  starMapSampleSignalCount = if ($starMapExport) { [int]$starMapExport.evidenceProfile.sampleSignalCount } else { $null }
  rejectSampleStarMapSignals = $RejectSampleStarMapSignals.IsPresent
  hotspotEvidenceRan = [bool]($null -ne $hotspotEvidence)
  hotspotEvidencePassed = if ($hotspotEvidence) { [bool]$hotspotEvidence.strictGate.passed } else { $null }
  hotspotEvidenceSelectedId = if ($hotspotEvidence) { [string]$hotspotEvidence.selectedHotspotId } else { $null }
  hotspotRepresentativePaperCount = if ($hotspotEvidence) { @($hotspotEvidence.representativePapers).Count } else { $null }
  hotspotMissingRepresentativeIds = if ($hotspotEvidence) { @($hotspotEvidence.missingRepresentativeIds).Count } else { $null }
  hotspotReportGenerated = [bool]($null -ne $generatedHotspotReportPath)
  hotspotReportPath = if ($generatedHotspotReportPath) { [string]$generatedHotspotReportPath } else { $null }
  hotspotReportHtmlPath = if ($generatedHotspotReportHtmlPath) { [string]$generatedHotspotReportHtmlPath } else { $null }
  reportAuditRan = [bool]($null -ne $reportAudit)
  reportAuditPassed = if ($reportAudit) { [bool]$reportAudit.strictGate.passed } else { $null }
  reportRiskLevel = if ($reportAudit) { [string]$reportAudit.riskLevel } else { $null }
  reportCitationCount = if ($reportAudit) { [int]$reportAudit.citationCount } else { $null }
  reportReferenceCount = if ($reportAudit) { [int]$reportAudit.referenceCount } else { $null }
  evidenceChainPassed = if ($evidenceChain) { [bool]$evidenceChain.passed } else { $null }
  evidenceChainSqliteDatabasePath = if ($evidenceChain) { [string]$evidenceChain.sqliteDatabasePath } else { $null }
  evidenceChainStarMapDatabasePath = if ($evidenceChain) { [string]$evidenceChain.starMapDatabasePath } else { $null }
  evidenceChainHotspotEvidenceDatabasePath = if ($evidenceChain) { [string]$evidenceChain.hotspotEvidenceDatabasePath } else { $null }
  evidenceChainSelectedHotspotId = if ($evidenceChain) { [string]$evidenceChain.selectedHotspotId } else { $null }
  evidenceChainReportPath = if ($evidenceChain) { [string]$evidenceChain.reportPath } else { $null }
  uiSmokeRan = [bool]($null -ne $uiSmoke)
  uiSmokePassed = if ($uiSmoke) { [bool]$uiSmoke.gate.passed } else { $null }
  uiConsoleIssueCount = if ($uiSmoke) { @($uiSmoke.consoleIssues).Count } else { $null }
  remainingAppProcesses = $remainingAppProcesses
  finalReadiness = [ordered]@{
    terminalGoalReady = $terminalGoalReady
    realDataSourceReady = $realDataSourceReady
    realImportedSqliteReady = $realImportedSqliteReady
    realStarMapReady = $realStarMapReady
    hotspotEvidenceReady = $hotspotEvidenceReady
    realReportReady = $realReportReady
    evidenceChainReady = $evidenceChainReadyForFinal
    uiSmokeReady = $uiSmokeReadyForFinal
    liveAiReady = $liveAiReadyForFinal
    sourceLooksSample = $sourceLooksSample
    sourceManifestReady = $sourceManifestReady
    starMapCoverageReady = $starMapCoverageReady
    starMapSampleClean = $starMapSampleClean
    rejectSampleStarMapSignals = $RejectSampleStarMapSignals.IsPresent
    warnings = $finalReadinessWarnings
  }
  outputs = [ordered]@{
    log = "outputs/v20_final_acceptance_gate.log"
    bibliographyConversion = "outputs/v20_bibliography_conversion_final.json"
    realLibraryPreflight = "outputs/v20_real_library_preflight_user.json"
    sourceManifest = "outputs/v20_source_manifest_final.json"
    aiConfigPreflight = "outputs/v20_ai_config_preflight_final.json"
    aiLiveSmoke = "outputs/v20_ai_live_report_smoke.json"
    importLibrary = "outputs/v20_import_library_final.json"
    sqliteLibraryAudit = "outputs/v20_sqlite_library_audit_final.json"
    starMapExport = "outputs/v20_star_map_export_final.json"
    hotspotEvidence = "outputs/v20_hotspot_evidence_final.json"
    hotspotEvidenceMarkdown = "outputs/v20_hotspot_evidence_final.md"
    hotspotReport = "outputs/v20_hotspot_report_final.md"
    hotspotReportHtml = "outputs/v20_hotspot_report_final.html"
    reportExportAudit = "outputs/v20_report_export_audit_final.json"
    uiSmoke = "outputs/v20_ui_final_smoke.json"
    summary = "outputs/v20_final_acceptance_gate_summary.json"
  }
  manualAcceptanceStillRequired = @(
    if (-not $realDataSourceReady) { "Provide a non-sample 100000+ source file and run this gate without -SkipBaseline and with -MinValidRows 100000 or higher." }
    if ($sourceLooksSample) { "Replace the current sample/demo LibraryPath with the real paper library path." }
    if ($starMapExport -and -not $RejectSampleStarMapSignals.IsPresent) { "Re-run final star-map acceptance with -RejectSampleStarMapSignals." }
    if (-not $sqliteAudit -and -not $importReport) { "Import the checked real library in the desktop app, or re-run this gate with -ImportBeforeAudit and -DatabaseDir." }
    "Run or confirm cleaning, deduplication, and hotspot clustering from the desktop app UI."
    if (-not $sqliteAudit) { "Re-run this gate with -DatabaseDir or -DatabasePath to audit the imported SQLite library." }
    if (-not $starMapExport) { "Run star-map semantic export and re-run this gate with -ExportStarMap or -StarMapPath." }
    if (-not $hotspotEvidence) { "Run hotspot evidence bundle export and re-run this gate with -ExportHotspotEvidence or -HotspotEvidencePath." }
    if (-not $generatedHotspotReportPath -and -not $reportAudit) { "Generate a deterministic hotspot report with -GenerateHotspotReport or provide -ReportPath." }
    "Inspect star-map filters, focus, fullscreen, semantic links, labels, and evidence tracing on real hotspots."
    if (-not $reportAudit) { "Generate and export one formal report from a selected real hotspot." }
    if (-not $reportAudit) { "Re-run this gate with -ReportPath to audit the exported report evidence chain." }
    if (-not $uiSmoke) { "Run star-map UI smoke verification and re-run this gate with -UiSmokePath." }
    if (-not $aiLiveSmoke) { "Run `pnpm ai:live-smoke -- --allow-network --require-live` and re-run this gate with -AiLiveSmokePath." }
  )
}

$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $SummaryPath -Encoding UTF8

Write-Step "Summary: $SummaryPath"
Write-Step "Remaining app processes: $remainingAppProcesses"
if (-not $RequireLiveAi) {
  Write-Step "Live AI was not required for this run. Use -RequireLiveAi for final completion gating."
}
if (-not $sqliteAudit) {
  Write-Step "Imported SQLite audit was not run. Use -DatabaseDir or -DatabasePath after app import."
}
if (-not $reportAudit) {
  Write-Step "Exported report audit was not run. Use -ReportPath after report export."
}
if (-not $starMapExport) {
  Write-Step "Star-map semantic export was not run. Use -ExportStarMap or -StarMapPath after real library import."
}
if (-not $hotspotEvidence) {
  Write-Step "Hotspot evidence export was not run. Use -ExportHotspotEvidence or -HotspotEvidencePath after real library import."
}
if (-not $generatedHotspotReportPath) {
  Write-Step "Hotspot report generation was not run. Use -GenerateHotspotReport after hotspot evidence export."
}
if (-not $uiSmoke) {
  Write-Step "UI smoke evidence was not provided. Use -UiSmokePath after star-map UI verification."
}
if (-not $aiLiveSmoke) {
  Write-Step "AI live smoke evidence was not provided. Use -AiLiveSmokePath after live report smoke verification."
}
if ($RequireTerminalReady -and -not $terminalGoalReady) {
  Write-Step "Terminal readiness was required but finalReadiness.terminalGoalReady=false."
  foreach ($warning in $finalReadinessWarnings) {
    Write-Step "Terminal readiness warning: $warning"
  }
  throw "Terminal readiness gate failed. See $SummaryPath finalReadiness for details."
}
Write-Step "V20 final acceptance gate completed."
