# V20 Final Handoff

> Product-scope notice (2026-07-27): this document is the historical V20
> infrastructure handoff, not the final product definition. The authoritative
> product target is [Research Agent 最终产品目标](./RESEARCH_AGENT_PRODUCT_GOAL.md),
> and its delivery sequence is defined by
> [Research Agent 分阶段实施路线](./RESEARCH_AGENT_IMPLEMENTATION_ROADMAP.md).
> V20 remains required infrastructure beneath that product.

Updated: 2026-07-07

This document describes the current V20 delivery state of the local-first research hotspots desktop workstation. It complements `outputs/V20_FINAL_ACCEPTANCE.md`, which records the latest command outputs and screenshots.

## Product Target

The application is a local-first desktop workstation for research hotspot analysis. It is intended to support large paper libraries, local SQLite storage, cleaning, clustering, hotspot evolution, semantic star-map visualization, evidence tracing, report generation, backup, restore, and stable Windows exe delivery.

## Current Version

- Application version: `0.20.0`
- Release exe: `D:\wenjian\Desktop\综合课程设计\源代码\src-tauri\target\release\research-hotspots-desktop.exe`
- Release subsystem: `Windows GUI`
- Main window title: `Research Hotspots Desktop`

Version sources:

- `package.json`
- `vite.config.ts`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

## Layer Boundaries

### Frontend

Main files:

- `src/App.tsx`
- `src/index.css`
- `src/main.tsx`

Responsibilities:

- Navigation, layout, dashboards, literature workbench, star map page, hotspot library, report library, pipeline page, health page, about page, and settings page.
- Product visual language: restrained dark scientific UI, compact controls, consistent panel hierarchy, and high-contrast data surfaces.
- User workflow orchestration, while heavy data operations remain in Rust/Tauri where possible.

### Visualization

Main files:

- `src/components/ReferenceGalaxyCanvas.tsx`
- Star-map integration in `src/App.tsx`

Responsibilities:

- Research star-map rendering.
- Sharp deep-space scientific star field style.
- Hotspot labels, semantic links, focus controls, galaxy mode, fullscreen mode, and evidence panel integration.
- Avoids the old plastic-planet/glow-heavy visual metaphor.

### Desktop Backend

Main files:

- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`
- `src-tauri/tauri.conf.json`

Responsibilities:

- Tauri commands.
- SQLite access and indexing.
- Large-file paper import.
- Library cleaning and clustering.
- Health checks.
- Pressure testing.
- Backup and restore.
- Markdown/file export helpers.
- Release exe generation.

### Data Layer

Main files:

- `src-tauri/src/lib.rs`
- `src/data/researchStore.ts`
- `src/lib/desktop.ts`
- `src/types.ts`

Responsibilities:

- SQLite is the main storage for the large paper library.
- IndexedDB stores lightweight frontend state, settings, reports, task logs, and project metadata.
- Paper library commands provide pagination, search, facets, deletion, upsert, import, backup, restore, and pressure testing.
- Database indexes cover project/year/source/field/DOI combinations for large-library queries.

### AI And Report Layer

Main files:

- `src/ai/deepseek.ts`
- `src/lib/references.ts`
- `src/types.ts`

Responsibilities:

- AI-assisted research report generation.
- Evidence profile construction.
- Report quality audit.
- Representative papers, yearly trend, source distribution, keyword network, future directions, and citation/evidence traceability.
- AI is scoped to research analysis, not open-ended chat.

### Worker Layer

Main files:

- `workers/task_worker.py`
- `workers/cleaner_worker.py`
- `workers/cluster_worker.py`
- Rust-native large-library commands in `src-tauri/src/lib.rs`

Responsibilities:

- Legacy/lightweight Python worker compatibility.
- Heavy large-library desktop operations are handled by Rust/Tauri + SQLite in the current mainline.

## Dependency Notes

Node dependencies:

- React / React DOM
- Vite / TypeScript
- Tailwind CSS / PostCSS / Autoprefixer
- Tauri API / dialog / opener / CLI
- Three.js / React Three Fiber / Drei
- idb
- lucide-react

Rust dependencies:

- Tauri 2
- Tauri dialog/opener plugins
- rusqlite with bundled SQLite
- serde / serde_json
- csv
- chrono
- uuid

No additional large visualization or postprocessing dependency is required for the current V20 state.

## Data Directories

Recommended policy:

- Keep project dependencies and generated build artifacts in the project directory on `D:`.
- Use `D:\.cargo` for Rust cache when running Cargo commands.
- Avoid unnecessary C drive downloads or cache growth.
- Use configured SQLite, export, backup, and worker temp directories from the app settings where possible.

Known current artifact locations:

- SQLite sample/library data: `data/library`
- Exports: `data/exports`
- Screenshots and acceptance notes: `outputs`
- Temporary run files: `work`
- Release exe: `src-tauri/target/release`

## Encoding Notes

Source files and delivery documents are UTF-8. On Windows PowerShell 5.1, reading UTF-8 Markdown without specifying the encoding can display Chinese as garbled text even when the file content is correct.

Recommended PowerShell reads:

```powershell
Get-Content -Encoding UTF8 docs\V20_FINAL_HANDOFF.md
Get-Content -Encoding UTF8 outputs\V20_FINAL_ACCEPTANCE.md
```

The reusable acceptance script sets UTF-8 output and writes `outputs\v20_acceptance_check.log` with UTF-8 encoding.

## Verification Commands

Run from:

```powershell
D:\wenjian\Desktop\综合课程设计\源代码
```

Standard checks:

```powershell
pnpm build
$env:CARGO_HOME='D:\.cargo'; cargo check --manifest-path src-tauri\Cargo.toml
$env:CARGO_HOME='D:\.cargo'; pnpm tauri build
```

Explicit 100k pressure test:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo test pressure_test_100k_library_pipeline --manifest-path src-tauri\Cargo.toml -- --ignored --nocapture
```

