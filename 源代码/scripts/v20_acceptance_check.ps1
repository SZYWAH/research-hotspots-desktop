param(
  [switch]$RunTauriBuild,
  [switch]$RunPressureTest,
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
  # Older hosts can still run the checks; encoding setup is best-effort.
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $Root "outputs"
$LogPath = Join-Path $OutputDir "v20_acceptance_check.log"
$CargoHome = "D:\.cargo"
$ExePath = Join-Path $Root "src-tauri\target\release\research-hotspots-desktop.exe"
$RustTestManifest = Join-Path $Root "src-tauri\windows-test.manifest"
$ImportRecoveryDir = Join-Path $Root "work\import-recovery-report-check"
$ImportRecoveryReportPath = Join-Path $OutputDir "v20_import_recovery_report_check.json"
$ImportManifestCheckPath = Join-Path $OutputDir "v20_import_manifest_check.json"

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
  $stdoutPath = Join-Path $OutputDir ".v20_acceptance_stdout.tmp"
  $stderrPath = Join-Path $OutputDir ".v20_acceptance_stderr.tmp"
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

function Get-PeSubsystem {
  param([string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
  $optionalHeaderOffset = $peOffset + 24
  $magic = [BitConverter]::ToUInt16($bytes, $optionalHeaderOffset)
  $subsystemOffset = if ($magic -eq 0x20B) { $optionalHeaderOffset + 0x44 } else { $optionalHeaderOffset + 0x5C }
  $subsystem = [BitConverter]::ToUInt16($bytes, $subsystemOffset)
  switch ($subsystem) {
    2 { "Windows GUI" }
    3 { "Windows Console" }
    default { "Unknown ($subsystem)" }
  }
}

Set-Location $Root
Set-Content -LiteralPath $LogPath -Value ("V20 acceptance check started at {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) -Encoding UTF8

Write-Step "Project root: $Root"
Write-Step "Cargo home: $CargoHome"

Invoke-NativeLogged "version alignment" "node.exe" @((Join-Path $Root "scripts\version_alignment.mjs"), "--current-only")

Invoke-NativeLogged "pnpm build" "pnpm.cmd" @("build")

Invoke-NativeLogged "paper import format check" "node.exe" @((Join-Path $Root "scripts\v20_import_format_check.mjs"))

Invoke-NativeLogged "bibliography conversion and preflight check" "node.exe" @((Join-Path $Root "scripts\v20_bibliography_conversion_check.mjs"))

Invoke-NativeLogged "real library preflight sample check" "node.exe" @((Join-Path $Root "scripts\v20_real_library_preflight.mjs"), (Join-Path $Root "data\samples\papers_sample.jsonl"), "--output", (Join-Path $Root "outputs\v20_real_library_preflight_sample_jsonl.json"))

Invoke-NativeLogged "report layer offline check" "node.exe" @((Join-Path $Root "scripts\v20_report_layer_check.mjs"))

Invoke-NativeLogged "report export citation coverage check" "node.exe" @((Join-Path $Root "scripts\v20_report_export_audit_check.mjs"))

Invoke-NativeLogged "hotspot evidence offline report check" "node.exe" @((Join-Path $Root "scripts\v20_hotspot_evidence_report_check.mjs"))

Invoke-NativeLogged "AI configuration read-only preflight" "node.exe" @((Join-Path $Root "scripts\v20_ai_config_preflight.mjs"))

Invoke-NativeLogged "storage location and free-space preflight" "node.exe" @((Join-Path $Root "scripts\v20_storage_preflight.mjs"), "--config", (Join-Path $Root "configs\v20_terminal_acceptance.example.json"))

Invoke-NativeLogged "capacity planning check" "node.exe" @((Join-Path $Root "scripts\v20_capacity_plan_check.mjs"))

Invoke-NativeLogged "source manifest check" "node.exe" @((Join-Path $Root "scripts\v20_source_manifest_check.mjs"))

Invoke-NativeLogged "terminal config from discovery check" "node.exe" @((Join-Path $Root "scripts\v20_terminal_config_from_discovery_check.mjs"))

Invoke-NativeLogged "terminal preparation check" "node.exe" @((Join-Path $Root "scripts\v20_terminal_prepare_check.mjs"))

Invoke-NativeLogged "terminal runbook path quote check" "node.exe" @((Join-Path $Root "scripts\v20_terminal_runbook_path_quote_check.mjs"))

Invoke-NativeLogged "terminal config semantic validator check" "node.exe" @((Join-Path $Root "scripts\v20_terminal_config_validator_check.mjs"))

Invoke-NativeLogged "final gate direct evidence rejection check" "node.exe" @((Join-Path $Root "scripts\v20_final_gate_direct_evidence_check.mjs"))

Invoke-NativeLogged "goal readiness audit false-positive guard check" "node.exe" @((Join-Path $Root "scripts\v20_goal_readiness_audit_check.mjs"))

Invoke-NativeLogged "terminal evidence chain consistency check" "node.exe" @((Join-Path $Root "scripts\v20_evidence_chain_check.mjs"))

$env:CARGO_HOME = $CargoHome
Invoke-NativeLogged "cargo check" "cargo.exe" @("check", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"))

if (Test-Path -LiteralPath $ImportRecoveryDir) {
  $resolvedRecoveryDir = Resolve-Path -LiteralPath $ImportRecoveryDir
  $resolvedWorkDir = Resolve-Path -LiteralPath (Join-Path $Root "work")
  if (-not ($resolvedRecoveryDir.Path.StartsWith($resolvedWorkDir.Path + [System.IO.Path]::DirectorySeparatorChar))) {
    throw "Refusing to remove import recovery dir outside work: $($resolvedRecoveryDir.Path)"
  }
  Remove-Item -LiteralPath $resolvedRecoveryDir.Path -Recurse -Force
}

Invoke-NativeLogged "headless import recovery manifest check" "cargo.exe" @(
  "run",
  "--quiet",
  "--manifest-path",
  (Join-Path $Root "src-tauri\Cargo.toml"),
  "--bin",
  "import_library",
  "--",
  "--source",
  (Join-Path $Root "data\samples\papers_sample.jsonl"),
  "--database-dir",
  $ImportRecoveryDir,
  "--project-id",
  "recovery-report-check",
  "--output",
  $ImportRecoveryReportPath
)

$importRecoveryReport = Get-Content -LiteralPath $ImportRecoveryReportPath -Encoding UTF8 -Raw | ConvertFrom-Json
if (-not $importRecoveryReport.import.recovery.safeToRerun) {
  throw "Import recovery report did not mark safeToRerun=true."
}
if ([int]$importRecoveryReport.import.recovery.batchSize -ne 1000) {
  throw "Import recovery report batchSize was not 1000."
}
Copy-Item -LiteralPath $importRecoveryReport.import.manifestPath -Destination $ImportManifestCheckPath -Force
$importManifest = Get-Content -LiteralPath $ImportManifestCheckPath -Encoding UTF8 -Raw | ConvertFrom-Json
if ([string]$importManifest.status -ne "done" -or -not $importManifest.recovery.safeToRerun) {
  throw "Import manifest check failed."
}
$importManifest | Add-Member -NotePropertyName "evidenceCopyPath" -NotePropertyValue "outputs/v20_import_manifest_check.json" -Force
$importManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ImportManifestCheckPath -Encoding UTF8
$resolvedRecoveryDir = Resolve-Path -LiteralPath $ImportRecoveryDir
$resolvedWorkDir = Resolve-Path -LiteralPath (Join-Path $Root "work")
if (-not ($resolvedRecoveryDir.Path.StartsWith($resolvedWorkDir.Path + [System.IO.Path]::DirectorySeparatorChar))) {
  throw "Refusing to remove import recovery dir outside work: $($resolvedRecoveryDir.Path)"
}
Remove-Item -LiteralPath $resolvedRecoveryDir.Path -Recurse -Force
Write-Step "Import recovery manifest evidence: outputs\v20_import_manifest_check.json"

$previousRustFlags = $env:RUSTFLAGS
try {
  $env:RUSTFLAGS = "-C link-arg=/MANIFEST:EMBED -C link-arg=/MANIFESTINPUT:$RustTestManifest"
  Invoke-NativeLogged "cargo import normalization tests" "cargo.exe" @("test", "--lib", "import_normalization", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--nocapture")

  Invoke-NativeLogged "cargo bibliography file import test" "cargo.exe" @("test", "--lib", "bibliography_file_import_accepts_bibtex_and_ris", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--nocapture")

  Invoke-NativeLogged "cargo idempotent import recovery test" "cargo.exe" @("test", "--lib", "paper_file_import_is_idempotent_for_resume_recovery", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--nocapture")

  Invoke-NativeLogged "cargo small sqlite pipeline test" "cargo.exe" @("test", "--lib", "sqlite_small_library_pipeline", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--nocapture")

  Invoke-NativeLogged "cargo hotspot evidence export test" "cargo.exe" @("test", "--lib", "hotspot_evidence_export_traces_representative_papers", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--nocapture")

  Invoke-NativeLogged "cargo sqlite backup restore test" "cargo.exe" @("test", "--lib", "sqlite_backup_restore_roundtrip", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--nocapture")
} finally {
  if ($null -eq $previousRustFlags) {
    Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue
  } else {
    $env:RUSTFLAGS = $previousRustFlags
  }
}

if ($RunPressureTest) {
  $previousRustFlags = $env:RUSTFLAGS
  try {
    $env:RUSTFLAGS = "-C link-arg=/MANIFEST:EMBED -C link-arg=/MANIFESTINPUT:$RustTestManifest"
    Invoke-NativeLogged "cargo 100k pressure test" "cargo.exe" @("test", "--lib", "pressure_test_100k_library_pipeline", "--manifest-path", (Join-Path $Root "src-tauri\Cargo.toml"), "--", "--ignored", "--nocapture")
  } finally {
    if ($null -eq $previousRustFlags) {
      Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue
    } else {
      $env:RUSTFLAGS = $previousRustFlags
    }
  }
} else {
  Write-Step "Skipping 100k pressure test. Use -RunPressureTest to execute it."
}

if ($RunTauriBuild) {
  Invoke-NativeLogged "pnpm tauri build" "pnpm.cmd" @("tauri", "build")
} else {
  Write-Step "Skipping tauri build. Use -RunTauriBuild to execute it."
}

if (Test-Path -LiteralPath $ExePath) {
  $exe = Get-Item -LiteralPath $ExePath
  $subsystem = Get-PeSubsystem -Path $ExePath
  Write-Step ("Release exe: {0}" -f $ExePath)
  Write-Step ("Release exe size MB: {0}" -f ([Math]::Round($exe.Length / 1MB, 2)))
  Write-Step ("Release exe subsystem: {0}" -f $subsystem)
  Write-Step ("Release exe product version: {0}" -f $exe.VersionInfo.ProductVersion)
  if ($subsystem -ne "Windows GUI") {
    throw "Release exe is not Windows GUI."
  }
} else {
  Write-Step "Release exe not found. Use -RunTauriBuild to create it."
}

if ($LaunchExe) {
  if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Cannot launch missing exe: $ExePath"
  }
  Write-Step "Launching release exe for 8 seconds."
  $beforeCmd = @(Get-Process -Name cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $p = Start-Process -FilePath $ExePath -WorkingDirectory (Split-Path -Parent $ExePath) -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 8
  $main = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  $afterCmd = @(Get-Process -Name cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $newCmd = $afterCmd | Where-Object { $beforeCmd -notcontains $_ }
  if (-not $main) {
    throw "Release exe exited before 8 second smoke check completed."
  }
  Write-Step ("Launch check running: pid={0}, responding={1}, title={2}" -f $main.Id, $main.Responding, $main.MainWindowTitle)
  if (@($newCmd).Count -gt 0) {
    throw "cmd.exe process appeared during launch check: $($newCmd -join ',')"
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $remaining = @(Get-Process -Name "research-hotspots-desktop" -ErrorAction SilentlyContinue).Count
  Write-Step ("Remaining app processes after cleanup: {0}" -f $remaining)
  if ($remaining -gt 0) {
    throw "App process cleanup failed."
  }
} else {
  Write-Step "Skipping exe launch check. Use -LaunchExe to execute it."
}

Write-Step "V20 acceptance core checks completed."
Invoke-NativeLogged "goal readiness audit" "node.exe" @((Join-Path $Root "scripts\v20_goal_readiness_audit.mjs"))

Write-Step "V20 acceptance check completed."
