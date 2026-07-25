mod agent_model_gateway;
mod agent_runtime;
pub mod semantic_embedding;

use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use research_hotspots_core::agent::{
    AgentAutomationMode, AgentBudget, AgentModelRole, AgentRunKind, AgentRunStatus,
};
use research_hotspots_core::agent_capabilities::{
    AgentCapabilityRepository, AgentModelUsageSummary, AgentOperationRecord, AgentResourceGrant,
    AgentResourceGrantKind,
};
use research_hotspots_core::agent_store::{
    migrate_library_file, AgentArtifactRecord, AgentRepository, AgentRunOverview, AgentRunRecord,
    AgentRunSnapshot, NewAgentRun,
};
use research_hotspots_core::semantic_layout::{
    multiply_matrix_vector_3d, orthogonal_procrustes_3d, project_semantic_embeddings,
    project_semantic_hotspot_centroids, scale_semantic_local_point_sets, semantic_centroid_record,
    semantic_hotspot_identity_key, semantic_hotspot_identity_sha256, stable_semantic_hotspot_id,
    SemanticPaperDocument, SemanticPoint3, SEMANTIC_LAYOUT_VERSION, SEMANTIC_LOCAL_P95_RADIUS,
    SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION, SEMANTIC_PROJECTION_VERSION,
};
use research_hotspots_core::{
    atomic_replace_file_with_rollback, create_empty_library_atomically, current_library_revision,
    install_seed_library_atomically, read_analysis_state, read_unified_galaxy_rows,
    read_unified_hotspot_rows, validate_active_snapshot, validate_library_candidate_connection,
    validate_library_candidate_file, write_snapshot_in_transaction, write_snapshot_transaction,
    AnalysisState, FirstRunMode, SeedExpectation, SnapshotHotspot, SnapshotHotspotLineage,
    SnapshotMembership, SnapshotWriteInput,
    UnifiedGalaxyRows, ValidatedLibraryCandidate, HOTSPOT_IDENTITY_VERSION,
    V20_ALGORITHM_VERSION,
};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{path::BaseDirectory, Emitter, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownExport {
    file_name: String,
    path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheckResult {
    python_path: String,
    task_worker_found: bool,
    worker_ok: bool,
    database_dir: Option<String>,
    database_path: Option<String>,
    database_dir_writable: bool,
    temp_dir_writable: bool,
    export_dir_writable: Option<bool>,
    backup_dir_writable: Option<bool>,
    errors: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperRecord {
    id: String,
    project_id: Option<String>,
    source: String,
    title: String,
    #[serde(rename = "abstract")]
    abstract_text: String,
    authors: Option<String>,
    categories: Option<String>,
    field: String,
    published_date: Option<String>,
    year: Option<i64>,
    url: Option<String>,
    doi: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperQueryInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    query: Option<String>,
    source: Option<String>,
    field: Option<String>,
    year: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
    sort: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperQueryResult {
    rows: Vec<PaperRecord>,
    total: i64,
    limit: i64,
    offset: i64,
    query_ms: u128,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentCreateRunInput {
    database_dir: Option<String>,
    id: String,
    project_id: Option<String>,
    automation_mode: AgentAutomationMode,
    objective: String,
    budget: Option<AgentBudget>,
    run_kind: Option<AgentRunKind>,
    task_input: Option<serde_json::Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentResourceGrantInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    run_id: Option<String>,
    grant_kind: AgentResourceGrantKind,
    locator: String,
    metadata: Option<serde_json::Value>,
    expires_at_ms: Option<i64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentResourceGrantQueryInput {
    database_dir: Option<String>,
    grant_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentWorkspaceOverview {
    #[serde(flatten)]
    overview: AgentRunOverview,
    current_operation: Option<AgentOperationRecord>,
    model_usage: AgentModelUsageSummary,
    library_revision: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentRunQueryInput {
    database_dir: Option<String>,
    run_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentArtifactQueryInput {
    database_dir: Option<String>,
    run_id: String,
    artifact_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentDraftModelProfiles {
    planner: research_hotspots_core::agent_store::AgentModelProfileReference,
    writer: Option<research_hotspots_core::agent_store::AgentModelProfileReference>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentRunListInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryStatus {
    database_dir: String,
    database_path: String,
    size_bytes: u64,
    paper_count: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DefaultLibraryManifest {
    manifest_schema_version: i64,
    generator_version: String,
    database_schema_version: i64,
    data_version: String,
    app_version: String,
    database_file: String,
    project_id: String,
    snapshot_id: String,
    sha256: String,
    size_bytes: u64,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    #[serde(default)]
    library_revision: i64,
    #[serde(default)]
    algorithm_version: Option<String>,
    #[serde(default)]
    paper_layout_version: Option<String>,
    #[serde(default)]
    projection_version: Option<String>,
    #[serde(default)]
    embedding_model_id: Option<String>,
    #[serde(default)]
    embedding_model_revision: Option<String>,
    #[serde(default)]
    embedding_dimensions: Option<usize>,
    #[serde(default)]
    embedding_encoding: Option<String>,
    #[serde(default)]
    embedding_count: Option<i64>,
    #[serde(default)]
    hotspot_identity_version: Option<String>,
    generated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibrarySetupState {
    configured: bool,
    database_dir: Option<String>,
    database_path: Option<String>,
    database_exists: bool,
    database_valid: bool,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    snapshot_id: Option<String>,
    database_schema_version: Option<i64>,
    requires_modeling: bool,
    seed_available: bool,
    seed_size_bytes: Option<u64>,
    seed_paper_count: Option<i64>,
    seed_hotspot_count: Option<i64>,
    seed_membership_count: Option<i64>,
    seed_library_revision: Option<i64>,
    seed_snapshot_id: Option<String>,
    seed_database_schema_version: Option<i64>,
    seed_version: Option<String>,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidateLibraryLocationInput {
    database_dir: String,
    mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryLocationValidation {
    valid: bool,
    database_dir: String,
    database_path: String,
    writable: bool,
    available_space_bytes: u64,
    required_space_bytes: u64,
    existing_database: bool,
    existing_database_valid: bool,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    snapshot_id: Option<String>,
    database_schema_version: Option<i64>,
    requires_modeling: bool,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeLibraryInput {
    database_dir: String,
    mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InitializeLibraryResult {
    mode: String,
    database_dir: String,
    database_path: String,
    size_bytes: u64,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    snapshot_id: Option<String>,
    database_schema_version: i64,
    requires_modeling: bool,
    sha256: String,
    integrity_check: String,
    summary: String,
}

#[derive(Clone)]
struct LibraryFileValidation {
    schema_version: i64,
    snapshot_id: Option<String>,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    integrity_check: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryBackupResult {
    database_path: String,
    backup_path: String,
    size_bytes: u64,
    paper_count: i64,
    summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryRestoreResult {
    database_path: String,
    restored_from: String,
    previous_backup_path: Option<String>,
    size_bytes: u64,
    paper_count: i64,
    restored_snapshot_id: Option<String>,
    validation_status: String,
    rollback_performed: bool,
    summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryBackupInspection {
    backup_path: String,
    schema_version: i64,
    paper_count: i64,
    project_count: i64,
    snapshot_id: Option<String>,
    hotspot_count: i64,
    membership_count: i64,
    validation_status: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CountFacet {
    value: String,
    count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryFacets {
    sources: Vec<CountFacet>,
    fields: Vec<CountFacet>,
    years: Vec<CountFacet>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryMutationResult {
    inserted: i64,
    updated: i64,
    total: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CnkiSearchSettings {
    chrome_driver_path: Option<String>,
    chrome_user_data_dir: Option<String>,
    chrome_profile: Option<String>,
    headless: Option<bool>,
    wait_timeout_sec: Option<i64>,
    page_load_timeout_sec: Option<i64>,
    implicit_wait_sec: Option<i64>,
    debug_dir: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CnkiSearchInput {
    query: String,
    max_results: i64,
    start_year: Option<i64>,
    end_year: Option<i64>,
    settings: CnkiSearchSettings,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CnkiSearchOutput {
    ok: bool,
    message: String,
    papers: Vec<PaperRecord>,
    debug_artifacts: Vec<String>,
    elapsed_ms: u128,
}

#[derive(Clone, Default)]
struct PaperImportTaskRegistry {
    controls: Arc<Mutex<HashMap<String, PaperImportTaskControl>>>,
}

const CLUSTER_ALREADY_RUNNING: &str = "CLUSTER_ALREADY_RUNNING";

#[derive(Clone, Default)]
struct ClusterTaskRegistry {
    running: Arc<Mutex<HashSet<String>>>,
}

struct ClusterTaskPermit {
    registry: ClusterTaskRegistry,
    key: String,
}

#[derive(Clone, Default)]
struct SemanticModelingRegistry {
    controls: Arc<Mutex<HashMap<String, SemanticModelingTask>>>,
}

#[derive(Clone)]
struct SemanticModelingTask {
    control: semantic_embedding::SemanticEmbeddingControl,
    progress: Arc<Mutex<SemanticModelingStatus>>,
}

struct SemanticModelingPermit {
    registry: SemanticModelingRegistry,
    key: String,
    task: SemanticModelingTask,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SemanticModelingStatus {
    running: bool,
    stage: String,
    processed: usize,
    total: usize,
    cached: usize,
    inferred: usize,
    provider: Option<String>,
    fallback_reason: Option<String>,
    paused: bool,
    cancellable: bool,
}

impl Default for SemanticModelingStatus {
    fn default() -> Self {
        Self {
            running: true,
            stage: "preparing".into(),
            processed: 0,
            total: 0,
            cached: 0,
            inferred: 0,
            provider: None,
            fallback_reason: None,
            paused: false,
            cancellable: true,
        }
    }
}

const LIBRARY_BUSY: &str = "LIBRARY_BUSY";

#[derive(Clone, Default)]
pub(crate) struct LibraryMutationRegistry {
    running: Arc<Mutex<HashMap<String, String>>>,
}

struct LibraryMutationPermit {
    registry: LibraryMutationRegistry,
    key: String,
}

impl LibraryMutationRegistry {
    fn try_acquire(
        &self,
        database_path: &Path,
        operation_kind: &str,
    ) -> Result<LibraryMutationPermit, String> {
        let key = normalized_database_key(database_path);
        let mut running = self
            .running
            .lock()
            .map_err(|_| "Cannot lock library mutation registry.".to_string())?;
        if running.contains_key(&key) {
            return Err(LIBRARY_BUSY.to_string());
        }
        running.insert(key.clone(), operation_kind.to_string());
        Ok(LibraryMutationPermit {
            registry: self.clone(),
            key,
        })
    }

    fn status(&self, database_path: &Path) -> Result<LibraryMutationStatus, String> {
        let key = normalized_database_key(database_path);
        let running = self
            .running
            .lock()
            .map_err(|_| "Cannot lock library mutation registry.".to_string())?;
        Ok(LibraryMutationStatus {
            database_key: key.clone(),
            operation_kind: running.get(&key).cloned(),
        })
    }
}

impl Drop for LibraryMutationPermit {
    fn drop(&mut self) {
        self.registry
            .running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.key);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryMutationStatus {
    database_key: String,
    operation_kind: Option<String>,
}

#[tauri::command]
fn get_library_mutation_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryMutationRegistry>,
    database_dir: Option<String>,
) -> Result<LibraryMutationStatus, String> {
    let database_dir = resolve_database_dir(&app, database_dir)?;
    state.status(&database_dir.join("research-hotspots-v7.sqlite"))
}

impl ClusterTaskRegistry {
    fn try_acquire(&self, key: String) -> Result<ClusterTaskPermit, String> {
        let mut running = self
            .running
            .lock()
            .map_err(|_| "Cannot lock cluster task registry.".to_string())?;
        if !running.insert(key.clone()) {
            return Err(CLUSTER_ALREADY_RUNNING.to_string());
        }
        Ok(ClusterTaskPermit {
            registry: self.clone(),
            key,
        })
    }

    #[cfg(test)]
    fn running_count(&self) -> usize {
        self.running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .len()
    }
}

impl Drop for ClusterTaskPermit {
    fn drop(&mut self) {
        self.registry
            .running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.key);
    }
}

const AI_ALREADY_RUNNING: &str = "AI_ALREADY_RUNNING";

#[derive(Clone, Default)]
struct AiTaskRegistry {
    running: Arc<Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>>,
}

struct AiTaskPermit {
    registry: AiTaskRegistry,
    key: String,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
}

impl AiTaskRegistry {
    fn try_acquire(&self, key: String) -> Result<AiTaskPermit, String> {
        let mut running = self
            .running
            .lock()
            .map_err(|_| "Cannot lock AI task registry.".to_string())?;
        if running.contains_key(&key) {
            return Err(AI_ALREADY_RUNNING.to_string());
        }
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        running.insert(key.clone(), cancel_tx);
        Ok(AiTaskPermit {
            registry: self.clone(),
            key,
            cancel_rx,
        })
    }

    fn cancel(&self, key: &str) -> Result<bool, String> {
        let running = self
            .running
            .lock()
            .map_err(|_| "Cannot lock AI task registry.".to_string())?;
        Ok(running
            .get(key)
            .map(|sender| sender.send(true).is_ok())
            .unwrap_or(false))
    }
}

impl Drop for AiTaskPermit {
    fn drop(&mut self) {
        self.registry
            .running
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.key);
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiChatInput {
    task_key: String,
    project_id: String,
    provider: String,
    base_url: String,
    model: String,
    temperature: f64,
    use_env_key: bool,
    mode: String,
    messages: Vec<AiChatMessage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiChatResult {
    content: String,
    retry_count: usize,
    elapsed_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialStatus {
    configured: bool,
}

#[derive(Clone)]
struct PaperImportTaskControl {
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
}

impl Default for PaperImportTaskControl {
    fn default() -> Self {
        Self {
            paused: Arc::new(AtomicBool::new(false)),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperFileImportInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    file_path: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MysqlPaperImportInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    worker_temp_dir: Option<String>,
    host: Option<String>,
    port: Option<i64>,
    user: Option<String>,
    password: Option<String>,
    database: Option<String>,
    batch_size: Option<usize>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct App17GalaxySyncInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    worker_temp_dir: Option<String>,
    host: Option<String>,
    port: Option<i64>,
    user: Option<String>,
    password: Option<String>,
    database: Option<String>,
    mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct App17MysqlGalaxyOutput {
    ok: bool,
    message: Option<String>,
    #[serde(default)]
    paper_topics: Vec<App17MysqlPaperTopic>,
    #[serde(default)]
    hotspots: Vec<App17MysqlHotspot>,
    #[serde(default)]
    hotspot_reviews: Vec<App17MysqlHotspotReview>,
    #[serde(default)]
    elapsed_ms: u128,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct App17MysqlPaperTopic {
    raw_paper_id: String,
    field: String,
    topic_id: i64,
    x: f64,
    y: f64,
    z: f64,
    year: Option<i64>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct App17MysqlHotspot {
    field: String,
    topic_id: i64,
    title_cn: Option<String>,
    topic_label: Option<String>,
    summary_cn: Option<String>,
    paper_count: Option<i64>,
    trend_status: Option<String>,
    evolution_json: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct App17MysqlHotspotReview {
    field: String,
    topic_id: i64,
    review_cn: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct App17GalaxySyncResult {
    database_dir: String,
    database_path: String,
    project_id: String,
    paper_topic_count: usize,
    hotspot_count: usize,
    hotspot_review_count: usize,
    elapsed_ms: u128,
    summary: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct App17GalaxyPayloadInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    mode: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct App17HotspotEvidenceInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    field: String,
    topic_id: i64,
    max_papers: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct App17GalaxyPayload {
    ready: bool,
    message: String,
    source: String,
    mode: String,
    generated_at: String,
    paper_count: usize,
    hotspot_count: usize,
    topic_count: usize,
    fields: Vec<String>,
    papers: Vec<App17GalaxyPaperPoint>,
    hotspots: Vec<App17GalaxyHotspotPoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct V20GalaxyPayload {
    ready: bool,
    message: String,
    source: String,
    mode: String,
    generated_at: String,
    snapshot_id: Option<String>,
    paper_layout_version: Option<String>,
    paper_layout_local_p95_radius: Option<f64>,
    paper_layout_shared_scale: Option<f64>,
    embedding_model_id: Option<String>,
    embedding_model_revision: Option<String>,
    projection_version: Option<String>,
    hotspot_identity_version: Option<String>,
    paper_count: usize,
    hotspot_count: usize,
    topic_count: usize,
    fields: Vec<String>,
    papers: Vec<App17GalaxyPaperPoint>,
    hotspots: Vec<App17GalaxyHotspotPoint>,
    hotspot_records: Vec<HotspotRecord>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct V20HotspotSnapshot {
    database_key: String,
    project_id: String,
    active_snapshot_id: String,
    snapshot_id: Option<String>,
    algorithm_version: String,
    layout_version: String,
    projection_version: String,
    embedding_model_id: String,
    embedding_model_revision: String,
    hotspot_identity_version: String,
    paper_count: i64,
    hotspot_count: i64,
    membership_count: i64,
    generated_at: String,
    library_revision: i64,
    current_library_revision: i64,
    hotspots: Vec<HotspotRecord>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct App17GalaxyPaperPoint {
    raw_paper_id: String,
    scoped_paper_id: String,
    field: String,
    topic_id: i64,
    x: f64,
    y: f64,
    z: f64,
    year: Option<i64>,
    color: String,
    size: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct App17GalaxyHotspotPoint {
    id: String,
    field: String,
    topic_id: i64,
    title: String,
    label: String,
    summary: String,
    trend: String,
    paper_count: i64,
    x: f64,
    y: f64,
    z: f64,
    color: String,
    size: f64,
    keywords: Vec<String>,
    review: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperFileImportStart {
    task_id: String,
    file_name: String,
}

#[derive(Default)]
struct PaperFileImportStats {
    processed_rows: i64,
    inserted: i64,
    updated: i64,
    invalid_rows: i64,
    duplicate_rows: i64,
}

const PAPER_IMPORT_BATCH_SIZE: usize = 1000;
const IMPORT_TASK_ERROR_EMITTED_PREFIX: &str = "__IMPORT_TASK_ERROR_ALREADY_EMITTED__:";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperImportRecoveryInfo {
    pub safe_to_rerun: bool,
    pub strategy: String,
    pub batch_size: usize,
    pub transaction_scope: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperFileImportSummary {
    pub database_dir: String,
    pub database_path: String,
    pub manifest_path: String,
    pub project_id: String,
    pub file_path: String,
    pub processed_rows: i64,
    pub inserted: i64,
    pub updated: i64,
    pub invalid_rows: i64,
    pub duplicate_rows: i64,
    pub elapsed_ms: u128,
    pub recovery: PaperImportRecoveryInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperFileImportManifest {
    task_id: String,
    file_name: String,
    project_id: String,
    source_file_path: String,
    database_path: String,
    manifest_path: String,
    status: String,
    message: String,
    processed_rows: i64,
    inserted: i64,
    updated: i64,
    invalid_rows: i64,
    duplicate_rows: i64,
    elapsed_ms: u128,
    updated_at_ms: String,
    recovery: PaperImportRecoveryInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StarMapExportResult {
    pub generated_at: String,
    pub database_path: String,
    pub project_id: String,
    pub paper_count: i64,
    pub hotspot_count: i64,
    pub semantic_link_count: usize,
    pub evidence_id_count: usize,
    pub hotspots_with_evidence: usize,
    pub hotspots_with_evolution: usize,
    pub hotspots_with_source_distribution: usize,
    pub coordinate_spread: StarMapCoordinateSpread,
    pub evidence_profile: StarMapEvidenceProfile,
    pub sample_hotspots: Vec<StarMapSampleHotspot>,
    pub cluster_summary: String,
    pub hotspots: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StarMapEvidenceProfile {
    pub evidence_coverage: f64,
    pub evolution_coverage: f64,
    pub source_distribution_coverage: f64,
    pub average_representative_ids: f64,
    pub sample_signal_count: usize,
    pub sample_signal_rate: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StarMapCoordinateSpread {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StarMapSampleHotspot {
    pub id: String,
    pub title: String,
    pub field: String,
    pub paper_count: i64,
    pub representative_ids: Vec<String>,
    pub year_count: usize,
    pub link_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotspotEvidenceExportResult {
    pub generated_at: String,
    pub database_path: String,
    pub project_id: String,
    pub selected_hotspot_id: String,
    pub selected_hotspot_title: String,
    pub selected_hotspot_field: String,
    pub hotspot_paper_count: i64,
    pub hotspot_keywords: Vec<String>,
    pub hotspot_trend: String,
    pub hotspot_confidence: f64,
    pub representative_ids: Vec<String>,
    pub missing_representative_ids: Vec<String>,
    pub representative_papers: Vec<EvidencePaperSnapshot>,
    pub year_evolution: Vec<EvidenceYearEvolution>,
    pub source_distribution: Vec<EvidenceCountFacet>,
    pub similar_hotspots: Vec<EvidenceSimilarHotspot>,
    pub evidence_profile_markdown: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePaperSnapshot {
    pub id: String,
    pub source: String,
    pub title: String,
    pub abstract_text: String,
    pub authors: Option<String>,
    pub categories: Option<String>,
    pub field: String,
    pub published_date: Option<String>,
    pub year: Option<i64>,
    pub url: Option<String>,
    pub doi: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceYearEvolution {
    pub year: i64,
    pub count: i64,
    pub keywords: Vec<String>,
    pub representative_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceCountFacet {
    pub value: String,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSimilarHotspot {
    pub hotspot_id: String,
    pub title: String,
    pub field: String,
    pub score: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct App17VisualReviewExportSummary {
    pub schema_version: u32,
    pub generated_at: String,
    pub database_path: String,
    pub output_dir: String,
    pub project_id: String,
    pub paper_count: usize,
    pub hotspot_count: usize,
    pub topic_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct App17VisualReviewManifest {
    schema_version: u32,
    generated_at: String,
    database_modified_ms: u128,
    database_size_bytes: u64,
    project_id: String,
    payload_path: String,
    paper_count: usize,
    hotspot_count: usize,
    topic_count: usize,
    topics: Vec<App17VisualReviewTopicEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct App17VisualReviewTopicEntry {
    key: String,
    file_id: String,
    field: String,
    topic_id: i64,
    hotspot_id: String,
    title: String,
    paper_count: i64,
    evidence_path: String,
    papers_path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PaperFileImportProgress {
    task_id: String,
    file_name: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_rows: Option<i64>,
    processed_rows: i64,
    inserted: i64,
    updated: i64,
    invalid_rows: i64,
    duplicate_rows: i64,
    message: String,
    elapsed_ms: u128,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperLibraryCleanResult {
    before_count: i64,
    after_count: i64,
    removed_count: i64,
    updated_count: i64,
    empty_removed_count: i64,
    duplicate_removed_count: i64,
    duplicate_ids: Vec<String>,
    cleaned_papers: Vec<PaperRecord>,
    summary: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KeywordWeight {
    keyword: String,
    weight: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SimilarHotspotRelation {
    hotspot_id: String,
    score: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HotspotCoordinates {
    x: f64,
    y: f64,
    z: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HotspotEvolution {
    year: i64,
    count: i64,
    keywords: Vec<String>,
    representative_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HotspotAnalysis {
    keyword_focus: f64,
    representative_coverage: f64,
    recent_momentum: f64,
    source_diversity: f64,
    evidence_paper_ids: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HotspotRecord {
    id: String,
    project_id: String,
    field: String,
    topic_id: i64,
    title: String,
    label: String,
    summary: String,
    keywords: Vec<String>,
    keyword_weights: Vec<KeywordWeight>,
    paper_count: i64,
    trend: String,
    confidence: f64,
    source: String,
    coordinates: HotspotCoordinates,
    evolution: Vec<HotspotEvolution>,
    source_distribution: Vec<CountFacet>,
    similar_hotspots: Vec<SimilarHotspotRelation>,
    analysis: HotspotAnalysis,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryClusterResult {
    before_count: i64,
    cluster_count: i64,
    snapshot_id: String,
    membership_count: i64,
    hotspots: Vec<HotspotRecord>,
    summary: String,
}

#[derive(Clone)]
struct PreparedLibraryCluster {
    snapshot: SnapshotWriteInput,
    result: LibraryClusterResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryPressureTestResult {
    rows: i64,
    database_dir: String,
    database_path: String,
    size_bytes: u64,
    insert_ms: u128,
    query_ms: u128,
    cluster_ms: u128,
    total_ms: u128,
    query_count: i64,
    cluster_count: i64,
    sample_hotspots: Vec<String>,
    cleanup_done: bool,
    summary: String,
}

#[derive(Default, Clone)]
struct ClusterGroup {
    field: String,
    keyword: String,
    paper_count: i64,
    representative_ids: Vec<String>,
    representative_candidates: Vec<RepresentativeCandidate>,
    years: HashMap<i64, i64>,
    year_representatives: HashMap<i64, Vec<RepresentativeCandidate>>,
    keyword_counts: HashMap<String, i64>,
    source_counts: HashMap<String, i64>,
}

#[derive(Clone)]
struct RepresentativeCandidate {
    id: String,
    year: Option<i64>,
    source: String,
    terms: Vec<String>,
    evidence_score: f64,
    semantic_document: SemanticPaperDocument,
}

impl SemanticModelingRegistry {
    fn try_start(&self, key: String) -> Result<SemanticModelingPermit, String> {
        let mut controls = self
            .controls
            .lock()
            .map_err(|_| "Cannot lock semantic modeling registry.".to_string())?;
        if controls.contains_key(&key) {
            return Err(CLUSTER_ALREADY_RUNNING.into());
        }
        let task = SemanticModelingTask {
            control: semantic_embedding::SemanticEmbeddingControl::default(),
            progress: Arc::new(Mutex::new(SemanticModelingStatus::default())),
        };
        controls.insert(key.clone(), task.clone());
        Ok(SemanticModelingPermit {
            registry: self.clone(),
            key,
            task,
        })
    }

    fn status(&self, key: &str) -> Result<Option<SemanticModelingStatus>, String> {
        let controls = self
            .controls
            .lock()
            .map_err(|_| "Cannot lock semantic modeling registry.".to_string())?;
        controls
            .get(key)
            .map(|task| {
                task.progress
                    .lock()
                    .map(|value| value.clone())
                    .map_err(|_| "Cannot lock semantic modeling status.".to_string())
            })
            .transpose()
    }

    fn control(&self, key: &str, action: &str) -> Result<SemanticModelingStatus, String> {
        let task = self
            .controls
            .lock()
            .map_err(|_| "Cannot lock semantic modeling registry.".to_string())?
            .get(key)
            .cloned()
            .ok_or_else(|| "SEMANTIC_MODELING_NOT_RUNNING".to_string())?;
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        if !progress.cancellable {
            return Err("SEMANTIC_MODELING_COMMITTING".into());
        }
        match action {
            "pause" => {
                task.control.pause();
                progress.paused = true;
                progress.stage = "paused".into();
            }
            "resume" => {
                task.control.resume();
                progress.paused = false;
                progress.stage = "embedding".into();
            }
            "cancel" => {
                task.control.cancel();
                progress.paused = false;
                progress.stage = "cancelling".into();
            }
            _ => return Err("SEMANTIC_MODELING_CONTROL_INVALID".into()),
        }
        Ok(progress.clone())
    }
}

impl Drop for SemanticModelingPermit {
    fn drop(&mut self) {
        self.registry
            .controls
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.key);
    }
}

#[tauri::command]
fn get_library_setup_state(
    app: tauri::AppHandle,
    database_dir: Option<String>,
) -> Result<LibrarySetupState, String> {
    let seed_manifest = load_default_library_manifest(&app).ok();
    let configured_dir = database_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            if cfg!(debug_assertions) {
                find_project_root().map(|root| root.join("data").join("library"))
            } else {
                None
            }
        });

    let Some(database_dir) = configured_dir else {
        return Ok(LibrarySetupState {
            configured: false,
            database_dir: None,
            database_path: None,
            database_exists: false,
            database_valid: false,
            paper_count: 0,
            hotspot_count: 0,
            membership_count: 0,
            snapshot_id: None,
            database_schema_version: None,
            requires_modeling: true,
            seed_available: seed_manifest.is_some(),
            seed_size_bytes: seed_manifest.as_ref().map(|manifest| manifest.size_bytes),
            seed_paper_count: seed_manifest.as_ref().map(|manifest| manifest.paper_count),
            seed_hotspot_count: seed_manifest
                .as_ref()
                .map(|manifest| manifest.hotspot_count),
            seed_membership_count: seed_manifest
                .as_ref()
                .map(|manifest| manifest.membership_count),
            seed_library_revision: seed_manifest
                .as_ref()
                .map(|manifest| manifest.library_revision),
            seed_snapshot_id: seed_manifest
                .as_ref()
                .map(|manifest| manifest.snapshot_id.clone()),
            seed_database_schema_version: seed_manifest
                .as_ref()
                .map(|manifest| manifest.database_schema_version),
            seed_version: seed_manifest
                .as_ref()
                .map(|manifest| manifest.data_version.clone()),
            message: "论文库尚未配置。请选择一个可写的数据目录。".to_string(),
        });
    };

    recover_interrupted_restore(&database_dir)?;

    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    let database_exists = database_path.is_file();
    let validation = if database_exists {
        validate_database_file(&database_path)
    } else {
        Err("所选目录中不存在 research-hotspots-v7.sqlite。".to_string())
    };
    let (
        database_valid,
        paper_count,
        hotspot_count,
        membership_count,
        snapshot_id,
        database_schema_version,
        requires_modeling,
        message,
    ) = match validation {
        Ok(value) => {
            let requires_modeling = value.snapshot_id.is_none();
            let message = if requires_modeling {
                "论文库配置有效，但尚无 V20 活动快照；请在分析流水线中显式运行热点建模。"
                    .to_string()
            } else {
                "论文库配置有效，V20 活动快照一致。".to_string()
            };
            (
                true,
                value.paper_count,
                value.hotspot_count,
                value.membership_count,
                value.snapshot_id,
                Some(value.schema_version),
                requires_modeling,
                message,
            )
        }
        Err(error) => (false, 0, 0, 0, None, None, true, error),
    };

    Ok(LibrarySetupState {
        configured: database_valid,
        database_dir: Some(database_dir.to_string_lossy().to_string()),
        database_path: Some(database_path.to_string_lossy().to_string()),
        database_exists,
        database_valid,
        paper_count,
        hotspot_count,
        membership_count,
        snapshot_id,
        database_schema_version,
        requires_modeling,
        seed_available: seed_manifest.is_some(),
        seed_size_bytes: seed_manifest.as_ref().map(|manifest| manifest.size_bytes),
        seed_paper_count: seed_manifest.as_ref().map(|manifest| manifest.paper_count),
        seed_hotspot_count: seed_manifest
            .as_ref()
            .map(|manifest| manifest.hotspot_count),
        seed_membership_count: seed_manifest
            .as_ref()
            .map(|manifest| manifest.membership_count),
        seed_library_revision: seed_manifest
            .as_ref()
            .map(|manifest| manifest.library_revision),
        seed_snapshot_id: seed_manifest
            .as_ref()
            .map(|manifest| manifest.snapshot_id.clone()),
        seed_database_schema_version: seed_manifest
            .as_ref()
            .map(|manifest| manifest.database_schema_version),
        seed_version: seed_manifest
            .as_ref()
            .map(|manifest| manifest.data_version.clone()),
        message,
    })
}

#[tauri::command]
fn validate_library_location(
    app: tauri::AppHandle,
    input: ValidateLibraryLocationInput,
) -> Result<LibraryLocationValidation, String> {
    validate_library_location_impl(&app, &input.database_dir, &input.mode)
}

#[tauri::command]
fn initialize_library(
    app: tauri::AppHandle,
    input: InitializeLibraryInput,
) -> Result<InitializeLibraryResult, String> {
    let mode = input.mode.trim().to_ascii_lowercase();
    if !matches!(mode.as_str(), "seed" | "empty" | "existing") {
        return Err("未知的论文库初始化方式。".to_string());
    }
    let validation = validate_library_location_impl(&app, &input.database_dir, &mode)?;
    if !validation.valid {
        return Err(validation.message);
    }

    let database_dir = PathBuf::from(input.database_dir.trim());
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    fs::create_dir_all(&database_dir)
        .map_err(|error| format!("无法创建论文库目录 {:?}: {error}", database_dir))?;

    match mode.as_str() {
        "seed" => install_seed_library(&app, &database_path)?,
        "empty" => create_empty_library(&database_path)?,
        "existing" => {}
        _ => unreachable!(),
    }

    let verified = validate_database_file(&database_path)?;
    let size_bytes = fs::metadata(&database_path)
        .map(|metadata| metadata.len())
        .unwrap_or_default();
    let sha256 = sha256_file(&database_path)?;
    Ok(InitializeLibraryResult {
        mode: mode.clone(),
        database_dir: database_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        size_bytes,
        paper_count: verified.paper_count,
        hotspot_count: verified.hotspot_count,
        membership_count: verified.membership_count,
        snapshot_id: verified.snapshot_id.clone(),
        database_schema_version: verified.schema_version,
        requires_modeling: verified.snapshot_id.is_none(),
        sha256,
        integrity_check: verified.integrity_check,
        summary: match mode.as_str() {
            "seed" => format!(
                "默认论文库安装完成：{} 篇论文，{} 个热点，{} 条归属。",
                verified.paper_count, verified.hotspot_count, verified.membership_count
            ),
            "empty" => "空白论文库已创建。".to_string(),
            _ if verified.snapshot_id.is_some() => format!(
                "现有论文库验证完成：{} 篇论文，{} 个热点，{} 条归属。",
                verified.paper_count, verified.hotspot_count, verified.membership_count
            ),
            _ => format!(
                "现有论文库验证完成：{} 篇论文；尚无 V20 快照，请显式运行热点建模。",
                verified.paper_count
            ),
        },
    })
}

#[tauri::command]
fn paper_library_status(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    project_id: Option<String>,
) -> Result<PaperLibraryStatus, String> {
    let (conn, database_dir, database_path) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let paper_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let size_bytes = fs::metadata(&database_path)
        .map(|metadata| metadata.len())
        .unwrap_or_default();
    Ok(PaperLibraryStatus {
        database_dir: database_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        size_bytes,
        paper_count,
    })
}

#[tauri::command]
fn backup_paper_library(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    backup_dir: Option<String>,
    project_id: Option<String>,
) -> Result<PaperLibraryBackupResult, String> {
    let (_, database_dir, _) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let backup_dir = backup_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    backup_library_database_path(&database_dir, backup_dir, &project_id)
}

fn backup_library_database_path(
    database_dir: &Path,
    backup_dir: Option<PathBuf>,
    project_id: &str,
) -> Result<PaperLibraryBackupResult, String> {
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    if database_path.exists() {
        migrate_library_file(
            &database_path,
            project_id,
            now_millis().min(i64::MAX as u128) as i64,
            true,
        )?;
    }
    let conn = Connection::open(&database_path)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    initialize_library_database(&conn)?;
    let paper_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    drop(conn);

    let backup_dir = backup_dir.unwrap_or_else(|| database_dir.join("backups"));
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Cannot create SQLite backup dir {:?}: {error}", backup_dir))?;
    let backup_path = backup_dir.join(format!(
        "research-hotspots-v7-backup-{}.sqlite",
        now_millis()
    ));
    fs::copy(&database_path, &backup_path)
        .map_err(|error| format!("Cannot copy SQLite database to {:?}: {error}", backup_path))?;
    let size_bytes = fs::metadata(&backup_path)
        .map(|metadata| metadata.len())
        .unwrap_or_default();

    Ok(PaperLibraryBackupResult {
        database_path: database_path.to_string_lossy().to_string(),
        backup_path: backup_path.to_string_lossy().to_string(),
        size_bytes,
        paper_count,
        summary: format!(
            "SQLite 论文库已备份：{paper_count} 篇，{} bytes。",
            size_bytes
        ),
    })
}

#[tauri::command]
fn inspect_paper_library_backup(
    backup_path: String,
    project_id: Option<String>,
) -> Result<PaperLibraryBackupInspection, String> {
    let source_path = PathBuf::from(&backup_path);
    if !source_path.exists() || !source_path.is_file() {
        return Err(format!(
            "SQLite backup file does not exist: {:?}",
            source_path
        ));
    }
    inspect_library_backup_path(&source_path, &project_id.unwrap_or_else(default_project_id))
}

#[tauri::command]
async fn restore_paper_library(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryMutationRegistry>,
    database_dir: Option<String>,
    backup_path: String,
    project_id: Option<String>,
) -> Result<PaperLibraryRestoreResult, String> {
    let source_path = PathBuf::from(&backup_path);
    if !source_path.exists() || !source_path.is_file() {
        return Err(format!(
            "SQLite backup file does not exist: {:?}",
            source_path
        ));
    }
    let database_dir = resolve_database_dir(&app, database_dir)?;
    let permit = state.try_acquire(
        &database_dir.join("research-hotspots-v7.sqlite"),
        "restore",
    )?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        restore_library_database_path(&database_dir, &source_path, &project_id)
    })
    .await
    .map_err(|error| format!("SQLite restore task failed: {error}"))?
}

fn restore_library_database_path(
    database_dir: &Path,
    source_path: &Path,
    project_id: &str,
) -> Result<PaperLibraryRestoreResult, String> {
    if !source_path.exists() || !source_path.is_file() {
        return Err(format!(
            "SQLite backup file does not exist: {:?}",
            source_path
        ));
    }
    fs::create_dir_all(&database_dir)
        .map_err(|error| format!("Cannot create library dir {:?}: {error}", database_dir))?;
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    if fs::canonicalize(source_path).ok() == fs::canonicalize(&database_path).ok()
        && database_path.exists()
    {
        return Err("Cannot restore from the active SQLite database file.".to_string());
    }
    let restore_id = now_millis();
    let staging_path =
        database_dir.join(format!(".research-hotspots-v7-restore-{restore_id}.sqlite"));
    let marker_path = database_dir.join("research-hotspots-v7.restore.json");
    let safety_path = database_dir.join(format!(
        "research-hotspots-v7-before-restore-{restore_id}.sqlite"
    ));
    fs::copy(source_path, &staging_path)
        .map_err(|error| format!("Cannot stage SQLite backup {:?}: {error}", source_path))?;
    match validate_library_candidate(&staging_path, project_id) {
        Ok(value) => value,
        Err(error) => {
            remove_sqlite_sidecars(&staging_path);
            let _ = fs::remove_file(&staging_path);
            return Err(format!("SQLite backup validation failed: {error}"));
        }
    };
    fs::write(
        &marker_path,
        serde_json::to_vec_pretty(&serde_json::json!({
            "restoreId": restore_id,
            "source": source_path,
            "staging": staging_path,
            "active": database_path,
            "safety": safety_path,
            "phase": "validated"
        }))
        .map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Cannot write restore marker: {error}"))?;

    if database_path.exists() {
        let conn = Connection::open(&database_path)
            .map_err(|error| format!("Cannot checkpoint active SQLite library: {error}"))?;
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        drop(conn);
        remove_sqlite_sidecars(&database_path);
    }
    let (had_active, validated) = match atomic_replace_file_with_rollback(
        &database_path,
        &staging_path,
        &safety_path,
        |path| validate_library_candidate(path, project_id),
    ) {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_file(&marker_path);
            return Err(error);
        }
    };
    let _ = fs::remove_file(&marker_path);
    let size_bytes = fs::metadata(&database_path)
        .map(|metadata| metadata.len())
        .unwrap_or_default();

    Ok(PaperLibraryRestoreResult {
        database_path: database_path.to_string_lossy().to_string(),
        restored_from: source_path.to_string_lossy().to_string(),
        previous_backup_path: had_active.then(|| safety_path.to_string_lossy().to_string()),
        size_bytes,
        paper_count: validated.paper_count,
        restored_snapshot_id: validated.snapshot_id.clone(),
        validation_status: "passed".to_string(),
        rollback_performed: false,
        summary: format!(
            "SQLite 论文库已原子恢复：{} 篇，快照 {}，{} bytes。",
            validated.paper_count,
            validated.snapshot_id.as_deref().unwrap_or("未生成"),
            size_bytes
        ),
    })
}

fn inspect_library_backup_path(
    path: &Path,
    project_id: &str,
) -> Result<PaperLibraryBackupInspection, String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Cannot open SQLite backup {:?}: {error}", path))?;
    let quick_check: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if quick_check.to_lowercase() != "ok" {
        return Err(format!("SQLite quick_check failed: {quick_check}"));
    }
    if !sqlite_table_exists(&conn, "papers")? {
        return Err("SQLite backup has no papers table.".to_string());
    }
    let schema_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or_default();
    let paper_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let project_count = conn
        .query_row("SELECT COUNT(DISTINCT project_id) FROM papers", [], |row| {
            row.get(0)
        })
        .unwrap_or_default();
    let snapshot_id = if sqlite_table_exists(&conn, "v20_analysis_state")? {
        conn.query_row(
            "SELECT active_snapshot_id FROM v20_analysis_state WHERE project_id = ?1",
            params![project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
    } else {
        None
    };
    let (hotspot_count, membership_count) = if let Some(snapshot_id) = snapshot_id.as_ref() {
        let hotspots = conn
            .query_row(
                "SELECT COUNT(*) FROM v20_hotspots WHERE project_id = ?1 AND snapshot_id = ?2",
                params![project_id, snapshot_id],
                |row| row.get(0),
            )
            .unwrap_or_default();
        let memberships = conn.query_row("SELECT COUNT(*) FROM v20_paper_memberships WHERE project_id = ?1 AND snapshot_id = ?2", params![project_id, snapshot_id], |row| row.get(0)).unwrap_or_default();
        (hotspots, memberships)
    } else {
        (0, 0)
    };
    Ok(PaperLibraryBackupInspection {
        backup_path: path.to_string_lossy().to_string(),
        schema_version,
        paper_count,
        project_count,
        snapshot_id,
        hotspot_count,
        membership_count,
        validation_status: "passed".to_string(),
    })
}

fn validate_library_candidate(
    path: &Path,
    project_id: &str,
) -> Result<ValidatedLibraryCandidate, String> {
    let conn = Connection::open(path)
        .map_err(|error| format!("Cannot open staged SQLite library {:?}: {error}", path))?;
    initialize_library_database(&conn)?;
    let validated = validate_library_candidate_connection(&conn, project_id)?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| error.to_string())?;
    Ok(validated)
}

fn sqlite_table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|error| error.to_string())
}

fn remove_sqlite_sidecars(database_path: &Path) {
    let path = database_path.to_string_lossy();
    let _ = fs::remove_file(format!("{path}-wal"));
    let _ = fs::remove_file(format!("{path}-shm"));
}

fn recover_interrupted_restore(database_dir: &Path) -> Result<(), String> {
    let marker_path = database_dir.join("research-hotspots-v7.restore.json");
    if !marker_path.exists() {
        return Ok(());
    }
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(&marker_path).map_err(|error| format!("Cannot read restore marker: {error}"))?,
    )
    .map_err(|error| format!("Cannot parse restore marker: {error}"))?;
    let path_value = |key: &str| {
        value
            .get(key)
            .and_then(|item| item.as_str())
            .map(PathBuf::from)
    };
    let active =
        path_value("active").unwrap_or_else(|| database_dir.join("research-hotspots-v7.sqlite"));
    let safety = path_value("safety");
    let staging = path_value("staging");
    if let Some(safety) = safety.filter(|path| path.exists()) {
        if active.exists() {
            remove_sqlite_sidecars(&active);
            let failed = database_dir.join(format!(
                "research-hotspots-v7-interrupted-restore-{}.sqlite",
                now_millis()
            ));
            fs::rename(&active, &failed).map_err(|error| {
                format!("Cannot quarantine interrupted restored database: {error}")
            })?;
        }
        fs::rename(&safety, &active)
            .map_err(|error| format!("Cannot recover pre-restore SQLite library: {error}"))?;
    }
    if let Some(staging) = staging {
        remove_sqlite_sidecars(&staging);
        let _ = fs::remove_file(staging);
    }
    let _ = fs::remove_file(marker_path);
    Ok(())
}

#[tauri::command]
fn query_paper_library(
    app: tauri::AppHandle,
    input: PaperQueryInput,
) -> Result<PaperQueryResult, String> {
    let started = Instant::now();
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let query = normalize_query(input.query);
    let source = normalize_filter(input.source);
    let field = normalize_filter(input.field);
    let limit = input.limit.unwrap_or(20).clamp(1, 200);
    let offset = input.offset.unwrap_or(0).max(0);
    let sort_sql = match input.sort.as_deref().unwrap_or("newest") {
        "oldest" => "COALESCE(year, 0) ASC, updated_at ASC",
        "title" => "title COLLATE NOCASE ASC",
        _ => "COALESCE(year, 0) DESC, updated_at DESC",
    };
    let sql = format!(
        "SELECT id, project_id, source, title, abstract, authors, categories, field, published_date, year, url, doi, created_at, updated_at
         FROM papers
         WHERE project_id = ?1
           AND (?2 IS NULL OR search_blob LIKE ?2)
           AND (?3 IS NULL OR source = ?3)
           AND (?4 IS NULL OR field = ?4)
           AND (?5 IS NULL OR year = ?5)
         ORDER BY {sort_sql}
         LIMIT ?6 OFFSET ?7"
    );
    let total = conn
        .query_row(
            "SELECT COUNT(*) FROM papers
             WHERE project_id = ?1
               AND (?2 IS NULL OR search_blob LIKE ?2)
               AND (?3 IS NULL OR source = ?3)
               AND (?4 IS NULL OR field = ?4)
               AND (?5 IS NULL OR year = ?5)",
            params![project_id, query, source, field, input.year],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(
            params![project_id, query, source, field, input.year, limit, offset],
            row_to_paper,
        )
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(PaperQueryResult {
        rows,
        total,
        limit,
        offset,
        query_ms: started.elapsed().as_millis(),
    })
}

#[tauri::command]
fn paper_library_facets(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    project_id: Option<String>,
) -> Result<PaperLibraryFacets, String> {
    let (conn, _, _) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    Ok(PaperLibraryFacets {
        sources: count_facets(&conn, "source", &project_id, 20)?,
        fields: count_facets(&conn, "field", &project_id, 80)?,
        years: count_facets(&conn, "CAST(year AS TEXT)", &project_id, 80)?,
    })
}

#[tauri::command]
fn upsert_paper_library(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    project_id: Option<String>,
    papers: Vec<PaperRecord>,
) -> Result<PaperLibraryMutationResult, String> {
    let (mut conn, _, _) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    upsert_paper_rows(&mut conn, &project_id, papers)
}

fn upsert_paper_rows(
    conn: &mut Connection,
    project_id: &str,
    papers: Vec<PaperRecord>,
) -> Result<PaperLibraryMutationResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let result = upsert_paper_rows_in_transaction(&tx, project_id, papers)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(result)
}

fn upsert_paper_rows_in_transaction(
    tx: &Transaction<'_>,
    project_id: &str,
    papers: Vec<PaperRecord>,
) -> Result<PaperLibraryMutationResult, String> {
    let mut inserted = 0;
    let mut updated = 0;
    {
        let mut exists_stmt = tx
            .prepare("SELECT 1 FROM papers WHERE id = ?1")
            .map_err(|error| error.to_string())?;
        let mut upsert_stmt = tx
            .prepare(
                "INSERT INTO papers (
                    id, project_id, source, title, abstract, authors, categories, field,
                    published_date, year, url, doi, created_at, updated_at, search_blob
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                 ON CONFLICT(id) DO UPDATE SET
                    project_id = excluded.project_id,
                    source = excluded.source,
                    title = excluded.title,
                    abstract = excluded.abstract,
                    authors = excluded.authors,
                    categories = excluded.categories,
                    field = excluded.field,
                    published_date = excluded.published_date,
                    year = excluded.year,
                    url = excluded.url,
                    doi = excluded.doi,
                    updated_at = excluded.updated_at,
                    search_blob = excluded.search_blob",
            )
            .map_err(|error| error.to_string())?;

        for mut paper in papers {
            let id = scoped_id(project_id, &paper.id);
            let existed = exists_stmt
                .query_row(params![id], |row| row.get::<_, i64>(0))
                .optional()
                .map_err(|error| error.to_string())?
                .is_some();
            let timestamp = paper
                .updated_at
                .clone()
                .or_else(|| paper.created_at.clone())
                .unwrap_or_else(now_millis_string);
            let created_at = paper.created_at.take().unwrap_or_else(|| timestamp.clone());
            let updated_at = paper.updated_at.take().unwrap_or(timestamp);
            let search_blob = paper_search_blob(&paper);
            upsert_stmt
                .execute(params![
                    id,
                    project_id,
                    paper.source,
                    paper.title,
                    paper.abstract_text,
                    paper.authors,
                    paper.categories,
                    paper.field,
                    paper.published_date,
                    paper.year,
                    paper.url,
                    paper.doi,
                    created_at,
                    updated_at,
                    search_blob,
                ])
                .map_err(|error| error.to_string())?;
            if existed {
                updated += 1;
            } else {
                inserted += 1;
            }
        }
    }
    if inserted + updated > 0 {
        research_hotspots_core::invalidate_v20_after_library_mutation(
            &tx,
            project_id,
            now_millis().min(i64::MAX as u128) as i64,
        )?;
    }
    Ok(PaperLibraryMutationResult {
        inserted,
        updated,
        total: inserted + updated,
    })
}

#[tauri::command]
fn get_papers_by_ids(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    project_id: Option<String>,
    ids: Vec<String>,
) -> Result<Vec<PaperRecord>, String> {
    let (conn, _, _) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let mut rows = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, source, title, abstract, authors, categories, field, published_date, year, url, doi, created_at, updated_at
             FROM papers WHERE id = ?1 AND project_id = ?2",
        )
        .map_err(|error| error.to_string())?;
    for id in ids {
        let id = scoped_id(&project_id, &id);
        if let Some(paper) = stmt
            .query_row(params![id, project_id], row_to_paper)
            .optional()
            .map_err(|error| error.to_string())?
        {
            rows.push(paper);
        }
    }
    Ok(rows)
}

#[tauri::command]
fn delete_papers_from_library(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    project_id: Option<String>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let (mut conn, _, _) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let mut deleted = 0;
    {
        let mut stmt = tx
            .prepare("DELETE FROM papers WHERE id = ?1 AND project_id = ?2")
            .map_err(|error| error.to_string())?;
        for id in ids {
            let id = scoped_id(&project_id, &id);
            deleted += stmt
                .execute(params![id, project_id])
                .map_err(|error| error.to_string())?;
        }
    }
    if deleted > 0 {
        research_hotspots_core::invalidate_v20_after_library_mutation(
            &tx,
            &project_id,
            now_millis().min(i64::MAX as u128) as i64,
        )?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(deleted)
}

#[tauri::command]
fn start_paper_file_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, PaperImportTaskRegistry>,
    mutation_state: tauri::State<'_, LibraryMutationRegistry>,
    input: PaperFileImportInput,
) -> Result<PaperFileImportStart, String> {
    let file_path = PathBuf::from(&input.file_path);
    if !file_path.exists() {
        return Err(format!("Import file does not exist: {:?}", file_path));
    }
    if !file_path.is_file() {
        return Err(format!("Import path is not a file: {:?}", file_path));
    }
    let target_dir = resolve_database_dir(&app, input.database_dir.clone())?;
    let mutation_permit = mutation_state.try_acquire(
        &target_dir.join("research-hotspots-v7.sqlite"),
        "file_import",
    )?;

    let task_id = format!("paper-import-{}-{}", std::process::id(), now_millis());
    let file_name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("papers")
        .to_string();
    let control = PaperImportTaskControl::default();
    state
        .controls
        .lock()
        .map_err(|_| "Cannot lock import task registry.".to_string())?
        .insert(task_id.clone(), control.clone());

    let registry = state.inner().clone();
    let app_handle = app.clone();
    let return_task_id = task_id.clone();
    let return_file_name = file_name.clone();
    thread::spawn(move || {
        let _mutation_permit = mutation_permit;
        let result = run_paper_file_import_task(
            app_handle.clone(),
            task_id.clone(),
            file_name.clone(),
            input.database_dir,
            input.project_id,
            file_path,
            control,
        );
        if let Err(error) = result {
            if !error.starts_with(IMPORT_TASK_ERROR_EMITTED_PREFIX) {
                let _ = app_handle.emit(
                    "paper-import-progress",
                    PaperFileImportProgress {
                        task_id: task_id.clone(),
                        file_name: file_name.clone(),
                        status: "failed".to_string(),
                        total_rows: None,
                        processed_rows: 0,
                        inserted: 0,
                        updated: 0,
                        invalid_rows: 0,
                        duplicate_rows: 0,
                        message: error,
                        elapsed_ms: 0,
                    },
                );
            }
        }
        if let Ok(mut controls) = registry.controls.lock() {
            controls.remove(&task_id);
        }
    });

    Ok(PaperFileImportStart {
        task_id: return_task_id,
        file_name: return_file_name,
    })
}

#[tauri::command]
fn start_mysql_paper_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, PaperImportTaskRegistry>,
    mutation_state: tauri::State<'_, LibraryMutationRegistry>,
    mut input: MysqlPaperImportInput,
) -> Result<PaperFileImportStart, String> {
    let credential_project_id = input.project_id.clone().unwrap_or_else(default_project_id);
    if input
        .password
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .is_empty()
    {
        input.password = read_app_credential(&credential_project_id, "mysql")
            .or_else(|| std::env::var("MYSQL_PASSWORD").ok())
            .or_else(|| std::env::var("DB_PASSWORD").ok());
    }
    let task_id = format!("mysql-paper-import-{}-{}", std::process::id(), now_millis());
    let database = input
        .database
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("research_hotspots");
    let file_name = format!("MySQL {database}.papers");
    let target_dir = resolve_database_dir(&app, input.database_dir.clone())?;
    let mutation_permit = mutation_state.try_acquire(
        &target_dir.join("research-hotspots-v7.sqlite"),
        "mysql_import",
    )?;
    let control = PaperImportTaskControl::default();
    state
        .controls
        .lock()
        .map_err(|_| "Cannot lock import task registry.".to_string())?
        .insert(task_id.clone(), control.clone());

    let registry = state.inner().clone();
    let app_handle = app.clone();
    let return_task_id = task_id.clone();
    let return_file_name = file_name.clone();
    thread::spawn(move || {
        let _mutation_permit = mutation_permit;
        let result = run_mysql_paper_import_task(
            app_handle.clone(),
            task_id.clone(),
            file_name.clone(),
            input,
            control,
        );
        if let Err(error) = result {
            if !error.starts_with(IMPORT_TASK_ERROR_EMITTED_PREFIX) {
                let _ = app_handle.emit(
                    "paper-import-progress",
                    PaperFileImportProgress {
                        task_id: task_id.clone(),
                        file_name: file_name.clone(),
                        status: "failed".to_string(),
                        total_rows: None,
                        processed_rows: 0,
                        inserted: 0,
                        updated: 0,
                        invalid_rows: 0,
                        duplicate_rows: 0,
                        message: error,
                        elapsed_ms: 0,
                    },
                );
            }
        }
        if let Ok(mut controls) = registry.controls.lock() {
            controls.remove(&task_id);
        }
    });

    Ok(PaperFileImportStart {
        task_id: return_task_id,
        file_name: return_file_name,
    })
}

#[tauri::command]
fn demo_paper_sample_path() -> Result<String, String> {
    find_project_file(&["data", "samples", "papers_demo_80.jsonl"])
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "Cannot locate data/samples/papers_demo_80.jsonl.".to_string())
}

#[tauri::command]
fn control_paper_file_import(
    state: tauri::State<'_, PaperImportTaskRegistry>,
    task_id: String,
    action: String,
) -> Result<(), String> {
    let controls = state
        .controls
        .lock()
        .map_err(|_| "Cannot lock import task registry.".to_string())?;
    let control = controls
        .get(&task_id)
        .ok_or_else(|| format!("Import task not found: {task_id}"))?;
    match action.as_str() {
        "pause" => {
            control.paused.store(true, Ordering::SeqCst);
            Ok(())
        }
        "resume" => {
            control.paused.store(false, Ordering::SeqCst);
            Ok(())
        }
        "cancel" => {
            control.cancelled.store(true, Ordering::SeqCst);
            control.paused.store(false, Ordering::SeqCst);
            Ok(())
        }
        _ => Err(format!("Unsupported import control action: {action}")),
    }
}

#[tauri::command]
fn clean_paper_library(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryMutationRegistry>,
    database_dir: Option<String>,
    project_id: Option<String>,
) -> Result<PaperLibraryCleanResult, String> {
    let target_dir = resolve_database_dir(&app, database_dir)?;
    let database_path = target_dir.join("research-hotspots-v7.sqlite");
    let _permit = state.try_acquire(&database_path, "clean")?;
    let mut conn = Connection::open(&database_path).map_err(|error| error.to_string())?;
    initialize_library_database(&conn)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    clean_library_connection(&mut conn, &project_id)
}

fn clean_library_connection(
    conn: &mut Connection,
    project_id: &str,
) -> Result<PaperLibraryCleanResult, String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let result = clean_library_in_transaction(&tx, project_id)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(result)
}

fn clean_library_in_transaction(
    tx: &Transaction<'_>,
    project_id: &str,
) -> Result<PaperLibraryCleanResult, String> {
    let before_count = tx
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let rows = {
        let mut stmt = tx
            .prepare(
                "SELECT id, project_id, source, title, abstract, authors, categories, field, published_date, year, url, doi, created_at, updated_at
                 FROM papers
                 WHERE project_id = ?1
                 ORDER BY id ASC",
            )
            .map_err(|error| error.to_string())?;
        let mapped_rows = stmt
            .query_map(params![project_id], row_to_paper)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        mapped_rows
    };

    let mut seen: HashMap<String, String> = HashMap::new();
    let mut updates: Vec<(String, String, String, String)> = Vec::new();
    let mut delete_ids: Vec<String> = Vec::new();
    let mut duplicate_ids: Vec<String> = Vec::new();
    let mut empty_removed_count = 0;
    let mut duplicate_removed_count = 0;
    let removed_id_log_limit = 500;

    for mut paper in rows {
        let clean_title = collapse_whitespace(&paper.title);
        let clean_abstract = collapse_whitespace(&paper.abstract_text);
        if clean_title.is_empty() || clean_abstract.is_empty() {
            if duplicate_ids.len() < removed_id_log_limit {
                duplicate_ids.push(paper.id.clone());
            }
            delete_ids.push(paper.id);
            empty_removed_count += 1;
            continue;
        }

        if let Some(key) =
            paper_dedupe_key(paper.doi.as_deref(), paper.url.as_deref(), &clean_title)
        {
            if seen.contains_key(&key) {
                if duplicate_ids.len() < removed_id_log_limit {
                    duplicate_ids.push(paper.id.clone());
                }
                delete_ids.push(paper.id);
                duplicate_removed_count += 1;
                continue;
            }
            seen.insert(key, paper.id.clone());
        }

        if clean_title != paper.title || clean_abstract != paper.abstract_text {
            paper.title = clean_title;
            paper.abstract_text = clean_abstract;
            let search_blob = paper_search_blob(&paper);
            updates.push((paper.id, paper.title, paper.abstract_text, search_blob));
        }
    }

    let updated_at = now_millis_string();
    let mut updated_count = 0;
    {
        let mut update_stmt = tx
            .prepare(
                "UPDATE papers
                 SET title = ?1, abstract = ?2, search_blob = ?3, updated_at = ?4
                 WHERE id = ?5 AND project_id = ?6",
            )
            .map_err(|error| error.to_string())?;
        for (id, title, abstract_text, search_blob) in updates {
            updated_count += update_stmt
                .execute(params![
                    title,
                    abstract_text,
                    search_blob,
                    updated_at,
                    id,
                    project_id
                ])
                .map_err(|error| error.to_string())? as i64;
        }
    }
    {
        let mut delete_stmt = tx
            .prepare("DELETE FROM papers WHERE id = ?1 AND project_id = ?2")
            .map_err(|error| error.to_string())?;
        for id in delete_ids {
            delete_stmt
                .execute(params![id, project_id])
                .map_err(|error| error.to_string())?;
        }
    }
    let after_count = tx
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if before_count != after_count || updated_count > 0 {
        research_hotspots_core::invalidate_v20_after_library_mutation(
            &tx,
            project_id,
            now_millis().min(i64::MAX as u128) as i64,
        )?;
    }
    let removed_count = before_count - after_count;
    Ok(PaperLibraryCleanResult {
        before_count,
        after_count,
        removed_count,
        updated_count,
        empty_removed_count,
        duplicate_removed_count,
        duplicate_ids,
        cleaned_papers: Vec::new(),
        summary: format!(
            "SQLite library cleaned: before={before_count}, after={after_count}, normalized={updated_count}, removed={removed_count}, empty={empty_removed_count}, duplicates={duplicate_removed_count}."
        ),
    })
}

#[tauri::command]
async fn cluster_paper_library(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClusterTaskRegistry>,
    modeling_state: tauri::State<'_, SemanticModelingRegistry>,
    mutation_state: tauri::State<'_, LibraryMutationRegistry>,
    database_dir: Option<String>,
    project_id: Option<String>,
    embedding_device: Option<String>,
) -> Result<LibraryClusterResult, String> {
    let database_dir = resolve_database_dir(&app, database_dir)?;
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    let project_id = project_id.unwrap_or_else(default_project_id);
    let embedding_device =
        semantic_embedding::SemanticEmbeddingDevice::parse(embedding_device.as_deref())?;
    let task_key = cluster_task_key(&database_path, &project_id);
    let permit = state.try_acquire(task_key.clone())?;
    let modeling_permit = modeling_state.try_start(task_key)?;
    let mutation_permit = mutation_state.try_acquire(&database_path, "cluster")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let modeling_permit = modeling_permit;
        let _mutation_permit = mutation_permit;
        cluster_library_from_database_path_controlled(
            database_path,
            &project_id,
            embedding_device,
            Some(&modeling_permit.task),
            Some(&app),
        )
    })
    .await
    .map_err(|error| format!("Hotspot cluster task failed: {error}"))?
}

#[tauri::command]
fn get_semantic_modeling_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, SemanticModelingRegistry>,
    database_dir: Option<String>,
    project_id: Option<String>,
) -> Result<Option<SemanticModelingStatus>, String> {
    let database_dir = resolve_database_dir(&app, database_dir)?;
    let key = cluster_task_key(
        &database_dir.join("research-hotspots-v7.sqlite"),
        &project_id.unwrap_or_else(default_project_id),
    );
    state.status(&key)
}

#[tauri::command]
fn control_semantic_modeling(
    app: tauri::AppHandle,
    state: tauri::State<'_, SemanticModelingRegistry>,
    database_dir: Option<String>,
    project_id: Option<String>,
    action: String,
) -> Result<SemanticModelingStatus, String> {
    let database_dir = resolve_database_dir(&app, database_dir)?;
    let key = cluster_task_key(
        &database_dir.join("research-hotspots-v7.sqlite"),
        &project_id.unwrap_or_else(default_project_id),
    );
    state.control(&key, action.trim())
}

#[tauri::command]
fn get_semantic_embedding_capabilities(
) -> semantic_embedding::SemanticEmbeddingCapabilities {
    semantic_embedding::inspect_semantic_embedding_capabilities()
}

#[tauri::command]
async fn export_hotspot_evidence(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClusterTaskRegistry>,
    database_dir: Option<String>,
    project_id: Option<String>,
    hotspot_id: Option<String>,
    max_papers: Option<usize>,
) -> Result<HotspotEvidenceExportResult, String> {
    let database_dir = resolve_database_dir(&app, database_dir)?;
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    let project_id = project_id.unwrap_or_else(default_project_id);
    let permit = state.try_acquire(cluster_task_key(&database_path, &project_id))?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        export_hotspot_evidence_from_database_path(
            database_path,
            Some(project_id),
            hotspot_id,
            max_papers.unwrap_or(12),
        )
    })
    .await
    .map_err(|error| format!("Hotspot evidence export task failed: {error}"))?
}

#[cfg(any(test, feature = "dev-tools"))]
fn cluster_library_from_database_path(
    database_path: PathBuf,
    project_id: &str,
    embedding_device: semantic_embedding::SemanticEmbeddingDevice,
) -> Result<LibraryClusterResult, String> {
    cluster_library_from_database_path_controlled(
        database_path,
        project_id,
        embedding_device,
        None,
        None,
    )
}

fn cluster_library_from_database_path_controlled(
    database_path: PathBuf,
    project_id: &str,
    embedding_device: semantic_embedding::SemanticEmbeddingDevice,
    modeling_task: Option<&SemanticModelingTask>,
    app: Option<&tauri::AppHandle>,
) -> Result<LibraryClusterResult, String> {
    if let Some(database_dir) = database_path.parent() {
        fs::create_dir_all(database_dir)
            .map_err(|error| format!("Cannot create library dir {:?}: {error}", database_dir))?;
    }
    let conn = Connection::open(&database_path)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    initialize_library_database(&conn)?;
    let prepared = prepare_library_cluster_with_control(
        &conn,
        project_id,
        embedding_device,
        modeling_task,
        app,
    )?;
    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "committing".into();
        progress.cancellable = false;
        emit_semantic_modeling_progress(app, &progress);
    }
    write_snapshot_transaction(&conn, &prepared.snapshot)?;
    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "complete".into();
        progress.running = false;
        progress.processed = progress.total;
        emit_semantic_modeling_progress(app, &progress);
    }
    Ok(prepared.result)
}

fn cluster_task_key(database_path: &Path, project_id: &str) -> String {
    let absolute_path = fs::canonicalize(database_path).unwrap_or_else(|_| {
        if database_path.is_absolute() {
            database_path.to_path_buf()
        } else {
            std::env::current_dir()
                .map(|current_dir| current_dir.join(database_path))
                .unwrap_or_else(|_| database_path.to_path_buf())
        }
    });
    let mut normalized_path = absolute_path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        normalized_path.make_ascii_lowercase();
    }
    format!(
        "{}::{}",
        normalized_path.trim_end_matches('/'),
        project_id.trim()
    )
}

fn normalized_database_key(database_path: &Path) -> String {
    fs::canonicalize(database_path)
        .unwrap_or_else(|_| database_path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase()
}

fn cluster_library_connection(
    conn: &Connection,
    project_id: &str,
) -> Result<LibraryClusterResult, String> {
    let prepared = prepare_library_cluster(conn, project_id)?;
    write_snapshot_transaction(conn, &prepared.snapshot)?;
    Ok(prepared.result)
}

fn prepare_library_cluster(
    conn: &Connection,
    project_id: &str,
) -> Result<PreparedLibraryCluster, String> {
    prepare_library_cluster_with_device(
        conn,
        project_id,
        semantic_embedding::SemanticEmbeddingDevice::Cpu,
    )
}

fn prepare_library_cluster_with_device(
    conn: &Connection,
    project_id: &str,
    embedding_device: semantic_embedding::SemanticEmbeddingDevice,
) -> Result<PreparedLibraryCluster, String> {
    prepare_library_cluster_with_control(conn, project_id, embedding_device, None, None)
}

fn prepare_library_cluster_with_control(
    conn: &Connection,
    project_id: &str,
    embedding_device: semantic_embedding::SemanticEmbeddingDevice,
    modeling_task: Option<&SemanticModelingTask>,
    app: Option<&tauri::AppHandle>,
) -> Result<PreparedLibraryCluster, String> {
    let previous_snapshot = read_unified_galaxy_rows(conn, project_id)?;
    let mut stmt = conn
        .prepare("SELECT id, field, title, abstract, year, source, categories, doi, url FROM papers WHERE project_id = ?1")
        .map_err(|error| error.to_string())?;
    let mut rows = stmt
        .query(params![project_id])
        .map_err(|error| error.to_string())?;
    let mut groups: HashMap<String, ClusterGroup> = HashMap::new();
    let mut before_count = 0;

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let id: String = row.get(0).map_err(|error| error.to_string())?;
        let field: String = row.get(1).map_err(|error| error.to_string())?;
        let title: String = row.get(2).map_err(|error| error.to_string())?;
        let abstract_text: String = row.get(3).map_err(|error| error.to_string())?;
        let year: Option<i64> = row.get(4).map_err(|error| error.to_string())?;
        let source: String = row.get(5).map_err(|error| error.to_string())?;
        let categories: Option<String> = row.get(6).map_err(|error| error.to_string())?;
        let doi: Option<String> = row.get(7).map_err(|error| error.to_string())?;
        let url: Option<String> = row.get(8).map_err(|error| error.to_string())?;
        before_count += 1;

        let token_counts = weighted_token_counts(&title, &abstract_text, categories.as_deref());
        let tokens = sorted_keywords(&token_counts, 14);
        let keyword = tokens
            .first()
            .cloned()
            .unwrap_or_else(|| normalize_group_key(&field));
        let key = format!("{field}::{keyword}");
        let group = groups.entry(key).or_insert_with(|| ClusterGroup {
            field: field.clone(),
            keyword: keyword.clone(),
            ..ClusterGroup::default()
        });
        group.paper_count += 1;
        let evidence_score = candidate_evidence_score(
            &title,
            &abstract_text,
            year,
            doi.as_deref(),
            url.as_deref(),
            &tokens,
        );
        let candidate = RepresentativeCandidate {
            id: id.clone(),
            year,
            source: source.clone(),
            terms: tokens.clone(),
            evidence_score,
            semantic_document: SemanticPaperDocument {
                paper_id: id.clone(),
                title: title.clone(),
                field: field.clone(),
                categories: categories.clone(),
                abstract_text: abstract_text.clone(),
            },
        };
        group.representative_candidates.push(candidate.clone());
        if group.representative_ids.len() < 64 {
            group.representative_ids.push(id.clone());
        }
        if let Some(year) = year {
            *group.years.entry(year).or_insert(0) += 1;
            let reps = group.year_representatives.entry(year).or_default();
            reps.push(candidate);
        }
        for (token, weight) in token_counts {
            *group.keyword_counts.entry(token).or_insert(0) += weight;
        }
        *group.source_counts.entry(source).or_insert(0) += 1;
    }

    let mut sorted_groups = groups.into_values().collect::<Vec<_>>();
    sorted_groups.sort_by(|a, b| {
        b.paper_count
            .cmp(&a.paper_count)
            .then_with(|| a.field.cmp(&b.field))
            .then_with(|| a.keyword.cmp(&b.keyword))
    });

    let timestamp = now_millis_string();
    let retained_groups = sorted_groups.iter().take(160).cloned().collect::<Vec<_>>();
    let hotspot_identity_keys = retained_groups
        .iter()
        .map(|group| semantic_hotspot_identity_key(&group.field, &group.keyword))
        .collect::<Vec<_>>();
    let hotspot_identity_hashes = hotspot_identity_keys
        .iter()
        .map(|key| semantic_hotspot_identity_sha256(key))
        .collect::<Vec<_>>();
    let mut hotspots = retained_groups
        .iter()
        .cloned()
        .enumerate()
        .map(|(index, group)| cluster_group_to_hotspot(project_id, group, index, &timestamp))
        .collect::<Vec<_>>();
    assign_similar_hotspots(&mut hotspots);

    let retained_index = retained_groups
        .iter()
        .enumerate()
        .map(|(index, group)| (format!("{}::{}", group.field, group.keyword), index))
        .collect::<HashMap<_, _>>();
    let semantic_documents = sorted_groups
        .iter()
        .flat_map(|group| {
            group
                .representative_candidates
                .iter()
                .map(|candidate| candidate.semantic_document.clone())
        })
        .collect::<Vec<_>>();
    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "text-preparation".into();
        progress.total = semantic_documents.len();
        emit_semantic_modeling_progress(app, &progress);
    }
    let default_control = semantic_embedding::SemanticEmbeddingControl::default();
    let control = modeling_task
        .map(|task| &task.control)
        .unwrap_or(&default_control);
    let (embedding_records, _embedding_provider, _embedding_fallback_reason) =
        semantic_embedding::resolve_embedding_records_with_progress(
            conn,
            project_id,
            &semantic_documents,
            embedding_device,
            now_millis().min(i64::MAX as u128) as i64,
            control,
            |embedding_progress| {
                if let Some(task) = modeling_task {
                    if let Ok(mut progress) = task.progress.lock() {
                        progress.stage = embedding_progress.stage;
                        progress.processed = embedding_progress.processed;
                        progress.total = embedding_progress.total;
                        progress.cached = embedding_progress.cached;
                        progress.inferred = embedding_progress.inferred;
                        progress.provider = embedding_progress.provider;
                        progress.fallback_reason = embedding_progress.fallback_reason;
                        progress.paused = task.control.is_paused();
                        emit_semantic_modeling_progress(app, &progress);
                    }
                }
            },
        )?;
    if let Some(task) = modeling_task {
        if task.control.is_cancelled() {
            return Err("SEMANTIC_MODELING_CANCELLED".into());
        }
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "projection".into();
        emit_semantic_modeling_progress(app, &progress);
    }
    let embedding_by_id = embedding_records
        .into_iter()
        .map(|record| (record.paper_id.clone(), record))
        .collect::<HashMap<_, _>>();
    let mut assigned_candidates = vec![Vec::<(RepresentativeCandidate, f64)>::new(); hotspots.len()];
    for group in &sorted_groups {
        let group_key = format!("{}::{}", group.field, group.keyword);
        let target_index = retained_index.get(&group_key).copied().unwrap_or_else(|| {
            hotspots
                .iter()
                .enumerate()
                .filter(|(_, hotspot)| hotspot.field == group.field)
                .max_by(|(_, left), (_, right)| {
                    hotspot_group_overlap(left, group)
                        .partial_cmp(&hotspot_group_overlap(right, group))
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| left.paper_count.cmp(&right.paper_count))
                })
                .map(|(index, _)| index)
                .unwrap_or_else(|| {
                    hotspots
                        .iter()
                        .enumerate()
                        .max_by_key(|(_, hotspot)| hotspot.paper_count)
                        .map(|(index, _)| index)
                        .unwrap_or(0)
                })
        });
        let hotspot = &hotspots[target_index];
        let group_score = hotspot_group_overlap(hotspot, group);
        for candidate in &group.representative_candidates {
            assigned_candidates[target_index].push((candidate.clone(), group_score));
        }
    }

    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "hotspot-centroids".into();
        emit_semantic_modeling_progress(app, &progress);
    }
    let centroid_records = assigned_candidates
        .iter()
        .enumerate()
        .map(|(hotspot_index, candidates)| {
            let records = candidates
                .iter()
                .map(|(candidate, _)| {
                    embedding_by_id
                        .get(&candidate.id)
                        .cloned()
                        .ok_or_else(|| "SEMANTIC_EMBEDDING_CACHE_INCOMPLETE".to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            semantic_centroid_record(&hotspots[hotspot_index].id, &records)
        })
        .collect::<Result<Vec<_>, String>>()?;
    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "hotspot-pca3".into();
        emit_semantic_modeling_progress(app, &progress);
    }
    let mut hotspot_points = project_semantic_hotspot_centroids(&centroid_records)?;
    if let Some(previous) = previous_snapshot.as_ref().filter(|previous| {
        previous.state.layout_version == SEMANTIC_LAYOUT_VERSION
            && previous.state.projection_version == SEMANTIC_PROJECTION_VERSION
    }) {
        align_hotspot_projection_to_previous(&mut hotspot_points, previous);
    }
    for hotspot in &mut hotspots {
        let point = hotspot_points
            .get(&hotspot.id)
            .copied()
            .ok_or_else(|| "SEMANTIC_HOTSPOT_POINT_MISSING".to_string())?;
        hotspot.coordinates = HotspotCoordinates {
            x: point.x,
            y: point.y,
            z: point.z,
        };
    }

    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "local-pca3".into();
        emit_semantic_modeling_progress(app, &progress);
    }
    let mut local_point_sets = assigned_candidates
        .iter()
        .map(|candidates| {
            let records = candidates
                .iter()
                .map(|(candidate, _)| {
                    embedding_by_id
                        .get(&candidate.id)
                        .cloned()
                        .ok_or_else(|| "SEMANTIC_EMBEDDING_CACHE_INCOMPLETE".to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            project_semantic_embeddings(&records)
        })
        .collect::<Result<Vec<_>, String>>()?;
    let local_scale_summary = scale_semantic_local_point_sets(&mut local_point_sets)?;

    let mut memberships = Vec::with_capacity(before_count as usize);
    for ((hotspot_index, candidates), points) in assigned_candidates
        .iter()
        .enumerate()
        .zip(&local_point_sets)
    {
        let hotspot = &hotspots[hotspot_index];
        for (candidate, group_score) in candidates {
            let point = points
                .get(&candidate.id)
                .copied()
                .ok_or_else(|| "SEMANTIC_LAYOUT_POINT_MISSING".to_string())?;
            memberships.push(v20_membership_for_semantic_candidate(
                hotspot,
                candidate,
                *group_score,
                point,
            ));
        }
    }

    let snapshot_id = format!("{}:v20:{}", project_id, timestamp);
    if let Some(task) = modeling_task {
        let mut progress = task
            .progress
            .lock()
            .map_err(|_| "Cannot lock semantic modeling status.".to_string())?;
        progress.stage = "hotspot-lineage".into();
        emit_semantic_modeling_progress(app, &progress);
    }
    let lineage = build_hotspot_lineage(
        previous_snapshot.as_ref(),
        project_id,
        &snapshot_id,
        &hotspots,
        &hotspot_identity_hashes,
        &memberships,
        &timestamp,
        current_library_revision(conn, project_id)?,
    )?;
    let snapshot_hotspots = hotspots
        .iter()
        .enumerate()
        .map(|(index, hotspot)| {
            Ok(SnapshotHotspot {
                hotspot_id: hotspot.id.clone(),
                payload_json: serde_json::to_string(hotspot).map_err(|error| error.to_string())?,
                identity_key_sha256: hotspot_identity_hashes[index].clone(),
                x: hotspot.coordinates.x as f64,
                y: hotspot.coordinates.y as f64,
                z: hotspot.coordinates.z as f64,
                paper_count: hotspot.paper_count,
                updated_at: hotspot.updated_at.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let snapshot = SnapshotWriteInput {
            snapshot_id: snapshot_id.clone(),
            project_id: project_id.to_string(),
            algorithm_version: V20_ALGORITHM_VERSION.to_string(),
            layout_version: SEMANTIC_LAYOUT_VERSION.to_string(),
            projection_version: SEMANTIC_PROJECTION_VERSION.to_string(),
            embedding_model_id: SEMANTIC_MODEL_ID.to_string(),
            embedding_model_revision: SEMANTIC_MODEL_REVISION.to_string(),
            hotspot_identity_version: HOTSPOT_IDENTITY_VERSION.to_string(),
            paper_count: before_count,
            created_at: timestamp.clone(),
            hotspots: snapshot_hotspots,
            memberships: memberships.clone(),
            lineage,
        };

    let result = LibraryClusterResult {
        before_count,
        cluster_count: hotspots.len() as i64,
        snapshot_id,
        membership_count: memberships.len() as i64,
        summary: format!(
            "已生成统一 V20 快照：{before_count} 篇论文、{} 个热点、{} 条论文归属；自然语义云共享尺度 {:.6}。",
            hotspots.len(),
            memberships.len(),
            local_scale_summary.shared_scale
        ),
        hotspots,
    };
    Ok(PreparedLibraryCluster { snapshot, result })
}

fn emit_semantic_modeling_progress(
    app: Option<&tauri::AppHandle>,
    progress: &SemanticModelingStatus,
) {
    if let Some(app) = app {
        let _ = app.emit("semantic-modeling-progress", progress.clone());
    }
}

fn commit_prepared_library_cluster(
    tx: &Transaction<'_>,
    prepared: &PreparedLibraryCluster,
) -> Result<LibraryClusterResult, String> {
    write_snapshot_in_transaction(tx, &prepared.snapshot)?;
    Ok(prepared.result.clone())
}

fn align_hotspot_projection_to_previous(
    points: &mut HashMap<String, SemanticPoint3>,
    previous: &UnifiedGalaxyRows,
) {
    let previous_by_id = previous
        .hotspots
        .iter()
        .map(|row| {
            (
                row.hotspot_id.as_str(),
                SemanticPoint3 {
                    x: row.x,
                    y: row.y,
                    z: row.z,
                },
            )
        })
        .collect::<HashMap<_, _>>();
    let common = points
        .iter()
        .filter_map(|(id, point)| previous_by_id.get(id.as_str()).map(|old| (*point, *old)))
        .collect::<Vec<_>>();
    if common.len() < 20 {
        return;
    }
    let components = |point: SemanticPoint3| [point.x, point.y, point.z];
    let source = common
        .iter()
        .map(|(current, _)| components(*current))
        .collect::<Vec<_>>();
    let target = common
        .iter()
        .map(|(_, old)| components(*old))
        .collect::<Vec<_>>();
    let Ok(rotation) = orthogonal_procrustes_3d(&source, &target) else {
        return;
    };
    for point in points.values_mut() {
        let source = components(*point);
        let aligned = multiply_matrix_vector_3d(&rotation, source);
        point.x = aligned[0];
        point.y = aligned[1];
        point.z = aligned[2];
    }
}

fn build_hotspot_lineage(
    previous: Option<&UnifiedGalaxyRows>,
    project_id: &str,
    snapshot_id: &str,
    hotspots: &[HotspotRecord],
    identity_hashes: &[String],
    memberships: &[SnapshotMembership],
    timestamp: &str,
    current_library_revision: i64,
) -> Result<Vec<SnapshotHotspotLineage>, String> {
    let Some(previous) = previous else {
        return Ok(Vec::new());
    };
    let old_members = previous.memberships.iter().fold(
        HashMap::<String, HashSet<String>>::new(),
        |mut values, membership| {
            values
                .entry(membership.hotspot_id.clone())
                .or_default()
                .insert(membership.paper_id.clone());
            values
        },
    );
    let new_members = memberships.iter().fold(
        HashMap::<String, HashSet<String>>::new(),
        |mut values, membership| {
            values
                .entry(membership.hotspot_id.clone())
                .or_default()
                .insert(membership.paper_id.clone());
            values
        },
    );
    let old_fields = previous
        .hotspots
        .iter()
        .map(|row| {
            let field = serde_json::from_str::<HotspotRecord>(&row.payload_json)
                .map(|hotspot| hotspot.field)
                .unwrap_or_default();
            (row.hotspot_id.clone(), field)
        })
        .collect::<HashMap<_, _>>();
    let new_fields = hotspots
        .iter()
        .map(|hotspot| (hotspot.id.clone(), hotspot.field.clone()))
        .collect::<HashMap<_, _>>();
    let new_identity = hotspots
        .iter()
        .zip(identity_hashes)
        .map(|(hotspot, identity)| (hotspot.id.clone(), identity.clone()))
        .collect::<HashMap<_, _>>();
    let old_identity = previous
        .hotspots
        .iter()
        .map(|hotspot| (hotspot.hotspot_id.clone(), hotspot.identity_key_sha256.clone()))
        .collect::<HashMap<_, _>>();
    let mut candidates = Vec::new();
    for old in &previous.hotspots {
        let old_set = old_members
            .get(&old.hotspot_id)
            .cloned()
            .unwrap_or_default();
        for hotspot in hotspots {
            if old_fields.get(&old.hotspot_id) != new_fields.get(&hotspot.id) {
                continue;
            }
            let new_set = new_members
                .get(&hotspot.id)
                .cloned()
                .unwrap_or_default();
            let intersection = old_set.intersection(&new_set).count();
            let union = old_set.union(&new_set).count();
            let overlap = if union == 0 {
                0.0
            } else {
                intersection as f64 / union as f64
            };
            let identity_match = old_identity
                .get(&old.hotspot_id)
                .filter(|identity| !identity.is_empty())
                == new_identity.get(&hotspot.id);
            if identity_match || overlap > 0.0 {
                candidates.push((
                    old.hotspot_id.clone(),
                    hotspot.id.clone(),
                    overlap,
                    identity_match,
                ));
            }
        }
    }
    candidates.sort_by(|left, right| {
        right
            .3
            .cmp(&left.3)
            .then_with(|| {
                right
                    .2
                    .partial_cmp(&left.2)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| left.0.cmp(&right.0))
            .then_with(|| left.1.cmp(&right.1))
    });
    let mut used_old = HashSet::new();
    let mut used_new = HashSet::new();
    let mut lineage = Vec::new();
    for (old_id, new_id, overlap, identity_match) in candidates {
        if used_old.contains(&old_id) || used_new.contains(&new_id) {
            continue;
        }
        used_old.insert(old_id.clone());
        used_new.insert(new_id.clone());
        lineage.push(SnapshotHotspotLineage {
            from_snapshot_id: previous.state.active_snapshot_id.clone(),
            from_hotspot_id: old_id,
            to_snapshot_id: snapshot_id.to_string(),
            to_hotspot_id: new_id,
            relation_type: if identity_match {
                "identity".into()
            } else if overlap >= 1.0 - 1e-12 {
                "equivalent".into()
            } else {
                "continuation".into()
            },
            member_overlap: overlap,
            identity_key_match: identity_match,
            created_at: timestamp.to_string(),
        });
    }
    let unchanged_library = previous.state.project_id == project_id
        && previous.state.library_revision == current_library_revision
        && previous.state.paper_count == memberships.len() as i64
        && previous.hotspots.len() == hotspots.len();
    if unchanged_library
        && (lineage.len() != hotspots.len()
            || lineage.iter().any(|row| row.member_overlap < 1.0 - 1e-12))
    {
        return Err("V20_HOTSPOT_LINEAGE_UNCHANGED_LIBRARY_MISMATCH".into());
    }
    Ok(lineage)
}

fn hotspot_group_overlap(hotspot: &HotspotRecord, group: &ClusterGroup) -> f64 {
    let total = group.keyword_counts.values().copied().sum::<i64>().max(1) as f64;
    hotspot
        .keywords
        .iter()
        .take(10)
        .map(|keyword| *group.keyword_counts.get(keyword).unwrap_or(&0) as f64)
        .sum::<f64>()
        / total
}

fn v20_membership_for_semantic_candidate(
    hotspot: &HotspotRecord,
    candidate: &RepresentativeCandidate,
    group_score: f64,
    point: SemanticPoint3,
) -> SnapshotMembership {
    let representative_rank = hotspot
        .analysis
        .evidence_paper_ids
        .iter()
        .position(|id| id == &candidate.id)
        .map(|index| index as i64 + 1);
    SnapshotMembership {
        paper_id: candidate.id.clone(),
        hotspot_id: hotspot.id.clone(),
        x: hotspot.coordinates.x as f64 + point.x,
        y: hotspot.coordinates.y as f64 + point.y,
        z: hotspot.coordinates.z as f64 + point.z,
        representative_rank,
        score: round_metric(
            (0.45 + group_score * 0.45 + candidate.evidence_score.min(4.0) * 0.025).min(1.0),
        ),
    }
}

pub fn export_star_map_from_database_path(
    database_path: PathBuf,
    project_id: Option<String>,
) -> Result<StarMapExportResult, String> {
    if !database_path.exists() || !database_path.is_file() {
        return Err(format!(
            "SQLite database does not exist: {}",
            database_path.display()
        ));
    }
    let project_id = project_id.unwrap_or_else(default_project_id);
    let conn = Connection::open(&database_path)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    let cluster_result = cluster_library_connection(&conn, &project_id)?;
    let hotspots = cluster_result.hotspots;
    let mut evidence_ids = HashSet::new();
    let mut semantic_link_count = 0usize;
    let mut hotspots_with_evidence = 0usize;
    let mut hotspots_with_evolution = 0usize;
    let mut hotspots_with_source_distribution = 0usize;
    let mut total_representative_ids = 0usize;
    let mut sample_signal_ids = HashSet::new();
    let mut min_x = 0.0f64;
    let mut max_x = 0.0f64;
    let mut min_y = 0.0f64;
    let mut max_y = 0.0f64;
    let mut min_z = 0.0f64;
    let mut max_z = 0.0f64;

    for (index, hotspot) in hotspots.iter().enumerate() {
        if index == 0 {
            min_x = hotspot.coordinates.x;
            max_x = hotspot.coordinates.x;
            min_y = hotspot.coordinates.y;
            max_y = hotspot.coordinates.y;
            min_z = hotspot.coordinates.z;
            max_z = hotspot.coordinates.z;
        } else {
            min_x = min_x.min(hotspot.coordinates.x);
            max_x = max_x.max(hotspot.coordinates.x);
            min_y = min_y.min(hotspot.coordinates.y);
            max_y = max_y.max(hotspot.coordinates.y);
            min_z = min_z.min(hotspot.coordinates.z);
            max_z = max_z.max(hotspot.coordinates.z);
        }
        semantic_link_count += hotspot.similar_hotspots.len();
        if !hotspot.analysis.evidence_paper_ids.is_empty() {
            hotspots_with_evidence += 1;
        }
        total_representative_ids += hotspot.analysis.evidence_paper_ids.len();
        if !hotspot.evolution.is_empty() {
            hotspots_with_evolution += 1;
        }
        if !hotspot.source_distribution.is_empty() {
            hotspots_with_source_distribution += 1;
        }
        for id in &hotspot.analysis.evidence_paper_ids {
            if looks_like_sample_id(id) {
                sample_signal_ids.insert(id.clone());
            }
            evidence_ids.insert(id.clone());
        }
        for evolution in &hotspot.evolution {
            for id in &evolution.representative_ids {
                if looks_like_sample_id(id) {
                    sample_signal_ids.insert(id.clone());
                }
                evidence_ids.insert(id.clone());
            }
        }
    }
    semantic_link_count /= 2;
    let hotspot_total = hotspots.len().max(1) as f64;
    let evidence_profile = StarMapEvidenceProfile {
        evidence_coverage: round_metric(hotspots_with_evidence as f64 / hotspot_total),
        evolution_coverage: round_metric(hotspots_with_evolution as f64 / hotspot_total),
        source_distribution_coverage: round_metric(
            hotspots_with_source_distribution as f64 / hotspot_total,
        ),
        average_representative_ids: round_metric(total_representative_ids as f64 / hotspot_total),
        sample_signal_count: sample_signal_ids.len(),
        sample_signal_rate: round_metric(
            sample_signal_ids.len() as f64 / evidence_ids.len().max(1) as f64,
        ),
    };

    let sample_hotspots = hotspots
        .iter()
        .take(12)
        .map(|hotspot| StarMapSampleHotspot {
            id: hotspot.id.clone(),
            title: hotspot.title.clone(),
            field: hotspot.field.clone(),
            paper_count: hotspot.paper_count,
            representative_ids: hotspot
                .analysis
                .evidence_paper_ids
                .iter()
                .take(8)
                .cloned()
                .collect(),
            year_count: hotspot.evolution.len(),
            link_count: hotspot.similar_hotspots.len(),
        })
        .collect::<Vec<_>>();

    let hotspots_json = serde_json::to_value(&hotspots).map_err(|error| error.to_string())?;
    Ok(StarMapExportResult {
        generated_at: format!("unix-ms:{}", now_millis()),
        database_path: database_path.to_string_lossy().to_string(),
        project_id,
        paper_count: cluster_result.before_count,
        hotspot_count: cluster_result.cluster_count,
        semantic_link_count,
        evidence_id_count: evidence_ids.len(),
        hotspots_with_evidence,
        hotspots_with_evolution,
        hotspots_with_source_distribution,
        coordinate_spread: StarMapCoordinateSpread {
            x: max_x - min_x,
            y: max_y - min_y,
            z: max_z - min_z,
        },
        evidence_profile,
        sample_hotspots,
        cluster_summary: cluster_result.summary,
        hotspots: hotspots_json,
    })
}

fn looks_like_sample_id(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.contains(":sample-")
        || lower.contains("sample_")
        || lower.ends_with("-sample")
        || lower.contains("papers_sample")
        || lower.contains("arxiv:ai-001")
        || lower.contains("openalex:ai-002")
        || lower.contains("openalex:bio-001")
        || lower.contains("arxiv:math-001")
}

pub fn export_hotspot_evidence_from_database_path(
    database_path: PathBuf,
    project_id: Option<String>,
    hotspot_id: Option<String>,
    max_papers: usize,
) -> Result<HotspotEvidenceExportResult, String> {
    if !database_path.exists() || !database_path.is_file() {
        return Err(format!(
            "SQLite database does not exist: {}",
            database_path.display()
        ));
    }
    let project_id = project_id.unwrap_or_else(default_project_id);
    let conn = Connection::open(&database_path)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    let cluster_result = cluster_library_connection(&conn, &project_id)?;
    let hotspots = cluster_result.hotspots;
    if hotspots.is_empty() {
        return Err("No hotspots were generated from this SQLite library.".to_string());
    }

    let selected_index = if let Some(hotspot_id) = hotspot_id.as_ref() {
        hotspots
            .iter()
            .position(|hotspot| &hotspot.id == hotspot_id)
            .ok_or_else(|| format!("Hotspot id was not found: {hotspot_id}"))?
    } else {
        0
    };
    let selected = &hotspots[selected_index];

    let mut representative_ids = Vec::new();
    let mut seen = HashSet::new();
    for id in &selected.analysis.evidence_paper_ids {
        if seen.insert(id.clone()) {
            representative_ids.push(id.clone());
        }
    }
    for evolution in &selected.evolution {
        for id in &evolution.representative_ids {
            if seen.insert(id.clone()) {
                representative_ids.push(id.clone());
            }
        }
    }
    representative_ids.truncate(max_papers.max(1));

    let representative_papers =
        query_paper_snapshots_by_ids(&conn, &project_id, &representative_ids)?;
    let found_ids = representative_papers
        .iter()
        .map(|paper| paper.id.clone())
        .collect::<HashSet<_>>();
    let missing_representative_ids = representative_ids
        .iter()
        .filter(|id| !found_ids.contains(*id))
        .cloned()
        .collect::<Vec<_>>();
    let similar_hotspots = selected
        .similar_hotspots
        .iter()
        .filter_map(|relation| {
            hotspots
                .iter()
                .find(|hotspot| hotspot.id == relation.hotspot_id)
                .map(|hotspot| EvidenceSimilarHotspot {
                    hotspot_id: relation.hotspot_id.clone(),
                    title: hotspot.title.clone(),
                    field: hotspot.field.clone(),
                    score: relation.score,
                })
        })
        .collect::<Vec<_>>();
    let year_evolution = selected
        .evolution
        .iter()
        .map(|item| EvidenceYearEvolution {
            year: item.year,
            count: item.count,
            keywords: item.keywords.clone(),
            representative_ids: item.representative_ids.clone(),
        })
        .collect::<Vec<_>>();
    let source_distribution = selected
        .source_distribution
        .iter()
        .map(|item| EvidenceCountFacet {
            value: item.value.clone(),
            count: item.count,
        })
        .collect::<Vec<_>>();
    let evidence_profile_markdown =
        build_hotspot_evidence_markdown(selected, &representative_papers);

    Ok(HotspotEvidenceExportResult {
        generated_at: format!("unix-ms:{}", now_millis()),
        database_path: database_path.to_string_lossy().to_string(),
        project_id,
        selected_hotspot_id: selected.id.clone(),
        selected_hotspot_title: selected.title.clone(),
        selected_hotspot_field: selected.field.clone(),
        hotspot_paper_count: selected.paper_count,
        hotspot_keywords: selected.keywords.clone(),
        hotspot_trend: selected.trend.clone(),
        hotspot_confidence: selected.confidence,
        representative_ids,
        missing_representative_ids,
        representative_papers,
        year_evolution,
        source_distribution,
        similar_hotspots,
        evidence_profile_markdown,
    })
}

fn query_paper_snapshots_by_ids(
    conn: &Connection,
    project_id: &str,
    ids: &[String],
) -> Result<Vec<EvidencePaperSnapshot>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, source, title, abstract, authors, categories, field, published_date, year, url, doi
             FROM papers WHERE project_id = ?1 AND id = ?2",
        )
        .map_err(|error| error.to_string())?;
    let mut rows = Vec::new();
    for id in ids {
        let paper = stmt
            .query_row(params![project_id, id], |row| {
                Ok(EvidencePaperSnapshot {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    title: row.get(2)?,
                    abstract_text: row.get(3)?,
                    authors: row.get(4)?,
                    categories: row.get(5)?,
                    field: row.get(6)?,
                    published_date: row.get(7)?,
                    year: row.get(8)?,
                    url: row.get(9)?,
                    doi: row.get(10)?,
                })
            })
            .optional()
            .map_err(|error| error.to_string())?;
        if let Some(paper) = paper {
            rows.push(paper);
        }
    }
    Ok(rows)
}

fn build_hotspot_evidence_markdown(
    hotspot: &HotspotRecord,
    papers: &[EvidencePaperSnapshot],
) -> String {
    let sources = hotspot
        .source_distribution
        .iter()
        .map(|item| format!("{} {}", item.value, item.count))
        .collect::<Vec<_>>()
        .join("; ");
    let years = hotspot
        .evolution
        .iter()
        .map(|item| format!("{}:{}", item.year, item.count))
        .collect::<Vec<_>>()
        .join("; ");
    let representative_lines = papers
        .iter()
        .enumerate()
        .map(|(index, paper)| {
            let year = paper
                .year
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            format!(
                "[{}] {}. {}, {}. {}",
                index + 1,
                paper.title,
                paper.source,
                year,
                paper
                    .url
                    .as_deref()
                    .or(paper.doi.as_deref())
                    .unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    [
        format!("# Hotspot Evidence Bundle: {}", hotspot.title),
        format!("- Hotspot id: {}", hotspot.id),
        format!("- Field: {}", hotspot.field),
        format!("- Paper count: {}", hotspot.paper_count),
        format!("- Trend: {}", hotspot.trend),
        format!("- Confidence: {:.2}", hotspot.confidence),
        format!(
            "- Keywords: {}",
            hotspot
                .keywords
                .iter()
                .take(16)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        ),
        format!(
            "- Year evolution: {}",
            if years.is_empty() {
                "unknown".to_string()
            } else {
                years
            }
        ),
        format!(
            "- Source distribution: {}",
            if sources.is_empty() {
                "unknown".to_string()
            } else {
                sources
            }
        ),
        "## Representative Papers".to_string(),
        if representative_lines.is_empty() {
            "No representative papers found.".to_string()
        } else {
            representative_lines
        },
    ]
    .join("\n")
}

#[tauri::command]
fn run_library_pressure_test(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    rows: Option<i64>,
) -> Result<LibraryPressureTestResult, String> {
    let base_dir = resolve_database_dir(&app, database_dir)?;
    let row_count = rows.unwrap_or(100_000).clamp(1_000, 200_000);
    run_library_pressure_test_in_dir(base_dir, row_count, true)
}

fn run_library_pressure_test_in_dir(
    base_dir: PathBuf,
    rows: i64,
    cleanup: bool,
) -> Result<LibraryPressureTestResult, String> {
    fs::create_dir_all(&base_dir).map_err(|error| {
        format!(
            "Cannot create pressure test base dir {:?}: {error}",
            base_dir
        )
    })?;
    let test_dir = base_dir.join(format!("v7-pressure-test-{}", now_millis()));
    fs::create_dir_all(&test_dir)
        .map_err(|error| format!("Cannot create pressure test dir {:?}: {error}", test_dir))?;
    let database_path = test_dir.join("pressure-test-v7.sqlite");
    let mut conn = Connection::open(&database_path).map_err(|error| {
        format!(
            "Cannot open pressure test database {:?}: {error}",
            database_path
        )
    })?;
    initialize_library_database(&conn)?;

    let project_id = "pressure-test-v7";
    let started = Instant::now();
    let insert_started = Instant::now();
    let mut generated = 0;
    while generated < rows {
        let batch_len = (rows - generated).min(1000);
        let batch = (0..batch_len)
            .map(|offset| pressure_test_paper(generated + offset))
            .collect::<Vec<_>>();
        upsert_paper_rows(&mut conn, project_id, batch)?;
        generated += batch_len;
    }
    let insert_ms = insert_started.elapsed().as_millis();

    let query_started = Instant::now();
    let query_count = conn
        .query_row(
            "SELECT COUNT(*) FROM papers
             WHERE project_id = ?1
               AND search_blob LIKE ?2
               AND source = ?3
               AND year BETWEEN ?4 AND ?5",
            params![project_id, "%graph%", "local", 2020_i64, 2026_i64],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let mut query_stmt = conn
        .prepare(
            "SELECT id, title FROM papers
             WHERE project_id = ?1 AND search_blob LIKE ?2
             ORDER BY year DESC, updated_at DESC
             LIMIT 50 OFFSET 500",
        )
        .map_err(|error| error.to_string())?;
    let sample_rows = query_stmt
        .query_map(params![project_id, "%retrieval%"], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(query_stmt);
    let query_ms = query_started.elapsed().as_millis();

    let cluster_started = Instant::now();
    let cluster_result = cluster_library_connection(&conn, project_id)?;
    let cluster_ms = cluster_started.elapsed().as_millis();
    let size_bytes = fs::metadata(&database_path)
        .map(|metadata| metadata.len())
        .unwrap_or_default();
    drop(conn);

    let cleanup_done = if cleanup {
        fs::remove_dir_all(&test_dir).is_ok()
    } else {
        false
    };
    let sample_hotspots = cluster_result
        .hotspots
        .iter()
        .take(5)
        .map(|hotspot| hotspot.title.clone())
        .chain(sample_rows.into_iter().take(2).map(|(_, title)| title))
        .collect::<Vec<_>>();
    let total_ms = started.elapsed().as_millis();

    Ok(LibraryPressureTestResult {
        rows,
        database_dir: test_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        size_bytes,
        insert_ms,
        query_ms,
        cluster_ms,
        total_ms,
        query_count,
        cluster_count: cluster_result.cluster_count,
        sample_hotspots,
        cleanup_done,
        summary: format!(
            "100k-scale pressure test finished: rows={rows}, insert={insert_ms}ms, query={query_ms}ms, cluster={cluster_ms}ms, hotspots={}, cleaned={cleanup_done}.",
            cluster_result.cluster_count
        ),
    })
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

fn credential_service(project_id: &str, service: &str) -> String {
    let safe_project = project_id
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '-' | '_') {
                value
            } else {
                '_'
            }
        })
        .collect::<String>();
    let safe_service = service
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '-' | '_') {
                value
            } else {
                '_'
            }
        })
        .collect::<String>();
    format!("research-hotspots-desktop:{safe_project}:{safe_service}")
}

fn credential_entry(project_id: &str, service: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(&credential_service(project_id, service), "credential")
        .map_err(|error| format!("Cannot access Windows Credential Manager: {error}"))
}

fn read_app_credential(project_id: &str, service: &str) -> Option<String> {
    credential_entry(project_id, service)
        .ok()?
        .get_password()
        .ok()
        .filter(|value| !value.trim().is_empty())
}

#[tauri::command]
fn set_app_credential(
    project_id: String,
    service: String,
    secret: String,
) -> Result<CredentialStatus, String> {
    if project_id.trim().is_empty() || service.trim().is_empty() {
        return Err("Credential project and service are required.".to_string());
    }
    let entry = credential_entry(&project_id, &service)?;
    if secret.trim().is_empty() {
        let _ = entry.delete_credential();
        return Ok(CredentialStatus { configured: false });
    }
    entry
        .set_password(secret.trim())
        .map_err(|error| format!("Cannot save credential: {error}"))?;
    Ok(CredentialStatus { configured: true })
}

#[tauri::command]
fn get_app_credential_status(project_id: String, service: String) -> CredentialStatus {
    CredentialStatus {
        configured: read_app_credential(&project_id, &service).is_some(),
    }
}

#[tauri::command]
fn delete_app_credential(project_id: String, service: String) -> Result<CredentialStatus, String> {
    let entry = credential_entry(&project_id, &service)?;
    let _ = entry.delete_credential();
    Ok(CredentialStatus { configured: false })
}

fn ai_chat_endpoint(base_url: &str) -> String {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.ends_with("/chat/completions") {
        normalized.to_string()
    } else if normalized.ends_with("/v1") {
        format!("{normalized}/chat/completions")
    } else {
        format!("{normalized}/v1/chat/completions")
    }
}

#[tauri::command]
async fn ai_chat(
    state: tauri::State<'_, AiTaskRegistry>,
    input: AiChatInput,
) -> Result<AiChatResult, String> {
    if input.messages.is_empty() {
        return Err("AI messages are required.".to_string());
    }
    let permit = state.try_acquire(input.task_key.clone())?;
    let mut cancel_rx = permit.cancel_rx.clone();
    let _permit = permit;
    let service = format!("ai-{}", input.provider.trim().to_lowercase());
    let api_key = read_app_credential(&input.project_id, &service)
        .or_else(|| {
            if input.use_env_key && input.provider.eq_ignore_ascii_case("deepseek") {
                std::env::var("DEEPSEEK_API_KEY").ok()
            } else {
                None
            }
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "缺少安全凭据。请在设置页重新保存 API Key。".to_string())?;
    let base_url = if input.provider.eq_ignore_ascii_case("deepseek") {
        std::env::var("DEEPSEEK_BASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(input.base_url)
    } else {
        input.base_url
    };
    let model = if input.provider.eq_ignore_ascii_case("deepseek") {
        std::env::var("DEEPSEEK_MODEL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(input.model)
    } else {
        input.model
    };
    let total_seconds = if input.mode == "deep" || input.mode == "revised" {
        180
    } else {
        90
    };
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("Cannot initialize AI client: {error}"))?;
    let endpoint = ai_chat_endpoint(&base_url);
    let started = Instant::now();
    let request = async {
        let mut last_error = String::new();
        for attempt in 0..2usize {
            let response = tokio::select! {
                changed = cancel_rx.changed() => {
                    if changed.is_ok() && *cancel_rx.borrow() { return Err("AI_TASK_CANCELLED".to_string()); }
                    continue;
                }
                result = client.post(&endpoint)
                    .bearer_auth(&api_key)
                    .json(&serde_json::json!({ "model": model, "messages": input.messages, "temperature": input.temperature }))
                    .send() => result,
            };
            match response {
                Ok(response) => {
                    let status = response.status();
                    let payload = tokio::select! {
                        changed = cancel_rx.changed() => {
                            if changed.is_ok() && *cancel_rx.borrow() {
                                return Err("AI_TASK_CANCELLED".to_string());
                            }
                            return Err("AI_TASK_CANCELLED".to_string());
                        }
                        result = response.json::<serde_json::Value>() => result.unwrap_or_else(|_| serde_json::json!({})),
                    };
                    if !status.is_success() {
                        last_error = payload
                            .pointer("/error/message")
                            .and_then(|value| value.as_str())
                            .unwrap_or("AI service returned an error.")
                            .to_string();
                        if attempt == 0 && (status.as_u16() == 429 || status.is_server_error()) {
                            continue;
                        }
                        return Err(format!("{last_error} (HTTP {})", status.as_u16()));
                    }
                    let content = payload
                        .pointer("/choices/0/message/content")
                        .and_then(|value| value.as_str())
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| "AI 返回为空。".to_string())?;
                    return Ok(AiChatResult {
                        content: content.to_string(),
                        retry_count: attempt,
                        elapsed_ms: started.elapsed().as_millis(),
                    });
                }
                Err(error) => {
                    last_error = if error.is_timeout() {
                        "AI 请求超时。".to_string()
                    } else {
                        format!("AI 网络请求失败：{error}")
                    };
                    if attempt == 0
                        && (error.is_timeout() || error.is_connect() || error.is_request())
                    {
                        continue;
                    }
                    return Err(last_error);
                }
            }
        }
        Err(last_error)
    };
    match tokio::time::timeout(Duration::from_secs(total_seconds), request).await {
        Ok(result) => result,
        Err(_) => Err(format!("AI 请求超过 {total_seconds} 秒总超时。")),
    }
}

#[tauri::command]
fn cancel_ai_task(
    state: tauri::State<'_, AiTaskRegistry>,
    task_key: String,
) -> Result<bool, String> {
    state.cancel(&task_key)
}

#[tauri::command]
fn read_markdown_exports() -> Result<Vec<MarkdownExport>, String> {
    let root = find_project_root().ok_or_else(|| "Cannot locate project root.".to_string())?;
    let export_dir = root.join("data").join("exports");
    let mut rows = Vec::new();

    if !export_dir.exists() {
        return Ok(rows);
    }

    for entry in fs::read_dir(&export_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_lowercase()
            != "md"
        {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("Cannot read {:?}: {error}", path))?;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("imported.md")
            .to_string();
        rows.push(MarkdownExport {
            file_name,
            path: path.to_string_lossy().to_string(),
            content,
        });
    }

    rows.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(rows)
}

#[tauri::command]
fn run_cleaner_worker(
    papers: serde_json::Value,
    temp_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    if !papers.is_array() {
        return Err("Cleaner input must be a paper array.".into());
    }
    run_worker_task("clean", papers, temp_dir)
}

#[tauri::command]
fn run_cluster_worker(
    papers: serde_json::Value,
    temp_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    if !papers.is_array() {
        return Err("Cluster input must be a paper array.".into());
    }
    run_worker_task("cluster", papers, temp_dir)
}

#[tauri::command]
fn run_health_check(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    worker_temp_dir: Option<String>,
    export_dir: Option<String>,
    backup_dir: Option<String>,
) -> HealthCheckResult {
    let python = resolve_python();
    let worker = find_worker_script("task_worker.py");
    let mut errors = Vec::new();

    let (database_dir_value, database_path_value, database_dir_writable) =
        match resolve_database_dir(&app, database_dir) {
            Ok(path) => {
                let writable = check_writable_dir(&path, "database", &mut errors);
                let database_path = path.join("research-hotspots-v7.sqlite");
                (
                    Some(path.to_string_lossy().to_string()),
                    Some(database_path.to_string_lossy().to_string()),
                    writable,
                )
            }
            Err(error) => {
                errors.push(error);
                (None, None, false)
            }
        };

    let temp_dir = worker_temp_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let temp_dir_writable = check_writable_dir(&temp_dir, "temp", &mut errors);

    let export_dir_writable = export_dir
        .filter(|value| !value.trim().is_empty())
        .map(|value| check_writable_dir(&PathBuf::from(value), "export", &mut errors));
    let backup_dir_writable = backup_dir
        .filter(|value| !value.trim().is_empty())
        .map(|value| check_writable_dir(&PathBuf::from(value), "backup", &mut errors));

    let mut worker_ok = false;
    if worker.is_none() {
        errors.push("Cannot locate workers/task_worker.py.".to_string());
    } else {
        match Command::new(&python).arg("--version").output() {
            Ok(output) if output.status.success() => {
                worker_ok = true;
            }
            Ok(output) => {
                errors.push(format!(
                    "Python version check failed: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
            Err(error) => {
                errors.push(format!("Cannot start Python: {error}"));
            }
        }
    }

    HealthCheckResult {
        python_path: python.to_string_lossy().to_string(),
        task_worker_found: worker.is_some(),
        worker_ok,
        database_dir: database_dir_value,
        database_path: database_path_value,
        database_dir_writable,
        temp_dir_writable,
        export_dir_writable,
        backup_dir_writable,
        errors,
    }
}

#[tauri::command]
fn search_cnki_papers(input: CnkiSearchInput) -> Result<CnkiSearchOutput, String> {
    let worker = find_worker_script("cnki_worker.py")
        .ok_or_else(|| "Cannot locate workers/cnki_worker.py.".to_string())?;
    let base_dir = std::env::temp_dir().join("research-hotspots-cnki");
    fs::create_dir_all(&base_dir)
        .map_err(|error| format!("Cannot create CNKI temp dir: {error}"))?;

    let input_path = base_dir.join(format!(
        "cnki_search_{}_{}.json",
        std::process::id(),
        now_millis()
    ));
    fs::write(
        &input_path,
        serde_json::to_string(&input).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Cannot write CNKI worker input: {error}"))?;

    let started = Instant::now();
    let output = hidden_python_command()
        .arg(&worker)
        .arg(&input_path)
        .output()
        .map_err(|error| format!("Failed to start CNKI worker: {error}"))?;
    let _ = fs::remove_file(&input_path);

    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "CNKI worker failed: {}{}",
            stderr.trim(),
            if stdout.trim().is_empty() {
                ""
            } else {
                " / stdout contains JSON or logs"
            }
        ));
    }

    let mut result: CnkiSearchOutput = serde_json::from_slice(&output.stdout).map_err(|error| {
        format!(
            "Cannot parse CNKI worker output: {error}; stderr={}",
            stderr.trim()
        )
    })?;
    if result.elapsed_ms == 0 {
        result.elapsed_ms = started.elapsed().as_millis();
    }
    Ok(result)
}

#[tauri::command]
fn sync_app17_galaxy_from_mysql(
    app: tauri::AppHandle,
    input: App17GalaxySyncInput,
) -> Result<App17GalaxySyncResult, String> {
    let started = Instant::now();
    let worker_output = run_app17_galaxy_worker(&input)?;
    if !worker_output.ok {
        return Err(worker_output
            .message
            .unwrap_or_else(|| "App17 galaxy MySQL worker failed.".to_string()));
    }
    let (mut conn, database_dir, database_path) =
        open_library_database(&app, input.database_dir.clone())?;
    let project_id = input.project_id.clone().unwrap_or_else(default_project_id);
    write_app17_galaxy_snapshot(&mut conn, &project_id, &worker_output)?;
    let elapsed_ms = if worker_output.elapsed_ms > 0 {
        worker_output.elapsed_ms
    } else {
        started.elapsed().as_millis()
    };
    Ok(App17GalaxySyncResult {
        database_dir: database_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        project_id,
        paper_topic_count: worker_output.paper_topics.len(),
        hotspot_count: worker_output.hotspots.len(),
        hotspot_review_count: worker_output.hotspot_reviews.len(),
        elapsed_ms,
        summary: format!(
            "App17 galaxy snapshot synced: {} paper coordinates, {} hotspots, {} reviews.",
            worker_output.paper_topics.len(),
            worker_output.hotspots.len(),
            worker_output.hotspot_reviews.len()
        ),
    })
}

#[tauri::command]
fn get_app17_galaxy_payload(
    app: tauri::AppHandle,
    input: App17GalaxyPayloadInput,
) -> Result<App17GalaxyPayload, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let mode = input.mode.unwrap_or_else(|| "nebula".to_string());
    build_app17_galaxy_payload(&conn, &project_id, &mode)
}

#[tauri::command]
fn get_v20_analysis_state(
    app: tauri::AppHandle,
    input: App17GalaxyPayloadInput,
) -> Result<Option<AnalysisState>, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    read_analysis_state(&conn, &project_id)
}

#[tauri::command]
fn get_v20_hotspot_snapshot(
    app: tauri::AppHandle,
    input: App17GalaxyPayloadInput,
) -> Result<V20HotspotSnapshot, String> {
    let (conn, _, database_path) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let database_key = normalized_database_key(&database_path);
    let current_library_revision = current_library_revision(&conn, &project_id)?;
    let Some(rows) = read_unified_hotspot_rows(&conn, &project_id)? else {
        return Ok(V20HotspotSnapshot {
            database_key,
            project_id,
            active_snapshot_id: String::new(),
            snapshot_id: None,
            algorithm_version: V20_ALGORITHM_VERSION.to_string(),
            layout_version: String::new(),
            projection_version: String::new(),
            embedding_model_id: String::new(),
            embedding_model_revision: String::new(),
            hotspot_identity_version: String::new(),
            paper_count: 0,
            hotspot_count: 0,
            membership_count: 0,
            generated_at: now_millis_string(),
            library_revision: current_library_revision,
            current_library_revision,
            hotspots: Vec::new(),
        });
    };
    let hotspots = rows
        .hotspots
        .iter()
        .map(|row| {
            serde_json::from_str::<HotspotRecord>(&row.payload_json)
                .map_err(|error| format!("Invalid V20 hotspot payload {}: {error}", row.hotspot_id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(V20HotspotSnapshot {
        database_key,
        project_id,
        active_snapshot_id: rows.state.active_snapshot_id.clone(),
        snapshot_id: Some(rows.state.active_snapshot_id),
        algorithm_version: rows.state.algorithm_version,
        layout_version: rows.state.layout_version,
        projection_version: rows.state.projection_version,
        embedding_model_id: rows.state.embedding_model_id,
        embedding_model_revision: rows.state.embedding_model_revision,
        hotspot_identity_version: rows.state.hotspot_identity_version,
        paper_count: rows.state.paper_count,
        hotspot_count: rows.state.hotspot_count,
        membership_count: rows.state.membership_count,
        generated_at: rows.state.generated_at,
        library_revision: rows.state.library_revision,
        current_library_revision,
        hotspots,
    })
}

#[tauri::command]
fn get_v20_galaxy_payload(
    app: tauri::AppHandle,
    input: App17GalaxyPayloadInput,
) -> Result<V20GalaxyPayload, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let mode = input.mode.unwrap_or_else(|| "nebula".to_string());
    build_v20_galaxy_payload(&conn, &project_id, &mode)
}

fn build_v20_galaxy_payload(
    conn: &Connection,
    project_id: &str,
    mode: &str,
) -> Result<V20GalaxyPayload, String> {
    let Some(rows) = read_unified_galaxy_rows(conn, project_id)? else {
        return Ok(V20GalaxyPayload {
            ready: false,
            message: "需要生成统一星图快照。请前往分析流水线显式运行热点建模。".to_string(),
            source: "none".to_string(),
            mode: mode.to_string(),
            generated_at: now_millis_string(),
            snapshot_id: None,
            paper_layout_version: None,
            paper_layout_local_p95_radius: None,
            paper_layout_shared_scale: None,
            embedding_model_id: None,
            embedding_model_revision: None,
            projection_version: None,
            hotspot_identity_version: None,
            paper_count: 0,
            hotspot_count: 0,
            topic_count: 0,
            fields: Vec::new(),
            papers: Vec::new(),
            hotspots: Vec::new(),
            hotspot_records: Vec::new(),
        });
    };
    let snapshot_is_current = rows.state.algorithm_version == V20_ALGORITHM_VERSION
        && rows.state.layout_version == SEMANTIC_LAYOUT_VERSION
        && rows.state.projection_version == SEMANTIC_PROJECTION_VERSION
        && rows.state.embedding_model_id == SEMANTIC_MODEL_ID
        && rows.state.embedding_model_revision == SEMANTIC_MODEL_REVISION
        && rows.state.hotspot_identity_version == HOTSPOT_IDENTITY_VERSION;
    if !snapshot_is_current {
        return Ok(V20GalaxyPayload {
            ready: false,
            message: "当前活动快照仍使用旧版论文坐标。请前往分析流水线显式重新运行热点建模；程序不会自动建模或展示旧螺旋布局。".to_string(),
            source: "v20-sqlite".to_string(),
            mode: mode.to_string(),
            generated_at: rows.state.generated_at.clone(),
            snapshot_id: Some(rows.state.active_snapshot_id),
            paper_layout_version: None,
            paper_layout_local_p95_radius: None,
            paper_layout_shared_scale: None,
            embedding_model_id: None,
            embedding_model_revision: None,
            projection_version: None,
            hotspot_identity_version: None,
            paper_count: rows.state.paper_count.max(0) as usize,
            hotspot_count: rows.state.hotspot_count.max(0) as usize,
            topic_count: 0,
            fields: Vec::new(),
            papers: Vec::new(),
            hotspots: Vec::new(),
            hotspot_records: Vec::new(),
        });
    }
    let hotspot_records = rows
        .hotspots
        .iter()
        .map(|row| {
            serde_json::from_str::<HotspotRecord>(&row.payload_json)
                .map_err(|error| format!("Invalid V20 hotspot payload {}: {error}", row.hotspot_id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let hotspot_by_id = hotspot_records
        .iter()
        .map(|hotspot| (hotspot.id.as_str(), hotspot))
        .collect::<HashMap<_, _>>();
    let mut years = HashMap::new();
    let mut year_stmt = conn
        .prepare("SELECT id, year FROM papers WHERE project_id = ?1")
        .map_err(|error| error.to_string())?;
    for row in year_stmt
        .query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|error| error.to_string())?
    {
        let (id, year) = row.map_err(|error| error.to_string())?;
        years.insert(id, year);
    }
    let papers = rows
        .memberships
        .iter()
        .filter_map(|membership| {
            let hotspot = hotspot_by_id.get(membership.hotspot_id.as_str())?;
            Some(App17GalaxyPaperPoint {
                raw_paper_id: membership.paper_id.clone(),
                scoped_paper_id: scoped_id(project_id, &membership.paper_id),
                field: hotspot.field.clone(),
                topic_id: hotspot.topic_id,
                x: membership.x,
                y: membership.y,
                z: membership.z,
                year: years.get(&membership.paper_id).copied().flatten(),
                color: app17_topic_color(&hotspot.field, hotspot.topic_id),
                size: if membership
                    .representative_rank
                    .is_some_and(|rank| rank <= 10)
                {
                    3.6
                } else {
                    2.5
                },
            })
        })
        .collect::<Vec<_>>();
    let hotspots = hotspot_records
        .iter()
        .enumerate()
        .map(|(index, hotspot)| App17GalaxyHotspotPoint {
            id: hotspot.id.clone(),
            field: hotspot.field.clone(),
            topic_id: hotspot.topic_id,
            title: hotspot.title.clone(),
            label: hotspot.label.clone(),
            summary: hotspot.summary.clone(),
            trend: hotspot.trend.clone(),
            paper_count: hotspot.paper_count,
            x: hotspot.coordinates.x as f64,
            y: hotspot.coordinates.y as f64,
            z: hotspot.coordinates.z as f64,
            color: app17_palette_color(index),
            size: (10.0 + (hotspot.paper_count as f64).sqrt() * 0.7).clamp(10.0, 26.0),
            keywords: hotspot.keywords.clone(),
            review: None,
        })
        .collect::<Vec<_>>();
    let mut fields = hotspot_records
        .iter()
        .map(|hotspot| hotspot.field.clone())
        .collect::<Vec<_>>();
    fields.sort();
    fields.dedup();
    Ok(V20GalaxyPayload {
        ready: !papers.is_empty() && !hotspots.is_empty(),
        message: format!(
            "已加载统一 V20 快照：{} 篇论文、{} 个热点。",
            papers.len(),
            hotspots.len()
        ),
        source: "v20-sqlite".to_string(),
        mode: mode.to_string(),
        generated_at: rows.state.generated_at.clone(),
        snapshot_id: Some(rows.state.active_snapshot_id),
        paper_layout_version: Some(rows.state.layout_version),
        paper_layout_local_p95_radius: Some(SEMANTIC_LOCAL_P95_RADIUS),
        paper_layout_shared_scale: Some(1.0),
        embedding_model_id: Some(rows.state.embedding_model_id),
        embedding_model_revision: Some(rows.state.embedding_model_revision),
        projection_version: Some(rows.state.projection_version),
        hotspot_identity_version: Some(rows.state.hotspot_identity_version),
        paper_count: papers.len(),
        hotspot_count: hotspots.len(),
        topic_count: hotspots.len(),
        fields,
        papers,
        hotspots,
        hotspot_records,
    })
}

#[cfg(feature = "dev-tools")]
pub fn audit_galaxy_semantic_layout_database(root: &Path) -> Result<serde_json::Value, String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let database = root.join("semantic-layout-audit.sqlite");
    research_hotspots_core::cleanup_sqlite_artifacts(&database);
    let conn = Connection::open(&database).map_err(|error| error.to_string())?;
    initialize_library_database(&conn)?;
    let timestamp = now_millis_string();
    const AUDIT_FIELDS: [(&str, &str); 8] = [
        ("Quantum Physics", "quantum"),
        ("Molecular Biology", "protein"),
        ("Climate Science", "climate"),
        ("Medical Imaging", "imaging"),
        ("Robotics", "robotics"),
        ("Materials Science", "materials"),
        ("Economics", "economics"),
        ("Astronomy", "astronomy"),
    ];
    for index in 0..512 {
        let (field, dominant) = AUDIT_FIELDS[index / 64];
        let axis_a = "representation ".repeat((index % 7) + 1);
        let axis_b = "evidence ".repeat(((index * 3) % 7) + 1);
        let axis_c = "forecast ".repeat(((index * 5) % 7) + 1);
        let dominant = format!("{dominant} ").repeat(12);
        let abstract_text = format!(
            "Semantic benchmark {index}. {dominant} {axis_a} {axis_b} {axis_c} \
             deterministic structure, local variation, and interpretable evidence."
        );
        conn.execute(
            "INSERT INTO papers(
               id,project_id,source,title,abstract,authors,categories,field,published_date,year,
               url,doi,created_at,updated_at,search_blob
             ) VALUES(?1,'project-default','audit',?2,?3,'Audit Author',
               'semantic; representation',?4,'2026',2026,NULL,NULL,?5,?5,?6)",
            params![
                format!("semantic-audit-{index:03}"),
                format!("{field} semantic study {index:03}"),
                abstract_text,
                field,
                timestamp,
                format!("{field} semantic study {index:03} {dominant} {axis_a} {axis_b} {axis_c}")
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    let result = cluster_library_connection(&conn, "project-default")?;
    let state = read_analysis_state(&conn, "project-default")?
        .ok_or_else(|| "SEMANTIC_LAYOUT_AUDIT_SNAPSHOT_MISSING".to_string())?;
    let first_snapshot_id = state.active_snapshot_id.clone();
    let hotspot_coordinates = conn
        .prepare(
            "SELECT hotspot_id,x,y,z FROM v20_hotspots
             WHERE snapshot_id=?1 ORDER BY hotspot_id",
        )
        .map_err(|error| error.to_string())?
        .query_map(params![first_snapshot_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let cache_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM paper_semantic_embeddings WHERE project_id='project-default'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let largest_hotspot: String = conn
        .query_row(
            "SELECT hotspot_id FROM v20_paper_memberships
             WHERE snapshot_id=?1 GROUP BY hotspot_id ORDER BY COUNT(*) DESC LIMIT 1",
            params![first_snapshot_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let center: (f64, f64, f64) = conn
        .query_row(
            "SELECT x,y,z FROM v20_hotspots WHERE snapshot_id=?1 AND hotspot_id=?2",
            params![first_snapshot_id, largest_hotspot],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| error.to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT x-?3,y-?4,z-?5 FROM v20_paper_memberships
             WHERE snapshot_id=?1 AND hotspot_id=?2 ORDER BY paper_id",
        )
        .map_err(|error| error.to_string())?;
    let points = statement
        .query_map(
            params![
                state.active_snapshot_id,
                largest_hotspot,
                center.0,
                center.1,
                center.2
            ],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, f64>(1)?, row.get::<_, f64>(2)?)),
        )
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let first_coordinates = conn
        .prepare(
            "SELECT paper_id,x,y,z FROM v20_paper_memberships
             WHERE snapshot_id=?1 ORDER BY paper_id",
        )
        .map_err(|error| error.to_string())?
        .query_map(params![first_snapshot_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    std::thread::sleep(Duration::from_millis(2));
    let repeated = cluster_library_connection(&conn, "project-default")?;
    let repeated_state = read_analysis_state(&conn, "project-default")?
        .ok_or_else(|| "SEMANTIC_LAYOUT_AUDIT_REPEAT_SNAPSHOT_MISSING".to_string())?;
    let repeated_coordinates = conn
        .prepare(
            "SELECT paper_id,x,y,z FROM v20_paper_memberships
             WHERE snapshot_id=?1 ORDER BY paper_id",
        )
        .map_err(|error| error.to_string())?
        .query_map(params![repeated_state.active_snapshot_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let lineage_summary: (i64, f64) = conn
        .query_row(
            "SELECT COUNT(*),COALESCE(MIN(member_overlap),0)
             FROM v20_hotspot_lineage
             WHERE from_snapshot_id=?1 AND to_snapshot_id=?2",
            params![first_snapshot_id, repeated_state.active_snapshot_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let maximum_repeat_error = first_coordinates
        .iter()
        .zip(&repeated_coordinates)
        .map(|(left, right)| {
            if left.0 != right.0 {
                return f64::INFINITY;
            }
            (left.1 - right.1)
                .abs()
                .max((left.2 - right.2).abs())
                .max((left.3 - right.3).abs())
        })
        .fold(0.0_f64, f64::max);
    if repeated.membership_count != result.membership_count || maximum_repeat_error > 1e-6 {
        return Err(format!(
            "SEMANTIC_LAYOUT_AUDIT_REPEAT_MISMATCH:{maximum_repeat_error}"
        ));
    }
    let octants = points
        .iter()
        .map(|(x, y, z)| (*x >= 0.0, *y >= 0.0, *z >= 0.0))
        .collect::<HashSet<_>>()
        .len();
    let global_octants = hotspot_coordinates
        .iter()
        .map(|(_, x, y, z)| (*x >= 0.0, *y >= 0.0, *z >= 0.0))
        .collect::<HashSet<_>>()
        .len();
    let global_axes = [
        hotspot_coordinates.iter().map(|row| row.1).collect::<Vec<_>>(),
        hotspot_coordinates.iter().map(|row| row.2).collect::<Vec<_>>(),
        hotspot_coordinates.iter().map(|row| row.3).collect::<Vec<_>>(),
    ];
    let correlation = |left: &[f64], right: &[f64]| {
        let left_mean = left.iter().sum::<f64>() / left.len().max(1) as f64;
        let right_mean = right.iter().sum::<f64>() / right.len().max(1) as f64;
        let covariance = left
            .iter()
            .zip(right)
            .map(|(a, b)| (a - left_mean) * (b - right_mean))
            .sum::<f64>();
        let left_norm = left
            .iter()
            .map(|value| (value - left_mean).powi(2))
            .sum::<f64>();
        let right_norm = right
            .iter()
            .map(|value| (value - right_mean).powi(2))
            .sum::<f64>();
        covariance / (left_norm * right_norm).sqrt().max(1e-12)
    };
    let global_correlations = [
        correlation(&global_axes[0], &global_axes[1]).abs(),
        correlation(&global_axes[0], &global_axes[2]).abs(),
        correlation(&global_axes[1], &global_axes[2]).abs(),
    ];
    let global_spans = global_axes.clone().map(|axis| {
        let minimum = axis.iter().copied().fold(f64::INFINITY, f64::min);
        let maximum = axis.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        maximum - minimum
    });
    let global_span_ratio = global_spans.iter().copied().fold(f64::INFINITY, f64::min)
        / global_spans.iter().copied().fold(0.0_f64, f64::max).max(1e-12);
    if points.len() < 64
        || cache_count != 512
        || global_octants < 6
        || global_correlations.iter().any(|value| *value > 0.10)
        || global_span_ratio < 0.45
        || lineage_summary.0 != result.cluster_count as i64
        || lineage_summary.1 < 1.0 - 1e-12
    {
        return Err("SEMANTIC_LAYOUT_AUDIT_DISTRIBUTION_FAILED".into());
    }
    Ok(serde_json::json!({
        "pass": true,
        "paperCount": result.before_count,
        "hotspotCount": result.cluster_count,
        "membershipCount": result.membership_count,
        "embeddingCacheCount": cache_count,
        "largestHotspotPaperCount": points.len(),
        "occupiedOctants": octants,
        "globalHotspotOctants": global_octants,
        "globalHotspotCorrelations": global_correlations,
        "globalHotspotSpanRatio": global_span_ratio,
        "lineageCount": lineage_summary.0,
        "minimumLineageOverlap": lineage_summary.1,
        "maximumRepeatCoordinateError": maximum_repeat_error,
        "algorithmVersion": state.algorithm_version,
        "snapshotId": repeated_state.active_snapshot_id,
    }))
}

#[cfg(feature = "dev-tools")]
pub fn rebuild_semantic_galaxy_snapshot(
    database_dir: &Path,
    project_id: &str,
    device: &str,
) -> Result<serde_json::Value, String> {
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    if !database_path.is_file() {
        return Err(format!(
            "isolated semantic source database not found: {}",
            database_path.display()
        ));
    }
    migrate_library_file(
        &database_path,
        project_id,
        now_millis().min(i64::MAX as u128) as i64,
        true,
    )?;
    let source_before = research_hotspots_core::validate_library_candidate_file(
        &database_path,
        project_id,
    )?;
    let started = Instant::now();
    let result = cluster_library_from_database_path(
        database_path.clone(),
        project_id,
        semantic_embedding::SemanticEmbeddingDevice::parse(Some(device))?,
    )?;
    let validated = research_hotspots_core::validate_library_candidate_file(
        &database_path,
        project_id,
    )?;
    let conn = Connection::open_with_flags(&database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    let embedding_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM paper_semantic_embeddings
             WHERE project_id=?1 AND model_id=?2 AND model_revision=?3
               AND dimensions=?4 AND encoding='float16-le'",
            params![
                project_id,
                research_hotspots_core::semantic_layout::SEMANTIC_MODEL_ID,
                research_hotspots_core::semantic_layout::SEMANTIC_MODEL_REVISION,
                research_hotspots_core::semantic_layout::SEMANTIC_EMBEDDING_DIMENSIONS as i64,
            ],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let (
        algorithm_version,
        layout_version,
        projection_version,
        embedding_model_id,
        embedding_model_revision,
        hotspot_identity_version,
    ): (String, String, String, String, String, String) = conn
        .query_row(
            "SELECT algorithm_version,layout_version,projection_version,
                    embedding_model_id,embedding_model_revision,hotspot_identity_version
             FROM v20_analysis_snapshots
             WHERE project_id=?1 AND id=?2",
            params![project_id, result.snapshot_id],
            |row| Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            )),
        )
        .map_err(|error| error.to_string())?;
    if validated.paper_count != source_before.paper_count
        || validated.hotspot_count != 160
        || validated.membership_count != validated.paper_count
        || embedding_count != validated.paper_count
        || algorithm_version != research_hotspots_core::V20_ALGORITHM_VERSION
        || layout_version != SEMANTIC_LAYOUT_VERSION
        || projection_version != SEMANTIC_PROJECTION_VERSION
        || embedding_model_id != SEMANTIC_MODEL_ID
        || embedding_model_revision != SEMANTIC_MODEL_REVISION
        || hotspot_identity_version != HOTSPOT_IDENTITY_VERSION
    {
        return Err("SEMANTIC_RELEASE_SNAPSHOT_VALIDATION_FAILED".into());
    }
    Ok(serde_json::json!({
        "ok": true,
        "databasePath": database_path,
        "schemaVersion": validated.schema_version,
        "snapshotId": validated.snapshot_id,
        "algorithmVersion": algorithm_version,
        "layoutVersion": layout_version,
        "projectionVersion": projection_version,
        "hotspotIdentityVersion": hotspot_identity_version,
        "paperCount": validated.paper_count,
        "hotspotCount": validated.hotspot_count,
        "membershipCount": validated.membership_count,
        "embeddingCount": embedding_count,
        "elapsedMs": started.elapsed().as_millis(),
    }))
}

#[tauri::command]
async fn get_app17_hotspot_evidence(
    app: tauri::AppHandle,
    input: App17HotspotEvidenceInput,
) -> Result<HotspotEvidenceExportResult, String> {
    let database_dir = resolve_database_dir(&app, input.database_dir.clone())?;
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let field = input.field.trim().to_string();
    if field.is_empty() {
        return Err("App17 hotspot field is required.".to_string());
    }
    let max_papers = input.max_papers.unwrap_or(12).clamp(1, 50);

    tauri::async_runtime::spawn_blocking(move || {
        app17_hotspot_evidence_from_database_path(
            database_path,
            &project_id,
            &field,
            input.topic_id,
            max_papers,
        )
    })
    .await
    .map_err(|error| format!("App17 hotspot evidence task failed: {error}"))?
}

#[tauri::command]
async fn load_app17_galaxy(
    app: tauri::AppHandle,
    input: App17GalaxySyncInput,
) -> Result<App17GalaxyPayload, String> {
    tauri::async_runtime::spawn_blocking(move || load_app17_galaxy_blocking(&app, input))
        .await
        .map_err(|error| format!("App17 galaxy load task failed: {error}"))?
}

fn load_app17_galaxy_blocking(
    app: &tauri::AppHandle,
    input: App17GalaxySyncInput,
) -> Result<App17GalaxyPayload, String> {
    let project_id = input.project_id.clone().unwrap_or_else(default_project_id);
    let mode = input.mode.clone().unwrap_or_else(|| "nebula".to_string());
    let mysql_result = run_app17_galaxy_worker(&input);

    match mysql_result {
        Ok(worker_output) if worker_output.ok => {
            let (mut conn, _, _) = open_library_database(app, input.database_dir.clone())?;
            write_app17_galaxy_snapshot(&mut conn, &project_id, &worker_output)?;
            let mut payload = build_app17_galaxy_payload(&conn, &project_id, &mode)?;
            payload.source = "mysql".to_string();
            payload.message = format!(
                "Loaded App17 galaxy from local MySQL: {} paper coordinates, {} hotspots.",
                payload.paper_count, payload.hotspot_count
            );
            Ok(payload)
        }
        Ok(worker_output) => load_app17_galaxy_cache_after_mysql_error(
            app,
            input.database_dir.clone(),
            &project_id,
            &mode,
            worker_output
                .message
                .unwrap_or_else(|| "App17 MySQL worker returned an empty result.".to_string()),
        ),
        Err(error) => load_app17_galaxy_cache_after_mysql_error(
            app,
            input.database_dir.clone(),
            &project_id,
            &mode,
            error,
        ),
    }
}

fn load_app17_galaxy_cache_after_mysql_error(
    app: &tauri::AppHandle,
    database_dir: Option<String>,
    project_id: &str,
    mode: &str,
    mysql_error: String,
) -> Result<App17GalaxyPayload, String> {
    let (conn, _, _) = open_library_database(app, database_dir)?;
    let mut payload = build_app17_galaxy_payload(&conn, project_id, mode)?;
    if payload.ready {
        payload.source = "sqlite-cache".to_string();
        payload.message =
            format!("Using cached App17 galaxy because MySQL refresh failed: {mysql_error}");
    } else {
        payload.source = "none".to_string();
        payload.message = format!("Cannot load App17 galaxy from local MySQL and no SQLite cache is available: {mysql_error}");
    }
    Ok(payload)
}

fn run_app17_galaxy_worker(input: &App17GalaxySyncInput) -> Result<App17MysqlGalaxyOutput, String> {
    let worker = find_worker_script("app17_galaxy_worker.py")
        .ok_or_else(|| "Cannot locate workers/app17_galaxy_worker.py.".to_string())?;
    let worker_temp_dir = input
        .worker_temp_dir
        .clone()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    fs::create_dir_all(&worker_temp_dir).map_err(|error| {
        format!(
            "Cannot create app17 galaxy temp dir {:?}: {error}",
            worker_temp_dir
        )
    })?;
    let input_path = worker_temp_dir.join(format!(
        "app17_galaxy_sync_{}_{}.json",
        std::process::id(),
        now_millis()
    ));
    fs::write(
        &input_path,
        serde_json::to_string(input).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Cannot write app17 galaxy worker input: {error}"))?;

    let output = hidden_python_command()
        .arg(&worker)
        .arg(&input_path)
        .output()
        .map_err(|error| format!("Failed to start app17 galaxy worker: {error}"))?;
    let _ = fs::remove_file(&input_path);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        if let Ok(value) = serde_json::from_slice::<App17MysqlGalaxyOutput>(&output.stdout) {
            return Err(value
                .message
                .unwrap_or_else(|| "App17 galaxy worker failed.".to_string()));
        }
        return Err(format!(
            "App17 galaxy worker failed: {}{}",
            stderr.trim(),
            if stdout.trim().is_empty() {
                ""
            } else {
                " / stdout contained non-result output"
            }
        ));
    }
    serde_json::from_slice::<App17MysqlGalaxyOutput>(&output.stdout).map_err(|error| {
        format!(
            "Cannot parse app17 galaxy worker output: {error}; stderr={}",
            stderr.trim()
        )
    })
}

fn write_app17_galaxy_snapshot(
    conn: &mut Connection,
    project_id: &str,
    output: &App17MysqlGalaxyOutput,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM app17_paper_topics WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM app17_hotspots WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM app17_hotspot_reviews WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|error| error.to_string())?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO app17_paper_topics
                 (project_id, raw_paper_id, scoped_paper_id, field, topic_id, x, y, z, year)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )
            .map_err(|error| error.to_string())?;
        for row in &output.paper_topics {
            let scoped_paper_id = scoped_id(project_id, &row.raw_paper_id);
            stmt.execute(params![
                project_id,
                row.raw_paper_id,
                scoped_paper_id,
                row.field,
                row.topic_id,
                row.x,
                row.y,
                row.z,
                row.year
            ])
            .map_err(|error| error.to_string())?;
        }
    }

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO app17_hotspots
                 (project_id, field, topic_id, title_cn, topic_label, summary_cn, paper_count, trend_status, evolution_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )
            .map_err(|error| error.to_string())?;
        for row in &output.hotspots {
            stmt.execute(params![
                project_id,
                row.field,
                row.topic_id,
                row.title_cn,
                row.topic_label,
                row.summary_cn,
                row.paper_count,
                row.trend_status,
                row.evolution_json
            ])
            .map_err(|error| error.to_string())?;
        }
    }

    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO app17_hotspot_reviews
                 (project_id, field, topic_id, review_cn, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|error| error.to_string())?;
        for row in &output.hotspot_reviews {
            stmt.execute(params![
                project_id,
                row.field,
                row.topic_id,
                row.review_cn,
                row.created_at
            ])
            .map_err(|error| error.to_string())?;
        }
    }

    tx.commit().map_err(|error| error.to_string())
}

fn build_app17_galaxy_payload(
    conn: &Connection,
    project_id: &str,
    mode: &str,
) -> Result<App17GalaxyPayload, String> {
    let mut stmt = conn
        .prepare(
            "SELECT raw_paper_id, scoped_paper_id, field, topic_id, x, y, z, year
             FROM app17_paper_topics
             WHERE project_id = ?1
             ORDER BY field, topic_id, COALESCE(year, 0) DESC, raw_paper_id",
        )
        .map_err(|error| error.to_string())?;
    let raw_papers = stmt
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, Option<i64>>(7)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if raw_papers.is_empty() {
        return Ok(App17GalaxyPayload {
            ready: false,
            message: "App17 galaxy snapshot is empty. Sync from local MySQL first.".to_string(),
            source: "none".to_string(),
            mode: mode.to_string(),
            generated_at: now_millis_string(),
            paper_count: 0,
            hotspot_count: 0,
            topic_count: 0,
            fields: Vec::new(),
            papers: Vec::new(),
            hotspots: Vec::new(),
        });
    }

    let normalized = normalize_app17_coordinates(&raw_papers);
    let mut fields = raw_papers
        .iter()
        .map(|row| row.2.clone())
        .collect::<Vec<_>>();
    fields.sort();
    fields.dedup();

    let current_year = 2026i64;
    let mut topic_members: HashMap<(String, i64), Vec<(f64, f64, f64)>> = HashMap::new();
    let papers = raw_papers
        .iter()
        .zip(normalized.iter())
        .map(|(row, &(x, y, z))| {
            let key = (row.2.clone(), row.3);
            topic_members
                .entry(key.clone())
                .or_default()
                .push((x, y, z));
            let color = app17_topic_color(&key.0, key.1);
            let recency = row.7.map(|year| (current_year - year).max(0)).unwrap_or(99);
            let size = if recency >= 8 {
                2.2
            } else if recency >= 4 {
                2.8
            } else {
                3.4
            };
            App17GalaxyPaperPoint {
                raw_paper_id: row.0.clone(),
                scoped_paper_id: row.1.clone(),
                field: row.2.clone(),
                topic_id: row.3,
                x,
                y,
                z,
                year: row.7,
                color,
                size,
            }
        })
        .collect::<Vec<_>>();

    let reviews = read_app17_latest_reviews(conn, project_id)?;
    let mut hotspots_stmt = conn
        .prepare(
            "SELECT field, topic_id, title_cn, topic_label, summary_cn, paper_count, trend_status
             FROM app17_hotspots
             WHERE project_id = ?1
             ORDER BY COALESCE(paper_count, 0) DESC, field, topic_id",
        )
        .map_err(|error| error.to_string())?;
    let hotspot_rows = hotspots_stmt
        .query_map(params![project_id], |row| {
            Ok(App17MysqlHotspot {
                field: row.get(0)?,
                topic_id: row.get(1)?,
                title_cn: row.get(2)?,
                topic_label: row.get(3)?,
                summary_cn: row.get(4)?,
                paper_count: row.get(5)?,
                trend_status: row.get(6)?,
                evolution_json: None,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut hotspots = Vec::new();
    for (index, row) in hotspot_rows.iter().enumerate() {
        let key = (row.field.clone(), row.topic_id);
        let Some(members) = topic_members.get(&key) else {
            continue;
        };
        if members.is_empty() {
            continue;
        }
        let (sum_x, sum_y, sum_z) = members.iter().fold((0.0, 0.0, 0.0), |acc, value| {
            (acc.0 + value.0, acc.1 + value.1, acc.2 + value.2)
        });
        let count = members.len() as f64;
        let paper_count = row.paper_count.unwrap_or(members.len() as i64).max(1);
        let label = row
            .topic_label
            .clone()
            .unwrap_or_else(|| format!("{}_{}", row.field, row.topic_id));
        let title = row
            .title_cn
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| row.topic_label.clone())
            .unwrap_or_else(|| format!("{} | Topic {}", row.field, row.topic_id));
        hotspots.push(App17GalaxyHotspotPoint {
            id: app17_hotspot_id(&row.field, row.topic_id),
            field: row.field.clone(),
            topic_id: row.topic_id,
            title,
            label: label.clone(),
            summary: row
                .summary_cn
                .clone()
                .unwrap_or_else(|| "App17 MySQL hotspot snapshot.".to_string()),
            trend: row
                .trend_status
                .clone()
                .unwrap_or_else(|| "Unknown".to_string()),
            paper_count,
            x: sum_x / count,
            y: sum_y / count,
            z: sum_z / count,
            color: app17_palette_color(index),
            size: (10.0 + (paper_count as f64).sqrt() * 0.7).clamp(10.0, 26.0),
            keywords: app17_keywords_from_label(&label),
            review: reviews.get(&key).cloned(),
        });
    }

    Ok(App17GalaxyPayload {
        ready: true,
        message: format!(
            "Loaded App17 galaxy snapshot: {} papers, {} hotspots.",
            papers.len(),
            hotspots.len()
        ),
        source: "sqlite-cache".to_string(),
        mode: mode.to_string(),
        generated_at: now_millis_string(),
        paper_count: papers.len(),
        hotspot_count: hotspots.len(),
        topic_count: topic_members.len(),
        fields,
        papers,
        hotspots,
    })
}

pub fn export_app17_visual_review_snapshot(
    database_path: PathBuf,
    project_id: Option<String>,
    output_dir: PathBuf,
) -> Result<App17VisualReviewExportSummary, String> {
    const SCHEMA_VERSION: u32 = 1;

    if !database_path.exists() || !database_path.is_file() {
        return Err(format!(
            "SQLite database does not exist: {}",
            database_path.display()
        ));
    }
    let database_path = database_path.canonicalize().map_err(|error| {
        format!(
            "Cannot resolve database path {}: {error}",
            database_path.display()
        )
    })?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let conn = Connection::open_with_flags(&database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| {
            format!(
                "Cannot open SQLite library {:?} in read-only mode: {error}",
                database_path
            )
        })?;
    let payload = build_v20_galaxy_payload(&conn, &project_id, "nebula")?;
    if !payload.ready || payload.hotspots.is_empty() {
        return Err(format!(
            "V20 semantic visual review snapshot is unavailable: {}",
            payload.message
        ));
    }

    fs::create_dir_all(&output_dir).map_err(|error| {
        format!(
            "Cannot create visual review directory {}: {error}",
            output_dir.display()
        )
    })?;
    let evidence_dir = output_dir.join("evidence");
    let papers_dir = output_dir.join("papers");
    if evidence_dir.exists() {
        fs::remove_dir_all(&evidence_dir)
            .map_err(|error| format!("Cannot clear {}: {error}", evidence_dir.display()))?;
    }
    if papers_dir.exists() {
        fs::remove_dir_all(&papers_dir)
            .map_err(|error| format!("Cannot clear {}: {error}", papers_dir.display()))?;
    }
    fs::create_dir_all(&evidence_dir)
        .map_err(|error| format!("Cannot create {}: {error}", evidence_dir.display()))?;
    fs::create_dir_all(&papers_dir)
        .map_err(|error| format!("Cannot create {}: {error}", papers_dir.display()))?;

    let mut hotspot_indexes = (0..payload.hotspots.len()).collect::<Vec<_>>();
    hotspot_indexes.sort_by(|left, right| {
        payload.hotspots[*left]
            .field
            .cmp(&payload.hotspots[*right].field)
            .then_with(|| {
                payload.hotspots[*left]
                    .topic_id
                    .cmp(&payload.hotspots[*right].topic_id)
            })
    });

    let mut topics = Vec::with_capacity(hotspot_indexes.len());
    for (stable_index, hotspot_index) in hotspot_indexes.into_iter().enumerate() {
        let hotspot = &payload.hotspots[hotspot_index];
        let file_id = format!("topic-{:04}", stable_index + 1);
        let hotspot_record = payload
            .hotspot_records
            .iter()
            .find(|record| record.id == hotspot.id)
            .ok_or_else(|| {
                format!(
                    "V20 semantic visual review hotspot record is missing: {}",
                    hotspot.id
                )
            })?;
        let mut evidence = build_v20_visual_review_evidence(
            &conn,
            &database_path,
            &project_id,
            hotspot_record,
            &payload.hotspot_records,
            10,
        )?;
        evidence.database_path = "snapshot://v20-semantic".to_string();
        let papers =
            query_v20_visual_review_hotspot_papers(&conn, &project_id, &hotspot.id)?;
        write_visual_review_json(&evidence_dir.join(format!("{file_id}.json")), &evidence)?;
        write_visual_review_json(&papers_dir.join(format!("{file_id}.json")), &papers)?;
        topics.push(App17VisualReviewTopicEntry {
            key: format!("{}::{}", hotspot.field, hotspot.topic_id),
            file_id: file_id.clone(),
            field: hotspot.field.clone(),
            topic_id: hotspot.topic_id,
            hotspot_id: hotspot.id.clone(),
            title: hotspot.title.clone(),
            paper_count: hotspot.paper_count,
            evidence_path: format!("evidence/{file_id}.json"),
            papers_path: format!("papers/{file_id}.json"),
        });
    }

    let database_metadata = fs::metadata(&database_path).map_err(|error| {
        format!(
            "Cannot read SQLite metadata {}: {error}",
            database_path.display()
        )
    })?;
    let database_modified_ms = database_metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis())
        .unwrap_or_default();
    let generated_at = format!("unix-ms:{}", now_millis());
    let manifest = App17VisualReviewManifest {
        schema_version: SCHEMA_VERSION,
        generated_at: generated_at.clone(),
        database_modified_ms,
        database_size_bytes: database_metadata.len(),
        project_id: project_id.clone(),
        payload_path: "payload.json".to_string(),
        paper_count: payload.paper_count,
        hotspot_count: payload.hotspot_count,
        topic_count: topics.len(),
        topics,
    };
    write_visual_review_json(&output_dir.join("payload.json"), &payload)?;
    write_visual_review_json(&output_dir.join("manifest.json"), &manifest)?;

    Ok(App17VisualReviewExportSummary {
        schema_version: SCHEMA_VERSION,
        generated_at,
        database_path: database_path.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        project_id,
        paper_count: payload.paper_count,
        hotspot_count: payload.hotspot_count,
        topic_count: manifest.topic_count,
    })
}

fn query_v20_visual_review_hotspot_papers(
    conn: &Connection,
    project_id: &str,
    hotspot_id: &str,
) -> Result<Vec<PaperRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.project_id, p.source, p.title, p.abstract, p.authors, p.categories,
                    p.field, p.published_date, p.year, p.url, p.doi, p.created_at, p.updated_at
             FROM v20_analysis_state AS state
             JOIN v20_paper_memberships AS membership
               ON membership.project_id = state.project_id
              AND membership.snapshot_id = state.active_snapshot_id
             JOIN papers AS p
               ON p.project_id = membership.project_id
              AND p.id = membership.paper_id
             WHERE state.project_id = ?1 AND membership.hotspot_id = ?2
             ORDER BY CASE WHEN membership.representative_rank IS NULL THEN 1 ELSE 0 END,
                      membership.representative_rank ASC,
                      p.id ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![project_id, hotspot_id], row_to_paper)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn build_v20_visual_review_evidence(
    conn: &Connection,
    database_path: &Path,
    project_id: &str,
    selected: &HotspotRecord,
    hotspots: &[HotspotRecord],
    max_papers: usize,
) -> Result<HotspotEvidenceExportResult, String> {
    let mut representative_ids = Vec::new();
    let mut seen = HashSet::new();
    for id in &selected.analysis.evidence_paper_ids {
        if seen.insert(id.clone()) {
            representative_ids.push(id.clone());
        }
    }
    for evolution in &selected.evolution {
        for id in &evolution.representative_ids {
            if seen.insert(id.clone()) {
                representative_ids.push(id.clone());
            }
        }
    }
    representative_ids.truncate(max_papers.max(1));

    let representative_papers =
        query_paper_snapshots_by_ids(conn, project_id, &representative_ids)?;
    let found_ids = representative_papers
        .iter()
        .map(|paper| paper.id.clone())
        .collect::<HashSet<_>>();
    let missing_representative_ids = representative_ids
        .iter()
        .filter(|id| !found_ids.contains(*id))
        .cloned()
        .collect::<Vec<_>>();
    let similar_hotspots = selected
        .similar_hotspots
        .iter()
        .filter_map(|relation| {
            hotspots
                .iter()
                .find(|hotspot| hotspot.id == relation.hotspot_id)
                .map(|hotspot| EvidenceSimilarHotspot {
                    hotspot_id: relation.hotspot_id.clone(),
                    title: hotspot.title.clone(),
                    field: hotspot.field.clone(),
                    score: relation.score,
                })
        })
        .collect::<Vec<_>>();
    let year_evolution = selected
        .evolution
        .iter()
        .map(|item| EvidenceYearEvolution {
            year: item.year,
            count: item.count,
            keywords: item.keywords.clone(),
            representative_ids: item.representative_ids.clone(),
        })
        .collect::<Vec<_>>();
    let source_distribution = selected
        .source_distribution
        .iter()
        .map(|item| EvidenceCountFacet {
            value: item.value.clone(),
            count: item.count,
        })
        .collect::<Vec<_>>();
    let evidence_profile_markdown =
        build_hotspot_evidence_markdown(selected, &representative_papers);

    Ok(HotspotEvidenceExportResult {
        generated_at: format!("unix-ms:{}", now_millis()),
        database_path: database_path.to_string_lossy().to_string(),
        project_id: project_id.to_string(),
        selected_hotspot_id: selected.id.clone(),
        selected_hotspot_title: selected.title.clone(),
        selected_hotspot_field: selected.field.clone(),
        hotspot_paper_count: selected.paper_count,
        hotspot_keywords: selected.keywords.clone(),
        hotspot_trend: selected.trend.clone(),
        hotspot_confidence: selected.confidence,
        representative_ids,
        missing_representative_ids,
        representative_papers,
        year_evolution,
        source_distribution,
        similar_hotspots,
        evidence_profile_markdown,
    })
}

fn write_visual_review_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, format!("{json}\n"))
        .map_err(|error| format!("Cannot write {}: {error}", path.display()))
}

fn app17_hotspot_evidence_from_database_path(
    database_path: PathBuf,
    project_id: &str,
    field: &str,
    topic_id: i64,
    max_papers: usize,
) -> Result<HotspotEvidenceExportResult, String> {
    if !database_path.exists() || !database_path.is_file() {
        return Err(format!(
            "SQLite database does not exist: {}",
            database_path.display()
        ));
    }
    let conn = Connection::open_with_flags(&database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    query_app17_hotspot_evidence(
        &conn,
        &database_path,
        project_id,
        field,
        topic_id,
        max_papers,
    )
}

fn query_app17_hotspot_evidence(
    conn: &Connection,
    database_path: &Path,
    project_id: &str,
    field: &str,
    topic_id: i64,
    max_papers: usize,
) -> Result<HotspotEvidenceExportResult, String> {
    let hotspot = conn
        .query_row(
            "SELECT title_cn, topic_label, summary_cn, paper_count, trend_status
             FROM app17_hotspots
             WHERE project_id = ?1 AND field = ?2 AND topic_id = ?3",
            params![project_id, field, topic_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("App17 hotspot was not found: {field} / topic {topic_id}"))?;

    let topic_member_count = conn
        .query_row(
            "SELECT COUNT(*) FROM app17_paper_topics
             WHERE project_id = ?1 AND field = ?2 AND topic_id = ?3",
            params![project_id, field, topic_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;
    if topic_member_count == 0 {
        return Err(format!(
            "App17 hotspot has no paper coordinates: {field} / topic {topic_id}"
        ));
    }

    let label = hotspot
        .1
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{field}_{topic_id}"));
    let title = hotspot
        .0
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| label.clone());
    let summary = hotspot
        .2
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "App17 hotspot snapshot.".to_string());
    let paper_count = hotspot.3.unwrap_or(topic_member_count).max(1);
    let trend = hotspot.4.clone().unwrap_or_else(|| "Unknown".to_string());
    let keywords = app17_keywords_from_label(&label);

    let mut representative_stmt = conn
        .prepare(
            "SELECT p.id, p.source, p.title, p.abstract, p.authors, p.categories, p.field,
                    p.published_date, p.year, p.url, p.doi
             FROM app17_paper_topics AS t
             JOIN papers AS p
               ON p.project_id = t.project_id AND p.id = t.scoped_paper_id
             WHERE t.project_id = ?1 AND t.field = ?2 AND t.topic_id = ?3
             ORDER BY
               CASE WHEN TRIM(p.abstract) <> '' AND p.abstract <> 'Local imported paper without abstract.' THEN 0 ELSE 1 END,
               COALESCE(p.year, t.year, 0) DESC,
               p.id ASC
             LIMIT ?4",
        )
        .map_err(|error| error.to_string())?;
    let representative_papers = representative_stmt
        .query_map(
            params![project_id, field, topic_id, max_papers as i64],
            |row| {
                Ok(EvidencePaperSnapshot {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    title: row.get(2)?,
                    abstract_text: row.get(3)?,
                    authors: row.get(4)?,
                    categories: row.get(5)?,
                    field: row.get(6)?,
                    published_date: row.get(7)?,
                    year: row.get(8)?,
                    url: row.get(9)?,
                    doi: row.get(10)?,
                })
            },
        )
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(representative_stmt);

    let representative_ids = representative_papers
        .iter()
        .map(|paper| paper.id.clone())
        .collect::<Vec<_>>();

    let mut year_stmt = conn
        .prepare(
            "SELECT year, COUNT(*)
             FROM app17_paper_topics
             WHERE project_id = ?1 AND field = ?2 AND topic_id = ?3 AND year IS NOT NULL
             GROUP BY year
             ORDER BY year",
        )
        .map_err(|error| error.to_string())?;
    let mut year_evolution = year_stmt
        .query_map(params![project_id, field, topic_id], |row| {
            Ok(EvidenceYearEvolution {
                year: row.get(0)?,
                count: row.get(1)?,
                keywords: keywords.clone(),
                representative_ids: Vec::new(),
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for evolution in &mut year_evolution {
        evolution.representative_ids = representative_papers
            .iter()
            .filter(|paper| paper.year == Some(evolution.year))
            .take(3)
            .map(|paper| paper.id.clone())
            .collect();
    }

    let mut source_stmt = conn
        .prepare(
            "SELECT p.source, COUNT(*) AS source_count
             FROM app17_paper_topics AS t
             JOIN papers AS p
               ON p.project_id = t.project_id AND p.id = t.scoped_paper_id
             WHERE t.project_id = ?1 AND t.field = ?2 AND t.topic_id = ?3
             GROUP BY p.source
             ORDER BY source_count DESC, p.source ASC",
        )
        .map_err(|error| error.to_string())?;
    let source_distribution = source_stmt
        .query_map(params![project_id, field, topic_id], |row| {
            Ok(EvidenceCountFacet {
                value: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let selected_hotspot_id = app17_hotspot_id(field, topic_id);
    let evidence_profile_markdown = build_app17_hotspot_evidence_markdown(
        &selected_hotspot_id,
        &title,
        field,
        &summary,
        paper_count,
        &trend,
        &keywords,
        &year_evolution,
        &source_distribution,
        &representative_papers,
    );

    Ok(HotspotEvidenceExportResult {
        generated_at: format!("unix-ms:{}", now_millis()),
        database_path: database_path.to_string_lossy().to_string(),
        project_id: project_id.to_string(),
        selected_hotspot_id,
        selected_hotspot_title: title,
        selected_hotspot_field: field.to_string(),
        hotspot_paper_count: paper_count,
        hotspot_keywords: keywords,
        hotspot_trend: trend,
        hotspot_confidence: 0.0,
        representative_ids,
        missing_representative_ids: Vec::new(),
        representative_papers,
        year_evolution,
        source_distribution,
        similar_hotspots: Vec::new(),
        evidence_profile_markdown,
    })
}

#[allow(clippy::too_many_arguments)]
fn build_app17_hotspot_evidence_markdown(
    hotspot_id: &str,
    title: &str,
    field: &str,
    summary: &str,
    paper_count: i64,
    trend: &str,
    keywords: &[String],
    year_evolution: &[EvidenceYearEvolution],
    source_distribution: &[EvidenceCountFacet],
    papers: &[EvidencePaperSnapshot],
) -> String {
    let years = year_evolution
        .iter()
        .map(|item| format!("{}:{}", item.year, item.count))
        .collect::<Vec<_>>()
        .join("; ");
    let sources = source_distribution
        .iter()
        .map(|item| format!("{} {}", item.value, item.count))
        .collect::<Vec<_>>()
        .join("; ");
    let representative_lines = papers
        .iter()
        .enumerate()
        .map(|(index, paper)| {
            let year = paper
                .year
                .map(|value| value.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            format!(
                "[{}] {}. {}, {}. {}",
                index + 1,
                paper.title,
                paper.source,
                year,
                paper
                    .url
                    .as_deref()
                    .or(paper.doi.as_deref())
                    .unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    [
        format!("# App17 Hotspot Evidence: {title}"),
        format!("- Hotspot id: {hotspot_id}"),
        format!("- Field: {field}"),
        format!("- Paper count: {paper_count}"),
        format!("- Trend: {trend}"),
        format!(
            "- Keywords: {}",
            keywords
                .iter()
                .take(16)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        ),
        format!("- Summary: {summary}"),
        format!(
            "- Year evolution: {}",
            if years.is_empty() { "unknown" } else { &years }
        ),
        format!(
            "- Source distribution: {}",
            if sources.is_empty() {
                "unknown"
            } else {
                &sources
            }
        ),
        "## Representative Papers".to_string(),
        if representative_lines.is_empty() {
            "No representative papers found.".to_string()
        } else {
            representative_lines
        },
    ]
    .join("\n")
}

fn app17_hotspot_id(field: &str, topic_id: i64) -> String {
    format!("app17:{field}:{topic_id}")
}

type App17RawPaperRow = (String, String, String, i64, f64, f64, f64, Option<i64>);

fn normalize_app17_coordinates(rows: &[App17RawPaperRow]) -> Vec<(f64, f64, f64)> {
    if rows.is_empty() {
        return Vec::new();
    }
    let len = rows.len() as f64;
    let center_x = rows.iter().map(|row| row.4).sum::<f64>() / len;
    let center_y = rows.iter().map(|row| row.5).sum::<f64>() / len;
    let center_z = rows.iter().map(|row| row.6).sum::<f64>() / len;
    let mut radii = rows
        .iter()
        .map(|row| {
            let x = row.4 - center_x;
            let y = row.5 - center_y;
            (x * x + y * y).sqrt()
        })
        .collect::<Vec<_>>();
    radii.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let base_radius = percentile(&radii, 0.95).max(1e-8);
    let scale = 900.0 / base_radius;
    rows.iter()
        .map(|row| {
            (
                (row.4 - center_x) * scale,
                (row.5 - center_y) * scale,
                (row.6 - center_z) * scale * 0.55,
            )
        })
        .collect()
}

fn percentile(sorted: &[f64], percentile: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }
    let rank = (sorted.len() - 1) as f64 * percentile.clamp(0.0, 1.0);
    let low = rank.floor() as usize;
    let high = rank.ceil() as usize;
    if low == high {
        sorted[low]
    } else {
        sorted[low] + (sorted[high] - sorted[low]) * (rank - low as f64)
    }
}

fn read_app17_latest_reviews(
    conn: &Connection,
    project_id: &str,
) -> Result<HashMap<(String, i64), String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT field, topic_id, review_cn
             FROM app17_hotspot_reviews
             WHERE project_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let mut rows = stmt
        .query(params![project_id])
        .map_err(|error| error.to_string())?;
    let mut reviews = HashMap::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let field: String = row.get(0).map_err(|error| error.to_string())?;
        let topic_id: i64 = row.get(1).map_err(|error| error.to_string())?;
        let review: String = row.get(2).map_err(|error| error.to_string())?;
        reviews.entry((field, topic_id)).or_insert(review);
    }
    Ok(reviews)
}

fn app17_palette_color(index: usize) -> String {
    const PALETTE: [&str; 10] = [
        "#38bdf8", "#818cf8", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#2dd4bf", "#fb7185",
        "#fcd34d", "#94a3b8",
    ];
    PALETTE[index % PALETTE.len()].to_string()
}

fn app17_topic_color(field: &str, topic_id: i64) -> String {
    app17_palette_color((stable_hash(&format!("{field}_{topic_id}")) as usize) % 10)
}

fn app17_keywords_from_label(label: &str) -> Vec<String> {
    label
        .split('_')
        .map(str::trim)
        .filter(|value| {
            !value.is_empty() && value.chars().any(|character| character.is_alphabetic())
        })
        .take(8)
        .map(str::to_string)
        .collect()
}

fn run_worker_task(
    task_name: &str,
    payload: serde_json::Value,
    temp_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    let worker = find_worker_script("task_worker.py")
        .ok_or_else(|| "Cannot locate workers/task_worker.py.".to_string())?;
    let base_dir = temp_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    fs::create_dir_all(&base_dir)
        .map_err(|error| format!("Cannot create worker temp dir: {error}"))?;

    let input_path = base_dir.join(format!(
        "research_hotspots_{}_{}_{}.json",
        task_name,
        std::process::id(),
        now_millis()
    ));
    let input_payload = serde_json::json!({
        "taskName": task_name,
        "payload": payload,
    });
    fs::write(
        &input_path,
        serde_json::to_string(&input_payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    let output = hidden_python_command()
        .arg(&worker)
        .arg(&input_path)
        .output()
        .map_err(|error| format!("Failed to start Python worker: {error}"))?;
    let _ = fs::remove_file(&input_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python worker failed: {}", stderr.trim()));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Cannot parse worker output: {error}"))
}

struct PaperFileImportRunner {
    app: Option<tauri::AppHandle>,
    task_id: String,
    file_name: String,
    project_id: String,
    source_file_path: PathBuf,
    database_path: PathBuf,
    manifest_path: PathBuf,
    conn: Connection,
    control: PaperImportTaskControl,
    stats: PaperFileImportStats,
    total_rows: Option<i64>,
    seen_keys: HashSet<String>,
    batch: Vec<PaperRecord>,
    started: Instant,
}

impl PaperFileImportRunner {
    fn emit(&self, status: &str, message: impl Into<String>) {
        let message = message.into();
        let _ = self.write_manifest(status, &message);
        if let Some(app) = self.app.as_ref() {
            let _ = app.emit(
                "paper-import-progress",
                PaperFileImportProgress {
                    task_id: self.task_id.clone(),
                    file_name: self.file_name.clone(),
                    status: status.to_string(),
                    total_rows: self.total_rows,
                    processed_rows: self.stats.processed_rows,
                    inserted: self.stats.inserted,
                    updated: self.stats.updated,
                    invalid_rows: self.stats.invalid_rows,
                    duplicate_rows: self.stats.duplicate_rows,
                    message,
                    elapsed_ms: self.started.elapsed().as_millis(),
                },
            );
        }
    }

    fn write_manifest(&self, status: &str, message: &str) -> Result<(), String> {
        if let Some(parent) = self.manifest_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("Cannot create import manifest dir {:?}: {error}", parent)
            })?;
        }
        let manifest = PaperFileImportManifest {
            task_id: self.task_id.clone(),
            file_name: self.file_name.clone(),
            project_id: self.project_id.clone(),
            source_file_path: self.source_file_path.to_string_lossy().to_string(),
            database_path: self.database_path.to_string_lossy().to_string(),
            manifest_path: self.manifest_path.to_string_lossy().to_string(),
            status: status.to_string(),
            message: message.to_string(),
            processed_rows: self.stats.processed_rows,
            inserted: self.stats.inserted,
            updated: self.stats.updated,
            invalid_rows: self.stats.invalid_rows,
            duplicate_rows: self.stats.duplicate_rows,
            elapsed_ms: self.started.elapsed().as_millis(),
            updated_at_ms: now_millis_string(),
            recovery: import_recovery_info(),
        };
        let json = serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
        fs::write(&self.manifest_path, format!("{json}\n")).map_err(|error| {
            format!(
                "Cannot write import manifest {:?}: {error}",
                self.manifest_path
            )
        })
    }

    fn wait_if_paused(&self) -> bool {
        while self.control.paused.load(Ordering::SeqCst)
            && !self.control.cancelled.load(Ordering::SeqCst)
        {
            self.emit("paused", "Import paused.");
            thread::sleep(Duration::from_millis(250));
        }
        !self.control.cancelled.load(Ordering::SeqCst)
    }

    fn process_row(
        &mut self,
        row: HashMap<String, String>,
        row_index: usize,
    ) -> Result<bool, String> {
        if !self.wait_if_paused() {
            self.emit("cancelled", "Import cancelled.");
            return Ok(false);
        }
        self.stats.processed_rows += 1;
        let paper = match normalize_import_paper(row, row_index) {
            Ok(paper) => paper,
            Err(_) => {
                self.stats.invalid_rows += 1;
                if self.stats.processed_rows % PAPER_IMPORT_BATCH_SIZE as i64 == 0 {
                    self.emit("running", "Importing papers.");
                }
                return Ok(true);
            }
        };
        let dedupe_key = paper_dedupe_key(paper.doi.as_deref(), paper.url.as_deref(), &paper.title)
            .unwrap_or_else(|| format!("id:{}", paper.id.to_lowercase()));
        if !self.seen_keys.insert(dedupe_key) {
            self.stats.duplicate_rows += 1;
            if self.stats.processed_rows % PAPER_IMPORT_BATCH_SIZE as i64 == 0 {
                self.emit("running", "Importing papers.");
            }
            return Ok(true);
        }

        self.batch.push(paper);
        if self.batch.len() >= PAPER_IMPORT_BATCH_SIZE {
            self.flush_batch()?;
        } else if self.stats.processed_rows % PAPER_IMPORT_BATCH_SIZE as i64 == 0 {
            self.emit("running", "Importing papers.");
        }
        Ok(true)
    }

    fn flush_batch(&mut self) -> Result<(), String> {
        if self.batch.is_empty() {
            return Ok(());
        }
        if self.control.cancelled.load(Ordering::SeqCst) {
            self.emit("cancelled", "Import cancelled.");
            return Ok(());
        }
        let batch = std::mem::take(&mut self.batch);
        let result = upsert_paper_rows(&mut self.conn, &self.project_id, batch)?;
        self.stats.inserted += result.inserted;
        self.stats.updated += result.updated;
        self.emit("running", "Importing papers.");
        Ok(())
    }

    fn finish(&mut self) -> Result<(), String> {
        if self.control.cancelled.load(Ordering::SeqCst) {
            self.emit("cancelled", "Import cancelled.");
            return Ok(());
        }
        self.flush_batch()?;
        self.emit(
            "done",
            format!(
                "Import finished: processed={}, inserted={}, updated={}, invalid={}, duplicates={}.",
                self.stats.processed_rows, self.stats.inserted, self.stats.updated, self.stats.invalid_rows, self.stats.duplicate_rows
            ),
        );
        Ok(())
    }
}

fn run_paper_file_import_task(
    app: tauri::AppHandle,
    task_id: String,
    file_name: String,
    database_dir: Option<String>,
    project_id: Option<String>,
    file_path: PathBuf,
    control: PaperImportTaskControl,
) -> Result<(), String> {
    let (conn, database_dir, database_path) = open_library_database(&app, database_dir)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let manifest_path = import_manifest_path(&database_dir, &task_id);
    let mut runner = PaperFileImportRunner {
        app: Some(app),
        task_id,
        file_name,
        project_id,
        source_file_path: file_path.clone(),
        database_path,
        manifest_path,
        conn,
        control,
        stats: PaperFileImportStats::default(),
        total_rows: None,
        seen_keys: HashSet::new(),
        batch: Vec::with_capacity(PAPER_IMPORT_BATCH_SIZE),
        started: Instant::now(),
    };
    runner.emit("running", "Import started.");
    if let Err(error) = import_file_with_runner(&mut runner, &file_path) {
        runner.emit("failed", &error);
        return Err(format!("{IMPORT_TASK_ERROR_EMITTED_PREFIX}{error}"));
    }
    Ok(())
}

fn run_mysql_paper_import_task(
    app: tauri::AppHandle,
    task_id: String,
    file_name: String,
    input: MysqlPaperImportInput,
    control: PaperImportTaskControl,
) -> Result<(), String> {
    let worker = find_worker_script("mysql_import_worker.py")
        .ok_or_else(|| "Cannot locate workers/mysql_import_worker.py.".to_string())?;
    let worker_temp_dir = input
        .worker_temp_dir
        .clone()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    fs::create_dir_all(&worker_temp_dir).map_err(|error| {
        format!(
            "Cannot create MySQL import temp dir {:?}: {error}",
            worker_temp_dir
        )
    })?;

    let input_path = worker_temp_dir.join(format!(
        "mysql_paper_import_{}_{}.json",
        std::process::id(),
        now_millis()
    ));
    fs::write(
        &input_path,
        serde_json::to_string(&input).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Cannot write MySQL import worker input: {error}"))?;

    let (conn, database_dir, database_path) =
        open_library_database(&app, input.database_dir.clone())?;
    let project_id = input.project_id.clone().unwrap_or_else(default_project_id);
    let manifest_path = import_manifest_path(&database_dir, &task_id);
    let host_label = input
        .host
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("127.0.0.1");
    let database_label = input
        .database
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("research_hotspots");
    let source_label = format!(
        "mysql_{}_{}_papers",
        safe_manifest_label(host_label),
        safe_manifest_label(database_label)
    );
    let mut runner = PaperFileImportRunner {
        app: Some(app),
        task_id,
        file_name,
        project_id,
        source_file_path: PathBuf::from(source_label),
        database_path,
        manifest_path,
        conn,
        control,
        stats: PaperFileImportStats::default(),
        total_rows: None,
        seen_keys: HashSet::new(),
        batch: Vec::with_capacity(PAPER_IMPORT_BATCH_SIZE),
        started: Instant::now(),
    };

    runner.emit("running", "MySQL import started.");
    let mut child = hidden_python_command()
        .arg(&worker)
        .arg(&input_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start MySQL import worker: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot read MySQL import worker stdout.".to_string())?;
    let reader = BufReader::new(stdout);
    let mut saw_done = false;

    for line in reader.lines() {
        if !runner.wait_if_paused() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_file(&input_path);
            runner.emit("cancelled", "MySQL import cancelled.");
            return Ok(());
        }
        if runner.control.cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = fs::remove_file(&input_path);
            runner.emit("cancelled", "MySQL import cancelled.");
            return Ok(());
        }

        let line =
            line.map_err(|error| format!("Cannot read MySQL import worker output: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let event: serde_json::Value = serde_json::from_str(&line).map_err(|error| {
            format!(
                "Cannot parse MySQL import worker event: {error}; line={}",
                line.chars().take(500).collect::<String>()
            )
        })?;
        let event_type = event
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        match event_type {
            "count" => {
                runner.total_rows = event.get("total").and_then(|value| value.as_i64());
                let total = runner.total_rows.unwrap_or(0);
                runner.emit("running", format!("MySQL source counted {total} rows."));
            }
            "batch" => {
                let read_rows = event.get("read").and_then(|value| value.as_i64());
                let invalid_rows = event
                    .get("invalidRows")
                    .and_then(|value| value.as_i64())
                    .unwrap_or(0);
                if invalid_rows > 0 {
                    runner.stats.invalid_rows += invalid_rows;
                }
                let rows_value = event
                    .get("rows")
                    .cloned()
                    .unwrap_or_else(|| serde_json::Value::Array(Vec::new()));
                let rows: Vec<PaperRecord> = serde_json::from_value(rows_value)
                    .map_err(|error| format!("Cannot parse MySQL import batch rows: {error}"))?;
                if let Some(read_rows) = read_rows {
                    runner.stats.processed_rows = runner.stats.processed_rows.max(read_rows);
                } else {
                    runner.stats.processed_rows += rows.len() as i64 + invalid_rows;
                }
                runner.batch.extend(rows);
                runner.flush_batch()?;
            }
            "done" => {
                if let Some(read_rows) = event.get("read").and_then(|value| value.as_i64()) {
                    runner.stats.processed_rows = runner.stats.processed_rows.max(read_rows);
                }
                saw_done = true;
                break;
            }
            "error" => {
                let message = event
                    .get("message")
                    .and_then(|value| value.as_str())
                    .unwrap_or("MySQL import worker failed.")
                    .to_string();
                let _ = child.kill();
                let _ = child.wait();
                let _ = fs::remove_file(&input_path);
                runner.emit("failed", &message);
                return Err(format!("{IMPORT_TASK_ERROR_EMITTED_PREFIX}{message}"));
            }
            "log" => {
                if let Some(message) = event.get("message").and_then(|value| value.as_str()) {
                    runner.emit("running", message);
                }
            }
            _ => {
                runner.stats.invalid_rows += 1;
                runner.emit("running", "Ignored an unknown MySQL import worker event.");
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Cannot wait for MySQL import worker: {error}"))?;
    let _ = fs::remove_file(&input_path);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = if stderr.trim().is_empty() {
            "MySQL import worker exited without a readable error.".to_string()
        } else {
            format!("MySQL import worker failed: {}", stderr.trim())
        };
        runner.emit("failed", &message);
        return Err(format!("{IMPORT_TASK_ERROR_EMITTED_PREFIX}{message}"));
    }

    if !saw_done {
        runner.emit(
            "running",
            "MySQL worker finished without an explicit done event.",
        );
    }
    runner.finish()
}

pub fn import_paper_file_to_library_path(
    database_dir: PathBuf,
    project_id: Option<String>,
    file_path: PathBuf,
) -> Result<PaperFileImportSummary, String> {
    fs::create_dir_all(&database_dir)
        .map_err(|error| format!("Cannot create library dir {:?}: {error}", database_dir))?;
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    let conn = Connection::open(&database_path)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    initialize_library_database(&conn)?;
    let project_id = project_id.unwrap_or_else(default_project_id);
    let file_name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("papers")
        .to_string();
    let task_id = format!("paper-import-cli-{}-{}", std::process::id(), now_millis());
    let manifest_path = import_manifest_path(&database_dir, &task_id);
    let mut runner = PaperFileImportRunner {
        app: None,
        task_id,
        file_name,
        project_id: project_id.clone(),
        source_file_path: file_path.clone(),
        database_path: database_path.clone(),
        manifest_path: manifest_path.clone(),
        conn,
        control: PaperImportTaskControl::default(),
        stats: PaperFileImportStats::default(),
        total_rows: None,
        seen_keys: HashSet::new(),
        batch: Vec::with_capacity(PAPER_IMPORT_BATCH_SIZE),
        started: Instant::now(),
    };
    runner.emit("running", "Import started.");
    if let Err(error) = import_file_with_runner(&mut runner, &file_path) {
        runner.emit("failed", &error);
        return Err(error);
    }
    Ok(PaperFileImportSummary {
        database_dir: database_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        manifest_path: manifest_path.to_string_lossy().to_string(),
        project_id,
        file_path: file_path.to_string_lossy().to_string(),
        processed_rows: runner.stats.processed_rows,
        inserted: runner.stats.inserted,
        updated: runner.stats.updated,
        invalid_rows: runner.stats.invalid_rows,
        duplicate_rows: runner.stats.duplicate_rows,
        elapsed_ms: runner.started.elapsed().as_millis(),
        recovery: import_recovery_info(),
    })
}

fn import_recovery_info() -> PaperImportRecoveryInfo {
    PaperImportRecoveryInfo {
        safe_to_rerun: true,
        strategy: "Re-run the same source file after interruption; scoped IDs and SQLite upsert update existing rows and insert missing rows.".to_string(),
        batch_size: PAPER_IMPORT_BATCH_SIZE,
        transaction_scope: "Each flushed batch is committed in one SQLite transaction.".to_string(),
    }
}

fn import_manifest_path(database_dir: &Path, task_id: &str) -> PathBuf {
    database_dir
        .join("import-manifests")
        .join(format!("{task_id}.json"))
}

fn import_file_with_runner(
    runner: &mut PaperFileImportRunner,
    file_path: &PathBuf,
) -> Result<(), String> {
    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    match extension.as_str() {
        "csv" => import_csv_file(runner, file_path)?,
        "jsonl" | "ndjson" => import_json_lines_file(runner, file_path)?,
        "json" => import_json_file(runner, file_path)?,
        "bib" => import_bibtex_file(runner, file_path)?,
        "ris" => import_ris_file(runner, file_path)?,
        _ => return Err(format!("Unsupported import file type: .{extension}")),
    }
    Ok(())
}

fn import_csv_file(runner: &mut PaperFileImportRunner, file_path: &PathBuf) -> Result<(), String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(file_path)
        .map_err(|error| format!("Cannot read CSV file {:?}: {error}", file_path))?;
    let headers = reader
        .headers()
        .map_err(|error| format!("Cannot read CSV header: {error}"))?
        .iter()
        .map(normalize_import_key)
        .collect::<Vec<_>>();
    for (index, record) in reader.records().enumerate() {
        let record =
            record.map_err(|error| format!("Cannot read CSV record {}: {error}", index + 1))?;
        let mut row = HashMap::new();
        for (value_index, value) in record.iter().enumerate() {
            let key = headers
                .get(value_index)
                .cloned()
                .unwrap_or_else(|| format!("col{value_index}"));
            row.insert(key, value.trim().to_string());
        }
        if !runner.process_row(row, index + 1)? {
            return Ok(());
        }
    }
    runner.finish()
}

fn import_json_lines_file(
    runner: &mut PaperFileImportRunner,
    file_path: &PathBuf,
) -> Result<(), String> {
    let file = File::open(file_path)
        .map_err(|error| format!("Cannot open JSONL file {:?}: {error}", file_path))?;
    let reader = BufReader::new(file);
    for (index, line) in reader.lines().enumerate() {
        let line =
            line.map_err(|error| format!("Cannot read JSONL line {}: {error}", index + 1))?;
        if line.trim().is_empty() {
            continue;
        }
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => {
                runner.stats.processed_rows += 1;
                runner.stats.invalid_rows += 1;
                continue;
            }
        };
        if let Some(row) = json_value_to_import_row(&value) {
            if !runner.process_row(row, index + 1)? {
                return Ok(());
            }
        } else {
            runner.stats.processed_rows += 1;
            runner.stats.invalid_rows += 1;
        }
    }
    runner.finish()
}

fn import_json_file(runner: &mut PaperFileImportRunner, file_path: &PathBuf) -> Result<(), String> {
    let file = File::open(file_path)
        .map_err(|error| format!("Cannot open JSON file {:?}: {error}", file_path))?;
    let value: serde_json::Value = serde_json::from_reader(BufReader::new(file))
        .map_err(|error| format!("Cannot parse JSON file: {error}"))?;
    let mut processed_any = false;
    match &value {
        serde_json::Value::Array(rows) => {
            for (index, value) in rows.iter().enumerate() {
                processed_any = true;
                if let Some(row) = json_value_to_import_row(value) {
                    if !runner.process_row(row, index + 1)? {
                        return Ok(());
                    }
                } else {
                    runner.stats.processed_rows += 1;
                    runner.stats.invalid_rows += 1;
                }
            }
        }
        serde_json::Value::Object(object) => {
            for key in ["papers", "data", "items", "results", "records"] {
                if let Some(serde_json::Value::Array(rows)) = object.get(key) {
                    for (index, value) in rows.iter().enumerate() {
                        processed_any = true;
                        if let Some(row) = json_value_to_import_row(value) {
                            if !runner.process_row(row, index + 1)? {
                                return Ok(());
                            }
                        } else {
                            runner.stats.processed_rows += 1;
                            runner.stats.invalid_rows += 1;
                        }
                    }
                    break;
                }
            }
            if !processed_any {
                processed_any = true;
                if let Some(row) = json_value_to_import_row(&value) {
                    let _ = runner.process_row(row, 1)?;
                } else {
                    runner.stats.processed_rows += 1;
                    runner.stats.invalid_rows += 1;
                }
            }
        }
        _ => {
            runner.stats.processed_rows += 1;
            runner.stats.invalid_rows += 1;
        }
    }
    if !processed_any {
        runner.stats.invalid_rows += 1;
    }
    runner.finish()
}

fn import_bibtex_file(
    runner: &mut PaperFileImportRunner,
    file_path: &PathBuf,
) -> Result<(), String> {
    let file = File::open(file_path)
        .map_err(|error| format!("Cannot open BibTeX file {:?}: {error}", file_path))?;
    let reader = BufReader::new(file);
    let mut entry = String::new();
    let mut in_entry = false;
    let mut seen_open = false;
    let mut close_char = '}';
    let mut depth: i64 = 0;
    let mut entry_index = 0usize;

    for line in reader.lines() {
        let line = line.map_err(|error| format!("Cannot read BibTeX line: {error}"))?;
        let trimmed = line.trim_start();
        if !in_entry {
            if !trimmed.starts_with('@') {
                continue;
            }
            in_entry = true;
            seen_open = false;
            close_char = '}';
            depth = 0;
            entry.clear();
        }

        entry.push_str(&line);
        entry.push('\n');
        update_bibtex_entry_depth(&line, &mut seen_open, &mut close_char, &mut depth);
        if in_entry && seen_open && depth <= 0 {
            entry_index += 1;
            if let Some(row) = bibtex_entry_to_import_row(&entry, entry_index) {
                if !runner.process_row(row, entry_index)? {
                    return Ok(());
                }
            } else {
                runner.stats.processed_rows += 1;
                runner.stats.invalid_rows += 1;
            }
            in_entry = false;
            entry.clear();
        }
    }

    if in_entry && !entry.trim().is_empty() {
        runner.stats.processed_rows += 1;
        runner.stats.invalid_rows += 1;
    }
    runner.finish()
}

fn import_ris_file(runner: &mut PaperFileImportRunner, file_path: &PathBuf) -> Result<(), String> {
    let file = File::open(file_path)
        .map_err(|error| format!("Cannot open RIS file {:?}: {error}", file_path))?;
    let reader = BufReader::new(file);
    let mut entry: HashMap<String, Vec<String>> = HashMap::new();
    let mut last_tag = String::new();
    let mut entry_index = 0usize;

    for line in reader.lines() {
        let line = line.map_err(|error| format!("Cannot read RIS line: {error}"))?;
        if let Some((tag, value)) = parse_ris_tag_line(&line) {
            if tag == "TY" {
                entry.clear();
                last_tag = tag.clone();
                entry.entry(tag).or_default().push(value);
                continue;
            }
            if tag == "ER" {
                if !entry.is_empty() {
                    entry_index += 1;
                    let row = ris_entry_to_import_row(&entry, entry_index);
                    if !runner.process_row(row, entry_index)? {
                        return Ok(());
                    }
                    entry.clear();
                }
                last_tag.clear();
                continue;
            }
            entry.entry(tag.clone()).or_default().push(value);
            last_tag = tag;
        } else if !last_tag.is_empty() && !line.trim().is_empty() {
            if let Some(values) = entry.get_mut(&last_tag) {
                if let Some(last_value) = values.last_mut() {
                    last_value.push(' ');
                    last_value.push_str(line.trim());
                }
            }
        }
    }

    if !entry.is_empty() {
        entry_index += 1;
        let row = ris_entry_to_import_row(&entry, entry_index);
        let _ = runner.process_row(row, entry_index)?;
    }
    runner.finish()
}

fn update_bibtex_entry_depth(
    line: &str,
    seen_open: &mut bool,
    close_char: &mut char,
    depth: &mut i64,
) {
    let mut quoted = false;
    let mut escaped = false;
    for character in line.chars() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '"' {
            quoted = !quoted;
            continue;
        }
        if !*seen_open {
            if character == '{' || character == '(' {
                *seen_open = true;
                *close_char = if character == '{' { '}' } else { ')' };
                *depth = 1;
            }
            continue;
        }
        if quoted {
            continue;
        }
        if *close_char == '}' {
            if character == '{' {
                *depth += 1;
            } else if character == '}' {
                *depth -= 1;
            }
        } else if character == '(' {
            *depth += 1;
        } else if character == ')' {
            *depth -= 1;
        }
    }
}

fn bibtex_entry_to_import_row(
    entry_text: &str,
    entry_index: usize,
) -> Option<HashMap<String, String>> {
    let trimmed = entry_text.trim();
    if !trimmed.starts_with('@') {
        return None;
    }
    let open_index = trimmed.find(['{', '('])?;
    let entry_type = trimmed[1..open_index].trim().to_lowercase();
    if matches!(entry_type.as_str(), "comment" | "preamble" | "string") {
        return None;
    }
    let close_char = if trimmed.as_bytes().get(open_index) == Some(&b'{') {
        '}'
    } else {
        ')'
    };
    let close_index = trimmed.rfind(close_char)?;
    let inner = &trimmed[open_index + 1..close_index];
    let (entry_key, fields_text) = split_first_top_level_comma(inner)?;
    let fields = parse_bibtex_fields(fields_text);
    let title = first_bibtex_field(&fields, &["title", "booktitle"]);
    let abstract_text = first_bibtex_field(&fields, &["abstract", "annotation", "annote", "note"]);
    let doi = normalize_bibliography_doi(&first_bibtex_field(&fields, &["doi"]));
    let url = first_bibtex_field(&fields, &["url", "howpublished", "pdf"]);
    let categories = first_bibtex_field(&fields, &["keywords", "keyword", "subjects", "tags"]);
    let venue = first_bibtex_field(
        &fields,
        &[
            "journal",
            "journaltitle",
            "booktitle",
            "conference",
            "publisher",
            "school",
            "institution",
        ],
    );
    let year_text = first_bibtex_field(&fields, &["date", "year", "urldate", "month"]);
    let authors = normalize_bibtex_authors(&first_bibtex_field(&fields, &["author", "editor"]));
    let source_hint =
        first_bibtex_field(&fields, &["archiveprefix", "eprinttype", "url", "eprint"]);
    let id_seed = format!("{entry_key}:{title}:{doi}:{url}:{entry_index}");
    let resolved_url = if url.trim().is_empty() {
        doi_to_url(&doi)
    } else {
        url
    };

    let mut row = HashMap::new();
    put_import_value(&mut row, "id", format!("bib:{}", hash_string(&id_seed)));
    put_import_value(&mut row, "title", title);
    put_import_value(&mut row, "abstract", abstract_text);
    put_import_value(&mut row, "year", year_text.clone());
    put_import_value(&mut row, "published", year_text);
    put_import_value(&mut row, "source", normalize_import_source(&source_hint));
    put_import_value(
        &mut row,
        "field",
        bibliography_field_from_terms(&categories, &venue, &entry_type),
    );
    put_import_value(&mut row, "doi", doi);
    put_import_value(&mut row, "url", resolved_url);
    put_import_value(&mut row, "authors", authors);
    put_import_value(&mut row, "categories", categories);
    Some(row)
}

fn parse_bibtex_fields(fields_text: &str) -> HashMap<String, String> {
    let mut fields = HashMap::new();
    for part in split_top_level(fields_text, ',') {
        if let Some(eq_index) = find_top_level_char(&part, '=') {
            let key = normalize_import_key(&part[..eq_index]);
            let value = clean_bibtex_value(&part[eq_index + 1..]);
            if !key.is_empty() && !value.is_empty() {
                fields.insert(key, value);
            }
        }
    }
    fields
}

fn split_first_top_level_comma(value: &str) -> Option<(String, &str)> {
    let index = find_top_level_char(value, ',')?;
    Some((value[..index].trim().to_string(), &value[index + 1..]))
}

fn split_top_level(value: &str, delimiter: char) -> Vec<String> {
    let mut parts = Vec::new();
    let mut start = 0usize;
    let mut brace_depth = 0i64;
    let mut paren_depth = 0i64;
    let mut quoted = false;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '"' {
            quoted = !quoted;
            continue;
        }
        if !quoted {
            match character {
                '{' => brace_depth += 1,
                '}' => brace_depth = (brace_depth - 1).max(0),
                '(' => paren_depth += 1,
                ')' => paren_depth = (paren_depth - 1).max(0),
                _ => {}
            }
        }
        if character == delimiter && !quoted && brace_depth == 0 && paren_depth == 0 {
            parts.push(value[start..index].to_string());
            start = index + character.len_utf8();
        }
    }
    parts.push(value[start..].to_string());
    parts
}

fn find_top_level_char(value: &str, target: char) -> Option<usize> {
    let mut brace_depth = 0i64;
    let mut paren_depth = 0i64;
    let mut quoted = false;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '"' {
            quoted = !quoted;
            continue;
        }
        if !quoted {
            match character {
                '{' => brace_depth += 1,
                '}' => brace_depth = (brace_depth - 1).max(0),
                '(' => paren_depth += 1,
                ')' => paren_depth = (paren_depth - 1).max(0),
                _ => {}
            }
        }
        if character == target && !quoted && brace_depth == 0 && paren_depth == 0 {
            return Some(index);
        }
    }
    None
}

fn clean_bibtex_value(raw_value: &str) -> String {
    let pieces = split_top_level(raw_value.trim().trim_end_matches(','), '#')
        .into_iter()
        .map(|part| clean_single_bibtex_value(&part))
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>();
    collapse_whitespace(&pieces.join(" "))
}

fn clean_single_bibtex_value(raw_value: &str) -> String {
    let mut value = raw_value.trim().trim_end_matches(',').trim().to_string();
    loop {
        let trimmed = value.trim();
        if trimmed.len() >= 2
            && ((trimmed.starts_with('{') && trimmed.ends_with('}'))
                || (trimmed.starts_with('(') && trimmed.ends_with(')')))
        {
            value = trimmed[1..trimmed.len() - 1].trim().to_string();
            continue;
        }
        if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
            value = trimmed[1..trimmed.len() - 1].trim().to_string();
            continue;
        }
        break;
    }
    decode_latexish_text(&value)
}

fn decode_latexish_text(value: &str) -> String {
    let mut output = String::new();
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '\\' {
            if let Some(next) = chars.peek().copied() {
                if matches!(next, '&' | '%' | '_' | '#' | '$') {
                    output.push(next);
                    chars.next();
                    continue;
                }
                if next.is_ascii_alphabetic() {
                    while chars
                        .peek()
                        .copied()
                        .is_some_and(|item| item.is_ascii_alphabetic() || item == '*')
                    {
                        chars.next();
                    }
                    continue;
                }
            }
            continue;
        }
        if character != '{' && character != '}' {
            output.push(character);
        }
    }
    collapse_whitespace(&output.replace("---", "-").replace("--", "-"))
}

fn first_bibtex_field(fields: &HashMap<String, String>, keys: &[&str]) -> String {
    for key in keys {
        if let Some(value) = fields.get(&normalize_import_key(key)) {
            if !value.trim().is_empty() {
                return value.trim().to_string();
            }
        }
    }
    String::new()
}

fn normalize_bibtex_authors(value: &str) -> String {
    value
        .split(" and ")
        .map(|author| {
            let author = collapse_whitespace(author);
            let parts = author
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>();
            if parts.len() >= 2 {
                format!("{} {}", parts[1..].join(" "), parts[0])
            } else {
                author
            }
        })
        .filter(|author| !author.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

fn parse_ris_tag_line(line: &str) -> Option<(String, String)> {
    let bytes = line.as_bytes();
    if bytes.len() >= 5 && bytes[2] == b' ' && bytes[3] == b' ' && bytes[4] == b'-' {
        Some((
            line[..2].to_string(),
            line.get(5..).unwrap_or_default().trim().to_string(),
        ))
    } else {
        None
    }
}

fn ris_entry_to_import_row(
    entry: &HashMap<String, Vec<String>>,
    entry_index: usize,
) -> HashMap<String, String> {
    let title = first_ris_value(entry, &["TI", "T1", "CT"]);
    let abstract_text = first_ris_value(entry, &["AB", "N2"]);
    let doi = normalize_bibliography_doi(&first_ris_value(entry, &["DO"]));
    let url = first_ris_value(entry, &["UR", "L1", "L2", "LK"]);
    let year_text = first_ris_value(entry, &["PY", "Y1", "Y2", "DA"]);
    let source_hint = first_ris_value(entry, &["DB", "DP", "UR"]);
    let venue = first_ris_value(entry, &["JO", "JF", "JA", "T2", "PB"]);
    let categories = join_ris_values(entry, &["KW", "M1", "M3"]);
    let authors = join_ris_values(entry, &["AU", "A1", "A2", "A3", "A4"]);
    let entry_type = first_ris_value(entry, &["TY"]);
    let id_seed = format!("{title}:{doi}:{url}:{entry_index}");

    let mut row = HashMap::new();
    put_import_value(&mut row, "id", format!("ris:{}", hash_string(&id_seed)));
    put_import_value(&mut row, "title", title);
    put_import_value(&mut row, "abstract", abstract_text);
    put_import_value(&mut row, "year", year_text.clone());
    put_import_value(&mut row, "published", year_text);
    put_import_value(&mut row, "source", normalize_import_source(&source_hint));
    put_import_value(
        &mut row,
        "field",
        bibliography_field_from_terms(&categories, &venue, &entry_type),
    );
    put_import_value(&mut row, "doi", doi.clone());
    put_import_value(
        &mut row,
        "url",
        if url.trim().is_empty() {
            doi_to_url(&doi)
        } else {
            url
        },
    );
    put_import_value(&mut row, "authors", authors);
    put_import_value(&mut row, "categories", categories);
    row
}

fn first_ris_value(entry: &HashMap<String, Vec<String>>, tags: &[&str]) -> String {
    for tag in tags {
        if let Some(values) = entry.get(*tag) {
            if let Some(value) = values.iter().find(|value| !value.trim().is_empty()) {
                return value.trim().to_string();
            }
        }
    }
    String::new()
}

fn join_ris_values(entry: &HashMap<String, Vec<String>>, tags: &[&str]) -> String {
    let mut seen = HashSet::new();
    let mut values = Vec::new();
    for tag in tags {
        if let Some(rows) = entry.get(*tag) {
            for row in rows {
                let value = collapse_whitespace(row);
                let key = value.to_lowercase();
                if !value.is_empty() && seen.insert(key) {
                    values.push(value);
                }
            }
        }
    }
    values.join("; ")
}

fn put_import_value(row: &mut HashMap<String, String>, key: &str, value: impl Into<String>) {
    let value = collapse_whitespace(&value.into());
    if !value.is_empty() {
        row.insert(normalize_import_key(key), value);
    }
}

fn normalize_bibliography_doi(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("doi:")
        .trim_start_matches("DOI:")
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("https://dx.doi.org/")
        .trim_start_matches("http://dx.doi.org/")
        .trim()
        .to_string()
}

fn doi_to_url(doi: &str) -> String {
    let doi = doi.trim();
    if doi.is_empty() {
        String::new()
    } else {
        format!("https://doi.org/{doi}")
    }
}

fn bibliography_field_from_terms(categories: &str, venue: &str, entry_type: &str) -> String {
    if let Some(first) = categories
        .split([';', ',', '|'])
        .map(collapse_whitespace)
        .find(|value| !value.trim().is_empty())
    {
        return title_case_ascii(&first);
    }
    if !venue.trim().is_empty() {
        return "Bibliography Import".to_string();
    }
    if !entry_type.trim().is_empty() {
        return format!("Bibliography {}", entry_type.trim().to_uppercase());
    }
    "Local Import".to_string()
}

fn title_case_ascii(value: &str) -> String {
    value
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn json_value_to_import_row(value: &serde_json::Value) -> Option<HashMap<String, String>> {
    let object = value.as_object()?;
    let mut row = HashMap::new();
    for (key, value) in object {
        let normalized_key = normalize_import_key(key);
        let text = match value {
            serde_json::Value::String(text) => text.clone(),
            serde_json::Value::Number(number) => number.to_string(),
            serde_json::Value::Bool(value) => value.to_string(),
            serde_json::Value::Array(values) => values
                .iter()
                .filter_map(|item| {
                    item.as_str()
                        .map(str::to_string)
                        .or_else(|| item.as_i64().map(|number| number.to_string()))
                })
                .collect::<Vec<_>>()
                .join("; "),
            serde_json::Value::Null => String::new(),
            _ => value.to_string(),
        };
        row.insert(normalized_key, text.trim().to_string());
    }
    Some(row)
}

fn normalize_import_paper(
    row: HashMap<String, String>,
    index: usize,
) -> Result<PaperRecord, String> {
    let title = pick_import_value(
        &row,
        &[
            "title",
            "name",
            "display_name",
            "paper_title",
            "标题",
            "题名",
            "论文标题",
            "文献标题",
        ],
    );
    if title.trim().is_empty() {
        return Err("Missing title.".to_string());
    }
    let abstract_text = pick_import_value(
        &row,
        &[
            "abstract",
            "summary",
            "description",
            "摘要",
            "简介",
            "内容摘要",
        ],
    );
    let doi = empty_to_none(pick_import_value(&row, &["doi"]));
    let url = empty_to_none(pick_import_value(
        &row,
        &["url", "link", "landing_page_url", "pdf_url", "链接", "网址"],
    ));
    let year_text = pick_import_value(
        &row,
        &[
            "year",
            "publication_year",
            "published_year",
            "date",
            "published",
            "发表年份",
            "年份",
            "出版年",
        ],
    );
    let source = normalize_import_source(&pick_import_value(
        &row,
        &["source", "database", "platform", "来源", "数据源"],
    ));
    let id = pick_import_value(&row, &["id", "paper_id", "paperid", "编号", "文献编号"]);
    let fallback_id = format!(
        "local:{}",
        hash_string(&format!(
            "{}:{}:{}:{}",
            title,
            doi.as_deref().unwrap_or_default(),
            url.as_deref().unwrap_or_default(),
            index
        ))
    );
    let timestamp = now_millis_string();

    Ok(PaperRecord {
        id: if id.trim().is_empty() {
            fallback_id
        } else {
            id
        },
        project_id: None,
        source,
        title: collapse_whitespace(&title).chars().take(500).collect(),
        abstract_text: collapse_whitespace(if abstract_text.trim().is_empty() {
            "Local imported paper without abstract."
        } else {
            &abstract_text
        })
        .chars()
        .take(5000)
        .collect(),
        authors: empty_to_none(pick_import_value(
            &row,
            &["authors", "author", "creator", "作者", "作者列表"],
        )),
        categories: empty_to_none(pick_import_value(
            &row,
            &[
                "categories",
                "keywords",
                "concepts",
                "tags",
                "关键词",
                "主题词",
            ],
        )),
        field: {
            let field = pick_import_value(
                &row,
                &[
                    "field",
                    "discipline",
                    "subject",
                    "category",
                    "学科",
                    "领域",
                    "分类",
                ],
            );
            if field.trim().is_empty() {
                "Local Import".to_string()
            } else {
                collapse_whitespace(&field)
            }
        },
        published_date: empty_to_none(year_text.clone()),
        year: extract_year(&year_text),
        url,
        doi,
        created_at: Some(timestamp.clone()),
        updated_at: Some(timestamp),
    })
}

fn pick_import_value(row: &HashMap<String, String>, aliases: &[&str]) -> String {
    for alias in aliases {
        if let Some(value) = row.get(&normalize_import_key(alias)) {
            if !value.trim().is_empty() {
                return value.trim().to_string();
            }
        }
    }
    String::new()
}

fn normalize_import_key(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .filter(|character| !character.is_whitespace() && *character != '_' && *character != '-')
        .collect()
}

fn normalize_import_source(value: &str) -> String {
    let lower = value.to_lowercase();
    if lower.contains("arxiv") {
        "arxiv".to_string()
    } else if lower.contains("openalex") {
        "openalex".to_string()
    } else if lower.contains("cnki") || lower.contains("知网") {
        "cnki".to_string()
    } else {
        "local".to_string()
    }
}

fn empty_to_none(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_year(value: &str) -> Option<i64> {
    let mut digits = String::new();
    for character in value.chars() {
        if character.is_ascii_digit() {
            digits.push(character);
            if digits.len() == 4 {
                let year = digits.parse::<i64>().ok()?;
                return (1500..=2300).contains(&year).then_some(year);
            }
        } else {
            digits.clear();
        }
    }
    None
}

fn hash_string(value: &str) -> String {
    let mut hash: u32 = 2166136261;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16777619);
    }
    format!("{hash:x}")
}

fn pressure_test_paper(index: i64) -> PaperRecord {
    const FIELDS: [&str; 8] = [
        "Artificial Intelligence",
        "Biomedical Engineering",
        "Energy Systems",
        "Climate Science",
        "Education Technology",
        "Materials Science",
        "Urban Computing",
        "Computational Social Science",
    ];
    const TOPICS: [&str; 12] = [
        "graph retrieval",
        "language agents",
        "biomedical evidence",
        "battery forecasting",
        "climate adaptation",
        "learning analytics",
        "protein design",
        "sensor fusion",
        "knowledge tracing",
        "causal discovery",
        "robot planning",
        "multimodal reasoning",
    ];
    const METHODS: [&str; 8] = [
        "transformer",
        "bayesian inference",
        "contrastive learning",
        "reinforcement optimization",
        "causal estimation",
        "federated mining",
        "semantic indexing",
        "uncertainty calibration",
    ];
    let field = FIELDS[(index as usize) % FIELDS.len()];
    let topic = TOPICS[(index as usize * 7) % TOPICS.len()];
    let method = METHODS[(index as usize * 5) % METHODS.len()];
    let year = 2016 + (index % 11);
    let timestamp = now_millis_string();
    let title = format!("{topic} with {method} for {field} #{index:06}");
    let abstract_text = format!(
        "This pressure test record studies {topic} using {method}. The work combines graph evidence retrieval, semantic clustering, benchmark evaluation, temporal trend analysis, and reliable local SQLite indexing for large research libraries."
    );

    PaperRecord {
        id: format!("pressure-{index:06}"),
        project_id: None,
        source: "local".to_string(),
        title,
        abstract_text,
        authors: Some(format!(
            "Author {}; Author {}",
            index % 97,
            (index + 13) % 97
        )),
        categories: Some(format!("{topic}; {method}; large library benchmark")),
        field: field.to_string(),
        published_date: Some(year.to_string()),
        year: Some(year),
        url: Some(format!("https://example.local/papers/{index:06}")),
        doi: Some(format!("10.0000/v7.pressure.{index:06}")),
        created_at: Some(timestamp.clone()),
        updated_at: Some(timestamp),
    }
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn check_writable_dir(path: &PathBuf, label: &str, errors: &mut Vec<String>) -> bool {
    if let Err(error) = fs::create_dir_all(path) {
        errors.push(format!("Cannot create {label} dir {:?}: {error}", path));
        return false;
    }
    let test_path = path.join(format!(
        "research_hotspots_health_{}_{}.tmp",
        std::process::id(),
        now_millis()
    ));
    match fs::write(&test_path, "ok") {
        Ok(_) => {
            let _ = fs::remove_file(test_path);
            true
        }
        Err(error) => {
            errors.push(format!("Cannot write {label} dir {:?}: {error}", path));
            false
        }
    }
}

fn default_library_resource_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let resource_database = app
        .path()
        .resolve(
            "default-library/research-hotspots-v7.sqlite",
            BaseDirectory::Resource,
        )
        .map_err(|error| format!("无法解析默认论文库资源路径: {error}"))?;
    let resource_manifest = app
        .path()
        .resolve(
            "default-library/default-library-manifest.json",
            BaseDirectory::Resource,
        )
        .map_err(|error| format!("无法解析默认论文库清单路径: {error}"))?;
    if resource_database.is_file() && resource_manifest.is_file() {
        return Ok((resource_database, resource_manifest));
    }

    if cfg!(debug_assertions) {
        if let Some(root) = find_project_root() {
            let development_dir = root.join("release-assets").join("default-library");
            let development_database = development_dir.join("research-hotspots-v7.sqlite");
            let development_manifest = development_dir.join("default-library-manifest.json");
            if development_database.is_file() && development_manifest.is_file() {
                return Ok((development_database, development_manifest));
            }
        }
    }

    Err("当前安装包未包含默认论文数据。请使用空白库或现有 SQLite 论文库。".to_string())
}

fn load_default_library_manifest(app: &tauri::AppHandle) -> Result<DefaultLibraryManifest, String> {
    let (_, manifest_path) = default_library_resource_paths(app)?;
    let content = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("无法读取默认论文库清单 {:?}: {error}", manifest_path))?;
    let manifest: DefaultLibraryManifest = serde_json::from_str(&content)
        .map_err(|error| format!("默认论文库清单格式无效: {error}"))?;
    let beta2_compatible = manifest.manifest_schema_version == 2
        && manifest.generator_version == "v20-seed-2"
        && manifest.database_schema_version == research_hotspots_core::V20_SCHEMA_VERSION;
    let v022_compatible = manifest.manifest_schema_version == 3
        && manifest.generator_version == "agent-seed-3"
        // The published v0.22.0-beta.1 seed remains schema 11. It is installed into staging
        // and migrated to the current schema before activation.
        && manifest.database_schema_version == 11;
    let semantic_v4_compatible = manifest.manifest_schema_version == 4
        && manifest.generator_version == "semantic-seed-4"
        && manifest.database_schema_version == 12
        && manifest.algorithm_version.as_deref() == Some("v20-semantic-e5-small-1")
        && manifest.paper_layout_version.as_deref() == Some("semantic-e5-pca3-v1")
        && manifest.projection_version.as_deref() == Some("robust-pca-whiten-v1")
        && manifest.embedding_model_id.as_deref()
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_MODEL_ID)
        && manifest.embedding_model_revision.as_deref()
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_MODEL_REVISION)
        && manifest.embedding_dimensions
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_EMBEDDING_DIMENSIONS)
        && manifest.embedding_encoding.as_deref() == Some("float16-le")
        && manifest.embedding_count == Some(manifest.paper_count);
    let semantic_v5_common = manifest.manifest_schema_version == 5
        && manifest.generator_version == "semantic-seed-5"
        && manifest.database_schema_version == research_hotspots_core::LIBRARY_SCHEMA_VERSION
        && manifest.embedding_model_id.as_deref()
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_MODEL_ID)
        && manifest.embedding_model_revision.as_deref()
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_MODEL_REVISION)
        && manifest.embedding_dimensions
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_EMBEDDING_DIMENSIONS)
        && manifest.embedding_encoding.as_deref() == Some("float16-le")
        && manifest.embedding_count == Some(manifest.paper_count)
        && manifest.hotspot_identity_version.as_deref()
            == Some(research_hotspots_core::HOTSPOT_IDENTITY_VERSION);
    let semantic_v5_current = manifest.algorithm_version.as_deref()
        == Some(research_hotspots_core::V20_ALGORITHM_VERSION)
        && manifest.paper_layout_version.as_deref()
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_LAYOUT_VERSION)
        && manifest.projection_version.as_deref()
            == Some(research_hotspots_core::semantic_layout::SEMANTIC_PROJECTION_VERSION);
    // Keep the already-published v2 seed installable as a migration source. Once installed, it is
    // clearly marked as an old layout and requires an explicit v3 modeling run before galaxy use.
    let semantic_v5_published_v2 = manifest.algorithm_version.as_deref()
        == Some("v20-semantic-e5-small-2")
        && manifest.paper_layout_version.as_deref() == Some("semantic-hierarchical-pca3-v2")
        && manifest.projection_version.as_deref() == Some("centroid-pca3-robust-whiten-v2");
    let semantic_v5_compatible = semantic_v5_common
        && (semantic_v5_current || semantic_v5_published_v2);
    if !beta2_compatible && !v022_compatible && !semantic_v4_compatible && !semantic_v5_compatible {
        return Err("默认论文库清单版本与当前应用不兼容。".to_string());
    }
    if manifest.project_id.trim().is_empty()
        || manifest.snapshot_id.trim().is_empty()
        || manifest.membership_count != manifest.paper_count
    {
        return Err("默认论文库清单缺少有效的 V20 快照信息。".to_string());
    }
    Ok(manifest)
}

fn validate_library_location_impl(
    app: &tauri::AppHandle,
    database_dir: &str,
    mode: &str,
) -> Result<LibraryLocationValidation, String> {
    let mode_name = mode.trim().to_ascii_lowercase();
    let mode =
        FirstRunMode::parse(&mode_name).map_err(|_| "未知的论文库初始化方式。".to_string())?;
    if database_dir.trim().is_empty() {
        return Err("请先选择论文库目录。".to_string());
    }

    let database_dir = PathBuf::from(database_dir.trim());
    let seed_size = if mode == FirstRunMode::Seed {
        Some(load_default_library_manifest(app)?.size_bytes)
    } else {
        None
    };
    let core = research_hotspots_core::validate_first_run_location(
        &database_dir,
        mode,
        &default_project_id(),
        seed_size,
    )?;
    let existing_database_valid = core.existing.is_some();
    let (paper_count, hotspot_count, membership_count, snapshot_id, database_schema_version) = core
        .existing
        .as_ref()
        .map(|value| {
            (
                value.paper_count,
                value.hotspot_count,
                value.membership_count,
                value.snapshot_id.clone(),
                Some(value.schema_version),
            )
        })
        .unwrap_or((0, 0, 0, None, None));
    let message = match core.message.as_str() {
        "ok" => "目录检查通过。".to_string(),
        "LIBRARY_DIRECTORY_NOT_WRITABLE" => "所选目录不可写，请选择其他目录。".to_string(),
        "EXISTING_LIBRARY_NOT_FOUND" => {
            "所选目录中未找到 research-hotspots-v7.sqlite。".to_string()
        }
        "TARGET_ALREADY_EXISTS" => {
            "所选目录已包含有效论文库。请选择“使用现有库”，应用不会覆盖它。".to_string()
        }
        "TARGET_DATABASE_INVALID" => {
            "所选目录已包含同名但无效的数据库。请移走该文件或选择其他目录。".to_string()
        }
        "INSUFFICIENT_DISK_SPACE" => format!(
            "可用空间不足：至少需要 {} MB。",
            core.required_space_bytes / 1024 / 1024
        ),
        error => error.to_string(),
    };

    Ok(LibraryLocationValidation {
        valid: core.valid,
        database_dir: database_dir.to_string_lossy().to_string(),
        database_path: core.database_path.to_string_lossy().to_string(),
        writable: core.writable,
        available_space_bytes: core.available_space_bytes,
        required_space_bytes: core.required_space_bytes,
        existing_database: core.existing_database,
        existing_database_valid,
        paper_count,
        hotspot_count,
        membership_count,
        requires_modeling: existing_database_valid && snapshot_id.is_none(),
        snapshot_id,
        database_schema_version,
        message,
    })
}

fn create_empty_library(database_path: &Path) -> Result<(), String> {
    create_empty_library_atomically(database_path, &default_project_id())
        .map(|_| ())
        .map_err(|error| match error.as_str() {
            "TARGET_ALREADY_EXISTS" => "目标目录已存在论文库，应用不会覆盖它。".to_string(),
            _ => format!("空白论文库安全初始化失败: {error}"),
        })
}

fn install_seed_library(app: &tauri::AppHandle, database_path: &Path) -> Result<(), String> {
    if database_path.exists() {
        return Err("目标目录已存在论文库，应用不会覆盖它。".to_string());
    }
    let (seed_path, _) = default_library_resource_paths(app)?;
    let manifest = load_default_library_manifest(app)?;
    let expectation = SeedExpectation {
        sha256: manifest.sha256,
        size_bytes: manifest.size_bytes,
        schema_version: manifest.database_schema_version,
        project_id: manifest.project_id,
        snapshot_id: manifest.snapshot_id,
        paper_count: manifest.paper_count,
        hotspot_count: manifest.hotspot_count,
        membership_count: manifest.membership_count,
    };
    install_seed_library_atomically(&seed_path, database_path, &expectation)
        .map(|_| ())
        .map_err(|error| match error.as_str() {
            "TARGET_ALREADY_EXISTS" => "目标目录已存在论文库，应用不会覆盖它。".to_string(),
            _ => format!("默认论文库安全安装失败: {error}"),
        })
}

fn validate_database_file(database_path: &Path) -> Result<LibraryFileValidation, String> {
    let project_id = default_project_id();
    let verified = validate_library_candidate_file(database_path, &project_id)
        .map_err(|error| format!("SQLite 论文库验证失败: {error}"))?;
    Ok(LibraryFileValidation {
        schema_version: verified.schema_version,
        snapshot_id: verified.snapshot_id,
        paper_count: verified.paper_count,
        hotspot_count: verified.hotspot_count,
        membership_count: verified.membership_count,
        integrity_check: "ok".to_string(),
    })
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("无法读取文件 {:?}: {error}", path))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("无法计算 SHA-256: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn open_library_database(
    app: &tauri::AppHandle,
    database_dir: Option<String>,
) -> Result<(Connection, PathBuf, PathBuf), String> {
    let database_dir = resolve_database_dir(app, database_dir)?;
    fs::create_dir_all(&database_dir)
        .map_err(|error| format!("Cannot create library dir {:?}: {error}", database_dir))?;
    recover_interrupted_restore(&database_dir)?;
    let database_path = database_dir.join("research-hotspots-v7.sqlite");
    if database_path.exists() {
        migrate_library_file(
            &database_path,
            &default_project_id(),
            now_millis().min(i64::MAX as u128) as i64,
            true,
        )?;
    }
    let conn = Connection::open(&database_path)
        .map_err(|error| format!("Cannot open SQLite library {:?}: {error}", database_path))?;
    initialize_library_database(&conn)?;
    AgentRepository::new(&conn)?.recover_expired_runs(now_millis().min(i64::MAX as u128) as i64)?;
    Ok((conn, database_dir, database_path))
}

fn resolve_database_dir(
    _app: &tauri::AppHandle,
    database_dir: Option<String>,
) -> Result<PathBuf, String> {
    if let Some(value) = database_dir.filter(|value| !value.trim().is_empty()) {
        return Ok(PathBuf::from(value));
    }

    if cfg!(debug_assertions) {
        if let Some(root) = find_project_root() {
            return Ok(root.join("data").join("library"));
        }
    }

    Err("论文库尚未配置。请先完成首次启动设置。".to_string())
}

fn initialize_library_database(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            abstract TEXT NOT NULL,
            authors TEXT,
            categories TEXT,
            field TEXT NOT NULL,
            published_date TEXT,
            year INTEGER,
            url TEXT,
            doi TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            search_blob TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_papers_project_year ON papers(project_id, year);
        CREATE INDEX IF NOT EXISTS idx_papers_project_source ON papers(project_id, source);
        CREATE INDEX IF NOT EXISTS idx_papers_project_field ON papers(project_id, field);
        CREATE INDEX IF NOT EXISTS idx_papers_project_updated ON papers(project_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_papers_project_doi ON papers(project_id, doi);
        CREATE INDEX IF NOT EXISTS idx_papers_project_source_year ON papers(project_id, source, year);
        CREATE INDEX IF NOT EXISTS idx_papers_project_field_year ON papers(project_id, field, year);
        CREATE INDEX IF NOT EXISTS idx_papers_project_source_field_year ON papers(project_id, source, field, year);

        CREATE TABLE IF NOT EXISTS app17_paper_topics (
            project_id TEXT NOT NULL,
            raw_paper_id TEXT NOT NULL,
            scoped_paper_id TEXT NOT NULL,
            field TEXT NOT NULL,
            topic_id INTEGER NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            z REAL NOT NULL,
            year INTEGER,
            PRIMARY KEY(project_id, raw_paper_id)
        );

        CREATE INDEX IF NOT EXISTS idx_app17_paper_topics_project_topic ON app17_paper_topics(project_id, field, topic_id);
        CREATE INDEX IF NOT EXISTS idx_app17_paper_topics_project_scoped ON app17_paper_topics(project_id, scoped_paper_id);

        CREATE TABLE IF NOT EXISTS app17_hotspots (
            project_id TEXT NOT NULL,
            field TEXT NOT NULL,
            topic_id INTEGER NOT NULL,
            title_cn TEXT,
            topic_label TEXT,
            summary_cn TEXT,
            paper_count INTEGER,
            trend_status TEXT,
            evolution_json TEXT,
            PRIMARY KEY(project_id, field, topic_id)
        );

        CREATE INDEX IF NOT EXISTS idx_app17_hotspots_project_count ON app17_hotspots(project_id, paper_count DESC);

        CREATE TABLE IF NOT EXISTS app17_hotspot_reviews (
            project_id TEXT NOT NULL,
            field TEXT NOT NULL,
            topic_id INTEGER NOT NULL,
            review_cn TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(project_id, field, topic_id, created_at)
        );
        ",
    )
    .map_err(|error| error.to_string())?;
    let _ = conn.execute(
        "ALTER TABLE papers ADD COLUMN search_blob TEXT NOT NULL DEFAULT ''",
        [],
    );
    research_hotspots_core::ensure_library_schema(conn)?;
    Ok(())
}

fn row_to_paper(row: &rusqlite::Row<'_>) -> rusqlite::Result<PaperRecord> {
    Ok(PaperRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        source: row.get(2)?,
        title: row.get(3)?,
        abstract_text: row.get(4)?,
        authors: row.get(5)?,
        categories: row.get(6)?,
        field: row.get(7)?,
        published_date: row.get(8)?,
        year: row.get(9)?,
        url: row.get(10)?,
        doi: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn count_facets(
    conn: &Connection,
    field_expr: &str,
    project_id: &str,
    limit: i64,
) -> Result<Vec<CountFacet>, String> {
    let null_guard = if field_expr.contains("year") {
        "AND year IS NOT NULL"
    } else {
        ""
    };
    let sql = format!(
        "SELECT {field_expr} AS value, COUNT(*) AS count
         FROM papers
         WHERE project_id = ?1 {null_guard}
         GROUP BY value
         HAVING value IS NOT NULL AND value <> ''
         ORDER BY count DESC, value ASC
         LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![project_id, limit], |row| {
            Ok(CountFacet {
                value: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(rows)
}

fn normalize_query(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value.replace('%', "\\%").replace('_', "\\_")))
}

fn normalize_filter(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "all")
}

fn paper_search_blob(paper: &PaperRecord) -> String {
    format!(
        "{} {} {} {} {} {}",
        paper.title,
        paper.abstract_text,
        paper.authors.as_deref().unwrap_or_default(),
        paper.categories.as_deref().unwrap_or_default(),
        paper.doi.as_deref().unwrap_or_default(),
        paper.url.as_deref().unwrap_or_default(),
    )
    .to_lowercase()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn paper_dedupe_key(doi: Option<&str>, url: Option<&str>, title: &str) -> Option<String> {
    normalize_identity_key(doi)
        .map(|value| format!("doi:{value}"))
        .or_else(|| normalize_identity_key(url).map(|value| format!("url:{value}")))
        .or_else(|| {
            let title_key = collapse_whitespace(title).to_lowercase();
            if title_key.is_empty() {
                None
            } else {
                Some(format!("title:{title_key}"))
            }
        })
}

fn normalize_identity_key(value: Option<&str>) -> Option<String> {
    value
        .map(|value| value.trim().trim_end_matches('/').to_lowercase())
        .filter(|value| !value.is_empty())
}

fn scoped_id(project_id: &str, id: &str) -> String {
    if id.starts_with(&format!("{project_id}:")) {
        id.to_string()
    } else {
        format!("{project_id}:{id}")
    }
}

fn default_project_id() -> String {
    "project-default".to_string()
}

fn now_millis_string() -> String {
    now_millis().to_string()
}

fn cluster_group_to_hotspot(
    project_id: &str,
    group: ClusterGroup,
    index: usize,
    timestamp: &str,
) -> HotspotRecord {
    let keywords = sorted_keywords(&group.keyword_counts, 12);
    let keyword_weights = keyword_weights(&group.keyword_counts, &keywords);
    let years = sorted_years(&group.years);
    let trend = infer_trend(&years);
    let confidence = (0.38 + ((group.paper_count + 1) as f64).ln() / 8.0).min(0.96);
    let representative_ids =
        ranked_representative_ids(&group.representative_candidates, &keywords, 18);
    let analysis = build_hotspot_analysis(&group, &keywords, &years, &representative_ids);
    let title = keywords
        .iter()
        .take(3)
        .map(|keyword| capitalize_ascii(keyword))
        .collect::<Vec<_>>()
        .join(" ");
    let cluster_key = semantic_hotspot_identity_key(&group.field, &group.keyword);
    // The final coordinates are populated from all assigned member embeddings after the
    // retained and overflow groups have been assigned. Never fall back to a hash/radial layout.
    let coordinates = HotspotCoordinates {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    let evolution = years
        .iter()
        .map(|(year, count)| {
            let representative_ids = group
                .year_representatives
                .get(year)
                .map(|rows| ranked_representative_ids(rows, &keywords, 6))
                .unwrap_or_default();
            HotspotEvolution {
                year: *year,
                count: *count,
                keywords: keywords.iter().take(6).cloned().collect(),
                representative_ids,
            }
        })
        .collect::<Vec<_>>();
    let label = keywords
        .iter()
        .take(5)
        .cloned()
        .collect::<Vec<_>>()
        .join("_");
    let summary_keywords = keywords
        .iter()
        .take(6)
        .cloned()
        .collect::<Vec<_>>()
        .join("、");
    let warnings = if analysis.warnings.is_empty() {
        "质量信号稳定".to_string()
    } else {
        analysis.warnings.join("；")
    };

    HotspotRecord {
        id: stable_semantic_hotspot_id(project_id, &cluster_key),
        project_id: project_id.to_string(),
        field: group.field.clone(),
        topic_id: index as i64 + 1,
        title: if title.is_empty() { group.field.clone() } else { title },
        label,
        summary: format!(
            "基于 {} 篇 SQLite 论文库文献生成的 V20 聚合热点。核心词：{}。趋势：{}；代表证据 {} 篇；关键词集中度 {}%；{}。",
            group.paper_count,
            summary_keywords,
            trend,
            representative_ids.len(),
            (analysis.keyword_focus * 100.0).round() as i64,
            warnings
        ),
        keywords,
        keyword_weights,
        paper_count: group.paper_count,
        trend,
        confidence,
        source: "worker".to_string(),
        coordinates,
        evolution,
        source_distribution: sorted_count_facets_from_map(&group.source_counts, 8),
        similar_hotspots: Vec::new(),
        analysis,
        updated_at: timestamp.to_string(),
    }
}

fn sorted_count_facets_from_map(counts: &HashMap<String, i64>, limit: usize) -> Vec<CountFacet> {
    let mut rows = counts
        .iter()
        .map(|(value, count)| (value.clone(), *count))
        .collect::<Vec<_>>();
    rows.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    rows.into_iter()
        .take(limit)
        .map(|(value, count)| CountFacet { value, count })
        .collect()
}

fn build_hotspot_analysis(
    group: &ClusterGroup,
    keywords: &[String],
    years: &[(i64, i64)],
    representative_ids: &[String],
) -> HotspotAnalysis {
    let total_keyword_hits = group.keyword_counts.values().copied().sum::<i64>().max(1) as f64;
    let top_keyword_hits = keywords
        .iter()
        .take(3)
        .map(|keyword| *group.keyword_counts.get(keyword).unwrap_or(&0))
        .sum::<i64>() as f64;
    let keyword_focus = round_metric(top_keyword_hits / total_keyword_hits);
    let expected_representatives = group.paper_count.min(18).max(1) as f64;
    let representative_coverage =
        round_metric(representative_ids.len() as f64 / expected_representatives);
    let recent_momentum = round_metric(recent_momentum_score(years));
    let source_diversity = round_metric(source_diversity_score(&group.source_counts));
    let mut warnings = Vec::new();

    if keyword_focus < 0.18 {
        warnings.push("关键词分散，热点边界需要人工复核".to_string());
    }
    if representative_coverage < 0.65 {
        warnings.push("代表论文证据包偏少".to_string());
    }
    if years.len() <= 1 {
        warnings.push("年度演化证据不足".to_string());
    }
    if source_diversity < 0.25 && group.paper_count >= 8 {
        warnings.push("来源过于集中".to_string());
    }

    HotspotAnalysis {
        keyword_focus,
        representative_coverage,
        recent_momentum,
        source_diversity,
        evidence_paper_ids: representative_ids.iter().take(18).cloned().collect(),
        warnings,
    }
}

fn ranked_representative_ids(
    candidates: &[RepresentativeCandidate],
    keywords: &[String],
    limit: usize,
) -> Vec<String> {
    let keyword_set = keywords
        .iter()
        .take(8)
        .map(|keyword| keyword.to_lowercase())
        .collect::<HashSet<_>>();
    let mut rows = candidates
        .iter()
        .map(|candidate| {
            let overlap = candidate
                .terms
                .iter()
                .filter(|term| keyword_set.contains(&term.to_lowercase()))
                .count() as f64;
            let year_score = candidate
                .year
                .map(|year| ((year - 2000).max(0) as f64 / 30.0).min(1.0))
                .unwrap_or(0.0);
            let source_score = if candidate.source.trim().is_empty() {
                0.0
            } else {
                0.16
            };
            (
                candidate.id.clone(),
                candidate.evidence_score + overlap * 1.35 + year_score * 0.42 + source_score,
            )
        })
        .collect::<Vec<_>>();
    rows.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });

    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for (id, _) in rows {
        if seen.insert(id.clone()) {
            output.push(id);
        }
        if output.len() >= limit {
            break;
        }
    }
    output
}

fn candidate_evidence_score(
    title: &str,
    abstract_text: &str,
    year: Option<i64>,
    doi: Option<&str>,
    url: Option<&str>,
    terms: &[String],
) -> f64 {
    let title_score = if title.chars().count() >= 12 {
        0.7
    } else {
        0.2
    };
    let abstract_len = abstract_text.chars().count();
    let abstract_score = if abstract_len >= 260 {
        1.2
    } else if abstract_len >= 120 {
        0.82
    } else if abstract_len >= 60 {
        0.45
    } else {
        0.08
    };
    let metadata_score = year.map(|_| 0.28).unwrap_or(0.0)
        + doi
            .filter(|value| !value.trim().is_empty())
            .map(|_| 0.32)
            .unwrap_or(0.0)
        + url
            .filter(|value| !value.trim().is_empty())
            .map(|_| 0.18)
            .unwrap_or(0.0);
    let term_score = terms.len().min(14) as f64 * 0.08;
    title_score + abstract_score + metadata_score + term_score
}

fn recent_momentum_score(years: &[(i64, i64)]) -> f64 {
    if years.len() < 2 {
        return 0.0;
    }
    let last_year = years.last().map(|(year, _)| *year).unwrap_or_default();
    let recent = years
        .iter()
        .filter(|(year, _)| *year >= last_year - 2)
        .map(|(_, count)| *count)
        .sum::<i64>() as f64;
    let previous = years
        .iter()
        .filter(|(year, _)| *year < last_year - 2 && *year >= last_year - 5)
        .map(|(_, count)| *count)
        .sum::<i64>() as f64;
    if previous <= 0.0 {
        return if recent > 0.0 { 0.12 } else { 0.0 };
    }
    ((recent - previous) / (recent + previous).max(1.0)).clamp(-1.0, 1.0)
}

fn source_diversity_score(counts: &HashMap<String, i64>) -> f64 {
    let total = counts.values().copied().sum::<i64>() as f64;
    if total <= 0.0 || counts.len() <= 1 {
        return 0.0;
    }
    let entropy = counts
        .values()
        .map(|count| {
            let p = *count as f64 / total;
            if p <= 0.0 {
                0.0
            } else {
                -p * p.log2()
            }
        })
        .sum::<f64>();
    let max_entropy = (counts.len() as f64).log2().max(1.0);
    entropy / max_entropy
}

fn assign_similar_hotspots(hotspots: &mut [HotspotRecord]) {
    let mut relations = vec![Vec::<SimilarHotspotRelation>::new(); hotspots.len()];
    for index in 0..hotspots.len() {
        for next_index in (index + 1)..hotspots.len() {
            let score = hotspot_keyword_similarity(
                &hotspots[index].keywords,
                &hotspots[next_index].keywords,
            ) + if hotspots[index].field == hotspots[next_index].field {
                0.08
            } else {
                0.0
            };
            if score <= 0.02 {
                continue;
            }
            let rounded = (score * 100.0).round() / 100.0;
            relations[index].push(SimilarHotspotRelation {
                hotspot_id: hotspots[next_index].id.clone(),
                score: rounded,
            });
            relations[next_index].push(SimilarHotspotRelation {
                hotspot_id: hotspots[index].id.clone(),
                score: rounded,
            });
        }
    }
    for (index, mut rows) in relations.into_iter().enumerate() {
        rows.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.hotspot_id.cmp(&b.hotspot_id))
        });
        rows.truncate(8);
        hotspots[index].similar_hotspots = rows;
    }
}

fn hotspot_keyword_similarity(left: &[String], right: &[String]) -> f64 {
    let left = left
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<HashSet<_>>();
    let right = right
        .iter()
        .map(|value| value.to_lowercase())
        .collect::<HashSet<_>>();
    if left.is_empty() && right.is_empty() {
        return 0.0;
    }
    let shared = left.intersection(&right).count() as f64;
    let union = left.union(&right).count().max(1) as f64;
    shared / union
}

fn sorted_keywords(counts: &HashMap<String, i64>, limit: usize) -> Vec<String> {
    let mut rows = counts
        .iter()
        .map(|(keyword, count)| (keyword.clone(), *count))
        .collect::<Vec<_>>();
    rows.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    rows.into_iter()
        .take(limit)
        .map(|(keyword, _)| keyword)
        .collect()
}

fn keyword_weights(counts: &HashMap<String, i64>, keywords: &[String]) -> Vec<KeywordWeight> {
    let max = counts.values().copied().max().unwrap_or(1) as f64;
    keywords
        .iter()
        .map(|keyword| KeywordWeight {
            keyword: keyword.clone(),
            weight: ((*counts.get(keyword).unwrap_or(&0) as f64 / max) * 100.0).round() / 100.0,
        })
        .collect()
}

fn sorted_years(years: &HashMap<i64, i64>) -> Vec<(i64, i64)> {
    let mut rows = years
        .iter()
        .map(|(year, count)| (*year, *count))
        .collect::<Vec<_>>();
    rows.sort_by_key(|(year, _)| *year);
    rows
}

fn infer_trend(years: &[(i64, i64)]) -> String {
    if years.len() < 2 {
        return "Stable".to_string();
    }
    let momentum = recent_momentum_score(years);
    if momentum >= 0.22 {
        "Surging".to_string()
    } else if momentum <= -0.22 {
        "Declining".to_string()
    } else {
        "Stable".to_string()
    }
}

fn weighted_token_counts(
    title: &str,
    abstract_text: &str,
    categories: Option<&str>,
) -> HashMap<String, i64> {
    let mut counts = HashMap::new();
    add_weighted_terms(&mut counts, title, 4);
    add_weighted_terms(&mut counts, categories.unwrap_or_default(), 3);
    add_weighted_terms(&mut counts, abstract_text, 1);
    counts
}

fn add_weighted_terms(counts: &mut HashMap<String, i64>, text: &str, weight: i64) {
    for token in extract_terms(text) {
        *counts.entry(token).or_insert(0) += weight;
    }
}

fn extract_terms(text: &str) -> Vec<String> {
    let mut output = Vec::new();
    let mut ascii = String::new();
    let mut cjk = String::new();

    for character in text.chars() {
        if character.is_ascii_alphanumeric() || character == '-' {
            flush_cjk_terms(&mut output, &mut cjk);
            ascii.push(character.to_ascii_lowercase());
        } else if is_cjk_character(character) {
            flush_ascii_term(&mut output, &mut ascii);
            cjk.push(character);
        } else {
            flush_ascii_term(&mut output, &mut ascii);
            flush_cjk_terms(&mut output, &mut cjk);
        }
    }
    flush_ascii_term(&mut output, &mut ascii);
    flush_cjk_terms(&mut output, &mut cjk);
    output
}

fn flush_ascii_term(output: &mut Vec<String>, value: &mut String) {
    let token = value.trim_matches('-').to_lowercase();
    value.clear();
    if token.len() < 3
        || token.chars().all(|character| character.is_ascii_digit())
        || is_stopword(&token)
    {
        return;
    }
    output.push(token);
}

fn flush_cjk_terms(output: &mut Vec<String>, value: &mut String) {
    let chars = value.chars().collect::<Vec<_>>();
    value.clear();
    if chars.len() < 2 {
        return;
    }
    for width in 2..=chars.len().min(4) {
        for window in chars.windows(width) {
            let token = window.iter().collect::<String>();
            if !is_stopword(&token) {
                output.push(token);
            }
        }
    }
}

fn is_cjk_character(character: char) -> bool {
    ('\u{4e00}'..='\u{9fff}').contains(&character) || ('\u{3400}'..='\u{4dbf}').contains(&character)
}

fn round_metric(value: f64) -> f64 {
    (value.clamp(-1.0, 1.0) * 100.0).round() / 100.0
}

fn stable_hash(value: &str) -> u32 {
    let mut hash = 2166136261u32;
    for byte in value.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16777619);
    }
    hash
}

fn is_stopword(value: &str) -> bool {
    matches!(
        value,
        "the"
            | "and"
            | "for"
            | "with"
            | "from"
            | "this"
            | "that"
            | "using"
            | "based"
            | "paper"
            | "papers"
            | "study"
            | "studies"
            | "research"
            | "model"
            | "models"
            | "method"
            | "methods"
            | "data"
            | "dataset"
            | "datasets"
            | "analysis"
            | "result"
            | "results"
            | "system"
            | "systems"
            | "approach"
            | "framework"
            | "propose"
            | "proposed"
            | "task"
            | "tasks"
            | "performance"
            | "研究"
            | "方法"
            | "模型"
            | "系统"
            | "数据"
            | "分析"
            | "结果"
            | "本文"
            | "基于"
            | "提出"
    )
}

fn normalize_group_key(value: &str) -> String {
    let normalized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if normalized.is_empty() {
        "local".to_string()
    } else {
        normalized
    }
}

fn safe_manifest_label(value: &str) -> String {
    let normalized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();
    if normalized.is_empty() {
        "mysql".to_string()
    } else {
        normalized
    }
}

fn capitalize_ascii(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
        None => String::new(),
    }
}

fn resolve_python() -> PathBuf {
    if let Ok(value) = std::env::var("RESEARCH_HOTSPOTS_PYTHON") {
        let path = PathBuf::from(value);
        if path.exists() {
            return path;
        }
    }

    let preferred = PathBuf::from(r"D:\yingyong\conda\envs\My_env\python.exe");
    if preferred.exists() {
        return preferred;
    }

    PathBuf::from("python")
}

fn hidden_python_command() -> Command {
    let mut command = Command::new(resolve_python());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn find_worker_script(script_name: &str) -> Option<PathBuf> {
    find_project_file(&["workers", script_name])
}

fn find_project_root() -> Option<PathBuf> {
    find_project_file(&["package.json"]).and_then(|path| path.parent().map(PathBuf::from))
}

fn find_project_file(parts: &[&str]) -> Option<PathBuf> {
    let mut roots = Vec::new();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    roots.push(manifest_dir.clone());
    if let Some(parent) = manifest_dir.parent() {
        roots.push(parent.to_path_buf());
    }
    if let Ok(current_dir) = std::env::current_dir() {
        roots.push(current_dir);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }

    for root in roots {
        for ancestor in root.ancestors() {
            let mut candidate = ancestor.to_path_buf();
            for part in parts {
                candidate.push(part);
            }
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn cluster_registry_rejects_same_project_and_allows_independent_keys() {
        let registry = ClusterTaskRegistry::default();
        let database_a = PathBuf::from("D:/library-a/research-hotspots-v7.sqlite");
        let database_b = PathBuf::from("D:/library-b/research-hotspots-v7.sqlite");
        let key_a_project_1 = cluster_task_key(&database_a, "project-1");
        let key_a_project_2 = cluster_task_key(&database_a, "project-2");
        let key_b_project_1 = cluster_task_key(&database_b, "project-1");

        let _first = registry
            .try_acquire(key_a_project_1.clone())
            .expect("first task should acquire permit");
        assert_eq!(
            registry.try_acquire(key_a_project_1).err().as_deref(),
            Some(CLUSTER_ALREADY_RUNNING)
        );
        let _different_project = registry
            .try_acquire(key_a_project_2)
            .expect("different project should run independently");
        let _different_database = registry
            .try_acquire(key_b_project_1)
            .expect("different database should run independently");
        assert_eq!(registry.running_count(), 3);
    }

    #[test]
    fn cluster_registry_releases_permit_after_success_error_and_panic() {
        let registry = ClusterTaskRegistry::default();
        let key = "D:/library/research-hotspots-v7.sqlite::project-1".to_string();

        {
            let _permit = registry
                .try_acquire(key.clone())
                .expect("success path permit");
        }
        assert_eq!(registry.running_count(), 0);

        let error_result: Result<(), String> = (|| {
            let _permit = registry.try_acquire(key.clone())?;
            Err("simulated cluster error".to_string())
        })();
        assert_eq!(error_result.unwrap_err(), "simulated cluster error");
        assert_eq!(registry.running_count(), 0);

        let panic_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _permit = registry
                .try_acquire(key.clone())
                .expect("panic path permit");
            panic!("simulated cluster panic");
        }));
        assert!(panic_result.is_err());
        assert_eq!(registry.running_count(), 0);
        let _reacquired = registry
            .try_acquire(key)
            .expect("permit should be reusable after panic");
    }

    #[test]
    fn background_cluster_helper_matches_direct_cluster_result() {
        let base_dir = std::env::temp_dir().join(format!(
            "research-hotspots-background-cluster-{}",
            now_millis()
        ));
        fs::create_dir_all(&base_dir).expect("cluster test dir");
        let database_path = base_dir.join("research-hotspots-v7.sqlite");
        let project_id = "unit-background-cluster";
        let direct_result = {
            let mut conn = Connection::open(&database_path).expect("sqlite database");
            initialize_library_database(&conn).expect("schema should initialize");
            upsert_paper_rows(
                &mut conn,
                project_id,
                vec![
                    test_paper(
                        "background-1",
                        "Retrieval Grounded Scientific Agents",
                        "Retrieval evidence agents validate citations and synthesize research.",
                        "Artificial Intelligence",
                        2026,
                        Some("10.0000/background-1"),
                    ),
                    test_paper(
                        "background-2",
                        "Graph Retrieval Evidence Systems",
                        "Graph retrieval systems organize evidence and scientific citations.",
                        "Artificial Intelligence",
                        2025,
                        Some("10.0000/background-2"),
                    ),
                ],
            )
            .expect("insert papers");
            cluster_library_connection(&conn, project_id).expect("direct cluster")
        };

        let background_result = cluster_library_from_database_path(
            database_path,
            project_id,
            semantic_embedding::SemanticEmbeddingDevice::Cpu,
        )
        .expect("background helper cluster");
        assert_eq!(background_result.before_count, direct_result.before_count);
        assert_eq!(background_result.cluster_count, direct_result.cluster_count);
        assert_eq!(
            background_result
                .hotspots
                .iter()
                .map(|hotspot| &hotspot.id)
                .collect::<Vec<_>>(),
            direct_result
                .hotspots
                .iter()
                .map(|hotspot| &hotspot.id)
                .collect::<Vec<_>>()
        );
        let _ = fs::remove_dir_all(base_dir);
    }

    #[test]
    fn empty_upsert_preserves_library_revision_and_active_snapshot() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite");
        initialize_library_database(&conn).expect("schema should initialize");
        let project_id = "unit-empty-upsert";
        upsert_paper_rows(
            &mut conn,
            project_id,
            vec![test_paper(
                "paper-1",
                "Stable V20 evidence",
                "An empty import must not invalidate this snapshot.",
                "Artificial Intelligence",
                2026,
                Some("10.0000/empty-upsert"),
            )],
        )
        .expect("insert paper");
        let clustered =
            cluster_library_connection(&conn, project_id).expect("create active snapshot");
        let revision_before =
            current_library_revision(&conn, project_id).expect("revision before empty upsert");
        let state_before = read_analysis_state(&conn, project_id)
            .expect("state before empty upsert")
            .expect("active state before empty upsert");

        let mutation =
            upsert_paper_rows(&mut conn, project_id, Vec::new()).expect("empty upsert succeeds");
        assert_eq!(mutation.inserted, 0);
        assert_eq!(mutation.updated, 0);
        assert_eq!(mutation.total, 0);
        assert_eq!(
            current_library_revision(&conn, project_id).expect("revision after empty upsert"),
            revision_before
        );
        let state_after = read_analysis_state(&conn, project_id)
            .expect("state after empty upsert")
            .expect("active state after empty upsert");
        assert_eq!(state_after.active_snapshot_id, clustered.snapshot_id);
        assert_eq!(state_after, state_before);
    }

    #[test]
    fn import_normalization_accepts_chinese_json_aliases() {
        let value = serde_json::json!({
            "文献编号": "cn-sample-001",
            "题名": "知识图谱信号驱动的科研热点演化分析",
            "摘要": "本文研究年度演化、关键词网络与来源多样性在科研热点分析中的作用。",
            "年份": "2024-06-18",
            "来源": "知网",
            "学科": "Knowledge Graph",
            "链接": "https://example.org/cn-sample-001",
            "作者": ["王明", "赵宁"],
            "关键词": ["知识图谱", "热点演化"]
        });

        let row = json_value_to_import_row(&value).expect("json object should become import row");
        let paper = normalize_import_paper(row, 1).expect("Chinese aliases should normalize");

        assert_eq!(paper.id, "cn-sample-001");
        assert_eq!(paper.source, "cnki");
        assert_eq!(paper.title, "知识图谱信号驱动的科研热点演化分析");
        assert_eq!(paper.year, Some(2024));
        assert_eq!(paper.field, "Knowledge Graph");
        assert_eq!(
            paper.url.as_deref(),
            Some("https://example.org/cn-sample-001")
        );
        assert!(paper
            .authors
            .as_deref()
            .unwrap_or_default()
            .contains("王明"));
        assert!(paper
            .categories
            .as_deref()
            .unwrap_or_default()
            .contains("热点演化"));
    }

    #[test]
    fn import_normalization_accepts_english_csv_aliases_and_defaults() {
        let mut row = HashMap::new();
        row.insert(
            normalize_import_key("paper_id"),
            "en-sample-001".to_string(),
        );
        row.insert(
            normalize_import_key("display_name"),
            "Citation-Grounded Review Generation with Evidence Profiles".to_string(),
        );
        row.insert(normalize_import_key("published"), "2025-11-04".to_string());
        row.insert(normalize_import_key("database"), "OpenAlex".to_string());
        row.insert(
            normalize_import_key("discipline"),
            "Artificial Intelligence".to_string(),
        );
        row.insert(
            normalize_import_key("landing_page_url"),
            "https://example.org/en-sample-001".to_string(),
        );
        row.insert(
            normalize_import_key("DOI"),
            "10.0000/en-sample-001".to_string(),
        );
        row.insert(normalize_import_key("creator"), "Chen Yu".to_string());
        row.insert(
            normalize_import_key("tags"),
            "evidence profile; citation audit".to_string(),
        );

        let paper = normalize_import_paper(row, 2).expect("English aliases should normalize");

        assert_eq!(paper.id, "en-sample-001");
        assert_eq!(paper.source, "openalex");
        assert_eq!(paper.year, Some(2025));
        assert_eq!(paper.field, "Artificial Intelligence");
        assert_eq!(
            paper.abstract_text,
            "Local imported paper without abstract."
        );
        assert_eq!(paper.doi.as_deref(), Some("10.0000/en-sample-001"));
        assert_eq!(
            paper.url.as_deref(),
            Some("https://example.org/en-sample-001")
        );
        assert_eq!(paper.authors.as_deref(), Some("Chen Yu"));
        assert_eq!(
            paper.categories.as_deref(),
            Some("evidence profile; citation audit")
        );
    }

    #[test]
    fn sqlite_small_library_pipeline_cleans_queries_and_clusters() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite");
        initialize_library_database(&conn).expect("schema should initialize");
        let project_id = "unit-small-pipeline";

        let mutation = upsert_paper_rows(
            &mut conn,
            project_id,
            vec![
                test_paper(
                    "rag-1",
                    "  Retrieval Augmented Graph Agents  ",
                    "  Retrieval agents combine evidence graphs, citation checking, and scientific synthesis.  ",
                    "Artificial Intelligence",
                    2026,
                    Some("10.0000/rag-duplicate"),
                ),
                test_paper(
                    "rag-duplicate",
                    "Retrieval Augmented Graph Agents Duplicate",
                    "Duplicate DOI should be removed during cleaning.",
                    "Artificial Intelligence",
                    2025,
                    Some("10.0000/rag-duplicate"),
                ),
                test_paper(
                    "kg-1",
                    "Knowledge Graph Hotspot Evolution",
                    "Knowledge graphs model yearly evolution, keyword networks, and source diversity.",
                    "Knowledge Graph",
                    2024,
                    Some("10.0000/kg-1"),
                ),
                test_paper(
                    "local-1",
                    "Local First Scholarly Workstations",
                    "SQLite indexing and local privacy support large scholarly libraries.",
                    "Human-Computer Interaction",
                    2022,
                    Some("10.0000/local-1"),
                ),
                test_paper(
                    "empty-title",
                    "   ",
                    "This row should be removed because the title is empty after normalization.",
                    "Invalid",
                    2023,
                    Some("10.0000/empty-title"),
                ),
            ],
        )
        .expect("upsert should pass");
        assert_eq!(mutation.inserted, 5);
        assert_eq!(mutation.updated, 0);

        let clean = clean_library_connection(&mut conn, project_id).expect("clean should pass");
        assert_eq!(clean.before_count, 5);
        assert_eq!(clean.after_count, 3);
        assert_eq!(clean.empty_removed_count, 1);
        assert_eq!(clean.duplicate_removed_count, 1);
        assert!(clean.updated_count >= 1);

        let retrieval_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM papers WHERE project_id = ?1 AND search_blob LIKE ?2",
                params![project_id, "%citation checking%"],
                |row| row.get(0),
            )
            .expect("query should pass");
        assert_eq!(retrieval_count, 1);

        let cluster = cluster_library_connection(&conn, project_id).expect("cluster should pass");
        assert_eq!(cluster.before_count, 3);
        assert!(cluster.cluster_count >= 3);
        assert!(cluster
            .hotspots
            .iter()
            .any(|hotspot| hotspot.field == "Artificial Intelligence"));
        assert!(cluster
            .hotspots
            .iter()
            .all(|hotspot| !hotspot.analysis.evidence_paper_ids.is_empty()));
        assert!(cluster
            .hotspots
            .iter()
            .all(|hotspot| hotspot.confidence > 0.0));
    }

    #[test]
    fn hotspot_evidence_export_traces_representative_papers() {
        let root =
            find_project_root().unwrap_or_else(|| std::env::current_dir().expect("current dir"));
        let base_dir = root
            .join("work")
            .join(format!("rust-hotspot-evidence-{}", now_millis()));
        fs::create_dir_all(&base_dir).expect("evidence temp dir");
        let database_path = base_dir.join("research-hotspots-v7.sqlite");
        let project_id = "unit-hotspot-evidence";
        {
            let mut conn = Connection::open(&database_path).expect("sqlite database");
            initialize_library_database(&conn).expect("schema should initialize");
            upsert_paper_rows(
                &mut conn,
                project_id,
                vec![
                    test_paper(
                        "evidence-1",
                        "Retrieval Evidence Agents for Scientific Synthesis",
                        "Retrieval agents combine citation evidence, synthesis, and source grounded report generation.",
                        "Artificial Intelligence",
                        2026,
                        Some("10.0000/evidence-1"),
                    ),
                    test_paper(
                        "evidence-2",
                        "Citation Evidence Profiles for Research Reports",
                        "Evidence profiles connect representative papers, yearly evolution, and citation audit for reports.",
                        "Artificial Intelligence",
                        2025,
                        Some("10.0000/evidence-2"),
                    ),
                    test_paper(
                        "evidence-3",
                        "Local SQLite Evidence Tracing for Research Workstations",
                        "Local SQLite stores representative paper evidence for hotspot tracing in research workstations.",
                        "Artificial Intelligence",
                        2024,
                        Some("10.0000/evidence-3"),
                    ),
                ],
            )
            .expect("upsert evidence rows");
        }

        let star_map =
            export_star_map_from_database_path(database_path.clone(), Some(project_id.to_string()))
                .expect("star map export");
        assert!(star_map.evidence_profile.evidence_coverage > 0.0);
        assert!(star_map.evidence_profile.evolution_coverage > 0.0);
        assert!(star_map.evidence_profile.source_distribution_coverage > 0.0);
        assert_eq!(star_map.evidence_profile.sample_signal_count, 0);

        let export = export_hotspot_evidence_from_database_path(
            database_path,
            Some(project_id.to_string()),
            None,
            8,
        )
        .expect("hotspot evidence export");
        assert!(!export.selected_hotspot_id.is_empty());
        assert!(!export.hotspot_keywords.is_empty());
        assert!(!export.representative_ids.is_empty());
        assert!(export.representative_papers.len() >= 1);
        assert!(export.missing_representative_ids.is_empty());
        assert!(!export.year_evolution.is_empty());
        assert!(!export.source_distribution.is_empty());
        assert!(export
            .evidence_profile_markdown
            .contains("Representative Papers"));
        assert!(export
            .representative_papers
            .iter()
            .all(|paper| paper.id.starts_with(&format!("{project_id}:"))));

        fs::remove_dir_all(&base_dir).expect("cleanup evidence temp dir");
    }

    #[test]
    fn app17_hotspot_evidence_queries_snapshot_without_reclustering() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite");
        initialize_library_database(&conn).expect("schema should initialize");
        let project_id = "unit-app17-evidence";
        let mut complete_paper = test_paper(
            "app17-complete",
            "Complete App17 Evidence Paper",
            "A complete abstract should be preferred before a newer placeholder abstract.",
            "Artificial Intelligence",
            2024,
            Some("10.0000/app17-complete"),
        );
        complete_paper.source = "openalex".to_string();
        let mut placeholder_paper = test_paper(
            "app17-placeholder",
            "Newer App17 Placeholder Paper",
            "Local imported paper without abstract.",
            "Artificial Intelligence",
            2026,
            Some("10.0000/app17-placeholder"),
        );
        placeholder_paper.source = "arxiv".to_string();
        upsert_paper_rows(
            &mut conn,
            project_id,
            vec![complete_paper, placeholder_paper],
        )
        .expect("upsert app17 evidence papers");

        conn.execute(
            "INSERT INTO app17_hotspots
             (project_id, field, topic_id, title_cn, topic_label, summary_cn, paper_count, trend_status, evolution_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                project_id,
                "Artificial Intelligence",
                7_i64,
                "App17 精确证据热点",
                "retrieval evidence agents",
                "Snapshot-backed hotspot evidence.",
                2_i64,
                "Surging",
                "[]"
            ],
        )
        .expect("insert app17 hotspot");
        for (raw_id, year) in [
            ("app17-complete", 2024_i64),
            ("app17-placeholder", 2026_i64),
        ] {
            conn.execute(
                "INSERT INTO app17_paper_topics
                 (project_id, raw_paper_id, scoped_paper_id, field, topic_id, x, y, z, year)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    project_id,
                    raw_id,
                    scoped_id(project_id, raw_id),
                    "Artificial Intelligence",
                    7_i64,
                    0.0_f64,
                    0.0_f64,
                    0.0_f64,
                    year
                ],
            )
            .expect("insert app17 paper topic");
        }

        let evidence = query_app17_hotspot_evidence(
            &conn,
            Path::new(":memory:"),
            project_id,
            "Artificial Intelligence",
            7,
            12,
        )
        .expect("query app17 hotspot evidence");

        assert_eq!(
            evidence.selected_hotspot_id,
            "app17:Artificial Intelligence:7"
        );
        assert_eq!(evidence.hotspot_paper_count, 2);
        assert_eq!(evidence.representative_papers.len(), 2);
        assert!(evidence.representative_papers[0]
            .id
            .ends_with(":app17-complete"));
        assert_eq!(
            evidence
                .year_evolution
                .iter()
                .map(|item| item.count)
                .sum::<i64>(),
            2
        );
        assert_eq!(
            evidence
                .source_distribution
                .iter()
                .map(|item| item.count)
                .sum::<i64>(),
            2
        );
        assert!(evidence
            .source_distribution
            .iter()
            .any(|item| item.value == "openalex"));
        assert!(evidence
            .source_distribution
            .iter()
            .any(|item| item.value == "arxiv"));
        assert!(evidence.missing_representative_ids.is_empty());
        assert!(evidence
            .evidence_profile_markdown
            .contains("App17 Hotspot Evidence"));
    }

    #[test]
    fn bibliography_file_import_accepts_bibtex_and_ris() {
        let root =
            find_project_root().unwrap_or_else(|| std::env::current_dir().expect("current dir"));
        let base_dir = root
            .join("work")
            .join(format!("rust-bibliography-import-{}", now_millis()));
        let library_dir = base_dir.join("library");
        fs::create_dir_all(&library_dir).expect("library dir");
        let project_id = "unit-bibliography-import";
        let bib_path = base_dir.join("sample.bib");
        let ris_path = base_dir.join("sample.ris");

        fs::write(
            &bib_path,
            r#"@article{sample_bib_001,
  title = {Retrieval-Augmented Agents for Scientific Literature Synthesis},
  author = {Zhang, Wei and Li, Ming},
  year = {2026},
  journal = {Journal of Scientific AI Systems},
  abstract = {This paper studies retrieval-augmented scientific agents for evidence-grounded literature synthesis.},
  keywords = {retrieval augmented generation; scientific agents},
  doi = {10.0000/rust-bib.1},
  url = {https://example.org/rust-bib-1}
}

@inproceedings{sample_bib_002,
  title = {Knowledge Graph Signals for Research Hotspot Evolution},
  author = {Wang, Ming and Chen, Yu},
  year = {2024},
  booktitle = {Proceedings of Knowledge Graph Analytics},
  abstract = {A knowledge graph based method is proposed for tracking research hotspot evolution over time.},
  keywords = {knowledge graph; hotspot evolution},
  doi = {10.0000/rust-bib.2}
}
"#,
        )
        .expect("write bib sample");
        fs::write(
            &ris_path,
            r#"TY  - JOUR
TI  - Local SQLite Evidence Profiles for Research Hotspot Reports
AU  - Chen, Yu
PY  - 2025
JO  - Research Software Notes
AB  - This study describes local SQLite evidence profiles for traceable research hotspot reports.
KW  - sqlite evidence
KW  - report traceability
DO  - 10.0000/rust-ris.1
ER  -

TY  - CONF
TI  - Semantic Star Maps for Large-Scale Literature Exploration
AU  - Liu, Fang
PY  - 2023
T2  - Conference on Visual Literature Analytics
AB  - The paper presents a semantic star map interface for exploring large-scale literature collections.
KW  - semantic visualization
KW  - literature exploration
UR  - https://example.org/rust-ris-2
ER  -
"#,
        )
        .expect("write ris sample");

        let bib_import = import_paper_file_to_library_path(
            library_dir.clone(),
            Some(project_id.to_string()),
            bib_path,
        )
        .expect("bib import");
        assert_eq!(bib_import.processed_rows, 2);
        assert_eq!(bib_import.inserted, 2);
        assert_eq!(bib_import.invalid_rows, 0);

        let ris_import = import_paper_file_to_library_path(
            library_dir.clone(),
            Some(project_id.to_string()),
            ris_path,
        )
        .expect("ris import");
        assert_eq!(ris_import.processed_rows, 2);
        assert_eq!(ris_import.inserted, 2);
        assert_eq!(ris_import.invalid_rows, 0);

        let conn = Connection::open(library_dir.join("research-hotspots-v7.sqlite"))
            .expect("sqlite database");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("paper count");
        assert_eq!(count, 4);
        let year_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM papers WHERE project_id = ?1 AND year IN (2023, 2024, 2025, 2026)", params![project_id], |row| row.get(0))
            .expect("year count");
        assert_eq!(year_count, 4);
        let doi_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM papers WHERE project_id = ?1 AND doi IS NOT NULL",
                params![project_id],
                |row| row.get(0),
            )
            .expect("doi count");
        assert_eq!(doi_count, 3);
        let keyword_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM papers WHERE project_id = ?1 AND categories LIKE '%evidence%'", params![project_id], |row| row.get(0))
            .expect("keyword count");
        assert_eq!(keyword_count, 1);

        drop(conn);
        fs::remove_dir_all(&base_dir).expect("cleanup bibliography import temp dir");
    }

    #[test]
    fn paper_file_import_is_idempotent_for_resume_recovery() {
        let root =
            find_project_root().unwrap_or_else(|| std::env::current_dir().expect("current dir"));
        let base_dir = root
            .join("work")
            .join(format!("rust-import-recovery-{}", now_millis()));
        let library_dir = base_dir.join("library");
        fs::create_dir_all(&library_dir).expect("library dir");
        let project_id = "unit-import-recovery";
        let jsonl_path = base_dir.join("sample.jsonl");
        fs::write(
            &jsonl_path,
            r#"{"id":"resume-1","title":"Recoverable SQLite Import for Research Libraries","abstract":"Batch upsert makes large paper import safe to rerun after interruption.","year":2026,"source":"local","field":"Research Infrastructure","doi":"10.0000/resume-1"}
{"id":"resume-2","title":"Idempotent Paper Library Upserts","abstract":"Scoped ids and SQLite conflict handling prevent duplicated rows during recovery.","year":2025,"source":"local","field":"Research Infrastructure","doi":"10.0000/resume-2"}
"#,
        )
        .expect("write jsonl sample");

        let first_import = import_paper_file_to_library_path(
            library_dir.clone(),
            Some(project_id.to_string()),
            jsonl_path.clone(),
        )
        .expect("first import");
        assert_eq!(first_import.processed_rows, 2);
        assert_eq!(first_import.inserted, 2);
        assert_eq!(first_import.updated, 0);
        assert!(first_import.recovery.safe_to_rerun);
        assert_eq!(first_import.recovery.batch_size, 1000);
        let first_manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(&first_import.manifest_path).expect("first manifest file"),
        )
        .expect("first manifest json");
        assert_eq!(first_manifest["status"], "done");
        assert_eq!(first_manifest["processedRows"], 2);
        assert_eq!(first_manifest["inserted"], 2);
        assert_eq!(first_manifest["recovery"]["safeToRerun"], true);
        assert_eq!(first_manifest["recovery"]["batchSize"], 1000);

        let second_import = import_paper_file_to_library_path(
            library_dir.clone(),
            Some(project_id.to_string()),
            jsonl_path,
        )
        .expect("second import");
        assert_eq!(second_import.processed_rows, 2);
        assert_eq!(second_import.inserted, 0);
        assert_eq!(second_import.updated, 2);
        assert_eq!(second_import.invalid_rows, 0);
        assert_eq!(second_import.duplicate_rows, 0);
        assert!(second_import.recovery.strategy.contains("Re-run"));
        let second_manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(&second_import.manifest_path).expect("second manifest file"),
        )
        .expect("second manifest json");
        assert_eq!(second_manifest["status"], "done");
        assert_eq!(second_manifest["processedRows"], 2);
        assert_eq!(second_manifest["inserted"], 0);
        assert_eq!(second_manifest["updated"], 2);

        let conn = Connection::open(library_dir.join("research-hotspots-v7.sqlite"))
            .expect("sqlite database");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
                params![project_id],
                |row| row.get(0),
            )
            .expect("paper count");
        assert_eq!(count, 2);

        drop(conn);
        fs::remove_dir_all(&base_dir).expect("cleanup import recovery temp dir");
    }

    #[test]
    fn sqlite_backup_restore_roundtrip_preserves_library() {
        let root =
            find_project_root().unwrap_or_else(|| std::env::current_dir().expect("current dir"));
        let base_dir = root
            .join("work")
            .join(format!("rust-backup-restore-{}", now_millis()));
        let library_dir = base_dir.join("library");
        let backup_dir = base_dir.join("backups");
        fs::create_dir_all(&library_dir).expect("library dir");
        fs::create_dir_all(&backup_dir).expect("backup dir");

        let project_id = "unit-backup-project";
        let database_path = library_dir.join("research-hotspots-v7.sqlite");
        {
            let mut conn = Connection::open(&database_path).expect("sqlite database");
            initialize_library_database(&conn).expect("schema should initialize");
            upsert_paper_rows(
                &mut conn,
                project_id,
                vec![
                    test_paper(
                        "backup-1",
                        "Backup Restore Retrieval Evidence",
                        "Evidence before backup.",
                        "Artificial Intelligence",
                        2026,
                        Some("10.0000/backup-1"),
                    ),
                    test_paper(
                        "backup-2",
                        "Backup Restore Knowledge Graph",
                        "Graph evidence before backup.",
                        "Knowledge Graph",
                        2025,
                        Some("10.0000/backup-2"),
                    ),
                ],
            )
            .expect("initial upsert");
        }

        let backup =
            backup_library_database_path(&library_dir, Some(backup_dir.clone()), project_id)
                .expect("backup should pass");
        assert_eq!(backup.paper_count, 2);
        assert!(PathBuf::from(&backup.backup_path).exists());
        assert!(backup.size_bytes > 0);

        {
            let conn = Connection::open(&database_path).expect("sqlite database");
            conn.execute(
                "DELETE FROM papers WHERE id = ?1 AND project_id = ?2",
                params![scoped_id(project_id, "backup-1"), project_id],
            )
            .expect("delete one active row");
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
                    params![project_id],
                    |row| row.get(0),
                )
                .expect("count after delete");
            assert_eq!(count, 1);
        }

        let restore = restore_library_database_path(
            &library_dir,
            &PathBuf::from(&backup.backup_path),
            project_id,
        )
        .expect("restore should pass");
        assert_eq!(restore.paper_count, 2);
        assert!(restore
            .previous_backup_path
            .as_deref()
            .is_some_and(|path| PathBuf::from(path).exists()));

        {
            let conn = Connection::open(&database_path).expect("sqlite database");
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM papers WHERE project_id = ?1",
                    params![project_id],
                    |row| row.get(0),
                )
                .expect("count after restore");
            assert_eq!(count, 2);
        }

        fs::remove_dir_all(&base_dir).expect("cleanup backup restore temp dir");
    }

    fn test_paper(
        id: &str,
        title: &str,
        abstract_text: &str,
        field: &str,
        year: i64,
        doi: Option<&str>,
    ) -> PaperRecord {
        PaperRecord {
            id: id.to_string(),
            project_id: None,
            source: "local".to_string(),
            title: title.to_string(),
            abstract_text: abstract_text.to_string(),
            authors: Some("Unit Tester".to_string()),
            categories: Some("retrieval; graph; evidence".to_string()),
            field: field.to_string(),
            published_date: Some(year.to_string()),
            year: Some(year),
            url: Some(format!("https://example.org/{id}")),
            doi: doi.map(str::to_string),
            created_at: Some("1700000000000".to_string()),
            updated_at: Some("1700000000000".to_string()),
        }
    }

    #[test]
    #[ignore = "Generates and clusters 100000 SQLite rows; run explicitly for V7 pressure evidence."]
    fn pressure_test_100k_library_pipeline() {
        let base_dir = find_project_root()
            .unwrap_or_else(|| std::env::current_dir().expect("current dir"))
            .join("data")
            .join("pressure-test-evidence");
        let result = run_library_pressure_test_in_dir(base_dir.clone(), 100_000, true)
            .expect("pressure test should pass");
        println!("{}", result.summary);
        println!(
            "rows={} insert_ms={} query_ms={} cluster_ms={} total_ms={} size_bytes={}",
            result.rows,
            result.insert_ms,
            result.query_ms,
            result.cluster_ms,
            result.total_ms,
            result.size_bytes
        );
        assert_eq!(result.rows, 100_000);
        assert!(result.insert_ms > 0);
        assert!(result.query_count > 0);
        assert!(result.cluster_count > 0);
        assert!(result.cleanup_done);
        let _ = fs::remove_dir(&base_dir);
    }
}

#[tauri::command]
fn agent_create_run(
    app: tauri::AppHandle,
    input: AgentCreateRunInput,
) -> Result<AgentRunRecord, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let snapshot_id =
        validate_active_snapshot(&conn, &project_id)?.map(|snapshot| snapshot.active_snapshot_id);
    let now = now_millis().min(i64::MAX as u128) as i64;
    let task_input = input.task_input.unwrap_or_else(|| serde_json::json!({}));
    let run = AgentRepository::new(&conn)?.create_run(NewAgentRun {
        id: input.id,
        project_id,
        snapshot_id,
        run_kind: input.run_kind.unwrap_or(AgentRunKind::ResearchReport),
        task_input: task_input.clone(),
        automation_mode: input.automation_mode,
        objective: input.objective,
        budget: input.budget.unwrap_or_default(),
        now_ms: now,
    })?;
    if let Some(grant_id) = task_input
        .get("resourceGrantId")
        .and_then(serde_json::Value::as_str)
    {
        AgentCapabilityRepository::new(&conn)?.bind_resource_grant(grant_id, &run.id, now)?;
    }
    Ok(run)
}

fn preview_import_grant_metadata(path: &Path) -> Result<serde_json::Value, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "csv" | "json" | "jsonl" | "ndjson" | "bib" | "ris"
    ) {
        return Err("AGENT_IMPORT_FILE_TYPE_UNSUPPORTED".into());
    }
    let file = File::open(path).map_err(|e| format!("AGENT_IMPORT_FILE_UNREADABLE:{e}"))?;
    let total_rows = if extension == "json" {
        let value: serde_json::Value =
            serde_json::from_reader(file).map_err(|_| "AGENT_IMPORT_FILE_JSON_INVALID")?;
        value.as_array().map_or(1, Vec::len) as i64
    } else {
        let reader = BufReader::new(file);
        let count = reader.lines().count() as i64;
        if extension == "csv" {
            count.saturating_sub(1)
        } else if extension == "bib" {
            fs::read_to_string(path)
                .map_err(|e| e.to_string())?
                .lines()
                .filter(|line| line.trim_start().starts_with('@'))
                .count() as i64
        } else if extension == "ris" {
            fs::read_to_string(path)
                .map_err(|e| e.to_string())?
                .lines()
                .filter(|line| line.trim_start().starts_with("TY  -"))
                .count() as i64
        } else {
            count
        }
    };
    Ok(
        serde_json::json!({"sourceKind":"file","extension":extension,"totalRows":total_rows,"validRows":total_rows,"invalidRows":0,"duplicateRows":0,"sizeBytes":fs::metadata(path).map_err(|e|e.to_string())?.len()}),
    )
}

#[tauri::command]
fn agent_create_resource_grant(
    app: tauri::AppHandle,
    input: AgentResourceGrantInput,
) -> Result<AgentResourceGrant, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let project_id = input.project_id.unwrap_or_else(default_project_id);
    let repo = AgentRepository::new(&conn)?;
    let library = repo.library_instance_id(now_millis().min(i64::MAX as u128) as i64)?;
    let now = now_millis().min(i64::MAX as u128) as i64;
    let (locator, metadata, fingerprint) = match input.grant_kind {
        AgentResourceGrantKind::ImportFile => {
            let path = fs::canonicalize(PathBuf::from(&input.locator))
                .map_err(|e| format!("AGENT_IMPORT_FILE_UNREADABLE:{e}"))?;
            if !path.is_file() {
                return Err("AGENT_IMPORT_FILE_REQUIRED".into());
            }
            let metadata = preview_import_grant_metadata(&path)?;
            let hash = research_hotspots_core::sha256_file(&path)?;
            (path.to_string_lossy().to_string(), metadata, hash)
        }
        AgentResourceGrantKind::ExportDirectory => {
            let path = PathBuf::from(&input.locator);
            fs::create_dir_all(&path)
                .map_err(|e| format!("AGENT_EXPORT_DIRECTORY_UNWRITABLE:{e}"))?;
            let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
            let metadata =
                serde_json::json!({"sourceKind":"export_directory","formats":["md","html"]});
            let hash = research_hotspots_core::agent::canonical_value_sha256(
                &serde_json::json!({"path":path.to_string_lossy().to_lowercase(),"metadata":metadata}),
            )?;
            (path.to_string_lossy().to_string(), metadata, hash)
        }
        AgentResourceGrantKind::MysqlProfile => {
            let metadata=input.metadata.unwrap_or_else(||serde_json::json!({"sourceKind":"mysql","totalRows":0,"validRows":0,"invalidRows":0,"duplicateRows":0}));
            let hash = research_hotspots_core::agent::canonical_value_sha256(&metadata)?;
            (input.locator, metadata, hash)
        }
    };
    let grant = AgentResourceGrant {
        id: format!("grant-{}-{}", std::process::id(), now_millis()),
        run_id: input.run_id,
        library_instance_id: library,
        project_id,
        grant_kind: input.grant_kind,
        locator,
        metadata,
        fingerprint_sha256: fingerprint,
        created_at_ms: now,
        expires_at_ms: input.expires_at_ms,
        revoked_at_ms: None,
        consumed_at_ms: None,
    };
    AgentCapabilityRepository::new(&conn)?.create_resource_grant(&grant)?;
    Ok(grant)
}

#[tauri::command]
fn agent_revoke_resource_grant(
    app: tauri::AppHandle,
    input: AgentResourceGrantQueryInput,
) -> Result<(), String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    AgentCapabilityRepository::new(&conn)?
        .revoke_resource_grant(&input.grant_id, now_millis().min(i64::MAX as u128) as i64)
}
#[tauri::command]
fn agent_get_run(
    app: tauri::AppHandle,
    input: AgentRunQueryInput,
) -> Result<AgentRunSnapshot, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    AgentRepository::new(&conn)?.snapshot(&input.run_id)
}
#[tauri::command]
fn agent_list_runs(
    app: tauri::AppHandle,
    input: AgentRunListInput,
) -> Result<Vec<AgentRunRecord>, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    AgentRepository::new(&conn)?.list_runs(
        &input.project_id.unwrap_or_else(default_project_id),
        input.limit.unwrap_or(50),
        input.offset.unwrap_or(0),
    )
}
#[tauri::command]
fn agent_get_run_overview(
    app: tauri::AppHandle,
    input: AgentRunQueryInput,
) -> Result<AgentWorkspaceOverview, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let repository = AgentRepository::new(&conn)?;
    let overview = repository.overview(&input.run_id)?;
    let capability = AgentCapabilityRepository::new(&conn)?;
    let current_operation = capability.latest_operation(&input.run_id)?;
    let model_usage = capability.model_usage_summary(&input.run_id)?;
    let library_revision = current_library_revision(&conn, &overview.run.project_id)?;
    Ok(AgentWorkspaceOverview {
        overview,
        current_operation,
        model_usage,
        library_revision,
    })
}
#[tauri::command]
fn agent_get_artifact(
    app: tauri::AppHandle,
    input: AgentArtifactQueryInput,
) -> Result<AgentArtifactRecord, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    AgentRepository::new(&conn)?.artifact(&input.run_id, &input.artifact_id)
}
#[tauri::command]
fn agent_get_draft_model_profiles(
    app: tauri::AppHandle,
    input: AgentRunQueryInput,
) -> Result<AgentDraftModelProfiles, String> {
    let (conn, _, _) = open_library_database(&app, input.database_dir)?;
    let repository = AgentRepository::new(&conn)?;
    let run = repository
        .get_run(&input.run_id)?
        .ok_or("AGENT_RUN_NOT_FOUND")?;
    if run.status != AgentRunStatus::Draft {
        return Err("AGENT_RUN_NOT_DRAFT".into());
    }
    let planner = repository
        .latest_model_profile_before(AgentModelRole::Planner, run.created_at_ms)?
        .ok_or("AGENT_DRAFT_PLANNER_PROFILE_NOT_FOUND")?;
    let writer =
        repository.latest_model_profile_before(AgentModelRole::Writer, run.created_at_ms)?;
    Ok(AgentDraftModelProfiles {
        planner: research_hotspots_core::agent_store::AgentModelProfileReference {
            profile_id: planner.id,
            config_sha256: planner.config_sha256,
        },
        writer: writer.map(|profile| {
            research_hotspots_core::agent_store::AgentModelProfileReference {
                profile_id: profile.id,
                config_sha256: profile.config_sha256,
            }
        }),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PaperImportTaskRegistry::default())
        .manage(ClusterTaskRegistry::default())
        .manage(SemanticModelingRegistry::default())
        .manage(LibraryMutationRegistry::default())
        .manage(AiTaskRegistry::default())
        .manage(agent_runtime::AgentRuntimeState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            agent_create_run,
            agent_get_run,
            agent_list_runs,
            agent_get_run_overview,
            agent_get_artifact,
            agent_get_draft_model_profiles,
            agent_create_resource_grant,
            agent_revoke_resource_grant,
            agent_runtime::agent_save_model_profile,
            agent_runtime::agent_configure_model_credential,
            agent_runtime::agent_test_model_profile,
            agent_runtime::agent_plan_run,
            agent_runtime::agent_execute_run,
            agent_runtime::agent_decide_plan,
            agent_runtime::agent_decide_action,
            agent_runtime::agent_submit_answer,
            agent_runtime::agent_review_artifact,
            agent_runtime::agent_get_events,
            agent_runtime::agent_control_run,
            get_library_setup_state,
            validate_library_location,
            initialize_library,
            get_library_mutation_status,
            paper_library_status,
            backup_paper_library,
            inspect_paper_library_backup,
            restore_paper_library,
            query_paper_library,
            paper_library_facets,
            upsert_paper_library,
            get_papers_by_ids,
            delete_papers_from_library,
            demo_paper_sample_path,
            start_paper_file_import,
            start_mysql_paper_import,
            control_paper_file_import,
            clean_paper_library,
            cluster_paper_library,
            get_semantic_modeling_status,
            control_semantic_modeling,
            get_semantic_embedding_capabilities,
            export_hotspot_evidence,
            run_library_pressure_test,
            search_cnki_papers,
            sync_app17_galaxy_from_mysql,
            load_app17_galaxy,
            get_app17_galaxy_payload,
            get_app17_hotspot_evidence,
            get_v20_analysis_state,
            get_v20_hotspot_snapshot,
            get_v20_galaxy_payload,
            set_app_credential,
            get_app_credential_status,
            delete_app_credential,
            ai_chat,
            cancel_ai_task,
            write_text_file,
            read_markdown_exports,
            run_cleaner_worker,
            run_cluster_worker,
            run_health_check
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