Reusable local script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\v20_acceptance_check.ps1
```

The reusable script also embeds `src-tauri\windows-test.manifest` through temporary `RUSTFLAGS` for Rust lib-test commands. This activates Windows Common Controls v6 for the test binary and prevents the previous `0xc0000139 / STATUS_ENTRYPOINT_NOT_FOUND` loader failure while leaving normal Tauri build metadata untouched.

Report-layer offline check:

```powershell
node scripts\v20_report_layer_check.mjs
```

This check directly transpiles and imports `src/lib/references.ts`, then verifies evidence profile construction, citation metrics, report audit, reference generation, and HTML export without requiring a real AI key.

Hotspot evidence offline report check:

```powershell
pnpm report:evidence-check
```

This check imports `src/lib/hotspotEvidenceReport.ts`, converts a deterministic hotspot evidence bundle into report-ready papers, generates the offline Markdown research report, and writes `outputs\v20_hotspot_evidence_report_check.json` plus `outputs\v20_hotspot_evidence_offline_report_check.md`. It is included in the default `pnpm acceptance:v20` chain.

`pnpm acceptance:status` also reads this evidence and reports it as `Offline hotspot evidence report generation`, while still keeping the real-data terminal report gate separate.

Exported report evidence audit:

```powershell
node scripts\v20_report_export_audit.mjs outputs\v20_report_layer_check.html --require-evidence --require-sections --require-references --output outputs\report_export_audit.json
```

This read-only script checks a real exported Markdown or HTML report for evidence overview, required report sections, citation indices, reference entries, invalid citation ranges, optional citation coverage, and core semantic signals such as representative papers, yearly trend, source distribution, keyword network, and future directions. The strict final gate runs it with `--min-citation-coverage 1`, so every numbered reference must be cited by the report narrative.

Report export citation coverage regression:

```powershell
pnpm report:audit-check
```

This check verifies that a report with full reference citation coverage passes, while a report that lists references without citing all of them fails. It writes `outputs\v20_report_export_audit_check.json` and is embedded in `pnpm acceptance:v20`.

AI configuration read-only preflight:

```powershell
node scripts\v20_ai_config_preflight.mjs
```

This check inspects `.env`, `.env.local`, mode-specific Vite env files, and matching process environment variables for `VITE_DEEPSEEK_API_KEY`, `VITE_DEEPSEEK_BASE_URL`, and `VITE_DEEPSEEK_MODEL`. It writes `outputs\v20_ai_config_preflight.json`, masks any detected API key, and exits successfully even when no live key is configured. Legacy `DEEPSEEK_*` variables are reported because the current frontend AI path only reads `VITE_*` variables or the manual key saved from the Settings page.

AI env bridge:

```powershell
pnpm ai:bridge-env -- --output outputs\v20_ai_env_bridge.json
pnpm ai:bridge-env -- --write
```

The first command is a dry-run that reports masked planned updates. The second command explicitly writes usable legacy `DEEPSEEK_*` values into `.env.local` as `VITE_DEEPSEEK_*`. The bridge never writes raw secrets into its JSON report.

AI live report smoke:

```powershell
pnpm ai:live-smoke -- --output outputs\v20_ai_live_report_smoke.json
pnpm ai:live-smoke -- --allow-network --require-live
```

The first command is dry-run and does not call the provider. The second command explicitly performs one live chat-completions request against the configured provider, writes a sample report when successful, and audits whether the generated text preserves evidence sections, citations, references, and semantic signals. Its JSON report masks the API key.

Goal readiness audit:

```powershell
node scripts\v20_goal_readiness_audit.mjs
```

This read-only audit summarizes which terminal-goal requirements are currently proven by artifacts and which remain unproven because they still need the user's real `100000+` paper library, live AI configuration, real-data star-map verification, or real exported report evidence. It writes:

- `outputs/v20_goal_readiness_audit.json`
- `outputs/V20_GOAL_READINESS_AUDIT.md`

Paper-import format check:

```powershell
node scripts\v20_import_format_check.mjs
```

This check directly transpiles and imports `src/lib/importers.ts`, then verifies CSV and JSONL sample parsing, field aliases, source normalization, year parsing, duplicate count, and invalid row count. Import format details are documented in `docs/PAPER_IMPORT_FORMAT.md`.

Bibliography export conversion:

```powershell
pnpm convert:bibliography -- D:\papers\library.bib --output D:\papers\library.jsonl --report outputs\bibliography_conversion_report.json
pnpm convert:bibliography -- D:\papers\library.ris --output D:\papers\library.jsonl --report outputs\bibliography_conversion_report.json
```

This converts BibTeX/RIS exports from Zotero, EndNote, Mendeley, Web of Science or similar tools into the JSONL shape consumed by the existing preflight and Rust SQLite import path. The default format check now verifies sample BibTeX and RIS conversion, then parses the generated JSONL with the same frontend importer used by preview import.

Desktop direct import also supports `.bib` and `.ris` through the Rust/Tauri large-file path. The in-app `大文件直导` button and the headless `import_library` binary can now stream CSV / JSON / JSONL / NDJSON / BibTeX / RIS into SQLite. The converter remains useful for strict source-file preflight because `v20_real_library_preflight.mjs` audits JSONL/CSV/JSON/NDJSON directly.

Large-file import recovery:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo test --lib paper_file_import_is_idempotent_for_resume_recovery --manifest-path src-tauri\Cargo.toml -- --nocapture
```

