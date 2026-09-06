use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use research_hotspots_core::document_derived::{
    cancel_document_parse, document_parse_snapshot, document_reader_state, finalize_document_parse,
    prepare_document_reader_manifest, save_document_reader_state, search_document,
    start_document_parse, submit_document_parse_page, SideraDocumentEvidenceAnchor,
    SideraDocumentPageText, SideraDocumentParsePageInput, SideraDocumentParseRunQuery,
    SideraDocumentParseSnapshot, SideraDocumentParseStartInput, SideraDocumentReaderManifest,
    SideraDocumentReaderQuery, SideraDocumentReaderState, SideraDocumentReaderStateInput,
    SideraDocumentSearchInput, SideraDocumentTextSpanInput,
};
use research_hotspots_core::document_evidence::{
    create_document_annotation, delete_document_annotation, delete_document_saved_evidence,
    document_source_preference, list_document_annotations, list_document_saved_evidence,
    save_document_annotation, save_document_saved_evidence, save_document_source_preference,
    update_document_annotation, SideraDocumentAnnotation, SideraDocumentAnnotationSaveInput,
    SideraDocumentAnnotationUpdateInput, SideraDocumentEvidenceQuery, SideraDocumentSavedEvidence,
    SideraDocumentSavedEvidenceSaveInput, SideraDocumentSourcePreference,
    SideraDocumentSourcePreferenceSaveInput,
};
use research_hotspots_core::document_index::{
    cancel_document_index, complete_document_index_hybrid, complete_document_index_segmenting,
    current_document_index, document_index_segment_documents, document_index_snapshot,
    fail_document_index, fallback_document_index_to_lexical, pause_document_index,
    resume_document_index, search_document_index, start_document_index,
    submit_document_index_embeddings, SideraDocumentIndexJobQuery, SideraDocumentIndexMode,
    SideraDocumentIndexQuery, SideraDocumentIndexSearchInput, SideraDocumentIndexSearchResult,
    SideraDocumentIndexSnapshot, SideraDocumentIndexStartInput,
    SideraDocumentSegmentEmbeddingInput,
};
use research_hotspots_core::document_ocr::document_page_text_for_source;
use research_hotspots_core::document_store::{
    ingest_document, paper_document_snapshot, record_acquisition_failure,
    resolve_document_version_path, resolve_paper_source_route, resolve_source_record_match,
    SideraAcquisitionKind, SideraDocumentFailureInput, SideraDocumentIngestInput,
    SideraDocumentVersionKind, SideraDocumentVersionQuery, SideraPaperDocumentQuery,
    SideraPaperDocumentSnapshot, SideraPaperSourceRouteQuery, SideraSourceRecordMatchInput,
};
use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::semantic_embedding::{
    stable_semantic_embedding_error_code, SemanticEmbeddingControl, SemanticEmbeddingRuntime,
    DOCUMENT_INDEX_EMBEDDING_BATCH_SIZE,
};
use crate::sidera_document_protocol::SideraDocumentResourceRegistry;
use crate::sidera_institution_browser::{
    completed_institution_download, open_url_in_browser, SideraInstitutionBrowserContext,
    SideraInstitutionBrowserRuntimeState,
};

pub(crate) const LIBRARY_FILE_NAME: &str = "research-hotspots-v7.sqlite";

#[derive(Clone)]
struct RunningDocumentIndexJob {
    document_version_id: String,
    control: SemanticEmbeddingControl,
    active: bool,
}

#[derive(Default)]
struct DocumentIndexRuntimeInner {
    jobs: Mutex<HashMap<String, RunningDocumentIndexJob>>,
    changed: Condvar,
}

#[derive(Clone, Default)]
pub(crate) struct SideraDocumentIndexRuntimeState {
    inner: Arc<DocumentIndexRuntimeInner>,
}

impl SideraDocumentIndexRuntimeState {
    fn enqueue(
        &self,
        query: &SideraDocumentIndexJobQuery,
        control: SemanticEmbeddingControl,
    ) -> Result<bool, String> {
        let mut jobs = self
            .inner
            .jobs
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_RUNTIME_POISONED".to_string())?;
        if jobs.contains_key(&query.job_id) {
            return Ok(false);
        }
        for entry in jobs.values() {
            if entry.document_version_id == query.query.document_version_id {
                entry.control.cancel();
            }
        }
        jobs.insert(
            query.job_id.clone(),
            RunningDocumentIndexJob {
                document_version_id: query.query.document_version_id.clone(),
                control,
                active: false,
            },
        );
        self.inner.changed.notify_all();
        Ok(true)
    }

    fn activate(&self, job_id: &str) -> Result<bool, String> {
        let mut jobs = self
            .inner
            .jobs
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_RUNTIME_POISONED".to_string())?;
        loop {
            let Some(entry) = jobs.get(job_id) else {
                return Ok(false);
            };
            if entry.control.is_cancelled() {
                jobs.remove(job_id);
                self.inner.changed.notify_all();
                return Ok(false);
            }
            let document_version_id = entry.document_version_id.clone();
            let has_active_conflict = jobs.iter().any(|(other_job_id, other)| {
                other_job_id != job_id
                    && other.active
                    && other.document_version_id == document_version_id
            });
            if !has_active_conflict {
                if let Some(entry) = jobs.get_mut(job_id) {
                    entry.active = true;
                }
                return Ok(true);
            }
            let (next_jobs, _) = self
                .inner
                .changed
                .wait_timeout(jobs, Duration::from_millis(100))
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_RUNTIME_POISONED".to_string())?;
            jobs = next_jobs;
        }
    }