The Rust/Tauri import path writes flushed batches in SQLite transactions and is safe to rerun after interruption. It also writes a per-import manifest under `<database-dir>\import-manifests\<task-id>.json`. The headless import report includes `manifestPath` plus a `recovery` object with `safeToRerun=true`, `batchSize=1000`, and the rerun strategy. The default V20 acceptance script runs this recovery test and copies a sample manifest to `outputs\v20_import_manifest_check.json`.

Real-library read-only preflight:

```powershell
node scripts\v20_real_library_preflight.mjs D:\papers\library.jsonl --output outputs\real_library_preflight.json
```

This script does not import into SQLite. It checks a real CSV / JSON / JSONL / NDJSON file for valid rows, invalid rows, duplicate risks, missing abstract/year rates, source distribution, field distribution, year range, and practical recommendations before using `大文件直导`.

Real-data discovery:

```powershell
pnpm discover:real-data -- --root D:\papers --output outputs\v20_real_data_discovery.json --markdown outputs\V20_REAL_DATA_DISCOVERY.md
```

This read-only discovery script scans selected directories for CSV / JSON / JSONL / NDJSON / BibTeX / RIS / SQLite-like files, skips build artifacts by default, samples structured files, estimates candidate row counts, and reports whether any source file looks ready for the final `100000+` row gate. It also writes a `gatePlan` section to the JSON and Markdown reports with the next concrete conversion, strict-preflight, or final-acceptance command when a usable candidate is found. The generated final-acceptance command includes both `-RequireLiveAi` and `-RequireTerminalReady`, so a discovered source cannot be treated as terminal-complete unless all final readiness checks pass. Current workspace discovery found no final-gate-ready source file.

One-command terminal preparation:

```powershell
pnpm acceptance:prepare-terminal -- --root D:\papers
pnpm acceptance:prepare-terminal -- --root D:\papers --require-ready
pnpm acceptance:prepare-terminal -- --root D:\papers --require-ready --require-live-ai-config
```

This command runs AI configuration preflight, real-data discovery, strict terminal config generation, and storage preflight when a config is generated. It writes:

- `outputs\v20_terminal_prepare.json`
- `outputs\V20_TERMINAL_PREPARE.md`
- `outputs\v20_terminal_acceptance.generated.json` when a ready source is found
- `outputs\v20_ai_config_preflight_prepare.json`
- `outputs\v20_source_manifest.generated.json`
- `outputs\v20_capacity_plan.generated.json` when storage preflight runs

Without `--require-ready`, it exits successfully even when no real `100000+` source is found, so it can be used as a diagnostic report. With `--require-ready`, it exits non-zero unless discovery, config generation, and storage preflight all pass. Add `--require-live-ai-config` when you also want missing `VITE_DEEPSEEK_*` live-AI readiness to fail the preparation gate.

Capacity planning:

```powershell
pnpm acceptance:capacity-plan -- --discovery outputs\v20_real_data_discovery.json --storage outputs\v20_storage_preflight.json --min-rows 100000 --min-free-gb 10
pnpm acceptance:capacity-plan -- --discovery outputs\v20_real_data_discovery.json --storage outputs\v20_storage_preflight.json --require-capacity
```

This read-only planner estimates normalized source, BibTeX/RIS conversion output, SQLite database, backup copy, report/export artifacts, and safety margin for the final `100000+` run. It writes `outputs\v20_capacity_plan.json` and `outputs\V20_CAPACITY_PLAN.md`. It is an engineering guardrail only; real completion still requires importing and auditing the actual SQLite library.

Source manifest fingerprinting:

```powershell
pnpm acceptance:source-manifest -- --discovery outputs\v20_real_data_discovery.json --output outputs\v20_source_manifest.json --markdown outputs\V20_SOURCE_MANIFEST.md
pnpm acceptance:source-manifest -- --source D:\papers\library.jsonl --require-terminal-source
```

This read-only manifest records the selected source path, size, modified timestamp, estimated rows, sample/demo risk, and SHA-256 fingerprint. It helps tie the real import, star-map export, and final report back to the exact source file. It does not prove import completion by itself; the SQLite audit and final gate still have to pass against the imported database.

Strict final acceptance now also writes:

- `outputs\v20_source_manifest_final.json`
- `outputs\V20_SOURCE_MANIFEST_FINAL.md`

`outputs\v20_final_acceptance_gate_summary.json` includes `sourceManifestSha256`, `sourceManifestSampleLike`, and `sourceManifestTerminalCandidate`. Final terminal readiness requires this final source manifest to be present, non-sample-like, terminal-candidate-ready, and backed by a SHA-256 fingerprint.

Terminal config generation from discovery:

```powershell
pnpm acceptance:config-from-discovery -- --discovery outputs\v20_real_data_discovery.json --output outputs\v20_terminal_acceptance.generated.json
pnpm acceptance:terminal-config -- --config outputs\v20_terminal_acceptance.generated.json
```

This generator turns a ready discovery `gatePlan` into a strict terminal acceptance config with D-drive SQLite/import targets, live-AI evidence, UI smoke evidence, star-map export, hotspot evidence export, report generation, pressure test, and Tauri build enabled. It fails when discovery has no structured `100000+` source or large BibTeX/RIS source, and strict validation still rejects sample/demo/fixture paths.

Regression check:

```powershell
pnpm acceptance:config-from-discovery-check
```

This check verifies direct structured sources, large BibTeX/RIS sources, missing-source rejection, and sample-like path rejection. It is embedded in `pnpm acceptance:v20`.

Terminal preparation regression:

```powershell
pnpm acceptance:prepare-terminal-check
pnpm acceptance:capacity-plan-check
pnpm acceptance:source-manifest-check
pnpm acceptance:runbook-quote-check
pnpm acceptance:readiness-check
pnpm acceptance:evidence-chain-check
```

`pnpm acceptance:prepare-terminal-check` creates a temporary `100000`-row JSONL fixture under `work`, verifies the one-command preparation flow can produce a strict config and storage preflight, verifies AI config preflight and capacity planning are reported, verifies the discovery `gatePlan.finalAcceptanceCommand` includes both `-RequireLiveAi` and `-RequireTerminalReady`, verifies missing sources report `ready=false`, verifies `--require-ready` / `--require-live-ai-config` hard gates behave correctly, and then removes the temporary directory.

`pnpm acceptance:runbook-quote-check` generates a runbook with Chinese characters and spaces in the discovery root, source library, bibliography export, and SQLite database directory. It verifies the generated PowerShell commands single-quote those paths before terminal use, then writes `outputs\v20_terminal_runbook_path_quote_check.json` and `outputs\V20_TERMINAL_RUNBOOK_PATH_QUOTE_CHECK.md`.

`pnpm acceptance:bibliography-check` verifies the no-new-large-dependency BibTeX/RIS bridge end to end: sample `.bib` and `.ris` files convert to JSONL, both converted outputs pass strict real-library preflight, pure bibliography folders are discovered as conversion-ready sources, and the generated final acceptance command keeps both `-RequireLiveAi` and `-RequireTerminalReady`. This check is embedded in the default `pnpm acceptance:v20` chain and writes `outputs\v20_bibliography_conversion_check.json`, `outputs\v20_bibliography_check_bib_preflight.json`, `outputs\v20_bibliography_check_ris_preflight.json`, and `outputs\V20_BIBLIOGRAPHY_DISCOVERY_CHECK.md`.

`pnpm acceptance:readiness-check` protects the terminal goal audit from false positives. It temporarily writes a forged final-gate summary whose `finalReadiness` fields are all `true` while the underlying source file, manifest, and live-AI evidence are invalid, then verifies `pnpm acceptance:status` still reports `complete=false`. This check is embedded in the default `pnpm acceptance:v20` chain and writes `outputs\v20_goal_readiness_audit_check.json`.

`pnpm acceptance:evidence-chain-check` verifies the final evidence artifacts point to the same SQLite database and project, the selected hotspot evidence exists in the star-map export, representative paper IDs line up, and the audited report path matches the generated final hotspot report. It also runs negative checks for mismatched database paths, missing hotspot IDs, and unrelated report audits. This check is embedded in the default `pnpm acceptance:v20` chain and writes `outputs\v20_evidence_chain_check.json`. The PowerShell final gate now also enforces the same database/project/hotspot/report consistency directly during real terminal acceptance, so mismatched `-StarMapPath`, `-HotspotEvidencePath`, or `-ReportPath` evidence is rejected before the terminal goal can be marked ready.

`pnpm acceptance:capacity-plan-check` verifies ready storage passes strict capacity, low storage fails strict capacity, and missing source candidates still produce a diagnostic capacity plan.

`pnpm acceptance:source-manifest-check` verifies real source hashing, sample-like terminal source rejection, and missing-source diagnostics.

For BibTeX/RIS sources, the strict final acceptance script can now receive the original `.bib` or `.ris` path directly. It will convert the bibliography export to JSONL under `D:\ResearchHotspotsDesktop\imports`, then run the same real-library preflight, optional SQLite import, star-map export, hotspot evidence export, and report audit gates against the converted file.

Headless SQLite import:

```powershell
pnpm import:library -- --source D:\papers\library.jsonl --database-dir D:\ResearchHotspotsDesktop\library --output outputs\v20_import_library_final.json
```

BibTeX/RIS direct import:

```powershell
pnpm import:library -- --source D:\papers\library.bib --database-dir D:\ResearchHotspotsDesktop\library --output outputs\v20_import_library_final.json
pnpm import:library -- --source D:\papers\library.ris --database-dir D:\ResearchHotspotsDesktop\library --output outputs\v20_import_library_final.json
```

This Rust binary uses the same import normalization and SQLite upsert path as the desktop app. It is intended for final acceptance preparation when a real source file is available and writes an import summary with processed, inserted, updated, invalid, duplicate, and elapsed rows.

Headless star-map semantic export:

```powershell
pnpm export:star-map -- --database-dir D:\ResearchHotspotsDesktop\library --min-hotspots 10 --min-evidence-ids 10 --min-links 1 --min-evidence-coverage 0.8 --min-evolution-coverage 0.8 --min-source-distribution-coverage 0.8 --require-evolution --require-source-distribution --reject-sample-signals --output outputs\v20_star_map_export_final.json
```

This Rust binary runs the same SQLite hotspot clustering path used by the app, exports the hotspot JSON shape consumed by the star-map UI, and audits hotspot count, evidence paper ids, semantic links, yearly evolution, source distribution, coordinate spread, evidence coverage, evolution coverage, source-distribution coverage, and sample-like evidence IDs. Use it with a real imported library before claiming real-data star-map acceptance.

The exported `evidenceProfile` object is a real-data guardrail:

- `evidenceCoverage`: share of hotspots with representative paper IDs.
- `evolutionCoverage`: share of hotspots with yearly evolution rows.
- `sourceDistributionCoverage`: share of hotspots with source-distribution rows.
- `averageRepresentativeIds`: average representative evidence IDs per hotspot.
- `sampleSignalCount` / `sampleSignalRate`: count and share of evidence IDs that look like sample/demo data.

For final delivery, keep the three coverage gates at `0.8` or higher and enable `--reject-sample-signals`. Sample runs can omit sample rejection when they intentionally use demo data, but they must not be treated as real-library completion evidence.

Headless hotspot evidence bundle export:

```powershell
pnpm export:hotspot-evidence -- --database-dir D:\ResearchHotspotsDesktop\library --output outputs\v20_hotspot_evidence_final.json --markdown-output outputs\v20_hotspot_evidence_final.md
```

This Rust binary selects a generated SQLite hotspot, exports its representative paper snapshots, missing evidence IDs, yearly evolution, source distribution, similar hotspots, and a Markdown evidence profile. It is intended to prove that report generation and star-map evidence tracing are backed by real papers rather than visual-only hotspot labels.

Desktop hotspot evidence bridge:

- Tauri command: `export_hotspot_evidence`
- Frontend wrapper: `exportHotspotEvidence(...)` in `src/lib/desktop.ts`
- Star-map inspector behavior: when a hotspot is selected, the inspector first tries to load the SQLite evidence bundle for that hotspot. If unavailable, it falls back to existing frontend/IndexedDB representative-paper evidence.
- Hotspot report behavior: the hotspot library report generator also first tries to load the SQLite evidence bundle. Generated reports use the bundle's representative papers when available, and only fall back to frontend related-paper evidence when SQLite evidence is unavailable.
- Default acceptance includes `cargo test hotspot_evidence_export_traces_representative_papers`, proving that representative paper snapshots, yearly evolution, and source distribution can be exported from SQLite.

Headless hotspot report export:

```powershell
pnpm export:hotspot-report -- outputs\v20_hotspot_evidence_final.json --output outputs\v20_hotspot_report_final.md --html-output outputs\v20_hotspot_report_final.html
```

This deterministic report export creates Markdown and HTML directly from the hotspot evidence bundle. It does not call an AI service. The output is intended as an auditable fallback and a final-gate report source when live AI is unavailable or when the report layer needs to be verified independently from model behavior.

Strict real-library gate:

```powershell
node scripts\v20_real_library_preflight.mjs D:\papers\library.jsonl --min-valid-rows 100000 --require-full-scan --output outputs\real_library_preflight.json
```

This enables hard gate checks for final acceptance preparation. Optional `--max-invalid-rate` and `--max-duplicate-rate` can be used to fail messy source files before importing them into the desktop app.

Post-import SQLite audit:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo run --manifest-path src-tauri\Cargo.toml --bin audit_library -- --database-dir data\library --min-rows 100000 --max-query-ms 5000 --min-clusters 10 --require-indexes --output outputs\sqlite_library_audit.json
```

This read-only Rust audit opens the imported SQLite database and checks paper count, missing abstract/year rates, duplicate DOI/URL/title risks, source/field/year facets, production indexes, query smoke time, and whether the library can yield visible hotspot candidates. Use `--database-path` instead of `--database-dir` when auditing a copied `.sqlite` file directly.

Rust backend import normalization:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo test import_normalization --manifest-path src-tauri\Cargo.toml -- --nocapture
```

This covers the Tauri/Rust direct-import normalization logic for Chinese aliases, English aliases, source normalization, year parsing, array-to-text conversion, and default abstract behavior.

BibTeX/RIS direct import unit test:

```powershell
$env:CARGO_HOME='D:\.cargo'; powershell -ExecutionPolicy Bypass -File scripts\v20_acceptance_check.ps1
```

The acceptance script runs `bibliography_file_import_accepts_bibtex_and_ris` with the Windows test manifest applied, proving that `.bib` and `.ris` files enter the same Rust/Tauri SQLite import path as CSV / JSON / JSONL / NDJSON sources.

Small SQLite pipeline test:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo test sqlite_small_library_pipeline --manifest-path src-tauri\Cargo.toml -- --nocapture
```

This non-ignored unit test uses an in-memory SQLite database and covers schema initialization, paper upsert, search blob query, cleaning, duplicate/empty removal, clustering, hotspot confidence, and evidence paper IDs.

SQLite backup/restore roundtrip:

```powershell
$env:CARGO_HOME='D:\.cargo'; cargo test sqlite_backup_restore_roundtrip --manifest-path src-tauri\Cargo.toml -- --nocapture
```

This non-ignored test writes a small SQLite library under `work`, creates a backup, mutates the active library, restores from the backup, verifies paper counts, verifies the safety backup path, and removes its temporary directory.

Heavy full run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\v20_acceptance_check.ps1 -RunTauriBuild -RunPressureTest -LaunchExe
```