    fn cancel(&self, job_id: &str) -> Result<(), String> {
        if let Some(control) = self
            .inner
            .jobs
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_RUNTIME_POISONED".to_string())?
            .get(job_id)
            .map(|entry| entry.control.clone())
        {
            control.cancel();
            self.inner.changed.notify_all();
        }
        Ok(())
    }

    fn pause(&self, job_id: &str) -> Result<(), String> {
        if let Some(control) = self
            .inner
            .jobs
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_RUNTIME_POISONED".to_string())?
            .get(job_id)
            .map(|entry| entry.control.clone())
        {
            control.pause();
        }
        Ok(())
    }

    fn resume(&self, job_id: &str) -> Result<bool, String> {
        if let Some(control) = self
            .inner
            .jobs
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_INDEX_RUNTIME_POISONED".to_string())?
            .get(job_id)
            .map(|entry| entry.control.clone())
        {
            control.resume();
            return Ok(true);
        }
        Ok(false)
    }

    fn remove(&self, job_id: &str) {
        if let Ok(mut jobs) = self.inner.jobs.lock() {
            jobs.remove(job_id);
            self.inner.changed.notify_all();
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PaperDocumentInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LocalPaperDocumentInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    file_path: String,
    version_kind: Option<SideraDocumentVersionKind>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionPaperDocumentInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    download_id: String,
    version_kind: Option<SideraDocumentVersionKind>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OpenPaperDocumentInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct OpenInstitutionPaperSourceInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    source_record_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentReaderInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentParseStartInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    expected_sha256: String,
    parser_version: String,
    page_count: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentParseRunInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    run_id: String,
    document_sha256: String,
    parser_version: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentParsePageInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    run_id: String,
    document_sha256: String,
    parser_version: String,
    page_index: u32,
    page_label: String,
    width: f64,
    height: f64,
    text: String,
    spans: Vec<SideraDocumentTextSpanInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentSearchInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    query: String,
    mode: Option<SideraDocumentIndexMode>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentReaderStateSaveInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    page_index: u32,
    scroll_offset: f64,
    zoom: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentPageTextInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    page_index: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentAnnotationSaveCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    annotation_id: String,
    kind: String,
    color_token: String,
    note_text: Option<String>,
    anchor: SideraDocumentEvidenceAnchor,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentAnnotationUpdateCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    annotation_id: String,
    kind: String,
    color_token: String,
    note_text: Option<String>,
    anchor: Option<SideraDocumentEvidenceAnchor>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentAnnotationDeleteCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    annotation_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentSavedEvidenceSaveCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    evidence_id: String,
    label: Option<String>,
    note_text: Option<String>,
    anchor: SideraDocumentEvidenceAnchor,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentSavedEvidenceDeleteCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    evidence_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentSourcePreferenceCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    page_index: Option<u32>,
    preference: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentIndexStartCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    requested_mode: Option<SideraDocumentIndexMode>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentIndexJobCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    job_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentIndexSearchCommandInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    query: String,
    requested_mode: Option<SideraDocumentIndexMode>,
    limit: Option<u32>,
    offset: Option<u32>,
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

pub(crate) fn resolve_library_paths(
    app: &AppHandle,
    database_dir: Option<String>,
) -> Result<(PathBuf, PathBuf), String> {
    let directory = super::resolve_database_dir(app, database_dir)?;
    let database = directory.join(LIBRARY_FILE_NAME);
    if !database.is_file() {
        return Err("SIDERA_DOCUMENT_LIBRARY_NOT_FOUND".to_string());
    }
    Ok((directory, database))
}

fn file_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(ToString::to_string)
}

fn reader_query(
    app: &AppHandle,
    input: DocumentReaderInput,
) -> Result<SideraDocumentReaderQuery, String> {
    let (library_directory, _) = resolve_library_paths(app, input.database_dir)?;
    Ok(SideraDocumentReaderQuery {
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        document_version_id: input.version_id,
    })
}

fn evidence_query(
    app: &AppHandle,
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
) -> Result<SideraDocumentEvidenceQuery, String> {
    let (library_directory, _) = resolve_library_paths(app, database_dir)?;
    Ok(SideraDocumentEvidenceQuery {
        library_directory,
        project_id,
        paper_id,
        document_version_id: version_id,
    })
}

fn index_query(
    app: &AppHandle,
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
) -> Result<SideraDocumentIndexQuery, String> {
    let (library_directory, _) = resolve_library_paths(app, database_dir)?;
    Ok(SideraDocumentIndexQuery {
        library_directory,
        project_id,
        paper_id,
        document_version_id: version_id,
    })
}

fn index_job_query(
    app: &AppHandle,
    input: DocumentIndexJobCommandInput,
) -> Result<SideraDocumentIndexJobQuery, String> {
    Ok(SideraDocumentIndexJobQuery {
        query: index_query(
            app,
            input.database_dir,
            input.project_id,
            input.paper_id,
            input.version_id,
        )?,
        job_id: input.job_id,
    })
}

fn parse_run_query(
    app: &AppHandle,
    input: DocumentParseRunInput,
) -> Result<SideraDocumentParseRunQuery, String> {
    let (library_directory, _) = resolve_library_paths(app, input.database_dir)?;
    Ok(SideraDocumentParseRunQuery {
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        document_version_id: input.version_id,
        run_id: input.run_id,
        document_sha256: input.document_sha256,
        parser_version: input.parser_version,
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_parse_start(
    app: AppHandle,
    input: DocumentParseStartInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    let (library_directory, _) = resolve_library_paths(&app, input.database_dir)?;
    start_document_parse(SideraDocumentParseStartInput {
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        document_version_id: input.version_id,
        expected_sha256: input.expected_sha256,
        parser_version: input.parser_version,
        page_count: input.page_count,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_parse_snapshot(
    app: AppHandle,
    input: DocumentParseRunInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    document_parse_snapshot(parse_run_query(&app, input)?)
}

#[tauri::command]
pub(crate) async fn sidera_document_parse_cancel(
    app: AppHandle,
    input: DocumentParseRunInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    cancel_document_parse(parse_run_query(&app, input)?, now_ms())
}

#[tauri::command]
pub(crate) async fn sidera_document_parse_page_submit(
    app: AppHandle,
    input: DocumentParsePageInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    let (library_directory, _) = resolve_library_paths(&app, input.database_dir)?;
    submit_document_parse_page(SideraDocumentParsePageInput {
        run: SideraDocumentParseRunQuery {
            library_directory,
            project_id: input.project_id,
            paper_id: input.paper_id,
            document_version_id: input.version_id,
            run_id: input.run_id,
            document_sha256: input.document_sha256,
            parser_version: input.parser_version,
        },
        page_index: input.page_index,
        page_label: input.page_label,
        width: input.width,
        height: input.height,
        text: input.text,
        spans: input.spans,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_parse_finalize(
    app: AppHandle,
    input: DocumentParseRunInput,
) -> Result<SideraDocumentParseSnapshot, String> {
    finalize_document_parse(parse_run_query(&app, input)?, now_ms())
}

#[tauri::command]
pub(crate) async fn sidera_document_search(
    app: AppHandle,
    input: DocumentSearchInput,
) -> Result<serde_json::Value, String> {
    let DocumentSearchInput {
        database_dir,
        project_id,
        paper_id,
        version_id,
        query,
        mode,
        limit,
        offset,
    } = input;
    let result = if let Some(mode) = mode {
        serde_json::to_value(
            execute_document_index_search(
                &app,
                DocumentIndexSearchCommandInput {
                    database_dir,
                    project_id,
                    paper_id,
                    version_id,
                    query,
                    requested_mode: Some(mode),
                    limit,
                    offset,
                },
            )
            .await?,
        )
    } else {
        let (library_directory, _) = resolve_library_paths(&app, database_dir)?;
        serde_json::to_value(search_document(SideraDocumentSearchInput {
            reader: SideraDocumentReaderQuery {
                library_directory,
                project_id,
                paper_id,
                document_version_id: version_id,
            },
            query,
            limit: limit.unwrap_or(20),
            offset: offset.unwrap_or(0),
        })?)
    };
    result.map_err(|_| "SIDERA_DOCUMENT_SEARCH_RESULT_SERIALIZE_FAILED".to_string())
}

#[tauri::command]
pub(crate) async fn sidera_document_page_text_get(
    app: AppHandle,
    input: DocumentPageTextInput,
) -> Result<SideraDocumentPageText, String> {
    let query = index_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    let reader = reader_query_from_index(query);
    let preference = document_source_preference(
        SideraDocumentEvidenceQuery {
            library_directory: reader.library_directory.clone(),
            project_id: reader.project_id.clone(),
            paper_id: reader.paper_id.clone(),
            document_version_id: reader.document_version_id.clone(),
        },
        Some(input.page_index),
    )?
    .map(|preference| preference.preference)
    .unwrap_or_else(|| "auto".to_string());
    document_page_text_for_source(reader, input.page_index, &preference)
}

#[tauri::command]
pub(crate) async fn sidera_document_page_text(
    app: AppHandle,
    input: DocumentPageTextInput,
) -> Result<SideraDocumentPageText, String> {
    sidera_document_page_text_get(app, input).await
}

fn reader_query_from_index(query: SideraDocumentIndexQuery) -> SideraDocumentReaderQuery {
    SideraDocumentReaderQuery {
        library_directory: query.library_directory,
        project_id: query.project_id,
        paper_id: query.paper_id,
        document_version_id: query.document_version_id,
    }
}

#[tauri::command]
pub(crate) async fn sidera_document_annotation_list(
    app: AppHandle,
    input: DocumentReaderInput,
) -> Result<Vec<SideraDocumentAnnotation>, String> {
    list_document_annotations(evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?)
}

#[tauri::command]
pub(crate) async fn sidera_document_annotation_save(
    app: AppHandle,
    input: DocumentAnnotationSaveCommandInput,
) -> Result<SideraDocumentAnnotation, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    save_document_annotation(SideraDocumentAnnotationSaveInput {
        query,
        annotation_id: input.annotation_id,
        kind: input.kind,
        color_token: input.color_token,
        note_text: input.note_text,
        anchor: input.anchor,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_annotation_create(
    app: AppHandle,
    input: DocumentAnnotationSaveCommandInput,
) -> Result<SideraDocumentAnnotation, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    create_document_annotation(SideraDocumentAnnotationSaveInput {
        query,
        annotation_id: input.annotation_id,
        kind: input.kind,
        color_token: input.color_token,
        note_text: input.note_text,
        anchor: input.anchor,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_annotation_update(
    app: AppHandle,
    input: DocumentAnnotationUpdateCommandInput,
) -> Result<SideraDocumentAnnotation, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    let _legacy_anchor = input.anchor;
    update_document_annotation(SideraDocumentAnnotationUpdateInput {
        query,
        annotation_id: input.annotation_id,
        kind: input.kind,
        color_token: input.color_token,
        note_text: input.note_text,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_annotation_delete(
    app: AppHandle,
    input: DocumentAnnotationDeleteCommandInput,
) -> Result<bool, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    delete_document_annotation(query, &input.annotation_id)
}

#[tauri::command]
pub(crate) async fn sidera_document_saved_evidence_list(
    app: AppHandle,
    input: DocumentReaderInput,
) -> Result<Vec<SideraDocumentSavedEvidence>, String> {
    list_document_saved_evidence(evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?)
}

#[tauri::command]
pub(crate) async fn sidera_document_saved_evidence_save(
    app: AppHandle,
    input: DocumentSavedEvidenceSaveCommandInput,
) -> Result<SideraDocumentSavedEvidence, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    save_document_saved_evidence(SideraDocumentSavedEvidenceSaveInput {
        query,
        evidence_id: input.evidence_id,
        label: input.label,
        note_text: input.note_text,
        anchor: input.anchor,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_saved_evidence_delete(
    app: AppHandle,
    input: DocumentSavedEvidenceDeleteCommandInput,
) -> Result<bool, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    delete_document_saved_evidence(query, &input.evidence_id)
}

#[tauri::command]
pub(crate) async fn sidera_document_evidence_list(
    app: AppHandle,
    input: DocumentReaderInput,
) -> Result<Vec<SideraDocumentSavedEvidence>, String> {
    sidera_document_saved_evidence_list(app, input).await
}

#[tauri::command]
pub(crate) async fn sidera_document_evidence_save(
    app: AppHandle,
    input: DocumentSavedEvidenceSaveCommandInput,
) -> Result<SideraDocumentSavedEvidence, String> {
    sidera_document_saved_evidence_save(app, input).await
}

#[tauri::command]
pub(crate) async fn sidera_document_evidence_delete(
    app: AppHandle,
    input: DocumentSavedEvidenceDeleteCommandInput,
) -> Result<bool, String> {
    sidera_document_saved_evidence_delete(app, input).await
}

#[tauri::command]
pub(crate) async fn sidera_document_source_preference_get(
    app: AppHandle,
    input: DocumentSourcePreferenceCommandInput,
) -> Result<Option<SideraDocumentSourcePreference>, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    document_source_preference(query, input.page_index)
}

#[tauri::command]
pub(crate) async fn sidera_document_source_preference_save(
    app: AppHandle,
    input: DocumentSourcePreferenceCommandInput,
) -> Result<SideraDocumentSourcePreference, String> {
    let query = evidence_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    save_document_source_preference(SideraDocumentSourcePreferenceSaveInput {
        query,
        page_index: input.page_index,
        preference: input
            .preference
            .ok_or_else(|| "SIDERA_DOCUMENT_SOURCE_PREFERENCE_INVALID".to_string())?,
        now_ms: now_ms(),
    })
}

fn wait_for_document_index_control(
    control: &SemanticEmbeddingControl,
    query: &SideraDocumentIndexJobQuery,
) -> bool {
    while control.is_paused() {
        if control.is_cancelled() {
            return false;
        }
        match document_index_snapshot(query.clone()) {
            Ok(snapshot)
                if snapshot.state
                    == research_hotspots_core::document_index::SideraDocumentIndexState::Paused =>
            {
                thread::sleep(Duration::from_millis(100));
            }
            Ok(snapshot)
                if snapshot.state
                    == research_hotspots_core::document_index::SideraDocumentIndexState::Running =>
            {
                // The durable state may flip to running just before the resume command releases
                // this in-process control. Do not release it here: during pause, the inverse
                // transition briefly observes running as well.
                thread::sleep(Duration::from_millis(25));
            }
            _ => return false,
        }
    }
    !control.is_cancelled()
}

fn run_document_index_job(
    query: SideraDocumentIndexJobQuery,
    requested_mode: SideraDocumentIndexMode,
    control: SemanticEmbeddingControl,
) {
    if !wait_for_document_index_control(&control, &query) {
        let _ = cancel_document_index(query, now_ms());
        return;
    }
    let mut snapshot = match document_index_snapshot(query.clone()) {
        Ok(snapshot) => snapshot,
        Err(_) => return,
    };
    if snapshot.stage == "segmenting" {
        snapshot = match complete_document_index_segmenting(query.clone(), now_ms(), || {
            wait_for_document_index_control(&control, &query)
        }) {
            Ok(snapshot) => snapshot,
            Err(code)
                if matches!(
                    code.as_str(),
                    "SIDERA_DOCUMENT_INDEX_SEGMENTING_INTERRUPTED"
                        | "SIDERA_DOCUMENT_INDEX_NOT_SEGMENTING"
                ) =>
            {
                return;
            }
            Err(code) => {
                let _ = fail_document_index(query.clone(), code, now_ms());
                return;
            }
        };
    }
    if snapshot.state == research_hotspots_core::document_index::SideraDocumentIndexState::Ready {
        return;
    }
    if snapshot.state != research_hotspots_core::document_index::SideraDocumentIndexState::Running
        || snapshot.stage != "embedding"
    {
        return;
    }
    let documents = match document_index_segment_documents(query.clone()) {
        Ok(documents) => documents,
        Err(code) => {
            let _ = fail_document_index(query.clone(), code, now_ms());
            return;
        }
    };
    if !wait_for_document_index_control(&control, &query) {
        let _ = cancel_document_index(query, now_ms());
        return;
    }
    let mut runtime = match SemanticEmbeddingRuntime::load_document_index_cpu() {
        Ok(runtime) => runtime,
        Err(code) => {
            let code = stable_semantic_embedding_error_code(&code);
            if requested_mode == SideraDocumentIndexMode::Auto {
                let _ = fallback_document_index_to_lexical(query.clone(), code, now_ms());
            } else {
                let _ = fail_document_index(query.clone(), code, now_ms());
            }
            return;
        }
    };
    for chunk in documents.chunks(DOCUMENT_INDEX_EMBEDDING_BATCH_SIZE) {
        if !wait_for_document_index_control(&control, &query) {
            let _ = cancel_document_index(query.clone(), now_ms());
            return;
        }
        let passages = chunk
            .iter()
            .map(|value| value.text.clone())
            .collect::<Vec<_>>();
        let vectors = match runtime.embed_passages(&passages) {
            Ok(vectors) => vectors,
            Err(code) => {
                let code = stable_semantic_embedding_error_code(&code);
                if requested_mode == SideraDocumentIndexMode::Auto {
                    let _ = fallback_document_index_to_lexical(query.clone(), code, now_ms());
                } else {
                    let _ = fail_document_index(query.clone(), code, now_ms());
                }
                return;
            }
        };
        if !wait_for_document_index_control(&control, &query) {
            let _ = cancel_document_index(query.clone(), now_ms());
            return;
        }
        let records = chunk
            .iter()
            .zip(vectors)
            .map(|(document, vector)| SideraDocumentSegmentEmbeddingInput {
                segment_id: document.segment_id.clone(),
                content_sha256: document.content_sha256.clone(),
                vector,
            })
            .collect::<Vec<_>>();
        if let Err(code) = submit_document_index_embeddings(query.clone(), &records, now_ms()) {
            if code == "SIDERA_DOCUMENT_INDEX_NOT_EMBEDDING" && control.is_cancelled() {
                return;
            }
            let _ = fail_document_index(query.clone(), code, now_ms());
            return;
        }
    }
    if !wait_for_document_index_control(&control, &query) {
        let _ = cancel_document_index(query, now_ms());
    } else if let Err(code) = complete_document_index_hybrid(query.clone(), now_ms()) {
        let _ = fail_document_index(query, code, now_ms());
    }
}

fn launch_document_index_job(
    runtime_state: &SideraDocumentIndexRuntimeState,
    query: SideraDocumentIndexJobQuery,
    requested_mode: SideraDocumentIndexMode,
) -> Result<(), String> {
    let control = SemanticEmbeddingControl::default();
    if !runtime_state.enqueue(&query, control.clone())? {
        return Ok(());
    }
    let state = runtime_state.clone();
    let job_id = query.job_id.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if matches!(state.activate(&job_id), Ok(true)) {
            run_document_index_job(query, requested_mode, control);
        }
        state.remove(&job_id);
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn sidera_document_index_start(
    app: AppHandle,
    runtime_state: State<'_, SideraDocumentIndexRuntimeState>,
    input: DocumentIndexStartCommandInput,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let requested_mode = input
        .requested_mode
        .unwrap_or(SideraDocumentIndexMode::Auto);
    let query = index_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?;
    let start_input = SideraDocumentIndexStartInput {
        query: query.clone(),
        requested_mode,
        now_ms: now_ms(),
    };
    let snapshot = tauri::async_runtime::spawn_blocking(move || start_document_index(start_input))
        .await
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_START_TASK_FAILED".to_string())??;
    if snapshot.state == research_hotspots_core::document_index::SideraDocumentIndexState::Running
        && matches!(snapshot.stage.as_str(), "segmenting" | "embedding")
    {
        launch_document_index_job(
            runtime_state.inner(),
            SideraDocumentIndexJobQuery {
                query,
                job_id: snapshot.job_id.clone(),
            },
            requested_mode,
        )?;
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn sidera_document_index_snapshot(
    app: AppHandle,
    input: DocumentIndexJobCommandInput,
) -> Result<SideraDocumentIndexSnapshot, String> {
    document_index_snapshot(index_job_query(&app, input)?)
}

#[tauri::command]
pub(crate) async fn sidera_document_index_current(
    app: AppHandle,
    input: DocumentReaderInput,
) -> Result<Option<SideraDocumentIndexSnapshot>, String> {
    current_document_index(index_query(
        &app,
        input.database_dir,
        input.project_id,
        input.paper_id,
        input.version_id,
    )?)
}

#[tauri::command]
pub(crate) async fn sidera_document_index_pause(
    app: AppHandle,
    runtime_state: State<'_, SideraDocumentIndexRuntimeState>,
    input: DocumentIndexJobCommandInput,
) -> Result<SideraDocumentIndexSnapshot, String> {
    runtime_state.pause(&input.job_id)?;
    let snapshot = pause_document_index(index_job_query(&app, input)?, now_ms())?;
    if snapshot.state != research_hotspots_core::document_index::SideraDocumentIndexState::Paused {
        let _ = runtime_state.resume(&snapshot.job_id);
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn sidera_document_index_resume(
    app: AppHandle,
    runtime_state: State<'_, SideraDocumentIndexRuntimeState>,
    input: DocumentIndexJobCommandInput,
) -> Result<SideraDocumentIndexSnapshot, String> {
    let query = index_job_query(&app, input)?;
    let snapshot = resume_document_index(query.clone(), now_ms())?;
    if snapshot.state == research_hotspots_core::document_index::SideraDocumentIndexState::Running
        && matches!(snapshot.stage.as_str(), "segmenting" | "embedding")
        && !runtime_state.resume(&snapshot.job_id)?
    {
        launch_document_index_job(runtime_state.inner(), query, snapshot.requested_mode)?;
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn sidera_document_index_cancel(
    app: AppHandle,
    runtime_state: State<'_, SideraDocumentIndexRuntimeState>,
    input: DocumentIndexJobCommandInput,
) -> Result<SideraDocumentIndexSnapshot, String> {
    runtime_state.cancel(&input.job_id)?;
    cancel_document_index(index_job_query(&app, input)?, now_ms())
}

async fn execute_document_index_search(
    app: &AppHandle,
    input: DocumentIndexSearchCommandInput,
) -> Result<SideraDocumentIndexSearchResult, String> {
    let requested_mode = input
        .requested_mode
        .unwrap_or(SideraDocumentIndexMode::Auto);
    let base = SideraDocumentIndexSearchInput {
        query: index_query(
            app,
            input.database_dir,
            input.project_id,
            input.paper_id,
            input.version_id,
        )?,
        text: input.query,
        requested_mode,
        query_embedding: None,
        query_fallback_reason: None,
        limit: input.limit.unwrap_or(20),
        offset: input.offset.unwrap_or(0),
    };
    let initial = base.clone();
    match tauri::async_runtime::spawn_blocking(move || search_document_index(initial))
        .await
        .map_err(|_| "SIDERA_DOCUMENT_INDEX_QUERY_TASK_FAILED".to_string())?
    {
        Ok(result) => return Ok(result),
        Err(code) if code == "SIDERA_DOCUMENT_INDEX_QUERY_EMBEDDING_REQUIRED" => {}
        Err(code) => return Err(code),
    }

    let query_text = base.text.clone();
    let query_embedding = tauri::async_runtime::spawn_blocking(move || {
        let mut runtime = SemanticEmbeddingRuntime::load_document_index_cpu()?;
        runtime.embed_query(&query_text)
    })
    .await
    .map_err(|_| "SIDERA_DOCUMENT_INDEX_QUERY_TASK_FAILED".to_string())?;
    match query_embedding {
        Ok(vector) => {
            let mut hybrid = base;
            hybrid.query_embedding = Some(vector);
            tauri::async_runtime::spawn_blocking(move || search_document_index(hybrid))
                .await
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_QUERY_TASK_FAILED".to_string())?
        }
        Err(code) if requested_mode == SideraDocumentIndexMode::Auto => {
            let mut lexical = base;
            lexical.query_fallback_reason = Some(stable_semantic_embedding_error_code(&code));
            tauri::async_runtime::spawn_blocking(move || search_document_index(lexical))
                .await
                .map_err(|_| "SIDERA_DOCUMENT_INDEX_QUERY_TASK_FAILED".to_string())?
        }
        Err(code) => Err(stable_semantic_embedding_error_code(&code)),
    }
}

#[tauri::command]
pub(crate) async fn sidera_document_index_search(
    app: AppHandle,
    input: DocumentIndexSearchCommandInput,
) -> Result<SideraDocumentIndexSearchResult, String> {
    execute_document_index_search(&app, input).await
}

#[tauri::command]
pub(crate) async fn sidera_document_reader_manifest(
    app: AppHandle,
    resource_state: State<'_, SideraDocumentResourceRegistry>,
    input: DocumentReaderInput,
) -> Result<SideraDocumentReaderManifest, String> {
    let query = reader_query(&app, input)?;
    let (manifest, descriptor) =
        tauri::async_runtime::spawn_blocking(move || prepare_document_reader_manifest(query))
            .await
            .map_err(|_| "SIDERA_DOCUMENT_READER_MANIFEST_TASK_FAILED".to_string())??;
    resource_state.register(descriptor)?;
    Ok(manifest)
}

#[tauri::command]
pub(crate) async fn sidera_document_reader_state_get(
    app: AppHandle,
    input: DocumentReaderInput,
) -> Result<Option<SideraDocumentReaderState>, String> {
    document_reader_state(reader_query(&app, input)?)
}

#[tauri::command]
pub(crate) async fn sidera_document_reader_state_save(
    app: AppHandle,
    input: DocumentReaderStateSaveInput,
) -> Result<SideraDocumentReaderState, String> {
    let (library_directory, _) = resolve_library_paths(&app, input.database_dir)?;
    save_document_reader_state(SideraDocumentReaderStateInput {
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        document_version_id: input.version_id,
        page_index: input.page_index,
        scroll_offset: input.scroll_offset,
        zoom: input.zoom,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_import_local(
    app: AppHandle,
    input: LocalPaperDocumentInput,
) -> Result<SideraPaperDocumentSnapshot, String> {
    let (library_directory, library_database) = resolve_library_paths(&app, input.database_dir)?;
    let source_path = PathBuf::from(input.file_path);
    let original_file_name = file_name(&source_path);
    ingest_document(SideraDocumentIngestInput {
        library_database,
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        source_path,
        acquisition_kind: SideraAcquisitionKind::LocalImport,
        version_kind: input
            .version_kind
            .unwrap_or(SideraDocumentVersionKind::UserImport),
        source_record_id: None,
        origin_label: original_file_name.clone(),
        safe_locator: None,
        authorization_state: "user-selected-local-file".to_string(),
        original_file_name,
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_attach_institution_download(
    app: AppHandle,
    browser_state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionPaperDocumentInput,
) -> Result<SideraPaperDocumentSnapshot, String> {
    let (library_directory, library_database) = resolve_library_paths(&app, input.database_dir)?;
    let record =
        match completed_institution_download(&app, browser_state.inner(), &input.download_id) {
            Ok(record) => record,
            Err(code) => {
                let _ = record_acquisition_failure(SideraDocumentFailureInput {
                    library_database,
                    library_directory,
                    project_id: input.project_id,
                    paper_id: input.paper_id,
                    acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
                    source_record_id: None,
                    stage: "download-selection".to_string(),
                    origin_label: Some("selected-institution-download".to_string()),
                    safe_locator: None,
                    authorization_state: "institution-session-user-triggered".to_string(),
                    error_code: code.clone(),
                    retryable: true,
                    now_ms: now_ms(),
                });
                return Err(code);
            }
        };
    let source_path = PathBuf::from(&record.file_path);
    let source_match = resolve_source_record_match(SideraSourceRecordMatchInput {
        library_database: library_database.clone(),
        project_id: input.project_id.clone(),
        paper_id: input.paper_id.clone(),
        search_candidate_id: record.provenance.result_id.clone(),
        provider_record_id: None,
        canonical_locator: Some(record.provenance.safe_source_url.clone()),
        source_database: record.provenance.source.clone(),
    });
    let source_record_id = match source_match {
        Ok(Some(source_record_id)) => source_record_id,
        Ok(None) => {
            let code = "SIDERA_DOCUMENT_SOURCE_MATCH_UNRESOLVED".to_string();
            let _ = record_acquisition_failure(SideraDocumentFailureInput {
                library_database,
                library_directory,
                project_id: input.project_id,
                paper_id: input.paper_id,
                acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
                source_record_id: None,
                stage: "source-match".to_string(),
                origin_label: record
                    .provenance
                    .result_title
                    .clone()
                    .or(record.provenance.source_title.clone())
                    .or_else(|| Some(record.file_name.clone())),
                safe_locator: Some(record.provenance.safe_source_url.clone()),
                authorization_state: "institution-session-user-triggered".to_string(),
                error_code: code.clone(),
                retryable: true,
                now_ms: now_ms(),
            });
            return Err(code);
        }
        Err(code) => {
            let _ = record_acquisition_failure(SideraDocumentFailureInput {
                library_database,
                library_directory,
                project_id: input.project_id,
                paper_id: input.paper_id,
                acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
                source_record_id: None,
                stage: "source-match".to_string(),
                origin_label: record
                    .provenance
                    .result_title
                    .clone()
                    .or(record.provenance.source_title.clone())
                    .or_else(|| Some(record.file_name.clone())),
                safe_locator: Some(record.provenance.safe_source_url.clone()),
                authorization_state: "institution-session-user-triggered".to_string(),
                error_code: code.clone(),
                retryable: true,
                now_ms: now_ms(),
            });
            return Err(code);
        }
    };
    ingest_document(SideraDocumentIngestInput {
        library_database,
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        source_path,
        acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
        version_kind: input
            .version_kind
            .unwrap_or(SideraDocumentVersionKind::Unknown),
        source_record_id: Some(source_record_id),
        origin_label: record
            .provenance
            .result_title
            .clone()
            .or(record.provenance.source_title.clone())
            .or_else(|| Some(record.file_name.clone())),
        safe_locator: Some(record.provenance.safe_source_url),
        authorization_state: "institution-session-user-triggered".to_string(),
        original_file_name: Some(record.file_name),
        now_ms: now_ms(),
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_paper_snapshot(
    app: AppHandle,
    input: PaperDocumentInput,
) -> Result<SideraPaperDocumentSnapshot, String> {
    let (library_directory, library_database) = resolve_library_paths(&app, input.database_dir)?;
    paper_document_snapshot(SideraPaperDocumentQuery {
        library_database: Some(library_database),
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
    })
}

#[tauri::command]
pub(crate) async fn sidera_document_open_institution_source(
    app: AppHandle,
    browser_state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: OpenInstitutionPaperSourceInput,
) -> Result<(), String> {
    let (library_directory, library_database) =
        resolve_library_paths(&app, input.database_dir.clone())?;
    let route = match resolve_paper_source_route(SideraPaperSourceRouteQuery {
        library_database: library_database.clone(),
        project_id: input.project_id.clone(),
        paper_id: input.paper_id.clone(),
        source_record_id: input.source_record_id.clone(),
    }) {
        Ok(route) => route,
        Err(code) => {
            let _ = record_acquisition_failure(SideraDocumentFailureInput {
                library_database,
                library_directory,
                project_id: input.project_id,
                paper_id: input.paper_id,
                acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
                source_record_id: Some(input.source_record_id),
                stage: "source-route".to_string(),
                origin_label: Some("institution-source".to_string()),
                safe_locator: None,
                authorization_state: "institution-session-user-triggered".to_string(),
                error_code: code.clone(),
                retryable: true,
                now_ms: now_ms(),
            });
            return Err(code);
        }
    };
    let context = SideraInstitutionBrowserContext {
        institution_id: Some("whu".to_string()),
        source: Some(route.source_database.clone()),
        adapter_id: Some(route.producer_version.clone()),
        query: None,
        result_id: Some(route.id.clone()),
        result_title: Some(route.paper_title.clone()),
    };
    if let Err(code) =
        open_url_in_browser(&app, browser_state.inner(), &route.url, Some(context), true).await
    {
        let _ = record_acquisition_failure(SideraDocumentFailureInput {
            library_database,
            library_directory,
            project_id: input.project_id,
            paper_id: input.paper_id,
            acquisition_kind: SideraAcquisitionKind::InstitutionDownload,
            source_record_id: Some(input.source_record_id),
            stage: "source-navigation".to_string(),
            origin_label: Some(route.source_database),
            safe_locator: Some(route.display_locator),
            authorization_state: "institution-session-user-triggered".to_string(),
            error_code: code.clone(),
            retryable: true,
            now_ms: now_ms(),
        });
        return Err(code);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn sidera_document_open_version(
    app: AppHandle,
    input: OpenPaperDocumentInput,
) -> Result<(), String> {
    let (library_directory, _) = resolve_library_paths(&app, input.database_dir)?;
    let path = resolve_document_version_path(SideraDocumentVersionQuery {
        library_directory,
        project_id: input.project_id,
        paper_id: input.paper_id,
        version_id: input.version_id,
    })?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|_| "SIDERA_DOCUMENT_OPEN_FAILED".to_string())
}

#[cfg(test)]
mod document_index_runtime_tests {
    use super::*;
    use std::sync::mpsc;

    fn query(job_id: &str) -> SideraDocumentIndexJobQuery {
        SideraDocumentIndexJobQuery {
            query: SideraDocumentIndexQuery {
                library_directory: PathBuf::from("fixture"),
                project_id: "project".to_string(),
                paper_id: "paper".to_string(),
                document_version_id: "version".to_string(),
            },
            job_id: job_id.to_string(),
        }
    }

    #[test]
    fn replacement_job_cancels_then_waits_for_the_active_worker() {
        let state = SideraDocumentIndexRuntimeState::default();
        let first = SemanticEmbeddingControl::default();
        assert!(state.enqueue(&query("first"), first.clone()).unwrap());
        assert!(state.activate("first").unwrap());

        let second = SemanticEmbeddingControl::default();
        assert!(state.enqueue(&query("second"), second).unwrap());
        assert!(first.is_cancelled());
        let waiting_state = state.clone();
        let (sender, receiver) = mpsc::channel();
        let waiter = thread::spawn(move || {
            sender.send(waiting_state.activate("second")).unwrap();
        });
        assert!(receiver.recv_timeout(Duration::from_millis(50)).is_err());
        state.remove("first");
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(1)).unwrap(),
            Ok(true)
        );
        waiter.join().unwrap();
        state.remove("second");
    }

    #[test]
    fn duplicate_launch_of_the_same_job_is_ignored() {
        let state = SideraDocumentIndexRuntimeState::default();
        assert!(state
            .enqueue(&query("same"), SemanticEmbeddingControl::default())
            .unwrap());
        assert!(!state
            .enqueue(&query("same"), SemanticEmbeddingControl::default())
            .unwrap());
        state.remove("same");
    }

    #[test]
    fn document_search_input_keeps_legacy_json_and_accepts_optional_index_mode() {
        let legacy: DocumentSearchInput = serde_json::from_value(serde_json::json!({
            "projectId": "project",
            "paperId": "paper",
            "versionId": "version",
            "query": "evidence"
        }))
        .unwrap();
        assert_eq!(legacy.mode, None);
        let indexed: DocumentSearchInput = serde_json::from_value(serde_json::json!({
            "projectId": "project",
            "paperId": "paper",
            "versionId": "version",
            "query": "evidence",
            "mode": "hybrid"
        }))
        .unwrap();
        assert_eq!(indexed.mode, Some(SideraDocumentIndexMode::Hybrid));
    }
}