Strict final acceptance gate:

```powershell
pnpm acceptance:terminal -- -LibraryPath D:\papers\library.jsonl -DatabaseDir D:\ResearchHotspotsDesktop\library -ImportBeforeAudit -ExportStarMap -MinStarMapEvidenceCoverage 0.8 -MinStarMapEvolutionCoverage 0.8 -MinStarMapSourceDistributionCoverage 0.8 -RejectSampleStarMapSignals -ExportHotspotEvidence -GenerateHotspotReport -UiSmokePath outputs\v20_ui_final_smoke.json -AiLiveSmokePath outputs\v20_ai_live_report_smoke.json -RunPressureTest -RunTauriBuild -LaunchExe
```

`pnpm acceptance:terminal` is a package-script shortcut for the strict gate with `-RequireLiveAi -RequireTerminalReady`. Use `pnpm acceptance:final -- <args>` for the same final gate without the terminal hard stop, `pnpm acceptance:terminal-config -- --config configs\v20_terminal_acceptance.example.json` when you prefer a JSON config, `pnpm acceptance:v20` for the reusable local engineering acceptance, `pnpm report:evidence-check` for the hotspot evidence offline report check that is also embedded in `acceptance:v20`, `pnpm acceptance:status` for the current goal-readiness report, `pnpm acceptance:runbook` for the next-command runbook, and `pnpm acceptance:require-complete` when a CI-style check must fail unless every terminal-goal requirement is proven. The runbook refreshes the readiness audit before generating commands by default; pass `--no-refresh` only when you intentionally want to reuse existing evidence.

Before a real terminal run, use `pnpm acceptance:validate-config -- --config configs\v20_terminal_acceptance.example.json --strict-terminal` to catch weak thresholds and sample-only settings. After replacing the example paths with real files, add `--check-existing-inputs` to fail early when the 100000+ source library is missing, or when UI smoke / AI live smoke / supplied JSON evidence is missing, failed, dry-run-only, sample-tainted, or internally inconsistent.

`pnpm acceptance:config-check` runs a deterministic regression check for that semantic validation path. It verifies that valid terminal evidence passes, while dry-run AI smoke, failed UI smoke, sample-tainted star-map evidence, hotspot evidence with missing representative IDs, star-map/hotspot database mismatches, and hotspot IDs missing from the supplied star-map evidence are rejected. The same check is embedded in `pnpm acceptance:v20` and writes `outputs\v20_terminal_config_validator_check.json`.

`pnpm acceptance:config-from-discovery-check` verifies that `outputs\v20_real_data_discovery.json` can be converted into a strict terminal config only when the discovery report contains a real `100000+` structured source or a large BibTeX/RIS source. It writes `outputs\v20_terminal_config_from_discovery_check.json` and is embedded in `pnpm acceptance:v20`.

`pnpm acceptance:prepare-terminal-check` verifies the one-command terminal-preparation path. It writes `outputs\v20_terminal_prepare_check.json` and is embedded in `pnpm acceptance:v20`.

The strict final gate also performs semantic checks when evidence is supplied directly: `-StarMapPath` is rejected with `-RejectSampleStarMapSignals` if sample-like signals are present, `-HotspotEvidencePath` must satisfy the representative-paper minimum and contain no missing representative IDs, `-UiSmokePath` must have a clean console plus the required canvas/fullscreen/screenshot/overexposure checks, and `-AiLiveSmokePath` must be network-enabled with a passing live report audit.

`pnpm acceptance:final-gate-check` runs the final gate itself against lightweight fixtures. It now verifies that the final gate writes `outputs\v20_source_manifest_final.json`, mirrors the SHA-256 and terminal-candidate state into `outputs\v20_final_acceptance_gate_summary.json`, and rejects sample-tainted star-map evidence, hotspot evidence with missing representative IDs, star-map/hotspot database mismatches, weak UI smoke, and live AI smoke with a failed report audit. The check restores final-gate side-effect files after it runs and writes `outputs\v20_final_gate_direct_evidence_check.json`.

`scripts\v20_goal_readiness_audit.mjs` now requires this check to contain at least 6 cases and requires the source-manifest integration case to pass before the final-gate direct evidence item is counted as proven.

`pnpm acceptance:runbook` now lists one-command terminal preparation, discovery, terminal-config generation from discovery, `pnpm report:audit-check`, `pnpm acceptance:config-check`, `pnpm acceptance:config-from-discovery-check`, `pnpm acceptance:prepare-terminal-check`, `pnpm acceptance:runbook-quote-check`, and `pnpm acceptance:final-gate-check` as explicit preflight guards before the strict terminal command, so the real-data runbook covers both terminal evidence production, Windows path safety, and anti-fake-evidence regression checks.

`pnpm acceptance:storage-check` reads the terminal config, records the drives used by the source library, SQLite database directory, bibliography conversion directory, and generated report directory, and writes `outputs\v20_storage_preflight.json`. For real terminal acceptance, run it with `--min-free-gb 10 --require-min-free --require-non-c-storage` to avoid placing large SQLite/import artifacts on C drive or on a low-space drive.

`pnpm acceptance:capacity-plan-check` writes `outputs\v20_capacity_plan_check.json` and is embedded in `pnpm acceptance:v20`.

`pnpm acceptance:source-manifest-check` writes `outputs\v20_source_manifest_check.json` and is embedded in `pnpm acceptance:v20`.

This script combines the reusable V20 baseline acceptance, automatic BibTeX/RIS-to-JSONL conversion when `-LibraryPath` points to `.bib` or `.ris`, a strict real-library source-file preflight requiring at least `100000` valid records, optional headless SQLite import when `-ImportBeforeAudit` and `-DatabaseDir` are supplied, an optional post-import SQLite audit when `-DatabaseDir` or `-DatabasePath` is supplied, optional star-map semantic export when `-ExportStarMap` or `-StarMapPath` is supplied, star-map evidence/evolution/source coverage gates, optional sample-data rejection for star-map evidence IDs, optional hotspot evidence bundle export when `-ExportHotspotEvidence` or `-HotspotEvidencePath` is supplied, optional deterministic hotspot report generation when `-GenerateHotspotReport` is supplied, an optional exported-report evidence audit when `-ReportPath` or `-GenerateHotspotReport` is supplied, optional star-map UI smoke evidence when `-UiSmokePath` is supplied, optional AI live report-smoke evidence when `-AiLiveSmokePath` is supplied, and a strict AI configuration check requiring live `VITE_DEEPSEEK_*` readiness. It writes:

- `outputs/v20_final_acceptance_gate.log`
- `outputs/v20_bibliography_conversion_final.json`
- `outputs/v20_real_library_preflight_user.json`
- `outputs/v20_ai_config_preflight_final.json`
- `outputs/v20_ai_live_report_smoke.json`
- `outputs/v20_import_library_final.json`
- `outputs/v20_sqlite_library_audit_final.json`
- `outputs/v20_star_map_export_final.json`
- `outputs/v20_hotspot_evidence_final.json`
- `outputs/v20_hotspot_evidence_final.md`
- `outputs/v20_hotspot_report_final.md`
- `outputs/v20_hotspot_report_final.html`
- `outputs/v20_report_export_audit_final.json`
- `outputs/v20_ui_final_smoke.json`
- `outputs/v20_final_acceptance_gate_summary.json`
- `outputs/v20_terminal_runbook.json`
- `outputs/V20_TERMINAL_RUNBOOK.md`

Config-driven terminal acceptance:

- Real template: `configs\v20_terminal_acceptance.example.json`
- Sample toolchain check: `configs\v20_terminal_acceptance.sample.json`
- JSON schema: `configs\v20_terminal_acceptance.schema.json`
- Config validation:

```powershell
pnpm acceptance:validate-config -- --config configs\v20_terminal_acceptance.example.json --strict-terminal
```

- Dry-run command preview:

```powershell
pnpm acceptance:terminal-config -- --config configs\v20_terminal_acceptance.example.json --dry-run
```

`pnpm acceptance:terminal-config` validates the JSON before invoking the PowerShell final gate. When `requireTerminalReady=true`, validation rejects sample/demo paths, weak row thresholds, missing live-AI/UI evidence, missing star-map/evidence/report gates, `skipBaseline=true`, and missing release/pressure-test requirements before any long-running import or build starts.

The summary includes a `finalReadiness` object. This object is intentionally stricter than a sample gate pass: it requires a non-sample `100000+` source file, no `-SkipBaseline`, imported SQLite evidence, star-map coverage, `-RejectSampleStarMapSignals`, hotspot evidence, report evidence, UI smoke evidence, and network-enabled live AI evidence before `terminalGoalReady=true`. Add `-RequireTerminalReady` for the final delivery run so the script exits with failure if this object is not fully ready. In terminal mode, missing live AI is recorded in the summary before the hard stop, so failed final runs still leave a current readiness report.

Passing this gate with `-DatabaseDir` or `-DatabasePath`, `-ExportStarMap`, `-MinStarMapEvidenceCoverage 0.8`, `-MinStarMapEvolutionCoverage 0.8`, `-MinStarMapSourceDistributionCoverage 0.8`, `-RejectSampleStarMapSignals`, `-ExportHotspotEvidence`, `-GenerateHotspotReport` or `-ReportPath`, and `-UiSmokePath` proves that the release baseline, real source-file quality, imported SQLite library, hotspot semantic data, hotspot evidence coverage, hotspot representative-paper evidence, exported report evidence structure, star-map UI smoke evidence, and live AI configuration are ready for final delivery review.

## Latest Evidence

See:

- `outputs/V20_FINAL_ACCEPTANCE.md`
- `outputs/v20_import_format_check.json`
- `outputs/v20_bibliography_conversion_check.json`
- `outputs/v20_bibliography_check_bib_preflight.json`
- `outputs/v20_bibliography_check_ris_preflight.json`
- `outputs/v20_bibliography_discovery_check.json`
- `outputs/V20_BIBLIOGRAPHY_DISCOVERY_CHECK.md`
- `outputs/v20_real_library_preflight_sample_jsonl.json`
- `outputs/v20_real_library_preflight_sample_csv.json`
- `outputs/v20_real_data_discovery.json`
- `outputs/V20_REAL_DATA_DISCOVERY.md`
- `outputs/v20_import_library_sample.json`
- `outputs/v20_import_library_sample_audit.json`
- `outputs/v20_import_library_final.json`
- `outputs/v20_star_map_export_sample.json`
- `outputs/v20_star_map_export_final.json`
- `outputs/v20_hotspot_evidence_sample.json`
- `outputs/v20_hotspot_evidence_sample.md`
- `outputs/v20_hotspot_evidence_final.json`
- `outputs/v20_hotspot_evidence_final.md`
- `outputs/v20_hotspot_report_sample.md`
- `outputs/v20_hotspot_report_sample.html`
- `outputs/v20_hotspot_report_final.md`
- `outputs/v20_hotspot_report_final.html`
- `outputs/v20_hotspot_report_sample_audit_md.json`
- `outputs/v20_hotspot_report_sample_audit_html.json`
- `outputs/v20_report_layer_check.json`
- `outputs/v20_report_layer_check.html`
- `outputs/v20_report_export_audit_check.json`
- `outputs/v20_hotspot_evidence_report_check.json`
- `outputs/v20_hotspot_evidence_offline_report_check.md`
- `outputs/v20_storage_preflight.json`
- `outputs/v20_capacity_plan_check.json`
- `outputs/v20_source_manifest_check.json`
- `outputs/v20_source_manifest_final.json`
- `outputs/V20_SOURCE_MANIFEST_FINAL.md`
- `outputs/v20_terminal_config_validator_check.json`
- `outputs/v20_terminal_config_from_discovery_check.json`
- `outputs/v20_terminal_prepare_check.json`
- `outputs/v20_terminal_runbook_path_quote_check.json`
- `outputs/V20_TERMINAL_RUNBOOK_PATH_QUOTE_CHECK.md`
- `outputs/v20_final_gate_direct_evidence_check.json`
- `outputs/v20_goal_readiness_audit_check.json`
- `outputs/v20_evidence_chain_check.json`
- `outputs/v20_ai_config_preflight.json`
- `outputs/v20_ai_env_bridge.json`
- `outputs/v20_ai_live_report_smoke.json`
- `outputs/v20_sqlite_library_audit_sample.json`
- `outputs/v20_sqlite_library_audit_final.json`
- `outputs/v20_report_export_audit_sample.json`
- `outputs/v20_report_export_audit_final.json`
- `outputs/v20_ui_final_smoke.json`
- `outputs/v20_goal_readiness_audit.json`
- `outputs/V20_GOAL_READINESS_AUDIT.md`
- `outputs/v20-ui-galaxy-final-smoke.jpg`
- `outputs/v20-ui-galaxy-map-final-smoke.jpg`
- `outputs/v20-ui-galaxy-fullscreen-final-smoke.jpg`
- `outputs/v20_ui_pixel_audit.json`
- `outputs/v20_final_acceptance_gate_summary.json`
- `outputs/v20-about-release-checklist.png`
- `outputs/v20-galaxy-smoke.png`
- `outputs/v20-galaxy-map-smoke.png`
- `outputs/v20-galaxy-fullscreen-smoke.png`

## Remaining Final Acceptance

The project should not be considered fully complete until these real-world checks are performed:

1. Run `scripts\v20_final_acceptance_gate.ps1` against the user's real `100000+` paper source file with `-RequireLiveAi`.
2. Import the user's real `100000+` paper library in the desktop app.
3. Re-run `scripts\v20_final_acceptance_gate.ps1` with `-DatabaseDir` or `-DatabasePath` to audit the imported SQLite library.
4. Run or confirm cleaning and deduplication on that real library.
5. Run hotspot clustering on that real library.
6. Run `pnpm export:star-map -- --database-dir <real-library-dir> --min-evidence-coverage 0.8 --min-evolution-coverage 0.8 --min-source-distribution-coverage 0.8 --reject-sample-signals` or use `-ExportStarMap -MinStarMapEvidenceCoverage 0.8 -MinStarMapEvolutionCoverage 0.8 -MinStarMapSourceDistributionCoverage 0.8 -RejectSampleStarMapSignals` in the final gate.
7. Run `pnpm export:hotspot-evidence -- --database-dir <real-library-dir>` or use `-ExportHotspotEvidence` in the final gate to prove representative-paper traceability for a selected hotspot.
8. Inspect star-map filtering, focus, fullscreen, labels, semantic links, and evidence tracing on real hotspots.
9. Generate one formal research report from a selected real hotspot, or use `-GenerateHotspotReport` to create a deterministic evidence-bound report from the hotspot evidence bundle.
10. Export HTML / Markdown and re-run `scripts\v20_final_acceptance_gate.ps1` with `-ReportPath` or `-GenerateHotspotReport` to verify evidence traceability, representative papers, yearly trend, source distribution, keyword network, and future directions.
11. Run `pnpm ai:live-smoke -- --allow-network --require-live` and pass the resulting JSON through `-AiLiveSmokePath`.
12. Re-run or refresh star-map UI smoke evidence and pass it through `-UiSmokePath` before final delivery.

## Maintenance Rule

Future iterations should keep the current boundary discipline:

- Frontend handles interaction and visual presentation.
- Rust/Tauri handles local files, SQLite, large-library operations, health checks, and packaging.
- IndexedDB remains lightweight.
- AI output must stay evidence-bound.
- Star-map visuals should remain sharp, restrained, and data-driven.
