use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use research_hotspots_core::institution_connection::{
    InstitutionAuthCoordinator, InstitutionConnectionBeginOutcome,
    InstitutionConnectionFinalizeOutcome, InstitutionConnectionTerminal,
    InstitutionConnectionToken, SideraInstitutionConnectionGoal, SideraInstitutionConnectionPhase,
    INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS,
};
use research_hotspots_core::institution_probe::WHU_LIBRARY_HOME_URL;
use research_hotspots_core::institution_search::{
    adapter_page_confirms_query_submission, classify_adapter_page,
    classify_institution_restore_status, decide_whu_institution_navigation,
    discovery_auth_resume_is_current, discovery_auth_search_timeout_should_advance,
    initial_navigation_wait_is_current, institution_restore_is_current, is_whu_catalog_result_url,
    is_whu_database_authenticated_landing_url, is_whu_institution_navigation_url,
    merge_institution_results, normalize_academic_adapter_records,
    normalize_catalog_adapter_records, push_bounded_connection_verification_event,
    push_bounded_navigation_event, safe_institution_navigation_parts,
    validate_academic_adapter_records, validate_catalog_adapter_records,
    validate_institution_extraction_payload, validate_institution_query,
    NormalizedInstitutionResults, SideraInstitutionAdapterBucket, SideraInstitutionAdapterPage,
    SideraInstitutionAdapterSubmission, SideraInstitutionAuthKind, SideraInstitutionAuthState,
    SideraInstitutionAuthStatus, SideraInstitutionConnectionVerificationEvent,
    SideraInstitutionConnectionVerificationStage, SideraInstitutionConnectionVerificationSurface,
    SideraInstitutionConnectionVerificationVerdict, SideraInstitutionNavigationDecision,
    SideraInstitutionNavigationEvent, SideraInstitutionNavigationPhase,
    SideraInstitutionRecordKind, SideraInstitutionSearchItem, SideraInstitutionSearchProvenance,
    SideraInstitutionSearchSnapshot, SideraInstitutionSearchSource, SideraInstitutionSearchStage,
    SideraInstitutionSearchStatus, SideraInstitutionSessionState, SideraInstitutionSessionStatus,
    SideraInstitutionSourceBucket, SideraInstitutionSourceReadiness,
    SideraInstitutionSourceReadinessStatus, WHU_CATALOG_ENTRY_URL,
};
use research_hotspots_core::research_search::{
    fair_sequential_page_budget, qualifying_research_candidate_key, LiteratureConnectorFailure,
    LiteratureConnectorSearchResult, LiteratureConnectorTransport, LiteratureSearchFilters,
    LiteratureSearchRequest, ResearchSearchCompletionReason, ResearchSearchOrchestrator,
    ResearchSearchRetrievalPosition, ResearchSearchRetrievalPositionBasis, ResearchSearchRun,
    ResearchSearchStatus, ResearchSearchToken, SideraResearchSearchAuthPhase,
    SideraResearchSearchStartReason, SideraResearchSearchState,
    RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT, WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID,
};
use research_hotspots_core::whu_structured_discovery::{
    classify_whu_structured_page_advance, parse_whu_structured_discovery_page,
    WhuStructuredDiscoveryPage, WhuStructuredPageAdvance, DOM_FALLBACK_USED,
    STRUCTURED_PAGINATION_CONTROL_MISSING, STRUCTURED_PAGINATION_METADATA_MISSING,
    STRUCTURED_PAGINATION_REGRESSED, STRUCTURED_PAGINATION_STALLED, STRUCTURED_ROUTE_UNAVAILABLE,
    WHU_STRUCTURED_CONNECTOR_VERSION, WHU_STRUCTURED_PRIMO_SCHEMA_SHA256,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::webview::{
    NewWindowFeatures, NewWindowResponse, PageLoadEvent, WebviewBuilder, WebviewWindowBuilder,
};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Url, Webview, WebviewUrl,
    WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

use crate::sidera_window_host::{
    bind_webview_window_owner, resolve_main_window_host, MAIN_WINDOW_MISSING,
};

const INSTITUTION_WEBVIEW_LABEL: &str = "institution-whu";
const INSTITUTION_AUTH_WINDOW_LABEL: &str = "institution-whu-auth";
const INSTITUTION_CONNECTION_WINDOW_LABEL: &str = "institution-whu-connection";
const INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL: &str = "institution-whu-connection-auth";
const INSTITUTION_ACADEMIC_RESULT_WINDOW_PREFIX: &str = "institution-whu-academic-result";
const INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL: &str = "institution-whu-discovery-auth";
const DISCOVERY_AUTH_ADAPTER_VERSION: &str = "whu-discovery-auth-v1";
const DISCOVERY_AUTH_WATCHDOG_INTERVAL_MS: u64 = 650;
const DISCOVERY_AUTH_WATCHDOG_EVAL_MS: u64 = 650;
const DISCOVERY_AUTH_INVISIBLE_CONFIRMATIONS: u8 = 2;
const DISCOVERY_AUTH_PARENT_INSPECTION_ATTEMPTS: u8 = 4;
const DISCOVERY_AUTH_PARENT_INSPECTION_INTERVAL_MS: u64 = 250;
const INSTITUTION_SEARCH_EVENT: &str = "sidera-institution-search";
const RESEARCH_SEARCH_EVENT: &str = "sidera-research-search";
const INSTITUTION_SESSION_EVENT: &str = "sidera-institution-session";
const INSTITUTION_DATA_DIRECTORY: &str = "institution-webview-v1/whu";
const INSTITUTION_INITIAL_NAVIGATION_TIMEOUT: Duration = Duration::from_secs(20);
const INSTITUTION_RESTORE_CAPABILITY_TIMEOUT: Duration = Duration::from_secs(10);
const INSTITUTION_RESTORE_TOTAL_TIMEOUT: Duration = Duration::from_secs(30);
const SEARCH_TOTAL_TIMEOUT: Duration = Duration::from_secs(90);
const ACADEMIC_RESULT_WEBVIEW_TIMEOUT: Duration = Duration::from_secs(20);
const ACADEMIC_MAX_PAGES_PER_FACET: usize = 3;
const CONNECTION_PAGE_OBSERVATION_ATTEMPTS: u8 = 4;
const CONNECTION_LOGIN_REQUIRED_STABILITY_OBSERVATIONS: u8 = 2;
const CONNECTION_PAGE_OBSERVATION_EVAL_TIMEOUT: Duration = Duration::from_millis(800);
const CONNECTION_CLOSE_EVAL_SLICE: Duration = Duration::from_millis(650);
const INSTITUTION_BACKGROUND_TRANSPORT_EDGE: f64 = 1.0;
const INSTITUTION_BACKGROUND_TRANSPORT_WIDTH: f64 = 1_280.0;
const INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT: f64 = 900.0;
const ACADEMIC_READ_ONLY_INSPECTION_ATTEMPTS: u8 = 2;

#[derive(Clone, Default)]
pub struct SideraInstitutionRuntimeState {
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
}

#[derive(Default)]
struct SideraInstitutionRuntimeInner {
    session: SideraInstitutionSessionState,
    connection: InstitutionAuthCoordinator,
    connection_auth_popup_token: Option<InstitutionConnectionToken>,
    explicit_login_required_transaction_id: Option<String>,
    search: SideraInstitutionSearchSnapshot,
    search_snapshots: HashMap<SideraInstitutionSearchSource, SideraInstitutionSearchSnapshot>,
    detail_urls: HashMap<SideraInstitutionSearchSource, HashMap<String, String>>,
    full_text_urls: HashMap<SideraInstitutionSearchSource, HashMap<String, String>>,
    blocked_targets: HashMap<String, String>,
    epoch: u64,
    sequence: u64,
    result_open_epoch: u64,
    active_task_id: Option<String>,
    academic_result_webview: Option<AcademicResultWebviewBinding>,
    academic_discovery_auth: Option<AcademicDiscoveryAuthBinding>,
    discovery_auth_epoch: u64,
    restore_epoch: u64,
    restore_inflight: bool,
    webview_generation: u64,
    pending_initial_navigation_epoch: Option<u64>,
    pending_initial_navigation_connection: Option<InstitutionConnectionToken>,
    catalog_handoff_epoch: Option<u64>,
    research_search: ResearchSearchOrchestrator,
    legacy_academic_transport: Option<LegacyAcademicTransportRun>,
    research_detail_urls: HashMap<String, String>,
    research_full_text_urls: HashMap<String, String>,
    protocol_session: crate::sidera_institution_protocol::InstitutionProtocolSession,
    structured_pending_requests: HashMap<[u8; 32], StructuredProtocolRequestContext>,
    structured_pending_responses:
        HashMap<[u8; 32], crate::sidera_institution_protocol::RedactedProtocolResponse>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AcademicSearchResumeContext {
    task_id: String,
    epoch: u64,
    sequence: u64,
    webview_generation: u64,
    query: String,
    result_webview_label: String,
    phase: SideraInstitutionSearchStage,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AcademicDiscoveryAuthBinding {
    connection_token: InstitutionConnectionToken,
    auth_epoch: u64,
    parent_label: String,
    parent_task_id: String,
    parent_epoch: u64,
    parent_task_sequence: u64,
    webview_generation: u64,
    resume: Option<AcademicSearchResumeContext>,
    closing: bool,
}

impl AcademicDiscoveryAuthBinding {
    fn matches(&self, other: &Self) -> bool {
        self.connection_token == other.connection_token
            && self.auth_epoch == other.auth_epoch
            && self.parent_label == other.parent_label
            && self.parent_task_id == other.parent_task_id
            && self.parent_epoch == other.parent_epoch
            && self.parent_task_sequence == other.parent_task_sequence
            && self.webview_generation == other.webview_generation
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AcademicResultWebviewBinding {
    label: String,
    task_id: String,
    epoch: u64,
    task_sequence: u64,
    webview_generation: u64,
    ready: bool,
    raw_visible: bool,
}

#[derive(Clone, Debug)]
struct LegacyAcademicTransportRun {
    token: ResearchSearchToken,
    request: LiteratureSearchRequest,
    connector_result: Option<LiteratureConnectorSearchResult>,
    pages_scanned: usize,
    previous_search: SideraInstitutionSearchSnapshot,
    previous_active_task_id: Option<String>,
    previous_detail_urls: HashMap<String, String>,
    previous_full_text_urls: HashMap<String, String>,
    structured: StructuredAcademicTransportState,
}

#[derive(Clone, Debug)]
struct StructuredProtocolRequestContext {
    request: crate::sidera_institution_protocol::RedactedProtocolRequest,
    task_id: String,
    epoch: u64,
    task_sequence: u64,
    webview_generation: u64,
}

#[derive(Clone, Debug, Default)]
struct StructuredAcademicTransportState {
    pages: Vec<WhuStructuredDiscoveryPage>,
    accepted_page_identities: BTreeSet<String>,
    failure_code: Option<String>,
    pending_pagination: Option<StructuredPaginationExpectation>,
}

#[derive(Clone, Debug)]
struct StructuredPaginationExpectation {
    task_id: String,
    epoch: u64,
    task_sequence: u64,
    webview_generation: u64,
    expected_page_number: usize,
    previous_page: WhuStructuredDiscoveryPage,
}

impl AcademicResultWebviewBinding {
    fn is_current_for(&self, guard: &SideraInstitutionRuntimeInner, task_id: &str) -> bool {
        guard.active_task_id.as_deref() == Some(task_id)
            && guard.search.task_id.as_deref() == Some(task_id)
            && guard.search.epoch == self.epoch
            && guard.search.sequence >= self.task_sequence
            && guard.webview_generation == self.webview_generation
            && self.task_id == task_id
    }
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcademicFilterReceipt {
    #[serde(default)]
    action: String,
    #[serde(default)]
    filters: Vec<String>,
    #[serde(default)]
    available_filters: Vec<String>,
    #[serde(default)]
    page_signature: String,
    #[serde(default)]
    target: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AcademicPaginationNodeDiagnostic {
    #[serde(default)]
    tag: String,
    #[serde(default)]
    role: String,
    #[serde(default)]
    classes: Vec<String>,
    #[serde(default)]
    aria_current: String,
    #[serde(default)]
    aria_selected: String,
    #[serde(default)]
    tabindex: String,
    #[serde(default)]
    numeric_label: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AcademicPaginationDiagnostics {
    #[serde(default)]
    expected_page: u32,
    #[serde(default)]
    range_found: bool,
    #[serde(default)]
    current_page: u32,
    #[serde(default)]
    numeric_labels: Vec<u32>,
    #[serde(default)]
    pager_found: bool,
    #[serde(default)]
    pager_numbers: Vec<u32>,
    #[serde(default)]
    selected_numeric_node: Option<AcademicPaginationNodeDiagnostic>,
    #[serde(default)]
    numbered_next_node: Option<AcademicPaginationNodeDiagnostic>,
    #[serde(default)]
    numbered_next_target: Option<AcademicPaginationNodeDiagnostic>,
    #[serde(default)]
    next_candidate: Option<AcademicPaginationNodeDiagnostic>,
    #[serde(default)]
    next_candidate_ancestors: Vec<AcademicPaginationNodeDiagnostic>,
    #[serde(default)]
    candidate_count: u32,
    #[serde(default)]
    control_kind: String,
    #[serde(default)]
    click_x: Option<f64>,
    #[serde(default)]
    click_y: Option<f64>,
    #[serde(default)]
    viewport_width: Option<f64>,
    #[serde(default)]
    viewport_height: Option<f64>,
    #[serde(default)]
    hit_test_matches: bool,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcademicNextPageReceipt {
    #[serde(default)]
    action: String,
    #[serde(default)]
    page_signature: String,
    #[serde(default)]
    diagnostics: AcademicPaginationDiagnostics,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcademicDiscoveryAuthInspection {
    #[serde(default)]
    adapter_version: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    url: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AcademicFacetMode {
    Combined,
    Sequential,
}

struct CollectedAcademicPage {
    page: SideraInstitutionAdapterPage,
    page_number: usize,
    facet: Option<String>,
}

struct AcademicCollectionProgress {
    request: Option<LiteratureSearchRequest>,
    pages_scanned: usize,
    qualifying_keys: BTreeSet<String>,
    limit_reached: bool,
    page_limit_reached: bool,
}

fn research_transport_accepts_record(
    record: &research_hotspots_core::institution_search::SideraInstitutionAdapterRecord,
) -> bool {
    validate_academic_adapter_records(std::slice::from_ref(record)).is_ok()
}

impl AcademicCollectionProgress {
    fn new(request: Option<LiteratureSearchRequest>) -> Self {
        Self {
            request,
            pages_scanned: 0,
            qualifying_keys: BTreeSet::new(),
            limit_reached: false,
            page_limit_reached: false,
        }
    }

    fn observe(&mut self, page: &SideraInstitutionAdapterPage) {
        self.pages_scanned = self.pages_scanned.saturating_add(1);
        self.observe_records(page);
    }

    fn observe_records(&mut self, page: &SideraInstitutionAdapterPage) {
        let Some(request) = self.request.as_ref() else {
            return;
        };
        for record in &page.records {
            if !research_transport_accepts_record(record) {
                continue;
            }
            if let Some(key) = qualifying_research_candidate_key(request, record) {
                self.qualifying_keys.insert(key);
            }
        }
        self.limit_reached = self.qualifying_keys.len() >= request.result_limit;
    }

    fn replace_qualifying_keys(&mut self, qualifying_keys: BTreeSet<String>) {
        let Some(request) = self.request.as_ref() else {
            return;
        };
        self.qualifying_keys = qualifying_keys;
        self.limit_reached = self.qualifying_keys.len() >= request.result_limit;
    }

    fn note_page_without_candidates(&mut self) {
        self.pages_scanned = self.pages_scanned.saturating_add(1);
    }

    fn global_budget_reached(&self) -> bool {
        self.request
            .as_ref()
            .is_some_and(|request| self.pages_scanned >= request.max_pages)
    }

    fn scope_budget_reached(
        &self,
        pages_in_scope: usize,
        scope_page_budget: Option<usize>,
    ) -> bool {
        if self.global_budget_reached() {
            return true;
        }
        pages_in_scope
            >= scope_page_budget.unwrap_or_else(|| {
                self.request
                    .as_ref()
                    .map(|request| request.max_pages)
                    .unwrap_or(ACADEMIC_MAX_PAGES_PER_FACET)
            })
    }

    fn fair_sequential_facet_budget(&self, remaining_facets: usize) -> usize {
        let remaining_facets = remaining_facets.max(1);
        let remaining_pages = self
            .request
            .as_ref()
            .map(|request| request.max_pages.saturating_sub(self.pages_scanned))
            .unwrap_or(ACADEMIC_MAX_PAGES_PER_FACET);
        fair_sequential_page_budget(remaining_pages, remaining_facets)
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionIdInput {
    institution_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionSessionEnsureInput {
    institution_id: String,
    #[serde(default)]
    auth_kind: Option<SideraInstitutionAuthKind>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionAuthCancelInput {
    institution_id: String,
    #[serde(default)]
    auth_kind: Option<SideraInstitutionAuthKind>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionConnectionBeginInput {
    institution_id: String,
    goal: SideraInstitutionConnectionGoal,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionConnectionCancelInput {
    institution_id: String,
    #[serde(default)]
    transaction_id: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionBrowserBoundsInput {
    institution_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionBrowserVisibleInput {
    institution_id: String,
    visible: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionSearchStartInput {
    institution_id: String,
    query: String,
    #[serde(default)]
    source: Option<SideraInstitutionSearchSource>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionSearchCancelInput {
    institution_id: String,
    task_id: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionResultOpenInput {
    institution_id: String,
    result_id: String,
    #[serde(default = "default_open_mode")]
    mode: String,
    #[serde(default)]
    source: Option<SideraInstitutionSearchSource>,
    #[serde(default)]
    target: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ResearchSearchStartInput {
    query: String,
    client_request_id: String,
    #[serde(default)]
    start_reason: SideraResearchSearchStartReason,
    #[serde(default)]
    filters: Option<LiteratureSearchFilters>,
    #[serde(default = "default_research_result_limit")]
    result_limit: usize,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ResearchSearchCancelInput {
    task_id: Option<String>,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ResearchSearchSnapshotInput {
    task_id: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ResearchResultOpenInput {
    candidate_id: String,
    #[serde(default)]
    target: Option<String>,
    #[serde(default = "default_open_mode")]
    mode: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ResearchImportReviewCreateInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    search_id: String,
    generation: u64,
    connector_version: String,
    candidate_ids: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstitutionActionResult {
    ok: bool,
    code: String,
}

fn default_open_mode() -> String {
    "embedded".to_string()
}

fn default_research_result_limit() -> usize {
    RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT
}

fn ensure_whu(institution_id: &str) -> Result<(), String> {
    if institution_id == "whu" {
        Ok(())
    } else {
        Err("SIDERA_INSTITUTION_UNSUPPORTED".to_string())
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn connection_goal_auth_kind(
    goal: SideraInstitutionConnectionGoal,
) -> Option<SideraInstitutionAuthKind> {
    match goal {
        SideraInstitutionConnectionGoal::DatabaseAccess => {
            Some(SideraInstitutionAuthKind::DatabaseSso)
        }
        SideraInstitutionConnectionGoal::LibraryAccount => {
            Some(SideraInstitutionAuthKind::LibraryAccount)
        }
        SideraInstitutionConnectionGoal::DiscoveryFulltext => None,
    }
}

fn auth_kind_connection_goal(kind: SideraInstitutionAuthKind) -> SideraInstitutionConnectionGoal {
    match kind {
        SideraInstitutionAuthKind::DatabaseSso => SideraInstitutionConnectionGoal::DatabaseAccess,
        SideraInstitutionAuthKind::LibraryAccount => {
            SideraInstitutionConnectionGoal::LibraryAccount
        }
    }
}

fn connection_goal_is_ready(
    guard: &SideraInstitutionRuntimeInner,
    goal: SideraInstitutionConnectionGoal,
) -> bool {
    match goal {
        SideraInstitutionConnectionGoal::DatabaseAccess => {
            guard.session.database_auth.status == SideraInstitutionAuthStatus::Ready
        }
        SideraInstitutionConnectionGoal::LibraryAccount => {
            guard.session.library_account_auth.status == SideraInstitutionAuthStatus::Ready
        }
        SideraInstitutionConnectionGoal::DiscoveryFulltext => {
            guard.session.academic_discovery_auth.status == SideraInstitutionAuthStatus::Ready
        }
    }
}

fn sync_active_connection_locked(guard: &mut SideraInstitutionRuntimeInner) {
    guard.session.active_connection = guard.connection.current();
    guard.session.updated_at_ms = now_ms();
}

fn begin_connection_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    goal: SideraInstitutionConnectionGoal,
) -> InstitutionConnectionBeginOutcome {
    let previous_ready = connection_goal_is_ready(guard, goal);
    let outcome = guard.connection.begin(goal, previous_ready, now_ms());
    if let InstitutionConnectionBeginOutcome::Started(_) = &outcome {
        guard.explicit_login_required_transaction_id = None;
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        if !previous_ready {
            if let Some(kind) = connection_goal_auth_kind(goal) {
                set_auth_state_locked(
                    guard,
                    kind,
                    SideraInstitutionAuthStatus::Starting,
                    "SIDERA_INSTITUTION_CONNECTION_OPENING",
                    "正在打开官方机构认证页面。",
                    None,
                );
            } else {
                set_discovery_auth_state_locked(
                    guard,
                    SideraInstitutionAuthStatus::Starting,
                    "SIDERA_INSTITUTION_CONNECTION_OPENING",
                    "正在打开统一发现机构认证页面。",
                    None,
                );
            }
        }
    }
    sync_active_connection_locked(guard);
    outcome
}

fn advance_connection_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
    phase: SideraInstitutionConnectionPhase,
    code: &'static str,
    message: &'static str,
) -> bool {
    if guard
        .connection
        .advance(token, phase, code, message, now_ms())
        .is_none()
    {
        return false;
    }
    sync_active_connection_locked(guard);
    true
}

fn connection_accepts_page_observation_locked(
    guard: &SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) -> bool {
    guard.connection.is_active(token)
        && guard.connection.current().is_some_and(|connection| {
            matches!(
                connection.phase,
                SideraInstitutionConnectionPhase::Opening
                    | SideraInstitutionConnectionPhase::AwaitingUser
            )
        })
}

fn active_connection_owns_auth_locked(guard: &SideraInstitutionRuntimeInner) -> bool {
    guard
        .connection
        .current()
        .is_some_and(|connection| !connection.phase.is_terminal())
}

fn library_connection_popup_is_authorized_locked(
    guard: &SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) -> bool {
    token.goal == SideraInstitutionConnectionGoal::LibraryAccount
        && connection_accepts_page_observation_locked(guard, token)
}

fn library_connection_popup_is_bound_locked(
    guard: &SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) -> bool {
    guard.connection_auth_popup_token.as_ref() == Some(token)
        && library_connection_popup_is_authorized_locked(guard, token)
}

fn bind_library_connection_popup_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) -> bool {
    if !library_connection_popup_is_authorized_locked(guard, token) {
        return false;
    }
    guard.connection_auth_popup_token = Some(token.clone());
    true
}

fn clear_matching_library_connection_popup_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) -> bool {
    if guard.connection_auth_popup_token.as_ref() != Some(token) {
        return false;
    }
    guard.connection_auth_popup_token = None;
    true
}

fn claim_library_connection_popup_parent_refresh_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) -> Option<SideraInstitutionSessionState> {
    if !library_connection_popup_is_authorized_locked(guard, token)
        || !advance_connection_locked(
            guard,
            token,
            SideraInstitutionConnectionPhase::AwaitingUser,
            "SIDERA_INSTITUTION_CONNECTION_REFRESHING_VISIBLE_PARENT",
            "个人图书馆认证窗口已关闭，正在返回官方父页面确认会话。",
        )
    {
        return None;
    }
    set_auth_state_locked(
        guard,
        SideraInstitutionAuthKind::LibraryAccount,
        SideraInstitutionAuthStatus::Starting,
        "SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING",
        "正在由官方个人图书馆父页面确认登录状态。",
        None,
    );
    Some(guard.session.clone())
}

fn pending_initial_navigation_is_current_locked(
    guard: &SideraInstitutionRuntimeInner,
    generation: u64,
    navigation_epoch: u64,
    connection_token: Option<&InstitutionConnectionToken>,
) -> bool {
    if !initial_navigation_wait_is_current(
        guard.webview_generation,
        generation,
        guard.pending_initial_navigation_epoch,
        navigation_epoch,
    ) {
        return false;
    }
    match connection_token {
        Some(token) => {
            guard.pending_initial_navigation_connection.as_ref() == Some(token)
                && connection_accepts_page_observation_locked(guard, token)
        }
        None => guard.pending_initial_navigation_connection.is_none(),
    }
}

fn clear_matching_pending_initial_navigation_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
) {
    if guard.pending_initial_navigation_connection.as_ref() == Some(token) {
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
    }
}

fn claim_library_parent_observation_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    generation: u64,
    current_host: Option<String>,
) -> Option<(SideraInstitutionSessionState, InstitutionConnectionToken)> {
    if guard.webview_generation != generation {
        return None;
    }
    let token = guard.connection.current_token()?;
    if token.goal != SideraInstitutionConnectionGoal::LibraryAccount
        || !connection_accepts_page_observation_locked(guard, &token)
        || guard
            .pending_initial_navigation_connection
            .as_ref()
            .is_some_and(|pending| pending != &token)
    {
        return None;
    }
    clear_matching_pending_initial_navigation_locked(guard, &token);
    clear_navigation_fallback(guard);
    set_auth_state_locked(
        guard,
        SideraInstitutionAuthKind::LibraryAccount,
        SideraInstitutionAuthStatus::Starting,
        "SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING",
        "官方页面已加载，正在确认个人图书馆会话结构。",
        current_host,
    );
    Some((guard.session.clone(), token))
}

fn library_parent_popup_is_authorized_locked(
    guard: &SideraInstitutionRuntimeInner,
    generation: u64,
) -> bool {
    if guard.webview_generation != generation {
        return false;
    }
    match guard.connection.current_token() {
        Some(token) => {
            token.goal == SideraInstitutionConnectionGoal::LibraryAccount
                && connection_accepts_page_observation_locked(guard, &token)
        }
        None => guard.session.active_auth_kind == Some(SideraInstitutionAuthKind::LibraryAccount),
    }
}

fn finalize_connection_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
    terminal: InstitutionConnectionTerminal,
    code: &'static str,
    message: &'static str,
    current_host: Option<String>,
) -> Option<InstitutionConnectionFinalizeOutcome> {
    let explicit_login_required = guard.explicit_login_required_transaction_id.as_deref()
        == Some(token.transaction_id.as_str());
    let outcome = guard
        .connection
        .finalize(token, terminal, code, message, now_ms())?;
    clear_matching_pending_initial_navigation_locked(guard, token);
    clear_matching_library_connection_popup_locked(guard, token);
    if explicit_login_required {
        guard.explicit_login_required_transaction_id = None;
    }
    let (status, capability_code, capability_message) = if outcome.keep_previous_ready {
        (
            SideraInstitutionAuthStatus::Ready,
            "SIDERA_INSTITUTION_AUTH_READY_PRESERVED",
            "已保留此前由官方页面证明的机构连接；本次连接未改变既有状态。",
        )
    } else {
        match terminal {
            InstitutionConnectionTerminal::Ready => {
                (SideraInstitutionAuthStatus::Ready, code, message)
            }
            InstitutionConnectionTerminal::Cancelled => {
                (SideraInstitutionAuthStatus::Cancelled, code, message)
            }
            InstitutionConnectionTerminal::Failed => {
                (SideraInstitutionAuthStatus::Failed, code, message)
            }
        }
    };
    if !explicit_login_required || terminal == InstitutionConnectionTerminal::Ready {
        if let Some(kind) = connection_goal_auth_kind(token.goal) {
            set_auth_state_locked(
                guard,
                kind,
                status,
                capability_code,
                capability_message,
                current_host,
            );
        } else {
            set_discovery_auth_state_locked(
                guard,
                status,
                capability_code,
                capability_message,
                current_host,
            );
        }
    }
    guard.session.active_connection = Some(outcome.connection.clone());
    guard.session.updated_at_ms = now_ms();
    Some(outcome)
}

fn claim_connection_main_restore(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: &InstitutionConnectionToken,
) -> bool {
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.connection.claim_main_restore(token)
}

fn web_error_status_code(value: i32) -> String {
    let label = match value {
        0 => "UNKNOWN",
        1 => "CERTIFICATE_COMMON_NAME_IS_INCORRECT",
        2 => "CERTIFICATE_EXPIRED",
        3 => "CLIENT_CERTIFICATE_CONTAINS_ERRORS",
        4 => "CERTIFICATE_REVOKED",
        5 => "CERTIFICATE_IS_INVALID",
        6 => "SERVER_UNREACHABLE",
        7 => "TIMEOUT",
        8 => "INVALID_SERVER_RESPONSE",
        9 => "CONNECTION_ABORTED",
        10 => "CONNECTION_RESET",
        11 => "DISCONNECTED",
        12 => "CANNOT_CONNECT",
        13 => "HOST_NAME_NOT_RESOLVED",
        14 => "OPERATION_CANCELED",
        15 => "REDIRECT_FAILED",
        16 => "UNEXPECTED_ERROR",
        17 => "AUTHENTICATION_REQUIRED",
        18 => "PROXY_AUTHENTICATION_REQUIRED",
        _ => "UNRECOGNIZED",
    };
    format!("WEBVIEW2_{label}")
}

fn append_navigation_event_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    generation: u64,
    navigation_id: Option<u64>,
    auth_kind: SideraInstitutionAuthKind,
    phase: SideraInstitutionNavigationPhase,
    target: Option<&str>,
    redirected: bool,
    web_error_status: Option<String>,
) {
    if guard.webview_generation != generation {
        return;
    }
    let (host, path) = target
        .and_then(safe_institution_navigation_parts)
        .unwrap_or_else(|| ("[rejected]".to_string(), String::new()));
    let epoch = guard.session.navigation_epoch;
    push_bounded_navigation_event(
        &mut guard.session.navigation_trace,
        SideraInstitutionNavigationEvent {
            navigation_id,
            generation,
            epoch,
            auth_kind,
            phase,
            host,
            path,
            redirected,
            web_error_status,
            timestamp_ms: now_ms(),
        },
    );
    guard.session.updated_at_ms = now_ms();
}

fn record_navigation_event(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    generation: u64,
    navigation_id: Option<u64>,
    auth_kind: SideraInstitutionAuthKind,
    phase: SideraInstitutionNavigationPhase,
    target: Option<&str>,
    redirected: bool,
    web_error_status: Option<String>,
) {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        append_navigation_event_locked(
            &mut guard,
            generation,
            navigation_id,
            auth_kind,
            phase,
            target,
            redirected,
            web_error_status,
        );
        guard.session.clone()
    };
    emit_session(app, &state);
}

fn short_hash(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest[..10]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn auth_status_from_session(status: SideraInstitutionSessionStatus) -> SideraInstitutionAuthStatus {
    match status {
        SideraInstitutionSessionStatus::Uninitialized => SideraInstitutionAuthStatus::Idle,
        SideraInstitutionSessionStatus::Starting => SideraInstitutionAuthStatus::Starting,
        SideraInstitutionSessionStatus::LoginRequired | SideraInstitutionSessionStatus::Expired => {
            SideraInstitutionAuthStatus::LoginRequired
        }
        SideraInstitutionSessionStatus::Ready | SideraInstitutionSessionStatus::Searching => {
            SideraInstitutionAuthStatus::Ready
        }
        SideraInstitutionSessionStatus::Partial | SideraInstitutionSessionStatus::Failed => {
            SideraInstitutionAuthStatus::Failed
        }
    }
}

fn set_auth_state_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    kind: SideraInstitutionAuthKind,
    status: SideraInstitutionAuthStatus,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
) {
    set_auth_state_with_login_proof_locked(guard, kind, status, code, message, current_host, false);
}

fn set_explicit_auth_login_required_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    kind: SideraInstitutionAuthKind,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
) {
    set_auth_state_with_login_proof_locked(
        guard,
        kind,
        SideraInstitutionAuthStatus::LoginRequired,
        code,
        message,
        current_host,
        true,
    );
}

fn set_auth_state_with_login_proof_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    kind: SideraInstitutionAuthKind,
    status: SideraInstitutionAuthStatus,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
    explicit_login_required: bool,
) {
    let code = code.into();
    let message = message.into();
    let updated_at_ms = now_ms();
    let mut explicit_login_required_is_current = explicit_login_required;
    let mut reject_terminal_explicit_observation = false;
    let previous_status = match kind {
        SideraInstitutionAuthKind::DatabaseSso => guard.session.database_auth.status,
        SideraInstitutionAuthKind::LibraryAccount => guard.session.library_account_auth.status,
    };
    if status == SideraInstitutionAuthStatus::Starting
        && guard.connection.current().is_some_and(|connection| {
            connection.phase.is_terminal()
                && connection_goal_auth_kind(connection.goal) == Some(kind)
        })
    {
        return;
    }
    if explicit_login_required && status == SideraInstitutionAuthStatus::LoginRequired {
        if let Some(token) = guard
            .connection
            .current_token()
            .filter(|token| connection_goal_auth_kind(token.goal) == Some(kind))
        {
            let active = guard
                .connection
                .current()
                .is_some_and(|connection| !connection.phase.is_terminal());
            if active && guard.connection.invalidate_previous_ready(&token) {
                guard.explicit_login_required_transaction_id = Some(token.transaction_id.clone());
            } else {
                explicit_login_required_is_current = false;
                reject_terminal_explicit_observation = true;
            }
        }
    }
    if reject_terminal_explicit_observation {
        guard.session.updated_at_ms = updated_at_ms;
        return;
    }
    if previous_status == SideraInstitutionAuthStatus::Ready
        && status != SideraInstitutionAuthStatus::Ready
        && !(explicit_login_required_is_current
            && status == SideraInstitutionAuthStatus::LoginRequired)
    {
        guard.session.active_auth_kind = Some(kind);
        guard.session.updated_at_ms = updated_at_ms;
        return;
    }
    let target: &mut SideraInstitutionAuthState = match kind {
        SideraInstitutionAuthKind::DatabaseSso => &mut guard.session.database_auth,
        SideraInstitutionAuthKind::LibraryAccount => &mut guard.session.library_account_auth,
    };
    target.status = status;
    target.code = code.clone();
    target.message = message.clone();
    target.current_host = current_host.clone();
    target.updated_at_ms = updated_at_ms;
    guard.session.active_auth_kind = Some(kind);
    guard.session.updated_at_ms = updated_at_ms;

    if kind == SideraInstitutionAuthKind::DatabaseSso {
        guard.session.status = match status {
            SideraInstitutionAuthStatus::Idle => SideraInstitutionSessionStatus::Uninitialized,
            SideraInstitutionAuthStatus::Starting => SideraInstitutionSessionStatus::Starting,
            SideraInstitutionAuthStatus::LoginRequired => {
                SideraInstitutionSessionStatus::LoginRequired
            }
            SideraInstitutionAuthStatus::Ready => {
                if guard.active_task_id.is_some() {
                    SideraInstitutionSessionStatus::Searching
                } else {
                    SideraInstitutionSessionStatus::Ready
                }
            }
            SideraInstitutionAuthStatus::Cancelled => SideraInstitutionSessionStatus::Partial,
            SideraInstitutionAuthStatus::Failed => SideraInstitutionSessionStatus::Failed,
        };
        guard.session.code = code;
        guard.session.message = message;
        guard.session.current_host = current_host;
    }
}

fn set_discovery_auth_state_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    status: SideraInstitutionAuthStatus,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
) {
    set_discovery_auth_state_with_login_proof_locked(
        guard,
        status,
        code,
        message,
        current_host,
        false,
    );
}

fn set_explicit_discovery_login_required_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
) {
    set_discovery_auth_state_with_login_proof_locked(
        guard,
        SideraInstitutionAuthStatus::LoginRequired,
        code,
        message,
        current_host,
        true,
    );
}

fn set_discovery_auth_state_with_login_proof_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    status: SideraInstitutionAuthStatus,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
    explicit_login_required: bool,
) {
    let mut explicit_login_required_is_current = explicit_login_required;
    let mut reject_terminal_explicit_observation = false;
    if explicit_login_required && status == SideraInstitutionAuthStatus::LoginRequired {
        if let Some(token) = guard
            .connection
            .current_token()
            .filter(|token| token.goal == SideraInstitutionConnectionGoal::DiscoveryFulltext)
        {
            let active = guard
                .connection
                .current()
                .is_some_and(|connection| !connection.phase.is_terminal());
            if active && guard.connection.invalidate_previous_ready(&token) {
                guard.explicit_login_required_transaction_id = Some(token.transaction_id.clone());
            } else {
                explicit_login_required_is_current = false;
                reject_terminal_explicit_observation = true;
            }
        }
    }
    if reject_terminal_explicit_observation {
        guard.session.updated_at_ms = now_ms();
        return;
    }
    if guard.session.academic_discovery_auth.status == SideraInstitutionAuthStatus::Ready
        && status != SideraInstitutionAuthStatus::Ready
        && !(explicit_login_required_is_current
            && status == SideraInstitutionAuthStatus::LoginRequired)
    {
        guard.session.updated_at_ms = now_ms();
        return;
    }
    let target = &mut guard.session.academic_discovery_auth;
    target.status = status;
    target.code = code.into();
    target.message = message.into();
    target.current_host = current_host;
    target.updated_at_ms = now_ms();
    guard.session.updated_at_ms = target.updated_at_ms;
}

fn mark_discovery_search_access_ready_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    current_host: Option<String>,
) {
    set_source_readiness_locked(
        guard,
        SideraInstitutionSearchSource::AcademicDiscovery,
        SideraInstitutionSourceReadinessStatus::Ready,
        "SIDERA_INSTITUTION_DISCOVERY_SEARCH_ACCESS_READY",
        "统一发现检索入口可用；机构全文身份由独立认证状态确认。",
        current_host,
    );
}

fn set_source_readiness_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    source: SideraInstitutionSearchSource,
    status: SideraInstitutionSourceReadinessStatus,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
) {
    let readiness = SideraInstitutionSourceReadiness {
        source,
        status,
        code: code.into(),
        message: message.into(),
        current_host,
        updated_at_ms: now_ms(),
    };
    if let Some(current) = guard
        .session
        .source_readiness
        .iter_mut()
        .find(|current| current.source == source)
    {
        *current = readiness;
    } else {
        guard.session.source_readiness.push(readiness);
    }
    guard.session.updated_at_ms = now_ms();
}

fn update_session(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    status: SideraInstitutionSessionStatus,
    code: impl Into<String>,
    message: impl Into<String>,
    current_host: Option<String>,
) -> SideraInstitutionSessionState {
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.session.status = status;
    let code = code.into();
    let message = message.into();
    guard.session.code = code.clone();
    guard.session.message = message.clone();
    guard.session.current_host = current_host.clone();
    guard.session.updated_at_ms = now_ms();
    guard.session.database_auth.status = auth_status_from_session(status);
    guard.session.database_auth.code = code;
    guard.session.database_auth.message = message;
    guard.session.database_auth.current_host = current_host;
    guard.session.database_auth.updated_at_ms = guard.session.updated_at_ms;
    guard.session.clone()
}

fn clear_navigation_fallback(guard: &mut SideraInstitutionRuntimeInner) {
    guard.blocked_targets.clear();
    guard.session.fallback_target_id = None;
    guard.session.fallback_display_url = None;
}

fn begin_auth_navigation(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    kind: SideraInstitutionAuthKind,
    url: &Url,
    connection_token: Option<&InstitutionConnectionToken>,
) -> (SideraInstitutionSessionState, u64, u64) {
    let (state, navigation_epoch, generation) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_navigation_fallback(&mut guard);
        guard.session.navigation_epoch = guard.session.navigation_epoch.saturating_add(1);
        let navigation_epoch = guard.session.navigation_epoch;
        guard.pending_initial_navigation_epoch = Some(navigation_epoch);
        guard.pending_initial_navigation_connection = connection_token.cloned();
        guard.catalog_handoff_epoch = None;
        set_auth_state_locked(
            &mut guard,
            kind,
            SideraInstitutionAuthStatus::Starting,
            if kind == SideraInstitutionAuthKind::DatabaseSso {
                "SIDERA_INSTITUTION_AUTH_REDIRECTING"
            } else {
                "SIDERA_INSTITUTION_LIBRARY_AUTH_STARTING"
            },
            if kind == SideraInstitutionAuthKind::DatabaseSso {
                "正在进入武汉大学正式数据库 SSO。"
            } else {
                "正在打开武大官方个人图书馆登录入口。"
            },
            url.host_str().map(str::to_string),
        );
        (
            guard.session.clone(),
            navigation_epoch,
            guard.webview_generation,
        )
    };
    emit_session(app, &state);
    (state, navigation_epoch, generation)
}

fn begin_catalog_handoff(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    _webview: &Webview,
    generation: u64,
    landing_url: &Url,
) -> bool {
    if !is_whu_database_authenticated_landing_url(landing_url.as_str()) {
        return false;
    }

    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.webview_generation != generation
            || guard.session.active_auth_kind != Some(SideraInstitutionAuthKind::DatabaseSso)
            || guard.active_task_id.is_some()
        {
            return true;
        }
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        guard.catalog_handoff_epoch = None;
        clear_navigation_fallback(&mut guard);
        set_auth_state_locked(
            &mut guard,
            SideraInstitutionAuthKind::DatabaseSso,
            SideraInstitutionAuthStatus::Ready,
            "SIDERA_INSTITUTION_DATABASE_AUTH_READY",
            "数据库 SSO 已认证；学术论文与馆藏目录将分别检查来源就绪状态。",
            landing_url.host_str().map(str::to_string),
        );
        guard.session.clone()
    };
    emit_session(app, &state);
    true
}

fn emit_session(app: &AppHandle, state: &SideraInstitutionSessionState) {
    let _ = app.emit(INSTITUTION_SESSION_EVENT, state.clone());
}

pub(crate) fn observe_shared_browser_page(app: &AppHandle, webview: &Webview) {
    let Ok(url) = webview.url() else {
        return;
    };
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let runtime = app.state::<SideraInstitutionRuntimeState>().inner.clone();
    let mut changed = false;
    let mut close_auth_modal = false;
    let session = {
        let mut guard = runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if is_whu_database_authenticated_landing_url(url.as_str()) {
            set_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthKind::DatabaseSso,
                SideraInstitutionAuthStatus::Ready,
                "SIDERA_INSTITUTION_SESSION_READY",
                "数据库 SSO 页面已在共享机构浏览器中确认。",
                Some(host.clone()),
            );
            changed = true;
            close_auth_modal = true;
        }
        if (matches!(
            host.as_str(),
            "www.lib.whu.edu.cn"
                | "lib.whu.edu.cn"
                | "oldwww.lib.whu.edu.cn"
                | "opac.lib.whu.edu.cn"
        ) || is_whu_institution_auth_host(&host))
            && guard.session.library_account_auth.status != SideraInstitutionAuthStatus::Ready
        {
            let (status, code, message) = library_auth_from_url(&url);
            if status != SideraInstitutionAuthStatus::Starting {
                set_auth_state_locked(
                    &mut guard,
                    SideraInstitutionAuthKind::LibraryAccount,
                    status,
                    code,
                    message,
                    Some(host.clone()),
                );
                changed = true;
            }
        }
        guard.session.current_host = if host.is_empty() {
            None
        } else {
            Some(host.clone())
        };
        guard.session.updated_at_ms = now_ms();
        guard.session.clone()
    };
    if changed {
        emit_session(app, &session);
    }
    if close_auth_modal {
        crate::sidera_institution_browser::close_browser_auth_modal(app);
    }

    let inspect_library = matches!(
        host.as_str(),
        "www.lib.whu.edu.cn" | "lib.whu.edu.cn" | "oldwww.lib.whu.edu.cn" | "opac.lib.whu.edu.cn"
    );
    let inspect_discovery = host.contains("whu")
        || host.contains("metaersp")
        || host.contains("primo")
        || host.contains("discovery");
    if !inspect_library && !inspect_discovery {
        return;
    }
    let inspect_app = app.clone();
    let inspect_runtime = runtime.clone();
    let inspect_webview = webview.clone();
    tauri::async_runtime::spawn(async move {
        if inspect_library {
            if let Ok(page) = inspect_library_auth_page(&inspect_webview).await {
                let current_host = Url::parse(&page.url)
                    .ok()
                    .and_then(|value| value.host_str().map(str::to_string));
                let next = match page.kind.as_str() {
                    "library-ready" => Some((
                        SideraInstitutionAuthStatus::Ready,
                        "SIDERA_INSTITUTION_LIBRARY_AUTH_READY",
                        "个人图书馆页面已在共享机构浏览器中确认，会话已就绪。",
                    )),
                    "login-required" => Some((
                        SideraInstitutionAuthStatus::LoginRequired,
                        "SIDERA_INSTITUTION_LIBRARY_LOGIN_REQUIRED",
                        "请在共享机构浏览器中完成个人图书馆登录。",
                    )),
                    _ => None,
                };
                if let Some((status, code, message)) = next {
                    let state = {
                        let mut guard = inspect_runtime
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        if status == SideraInstitutionAuthStatus::LoginRequired {
                            set_explicit_auth_login_required_locked(
                                &mut guard,
                                SideraInstitutionAuthKind::LibraryAccount,
                                code,
                                message,
                                current_host,
                            );
                        } else {
                            set_auth_state_locked(
                                &mut guard,
                                SideraInstitutionAuthKind::LibraryAccount,
                                status,
                                code,
                                message,
                                current_host,
                            );
                        }
                        guard.session.clone()
                    };
                    emit_session(&inspect_app, &state);
                    if status == SideraInstitutionAuthStatus::Ready {
                        crate::sidera_institution_browser::close_browser_auth_modal(&inspect_app);
                    }
                }
            }
        }
        if inspect_discovery {
            if let Ok(inspection) = inspect_discovery_auth_page(&inspect_webview).await {
                let discovery_ready = inspection.kind == "ready";
                update_discovery_auth_from_inspection(
                    &inspect_app,
                    &inspect_runtime,
                    &inspection,
                    None,
                );
                if discovery_ready {
                    crate::sidera_institution_browser::close_browser_auth_modal(&inspect_app);
                }
            }
        }
    });
}

fn emit_search(app: &AppHandle, snapshot: &SideraInstitutionSearchSnapshot) {
    if snapshot.source == SideraInstitutionSearchSource::AcademicDiscovery {
        return;
    }
    let _ = app.emit(INSTITUTION_SEARCH_EVENT, snapshot.clone());
}

fn emit_research_search(app: &AppHandle, state: &SideraResearchSearchState) {
    let _ = app.emit(RESEARCH_SEARCH_EVENT, state.clone());
}

fn research_run_to_institution_snapshot(
    run: &ResearchSearchRun,
) -> SideraInstitutionSearchSnapshot {
    let status = match run.status {
        ResearchSearchStatus::Idle => SideraInstitutionSearchStatus::Idle,
        ResearchSearchStatus::CheckingSession
        | ResearchSearchStatus::AwaitingUserAuth
        | ResearchSearchStatus::ResolvingConnectors
        | ResearchSearchStatus::Searching
        | ResearchSearchStatus::Normalizing => SideraInstitutionSearchStatus::Searching,
        ResearchSearchStatus::Complete => SideraInstitutionSearchStatus::Complete,
        ResearchSearchStatus::Partial => SideraInstitutionSearchStatus::Partial,
        ResearchSearchStatus::Failed => SideraInstitutionSearchStatus::Failed,
        ResearchSearchStatus::Cancelled => SideraInstitutionSearchStatus::Cancelled,
    };
    let stage = match run.status {
        ResearchSearchStatus::Idle => SideraInstitutionSearchStage::Idle,
        ResearchSearchStatus::AwaitingUserAuth => SideraInstitutionSearchStage::AwaitingAuth,
        ResearchSearchStatus::CheckingSession | ResearchSearchStatus::ResolvingConnectors => {
            SideraInstitutionSearchStage::OpeningWebResult
        }
        ResearchSearchStatus::Searching => SideraInstitutionSearchStage::Extracting,
        ResearchSearchStatus::Normalizing => SideraInstitutionSearchStage::Extracting,
        ResearchSearchStatus::Complete | ResearchSearchStatus::Partial => {
            SideraInstitutionSearchStage::NativeSnapshotComplete
        }
        ResearchSearchStatus::Failed => SideraInstitutionSearchStage::Failed,
        ResearchSearchStatus::Cancelled => SideraInstitutionSearchStage::Cancelled,
    };
    let source_buckets = run
        .source_reports
        .iter()
        .map(|report| SideraInstitutionSourceBucket {
            id: report.source_id.clone(),
            label: report.source_name.clone(),
            count: Some(report.records_received),
            returned: report.records_accepted,
            status: match report.status {
                research_hotspots_core::research_search::ResearchSearchSourceStatus::Complete => {
                    "complete"
                }
                research_hotspots_core::research_search::ResearchSearchSourceStatus::Partial
                | research_hotspots_core::research_search::ResearchSearchSourceStatus::Failed => {
                    "failed"
                }
            }
            .to_string(),
            code: (report.status
                != research_hotspots_core::research_search::ResearchSearchSourceStatus::Complete)
                .then(|| report.code.clone()),
        })
        .collect::<Vec<_>>();
    let items = run
        .candidates
        .iter()
        .map(|candidate| SideraInstitutionSearchItem {
            id: candidate.id.clone(),
            title: candidate.title.clone(),
            authors: (!candidate.authors.is_empty()).then(|| candidate.authors.join("; ")),
            year: candidate.year,
            publication: candidate.venue.clone(),
            source_bucket: candidate.source_database.clone(),
            source_buckets: candidate.source_ids.clone(),
            document_type: Some(research_record_kind_name(candidate.record_kind).to_string()),
            doi: candidate.doi.clone(),
            abstract_snippet: candidate.abstract_text.clone(),
            availability: None,
            record_kind: candidate.record_kind,
            journal: candidate.journal.clone(),
            conference: candidate.conference.clone(),
            degree_institution: candidate.degree_institution.clone(),
            volume: candidate.volume.clone(),
            issue: candidate.issue.clone(),
            pages: candidate.pages.clone(),
            source_provider: Some(candidate.source_database.clone()),
            full_text_status: candidate.full_text_status,
            full_text_route: candidate.full_text_route,
            detail_locator: candidate
                .detail_locator
                .clone()
                .unwrap_or_else(|| candidate.id.clone()),
            full_text_locator: candidate.full_text_locator.clone(),
            provenance: SideraInstitutionSearchProvenance {
                institution_id: "whu".to_string(),
                adapter_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                source_buckets: candidate.source_ids.clone(),
                source_host: None,
                extracted_at_ms: run.updated_at_ms,
            },
            canonical_locator: candidate.canonical_url.clone(),
            provider_record_id: candidate.provider_record_id.clone(),
        })
        .collect();
    SideraInstitutionSearchSnapshot {
        institution_id: "whu".to_string(),
        adapter_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
        source: SideraInstitutionSearchSource::AcademicDiscovery,
        task_id: Some(run.task_id.clone()),
        epoch: run.epoch,
        sequence: run.sequence,
        query: run.request.query.clone(),
        status,
        stage,
        source_buckets,
        items,
        code: run.code.clone(),
        message: run.message.clone(),
        started_at_ms: Some(run.started_at_ms),
        updated_at_ms: run.updated_at_ms,
        finished_at_ms: run.finished_at_ms,
    }
}

fn mark_research_status(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    status: ResearchSearchStatus,
    code: &'static str,
    message: &'static str,
) -> Option<SideraResearchSearchState> {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let token = guard.research_search.next_token()?;
        if token.task_id != task_id {
            return None;
        }
        guard
            .research_search
            .mark_status(&token, status, code, message, now_ms())
            .ok()?;
        guard.research_search.state_snapshot()
    };
    emit_research_search(app, &state);
    Some(state)
}

fn mark_research_auth_phase_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    task_id: &str,
    phase: SideraResearchSearchAuthPhase,
) -> Option<SideraResearchSearchState> {
    let token = guard.research_search.next_token()?;
    if token.task_id != task_id {
        return None;
    }
    guard
        .research_search
        .mark_task_bound_auth_phase(&token, phase, now_ms())
        .ok()?;
    Some(guard.research_search.state_snapshot())
}

fn resume_research_auth_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    task_id: &str,
) -> Option<SideraResearchSearchState> {
    let token = guard.research_search.next_token()?;
    if token.task_id != task_id {
        return None;
    }
    guard
        .research_search
        .resume_after_task_bound_auth(&token, now_ms())
        .ok()?;
    Some(guard.research_search.state_snapshot())
}

fn update_search_stage(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    stage: SideraInstitutionSearchStage,
    code: &'static str,
    message: &'static str,
) -> bool {
    let snapshot = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.active_task_id.as_deref() != Some(task_id) {
            return false;
        }
        guard.sequence = guard.sequence.saturating_add(1);
        guard.search.sequence = guard.sequence;
        guard.search.stage = stage;
        guard.search.code = code.to_string();
        guard.search.message = message.to_string();
        guard.search.updated_at_ms = now_ms();
        guard.search.clone()
    };
    emit_search(app, &snapshot);
    true
}

fn take_academic_result_webview_label(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
) -> Option<String> {
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .academic_result_webview
        .take()
        .map(|binding| binding.label)
}

fn close_discovery_auth_window_silently(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
) {
    let (should_close, state) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(binding) = guard.academic_discovery_auth.as_mut() {
            binding.closing = true;
        }
        guard.session.discovery_auth_window_visible = false;
        let binding = guard.academic_discovery_auth.take();
        let state = binding.as_ref().and_then(|binding| {
            finalize_connection_locked(
                &mut guard,
                &binding.connection_token,
                InstitutionConnectionTerminal::Cancelled,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_CANCELLED",
                "统一发现认证窗口已收口；检索入口仍可重试。",
                None,
            )
            .map(|_| guard.session.clone())
        });
        (binding.is_some(), state)
    };
    if should_close {
        if let Some(window) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
            let _ = window.close();
        }
        let _ = restore_main_window(app);
    }
    if let Some(state) = state {
        emit_session(app, &state);
    }
}

fn close_academic_result_webview(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
) {
    close_discovery_auth_window_silently(app, inner);
    if let Some(label) = take_academic_result_webview_label(inner) {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
}

fn hide_current_academic_result_webview(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) {
    let label = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(binding) = guard.academic_result_webview.as_mut() else {
            return;
        };
        if binding.task_id != task_id {
            return;
        }
        binding.raw_visible = false;
        binding.label.clone()
    };
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.hide();
    }
}

fn is_whu_institution_auth_host(host: &str) -> bool {
    host == "cas.whu.edu.cn" || host == "metaauth.com" || host.ends_with(".metaauth.com")
}

fn session_from_url(url: &Url) -> (SideraInstitutionSessionStatus, &'static str, &'static str) {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if is_whu_institution_auth_host(&host) {
        (
            SideraInstitutionSessionStatus::LoginRequired,
            "SIDERA_INSTITUTION_LOGIN_REQUIRED",
            "请在官方页面完成机构登录；Sidera 不读取账号、密码或 Cookie。",
        )
    } else if matches!(
        host.as_str(),
        "whu.metaersp.com" | "whu.metaersp.cn" | "opac.lib.whu.edu.cn"
    ) {
        (
            SideraInstitutionSessionStatus::Starting,
            "SIDERA_INSTITUTION_PAGE_INSPECTION_PENDING",
            "官方页面已加载，正在确认真实检索结构。",
        )
    } else {
        (
            SideraInstitutionSessionStatus::Starting,
            "SIDERA_INSTITUTION_SESSION_STARTING",
            "机构页面正在加载。",
        )
    }
}

fn library_auth_from_url(url: &Url) -> (SideraInstitutionAuthStatus, &'static str, &'static str) {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if is_whu_institution_auth_host(&host) {
        return (
            SideraInstitutionAuthStatus::LoginRequired,
            "SIDERA_INSTITUTION_LIBRARY_LOGIN_REQUIRED",
            "请在武大官方认证窗口完成登录；Sidera 不读取账号、密码或 Cookie。",
        );
    }
    if matches!(host.as_str(), "www.lib.whu.edu.cn" | "lib.whu.edu.cn")
        && url.path() == "/engine2/general-rest/outer-proxy-detail-url"
    {
        return (
            SideraInstitutionAuthStatus::Starting,
            "SIDERA_INSTITUTION_LIBRARY_AUTH_REDIRECTING",
            "个人图书馆认证正在通过官方代理继续。",
        );
    }
    if matches!(
        host.as_str(),
        "www.lib.whu.edu.cn"
            | "lib.whu.edu.cn"
            | "oldwww.lib.whu.edu.cn"
            | "opac.lib.whu.edu.cn"
            | "whu.metaersp.com"
            | "whu.metaersp.cn"
    ) {
        return (
            SideraInstitutionAuthStatus::Starting,
            "SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING",
            "官方页面已加载，正在确认个人图书馆会话结构。",
        );
    }
    (
        SideraInstitutionAuthStatus::Starting,
        "SIDERA_INSTITUTION_LIBRARY_AUTH_STARTING",
        "个人图书馆官方认证页面正在加载。",
    )
}

fn session_from_adapter_page(
    page: &SideraInstitutionAdapterPage,
) -> Option<(SideraInstitutionSessionStatus, &'static str, &'static str)> {
    let (status, code) = classify_adapter_page(page);
    let message = match page.kind.as_str() {
        "login-required" => "请在官方页面完成机构登录；Sidera 不读取账号、密码或 Cookie。",
        "expired" => "机构会话已失效；请重新登录后再检索。",
        "authenticated-landing" => "数据库 SSO 已完成；学术论文与馆藏目录将分别检查各自入口。",
        "search-form" | "bucket-summary" | "records" | "zero-results" => {
            "机构页面已就绪，可进行原生检索或查看原始页面。"
        }
        "service-error" => "武大馆藏服务当前返回异常。",
        _ => return None,
    };
    Some((status, code, message))
}

fn schedule_database_page_inspection(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    generation: u64,
) {
    tauri::async_runtime::spawn(async move {
        for attempt in 0..4_u8 {
            tokio::time::sleep(if attempt == 0 {
                Duration::from_millis(250)
            } else {
                Duration::from_millis(500)
            })
            .await;
            let current = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard.webview_generation == generation
                    && guard.pending_initial_navigation_epoch.is_none()
                    && guard.active_task_id.is_none()
                    && guard.session.active_auth_kind
                        == Some(SideraInstitutionAuthKind::DatabaseSso)
            };
            if !current {
                return;
            }
            let page = match inspect_adapter_page(&webview).await {
                Ok(page) => page,
                Err((code, message)) if attempt == 3 => {
                    let state = {
                        let mut guard = inner
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        if guard.webview_generation != generation || guard.active_task_id.is_some()
                        {
                            return;
                        }
                        set_auth_state_locked(
                            &mut guard,
                            SideraInstitutionAuthKind::DatabaseSso,
                            SideraInstitutionAuthStatus::Failed,
                            code,
                            message,
                            None,
                        );
                        guard.session.clone()
                    };
                    emit_session(&app, &state);
                    return;
                }
                Err(_) => continue,
            };
            if page.kind == "unknown" && attempt < 3 {
                continue;
            }
            let (status, code, message) = if page.kind == "unknown" {
                (
                    SideraInstitutionSessionStatus::Failed,
                    "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                    "官方页面已加载，但未识别到登录页或检索结构；适配器需要依据真实页面更新。",
                )
            } else if let Some(classified) = session_from_adapter_page(&page) {
                classified
            } else {
                continue;
            };
            let current_host = Url::parse(&page.url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_string));
            let state = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if guard.webview_generation != generation || guard.active_task_id.is_some() {
                    return;
                }
                if auth_status_from_session(status) == SideraInstitutionAuthStatus::LoginRequired {
                    set_explicit_auth_login_required_locked(
                        &mut guard,
                        SideraInstitutionAuthKind::DatabaseSso,
                        code,
                        message,
                        current_host,
                    );
                } else {
                    set_auth_state_locked(
                        &mut guard,
                        SideraInstitutionAuthKind::DatabaseSso,
                        auth_status_from_session(status),
                        code,
                        message,
                        current_host,
                    );
                }
                guard.session.clone()
            };
            emit_session(&app, &state);
            return;
        }
    });
}

fn schedule_library_page_inspection(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    generation: u64,
) {
    tauri::async_runtime::spawn(async move {
        for attempt in 0..6_u8 {
            tokio::time::sleep(if attempt == 0 {
                Duration::from_millis(250)
            } else {
                Duration::from_millis(500)
            })
            .await;
            let current = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard.webview_generation == generation && guard.session.auth_modal_visible
            };
            if !current {
                return;
            }

            let page = match inspect_library_auth_page(&webview).await {
                Ok(page) => page,
                Err(_) if attempt < 5 => continue,
                Err((code, message)) => {
                    finish_library_auth_modal(
                        &app,
                        &inner,
                        SideraInstitutionAuthStatus::Failed,
                        code,
                        message,
                        None,
                        true,
                    );
                    return;
                }
            };
            let current_host = Url::parse(&page.url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_string));
            match page.kind.as_str() {
                "library-ready" => {
                    finish_library_auth_modal(
                        &app,
                        &inner,
                        SideraInstitutionAuthStatus::Ready,
                        "SIDERA_INSTITUTION_LIBRARY_AUTH_READY",
                        "个人图书馆页面已确认，会话已就绪。",
                        current_host,
                        true,
                    );
                    return;
                }
                "login-required" => {
                    let state = {
                        let mut guard = inner
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        if guard.webview_generation != generation
                            || !guard.session.auth_modal_visible
                        {
                            return;
                        }
                        set_explicit_auth_login_required_locked(
                            &mut guard,
                            SideraInstitutionAuthKind::LibraryAccount,
                            "SIDERA_INSTITUTION_LIBRARY_LOGIN_REQUIRED",
                            "请在当前武大官方认证窗口完成个人图书馆登录。",
                            current_host,
                        );
                        guard.session.clone()
                    };
                    emit_session(&app, &state);
                    return;
                }
                "service-error" => {
                    finish_library_auth_modal(
                        &app,
                        &inner,
                        SideraInstitutionAuthStatus::Failed,
                        "SIDERA_INSTITUTION_LIBRARY_UPSTREAM_ERROR",
                        "个人图书馆官方页面当前返回服务异常；主窗口已恢复。",
                        current_host,
                        true,
                    );
                    return;
                }
                _ if attempt < 5 => continue,
                _ => {
                    let state = {
                        let mut guard = inner
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        if guard.webview_generation != generation
                            || !guard.session.auth_modal_visible
                        {
                            return;
                        }
                        if guard.session.library_account_auth.status
                            != SideraInstitutionAuthStatus::Ready
                        {
                            set_auth_state_locked(
                                &mut guard,
                                SideraInstitutionAuthKind::LibraryAccount,
                                SideraInstitutionAuthStatus::Starting,
                                "SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING",
                                "个人图书馆官方窗口仍可操作，正在继续确认登录状态。",
                                current_host,
                            );
                        }
                        guard.session.clone()
                    };
                    emit_session(&app, &state);
                    return;
                }
            }
        }
    });
}

fn apply_blocked_navigation_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    generation: u64,
    value: &str,
    policy_code: &'static str,
) -> bool {
    if guard.webview_generation != generation {
        return false;
    }
    let kind = guard
        .session
        .active_auth_kind
        .unwrap_or(SideraInstitutionAuthKind::DatabaseSso);
    append_navigation_event_locked(
        guard,
        generation,
        None,
        kind,
        SideraInstitutionNavigationPhase::Blocked,
        Some(value),
        false,
        Some(policy_code.to_string()),
    );
    let auth_status = match kind {
        SideraInstitutionAuthKind::DatabaseSso => guard.session.database_auth.status,
        SideraInstitutionAuthKind::LibraryAccount => guard.session.library_account_auth.status,
    };
    if guard.pending_initial_navigation_epoch.is_some()
        || matches!(
            auth_status,
            SideraInstitutionAuthStatus::Starting | SideraInstitutionAuthStatus::LoginRequired
        )
    {
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        guard.catalog_handoff_epoch = None;
        clear_navigation_fallback(guard);
        set_auth_state_locked(
            guard,
            kind,
            SideraInstitutionAuthStatus::Failed,
            "SIDERA_INSTITUTION_NAVIGATION_BLOCKED",
            "机构页面请求了非 HTTP/HTTPS 协议，WebView 无法继续该导航；请查看脱敏导航轨迹。",
            None,
        );
    } else if let Some(display_url) = safe_external_display_url(value) {
        let id = format!("fallback-{}", short_hash(value));
        guard.blocked_targets.clear();
        guard.blocked_targets.insert(id.clone(), value.to_string());
        guard.session.status = SideraInstitutionSessionStatus::Partial;
        guard.session.code = "SIDERA_INSTITUTION_NAVIGATION_REQUIRES_BROWSER".to_string();
        guard.session.message =
            "该页面不在内嵌连接器白名单中，可按需在系统浏览器打开。".to_string();
        guard.session.fallback_target_id = Some(id);
        guard.session.fallback_display_url = Some(display_url);
        guard.session.updated_at_ms = now_ms();
    }
    true
}

fn register_blocked_target(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    generation: u64,
    value: &str,
    policy_code: &'static str,
) {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !apply_blocked_navigation_locked(&mut guard, generation, value, policy_code) {
            return;
        }
        guard.session.clone()
    };
    emit_session(app, &state);
}

fn register_auth_navigation_failure(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    kind: SideraInstitutionAuthKind,
    code: &'static str,
    message: &'static str,
) {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_navigation_fallback(&mut guard);
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        guard.catalog_handoff_epoch = None;
        set_auth_state_locked(
            &mut guard,
            kind,
            SideraInstitutionAuthStatus::Failed,
            code,
            message,
            None,
        );
        guard.session.clone()
    };
    emit_session(app, &state);
}

fn clear_fallback_after_page_load(inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>) {
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    clear_navigation_fallback(&mut guard);
    guard.catalog_handoff_epoch = None;
}

fn safe_external_display_url(value: &str) -> Option<String> {
    let mut url = Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

#[derive(Clone, Copy)]
enum InstitutionWebviewRole {
    Main,
    AuthModal,
}

fn restore_main_window(app: &AppHandle) -> bool {
    if let Some(window) = app.get_window("main") {
        let _ = window.set_closable(true);
        let _ = window.show();
        let _ = window.unminimize();
        if window.set_enabled(true).is_ok() {
            let _ = window.set_focus();
            return true;
        }
    }
    false
}

fn restore_main_window_for_connection(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: &InstitutionConnectionToken,
) {
    // Restoring the native owner is intentionally idempotent.  Destroyed and
    // the bounded fallback may race; neither path may suppress the other's
    // actual SetEnabled(TRUE) attempt after a transient Win32 failure.
    if restore_main_window(app) {
        let _ = claim_connection_main_restore(inner, token);
    }
}

fn schedule_connection_main_restore_fallback(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: InstitutionConnectionToken,
) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        restore_main_window_for_connection(&app, &inner, &token);
    });
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InstitutionConnectionInspection {
    Ready,
    LoginRequired,
    Failed,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InstitutionConnectionParentVerificationRoute {
    SameVisibleLibraryLanding,
    HiddenBoundParentReload,
}

fn connection_close_current_attempts(goal: SideraInstitutionConnectionGoal) -> u8 {
    match goal {
        SideraInstitutionConnectionGoal::LibraryAccount => 1,
        SideraInstitutionConnectionGoal::DatabaseAccess
        | SideraInstitutionConnectionGoal::DiscoveryFulltext => 3,
    }
}

fn connection_parent_verification_route(
    goal: SideraInstitutionConnectionGoal,
) -> InstitutionConnectionParentVerificationRoute {
    match goal {
        SideraInstitutionConnectionGoal::LibraryAccount => {
            InstitutionConnectionParentVerificationRoute::SameVisibleLibraryLanding
        }
        SideraInstitutionConnectionGoal::DatabaseAccess
        | SideraInstitutionConnectionGoal::DiscoveryFulltext => {
            InstitutionConnectionParentVerificationRoute::HiddenBoundParentReload
        }
    }
}

#[derive(Clone, Debug)]
struct InstitutionConnectionInspectionEvidence {
    verdict: InstitutionConnectionInspection,
    surface: SideraInstitutionConnectionVerificationSurface,
    current_host: Option<String>,
    reason_code: &'static str,
}

impl InstitutionConnectionInspectionEvidence {
    fn new(
        verdict: InstitutionConnectionInspection,
        surface: SideraInstitutionConnectionVerificationSurface,
        current_host: Option<String>,
        reason_code: &'static str,
    ) -> Self {
        Self {
            verdict,
            surface,
            current_host,
            reason_code,
        }
    }

    fn unknown(
        surface: SideraInstitutionConnectionVerificationSurface,
        reason_code: &'static str,
    ) -> Self {
        Self::new(
            InstitutionConnectionInspection::Unknown,
            surface,
            None,
            reason_code,
        )
    }
}

fn public_connection_verification_verdict(
    verdict: InstitutionConnectionInspection,
) -> SideraInstitutionConnectionVerificationVerdict {
    match verdict {
        InstitutionConnectionInspection::Ready => {
            SideraInstitutionConnectionVerificationVerdict::Ready
        }
        InstitutionConnectionInspection::LoginRequired => {
            SideraInstitutionConnectionVerificationVerdict::LoginRequired
        }
        InstitutionConnectionInspection::Failed => {
            SideraInstitutionConnectionVerificationVerdict::Failed
        }
        InstitutionConnectionInspection::Unknown => {
            SideraInstitutionConnectionVerificationVerdict::Unknown
        }
    }
}

fn whitelisted_connection_inspection_reason(message: &str, fallback: &'static str) -> &'static str {
    match message {
        "LIBRARY_READY_STRONG_ACTION" => "LIBRARY_READY_STRONG_ACTION",
        "LIBRARY_READY_NAMED_MENU" => "LIBRARY_READY_NAMED_MENU",
        "LIBRARY_READY_STRUCTURAL_MENU" => "LIBRARY_READY_STRUCTURAL_MENU",
        "READY_TOP_RIGHT_VISUAL" => "READY_TOP_RIGHT_VISUAL",
        "LOGIN_VISIBLE_PASSWORD" => "LOGIN_VISIBLE_PASSWORD",
        "LOGIN_VISIBLE_FORM" => "LOGIN_VISIBLE_FORM",
        "UNKNOWN_BODY_HINT" => "UNKNOWN_BODY_HINT",
        "UNKNOWN_NO_PROOF" => "UNKNOWN_NO_PROOF",
        _ => fallback,
    }
}

fn connection_verification_elapsed_ms(started_at: &tokio::time::Instant) -> u64 {
    started_at.elapsed().as_millis().min(u64::MAX as u128) as u64
}

fn record_connection_verification_event(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: &InstitutionConnectionToken,
    stage: SideraInstitutionConnectionVerificationStage,
    evidence: &InstitutionConnectionInspectionEvidence,
    attempt: u8,
    elapsed_ms: u64,
) {
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !guard.connection.is_current(token) {
        return;
    }
    push_bounded_connection_verification_event(
        &mut guard.session.connection_verification_trace,
        SideraInstitutionConnectionVerificationEvent {
            transaction_id: token.transaction_id.clone(),
            stage,
            surface: evidence.surface,
            verdict: public_connection_verification_verdict(evidence.verdict),
            reason_code: evidence.reason_code.to_string(),
            attempt,
            elapsed_ms,
            timestamp_ms: now_ms(),
        },
    );
    guard.session.updated_at_ms = now_ms();
}

async fn inspect_connection_surface(
    webview: &Webview,
    goal: SideraInstitutionConnectionGoal,
    surface: SideraInstitutionConnectionVerificationSurface,
    eval_timeout: Duration,
) -> InstitutionConnectionInspectionEvidence {
    match goal {
        SideraInstitutionConnectionGoal::DatabaseAccess => {
            match inspect_adapter_page_with_timeout(webview, eval_timeout).await {
                Ok(page) => {
                    let host = Url::parse(&page.url)
                        .ok()
                        .and_then(|url| url.host_str().map(str::to_string));
                    let (inspection, reason_code) = match page.kind.as_str() {
                        "authenticated-landing" | "search-form" | "records" | "zero-results" => {
                            (InstitutionConnectionInspection::Ready, "ADAPTER_READY")
                        }
                        "login-required" | "expired" => (
                            InstitutionConnectionInspection::LoginRequired,
                            "ADAPTER_LOGIN_REQUIRED",
                        ),
                        "service-error" => (
                            InstitutionConnectionInspection::Failed,
                            "ADAPTER_SERVICE_ERROR",
                        ),
                        _ => (InstitutionConnectionInspection::Unknown, "ADAPTER_UNKNOWN"),
                    };
                    InstitutionConnectionInspectionEvidence::new(
                        inspection,
                        surface,
                        host,
                        reason_code,
                    )
                }
                Err((code, _)) => InstitutionConnectionInspectionEvidence::unknown(surface, code),
            }
        }
        SideraInstitutionConnectionGoal::LibraryAccount => {
            match inspect_library_auth_page_with_timeout(webview, eval_timeout).await {
                Ok(page) => {
                    let host = Url::parse(&page.url)
                        .ok()
                        .and_then(|url| url.host_str().map(str::to_string));
                    let (inspection, reason_code) = match page.kind.as_str() {
                        "library-ready" => {
                            (InstitutionConnectionInspection::Ready, "ADAPTER_READY")
                        }
                        "login-required" => (
                            InstitutionConnectionInspection::LoginRequired,
                            "ADAPTER_LOGIN_REQUIRED",
                        ),
                        "service-error" => (
                            InstitutionConnectionInspection::Failed,
                            "ADAPTER_SERVICE_ERROR",
                        ),
                        _ => (InstitutionConnectionInspection::Unknown, "ADAPTER_UNKNOWN"),
                    };
                    let reason_code = whitelisted_connection_inspection_reason(
                        page.message.as_str(),
                        reason_code,
                    );
                    InstitutionConnectionInspectionEvidence::new(
                        inspection,
                        surface,
                        host,
                        reason_code,
                    )
                }
                Err((code, _)) => InstitutionConnectionInspectionEvidence::unknown(surface, code),
            }
        }
        SideraInstitutionConnectionGoal::DiscoveryFulltext => {
            match inspect_discovery_auth_page_with_timeout(webview, eval_timeout).await {
                Ok(page) => {
                    let host = Url::parse(&page.url)
                        .ok()
                        .and_then(|url| url.host_str().map(str::to_string));
                    let (inspection, reason_code) = match page.kind.as_str() {
                        "ready" => (InstitutionConnectionInspection::Ready, "ADAPTER_READY"),
                        "login-required" => (
                            InstitutionConnectionInspection::LoginRequired,
                            "ADAPTER_LOGIN_REQUIRED",
                        ),
                        "service-error" => (
                            InstitutionConnectionInspection::Failed,
                            "ADAPTER_SERVICE_ERROR",
                        ),
                        _ => (InstitutionConnectionInspection::Unknown, "ADAPTER_UNKNOWN"),
                    };
                    InstitutionConnectionInspectionEvidence::new(
                        inspection,
                        surface,
                        host,
                        reason_code,
                    )
                }
                Err((code, _)) => InstitutionConnectionInspectionEvidence::unknown(surface, code),
            }
        }
    }
}

fn finalize_connection_window(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: &InstitutionConnectionToken,
    terminal: InstitutionConnectionTerminal,
    code: &'static str,
    message: &'static str,
    current_host: Option<String>,
    close_window: bool,
) -> bool {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if finalize_connection_locked(&mut guard, token, terminal, code, message, current_host)
            .is_none()
        {
            return false;
        }
        guard.session.clone()
    };
    emit_session(app, &state);
    if !close_window {
        restore_main_window_for_connection(app, inner, token);
    } else {
        close_finalized_connection_window(app, inner, token);
    }
    true
}

fn close_finalized_connection_window(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: &InstitutionConnectionToken,
) {
    if let Some(auth_window) = app.get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL) {
        let _ = auth_window.close();
    }
    if let Some(window) = app.get_webview_window(INSTITUTION_CONNECTION_WINDOW_LABEL) {
        if window.close().is_ok() {
            schedule_connection_main_restore_fallback(app.clone(), inner.clone(), token.clone());
        } else {
            restore_main_window_for_connection(app, inner, token);
        }
    } else {
        restore_main_window_for_connection(app, inner, token);
    }
}

fn mark_connection_login_required_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
    current_host: Option<String>,
) {
    if let Some(kind) = connection_goal_auth_kind(token.goal) {
        set_explicit_auth_login_required_locked(
            guard,
            kind,
            "SIDERA_INSTITUTION_AUTH_LOGIN_REQUIRED",
            "官方页面明确要求重新登录；此前证明的连接已失效。",
            current_host,
        );
    } else {
        set_explicit_discovery_login_required_locked(
            guard,
            "SIDERA_INSTITUTION_DISCOVERY_AUTH_LOGIN_REQUIRED",
            "官方页面明确要求重新验证机构全文身份。",
            current_host,
        );
    }
}

fn apply_connection_login_required_observation_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
    current_host: Option<String>,
) -> bool {
    if !connection_accepts_page_observation_locked(guard, token)
        || !advance_connection_locked(
            guard,
            token,
            SideraInstitutionConnectionPhase::AwaitingUser,
            "SIDERA_INSTITUTION_CONNECTION_AWAITING_USER",
            "请在官方页面完成登录；Sidera 不读取账号、密码或 Cookie。",
        )
    {
        return false;
    }
    mark_connection_login_required_locked(guard, token, current_host);
    true
}

fn finalize_connection_login_required_verification_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    token: &InstitutionConnectionToken,
    current_host: Option<String>,
) -> Option<SideraInstitutionSessionState> {
    if !guard.connection.is_active(token) {
        return None;
    }
    mark_connection_login_required_locked(guard, token, current_host.clone());
    finalize_connection_locked(
        guard,
        token,
        InstitutionConnectionTerminal::Cancelled,
        "SIDERA_INSTITUTION_CONNECTION_LOGIN_REQUIRED",
        "官方页面明确要求重新登录；本次连接未建立。",
        current_host,
    )?;
    Some(guard.session.clone())
}

fn resolve_connection_close_inspection(
    current: InstitutionConnectionInspection,
    parent: InstitutionConnectionInspection,
) -> InstitutionConnectionInspection {
    match current {
        InstitutionConnectionInspection::Ready | InstitutionConnectionInspection::Failed => current,
        InstitutionConnectionInspection::LoginRequired => {
            if parent == InstitutionConnectionInspection::Ready {
                InstitutionConnectionInspection::Ready
            } else if parent == InstitutionConnectionInspection::Failed {
                InstitutionConnectionInspection::Failed
            } else {
                InstitutionConnectionInspection::LoginRequired
            }
        }
        InstitutionConnectionInspection::Unknown => parent,
    }
}

async fn inspect_connection_surface_before_deadline(
    webview: &Webview,
    goal: SideraInstitutionConnectionGoal,
    surface: SideraInstitutionConnectionVerificationSurface,
    deadline: tokio::time::Instant,
) -> InstitutionConnectionInspectionEvidence {
    let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
    if remaining.is_zero() {
        return InstitutionConnectionInspectionEvidence::unknown(surface, "DEADLINE");
    }
    inspect_connection_surface(
        webview,
        goal,
        surface,
        remaining.min(CONNECTION_CLOSE_EVAL_SLICE),
    )
    .await
}

async fn verify_connection_before_close(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    token: InstitutionConnectionToken,
) {
    let budget = Duration::from_millis(INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS);
    let started_at = tokio::time::Instant::now();
    let verification_result = tokio::time::timeout(budget, async {
        let deadline = started_at.clone() + budget;
        let mut current = InstitutionConnectionInspectionEvidence::unknown(
            SideraInstitutionConnectionVerificationSurface::AuthWindow,
            "NOT_OBSERVED",
        );
        let mut current_login_required_streak = 0_u8;
        let current_attempts = connection_close_current_attempts(token.goal);
        for attempt in 0..current_attempts {
            let observed = inspect_connection_surface_before_deadline(
                &webview,
                token.goal,
                SideraInstitutionConnectionVerificationSurface::AuthWindow,
                deadline,
            )
            .await;
            record_connection_verification_event(
                &inner,
                &token,
                SideraInstitutionConnectionVerificationStage::CloseCurrent,
                &observed,
                attempt.saturating_add(1),
                connection_verification_elapsed_ms(&started_at),
            );
            match observed.verdict {
                InstitutionConnectionInspection::Ready
                | InstitutionConnectionInspection::Failed => return observed,
                InstitutionConnectionInspection::LoginRequired => {
                    current_login_required_streak = current_login_required_streak.saturating_add(1);
                    if current_login_required_streak
                        >= CONNECTION_LOGIN_REQUIRED_STABILITY_OBSERVATIONS
                    {
                        current = observed;
                        break;
                    }
                }
                InstitutionConnectionInspection::Unknown => {
                    current_login_required_streak = 0;
                }
            }
            if attempt + 1 < current_attempts {
                let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                if remaining.is_zero() {
                    break;
                }
                tokio::time::sleep(remaining.min(Duration::from_millis(180))).await;
            }
        }

        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !advance_connection_locked(
                &mut guard,
                &token,
                SideraInstitutionConnectionPhase::RefreshingParent,
                "SIDERA_INSTITUTION_CONNECTION_REFRESHING_PARENT",
                "正在刷新并复查绑定的官方父页面。",
            ) {
                return InstitutionConnectionInspectionEvidence::unknown(
                    SideraInstitutionConnectionVerificationSurface::Parent,
                    "STALE_TRANSACTION",
                );
            }
            guard.session.clone()
        };
        emit_session(&app, &state);

        let parent = match connection_parent_verification_route(token.goal) {
            InstitutionConnectionParentVerificationRoute::SameVisibleLibraryLanding => {
                let landing = Url::parse(WHU_LIBRARY_HOME_URL)
                    .expect("WHU library home URL must be a valid fixed URL");
                if webview.navigate(landing).is_err() {
                    let navigate_failed = InstitutionConnectionInspectionEvidence::unknown(
                        SideraInstitutionConnectionVerificationSurface::Parent,
                        "NAVIGATE_FAILED",
                    );
                    record_connection_verification_event(
                        &inner,
                        &token,
                        SideraInstitutionConnectionVerificationStage::CloseParent,
                        &navigate_failed,
                        0,
                        connection_verification_elapsed_ms(&started_at),
                    );
                    return current;
                }
                webview.clone()
            }
            InstitutionConnectionParentVerificationRoute::HiddenBoundParentReload => {
                let Some(parent) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) else {
                    let missing = InstitutionConnectionInspectionEvidence::unknown(
                        SideraInstitutionConnectionVerificationSurface::Parent,
                        "PARENT_MISSING",
                    );
                    record_connection_verification_event(
                        &inner,
                        &token,
                        SideraInstitutionConnectionVerificationStage::CloseParent,
                        &missing,
                        0,
                        connection_verification_elapsed_ms(&started_at),
                    );
                    return current;
                };
                if parent.reload().is_err() {
                    let reload_failed = InstitutionConnectionInspectionEvidence::unknown(
                        SideraInstitutionConnectionVerificationSurface::Parent,
                        "RELOAD_FAILED",
                    );
                    record_connection_verification_event(
                        &inner,
                        &token,
                        SideraInstitutionConnectionVerificationStage::CloseParent,
                        &reload_failed,
                        0,
                        connection_verification_elapsed_ms(&started_at),
                    );
                    return current;
                }
                parent
            }
        };
        let mut parent_observation = InstitutionConnectionInspectionEvidence::unknown(
            SideraInstitutionConnectionVerificationSurface::Parent,
            "NOT_OBSERVED",
        );
        let mut parent_login_required_streak = 0_u8;
        for attempt in 0..8_u8 {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            tokio::time::sleep(remaining.min(Duration::from_millis(240))).await;
            let observed = inspect_connection_surface_before_deadline(
                &parent,
                token.goal,
                SideraInstitutionConnectionVerificationSurface::Parent,
                deadline,
            )
            .await;
            record_connection_verification_event(
                &inner,
                &token,
                SideraInstitutionConnectionVerificationStage::CloseParent,
                &observed,
                attempt.saturating_add(1),
                connection_verification_elapsed_ms(&started_at),
            );
            match observed.verdict {
                InstitutionConnectionInspection::Ready
                | InstitutionConnectionInspection::Failed => return observed,
                InstitutionConnectionInspection::LoginRequired => {
                    parent_login_required_streak = parent_login_required_streak.saturating_add(1);
                    if parent_login_required_streak
                        >= CONNECTION_LOGIN_REQUIRED_STABILITY_OBSERVATIONS
                    {
                        parent_observation = observed;
                    }
                }
                InstitutionConnectionInspection::Unknown => {
                    parent_login_required_streak = 0;
                }
            }
        }
        let resolved =
            resolve_connection_close_inspection(current.verdict, parent_observation.verdict);
        if parent_observation.verdict == resolved {
            parent_observation
        } else {
            current
        }
    })
    .await;
    let verification = verification_result.unwrap_or_else(|_| {
        let surface = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if guard.connection.current().is_some_and(|connection| {
                connection.phase == SideraInstitutionConnectionPhase::RefreshingParent
            }) {
                SideraInstitutionConnectionVerificationSurface::Parent
            } else {
                SideraInstitutionConnectionVerificationSurface::AuthWindow
            }
        };
        InstitutionConnectionInspectionEvidence::unknown(surface, "DEADLINE")
    });
    record_connection_verification_event(
        &inner,
        &token,
        SideraInstitutionConnectionVerificationStage::Resolved,
        &verification,
        0,
        connection_verification_elapsed_ms(&started_at),
    );

    match verification.verdict {
        InstitutionConnectionInspection::Ready => {
            finalize_connection_window(
                &app,
                &inner,
                &token,
                InstitutionConnectionTerminal::Ready,
                "SIDERA_INSTITUTION_CONNECTION_READY",
                "官方页面已确认机构连接。",
                verification.current_host,
                true,
            );
        }
        InstitutionConnectionInspection::Failed => {
            finalize_connection_window(
                &app,
                &inner,
                &token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_VERIFY_FAILED",
                "官方页面返回服务异常；本次连接未改变此前已证明的状态。",
                verification.current_host,
                true,
            );
        }
        InstitutionConnectionInspection::LoginRequired => {
            let state = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                finalize_connection_login_required_verification_locked(
                    &mut guard,
                    &token,
                    verification.current_host,
                )
            };
            if let Some(state) = state {
                emit_session(&app, &state);
                close_finalized_connection_window(&app, &inner, &token);
            }
        }
        InstitutionConnectionInspection::Unknown => {
            finalize_connection_window(
                &app,
                &inner,
                &token,
                InstitutionConnectionTerminal::Cancelled,
                "SIDERA_INSTITUTION_CONNECTION_CANCELLED",
                "认证窗口已关闭，但未能在限定时间内证明新的登录状态。",
                verification.current_host,
                true,
            );
        }
    }
}

fn schedule_connection_page_observation(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    token: InstitutionConnectionToken,
    surface: SideraInstitutionConnectionVerificationSurface,
) {
    tauri::async_runtime::spawn(async move {
        let started_at = tokio::time::Instant::now();
        let mut observed =
            InstitutionConnectionInspectionEvidence::unknown(surface, "NOT_OBSERVED");
        let mut login_required_streak = 0_u8;
        for attempt in 0..CONNECTION_PAGE_OBSERVATION_ATTEMPTS {
            let accepts_observation = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                connection_accepts_page_observation_locked(&guard, &token)
            };
            if !accepts_observation {
                return;
            }
            let candidate = inspect_connection_surface(
                &webview,
                token.goal,
                surface,
                CONNECTION_PAGE_OBSERVATION_EVAL_TIMEOUT,
            )
            .await;
            record_connection_verification_event(
                &inner,
                &token,
                SideraInstitutionConnectionVerificationStage::PageObservation,
                &candidate,
                attempt.saturating_add(1),
                connection_verification_elapsed_ms(&started_at),
            );
            match candidate.verdict {
                InstitutionConnectionInspection::Ready
                | InstitutionConnectionInspection::Failed => {
                    observed = candidate;
                    break;
                }
                InstitutionConnectionInspection::LoginRequired => {
                    login_required_streak = login_required_streak.saturating_add(1);
                    if login_required_streak >= CONNECTION_LOGIN_REQUIRED_STABILITY_OBSERVATIONS {
                        observed = candidate;
                        break;
                    }
                    observed =
                        InstitutionConnectionInspectionEvidence::unknown(surface, "NOT_OBSERVED");
                }
                InstitutionConnectionInspection::Unknown => {
                    login_required_streak = 0;
                    observed = candidate;
                }
            }
            if attempt + 1 < CONNECTION_PAGE_OBSERVATION_ATTEMPTS {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        }
        match observed.verdict {
            InstitutionConnectionInspection::Ready => {
                let accepts_observation = {
                    let guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    connection_accepts_page_observation_locked(&guard, &token)
                };
                if !accepts_observation {
                    return;
                }
                finalize_connection_window(
                    &app,
                    &inner,
                    &token,
                    InstitutionConnectionTerminal::Ready,
                    "SIDERA_INSTITUTION_CONNECTION_READY",
                    "官方页面已确认机构连接。",
                    observed.current_host,
                    true,
                );
            }
            InstitutionConnectionInspection::Failed => {
                let accepts_observation = {
                    let guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    connection_accepts_page_observation_locked(&guard, &token)
                };
                if !accepts_observation {
                    return;
                }
                finalize_connection_window(
                    &app,
                    &inner,
                    &token,
                    InstitutionConnectionTerminal::Failed,
                    "SIDERA_INSTITUTION_CONNECTION_VERIFY_FAILED",
                    "官方页面返回服务异常；本次连接未改变此前已证明的状态。",
                    observed.current_host,
                    true,
                );
            }
            InstitutionConnectionInspection::LoginRequired => {
                let state = {
                    let mut guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if !apply_connection_login_required_observation_locked(
                        &mut guard,
                        &token,
                        observed.current_host,
                    ) {
                        return;
                    }
                    guard.session.clone()
                };
                emit_session(&app, &state);
            }
            InstitutionConnectionInspection::Unknown => {
                let state = {
                    let mut guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if !connection_accepts_page_observation_locked(&guard, &token)
                        || !advance_connection_locked(
                            &mut guard,
                            &token,
                            SideraInstitutionConnectionPhase::AwaitingUser,
                            "SIDERA_INSTITUTION_CONNECTION_AWAITING_USER",
                            "请在官方页面完成登录；Sidera 不读取账号、密码或 Cookie。",
                        )
                    {
                        return;
                    }
                    guard.session.clone()
                };
                emit_session(&app, &state);
            }
        }
    });
}

fn create_library_connection_auth_popup(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    target: &Url,
    features: NewWindowFeatures,
    token: InstitutionConnectionToken,
) -> NewWindowResponse<tauri::Wry> {
    if !matches!(target.scheme(), "http" | "https" | "about") {
        finalize_connection_window(
            app,
            inner,
            &token,
            InstitutionConnectionTerminal::Failed,
            "SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_TARGET_REJECTED",
            "个人图书馆登录请求了不受支持的窗口协议；主窗口已恢复。",
            None,
            true,
        );
        return NewWindowResponse::Deny;
    }
    let authorized = {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        library_connection_popup_is_authorized_locked(&guard, &token)
    };
    if !authorized {
        return NewWindowResponse::Deny;
    }
    if let Some(existing) = app.get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL) {
        let bound_to_current = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            library_connection_popup_is_bound_locked(&guard, &token)
        };
        if bound_to_current {
            let _ = existing.show();
            let _ = existing.set_focus();
            return NewWindowResponse::Deny;
        }
        {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.connection_auth_popup_token = None;
        }
        let _ = existing.close();
    }

    let main_host = match resolve_main_window_host(app) {
        Ok(host) => host,
        Err(_) => {
            finalize_connection_window(
                app,
                inner,
                &token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_CREATE_FAILED",
                "个人图书馆登录窗口无法绑定 Sidera 主窗口；主窗口已恢复。",
                None,
                true,
            );
            return NewWindowResponse::Deny;
        }
    };
    let page_app = app.clone();
    let page_inner = inner.clone();
    let page_token = token.clone();
    let blank = Url::parse("about:blank").expect("about:blank must be a valid URL");
    // Returning this builder through NewWindowResponse::Create lets WebView2
    // attach the requested popup to its real opener/environment.  Do not
    // replay the target with navigate(): that would discard POST and opener
    // state carried by the official authentication flow.
    let builder = WebviewWindowBuilder::new(
        app,
        INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL,
        WebviewUrl::External(blank),
    )
    .window_features(features)
    .title("Sidera · 个人图书馆登录")
    .inner_size(960.0, 720.0)
    .min_inner_size(720.0, 560.0)
    .center()
    .resizable(true)
    .decorations(true)
    .focused(false)
    .visible(false)
    .on_navigation(|target| matches!(target.scheme(), "http" | "https" | "about"))
    .on_new_window(|_target, _features| NewWindowResponse::Deny)
    .on_page_load(move |webview, payload| {
        if payload.event() != PageLoadEvent::Finished || payload.url().as_str() == "about:blank" {
            return;
        }
        schedule_connection_page_observation(
            page_app.clone(),
            page_inner.clone(),
            webview.as_ref().clone(),
            page_token.clone(),
            SideraInstitutionConnectionVerificationSurface::AuthWindow,
        );
    });
    let builder = match bind_webview_window_owner(builder, &main_host) {
        Ok(builder) => builder,
        Err(_) => {
            finalize_connection_window(
                app,
                inner,
                &token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_CREATE_FAILED",
                "个人图书馆登录窗口无法绑定 Sidera 主窗口；主窗口已恢复。",
                None,
                true,
            );
            return NewWindowResponse::Deny;
        }
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(_) => {
            finalize_connection_window(
                app,
                inner,
                &token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_CREATE_FAILED",
                "个人图书馆登录窗口创建失败；主窗口已恢复。",
                None,
                true,
            );
            return NewWindowResponse::Deny;
        }
    };
    let still_authorized = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        bind_library_connection_popup_locked(&mut guard, &token)
    };
    if !still_authorized {
        let _ = window.close();
        return NewWindowResponse::Deny;
    }

    let close_app = app.clone();
    let close_inner = inner.clone();
    let close_token = token.clone();
    window.on_window_event(move |event| {
        if !matches!(event, WindowEvent::Destroyed) {
            return;
        }
        let state = {
            let mut guard = close_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !clear_matching_library_connection_popup_locked(&mut guard, &close_token) {
                return;
            }
            claim_library_connection_popup_parent_refresh_locked(&mut guard, &close_token)
        };
        let Some(state) = state else {
            return;
        };
        emit_session(&close_app, &state);

        let Some(parent) = close_app.get_webview_window(INSTITUTION_CONNECTION_WINDOW_LABEL) else {
            finalize_connection_window(
                &close_app,
                &close_inner,
                &close_token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_PARENT_MISSING",
                "个人图书馆父页面不可用；本次连接未改变此前已证明的状态。",
                None,
                true,
            );
            return;
        };
        let landing = Url::parse(WHU_LIBRARY_HOME_URL)
            .expect("WHU library home URL must be a valid fixed URL");
        if parent.navigate(landing).is_err() {
            finalize_connection_window(
                &close_app,
                &close_inner,
                &close_token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_PARENT_REFRESH_FAILED",
                "个人图书馆父页面未能重新加载；本次连接未改变此前已证明的状态。",
                None,
                true,
            );
            return;
        }
        let _ = parent.show();
        let _ = parent.set_focus();
    });

    if window.show().is_err() || window.set_focus().is_err() {
        finalize_connection_window(
            app,
            inner,
            &token,
            InstitutionConnectionTerminal::Failed,
            "SIDERA_INSTITUTION_CONNECTION_AUTH_POPUP_SHOW_FAILED",
            "个人图书馆登录窗口未能安全显示；主窗口已恢复。",
            None,
            true,
        );
        return NewWindowResponse::Deny;
    }

    NewWindowResponse::Create { window }
}

fn create_connection_window(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    url: Url,
    token: InstitutionConnectionToken,
) -> Result<(), String> {
    if let Some(stale) = app.get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL) {
        let _ = stale.close();
    }
    if let Some(stale) = app.get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL) {
        let _ = stale.close();
    }
    if let Some(stale) = app.get_webview_window(INSTITUTION_CONNECTION_WINDOW_LABEL) {
        let _ = stale.close();
    }
    let main_host = resolve_main_window_host(app).map_err(|code| code.to_string())?;
    let data_directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "SIDERA_INSTITUTION_DATA_DIRECTORY_UNAVAILABLE".to_string())?
        .join(INSTITUTION_DATA_DIRECTORY);
    fs::create_dir_all(&data_directory)
        .map_err(|_| "SIDERA_INSTITUTION_DATA_DIRECTORY_CREATE_FAILED".to_string())?;

    let page_app = app.clone();
    let page_inner = inner.clone();
    let page_token = token.clone();
    let nested_app = app.clone();
    let nested_inner = inner.clone();
    let nested_token = token.clone();
    let title = match token.goal {
        SideraInstitutionConnectionGoal::DatabaseAccess => "Sidera · 数据库认证",
        SideraInstitutionConnectionGoal::LibraryAccount => "Sidera · 个人图书馆认证",
        SideraInstitutionConnectionGoal::DiscoveryFulltext => "Sidera · 统一发现认证",
    };
    let target_url = url;
    let blank = Url::parse("about:blank").expect("about:blank must be a valid URL");
    let builder = WebviewWindowBuilder::new(
        app,
        INSTITUTION_CONNECTION_WINDOW_LABEL,
        WebviewUrl::External(blank),
    )
    .data_directory(data_directory)
    .title(title)
    .inner_size(960.0, 720.0)
    .min_inner_size(720.0, 560.0)
    .center()
    .resizable(true)
    .decorations(true)
    .focused(false)
    .visible(false)
    .on_navigation(|target| matches!(target.scheme(), "http" | "https" | "about"))
    .on_new_window(move |target, features| {
        if nested_token.goal == SideraInstitutionConnectionGoal::LibraryAccount {
            create_library_connection_auth_popup(
                &nested_app,
                &nested_inner,
                &target,
                features,
                nested_token.clone(),
            )
        } else if matches!(target.scheme(), "http" | "https" | "about") {
            NewWindowResponse::Allow
        } else {
            NewWindowResponse::Deny
        }
    })
    .on_page_load(move |webview, payload| {
        if payload.event() == PageLoadEvent::Finished && payload.url().as_str() != "about:blank" {
            schedule_connection_page_observation(
                page_app.clone(),
                page_inner.clone(),
                webview.as_ref().clone(),
                page_token.clone(),
                SideraInstitutionConnectionVerificationSurface::AuthWindow,
            );
        }
    });
    let builder =
        bind_webview_window_owner(builder, &main_host).map_err(|code| code.to_string())?;
    let window = builder
        .build()
        .map_err(|_| "SIDERA_INSTITUTION_CONNECTION_WINDOW_CREATE_FAILED".to_string())?;

    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !guard.connection.is_current(&token) {
            let _ = window.close();
            return Err("SIDERA_INSTITUTION_CONNECTION_STALE".to_string());
        }
        advance_connection_locked(
            &mut guard,
            &token,
            SideraInstitutionConnectionPhase::AwaitingUser,
            "SIDERA_INSTITUTION_CONNECTION_AWAITING_USER",
            "请在官方页面完成登录；Sidera 不读取账号、密码或 Cookie。",
        );
        guard.session.clone()
    };
    let close_app = app.clone();
    let close_inner = inner.clone();
    let close_webview = window.as_ref().clone();
    let close_token = token.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            let (prevent, spawn_verify, state) = {
                let mut guard = close_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if !guard.connection.is_current(&close_token) {
                    (false, false, None)
                } else {
                    let phase = guard.connection.current().map(|value| value.phase);
                    match phase {
                        Some(SideraInstitutionConnectionPhase::Opening)
                        | Some(SideraInstitutionConnectionPhase::AwaitingUser) => {
                            let changed = advance_connection_locked(
                                &mut guard,
                                &close_token,
                                SideraInstitutionConnectionPhase::Verifying,
                                "SIDERA_INSTITUTION_CONNECTION_VERIFYING",
                                "正在关闭前核对当前页与绑定父页。",
                            );
                            (true, changed, changed.then(|| guard.session.clone()))
                        }
                        Some(SideraInstitutionConnectionPhase::Verifying)
                        | Some(SideraInstitutionConnectionPhase::RefreshingParent) => {
                            (true, false, None)
                        }
                        _ => (false, false, None),
                    }
                }
            };
            if prevent {
                api.prevent_close();
            }
            if let Some(state) = state {
                emit_session(&close_app, &state);
            }
            if spawn_verify {
                let verify_app = close_app.clone();
                let verify_inner = close_inner.clone();
                let verify_webview = close_webview.clone();
                let verify_token = close_token.clone();
                tauri::async_runtime::spawn(async move {
                    verify_connection_before_close(
                        verify_app,
                        verify_inner,
                        verify_webview,
                        verify_token,
                    )
                    .await;
                });
            }
        }
        WindowEvent::Destroyed => {
            let state = {
                let mut guard = close_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                finalize_connection_locked(
                    &mut guard,
                    &close_token,
                    InstitutionConnectionTerminal::Cancelled,
                    "SIDERA_INSTITUTION_CONNECTION_CANCELLED",
                    "认证窗口意外关闭；已保留此前证明的连接状态。",
                    None,
                )
                .map(|_| guard.session.clone())
            };
            let finalized = state.is_some();
            if let Some(state) = state {
                emit_session(&close_app, &state);
            }
            if finalized {
                if let Some(auth_window) =
                    close_app.get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL)
                {
                    let _ = auth_window.close();
                }
            }
            restore_main_window_for_connection(&close_app, &close_inner, &close_token);
        }
        _ => {}
    });

    // The owned authentication window provides association and focus without
    // disabling the maximized main HWND.  A hidden, failed, or late-destroyed
    // child can therefore never leave the desktop surface non-interactive.
    let _ = restore_main_window(app);
    emit_session(app, &state);
    if window.show().is_err() || window.set_focus().is_err() || window.navigate(target_url).is_err()
    {
        finalize_connection_window(
            app,
            inner,
            &token,
            InstitutionConnectionTerminal::Failed,
            "SIDERA_INSTITUTION_CONNECTION_WINDOW_SHOW_FAILED",
            "认证窗口未能安全显示；主窗口已恢复。",
            None,
            true,
        );
        return Err("SIDERA_INSTITUTION_CONNECTION_WINDOW_SHOW_FAILED".to_string());
    }
    Ok(())
}

fn finish_library_auth_modal(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    status: SideraInstitutionAuthStatus,
    code: &'static str,
    message: &'static str,
    current_host: Option<String>,
    close_window: bool,
) {
    let (state, coordinator_owns_auth) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let coordinator_owns_auth = active_connection_owns_auth_locked(&guard);
        if coordinator_owns_auth {
            guard.session.auth_modal_visible = false;
            guard.session.updated_at_ms = now_ms();
            (None, true)
        } else if status == SideraInstitutionAuthStatus::Cancelled
            && !guard.session.auth_modal_visible
        {
            (None, false)
        } else {
            guard.session.auth_modal_visible = false;
            set_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthKind::LibraryAccount,
                status,
                code,
                message,
                current_host,
            );
            (Some(guard.session.clone()), false)
        }
    };
    if close_window {
        if let Some(window) = app.get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL) {
            let _ = window.close();
        }
    }
    if !coordinator_owns_auth {
        restore_main_window(app);
    }
    if let Some(state) = state {
        emit_session(app, &state);
    }
}

fn handle_navigation_completed(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    generation: u64,
    role: InstitutionWebviewRole,
    navigation_id: Option<u64>,
    success: bool,
    web_error_status: Option<String>,
) {
    let url = webview.url().ok();
    if url
        .as_ref()
        .is_some_and(|url| url.as_str() == "about:blank")
    {
        return;
    }

    let auth_kind = {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match role {
            InstitutionWebviewRole::Main => guard
                .session
                .active_auth_kind
                .unwrap_or(SideraInstitutionAuthKind::DatabaseSso),
            InstitutionWebviewRole::AuthModal => SideraInstitutionAuthKind::LibraryAccount,
        }
    };
    if matches!(role, InstitutionWebviewRole::Main)
        && auth_kind == SideraInstitutionAuthKind::LibraryAccount
    {
        let accepts_library_event = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.connection.current_token().is_some_and(|token| {
                token.goal == SideraInstitutionConnectionGoal::LibraryAccount
                    && connection_accepts_page_observation_locked(&guard, &token)
            })
        };
        if !accepts_library_event {
            return;
        }
    }
    record_navigation_event(
        app,
        inner,
        generation,
        navigation_id,
        auth_kind,
        if success {
            SideraInstitutionNavigationPhase::Completed
        } else {
            SideraInstitutionNavigationPhase::Failed
        },
        url.as_ref().map(|value| value.as_str()),
        false,
        web_error_status.clone(),
    );
    if matches!(role, InstitutionWebviewRole::Main)
        && success
        && auth_kind == SideraInstitutionAuthKind::DatabaseSso
        && url
            .as_ref()
            .is_some_and(|value| begin_catalog_handoff(app, inner, webview, generation, value))
    {
        return;
    }
    if matches!(role, InstitutionWebviewRole::Main)
        && auth_kind == SideraInstitutionAuthKind::LibraryAccount
    {
        if success {
            // The hidden parent's Finished page-load callback is the sole owner
            // of library DOM observation. NavigationCompleted only records the
            // transport event so callback ordering cannot consume the pending
            // navigation without scheduling an inspection.
            return;
        }
        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let token = guard.connection.current_token().filter(|token| {
                token.goal == SideraInstitutionConnectionGoal::LibraryAccount
                    && connection_accepts_page_observation_locked(&guard, token)
                    && guard
                        .pending_initial_navigation_connection
                        .as_ref()
                        .map_or(true, |pending| pending == token)
            });
            let Some(token) = token else {
                return;
            };
            clear_matching_pending_initial_navigation_locked(&mut guard, &token);
            guard.catalog_handoff_epoch = None;
            let status = web_error_status.as_deref().unwrap_or("WEBVIEW2_UNKNOWN");
            set_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthKind::LibraryAccount,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_NAVIGATION_WEBVIEW_FAILED",
                format!("官方机构页面导航失败（{status}）；请查看脱敏导航轨迹。"),
                url.as_ref()
                    .and_then(|value| value.host_str().map(str::to_string)),
            );
            guard.session.clone()
        };
        emit_session(app, &state);
        return;
    }
    match role {
        InstitutionWebviewRole::Main => {
            let (state, should_show, should_inspect) = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if guard.webview_generation != generation {
                    return;
                }
                let kind = auth_kind;
                let auth_status = match kind {
                    SideraInstitutionAuthKind::DatabaseSso => guard.session.database_auth.status,
                    SideraInstitutionAuthKind::LibraryAccount => {
                        guard.session.library_account_auth.status
                    }
                };
                let pending = guard.pending_initial_navigation_epoch.is_some();
                if !pending
                    && (success
                        || !matches!(
                            auth_status,
                            SideraInstitutionAuthStatus::Starting
                                | SideraInstitutionAuthStatus::LoginRequired
                        ))
                {
                    return;
                }
                if pending {
                    guard.pending_initial_navigation_epoch = None;
                    guard.pending_initial_navigation_connection = None;
                }
                if !success {
                    guard.catalog_handoff_epoch = None;
                    let status = web_error_status.as_deref().unwrap_or("WEBVIEW2_UNKNOWN");
                    set_auth_state_locked(
                        &mut guard,
                        kind,
                        SideraInstitutionAuthStatus::Failed,
                        "SIDERA_INSTITUTION_NAVIGATION_WEBVIEW_FAILED",
                        format!("官方机构页面导航失败（{status}）；请查看脱敏导航轨迹。"),
                        url.as_ref()
                            .and_then(|value| value.host_str().map(str::to_string)),
                    );
                    (guard.session.clone(), false, false)
                } else {
                    let (status, code, message) = url.as_ref().map(session_from_url).unwrap_or((
                        SideraInstitutionSessionStatus::Failed,
                        "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                        "官方机构页面导航完成，但无法读取安全目标地址。",
                    ));
                    set_auth_state_locked(
                        &mut guard,
                        kind,
                        auth_status_from_session(status),
                        code,
                        message,
                        url.as_ref()
                            .and_then(|value| value.host_str().map(str::to_string)),
                    );
                    (guard.session.clone(), guard.session.browser_visible, true)
                }
            };
            if should_show {
                let _ = webview.show();
                let _ = webview.set_focus();
            } else {
                let _ = webview.hide();
            }
            emit_session(app, &state);
            if should_inspect {
                schedule_database_page_inspection(
                    app.clone(),
                    inner.clone(),
                    webview.clone(),
                    generation,
                );
            }
        }
        InstitutionWebviewRole::AuthModal => {
            let current = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard.webview_generation == generation && guard.session.auth_modal_visible
            };
            if !current {
                return;
            }
            if !success {
                finish_library_auth_modal(
                    app,
                    inner,
                    SideraInstitutionAuthStatus::Failed,
                    "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                    "个人图书馆认证窗口导航失败；主窗口已恢复。",
                    url.as_ref()
                        .and_then(|value| value.host_str().map(str::to_string)),
                    true,
                );
                return;
            }
            let Some(url) = url else {
                return;
            };
            let (status, code, message) = library_auth_from_url(&url);
            let state = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                set_auth_state_locked(
                    &mut guard,
                    SideraInstitutionAuthKind::LibraryAccount,
                    status,
                    code,
                    message,
                    url.host_str().map(str::to_string),
                );
                guard.session.clone()
            };
            emit_session(app, &state);
            schedule_library_page_inspection(
                app.clone(),
                inner.clone(),
                webview.clone(),
                generation,
            );
        }
    }
}

async fn configure_webview_platform(
    webview: &Webview,
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    generation: u64,
    role: InstitutionWebviewRole,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_ERROR_STATUS;
        use webview2_com::{NavigationCompletedEventHandler, NavigationStartingEventHandler};
        use windows_sys::Win32::System::Com::CoTaskMemFree;

        let (sender, receiver) = tokio::sync::oneshot::channel();
        let event_webview = webview.clone();
        let protocol_inner = inner.clone();
        let protocol_webview_label = webview.label().to_string();
        webview
            .with_webview(move |platform| unsafe {
                let mut success = false;
                if let Ok(core) = platform.controller().CoreWebView2() {
                    let starting_app = app.clone();
                    let starting_inner = inner.clone();
                    let starting_handler =
                        NavigationStartingEventHandler::create(Box::new(move |_sender, args| {
                            let mut navigation_id = 0_u64;
                            let mut redirected = windows_core::BOOL(0);
                            let mut uri = windows_core::PWSTR::null();
                            let mut target = None;
                            if let Some(args) = args.as_ref() {
                                let _ = args.NavigationId(&mut navigation_id);
                                let _ = args.IsRedirected(&mut redirected);
                                if args.Uri(&mut uri).is_ok() && !uri.is_null() {
                                    target = uri.to_string().ok();
                                    CoTaskMemFree(uri.0.cast());
                                }
                            }
                            let auth_kind = match role {
                                InstitutionWebviewRole::Main => {
                                    let guard = starting_inner
                                        .lock()
                                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                                    guard
                                        .session
                                        .active_auth_kind
                                        .unwrap_or(SideraInstitutionAuthKind::DatabaseSso)
                                }
                                InstitutionWebviewRole::AuthModal => {
                                    SideraInstitutionAuthKind::LibraryAccount
                                }
                            };
                            record_navigation_event(
                                &starting_app,
                                &starting_inner,
                                generation,
                                (navigation_id != 0).then_some(navigation_id),
                                auth_kind,
                                if redirected.as_bool() {
                                    SideraInstitutionNavigationPhase::Redirect
                                } else {
                                    SideraInstitutionNavigationPhase::Starting
                                },
                                target.as_deref(),
                                redirected.as_bool(),
                                None,
                            );
                            Ok(())
                        }));
                    let event_app = app.clone();
                    let event_inner = inner.clone();
                    let event_webview = event_webview.clone();
                    let handler =
                        NavigationCompletedEventHandler::create(Box::new(move |_sender, args| {
                            let mut navigation_succeeded = windows_core::BOOL(0);
                            let mut navigation_id = 0_u64;
                            let mut web_error_status = COREWEBVIEW2_WEB_ERROR_STATUS(0);
                            let navigation_succeeded = args.as_ref().is_some_and(|args| {
                                let _ = args.NavigationId(&mut navigation_id);
                                let _ = args.WebErrorStatus(&mut web_error_status);
                                args.IsSuccess(&mut navigation_succeeded).is_ok()
                                    && navigation_succeeded.as_bool()
                            });
                            handle_navigation_completed(
                                &event_app,
                                &event_inner,
                                &event_webview,
                                generation,
                                role,
                                (navigation_id != 0).then_some(navigation_id),
                                navigation_succeeded,
                                (!navigation_succeeded)
                                    .then(|| web_error_status_code(web_error_status.0)),
                            );
                            Ok(())
                        }));
                    let mut starting_token = 0;
                    let mut completed_token = 0;
                    success = core
                        .add_NavigationStarting(&starting_handler, &mut starting_token)
                        .is_ok()
                        && core
                            .add_NavigationCompleted(&handler, &mut completed_token)
                            .is_ok();
                    if success {
                        if let Ok(subscriptions) =
                            configure_protocol_capture(&core, protocol_inner.clone())
                        {
                            crate::sidera_institution_protocol::retain_protocol_subscriptions(
                                protocol_webview_label,
                                subscriptions,
                            );
                        }
                    }
                }
                let _ = sender.send(success);
            })
            .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_CONFIGURATION_FAILED".to_string())?;
        let configured = tokio::time::timeout(Duration::from_secs(3), receiver)
            .await
            .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_CONFIGURATION_FAILED".to_string())?
            .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_CONFIGURATION_FAILED".to_string())?;
        if !configured {
            return Err("SIDERA_INSTITUTION_WEBVIEW_CONFIGURATION_FAILED".to_string());
        }
    }
    Ok(())
}

async fn configure_protocol_capture_only(
    webview: &Webview,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let label = webview.label().to_string();
        webview
            .with_webview(move |platform| unsafe {
                let configured = platform
                    .controller()
                    .CoreWebView2()
                    .ok()
                    .and_then(|core| configure_protocol_capture(&core, inner).ok());
                if let Some(subscriptions) = configured {
                    crate::sidera_institution_protocol::retain_protocol_subscriptions(
                        label,
                        subscriptions,
                    );
                    let _ = sender.send(true);
                } else {
                    let _ = sender.send(false);
                }
            })
            .map_err(|_| "SIDERA_INSTITUTION_PROTOCOL_WEBVIEW_CONFIGURATION_FAILED".to_string())?;
        let configured = tokio::time::timeout(Duration::from_secs(3), receiver)
            .await
            .map_err(|_| "SIDERA_INSTITUTION_PROTOCOL_WEBVIEW_CONFIGURATION_FAILED".to_string())?
            .map_err(|_| "SIDERA_INSTITUTION_PROTOCOL_WEBVIEW_CONFIGURATION_FAILED".to_string())?;
        if !configured {
            return Err("SIDERA_INSTITUTION_PROTOCOL_WEBVIEW_CONFIGURATION_FAILED".to_string());
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (webview, inner);
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct WhuStructuredRouteSignature {
    host: &'static str,
    path: &'static str,
    method: &'static str,
    content_type: &'static str,
    schema_sha256: &'static str,
}

// Populated only from a single redacted native signature capture. Values and
// request parameter contents are deliberately not part of this whitelist.
const WHU_STRUCTURED_ROUTE_WHITELIST: &[WhuStructuredRouteSignature] =
    &[WhuStructuredRouteSignature {
        host: "whu-primo.hosted.exlibrisgroup.com.cn",
        path: "/primo_library/libweb/webservices/rest/primo-explore/v1/pnxs",
        method: "GET",
        content_type: "application/json",
        schema_sha256: WHU_STRUCTURED_PRIMO_SCHEMA_SHA256,
    }];

fn structured_route_location_matches(
    request: &crate::sidera_institution_protocol::RedactedProtocolRequest,
    response: &crate::sidera_institution_protocol::RedactedProtocolResponse,
) -> bool {
    WHU_STRUCTURED_ROUTE_WHITELIST.iter().any(|entry| {
        request.https_host == entry.host
            && request.path == entry.path
            && request.method == entry.method
            && response.https_host == entry.host
            && response.path == entry.path
            && response.content_type == entry.content_type
    })
}

fn structured_route_matches(
    request: &crate::sidera_institution_protocol::RedactedProtocolRequest,
    response: &crate::sidera_institution_protocol::RedactedProtocolResponse,
    schema_sha256: &str,
) -> bool {
    WHU_STRUCTURED_ROUTE_WHITELIST.iter().any(|entry| {
        request.https_host == entry.host
            && request.path == entry.path
            && request.method == entry.method
            && response.https_host == entry.host
            && response.path == entry.path
            && response.content_type == entry.content_type
            && schema_sha256 == entry.schema_sha256
    })
}

fn remember_structured_request(
    guard: &mut SideraInstitutionRuntimeInner,
    request_key: [u8; 32],
    request: &crate::sidera_institution_protocol::RedactedProtocolRequest,
) -> bool {
    use crate::sidera_institution_protocol::ProtocolResourceKind;
    if !matches!(
        request.resource_kind,
        ProtocolResourceKind::Xhr | ProtocolResourceKind::Fetch
    ) {
        return false;
    }
    let Some(binding) = guard.academic_result_webview.as_ref() else {
        return false;
    };
    let Some(run) = guard.legacy_academic_transport.as_ref() else {
        return false;
    };
    if binding.task_id != run.token.task_id || !binding.is_current_for(guard, &run.token.task_id) {
        return false;
    }
    let context = StructuredProtocolRequestContext {
        request: request.clone(),
        task_id: binding.task_id.clone(),
        epoch: binding.epoch,
        task_sequence: binding.task_sequence,
        webview_generation: binding.webview_generation,
    };
    if !WHU_STRUCTURED_ROUTE_WHITELIST.iter().any(|entry| {
        request.https_host == entry.host
            && request.path == entry.path
            && request.method == entry.method
    }) {
        return false;
    }
    if guard.structured_pending_requests.len() >= 64 {
        guard.structured_pending_requests.clear();
        guard.structured_pending_responses.clear();
    }
    guard
        .structured_pending_requests
        .insert(request_key, context);
    true
}

fn accept_structured_response(
    guard: &mut SideraInstitutionRuntimeInner,
    request_key: [u8; 32],
    response: &crate::sidera_institution_protocol::RedactedProtocolResponse,
    body: &[u8],
) {
    use crate::sidera_institution_protocol::ProtocolResourceKind;
    let Some(context) = guard.structured_pending_requests.remove(&request_key) else {
        return;
    };
    if !matches!(
        response.resource_kind,
        ProtocolResourceKind::Xhr | ProtocolResourceKind::Fetch
    ) || !response.content_type.contains("json")
    {
        return;
    }
    let is_current = guard
        .academic_result_webview
        .as_ref()
        .is_some_and(|binding| {
            binding.task_id == context.task_id
                && binding.epoch == context.epoch
                && binding.task_sequence == context.task_sequence
                && binding.webview_generation == context.webview_generation
                && binding.is_current_for(guard, &context.task_id)
        })
        && guard.legacy_academic_transport.as_ref().is_some_and(|run| {
            run.token.task_id == context.task_id
                && guard.research_search.token_is_current(&run.token)
        });
    if !is_current {
        return;
    }

    let parsed = parse_whu_structured_discovery_page(body);
    let Some(run) = guard.legacy_academic_transport.as_mut() else {
        return;
    };
    if run.structured.failure_code.is_some() {
        return;
    }
    match parsed {
        Ok(page) => {
            trace_r6_structured_schema(
                request_key,
                &context.request,
                response,
                &page.schema_sha256,
            );
            if !structured_route_matches(&context.request, response, &page.schema_sha256) {
                run.structured.failure_code = Some(STRUCTURED_ROUTE_UNAVAILABLE.to_string());
                return;
            }
            if let Some(expectation) = run.structured.pending_pagination.as_ref() {
                let expectation_is_current = expectation.task_id == context.task_id
                    && expectation.epoch == context.epoch
                    && expectation.task_sequence == context.task_sequence
                    && expectation.webview_generation == context.webview_generation;
                if !expectation_is_current {
                    return;
                }
                let facet_matches = expectation.previous_page.facet.is_none()
                    || page.facet.is_none()
                    || expectation.previous_page.facet == page.facet;
                let advance =
                    classify_whu_structured_page_advance(&expectation.previous_page, &page);
                match advance {
                    WhuStructuredPageAdvance::Advanced
                        if facet_matches
                            && (!page.page_number_observed
                                || page.page_number == Some(expectation.expected_page_number)) => {}
                    WhuStructuredPageAdvance::Duplicate => {
                        // The official page can repeat its current XHR while the
                        // click is being dispatched. Keep waiting for the exact
                        // next page; the bounded waiter classifies a true stall.
                        return;
                    }
                    WhuStructuredPageAdvance::MetadataMissing => {
                        run.structured.failure_code =
                            Some(STRUCTURED_PAGINATION_METADATA_MISSING.to_string());
                        run.structured.pending_pagination = None;
                        return;
                    }
                    _ => {
                        run.structured.failure_code =
                            Some(STRUCTURED_PAGINATION_REGRESSED.to_string());
                        run.structured.pending_pagination = None;
                        return;
                    }
                }
            }
            if run
                .structured
                .accepted_page_identities
                .insert(page.page_identity.clone())
            {
                run.structured.pages.push(page);
                run.structured.pending_pagination = None;
            }
        }
        Err(error) if structured_route_location_matches(&context.request, response) => {
            run.structured.failure_code = Some(error.code().to_string());
        }
        Err(_) => {}
    }
}

fn fail_structured_response(
    guard: &mut SideraInstitutionRuntimeInner,
    request_key: [u8; 32],
    code: &'static str,
) {
    let Some(context) = guard.structured_pending_requests.remove(&request_key) else {
        guard.structured_pending_responses.remove(&request_key);
        return;
    };
    let Some(response) = guard.structured_pending_responses.remove(&request_key) else {
        return;
    };
    if !structured_route_location_matches(&context.request, &response) {
        return;
    }
    let is_current = guard
        .academic_result_webview
        .as_ref()
        .is_some_and(|binding| {
            binding.task_id == context.task_id
                && binding.epoch == context.epoch
                && binding.task_sequence == context.task_sequence
                && binding.webview_generation == context.webview_generation
                && binding.is_current_for(guard, &context.task_id)
        })
        && guard.legacy_academic_transport.as_ref().is_some_and(|run| {
            run.token.task_id == context.task_id
                && guard.research_search.token_is_current(&run.token)
        });
    if is_current {
        if let Some(run) = guard.legacy_academic_transport.as_mut() {
            run.structured
                .failure_code
                .get_or_insert_with(|| code.to_string());
        }
    }
}

#[cfg(windows)]
unsafe fn configure_protocol_capture(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
) -> Result<
    Vec<crate::sidera_institution_protocol::WebView2ProtocolSubscription>,
    crate::sidera_institution_protocol::InstitutionProtocolError,
> {
    use crate::sidera_institution_protocol::{
        capture_devtools_request_id, decode_devtools_response_body, enable_network,
        get_response_body, inspect_response_body_schema, redact_devtools_network_event,
        RedactedProtocolEvent, WebView2NetworkEvent,
    };

    enable_network(core, |_| {})?;

    let request_inner = inner.clone();
    let request_subscription = crate::sidera_institution_protocol::subscribe_network_event(
        core,
        WebView2NetworkEvent::RequestWillBeSent,
        move |raw| {
            let Ok(captured) =
                redact_devtools_network_event(WebView2NetworkEvent::RequestWillBeSent, raw)
            else {
                return;
            };
            let mut guard = request_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let remembered = if let RedactedProtocolEvent::Request(request) = captured.redacted() {
                let remembered =
                    remember_structured_request(&mut guard, captured.request_key(), request);
                if remembered {
                    trace_r6_protocol_signature(captured.request_key(), captured.redacted());
                }
                remembered
            } else {
                false
            };
            if remembered {
                let _ = guard.protocol_session.push(captured.into_redacted());
            }
        },
    )?;

    let response_inner = inner.clone();
    let response_subscription = crate::sidera_institution_protocol::subscribe_network_event(
        core,
        WebView2NetworkEvent::ResponseReceived,
        move |raw| {
            let Ok(captured) =
                redact_devtools_network_event(WebView2NetworkEvent::ResponseReceived, raw)
            else {
                return;
            };
            let request_key = captured.request_key();
            let redacted = captured.redacted().clone();
            let wants_schema = match &redacted {
                RedactedProtocolEvent::Response(response) => {
                    response.content_type.contains("json")
                        || matches!(
                            response.resource_kind,
                            crate::sidera_institution_protocol::ProtocolResourceKind::Xhr
                                | crate::sidera_institution_protocol::ProtocolResourceKind::Fetch
                        )
                }
                _ => false,
            };
            let mut guard = response_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !wants_schema || !guard.structured_pending_requests.contains_key(&request_key) {
                return;
            }
            if let RedactedProtocolEvent::Response(response) = redacted {
                guard
                    .structured_pending_responses
                    .insert(request_key, response);
            }
        },
    )?;

    // Chromium can reject Network.getResponseBody during responseReceived
    // because the body is not complete yet. Join by the opaque request id and
    // read exactly once after loadingFinished; the id and body remain
    // non-serializable SecretBytes and are cleared on every exit path.
    let loading_inner = inner.clone();
    let loading_core = core.clone();
    let loading_subscription =
        crate::sidera_institution_protocol::subscribe_loading_finished(core, move |raw| {
            let Ok(captured) = capture_devtools_request_id(raw) else {
                return;
            };
            let request_key = captured.request_key();
            let mut redacted = {
                let mut guard = loading_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let Some(response) = guard.structured_pending_responses.remove(&request_key) else {
                    return;
                };
                response
            };
            let body_inner = loading_inner.clone();
            let redacted_for_immediate_error = redacted.clone();
            let body_request = get_response_body(
                &loading_core,
                captured.request_id(),
                move |result| match result.and_then(decode_devtools_response_body) {
                    Ok(mut body) => {
                        let schema_result = inspect_response_body_schema(&mut redacted, &body);
                        let mut guard = body_inner
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        if schema_result.is_ok() {
                            accept_structured_response(
                                &mut guard,
                                request_key,
                                &redacted,
                                body.as_slice(),
                            );
                        } else if let Err(error) = schema_result {
                            guard
                                .structured_pending_responses
                                .insert(request_key, redacted.clone());
                            fail_structured_response(&mut guard, request_key, error.code());
                        }
                        body.clear();
                        trace_r6_protocol_signature(
                            request_key,
                            &RedactedProtocolEvent::Response(redacted.clone()),
                        );
                        let _ = guard
                            .protocol_session
                            .push(RedactedProtocolEvent::Response(redacted));
                    }
                    Err(error) => {
                        let mut guard = body_inner
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        guard
                            .structured_pending_responses
                            .insert(request_key, redacted.clone());
                        fail_structured_response(&mut guard, request_key, error.code());
                        let _ = guard
                            .protocol_session
                            .push(RedactedProtocolEvent::Response(redacted));
                    }
                },
            );
            if let Err(error) = body_request {
                let mut guard = loading_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard
                    .structured_pending_responses
                    .insert(request_key, redacted_for_immediate_error.clone());
                fail_structured_response(&mut guard, request_key, error.code());
                let _ = guard.protocol_session.push(RedactedProtocolEvent::Response(
                    redacted_for_immediate_error,
                ));
            }
        })?;

    Ok(vec![
        request_subscription,
        response_subscription,
        loading_subscription,
    ])
}

#[cfg(windows)]
fn trace_r6_protocol_signature(
    request_key: [u8; 32],
    event: &crate::sidera_institution_protocol::RedactedProtocolEvent,
) {
    let Some(trace_path) = std::env::var_os("SIDERA_R6_SIGNATURE_TRACE") else {
        return;
    };
    let key = request_key[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if let Ok(encoded) = serde_json::to_string(event) {
        use std::io::Write;
        if let Ok(mut output) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(trace_path)
        {
            let _ = writeln!(output, "SIDERA_R6_SIGNATURE {key} {encoded}");
        }
    }
}

#[cfg(windows)]
fn trace_r6_structured_schema(
    request_key: [u8; 32],
    request: &crate::sidera_institution_protocol::RedactedProtocolRequest,
    response: &crate::sidera_institution_protocol::RedactedProtocolResponse,
    schema_sha256: &str,
) {
    let Some(trace_path) = std::env::var_os("SIDERA_R6_SIGNATURE_TRACE") else {
        return;
    };
    let key = request_key[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let signature = serde_json::json!({
        "https_host": request.https_host,
        "path": request.path,
        "method": request.method,
        "content_type": response.content_type,
        "schema_sha256": schema_sha256,
    });
    use std::io::Write;
    if let Ok(mut output) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(trace_path)
    {
        let _ = writeln!(output, "SIDERA_R6_STRUCTURED_SCHEMA {key} {signature}");
    }
}

#[cfg(windows)]
fn trace_r6_pagination_receipt(attempt: usize, receipt: &AcademicNextPageReceipt) {
    let Some(trace_path) = std::env::var_os("SIDERA_R6_SIGNATURE_TRACE") else {
        return;
    };
    let signature = serde_json::json!({
        "attempt": attempt + 1,
        "action": receipt.action,
        "diagnostics": receipt.diagnostics,
    });
    use std::io::Write;
    if let Ok(mut output) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(trace_path)
    {
        let _ = writeln!(output, "SIDERA_R6_PAGINATION {signature}");
    }
}

async fn resolve_whu_session_entry() -> Result<Url, String> {
    let value = tauri::async_runtime::spawn_blocking(|| {
        crate::probe_whu_institution()
            .ok()
            .and_then(|probe| {
                probe
                    .navigation_targets
                    .into_iter()
                    .find(|target| target.id == "database-directory")
                    .map(|target| target.open_url)
            })
            .filter(|value| is_whu_institution_navigation_url(value))
    })
    .await
    .map_err(|_| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())?
    .ok_or_else(|| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())?;
    Url::parse(&value).map_err(|_| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())
}

fn is_blank_or_whu_navigation(url: &Url) -> bool {
    url.as_str() == "about:blank" || is_whu_institution_navigation_url(url.as_str())
}

fn register_library_auth_failure(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    code: &'static str,
    message: &'static str,
) {
    finish_library_auth_modal(
        app,
        inner,
        SideraInstitutionAuthStatus::Failed,
        code,
        message,
        None,
        false,
    );
}

fn create_library_auth_modal(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    url: &Url,
    features: NewWindowFeatures,
    generation: u64,
) -> NewWindowResponse<tauri::Wry> {
    let coordinator_owns_auth = {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        active_connection_owns_auth_locked(&guard)
    };
    if coordinator_owns_auth {
        if let Some(stale) = app.get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL) {
            let _ = stale.close();
        }
        return NewWindowResponse::Deny;
    }
    if let Some(existing) = app.get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return NewWindowResponse::Deny;
    }

    let main_host = match resolve_main_window_host(app) {
        Ok(host) => host,
        Err(code) => {
            let message = if code == MAIN_WINDOW_MISSING {
                "无法找到 Sidera 主窗口，个人图书馆认证窗口未创建。"
            } else {
                "无法取得 Sidera 主窗口的 Windows 句柄，个人图书馆认证窗口未创建。"
            };
            register_library_auth_failure(app, inner, code, message);
            return NewWindowResponse::Deny;
        }
    };
    let main = main_host.window().clone();

    let (width, height) = main
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let work = monitor.work_area().size;
            let max_width = work.width as f64 / scale * 0.9;
            let max_height = work.height as f64 / scale * 0.9;
            (960.0_f64.min(max_width), 720.0_f64.min(max_height))
        })
        .unwrap_or((960.0, 720.0));
    let min_width = 720.0_f64.min(width);
    let min_height = 560.0_f64.min(height);

    let modal_navigation_app = app.clone();
    let modal_navigation_inner = inner.clone();
    let modal_page_app = app.clone();
    let modal_page_inner = inner.clone();
    let modal_nested_app = app.clone();
    let modal_nested_inner = inner.clone();
    let blank = Url::parse("about:blank").expect("about:blank must be a valid URL");
    let builder = WebviewWindowBuilder::new(
        app,
        INSTITUTION_AUTH_WINDOW_LABEL,
        WebviewUrl::External(blank),
    )
    .window_features(features)
    .title("Sidera · 武汉大学认证")
    .inner_size(width, height)
    .min_inner_size(min_width, min_height)
    .center()
    .resizable(true)
    .decorations(true)
    .focused(false)
    .visible(false)
    .on_navigation(move |target| {
        let allowed = is_blank_or_whu_navigation(target);
        if !allowed {
            finish_library_auth_modal(
                &modal_navigation_app,
                &modal_navigation_inner,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                "个人图书馆认证请求了非 HTTP/HTTPS 协议，当前 WebView 无法继续。",
                None,
                true,
            );
        }
        allowed
    })
    .on_new_window(move |target, _features| {
        if is_blank_or_whu_navigation(&target) {
            NewWindowResponse::Allow
        } else {
            finish_library_auth_modal(
                &modal_nested_app,
                &modal_nested_inner,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                "个人图书馆认证请求了非 HTTP/HTTPS 弹窗，当前 WebView 无法继续。",
                None,
                true,
            );
            NewWindowResponse::Deny
        }
    })
    .on_page_load(move |webview, payload| {
        if payload.event() != PageLoadEvent::Finished || payload.url().as_str() == "about:blank" {
            return;
        }
        let current = {
            let guard = modal_page_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.webview_generation == generation && guard.session.auth_modal_visible
        };
        if !current {
            return;
        }
        let (status, code, message) = library_auth_from_url(payload.url());
        let state = {
            let mut guard = modal_page_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if guard.webview_generation != generation || !guard.session.auth_modal_visible {
                return;
            }
            set_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthKind::LibraryAccount,
                status,
                code,
                message,
                payload.url().host_str().map(str::to_string),
            );
            guard.session.clone()
        };
        emit_session(&modal_page_app, &state);
        schedule_library_page_inspection(
            modal_page_app.clone(),
            modal_page_inner.clone(),
            webview.as_ref().clone(),
            generation,
        );
    });

    let builder = match bind_webview_window_owner(builder, &main_host) {
        Ok(builder) => builder,
        Err(code) => {
            register_library_auth_failure(
                app,
                inner,
                code,
                "无法将个人图书馆认证窗口绑定到 Sidera 主窗口。",
            );
            return NewWindowResponse::Deny;
        }
    };
    let modal = match builder.build() {
        Ok(modal) => modal,
        Err(_) => {
            register_library_auth_failure(
                app,
                inner,
                "SIDERA_INSTITUTION_AUTH_POPUP_CREATE_FAILED",
                "个人图书馆认证窗口创建失败；主窗口仍可继续使用。",
            );
            return NewWindowResponse::Deny;
        }
    };

    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.session.auth_modal_visible = true;
        set_auth_state_locked(
            &mut guard,
            SideraInstitutionAuthKind::LibraryAccount,
            SideraInstitutionAuthStatus::Starting,
            "SIDERA_INSTITUTION_AUTH_REDIRECTING",
            "个人图书馆官方认证窗口正在打开。",
            url.host_str().map(str::to_string),
        );
        guard.session.clone()
    };
    let close_app = app.clone();
    let close_inner = inner.clone();
    modal.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            finish_library_auth_modal(
                &close_app,
                &close_inner,
                SideraInstitutionAuthStatus::Cancelled,
                "SIDERA_INSTITUTION_AUTH_CANCELLED",
                "已取消个人图书馆登录；主窗口已恢复。",
                None,
                false,
            );
        }
    });

    let _ = restore_main_window(app);
    if modal.show().is_err() || modal.set_focus().is_err() {
        finish_library_auth_modal(
            app,
            inner,
            SideraInstitutionAuthStatus::Failed,
            "SIDERA_INSTITUTION_AUTH_POPUP_SHOW_FAILED",
            "个人图书馆认证窗口未能安全显示；主窗口已恢复。",
            None,
            true,
        );
        return NewWindowResponse::Deny;
    }
    emit_session(app, &state);

    let modal_webview = modal.as_ref().clone();
    let configure_app = app.clone();
    let configure_inner = inner.clone();
    tauri::async_runtime::spawn(async move {
        if configure_webview_platform(
            &modal_webview,
            configure_app.clone(),
            configure_inner.clone(),
            generation,
            InstitutionWebviewRole::AuthModal,
        )
        .await
        .is_err()
        {
            finish_library_auth_modal(
                &configure_app,
                &configure_inner,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_AUTH_POPUP_CREATE_FAILED",
                "个人图书馆认证窗口安全配置失败；主窗口已恢复。",
                None,
                true,
            );
        }
    });

    NewWindowResponse::Create { window: modal }
}

fn discovery_resume_is_current(
    guard: &SideraInstitutionRuntimeInner,
    resume: &AcademicSearchResumeContext,
) -> bool {
    discovery_auth_resume_is_current(
        guard.active_task_id.as_deref(),
        guard.search.epoch,
        guard.webview_generation,
        &resume.task_id,
        resume.epoch,
        resume.webview_generation,
    ) && guard.search.task_id.as_deref() == Some(resume.task_id.as_str())
        && guard.search.query == resume.query
        && guard.search.sequence >= resume.sequence
        && guard.search.source == SideraInstitutionSearchSource::AcademicDiscovery
        && guard
            .academic_result_webview
            .as_ref()
            .is_some_and(|binding| {
                binding.label == resume.result_webview_label
                    && binding.task_id == resume.task_id
                    && binding.epoch == resume.epoch
                    && binding.webview_generation == resume.webview_generation
            })
}

fn discovery_auth_binding_is_current(
    guard: &SideraInstitutionRuntimeInner,
    expected: &AcademicDiscoveryAuthBinding,
) -> bool {
    guard.connection.is_current(&expected.connection_token)
        && guard.webview_generation == expected.webview_generation
        && guard
            .academic_discovery_auth
            .as_ref()
            .is_some_and(|binding| binding.matches(expected))
}

fn task_is_awaiting_discovery_auth(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> bool {
    let guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .academic_discovery_auth
        .as_ref()
        .and_then(|binding| binding.resume.as_ref())
        .is_some_and(|resume| {
            resume.task_id == task_id && discovery_resume_is_current(&guard, resume)
        })
}

async fn wait_while_discovery_auth_active(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<Duration, (&'static str, &'static str)> {
    let started = tokio::time::Instant::now();
    loop {
        assert_task_current(runtime, task_id)?;
        if !task_is_awaiting_discovery_auth(runtime, task_id) {
            return Ok(started.elapsed());
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
}

fn update_discovery_auth_from_inspection(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    inspection: &AcademicDiscoveryAuthInspection,
    expected: Option<&AcademicDiscoveryAuthBinding>,
) {
    let host = Url::parse(&inspection.url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string));
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if expected.is_some_and(|expected| {
            !discovery_auth_binding_is_current(&guard, expected)
                || guard
                    .academic_discovery_auth
                    .as_ref()
                    .is_some_and(|binding| binding.closing)
        }) {
            return;
        }
        match inspection.kind.as_str() {
            "ready" => set_discovery_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthStatus::Ready,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_READY",
                "统一发现机构全文身份已由固定版本页面检查确认。",
                host,
            ),
            "login-required" => {
                set_explicit_discovery_login_required_locked(
                    &mut guard,
                    "SIDERA_INSTITUTION_DISCOVERY_AUTH_REQUIRED",
                    "统一发现检索可用；机构全文身份待确认。",
                    host,
                );
            }
            "service-error"
                if guard.session.academic_discovery_auth.status
                    != SideraInstitutionAuthStatus::Ready =>
            {
                set_discovery_auth_state_locked(
                    &mut guard,
                    SideraInstitutionAuthStatus::Failed,
                    "SIDERA_INSTITUTION_DISCOVERY_AUTH_FAILED",
                    "统一发现认证页面当前返回服务异常。",
                    host,
                );
            }
            _ => return,
        }
        guard.session.clone()
    };
    emit_session(app, &state);
}

fn finish_discovery_auth_cancelled(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    expected: &AcademicDiscoveryAuthBinding,
    code: &'static str,
    message: &'static str,
) {
    let (state, resume) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !discovery_auth_binding_is_current(&guard, expected) {
            return;
        }
        if let Some(binding) = guard.academic_discovery_auth.as_mut() {
            binding.closing = true;
        }
        let resume = guard
            .academic_discovery_auth
            .as_ref()
            .and_then(|binding| binding.resume.clone());
        guard.academic_discovery_auth = None;
        guard.session.discovery_auth_window_visible = false;
        if finalize_connection_locked(
            &mut guard,
            &expected.connection_token,
            InstitutionConnectionTerminal::Cancelled,
            code,
            message,
            None,
        )
        .is_none()
        {
            return;
        }
        (guard.session.clone(), resume)
    };
    if let Some(window) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
        let _ = window.close();
    }
    let _ = restore_main_window(app);
    emit_session(app, &state);
    if let Some(resume) = resume {
        finish_search_auth_cancelled(app, inner, &resume.task_id, code, message);
    }
}

fn finish_discovery_auth_failed(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    expected: &AcademicDiscoveryAuthBinding,
    code: &'static str,
    message: &'static str,
) {
    let (state, resume) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !discovery_auth_binding_is_current(&guard, expected) {
            return;
        }
        if let Some(binding) = guard.academic_discovery_auth.as_mut() {
            binding.closing = true;
        }
        let resume = guard
            .academic_discovery_auth
            .as_ref()
            .and_then(|binding| binding.resume.clone());
        guard.academic_discovery_auth = None;
        guard.session.discovery_auth_window_visible = false;
        if finalize_connection_locked(
            &mut guard,
            &expected.connection_token,
            InstitutionConnectionTerminal::Failed,
            code,
            message,
            None,
        )
        .is_none()
        {
            return;
        }
        (guard.session.clone(), resume)
    };
    if let Some(window) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
        let _ = window.close();
    }
    let _ = restore_main_window(app);
    emit_session(app, &state);
    if let Some(resume) = resume {
        finish_search_error(app, inner, &resume.task_id, code, message);
    }
}

fn register_discovery_auth_creation_failure(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: &InstitutionConnectionToken,
    generation: u64,
    resume: Option<&AcademicSearchResumeContext>,
    code: &'static str,
    message: &'static str,
) {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.webview_generation != generation {
            return;
        }
        guard.session.discovery_auth_window_visible = false;
        if finalize_connection_locked(
            &mut guard,
            token,
            InstitutionConnectionTerminal::Failed,
            code,
            message,
            None,
        )
        .is_none()
        {
            return;
        }
        guard.session.clone()
    };
    emit_session(app, &state);
    if let Some(resume) = resume {
        finish_search_error(app, inner, &resume.task_id, code, message);
    }
}

fn finish_discovery_auth_parent_sync_failed(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    expected: &AcademicDiscoveryAuthBinding,
    resume: Option<&AcademicSearchResumeContext>,
    message: &'static str,
) {
    let session = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !discovery_auth_binding_is_current(&guard, expected) {
            return;
        }
        guard.academic_discovery_auth = None;
        guard.session.discovery_auth_window_visible = false;
        if resume.is_none() {
            set_discovery_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthStatus::Ready,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUME_FAILED",
                message,
                None,
            );
        }
        guard.session.clone()
    };
    emit_session(app, &session);
    if let Some(resume) = resume {
        finish_search_error(
            app,
            inner,
            &resume.task_id,
            "SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUME_FAILED",
            message,
        );
    }
}

async fn complete_discovery_auth(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    expected: AcademicDiscoveryAuthBinding,
) {
    let (session, search, resume, research_state) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !discovery_auth_binding_is_current(&guard, &expected)
            || guard
                .academic_discovery_auth
                .as_ref()
                .is_some_and(|binding| binding.closing)
        {
            return;
        }
        let resume = guard
            .academic_discovery_auth
            .as_ref()
            .and_then(|binding| binding.resume.clone());
        if let Some(binding) = guard.academic_discovery_auth.as_mut() {
            binding.closing = true;
        }
        guard.session.discovery_auth_window_visible = false;
        if finalize_connection_locked(
            &mut guard,
            &expected.connection_token,
            InstitutionConnectionTerminal::Ready,
            "SIDERA_INSTITUTION_DISCOVERY_AUTH_READY",
            "统一发现机构全文身份已确认，正在回写并复查父结果页。",
            None,
        )
        .is_none()
        {
            return;
        }
        let search = resume.as_ref().and_then(|resume| {
            if !discovery_resume_is_current(&guard, resume) {
                return None;
            }
            guard.sequence = guard.sequence.saturating_add(1);
            guard.search.sequence = guard.sequence;
            guard.search.stage = SideraInstitutionSearchStage::ResumingAfterAuth;
            guard.search.code = "SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUMING".to_string();
            guard.search.message =
                "统一发现认证已就绪；正在刷新任务绑定结果页并恢复同一检索。".to_string();
            guard.search.updated_at_ms = now_ms();
            Some(guard.search.clone())
        });
        let research_state = resume.as_ref().and_then(|resume| {
            mark_research_auth_phase_locked(
                &mut guard,
                &resume.task_id,
                SideraResearchSearchAuthPhase::RefreshingParent,
            )
        });
        (guard.session.clone(), search, resume, research_state)
    };
    emit_session(&app, &session);
    if let Some(search) = search {
        emit_search(&app, &search);
    }
    if let Some(research_state) = research_state {
        emit_research_search(&app, &research_state);
    }
    if let Some(window) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
        let _ = window.close();
    }
    let _ = restore_main_window(&app);

    let Some(parent) = app.get_webview(&expected.parent_label) else {
        finish_discovery_auth_parent_sync_failed(
            &app,
            &inner,
            &expected,
            resume.as_ref(),
            "统一发现认证已完成，但任务绑定结果页已不存在；请重试当前查询。",
        );
        return;
    };
    if parent.reload().is_err() {
        finish_discovery_auth_parent_sync_failed(
            &app,
            &inner,
            &expected,
            resume.as_ref(),
            "统一发现认证已完成，但任务绑定结果页刷新失败；请重试当前查询。",
        );
        return;
    }

    for _ in 0..60_u8 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let current = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            discovery_auth_binding_is_current(&guard, &expected)
                && resume
                    .as_ref()
                    .is_none_or(|resume| discovery_resume_is_current(&guard, resume))
        };
        if !current {
            return;
        }
        let Ok(page) = inspect_academic_page(&parent).await else {
            continue;
        };
        if !matches!(
            page.kind.as_str(),
            "search-form" | "records" | "zero-results"
        ) {
            continue;
        }
        let (state, resuming_research, resumed_research) = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !discovery_auth_binding_is_current(&guard, &expected)
                || resume
                    .as_ref()
                    .is_some_and(|resume| !discovery_resume_is_current(&guard, resume))
            {
                return;
            }
            let resuming_research = resume.as_ref().and_then(|resume| {
                mark_research_auth_phase_locked(
                    &mut guard,
                    &resume.task_id,
                    SideraResearchSearchAuthPhase::Resuming,
                )
            });
            guard.academic_discovery_auth = None;
            let host = Url::parse(&page.url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_string));
            mark_discovery_search_access_ready_locked(&mut guard, host);
            let resumed_research = resume
                .as_ref()
                .and_then(|resume| resume_research_auth_locked(&mut guard, &resume.task_id));
            (guard.session.clone(), resuming_research, resumed_research)
        };
        emit_session(&app, &state);
        if let Some(resuming_research) = resuming_research {
            emit_research_search(&app, &resuming_research);
        }
        if let Some(resumed_research) = resumed_research {
            emit_research_search(&app, &resumed_research);
        }
        if let Some(resume) = resume.as_ref() {
            let (stage, message) = match resume.phase {
                SideraInstitutionSearchStage::FacetProcessing => (
                    SideraInstitutionSearchStage::FacetProcessing,
                    "统一发现认证已回写；正在同一查询中继续分面处理。",
                ),
                SideraInstitutionSearchStage::Extracting => (
                    SideraInstitutionSearchStage::Extracting,
                    "统一发现认证已回写；正在同一查询中继续原生抽取。",
                ),
                _ => (
                    SideraInstitutionSearchStage::WebResultAvailable,
                    "统一发现认证已回写；正在同一查询中继续分面与原生抽取。",
                ),
            };
            update_search_stage(
                &app,
                &inner,
                &resume.task_id,
                stage,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUMED",
                message,
            );
        }
        return;
    }

    finish_discovery_auth_parent_sync_failed(
        &app,
        &inner,
        &expected,
        resume.as_ref(),
        "统一发现认证已完成，但父结果页未在限定时间内恢复可提取结构；请重试当前查询。",
    );
}

async fn inspect_discovery_auth_before_close(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    expected: AcademicDiscoveryAuthBinding,
    skip_current_surface: bool,
) {
    if !skip_current_surface {
        if let Ok(inspection) = inspect_discovery_auth_page_with_timeout(
            &webview,
            Duration::from_millis(DISCOVERY_AUTH_WATCHDOG_EVAL_MS),
        )
        .await
        {
            if inspection.kind == "ready" {
                tauri::async_runtime::spawn(complete_discovery_auth(app, inner, expected));
                return;
            }
            if inspection.kind == "login-required" {
                let state = {
                    let mut guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if !discovery_auth_binding_is_current(&guard, &expected) {
                        return;
                    }
                    let host = Url::parse(&inspection.url)
                        .ok()
                        .and_then(|url| url.host_str().map(str::to_string));
                    set_explicit_discovery_login_required_locked(
                        &mut guard,
                        "SIDERA_INSTITUTION_DISCOVERY_AUTH_LOGIN_REQUIRED",
                        "官方页面明确要求重新验证机构全文身份。",
                        host,
                    );
                    guard.session.clone()
                };
                emit_session(&app, &state);
                finish_discovery_auth_cancelled(
                    &app,
                    &inner,
                    &expected,
                    "SIDERA_INSTITUTION_DISCOVERY_AUTH_LOGIN_REQUIRED",
                    "官方页面明确要求重新验证机构全文身份；可从原检索继续认证。",
                );
                return;
            }
        }
    }

    let session = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !advance_connection_locked(
            &mut guard,
            &expected.connection_token,
            SideraInstitutionConnectionPhase::RefreshingParent,
            "SIDERA_INSTITUTION_CONNECTION_REFRESHING_PARENT",
            "正在刷新并复查任务绑定的统一发现父结果页。",
        ) {
            return;
        }
        guard.session.clone()
    };
    emit_session(&app, &session);

    if let Some(parent) = app.get_webview(&expected.parent_label) {
        let _ = parent.reload();
        for _ in 0..DISCOVERY_AUTH_PARENT_INSPECTION_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(
                DISCOVERY_AUTH_PARENT_INSPECTION_INTERVAL_MS,
            ))
            .await;
            if let Ok(inspection) = inspect_discovery_auth_page_with_timeout(
                &parent,
                Duration::from_millis(DISCOVERY_AUTH_WATCHDOG_EVAL_MS),
            )
            .await
            {
                if inspection.kind == "ready" {
                    tauri::async_runtime::spawn(complete_discovery_auth(app, inner, expected));
                    return;
                }
            }
        }
    }
    finish_discovery_auth_cancelled(
        &app,
        &inner,
        &expected,
        "SIDERA_INSTITUTION_DISCOVERY_AUTH_CANCELLED",
        "统一发现认证窗口已关闭，但未确认机构全文身份；检索入口仍可重试。",
    );
}

fn schedule_discovery_auth_inspection(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    expected: AcademicDiscoveryAuthBinding,
) {
    tauri::async_runtime::spawn(async move {
        for attempt in 0..8_u8 {
            tokio::time::sleep(if attempt == 0 {
                Duration::from_millis(220)
            } else {
                Duration::from_millis(450)
            })
            .await;
            let current = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                discovery_auth_binding_is_current(&guard, &expected)
                    && guard
                        .academic_discovery_auth
                        .as_ref()
                        .is_some_and(|binding| !binding.closing)
            };
            if !current {
                return;
            }
            let inspection = match inspect_discovery_auth_page(&webview).await {
                Ok(inspection) => inspection,
                Err(_) if attempt < 7 => continue,
                Err(_) => return,
            };
            match inspection.kind.as_str() {
                "ready" => {
                    complete_discovery_auth(app, inner, expected).await;
                    return;
                }
                "login-required" => {
                    update_discovery_auth_from_inspection(
                        &app,
                        &inner,
                        &inspection,
                        Some(&expected),
                    );
                    return;
                }
                "service-error" => {
                    finish_discovery_auth_failed(
                        &app,
                        &inner,
                        &expected,
                        "SIDERA_INSTITUTION_DISCOVERY_AUTH_FAILED",
                        "统一发现认证页面当前返回服务异常；检索入口仍可重试。",
                    );
                    return;
                }
                _ if attempt < 7 => continue,
                _ => return,
            }
        }
    });
}

fn discovery_auth_destroyed_requires_cancel(
    phase: Option<SideraInstitutionConnectionPhase>,
    closing: bool,
) -> bool {
    !closing
        && matches!(
            phase,
            Some(SideraInstitutionConnectionPhase::Opening)
                | Some(SideraInstitutionConnectionPhase::AwaitingUser)
        )
}

fn schedule_discovery_auth_lifecycle_watchdog(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: Webview,
    expected: AcademicDiscoveryAuthBinding,
) {
    tauri::async_runtime::spawn(async move {
        let mut invisible_observations = 0_u8;
        let mut login_required_reported = false;
        loop {
            tokio::time::sleep(Duration::from_millis(DISCOVERY_AUTH_WATCHDOG_INTERVAL_MS)).await;
            let current = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                discovery_auth_binding_is_current(&guard, &expected)
                    && guard
                        .academic_discovery_auth
                        .as_ref()
                        .is_some_and(|binding| !binding.closing)
            };
            if !current {
                return;
            }

            let visible = app
                .get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL)
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            if !visible {
                invisible_observations = invisible_observations.saturating_add(1);
                if invisible_observations < DISCOVERY_AUTH_INVISIBLE_CONFIRMATIONS {
                    continue;
                }
                let (should_verify, session, research_state) = {
                    let mut guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if !discovery_auth_binding_is_current(&guard, &expected) {
                        return;
                    }
                    let phase = guard.connection.current().map(|value| value.phase);
                    if !discovery_auth_destroyed_requires_cancel(phase, false) {
                        return;
                    }
                    let changed = advance_connection_locked(
                        &mut guard,
                        &expected.connection_token,
                        SideraInstitutionConnectionPhase::Verifying,
                        "SIDERA_INSTITUTION_CONNECTION_VERIFYING",
                        "统一发现认证窗口已消失；正在复查同一任务绑定父页。",
                    );
                    let research_state = changed
                        .then(|| {
                            expected.resume.as_ref().and_then(|resume| {
                                mark_research_auth_phase_locked(
                                    &mut guard,
                                    &resume.task_id,
                                    SideraResearchSearchAuthPhase::Verifying,
                                )
                            })
                        })
                        .flatten();
                    (
                        changed,
                        changed.then(|| guard.session.clone()),
                        research_state,
                    )
                };
                if let Some(session) = session {
                    emit_session(&app, &session);
                }
                if let Some(research_state) = research_state {
                    emit_research_search(&app, &research_state);
                }
                if !should_verify {
                    return;
                }
                let fallback_app = app.clone();
                let fallback_inner = inner.clone();
                let fallback_expected = expected.clone();
                if tokio::time::timeout(
                    Duration::from_millis(INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS),
                    inspect_discovery_auth_before_close(app, inner, webview, expected, true),
                )
                .await
                .is_err()
                {
                    finish_discovery_auth_cancelled(
                        &fallback_app,
                        &fallback_inner,
                        &fallback_expected,
                        "SIDERA_INSTITUTION_DISCOVERY_AUTH_CANCELLED",
                        "统一发现认证窗口消失后的父页核对超过 4 秒；当前检索已安全收口。",
                    );
                }
                return;
            }
            invisible_observations = 0;

            let inspection = match inspect_discovery_auth_page_with_timeout(
                &webview,
                Duration::from_millis(DISCOVERY_AUTH_WATCHDOG_EVAL_MS),
            )
            .await
            {
                Ok(inspection) => inspection,
                Err(_) => continue,
            };
            match inspection.kind.as_str() {
                "ready" => {
                    complete_discovery_auth(app, inner, expected).await;
                    return;
                }
                "login-required" if !login_required_reported => {
                    update_discovery_auth_from_inspection(
                        &app,
                        &inner,
                        &inspection,
                        Some(&expected),
                    );
                    login_required_reported = true;
                }
                "service-error" => {
                    finish_discovery_auth_failed(
                        &app,
                        &inner,
                        &expected,
                        "SIDERA_INSTITUTION_DISCOVERY_AUTH_FAILED",
                        "统一发现认证页面当前返回服务异常；检索入口仍可重试。",
                    );
                    return;
                }
                _ => {}
            }
        }
    });
}

fn create_academic_discovery_auth_window(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    url: &Url,
    features: NewWindowFeatures,
    parent_label: &str,
    parent_task_id: &str,
    parent_epoch: u64,
    parent_task_sequence: u64,
    generation: u64,
) -> NewWindowResponse<tauri::Wry> {
    if !is_blank_or_whu_navigation(url) {
        return NewWindowResponse::Deny;
    }
    if let Some(existing) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return NewWindowResponse::Deny;
    }

    let prepared = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let parent_is_current = guard
            .academic_result_webview
            .as_ref()
            .is_some_and(|binding| {
                binding.label == parent_label
                    && binding.task_id == parent_task_id
                    && binding.epoch == parent_epoch
                    && binding.task_sequence == parent_task_sequence
                    && binding.webview_generation == generation
            });
        if guard.webview_generation != generation || !parent_is_current {
            return NewWindowResponse::Deny;
        }
        let connection_token = match begin_connection_locked(
            &mut guard,
            SideraInstitutionConnectionGoal::DiscoveryFulltext,
        ) {
            InstitutionConnectionBeginOutcome::Started(token) => token,
            InstitutionConnectionBeginOutcome::FocusExisting(_)
            | InstitutionConnectionBeginOutcome::Busy(_) => return NewWindowResponse::Deny,
        };
        guard.discovery_auth_epoch = guard.discovery_auth_epoch.saturating_add(1);
        let resume = if guard.active_task_id.as_deref() == Some(parent_task_id)
            && guard.search.task_id.as_deref() == Some(parent_task_id)
            && guard.search.epoch == parent_epoch
            && guard.search.source == SideraInstitutionSearchSource::AcademicDiscovery
        {
            Some(AcademicSearchResumeContext {
                task_id: parent_task_id.to_string(),
                epoch: parent_epoch,
                sequence: guard.search.sequence,
                webview_generation: generation,
                query: guard.search.query.clone(),
                result_webview_label: parent_label.to_string(),
                phase: guard.search.stage,
            })
        } else {
            None
        };
        AcademicDiscoveryAuthBinding {
            connection_token,
            auth_epoch: guard.discovery_auth_epoch,
            parent_label: parent_label.to_string(),
            parent_task_id: parent_task_id.to_string(),
            parent_epoch,
            parent_task_sequence,
            webview_generation: generation,
            resume,
            closing: false,
        }
    };

    let main_host = match resolve_main_window_host(app) {
        Ok(host) => host,
        Err(code) => {
            let message = if code == MAIN_WINDOW_MISSING {
                "无法找到 Sidera 主窗口，统一发现认证窗口未创建。"
            } else {
                "无法取得 Sidera 主窗口的 Windows 句柄，统一发现认证窗口未创建。"
            };
            register_discovery_auth_creation_failure(
                app,
                inner,
                &prepared.connection_token,
                generation,
                prepared.resume.as_ref(),
                code,
                message,
            );
            return NewWindowResponse::Deny;
        }
    };
    let main = main_host.window().clone();
    if main.set_closable(false).is_err() {
        register_discovery_auth_creation_failure(
            app,
            inner,
            &prepared.connection_token,
            generation,
            prepared.resume.as_ref(),
            "SIDERA_INSTITUTION_DISCOVERY_AUTH_MAIN_GUARD_FAILED",
            "无法保护 Sidera 主窗口，统一发现认证窗口未创建。",
        );
        return NewWindowResponse::Deny;
    }
    let (width, height) = main
        .current_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let work = monitor.work_area().size;
            (
                960.0_f64.min(work.width as f64 / scale * 0.9),
                720.0_f64.min(work.height as f64 / scale * 0.9),
            )
        })
        .unwrap_or((960.0, 720.0));

    let navigation_app = app.clone();
    let navigation_inner = inner.clone();
    let navigation_expected = prepared.clone();
    let page_app = app.clone();
    let page_inner = inner.clone();
    let page_expected = prepared.clone();
    let nested_app = app.clone();
    let blank = Url::parse("about:blank").expect("about:blank must be a valid URL");
    let builder = WebviewWindowBuilder::new(
        app,
        INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL,
        WebviewUrl::External(blank),
    )
    .window_features(features)
    .title("Sidera · 统一发现机构认证")
    .inner_size(width, height)
    .min_inner_size(720.0_f64.min(width), 560.0_f64.min(height))
    .center()
    .resizable(true)
    .decorations(true)
    .focused(true)
    .visible(true)
    .on_navigation(move |target| {
        let allowed = is_blank_or_whu_navigation(target);
        if !allowed {
            finish_discovery_auth_failed(
                &navigation_app,
                &navigation_inner,
                &navigation_expected,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_FAILED",
                "统一发现认证请求了非 HTTP/HTTPS 导航，认证已安全停止。",
            );
        }
        allowed
    })
    .on_new_window(move |target, _features| {
        if is_blank_or_whu_navigation(&target) {
            if let Some(existing) =
                nested_app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL)
            {
                let _ = existing.show();
                let _ = existing.set_focus();
            }
        }
        NewWindowResponse::Deny
    })
    .on_page_load(move |webview, payload| {
        if payload.event() != PageLoadEvent::Finished || payload.url().as_str() == "about:blank" {
            return;
        }
        schedule_discovery_auth_inspection(
            page_app.clone(),
            page_inner.clone(),
            webview.as_ref().clone(),
            page_expected.clone(),
        );
    });
    let builder = match bind_webview_window_owner(builder, &main_host) {
        Ok(builder) => builder,
        Err(code) => {
            let _ = restore_main_window(app);
            register_discovery_auth_creation_failure(
                app,
                inner,
                &prepared.connection_token,
                generation,
                prepared.resume.as_ref(),
                code,
                "统一发现认证窗口无法绑定 Sidera 主窗口。",
            );
            return NewWindowResponse::Deny;
        }
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(_) => {
            let _ = restore_main_window(app);
            register_discovery_auth_creation_failure(
                app,
                inner,
                &prepared.connection_token,
                generation,
                prepared.resume.as_ref(),
                "SIDERA_INSTITUTION_AUTH_POPUP_CREATE_FAILED",
                "统一发现认证窗口创建失败；未读取或清除任何机构会话数据。",
            );
            return NewWindowResponse::Deny;
        }
    };

    let (session, search, research_state) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let parent_is_current = guard
            .academic_result_webview
            .as_ref()
            .is_some_and(|binding| {
                binding.label == prepared.parent_label
                    && binding.task_id == prepared.parent_task_id
                    && binding.epoch == prepared.parent_epoch
                    && binding.task_sequence == prepared.parent_task_sequence
                    && binding.webview_generation == prepared.webview_generation
            });
        if !parent_is_current || guard.webview_generation != generation {
            let state = finalize_connection_locked(
                &mut guard,
                &prepared.connection_token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_PARENT_STALE",
                "任务绑定结果页已失效，统一发现认证窗口未继续打开。",
                None,
            )
            .map(|_| guard.session.clone());
            drop(guard);
            let _ = window.close();
            let _ = restore_main_window(app);
            if let Some(state) = state {
                emit_session(app, &state);
            }
            return NewWindowResponse::Deny;
        }
        guard.academic_discovery_auth = Some(prepared.clone());
        guard.session.discovery_auth_window_visible = true;
        set_discovery_auth_state_locked(
            &mut guard,
            SideraInstitutionAuthStatus::Starting,
            "SIDERA_INSTITUTION_DISCOVERY_AUTH_STARTING",
            "统一发现官方认证窗口已打开；当前检索任务将等待认证回写。",
            url.host_str().map(str::to_string),
        );
        advance_connection_locked(
            &mut guard,
            &prepared.connection_token,
            SideraInstitutionConnectionPhase::AwaitingUser,
            "SIDERA_INSTITUTION_CONNECTION_AWAITING_USER",
            "请在统一发现官方页面完成机构全文认证。",
        );
        let search = prepared.resume.as_ref().and_then(|resume| {
            if !discovery_resume_is_current(&guard, resume) {
                return None;
            }
            guard.sequence = guard.sequence.saturating_add(1);
            guard.search.sequence = guard.sequence;
            guard.search.stage = SideraInstitutionSearchStage::AwaitingAuth;
            guard.search.code = "SIDERA_INSTITUTION_DISCOVERY_AUTH_REQUIRED".to_string();
            guard.search.message =
                "统一发现需要机构认证；当前任务已暂停，不计入普通 90 秒检索超时。".to_string();
            guard.search.updated_at_ms = now_ms();
            Some(guard.search.clone())
        });
        let research_state = prepared.resume.as_ref().and_then(|resume| {
            mark_research_auth_phase_locked(
                &mut guard,
                &resume.task_id,
                SideraResearchSearchAuthPhase::AwaitingUser,
            )
        });
        (guard.session.clone(), search, research_state)
    };
    emit_session(app, &session);
    if let Some(search) = search {
        emit_search(app, &search);
    }
    if let Some(research_state) = research_state {
        emit_research_search(app, &research_state);
    }

    let close_app = app.clone();
    let close_inner = inner.clone();
    let close_webview = window.as_ref().clone();
    let close_expected = prepared.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            let (prevent, should_inspect, session, research_state) = {
                let mut guard = close_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if !discovery_auth_binding_is_current(&guard, &close_expected)
                    || guard
                        .academic_discovery_auth
                        .as_ref()
                        .is_none_or(|binding| binding.closing)
                {
                    (false, false, None, None)
                } else {
                    match guard.connection.current().map(|value| value.phase) {
                        Some(SideraInstitutionConnectionPhase::Opening)
                        | Some(SideraInstitutionConnectionPhase::AwaitingUser) => {
                            let changed = advance_connection_locked(
                                &mut guard,
                                &close_expected.connection_token,
                                SideraInstitutionConnectionPhase::Verifying,
                                "SIDERA_INSTITUTION_CONNECTION_VERIFYING",
                                "正在关闭前核对统一发现认证页与任务绑定父页。",
                            );
                            let research_state = changed
                                .then(|| {
                                    close_expected.resume.as_ref().and_then(|resume| {
                                        mark_research_auth_phase_locked(
                                            &mut guard,
                                            &resume.task_id,
                                            SideraResearchSearchAuthPhase::Verifying,
                                        )
                                    })
                                })
                                .flatten();
                            (
                                true,
                                changed,
                                changed.then(|| guard.session.clone()),
                                research_state,
                            )
                        }
                        Some(SideraInstitutionConnectionPhase::Verifying)
                        | Some(SideraInstitutionConnectionPhase::RefreshingParent) => {
                            (true, false, None, None)
                        }
                        _ => (false, false, None, None),
                    }
                }
            };
            if !prevent {
                return;
            }
            api.prevent_close();
            if let Some(session) = session {
                emit_session(&close_app, &session);
            }
            if let Some(research_state) = research_state {
                emit_research_search(&close_app, &research_state);
            }
            if !should_inspect {
                return;
            }
            let inspect_app = close_app.clone();
            let inspect_inner = close_inner.clone();
            let inspect_webview = close_webview.clone();
            let inspect_expected = close_expected.clone();
            tauri::async_runtime::spawn(async move {
                let fallback_app = inspect_app.clone();
                let fallback_inner = inspect_inner.clone();
                let fallback_expected = inspect_expected.clone();
                if tokio::time::timeout(
                    Duration::from_millis(INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS),
                    inspect_discovery_auth_before_close(
                        inspect_app,
                        inspect_inner,
                        inspect_webview,
                        inspect_expected,
                        false,
                    ),
                )
                .await
                .is_err()
                {
                    finish_discovery_auth_cancelled(
                        &fallback_app,
                        &fallback_inner,
                        &fallback_expected,
                        "SIDERA_INSTITUTION_DISCOVERY_AUTH_CANCELLED",
                        "统一发现认证关闭核对超过 4 秒；已保留此前证明的身份状态。",
                    );
                }
            });
        }
        WindowEvent::Destroyed => {
            let unexpected = {
                let guard = close_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                discovery_auth_binding_is_current(&guard, &close_expected)
                    && guard
                        .academic_discovery_auth
                        .as_ref()
                        .is_some_and(|binding| {
                            discovery_auth_destroyed_requires_cancel(
                                guard.connection.current().map(|value| value.phase),
                                binding.closing,
                            )
                        })
            };
            if unexpected {
                finish_discovery_auth_cancelled(
                    &close_app,
                    &close_inner,
                    &close_expected,
                    "SIDERA_INSTITUTION_DISCOVERY_AUTH_CANCELLED",
                    "统一发现认证窗口已关闭，但未确认机构全文身份；检索入口仍可重试。",
                );
            }
        }
        _ => {}
    });

    schedule_discovery_auth_lifecycle_watchdog(
        app.clone(),
        inner.clone(),
        window.as_ref().clone(),
        prepared.clone(),
    );

    let _ = url;
    NewWindowResponse::Create { window }
}

fn create_academic_result_webview(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    url: &Url,
    features: NewWindowFeatures,
    generation: u64,
) -> NewWindowResponse<tauri::Wry> {
    let (task_id, epoch, task_sequence, stale_label) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.webview_generation != generation {
            return NewWindowResponse::Deny;
        }
        let Some(task_id) = guard.active_task_id.clone() else {
            return NewWindowResponse::Deny;
        };
        if guard.search.source != SideraInstitutionSearchSource::AcademicDiscovery {
            return NewWindowResponse::Deny;
        }
        if let Some(binding) = guard.academic_result_webview.as_ref() {
            if binding.is_current_for(&guard, &task_id) {
                return NewWindowResponse::Deny;
            }
        }
        let stale_label = guard
            .academic_result_webview
            .take()
            .map(|binding| binding.label);
        (
            task_id,
            guard.search.epoch,
            guard.search.sequence,
            stale_label,
        )
    };
    if let Some(label) = stale_label {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    let main_host = match resolve_main_window_host(app) {
        Ok(host) => host,
        Err(code) => {
            let message = if code == MAIN_WINDOW_MISSING {
                "无法找到 Sidera 主窗口，统一发现结果面未创建。"
            } else {
                "无法取得 Sidera 主窗口的 Windows 句柄，统一发现结果面未创建。"
            };
            finish_search_error(app, inner, &task_id, code, message);
            return NewWindowResponse::Deny;
        }
    };
    let label = format!("{INSTITUTION_ACADEMIC_RESULT_WINDOW_PREFIX}-{epoch}-{task_sequence}");
    let navigation_app = app.clone();
    let navigation_inner = inner.clone();
    let navigation_task_id = task_id.clone();
    let page_app = app.clone();
    let page_inner = inner.clone();
    let page_task_id = task_id.clone();
    let page_label = label.clone();
    let nested_app = app.clone();
    let nested_inner = inner.clone();
    let nested_label = label.clone();
    let nested_task_id = task_id.clone();
    let blank = Url::parse("about:blank").expect("about:blank must be a valid URL");
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
        .window_features(features)
        .title("Sidera · 统一学术发现原始结果")
        .inner_size(1040.0, 760.0)
        .min_inner_size(720.0, 560.0)
        .center()
        .resizable(true)
        .decorations(true)
        .focused(false)
        .visible(false)
        .on_navigation(move |target| {
            if target.as_str() == "about:blank" {
                return true;
            }
            if decide_whu_institution_navigation(target.as_str())
                == SideraInstitutionNavigationDecision::Allow
            {
                true
            } else {
                finish_search_error(
                    &navigation_app,
                    &navigation_inner,
                    &navigation_task_id,
                    "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                    "统一发现结果面请求了非 HTTP/HTTPS 导航，当前检索已停止。",
                );
                false
            }
        })
        .on_new_window(move |target, features| {
            create_academic_discovery_auth_window(
                &nested_app,
                &nested_inner,
                &target,
                features,
                &nested_label,
                &nested_task_id,
                epoch,
                task_sequence,
                generation,
            )
        })
        .on_page_load(move |_window, payload| {
            if payload.event() != PageLoadEvent::Finished || payload.url().as_str() == "about:blank"
            {
                return;
            }
            let became_ready = {
                let mut guard = page_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let binding_current =
                    guard
                        .academic_result_webview
                        .as_ref()
                        .is_some_and(|binding| {
                            binding.label == page_label
                                && binding.task_id == page_task_id
                                && binding.epoch == epoch
                                && binding.task_sequence == task_sequence
                                && binding.webview_generation == generation
                        });
                if !binding_current
                    || guard.active_task_id.as_deref() != Some(page_task_id.as_str())
                {
                    false
                } else if let Some(binding) = guard.academic_result_webview.as_mut() {
                    if binding.ready {
                        false
                    } else {
                        binding.ready = true;
                        true
                    }
                } else {
                    false
                }
            };
            if became_ready {
                update_search_stage(
                    &page_app,
                    &page_inner,
                    &page_task_id,
                    SideraInstitutionSearchStage::WebResultAvailable,
                    "SIDERA_INSTITUTION_WEB_RESULT_AVAILABLE",
                    "官方统一发现网页结果已就绪；正在确认论文资源类型分面。",
                );
            }
        });
    let builder = match bind_webview_window_owner(builder, &main_host) {
        Ok(builder) => builder,
        Err(code) => {
            finish_search_error(
                app,
                inner,
                &task_id,
                code,
                "统一发现结果面无法绑定 Sidera 主窗口。",
            );
            return NewWindowResponse::Deny;
        }
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(_) => {
            finish_search_error(
                app,
                inner,
                &task_id,
                "SIDERA_INSTITUTION_RESULT_WEBVIEW_CREATE_FAILED",
                "统一发现结果面创建失败；未产生原生快照。",
            );
            return NewWindowResponse::Deny;
        }
    };

    {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.active_task_id.as_deref() != Some(task_id.as_str())
            || guard.search.epoch != epoch
            || guard.webview_generation != generation
        {
            let _ = window.close();
            return NewWindowResponse::Deny;
        }
        guard.academic_result_webview = Some(AcademicResultWebviewBinding {
            label: label.clone(),
            task_id: task_id.clone(),
            epoch,
            task_sequence,
            webview_generation: generation,
            ready: false,
            raw_visible: false,
        });
    }

    // The result popup owns the XHR/fetch traffic that can reveal a stable
    // connector route.  Capture only redacted protocol metadata here; the
    // raw response and session secrets never enter Tauri state or frontend
    // events.  Failure is non-fatal because the versioned DOM fallback remains
    // available and is reported honestly as such.
    if let Some(result_webview) = app.get_webview(&label) {
        let protocol_inner = inner.clone();
        tauri::async_runtime::spawn(async move {
            let _ = configure_protocol_capture_only(&result_webview, protocol_inner).await;
        });
    }

    let close_app = app.clone();
    let close_inner = inner.clone();
    let close_task_id = task_id.clone();
    let close_label = label.clone();
    window.on_window_event(move |event| {
        if !matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            return;
        }
        let was_active = {
            let mut guard = close_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let binding_current = guard
                .academic_result_webview
                .as_ref()
                .is_some_and(|binding| {
                    binding.label == close_label
                        && binding.task_id == close_task_id
                        && binding.epoch == epoch
                        && binding.task_sequence == task_sequence
                });
            if !binding_current {
                return;
            }
            guard.academic_result_webview = None;
            guard.session.browser_visible = false;
            guard.active_task_id.as_deref() == Some(close_task_id.as_str())
        };
        if was_active {
            finish_search_error(
                &close_app,
                &close_inner,
                &close_task_id,
                "SIDERA_INSTITUTION_RESULT_WEBVIEW_CLOSED",
                "统一发现结果面在抽取完成前关闭；未产生零结果快照。",
            );
        }
    });

    let _ = url;
    NewWindowResponse::Create { window }
}

async fn create_institution_webview(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
) -> Result<Webview, String> {
    let data_directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "SIDERA_INSTITUTION_DATA_DIRECTORY_UNAVAILABLE".to_string())?
        .join(INSTITUTION_DATA_DIRECTORY);
    fs::create_dir_all(&data_directory)
        .map_err(|_| "SIDERA_INSTITUTION_DATA_DIRECTORY_CREATE_FAILED".to_string())?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING".to_string())?;
    let generation = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.webview_generation = guard.webview_generation.saturating_add(1);
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        guard.catalog_handoff_epoch = None;
        guard.webview_generation
    };

    let navigation_app = app.clone();
    let navigation_inner = inner.clone();
    let popup_app = app.clone();
    let popup_inner = inner.clone();
    let page_app = app.clone();
    let page_inner = inner.clone();
    let blank = Url::parse("about:blank").expect("about:blank must be a valid URL");
    let builder = WebviewBuilder::new(INSTITUTION_WEBVIEW_LABEL, WebviewUrl::External(blank))
        .data_directory(data_directory)
        .focused(false)
        .on_navigation(move |url| {
            if url.as_str() == "about:blank" {
                return true;
            }
            match decide_whu_institution_navigation(url.as_str()) {
                SideraInstitutionNavigationDecision::Allow => true,
                SideraInstitutionNavigationDecision::Reject(policy_code) => {
                    register_blocked_target(
                        &navigation_app,
                        &navigation_inner,
                        generation,
                        url.as_str(),
                        policy_code,
                    );
                    false
                }
            }
        })
        .on_new_window(move |url, features| {
            if !is_blank_or_whu_navigation(&url) {
                register_blocked_target(
                    &popup_app,
                    &popup_inner,
                    generation,
                    url.as_str(),
                    "POLICY_NON_NETWORK_SCHEME",
                );
                return NewWindowResponse::Deny;
            }
            let (active_library_auth, active_search, restore_inflight) = {
                let guard = popup_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                (
                    library_parent_popup_is_authorized_locked(&guard, generation),
                    guard.webview_generation == generation && guard.active_task_id.is_some(),
                    guard.webview_generation == generation && guard.restore_inflight,
                )
            };
            if restore_inflight
                && url.host_str().is_some_and(|host| {
                    host == "www.lib.whu.edu.cn"
                        || host == "lib.whu.edu.cn"
                        || is_whu_institution_auth_host(host)
                })
            {
                // Silent restore never creates a visible authentication window.
                // Official account controls that use window.open are kept inside
                // the same hidden WebView/profile for read-only session proof.
                if let Some(parent) = popup_app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
                    let _ = parent.navigate(url.clone());
                }
                NewWindowResponse::Deny
            } else if active_library_auth {
                create_library_auth_modal(&popup_app, &popup_inner, &url, features, generation)
            } else if active_search {
                create_academic_result_webview(&popup_app, &popup_inner, &url, features, generation)
            } else {
                NewWindowResponse::Allow
            }
        })
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished || payload.url().as_str() == "about:blank"
            {
                return;
            }
            let (current, pending, active_kind, searching, database_status, restore_inflight) = {
                let guard = page_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                (
                    guard.webview_generation == generation,
                    guard.pending_initial_navigation_epoch.is_some(),
                    guard
                        .session
                        .active_auth_kind
                        .unwrap_or(SideraInstitutionAuthKind::DatabaseSso),
                    guard.active_task_id.is_some(),
                    guard.session.database_auth.status,
                    guard.restore_inflight,
                )
            };
            if !current {
                return;
            }
            if active_kind == SideraInstitutionAuthKind::LibraryAccount {
                let claim = {
                    let mut guard = page_inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    claim_library_parent_observation_locked(
                        &mut guard,
                        generation,
                        payload.url().host_str().map(str::to_string),
                    )
                };
                let Some((state, token)) = claim else {
                    return;
                };
                emit_session(&page_app, &state);
                schedule_connection_page_observation(
                    page_app.clone(),
                    page_inner.clone(),
                    webview.clone(),
                    token,
                    SideraInstitutionConnectionVerificationSurface::Parent,
                );
                return;
            }
            if active_kind == SideraInstitutionAuthKind::DatabaseSso
                && begin_catalog_handoff(
                    &page_app,
                    &page_inner,
                    &webview,
                    generation,
                    payload.url(),
                )
            {
                return;
            }
            if pending {
                return;
            }

            if searching {
                return;
            }
            // During silent restore, discovery and personal-library checks reuse
            // this WebView after the database capability has reached a terminal
            // state. Those later pages must not be reclassified by the ordinary
            // OPAC inspector and overwrite the already established DB truth.
            if restore_inflight && database_status != SideraInstitutionAuthStatus::Starting {
                clear_fallback_after_page_load(&page_inner);
                return;
            }
            // Once the database SSO has been proven, the same isolated WebView is
            // also the transport for the library homepage and Primo discovery.
            // Those pages own source readiness, not the database-auth lifecycle;
            // running the OPAC inspector against them would incorrectly downgrade
            // a valid SSO session to ADAPTER_DRIFT after a search finishes.
            if active_kind == SideraInstitutionAuthKind::DatabaseSso
                && database_status == SideraInstitutionAuthStatus::Ready
            {
                clear_fallback_after_page_load(&page_inner);
                return;
            }
            clear_fallback_after_page_load(&page_inner);
            let (status, code, message) = session_from_url(payload.url());
            let next = update_session(
                &page_inner,
                status,
                code,
                message,
                payload.url().host_str().map(str::to_string),
            );
            emit_session(&page_app, &next);

            // Authentication-provider pages are already conclusive URL-level
            // evidence. Their DOM is not an OPAC/search result and must not be
            // reclassified as adapter drift by the catalog inspector.
            if status == SideraInstitutionSessionStatus::LoginRequired {
                return;
            }

            schedule_database_page_inspection(
                page_app.clone(),
                page_inner.clone(),
                webview.clone(),
                generation,
            );
        });

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1.0, 1.0),
        )
        .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_CREATE_FAILED".to_string())?;
    if let Err(code) = configure_webview_platform(
        &webview,
        app.clone(),
        inner.clone(),
        generation,
        InstitutionWebviewRole::Main,
    )
    .await
    {
        let _ = webview.close();
        return Err(code);
    }
    webview
        .hide()
        .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_HIDE_FAILED".to_string())?;
    // DOM adapters intentionally require rendered, viewport-visible controls as
    // evidence. Keep the shared WebView hidden, but give it the same desktop
    // viewport used by the background transport so a valid saved session is not
    // misclassified merely because the initial child surface was created at 1×1.
    webview
        .set_size(LogicalSize::new(
            INSTITUTION_BACKGROUND_TRANSPORT_WIDTH,
            INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT,
        ))
        .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_VIEWPORT_FAILED".to_string())?;
    Ok(webview)
}

fn start_initial_navigation(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    auth_kind: SideraInstitutionAuthKind,
    entry: Url,
    connection_token: Option<&InstitutionConnectionToken>,
) -> SideraInstitutionSessionState {
    let (starting, navigation_epoch, generation) =
        begin_auth_navigation(app, inner, auth_kind, &entry, connection_token);
    if webview.navigate(entry).is_err() {
        register_auth_navigation_failure(
            app,
            inner,
            auth_kind,
            "SIDERA_INSTITUTION_NAVIGATION_FAILED",
            "无法启动官方机构页面导航；请检查网络或 aTrust 后重试。",
        );
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        return guard.session.clone();
    }

    let timeout_app = app.clone();
    let timeout_inner = inner.clone();
    let timeout_webview = webview.clone();
    let timeout_connection_token = connection_token.cloned();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(INSTITUTION_INITIAL_NAVIGATION_TIMEOUT).await;
        let timeout_target = timeout_webview.url().ok().map(|url| url.to_string());
        let timed_out = {
            let mut guard = timeout_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !pending_initial_navigation_is_current_locked(
                &guard,
                generation,
                navigation_epoch,
                timeout_connection_token.as_ref(),
            ) {
                false
            } else {
                guard.pending_initial_navigation_epoch = None;
                guard.pending_initial_navigation_connection = None;
                append_navigation_event_locked(
                    &mut guard,
                    generation,
                    None,
                    auth_kind,
                    SideraInstitutionNavigationPhase::Timeout,
                    timeout_target.as_deref(),
                    false,
                    Some("WEBVIEW2_NO_TERMINAL_EVENT".to_string()),
                );
                set_auth_state_locked(
                    &mut guard,
                    auth_kind,
                    SideraInstitutionAuthStatus::Failed,
                    "SIDERA_INSTITUTION_NAVIGATION_TIMEOUT",
                    "官方机构页面在 20 秒内未完成首航；可安全重试，已保存的机构登录数据不会被清除。",
                    None,
                );
                true
            }
        };
        if timed_out {
            let _ = timeout_webview.hide();
            let state = {
                let guard = timeout_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard.session.clone()
            };
            emit_session(&timeout_app, &state);
        }
    });
    starting
}

fn invalidate_institution_webviews(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
) {
    close_academic_result_webview(app, inner);
    {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.webview_generation = guard.webview_generation.saturating_add(1);
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        guard.catalog_handoff_epoch = None;
        guard.session.auth_modal_visible = false;
        guard.protocol_session.clear();
    }
    #[cfg(windows)]
    if let Some(webview) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
        let _ = webview.with_webview(|_| {
            crate::sidera_institution_protocol::clear_protocol_subscriptions();
        });
    }
    if let Some(modal) = app.get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL) {
        let _ = modal.close();
    }
    restore_main_window(app);
    if let Some(webview) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
        let _ = webview.hide();
        let _ = webview.close();
    }
}

fn invalidate_session_restore_locked(guard: &mut SideraInstitutionRuntimeInner) {
    guard.restore_epoch = guard.restore_epoch.saturating_add(1);
    guard.restore_inflight = false;
}

fn session_restore_is_current_locked(
    guard: &SideraInstitutionRuntimeInner,
    restore_epoch: u64,
    generation: Option<u64>,
) -> bool {
    institution_restore_is_current(
        guard.restore_inflight,
        guard.restore_epoch,
        restore_epoch,
        guard.webview_generation,
        generation,
    )
}

fn begin_session_restore_locked(
    guard: &mut SideraInstitutionRuntimeInner,
) -> (u64, SideraInstitutionSessionState) {
    invalidate_session_restore_locked(guard);
    guard.restore_inflight = true;
    let restore_epoch = guard.restore_epoch;
    set_auth_state_locked(
        guard,
        SideraInstitutionAuthKind::DatabaseSso,
        SideraInstitutionAuthStatus::Starting,
        "SIDERA_INSTITUTION_RESTORE_DATABASE_STARTING",
        "正在静默确认已保存的数据库 SSO 会话。",
        None,
    );
    set_discovery_auth_state_locked(
        guard,
        SideraInstitutionAuthStatus::Starting,
        "SIDERA_INSTITUTION_RESTORE_DISCOVERY_STARTING",
        "正在静默确认统一发现访问能力。",
        None,
    );
    set_auth_state_locked(
        guard,
        SideraInstitutionAuthKind::LibraryAccount,
        SideraInstitutionAuthStatus::Starting,
        "SIDERA_INSTITUTION_RESTORE_LIBRARY_STARTING",
        "正在静默确认个人图书馆会话。",
        None,
    );
    guard.session.active_auth_kind = Some(SideraInstitutionAuthKind::DatabaseSso);
    guard.session.status = SideraInstitutionSessionStatus::Starting;
    guard.session.code = "SIDERA_INSTITUTION_SESSION_RESTORE_STARTING".to_string();
    guard.session.message = "正在确认已有机构登录状态；不会打开认证窗口。".to_string();
    guard.session.browser_visible = false;
    guard.session.auth_modal_visible = false;
    guard.session.discovery_auth_window_visible = false;
    guard.session.updated_at_ms = now_ms();
    (restore_epoch, guard.session.clone())
}

fn finalize_session_restore_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    restore_epoch: u64,
) -> Option<SideraInstitutionSessionState> {
    if !session_restore_is_current_locked(guard, restore_epoch, None) {
        return None;
    }
    let statuses = [
        guard.session.database_auth.status,
        guard.session.academic_discovery_auth.status,
        guard.session.library_account_auth.status,
    ];
    let status = classify_institution_restore_status(&statuses);
    let (code, message) = if status == SideraInstitutionSessionStatus::Ready {
        (
            "SIDERA_INSTITUTION_SESSION_RESTORE_READY",
            "已有机构会话已静默恢复，三项能力均已确认。",
        )
    } else if status == SideraInstitutionSessionStatus::Partial {
        (
            "SIDERA_INSTITUTION_SESSION_RESTORE_PARTIAL",
            "已有机构会话已部分恢复；未确认的能力可按需手工认证。",
        )
    } else if status == SideraInstitutionSessionStatus::LoginRequired {
        (
            "SIDERA_INSTITUTION_SESSION_RESTORE_LOGIN_REQUIRED",
            "已保存的机构会话需要重新认证；仅在你点击连接后才会打开官方窗口。",
        )
    } else {
        (
            "SIDERA_INSTITUTION_SESSION_RESTORE_FAILED",
            "静默恢复未能确认机构能力；不会据此判定 Cookie 已失效。",
        )
    };
    guard.restore_inflight = false;
    guard.session.status = status;
    guard.session.code = code.to_string();
    guard.session.message = message.to_string();
    guard.session.browser_visible = false;
    guard.session.auth_modal_visible = false;
    guard.session.discovery_auth_window_visible = false;
    guard.session.updated_at_ms = now_ms();
    Some(guard.session.clone())
}

fn fail_pending_restore_capabilities_locked(
    guard: &mut SideraInstitutionRuntimeInner,
    code: &'static str,
    message: &'static str,
) {
    if guard.session.academic_discovery_auth.status == SideraInstitutionAuthStatus::Starting {
        set_discovery_auth_state_locked(
            guard,
            SideraInstitutionAuthStatus::Failed,
            code,
            message,
            None,
        );
    }
    if guard.session.library_account_auth.status == SideraInstitutionAuthStatus::Starting {
        set_auth_state_locked(
            guard,
            SideraInstitutionAuthKind::LibraryAccount,
            SideraInstitutionAuthStatus::Failed,
            code,
            message,
            None,
        );
    }
}

async fn wait_for_database_restore_terminal(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    restore_epoch: u64,
) -> Option<SideraInstitutionAuthStatus> {
    let started = tokio::time::Instant::now();
    let mut login_required_since: Option<tokio::time::Instant> = None;
    while started.elapsed() < INSTITUTION_RESTORE_CAPABILITY_TIMEOUT {
        let status = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, None) {
                return None;
            }
            guard.session.database_auth.status
        };
        match status {
            SideraInstitutionAuthStatus::Ready | SideraInstitutionAuthStatus::Failed => {
                return Some(status);
            }
            SideraInstitutionAuthStatus::LoginRequired => {
                let since = login_required_since.get_or_insert_with(tokio::time::Instant::now);
                // A valid saved CAS session can briefly load the authentication
                // host before redirecting to the authenticated landing page.
                // Only accept login-required after the URL proof remains stable.
                if since.elapsed() >= Duration::from_millis(750) {
                    return Some(status);
                }
            }
            _ => login_required_since = None,
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    Some(SideraInstitutionAuthStatus::Failed)
}

async fn restore_discovery_capability(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    restore_epoch: u64,
    generation: u64,
) {
    let Ok(entry) = Url::parse(WHU_LIBRARY_HOME_URL) else {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
            set_discovery_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_RESTORE_DISCOVERY_ROUTE_UNAVAILABLE",
                "静默恢复使用的武汉大学图书馆官网入口配置无效。",
                None,
            );
        }
        return;
    };
    if webview.navigate(entry).is_err() {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
            set_discovery_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_RESTORE_DISCOVERY_NAVIGATION_FAILED",
                "统一发现静默验证导航失败。",
                None,
            );
        }
        return;
    }

    let started = tokio::time::Instant::now();
    let mut route_activated = false;
    let mut unresolved_observations = 0_u8;
    while started.elapsed() < INSTITUTION_RESTORE_CAPABILITY_TIMEOUT {
        {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
        if let Ok(page) = inspect_academic_page(webview).await {
            let host = Url::parse(&page.url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_string));
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
                return;
            }
            match page.kind.as_str() {
                "search-form" | "bucket-summary" | "records" | "zero-results" => {
                    mark_discovery_search_access_ready_locked(&mut guard, host.clone());
                    set_discovery_auth_state_locked(
                        &mut guard,
                        SideraInstitutionAuthStatus::Ready,
                        "SIDERA_INSTITUTION_RESTORE_DISCOVERY_READY",
                        "统一发现访问能力已由固定版本页面检查确认。",
                        host,
                    );
                    return;
                }
                "login-required" | "expired" => {
                    set_explicit_discovery_login_required_locked(
                        &mut guard,
                        "SIDERA_INSTITUTION_RESTORE_DISCOVERY_LOGIN_REQUIRED",
                        "统一发现访问需要重新认证。",
                        host,
                    );
                    return;
                }
                "service-error" => {
                    set_discovery_auth_state_locked(
                        &mut guard,
                        SideraInstitutionAuthStatus::Failed,
                        "SIDERA_INSTITUTION_RESTORE_DISCOVERY_UPSTREAM_ERROR",
                        "统一发现官方页面当前返回服务异常。",
                        host,
                    );
                    return;
                }
                _ => {}
            }
        }

        if !route_activated {
            let Ok(payload) =
                eval_with_timeout(webview, DISCOVERY_ROUTE_SCRIPT, Duration::from_secs(1)).await
            else {
                continue;
            };
            let action = serde_json::from_str::<serde_json::Value>(&payload)
                .ok()
                .and_then(|value| {
                    value
                        .get("action")
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_default();
            if action == "clicked" {
                // The versioned page script only returns `clicked` after the
                // official academic-search tab is current and its input exists.
                // That is already the same search-form proof accepted below.
                let host = webview
                    .url()
                    .ok()
                    .and_then(|url| url.host_str().map(str::to_string));
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
                    mark_discovery_search_access_ready_locked(&mut guard, host.clone());
                    set_discovery_auth_state_locked(
                        &mut guard,
                        SideraInstitutionAuthStatus::Ready,
                        "SIDERA_INSTITUTION_RESTORE_DISCOVERY_READY",
                        "统一发现访问能力已由官方学术搜索表单确认。",
                        host,
                    );
                }
                return;
            } else if action == "navigating" {
                route_activated = true;
            } else if action == "unresolved" {
                unresolved_observations = unresolved_observations.saturating_add(1);
                if unresolved_observations >= 4 {
                    let mut guard = inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
                        set_discovery_auth_state_locked(
                            &mut guard,
                            SideraInstitutionAuthStatus::Failed,
                            "SIDERA_INSTITUTION_RESTORE_DISCOVERY_ROUTE_UNAVAILABLE",
                            "静默恢复未在武汉大学官网解析到统一发现入口。",
                            None,
                        );
                    }
                    return;
                }
            }
        }
    }
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
        set_discovery_auth_state_locked(
            &mut guard,
            SideraInstitutionAuthStatus::Failed,
            "SIDERA_INSTITUTION_RESTORE_DISCOVERY_TIMEOUT",
            "统一发现访问能力在 10 秒内未能确认。",
            None,
        );
        guard.session.updated_at_ms = now_ms();
        emit_session(app, &guard.session.clone());
    }
}

async fn restore_library_capability(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    restore_epoch: u64,
    generation: u64,
) {
    let Ok(entry) = Url::parse(WHU_LIBRARY_HOME_URL) else {
        return;
    };
    if webview.navigate(entry).is_err() {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
            set_auth_state_locked(
                &mut guard,
                SideraInstitutionAuthKind::LibraryAccount,
                SideraInstitutionAuthStatus::Failed,
                "SIDERA_INSTITUTION_RESTORE_LIBRARY_NAVIGATION_FAILED",
                "个人图书馆静默验证导航失败。",
                None,
            );
        }
        return;
    }

    let started = tokio::time::Instant::now();
    while started.elapsed() < INSTITUTION_RESTORE_CAPABILITY_TIMEOUT {
        {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
        let Ok(page) =
            inspect_library_auth_page_with_timeout(webview, Duration::from_secs(1)).await
        else {
            continue;
        };
        let host = Url::parse(&page.url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string));
        {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
                return;
            }
            match page.kind.as_str() {
                "library-ready" => {
                    set_auth_state_locked(
                        &mut guard,
                        SideraInstitutionAuthKind::LibraryAccount,
                        SideraInstitutionAuthStatus::Ready,
                        "SIDERA_INSTITUTION_RESTORE_LIBRARY_READY",
                        "个人图书馆会话已由固定版本页面检查确认。",
                        host,
                    );
                    return;
                }
                "login-required" | "expired" => {
                    set_explicit_auth_login_required_locked(
                        &mut guard,
                        SideraInstitutionAuthKind::LibraryAccount,
                        "SIDERA_INSTITUTION_RESTORE_LIBRARY_LOGIN_REQUIRED",
                        "个人图书馆会话需要重新认证。",
                        host,
                    );
                    return;
                }
                "service-error" => {
                    set_auth_state_locked(
                        &mut guard,
                        SideraInstitutionAuthKind::LibraryAccount,
                        SideraInstitutionAuthStatus::Failed,
                        "SIDERA_INSTITUTION_RESTORE_LIBRARY_UPSTREAM_ERROR",
                        "个人图书馆官方页面当前返回服务异常。",
                        host,
                    );
                    return;
                }
                _ => {}
            }
        }

        let _ = eval_with_timeout(
            webview,
            LIBRARY_ACCOUNT_ROUTE_SCRIPT,
            Duration::from_secs(1),
        )
        .await;
    }
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if session_restore_is_current_locked(&guard, restore_epoch, Some(generation)) {
        set_auth_state_locked(
            &mut guard,
            SideraInstitutionAuthKind::LibraryAccount,
            SideraInstitutionAuthStatus::Failed,
            "SIDERA_INSTITUTION_RESTORE_LIBRARY_TIMEOUT",
            "个人图书馆会话在 10 秒内未能确认。",
            None,
        );
    }
}

async fn run_session_restore(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    restore_epoch: u64,
) {
    let sequence = async {
        let _ = ensure_database_session_internal(&app, &inner).await;
        let Some(database_status) = wait_for_database_restore_terminal(&inner, restore_epoch).await
        else {
            return;
        };
        if database_status == SideraInstitutionAuthStatus::Failed {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, None) {
                return;
            }
            if guard.session.database_auth.status == SideraInstitutionAuthStatus::Starting {
                set_auth_state_locked(
                    &mut guard,
                    SideraInstitutionAuthKind::DatabaseSso,
                    SideraInstitutionAuthStatus::Failed,
                    "SIDERA_INSTITUTION_RESTORE_DATABASE_TIMEOUT",
                    "数据库 SSO 会话在 10 秒内未能确认。",
                    None,
                );
            }
        }

        let webview_and_generation = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, None) {
                return;
            }
            app.get_webview(INSTITUTION_WEBVIEW_LABEL)
                .map(|webview| (webview, guard.webview_generation))
        };
        let Some((webview, generation)) = webview_and_generation else {
            let state = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if !session_restore_is_current_locked(&guard, restore_epoch, None) {
                    return;
                }
                fail_pending_restore_capabilities_locked(
                    &mut guard,
                    "SIDERA_INSTITUTION_RESTORE_WEBVIEW_MISSING",
                    "静默恢复使用的隐藏机构页面已失效。",
                );
                finalize_session_restore_locked(&mut guard, restore_epoch)
            };
            if let Some(state) = state {
                emit_session(&app, &state);
            }
            return;
        };
        restore_discovery_capability(&app, &inner, &webview, restore_epoch, generation).await;
        restore_library_capability(&inner, &webview, restore_epoch, generation).await;
        let _ = webview.hide();
        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            finalize_session_restore_locked(&mut guard, restore_epoch)
        };
        if let Some(state) = state {
            emit_session(&app, &state);
        }
    };

    if tokio::time::timeout(INSTITUTION_RESTORE_TOTAL_TIMEOUT, sequence)
        .await
        .is_err()
    {
        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !session_restore_is_current_locked(&guard, restore_epoch, None) {
                return;
            }
            if guard.session.database_auth.status == SideraInstitutionAuthStatus::Starting {
                set_auth_state_locked(
                    &mut guard,
                    SideraInstitutionAuthKind::DatabaseSso,
                    SideraInstitutionAuthStatus::Failed,
                    "SIDERA_INSTITUTION_RESTORE_TIMEOUT",
                    "机构会话静默恢复超过 30 秒总预算。",
                    None,
                );
            }
            fail_pending_restore_capabilities_locked(
                &mut guard,
                "SIDERA_INSTITUTION_RESTORE_TIMEOUT",
                "机构会话静默恢复超过 30 秒总预算。",
            );
            finalize_session_restore_locked(&mut guard, restore_epoch)
        };
        if let Some(state) = state {
            emit_session(&app, &state);
        }
    }
}

async fn ensure_database_session_internal(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
) -> Result<SideraInstitutionSessionState, String> {
    let can_reuse = {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        app.get_webview(INSTITUTION_WEBVIEW_LABEL).is_some()
            && guard.session.active_auth_kind == Some(SideraInstitutionAuthKind::DatabaseSso)
            && matches!(
                guard.session.database_auth.status,
                SideraInstitutionAuthStatus::Ready | SideraInstitutionAuthStatus::LoginRequired
            )
    };
    if can_reuse {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        return Ok(guard.session.clone());
    }

    invalidate_institution_webviews(app, inner);
    let webview = match create_institution_webview(app, inner).await {
        Ok(webview) => webview,
        Err(code) => {
            register_auth_navigation_failure(
                app,
                inner,
                SideraInstitutionAuthKind::DatabaseSso,
                "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                "隔离机构页面创建或安全配置失败；请重试。",
            );
            return Err(code);
        }
    };
    let entry = match resolve_whu_session_entry().await {
        Ok(entry) => entry,
        Err(_) => {
            register_auth_navigation_failure(
                app,
                inner,
                SideraInstitutionAuthKind::DatabaseSso,
                "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED",
                "未能从武汉大学官方配置解析数据库 SSO；不会回退到图书馆首页。",
            );
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            return Ok(guard.session.clone());
        }
    };
    Ok(start_initial_navigation(
        app,
        inner,
        &webview,
        SideraInstitutionAuthKind::DatabaseSso,
        entry,
        None,
    ))
}

fn show_official_login_surface(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING".to_string())?;
    let webview = app
        .get_webview(INSTITUTION_WEBVIEW_LABEL)
        .ok_or_else(|| "SIDERA_INSTITUTION_SESSION_UNINITIALIZED".to_string())?;
    let size = window
        .inner_size()
        .map_err(|_| "SIDERA_INSTITUTION_AUTH_WINDOW_SIZE_FAILED".to_string())?;
    let scale = window
        .scale_factor()
        .map_err(|_| "SIDERA_INSTITUTION_AUTH_WINDOW_SIZE_FAILED".to_string())?;
    let width = (size.width as f64 / scale).max(720.0);
    let height = (size.height as f64 / scale).max(560.0);
    webview
        .set_position(LogicalPosition::new(0.0, 0.0))
        .and_then(|_| webview.set_size(LogicalSize::new(width, height)))
        .and_then(|_| webview.show())
        .map_err(|_| "SIDERA_INSTITUTION_AUTH_SURFACE_SHOW_FAILED".to_string())?;
    let _ = webview.set_focus();
    Ok(())
}

fn background_transport_park_position(
    physical_width: u32,
    physical_height: u32,
    scale_factor: f64,
) -> (f64, f64) {
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let width = physical_width as f64 / scale;
    let height = physical_height as f64 / scale;
    (
        (width - INSTITUTION_BACKGROUND_TRANSPORT_EDGE).max(0.0),
        (height - INSTITUTION_BACKGROUND_TRANSPORT_EDGE).max(0.0),
    )
}

fn park_institution_background_transport(
    app: &AppHandle,
) -> Result<(), (&'static str, &'static str)> {
    let window = app.get_window("main").ok_or((
        "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING",
        "Sidera 主窗口不存在，无法停靠后台机构页面。",
    ))?;
    let webview = app.get_webview(INSTITUTION_WEBVIEW_LABEL).ok_or((
        "SIDERA_INSTITUTION_SESSION_UNINITIALIZED",
        "机构会话运行面不存在，无法继续后台检索。",
    ))?;
    let size = window.inner_size().map_err(|_| {
        (
            "SIDERA_INSTITUTION_BACKGROUND_SURFACE_PARK_FAILED",
            "无法读取主窗口尺寸，后台机构页面未继续运行。",
        )
    })?;
    let scale = window.scale_factor().map_err(|_| {
        (
            "SIDERA_INSTITUTION_BACKGROUND_SURFACE_PARK_FAILED",
            "无法读取主窗口缩放，后台机构页面未继续运行。",
        )
    })?;
    let (x, y) = background_transport_park_position(size.width, size.height, scale);
    webview
        .set_position(LogicalPosition::new(x, y))
        .and_then(|_| {
            webview.set_size(LogicalSize::new(
                INSTITUTION_BACKGROUND_TRANSPORT_WIDTH,
                INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT,
            ))
        })
        .and_then(|_| webview.show())
        .map_err(|_| {
            (
                "SIDERA_INSTITUTION_BACKGROUND_SURFACE_PARK_FAILED",
                "后台机构页面无法进入受控停靠状态。",
            )
        })?;
    let _ = window.set_focus();
    Ok(())
}

async fn begin_institution_connection(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    goal: SideraInstitutionConnectionGoal,
) -> Result<SideraInstitutionSessionState, String> {
    {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        invalidate_session_restore_locked(&mut guard);
    }
    if goal == SideraInstitutionConnectionGoal::DiscoveryFulltext {
        let (token, session) = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let token = guard
                .academic_discovery_auth
                .as_ref()
                .map(|binding| binding.connection_token.clone())
                .filter(|token| guard.connection.is_current(token));
            (token, guard.session.clone())
        };
        if token.is_some() {
            if let Some(window) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
                let _ = window.show();
                let _ = window.set_focus();
            }
            return Ok(session);
        }
        return Err("SIDERA_INSTITUTION_DISCOVERY_AUTH_TASK_REQUIRED".to_string());
    }

    {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.active_task_id.is_some() {
            return Err("SIDERA_INSTITUTION_CONNECTION_SEARCH_BUSY".to_string());
        }
    }

    let (outcome, state) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let outcome = begin_connection_locked(&mut guard, goal);
        (outcome, guard.session.clone())
    };
    emit_session(app, &state);

    let token = match outcome {
        InstitutionConnectionBeginOutcome::Started(token) => token,
        InstitutionConnectionBeginOutcome::FocusExisting(token) => {
            let popup_bound = {
                let guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                library_connection_popup_is_bound_locked(&guard, &token)
            };
            let mut popup_focused = false;
            if let Some(window) = app.get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL) {
                if popup_bound {
                    popup_focused = window.show().is_ok() && window.set_focus().is_ok();
                } else {
                    let _ = window.close();
                }
            } else if popup_bound {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                clear_matching_library_connection_popup_locked(&mut guard, &token);
            }
            if !popup_focused {
                if let Some(window) = app.get_webview_window(INSTITUTION_CONNECTION_WINDOW_LABEL) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            return Ok(guard.session.clone());
        }
        InstitutionConnectionBeginOutcome::Busy(_) => {
            return Err("SIDERA_INSTITUTION_CONNECTION_BUSY".to_string());
        }
    };

    let entry = match goal {
        SideraInstitutionConnectionGoal::DatabaseAccess => resolve_whu_session_entry().await,
        SideraInstitutionConnectionGoal::LibraryAccount => Url::parse(WHU_LIBRARY_HOME_URL)
            .map_err(|_| "SIDERA_INSTITUTION_LIBRARY_ENTRY_INVALID".to_string()),
        SideraInstitutionConnectionGoal::DiscoveryFulltext => unreachable!(),
    };
    let entry = match entry {
        Ok(entry) => entry,
        Err(code) => {
            finalize_connection_window(
                app,
                inner,
                &token,
                InstitutionConnectionTerminal::Failed,
                "SIDERA_INSTITUTION_CONNECTION_ENTRY_UNRESOLVED",
                "未能解析官方机构认证入口；本次连接未改变此前已证明的状态。",
                None,
                false,
            );
            return Err(code);
        }
    };
    let parent = if let Some(parent) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
        parent
    } else {
        match create_institution_webview(app, inner).await {
            Ok(parent) => parent,
            Err(code) => {
                finalize_connection_window(
                    app,
                    inner,
                    &token,
                    InstitutionConnectionTerminal::Failed,
                    "SIDERA_INSTITUTION_CONNECTION_PARENT_CREATE_FAILED",
                    "绑定的机构父页面创建失败；本次连接未改变此前已证明的状态。",
                    None,
                    false,
                );
                return Err(code);
            }
        }
    };
    start_initial_navigation(
        app,
        inner,
        &parent,
        connection_goal_auth_kind(goal).expect("manual connection goal must map to auth kind"),
        entry.clone(),
        Some(&token),
    );
    if let Err(code) = create_connection_window(app, inner, entry, token.clone()) {
        finalize_connection_window(
            app,
            inner,
            &token,
            InstitutionConnectionTerminal::Failed,
            "SIDERA_INSTITUTION_CONNECTION_WINDOW_CREATE_FAILED",
            "机构认证窗口创建失败；本次连接未改变此前已证明的状态。",
            None,
            false,
        );
        return Err(code);
    }
    let guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(guard.session.clone())
}

#[tauri::command]
pub async fn sidera_institution_connection_begin(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionConnectionBeginInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    begin_institution_connection(&app, &state.inner, input.goal).await
}

#[tauri::command]
pub async fn sidera_institution_session_restore(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionIdInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    let (restore_epoch, starting, should_start) = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.restore_inflight {
            (guard.restore_epoch, guard.session.clone(), false)
        } else if guard.session.status != SideraInstitutionSessionStatus::Uninitialized {
            (guard.restore_epoch, guard.session.clone(), false)
        } else {
            let (restore_epoch, starting) = begin_session_restore_locked(&mut guard);
            (restore_epoch, starting, true)
        }
    };
    if should_start {
        emit_session(&app, &starting);
        let restore_app = app.clone();
        let restore_inner = state.inner.clone();
        tauri::async_runtime::spawn(async move {
            run_session_restore(restore_app, restore_inner, restore_epoch).await;
        });
    }
    Ok(starting)
}

#[tauri::command]
pub async fn sidera_institution_session_restore_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionIdInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    let should_invalidate = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !guard.restore_inflight {
            false
        } else {
            invalidate_session_restore_locked(&mut guard);
            guard.session.status = SideraInstitutionSessionStatus::Partial;
            guard.session.code = "SIDERA_INSTITUTION_SESSION_RESTORE_CANCELLED".to_string();
            guard.session.message =
                "已离开机构资源，静默恢复已取消；迟到页面不会改变当前状态。".to_string();
            guard.session.updated_at_ms = now_ms();
            true
        }
    };
    if should_invalidate {
        invalidate_institution_webviews(&app, &state.inner);
    }
    let current = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.session.clone()
    };
    if should_invalidate {
        emit_session(&app, &current);
    }
    Ok(current)
}

#[tauri::command]
pub async fn sidera_institution_session_ensure(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionSessionEnsureInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    begin_institution_connection(
        &app,
        &state.inner,
        auth_kind_connection_goal(input.auth_kind.unwrap_or_default()),
    )
    .await
}

#[tauri::command]
pub async fn sidera_institution_session_state(
    _app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionIdInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(guard.session.clone())
}

#[tauri::command]
pub async fn sidera_institution_browser_set_bounds(
    app: AppHandle,
    input: InstitutionBrowserBoundsInput,
) -> Result<InstitutionActionResult, String> {
    ensure_whu(&input.institution_id)?;
    let values = [input.x, input.y, input.width, input.height];
    if values.iter().any(|value| !value.is_finite())
        || input.x < 0.0
        || input.y < 0.0
        || !(120.0..=10_000.0).contains(&input.width)
        || !(120.0..=10_000.0).contains(&input.height)
    {
        return Err("SIDERA_INSTITUTION_BOUNDS_INVALID".to_string());
    }
    let webview = app
        .get_webview(INSTITUTION_WEBVIEW_LABEL)
        .ok_or_else(|| "SIDERA_INSTITUTION_SESSION_UNINITIALIZED".to_string())?;
    webview
        .set_position(LogicalPosition::new(input.x, input.y))
        .and_then(|_| webview.set_size(LogicalSize::new(input.width, input.height)))
        .map_err(|_| "SIDERA_INSTITUTION_BOUNDS_UPDATE_FAILED".to_string())?;
    Ok(InstitutionActionResult {
        ok: true,
        code: "SIDERA_INSTITUTION_BOUNDS_UPDATED".to_string(),
    })
}

#[tauri::command]
pub async fn sidera_institution_browser_set_visible(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionBrowserVisibleInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    let webview = app
        .get_webview(INSTITUTION_WEBVIEW_LABEL)
        .ok_or_else(|| "SIDERA_INSTITUTION_SESSION_UNINITIALIZED".to_string())?;
    let (should_show_main, result_label) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let auth_status = match guard
            .session
            .active_auth_kind
            .unwrap_or(SideraInstitutionAuthKind::DatabaseSso)
        {
            SideraInstitutionAuthKind::DatabaseSso => guard.session.database_auth.status,
            SideraInstitutionAuthKind::LibraryAccount => guard.session.library_account_auth.status,
        };
        let result_label = guard
            .academic_result_webview
            .as_ref()
            .filter(|binding| {
                input.visible
                    && binding.ready
                    && guard.search.source == SideraInstitutionSearchSource::AcademicDiscovery
                    && guard.search.task_id.as_deref() == Some(binding.task_id.as_str())
            })
            .map(|binding| binding.label.clone());
        let should_show_main = result_label.is_none()
            && input.visible
            && guard.pending_initial_navigation_epoch.is_none()
            && !matches!(
                auth_status,
                SideraInstitutionAuthStatus::Idle
                    | SideraInstitutionAuthStatus::Cancelled
                    | SideraInstitutionAuthStatus::Failed
            );
        (should_show_main, result_label)
    };
    if should_show_main {
        webview
            .show()
            .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_SHOW_FAILED".to_string())?;
        let _ = webview.set_focus();
    } else {
        webview
            .hide()
            .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_HIDE_FAILED".to_string())?;
    }
    if let Some(label) = result_label.as_deref() {
        let result = app
            .get_webview_window(label)
            .ok_or_else(|| "SIDERA_INSTITUTION_RESULT_WEBVIEW_UNAVAILABLE".to_string())?;
        result
            .show()
            .map_err(|_| "SIDERA_INSTITUTION_RESULT_WEBVIEW_SHOW_FAILED".to_string())?;
        let _ = result.set_focus();
    } else {
        let label = {
            let guard = state
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard
                .academic_result_webview
                .as_ref()
                .map(|binding| binding.label.clone())
        };
        if let Some(label) = label {
            if let Some(result) = app.get_webview_window(&label) {
                result
                    .hide()
                    .map_err(|_| "SIDERA_INSTITUTION_RESULT_WEBVIEW_HIDE_FAILED".to_string())?;
            }
        }
    }
    let next = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(binding) = guard.academic_result_webview.as_mut() {
            binding.raw_visible = result_label.is_some();
        }
        guard.session.browser_visible = input.visible;
        guard.session.updated_at_ms = now_ms();
        guard.session.clone()
    };
    emit_session(&app, &next);
    Ok(next)
}

fn cancel_institution_connection(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    transaction_id: Option<&str>,
    expected_goal: Option<SideraInstitutionConnectionGoal>,
) -> Result<SideraInstitutionSessionState, String> {
    let (token, discovery_binding) = {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(token) = guard.connection.current_token() else {
            return Ok(guard.session.clone());
        };
        if transaction_id.is_some_and(|value| value != token.transaction_id) {
            return Err("SIDERA_INSTITUTION_CONNECTION_STALE".to_string());
        }
        if expected_goal.is_some_and(|goal| goal != token.goal) {
            return Err("SIDERA_INSTITUTION_CONNECTION_GOAL_MISMATCH".to_string());
        }
        let discovery_binding = guard
            .academic_discovery_auth
            .as_ref()
            .filter(|binding| binding.connection_token == token)
            .cloned();
        (token, discovery_binding)
    };

    if let Some(binding) = discovery_binding {
        finish_discovery_auth_cancelled(
            app,
            inner,
            &binding,
            "SIDERA_INSTITUTION_CONNECTION_CANCELLED",
            "已取消统一发现机构认证；检索入口仍可重试。",
        );
    } else {
        finalize_connection_window(
            app,
            inner,
            &token,
            InstitutionConnectionTerminal::Cancelled,
            "SIDERA_INSTITUTION_CONNECTION_CANCELLED",
            "已取消机构连接；本次操作未清除任何已保存的机构会话。",
            None,
            true,
        );
    }
    let guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(guard.session.clone())
}

#[tauri::command]
pub async fn sidera_institution_connection_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionConnectionCancelInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    cancel_institution_connection(&app, &state.inner, input.transaction_id.as_deref(), None)
}

#[tauri::command]
pub async fn sidera_institution_auth_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionAuthCancelInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    let auth_kind = input.auth_kind.unwrap_or_default();
    let expected_goal = auth_kind_connection_goal(auth_kind);
    match auth_kind {
        SideraInstitutionAuthKind::DatabaseSso => {
            if let Some(webview) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
                let _ = webview.hide();
            }
            restore_main_window(&app);
        }
        SideraInstitutionAuthKind::LibraryAccount => {
            finish_library_auth_modal(
                &app,
                &state.inner,
                SideraInstitutionAuthStatus::Cancelled,
                "SIDERA_INSTITUTION_AUTH_CANCELLED",
                "已取消个人图书馆登录；主窗口已恢复。",
                None,
                true,
            );
        }
    }
    let has_matching_connection = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .connection
            .current_token()
            .is_some_and(|token| token.goal == expected_goal)
    };
    if has_matching_connection {
        cancel_institution_connection(&app, &state.inner, None, Some(expected_goal))
    } else {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Ok(guard.session.clone())
    }
}

fn research_run_is_current(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> bool {
    let guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.research_search.active().is_some_and(|run| {
        run.task_id == task_id
            && !matches!(
                run.status,
                ResearchSearchStatus::Complete
                    | ResearchSearchStatus::Partial
                    | ResearchSearchStatus::Failed
                    | ResearchSearchStatus::Cancelled
            )
    })
}

async fn wait_for_research_database_auth(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<(), (&'static str, &'static str)> {
    loop {
        if !research_run_is_current(inner, task_id) {
            return Err((
                "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK",
                "当前后台检索已被取消或替换。",
            ));
        }
        let auth = {
            let guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.session.database_auth.clone()
        };
        match auth.status {
            SideraInstitutionAuthStatus::Ready => {
                park_institution_background_transport(app)?;
                return Ok(());
            }
            SideraInstitutionAuthStatus::Failed | SideraInstitutionAuthStatus::Cancelled => {
                return Err((
                    "SIDERA_RESEARCH_SEARCH_AUTH_FAILED",
                    "武汉大学官方登录未完成；本次后台检索保持失败，不会打开检索网页或自动重试。",
                ));
            }
            _ => {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        }
    }
}

fn prepare_legacy_academic_transport(
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    token: ResearchSearchToken,
    query: &str,
) {
    let started_at_ms = now_ms();
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(request) = guard
        .research_search
        .active()
        .filter(|run| run.task_id == token.task_id)
        .map(|run| run.request.clone())
    else {
        return;
    };
    guard.epoch = guard.epoch.saturating_add(1);
    guard.sequence = guard.sequence.saturating_add(1);
    let previous_search = guard.search.clone();
    let previous_active_task_id = guard.active_task_id.clone();
    let previous_detail_urls = guard
        .detail_urls
        .remove(&SideraInstitutionSearchSource::AcademicDiscovery)
        .unwrap_or_default();
    let previous_full_text_urls = guard
        .full_text_urls
        .remove(&SideraInstitutionSearchSource::AcademicDiscovery)
        .unwrap_or_default();
    guard.structured_pending_requests.clear();
    guard.structured_pending_responses.clear();
    guard.legacy_academic_transport = Some(LegacyAcademicTransportRun {
        token: token.clone(),
        request,
        connector_result: None,
        pages_scanned: 0,
        previous_search,
        previous_active_task_id,
        previous_detail_urls,
        previous_full_text_urls,
        structured: StructuredAcademicTransportState::default(),
    });
    guard.active_task_id = Some(token.task_id.clone());
    guard.search = SideraInstitutionSearchSnapshot {
        institution_id: "whu".to_string(),
        adapter_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
        source: SideraInstitutionSearchSource::AcademicDiscovery,
        task_id: Some(token.task_id),
        epoch: guard.epoch,
        sequence: guard.sequence,
        query: query.to_string(),
        status: SideraInstitutionSearchStatus::Searching,
        stage: SideraInstitutionSearchStage::OpeningWebResult,
        source_buckets: Vec::new(),
        items: Vec::new(),
        code: "SIDERA_RESEARCH_SEARCH_TRANSPORT_STARTED".to_string(),
        message: "后台连接器正在复用隔离机构会话。".to_string(),
        started_at_ms: Some(started_at_ms),
        updated_at_ms: started_at_ms,
        finished_at_ms: None,
    };
}

fn legacy_item_to_adapter_record(
    item: SideraInstitutionSearchItem,
    detail_url: Option<String>,
    full_text_url: Option<String>,
) -> research_hotspots_core::institution_search::SideraInstitutionAdapterRecord {
    research_hotspots_core::institution_search::SideraInstitutionAdapterRecord {
        title: item.title,
        authors: item.authors,
        year: item.year,
        publication: item.publication,
        document_type: item.document_type,
        doi: item.doi,
        abstract_snippet: item.abstract_snippet,
        availability: item.availability,
        detail_url: detail_url.unwrap_or_default(),
        full_text_url,
        record_kind: item.record_kind,
        journal: item.journal,
        conference: item.conference,
        degree_institution: item.degree_institution,
        volume: item.volume,
        issue: item.issue,
        pages: item.pages,
        source_provider: item.source_provider,
        full_text_status: item.full_text_status,
        provider_record_id: item.provider_record_id,
        catalog_record_id: None,
        isbn_issn: None,
    }
}

fn research_record_kind_name(
    kind: research_hotspots_core::institution_search::SideraInstitutionRecordKind,
) -> &'static str {
    use research_hotspots_core::institution_search::SideraInstitutionRecordKind;
    match kind {
        SideraInstitutionRecordKind::JournalArticle => "journal-article",
        SideraInstitutionRecordKind::ConferencePaper => "conference-paper",
        SideraInstitutionRecordKind::Thesis => "thesis",
        SideraInstitutionRecordKind::Book => "book",
        SideraInstitutionRecordKind::JournalHolding => "journal-holding",
        SideraInstitutionRecordKind::Unknown => "unknown",
    }
}

fn research_full_text_status_name(
    status: research_hotspots_core::institution_search::SideraInstitutionFullTextStatus,
) -> &'static str {
    use research_hotspots_core::institution_search::SideraInstitutionFullTextStatus;
    match status {
        SideraInstitutionFullTextStatus::Available => "available",
        SideraInstitutionFullTextStatus::LinkOnly => "link-only",
        SideraInstitutionFullTextStatus::Unavailable => "unavailable",
        SideraInstitutionFullTextStatus::Unknown => "unknown",
    }
}

fn observed_protocol_transport(
    events: &[crate::sidera_institution_protocol::RedactedProtocolEvent],
) -> LiteratureConnectorTransport {
    use crate::sidera_institution_protocol::InstitutionProtocolTransportEvidence;
    match crate::sidera_institution_protocol::select_protocol_transport(events) {
        InstitutionProtocolTransportEvidence::StructuredApi => {
            LiteratureConnectorTransport::StructuredApi
        }
        InstitutionProtocolTransportEvidence::SessionWebRequest => {
            LiteratureConnectorTransport::SessionWebRequest
        }
        InstitutionProtocolTransportEvidence::DomFallback => {
            LiteratureConnectorTransport::DomFallback
        }
    }
}

fn structured_connector_result(
    structured: &StructuredAcademicTransportState,
    request: &LiteratureSearchRequest,
) -> Option<LiteratureConnectorSearchResult> {
    if structured.pages.is_empty() {
        return None;
    }
    let mut records = Vec::new();
    let mut retrieval_positions = Vec::new();
    let mut total_hits = None;
    let mut explicit_zero_results = false;
    for page in &structured.pages {
        records.extend(page.records.clone());
        retrieval_positions.extend(page.retrieval_positions.clone());
        if page.total_hits.is_some() {
            total_hits = page.total_hits;
        }
        explicit_zero_results |= page.explicit_zero_results;
    }
    let last_page = structured.pages.last();
    let has_more = last_page.and_then(|page| page.has_more);
    let qualifying_count = structured_qualifying_candidate_keys(structured, request).len();
    let official_range_suffix = last_page
        .and_then(|page| page.first_result.zip(page.last_result))
        .map(|(first, last)| format!(" 末页官方范围：{first}–{last}。"))
        .unwrap_or_default();
    let completion_reason = if structured.failure_code.is_some() {
        ResearchSearchCompletionReason::PartialFailure
    } else if explicit_zero_results {
        ResearchSearchCompletionReason::ExplicitZeroResults
    } else if qualifying_count >= request.result_limit {
        ResearchSearchCompletionReason::ResultLimit
    } else if structured.pages.len() >= request.max_pages {
        ResearchSearchCompletionReason::PageLimit
    } else if has_more == Some(false) {
        ResearchSearchCompletionReason::SourceExhausted
    } else {
        ResearchSearchCompletionReason::PartialFailure
    };
    let (code, mut message) = if let Some(code) = structured.failure_code.as_deref() {
        (
            code.to_string(),
            "结构化检索在后续页失效；已保留此前验证过的结构化结果，未混入 DOM 结果。".to_string(),
        )
    } else {
        match completion_reason {
            ResearchSearchCompletionReason::ResultLimit => (
                "SIDERA_RESEARCH_SEARCH_RESULT_LIMIT_REACHED".to_string(),
                "结构化检索已达到本地结果上限。".to_string(),
            ),
            ResearchSearchCompletionReason::PageLimit => (
                "SIDERA_RESEARCH_SEARCH_PAGE_LIMIT_REACHED".to_string(),
                "结构化检索已达到全局分页预算。".to_string(),
            ),
            ResearchSearchCompletionReason::ExplicitZeroResults => (
                "SIDERA_RESEARCH_SEARCH_COMPLETE_EMPTY".to_string(),
                "官方结构化响应明确返回零条结果。".to_string(),
            ),
            ResearchSearchCompletionReason::SourceExhausted => (
                "SIDERA_RESEARCH_SEARCH_SOURCE_EXHAUSTED".to_string(),
                "官方结构化响应明确表示来源已耗尽。".to_string(),
            ),
            _ => (
                "SIDERA_RESEARCH_SEARCH_STRUCTURED_PARTIAL".to_string(),
                "结构化响应未提供可验证的终止真值；结果保持部分状态。".to_string(),
            ),
        }
    };
    message.push_str(&official_range_suffix);
    Some(LiteratureConnectorSearchResult {
        connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
        connector_version: WHU_STRUCTURED_CONNECTOR_VERSION.to_string(),
        transport: LiteratureConnectorTransport::StructuredApi,
        observed_transport: Some(LiteratureConnectorTransport::StructuredApi),
        source_id: "whu-academic-discovery".to_string(),
        source_name: "武汉大学统一学术发现".to_string(),
        pages_scanned: structured.pages.len(),
        explicit_zero_results,
        partial: matches!(
            completion_reason,
            ResearchSearchCompletionReason::PartialFailure
                | ResearchSearchCompletionReason::PageLimit
        ),
        code,
        message,
        records,
        retrieval_positions,
        total_hits,
        has_more,
        completion_reason,
    })
}

fn structured_qualifying_candidate_keys(
    structured: &StructuredAcademicTransportState,
    request: &LiteratureSearchRequest,
) -> BTreeSet<String> {
    structured
        .pages
        .iter()
        .flat_map(|page| page.records.iter())
        .filter(|record| research_transport_accepts_record(record))
        .filter_map(|record| qualifying_research_candidate_key(request, record))
        .collect()
}

fn synchronize_academic_progress_from_structured(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    progress: &mut AcademicCollectionProgress,
) {
    let Some(request) = progress.request.as_ref() else {
        return;
    };
    let qualifying_keys = {
        let guard = runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(run) = guard.legacy_academic_transport.as_ref() else {
            return;
        };
        if run.token.task_id != task_id || run.structured.pages.is_empty() {
            return;
        }
        structured_qualifying_candidate_keys(&run.structured, request)
    };
    // Once an official structured page has been accepted it is the only
    // authoritative source for target progress. DOM extraction remains a
    // compatibility fallback, but must not stop the structured route early.
    progress.replace_qualifying_keys(qualifying_keys);
}

fn finish_research_from_legacy(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) {
    let (
        legacy,
        detail_urls,
        full_text_urls,
        connector_result,
        transport_pages_scanned,
        protocol_events,
        mut structured,
        request,
    ) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(binding) = guard.legacy_academic_transport.take() else {
            return;
        };
        guard
            .structured_pending_requests
            .retain(|_, context| context.task_id != task_id);
        guard.structured_pending_responses.clear();
        let legacy = guard.search.clone();
        let connector_result = binding.connector_result;
        let transport_pages_scanned = binding.pages_scanned;
        let structured = binding.structured;
        let request = binding.request;
        let detail_urls = guard
            .detail_urls
            .remove(&SideraInstitutionSearchSource::AcademicDiscovery)
            .unwrap_or_default();
        let full_text_urls = guard
            .full_text_urls
            .remove(&SideraInstitutionSearchSource::AcademicDiscovery)
            .unwrap_or_default();
        guard.search = binding.previous_search;
        guard.active_task_id = binding.previous_active_task_id;
        guard.detail_urls.insert(
            SideraInstitutionSearchSource::AcademicDiscovery,
            binding.previous_detail_urls,
        );
        guard.full_text_urls.insert(
            SideraInstitutionSearchSource::AcademicDiscovery,
            binding.previous_full_text_urls,
        );
        if binding.token.task_id != task_id
            || !guard.research_search.token_is_current(&binding.token)
        {
            return;
        }
        (
            legacy,
            detail_urls,
            full_text_urls,
            connector_result,
            transport_pages_scanned,
            guard.protocol_session.snapshot(),
            structured,
            request,
        )
    };
    let observed_transport = observed_protocol_transport(&protocol_events);
    if legacy.status == SideraInstitutionSearchStatus::Failed
        && !structured.pages.is_empty()
        && structured.failure_code.is_none()
    {
        // The outer 90-second activity budget can cancel the in-flight page
        // future before the protocol observer receives its response. Preserve
        // that terminal truth on the already verified structured snapshot.
        structured.failure_code = Some(legacy.code.clone());
    }
    let structured_result = structured_connector_result(&structured, &request);
    let used_structured = structured_result.is_some();

    if legacy.status == SideraInstitutionSearchStatus::Cancelled {
        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if guard
                .research_search
                .active()
                .is_none_or(|run| run.task_id != task_id)
            {
                return;
            }
            let _ = guard.research_search.cancel(now_ms());
            guard.research_search.state_snapshot()
        };
        emit_research_search(app, &state);
        return;
    }

    if legacy.status != SideraInstitutionSearchStatus::Failed || used_structured {
        let mut result = structured_result.unwrap_or_else(|| {
            connector_result.unwrap_or_else(|| {
                // Compatibility-only fallback for a pre-R1 producer. It preserves
                // the legacy item order, reports an unknown page count as zero and
                // never invents one connector per provider.
                let mut retrieval_positions = Vec::new();
                let records = legacy
                    .items
                    .clone()
                    .into_iter()
                    .enumerate()
                    .map(|(index, item)| {
                        retrieval_positions.push(ResearchSearchRetrievalPosition {
                            connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                            rank: index.saturating_add(1),
                            page: 1,
                            position: index.saturating_add(1),
                            facet: None,
                            basis: ResearchSearchRetrievalPositionBasis::Synthesized,
                        });
                        let detail_url = detail_urls.get(&item.detail_locator).cloned();
                        let full_text_url = item
                            .full_text_locator
                            .as_ref()
                            .and_then(|locator| full_text_urls.get(locator))
                            .cloned();
                        legacy_item_to_adapter_record(item, detail_url, full_text_url)
                    })
                    .collect::<Vec<_>>();
                let explicit_zero =
                    records.is_empty() && legacy.code == "SIDERA_INSTITUTION_SEARCH_COMPLETE_EMPTY";
                LiteratureConnectorSearchResult {
                    connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                    connector_version: "whu-academic-discovery-v1-dom-fallback".to_string(),
                    transport: LiteratureConnectorTransport::DomFallback,
                    observed_transport: Some(observed_transport),
                    source_id: "whu-academic-discovery".to_string(),
                    source_name: "武汉大学统一学术发现".to_string(),
                    pages_scanned: 0,
                    explicit_zero_results: explicit_zero,
                    partial: !explicit_zero,
                    code: if explicit_zero {
                        legacy.code.clone()
                    } else {
                        "SIDERA_RESEARCH_SEARCH_PAGE_COUNT_UNAVAILABLE".to_string()
                    },
                    message: if explicit_zero {
                        legacy.message.clone()
                    } else {
                        "兼容传输未提供真实分页计数；结果保持部分状态。".to_string()
                    },
                    records,
                    retrieval_positions,
                    total_hits: None,
                    has_more: None,
                    completion_reason: if explicit_zero {
                        ResearchSearchCompletionReason::ExplicitZeroResults
                    } else {
                        ResearchSearchCompletionReason::PartialFailure
                    },
                }
            })
        });
        if !used_structured {
            // A DOM result is a one-shot fallback, never a structured success.
            result.partial = true;
            result.completion_reason = ResearchSearchCompletionReason::PartialFailure;
            let route_code = structured
                .failure_code
                .as_deref()
                .unwrap_or(STRUCTURED_ROUTE_UNAVAILABLE);
            result.code = DOM_FALLBACK_USED.to_string();
            result.message = format!(
                "结构化路线不可用（{route_code}）；已使用一次版本化 DOM 回退，结果保持部分状态。"
            );
            result.transport = LiteratureConnectorTransport::DomFallback;
            result.observed_transport = Some(observed_transport);
        }
        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some(token) = guard.research_search.next_token() else {
                return;
            };
            if token.task_id != task_id {
                return;
            }
            match guard
                .research_search
                .apply_connector_result(&token, result, now_ms())
            {
                Err(_) => return,
                Ok(_) => guard.research_search.state_snapshot(),
            }
        };
        emit_research_search(app, &state);
    }

    if legacy.status == SideraInstitutionSearchStatus::Failed && !used_structured {
        let failure = LiteratureConnectorFailure {
            connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
            source_id: "whu-academic-discovery".to_string(),
            source_name: "武汉大学统一学术发现".to_string(),
            pages_scanned: transport_pages_scanned,
            code: DOM_FALLBACK_USED.to_string(),
            message: format!(
                "结构化路线不可用（{}），一次 DOM 回退也未完成：{}",
                structured
                    .failure_code
                    .as_deref()
                    .unwrap_or(STRUCTURED_ROUTE_UNAVAILABLE),
                legacy.message
            ),
        };
        let state = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some(token) = guard.research_search.next_token() else {
                return;
            };
            if token.task_id != task_id {
                return;
            }
            match guard
                .research_search
                .apply_connector_failure(&token, failure, now_ms())
            {
                Err(_) => return,
                Ok(_) => guard.research_search.state_snapshot(),
            }
        };
        emit_research_search(app, &state);
    }

    let final_state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(status_token) = guard.research_search.next_token() else {
            return;
        };
        if status_token.task_id != task_id {
            return;
        }
        if guard
            .research_search
            .mark_status(
                &status_token,
                ResearchSearchStatus::Normalizing,
                "SIDERA_RESEARCH_SEARCH_NORMALIZING",
                "正在规范化候选、合并重复身份并生成不透明定位。",
                now_ms(),
            )
            .is_err()
        {
            return;
        }
        let candidates = guard
            .research_search
            .active()
            .map(|run| run.candidates.clone())
            .unwrap_or_default();
        let Some(finish_token) = guard.research_search.next_token() else {
            return;
        };
        let terminal = match guard.research_search.finish(&finish_token, now_ms()) {
            Ok(snapshot) => snapshot,
            Err(_) => return,
        };
        if matches!(
            terminal.status,
            ResearchSearchStatus::Complete | ResearchSearchStatus::Partial
        ) {
            guard.research_detail_urls.clear();
            guard.research_full_text_urls.clear();
            for candidate in candidates {
                if let (Some(locator), Some(url)) =
                    (candidate.detail_locator, candidate.canonical_url)
                {
                    guard.research_detail_urls.insert(locator, url);
                }
                if let (Some(locator), Some(url)) =
                    (candidate.full_text_locator, candidate.full_text_url)
                {
                    guard.research_full_text_urls.insert(locator, url);
                }
            }
        }
        guard.research_search.state_snapshot()
    };
    emit_research_search(app, &final_state);
}

fn finish_research_failure(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    code: String,
    message: &str,
) {
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(token) = guard.research_search.next_token() else {
            return;
        };
        if token.task_id != task_id {
            return;
        }
        let failure = LiteratureConnectorFailure {
            connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
            source_id: "whu-academic-discovery".to_string(),
            source_name: "武汉大学统一学术发现".to_string(),
            pages_scanned: 0,
            code,
            message: message.to_string(),
        };
        if guard
            .research_search
            .apply_connector_failure(&token, failure, now_ms())
            .is_err()
        {
            return;
        }
        let Some(finish_token) = guard.research_search.next_token() else {
            return;
        };
        if guard
            .research_search
            .finish(&finish_token, now_ms())
            .is_err()
        {
            return;
        }
        guard.research_search.state_snapshot()
    };
    emit_research_search(app, &state);
}

async fn run_research_search_task(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: String,
    query: String,
) {
    let session = match ensure_database_session_internal(&app, &inner).await {
        Ok(session) => session,
        Err(code) => {
            let failure = LiteratureConnectorFailure {
                connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                source_id: "whu-session".to_string(),
                source_name: "武汉大学机构会话".to_string(),
                pages_scanned: 0,
                code,
                message: "机构会话初始化失败。".to_string(),
            };
            let state = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let Some(token) = guard.research_search.next_token() else {
                    return;
                };
                if token.task_id != task_id {
                    return;
                }
                if guard
                    .research_search
                    .apply_connector_failure(&token, failure, now_ms())
                    .is_err()
                {
                    return;
                }
                let Some(token) = guard.research_search.next_token() else {
                    return;
                };
                if guard.research_search.finish(&token, now_ms()).is_err() {
                    return;
                }
                guard.research_search.state_snapshot()
            };
            emit_research_search(&app, &state);
            return;
        }
    };

    if session.database_auth.status != SideraInstitutionAuthStatus::Ready {
        mark_research_status(
            &app,
            &inner,
            &task_id,
            ResearchSearchStatus::AwaitingUserAuth,
            "SIDERA_RESEARCH_SEARCH_AWAITING_USER_AUTH",
            "请在唯一可见的武汉大学官方登录页面完成认证；成功后当前检索将自动恢复。",
        );
        if let Err(code) = show_official_login_surface(&app) {
            finish_research_failure(
                &app,
                &inner,
                &task_id,
                code,
                "无法显示武汉大学官方登录页面。",
            );
            return;
        }
        if let Err((code, message)) = wait_for_research_database_auth(&app, &inner, &task_id).await
        {
            finish_research_failure(&app, &inner, &task_id, code.to_string(), message);
            return;
        }
    }

    if mark_research_status(
        &app,
        &inner,
        &task_id,
        ResearchSearchStatus::ResolvingConnectors,
        "SIDERA_RESEARCH_SEARCH_RESOLVING_CONNECTOR",
        "正在读取脱敏协议勘察证据；当前正式执行路径仍是同 UDF 的实验性 DOM 回退。",
    )
    .is_none()
    {
        return;
    }
    let webview = match app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
        Some(webview) => webview,
        None => {
            finish_research_failure(
                &app,
                &inner,
                &task_id,
                "SIDERA_RESEARCH_SEARCH_SESSION_WEBVIEW_MISSING".to_string(),
                "机构会话运行面不存在，无法执行后台检索。",
            );
            return;
        }
    };
    if let Err((code, message)) = park_institution_background_transport(&app) {
        finish_research_failure(&app, &inner, &task_id, code.to_string(), message);
        return;
    }
    close_academic_result_webview(&app, &inner);
    if mark_research_status(
        &app,
        &inner,
        &task_id,
        ResearchSearchStatus::Searching,
        "SIDERA_RESEARCH_SEARCHING",
        "后台连接器正在检索；正常流程不会打开侧边网页。",
    )
    .is_none()
    {
        return;
    }
    let transport_token = {
        let guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(token) = guard.research_search.current_token() else {
            return;
        };
        if token.task_id != task_id {
            return;
        }
        token
    };
    prepare_legacy_academic_transport(&inner, transport_token, &query);
    let search_result = run_institution_search_with_pauseable_timeout(
        &app,
        &inner,
        &webview,
        &task_id,
        &query,
        SideraInstitutionSearchSource::AcademicDiscovery,
    )
    .await;
    let _ = webview.hide();
    if let Err((code, message)) = search_result {
        finish_search_error(&app, &inner, &task_id, code, message);
    }
    finish_research_from_legacy(&app, &inner, &task_id);
}

#[tauri::command]
pub async fn sidera_research_search_start(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: ResearchSearchStartInput,
) -> Result<SideraResearchSearchState, String> {
    let ResearchSearchStartInput {
        query: raw_query,
        client_request_id,
        start_reason,
        filters,
        result_limit,
    } = input;
    let query = validate_institution_query(&raw_query).map_err(str::to_string)?;
    let mut request = LiteratureSearchRequest::whu(query.clone());
    if let Some(filters) = filters {
        if filters.record_kinds.is_empty() {
            return Err("SIDERA_RESEARCH_SEARCH_RECORD_KIND_REQUIRED".to_string());
        }
        request.filters = filters;
    }
    request.result_limit = result_limit;
    let (search_state, started, task_id) = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let webview_generation = guard.webview_generation;
        let (search_state, started) = guard
            .research_search
            .begin_with_context(
                request,
                client_request_id,
                start_reason,
                webview_generation,
                now_ms(),
            )
            .map_err(str::to_string)?;
        let task_id = search_state
            .active_attempt
            .as_ref()
            .map(|attempt| attempt.run.task_id.clone());
        if started {
            if let Some(binding) = guard.legacy_academic_transport.take() {
                guard.search = binding.previous_search;
                guard.active_task_id = binding.previous_active_task_id;
                guard.detail_urls.insert(
                    SideraInstitutionSearchSource::AcademicDiscovery,
                    binding.previous_detail_urls,
                );
                guard.full_text_urls.insert(
                    SideraInstitutionSearchSource::AcademicDiscovery,
                    binding.previous_full_text_urls,
                );
            }
            guard.protocol_session.clear();
        }
        (search_state, started, task_id)
    };
    emit_research_search(&app, &search_state);
    if started {
        close_academic_result_webview(&app, &state.inner);
        let task_id = task_id.ok_or_else(|| "SIDERA_RESEARCH_SEARCH_NOT_ACTIVE".to_string())?;
        let runtime = state.inner.clone();
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            run_research_search_task(app_handle, runtime, task_id, query).await;
        });
    }
    Ok(search_state)
}

#[tauri::command]
pub async fn sidera_research_search_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: ResearchSearchCancelInput,
) -> Result<SideraResearchSearchState, String> {
    let search_state = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(task_id) = input.task_id.as_deref() {
            if guard
                .research_search
                .active()
                .map(|run| run.task_id.as_str())
                != Some(task_id)
            {
                return Err("SIDERA_RESEARCH_SEARCH_TASK_STALE".to_string());
            }
        }
        guard
            .research_search
            .cancel(now_ms())
            .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_NOT_ACTIVE".to_string())?;
        if let Some(binding) = guard.legacy_academic_transport.take() {
            guard.search = binding.previous_search;
            guard.active_task_id = binding.previous_active_task_id;
            guard.detail_urls.insert(
                SideraInstitutionSearchSource::AcademicDiscovery,
                binding.previous_detail_urls,
            );
            guard.full_text_urls.insert(
                SideraInstitutionSearchSource::AcademicDiscovery,
                binding.previous_full_text_urls,
            );
        } else {
            guard.active_task_id = None;
        }
        guard.research_search.state_snapshot()
    };
    if let Some(webview) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
        let _ = webview.hide();
    }
    close_academic_result_webview(&app, &state.inner);
    emit_research_search(&app, &search_state);
    Ok(search_state)
}

#[tauri::command]
pub async fn sidera_research_search_snapshot(
    state: State<'_, SideraInstitutionRuntimeState>,
    input: ResearchSearchSnapshotInput,
) -> Result<SideraResearchSearchState, String> {
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let search_state = guard.research_search.state_snapshot();
    if let Some(requested) = input.task_id.as_deref() {
        let matches = search_state
            .active_attempt
            .as_ref()
            .is_some_and(|attempt| attempt.run.task_id == requested)
            || search_state
                .displayed_snapshot
                .as_ref()
                .is_some_and(|snapshot| snapshot.task_id == requested)
            || search_state
                .last_failure
                .as_ref()
                .is_some_and(|failure| failure.task_id == requested);
        if !matches {
            return Err("SIDERA_RESEARCH_SEARCH_TASK_STALE".to_string());
        }
    }
    Ok(search_state)
}

#[tauri::command]
pub async fn sidera_research_result_open(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: ResearchResultOpenInput,
) -> Result<InstitutionActionResult, String> {
    let target = input.target.as_deref().unwrap_or("record");
    let (url, context) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let run = guard
            .research_search
            .displayed()
            .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_SNAPSHOT_UNAVAILABLE".to_string())?;
        let candidate = run
            .candidates
            .iter()
            .find(|candidate| candidate.id == input.candidate_id)
            .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_CANDIDATE_STALE".to_string())?;
        let locator = if target == "full-text" {
            candidate.full_text_locator.as_deref()
        } else {
            candidate.detail_locator.as_deref()
        }
        .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_LOCATOR_UNAVAILABLE".to_string())?;
        let url = if target == "full-text" {
            guard.research_full_text_urls.get(locator)
        } else {
            guard.research_detail_urls.get(locator)
        }
        .cloned()
        .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_LOCATOR_STALE".to_string())?;
        let context = crate::sidera_institution_browser::SideraInstitutionBrowserContext {
            institution_id: Some("whu".to_string()),
            source: Some("academic-discovery".to_string()),
            adapter_id: Some(WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string()),
            query: Some(run.request.query.clone()),
            result_id: Some(candidate.id.clone()),
            result_title: Some(candidate.title.clone()),
        };
        (url, context)
    };
    if input.mode == "system" {
        app.opener()
            .open_url(url, None::<String>)
            .map_err(|_| "SIDERA_INSTITUTION_SYSTEM_BROWSER_FAILED".to_string())?;
        return Ok(InstitutionActionResult {
            ok: true,
            code: "SIDERA_RESEARCH_RESULT_OPENED_SYSTEM".to_string(),
        });
    }
    let browser_state =
        app.state::<crate::sidera_institution_browser::SideraInstitutionBrowserRuntimeState>();
    crate::sidera_institution_browser::open_url_in_browser(
        &app,
        browser_state.inner(),
        &url,
        Some(context),
        true,
    )
    .await?;
    Ok(InstitutionActionResult {
        ok: true,
        code: "SIDERA_RESEARCH_RESULT_OPENED_FOR_VERIFICATION".to_string(),
    })
}

#[tauri::command]
pub async fn sidera_import_review_create_from_search(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: ResearchImportReviewCreateInput,
) -> Result<research_hotspots_core::import_review::SideraImportReviewBatch, String> {
    if input.candidate_ids.is_empty() {
        return Err("SIDERA_IMPORT_REVIEW_CANDIDATES_REQUIRED".to_string());
    }
    let (query, producer_version, candidates) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let run = guard
            .research_search
            .displayed()
            .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_SNAPSHOT_UNAVAILABLE".to_string())?;
        if run.task_id != input.search_id || run.epoch != input.generation {
            return Err("SIDERA_IMPORT_REVIEW_SEARCH_GENERATION_STALE".to_string());
        }
        if !matches!(
            run.status,
            ResearchSearchStatus::Complete | ResearchSearchStatus::Partial
        ) {
            return Err("SIDERA_IMPORT_REVIEW_SEARCH_NOT_COMPLETE".to_string());
        }
        let mut selected = Vec::new();
        let mut producer_versions = BTreeSet::new();
        for id in &input.candidate_ids {
            let candidate = run
                .candidates
                .iter()
                .find(|candidate| &candidate.id == id)
                .ok_or_else(|| "SIDERA_IMPORT_REVIEW_RESULT_ID_STALE".to_string())?;
            producer_versions.extend(candidate.producer_versions.iter().cloned());
            selected.push(
                research_hotspots_core::import_review::SideraNormalizedImportCandidate {
                    id: candidate.id.clone(),
                    title: candidate.title.clone(),
                    authors: candidate.authors.clone(),
                    year: candidate.year.map(i64::from),
                    record_type: Some(research_record_kind_name(candidate.record_kind).to_string()),
                    venue: candidate.venue.clone(),
                    doi: candidate.doi.clone(),
                    provider_record_id: candidate.provider_record_id.clone(),
                    // Identity tier 3 requires the canonical record URL.  The
                    // opaque detail locator is only a frontend capability and
                    // must never replace the persisted identity evidence.
                    canonical_locator: candidate.canonical_url.clone(),
                    abstract_text: candidate.abstract_text.clone(),
                    source: Some("institution-search".to_string()),
                    source_database: Some(candidate.source_database.clone()),
                    full_text: Some(
                        research_hotspots_core::import_review::SideraImportFullText {
                            status: Some(
                                research_full_text_status_name(candidate.full_text_status)
                                    .to_string(),
                            ),
                            locator: candidate.full_text_locator.clone(),
                        },
                    ),
                    provenance: serde_json::json!({
                        "searchCandidateId": candidate.id.clone(),
                        "orchestratorConnectorIds": candidate.connector_ids,
                        "producerVersions": candidate.producer_versions,
                        "sourceIds": candidate.source_ids,
                        "fields": candidate.field_provenance,
                    }),
                },
            );
        }
        if producer_versions.len() != 1 {
            return Err("SIDERA_IMPORT_REVIEW_PRODUCER_VERSION_AMBIGUOUS".to_string());
        }
        let producer_version = producer_versions
            .into_iter()
            .next()
            .ok_or_else(|| "SIDERA_IMPORT_REVIEW_PRODUCER_VERSION_MISSING".to_string())?;
        if input.connector_version != producer_version {
            return Err("SIDERA_IMPORT_REVIEW_CONNECTOR_VERSION_STALE".to_string());
        }
        (run.request.query.clone(), producer_version, selected)
    };
    crate::sidera_import_review::create_from_validated_search(
        app,
        input.database_dir,
        input.project_id,
        input.search_id,
        input.generation,
        producer_version,
        query,
        candidates,
    )
    .await
}

#[tauri::command]
pub async fn sidera_institution_search_start(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionSearchStartInput,
) -> Result<SideraInstitutionSearchSnapshot, String> {
    ensure_whu(&input.institution_id)?;
    let query = validate_institution_query(&input.query).map_err(str::to_string)?;
    let source = input.source.unwrap_or_default();
    if source == SideraInstitutionSearchSource::AcademicDiscovery {
        let run = {
            let guard = state
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard
                .research_search
                .state()
                .active_attempt
                .as_ref()
                .filter(|attempt| attempt.run.request.query == query)
                .map(|attempt| attempt.run.clone())
                .or_else(|| {
                    guard
                        .research_search
                        .displayed()
                        .filter(|run| run.request.query == query)
                        .cloned()
                })
                .ok_or_else(|| "SIDERA_RESEARCH_SEARCH_COMPATIBILITY_UNAVAILABLE".to_string())?
        };
        return Ok(research_run_to_institution_snapshot(&run));
    }
    close_academic_result_webview(&app, &state.inner);
    let webview = app
        .get_webview(INSTITUTION_WEBVIEW_LABEL)
        .ok_or_else(|| "SIDERA_INSTITUTION_SESSION_UNINITIALIZED".to_string())?;
    let session_ready = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.session.database_auth.status == SideraInstitutionAuthStatus::Ready
    };
    if !session_ready {
        return Err("SIDERA_INSTITUTION_SESSION_NOT_READY".to_string());
    }
    let started_at_ms = now_ms();
    let (task_id, snapshot, session) = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.epoch = guard.epoch.saturating_add(1);
        guard.sequence = guard.sequence.saturating_add(1);
        let task_id = format!("institution-{}-{}", started_at_ms, guard.epoch);
        guard.active_task_id = Some(task_id.clone());
        guard.detail_urls.entry(source).or_default().clear();
        guard.full_text_urls.entry(source).or_default().clear();
        guard.search = SideraInstitutionSearchSnapshot {
            institution_id: "whu".to_string(),
            adapter_id: source.adapter_id().to_string(),
            source,
            task_id: Some(task_id.clone()),
            epoch: guard.epoch,
            sequence: guard.sequence,
            query: query.clone(),
            status: SideraInstitutionSearchStatus::Searching,
            stage: SideraInstitutionSearchStage::OpeningWebResult,
            source_buckets: Vec::new(),
            items: Vec::new(),
            code: "SIDERA_INSTITUTION_SEARCH_STARTED".to_string(),
            message: if source == SideraInstitutionSearchSource::AcademicDiscovery {
                "正在解析武大统一学术发现入口并提交论文检索。"
            } else {
                "正在进入武汉大学馆藏目录并提交检索。"
            }
            .to_string(),
            started_at_ms: Some(started_at_ms),
            updated_at_ms: started_at_ms,
            finished_at_ms: None,
        };
        guard.session.status = SideraInstitutionSessionStatus::Searching;
        guard.session.code = "SIDERA_INSTITUTION_SEARCHING".to_string();
        guard.session.message = "机构资源正在检索。".to_string();
        set_source_readiness_locked(
            &mut guard,
            source,
            SideraInstitutionSourceReadinessStatus::Starting,
            "SIDERA_INSTITUTION_SOURCE_STARTING",
            if source == SideraInstitutionSearchSource::AcademicDiscovery {
                "正在检查统一学术发现来源。"
            } else {
                "正在检查馆藏目录来源。"
            },
            None,
        );
        (task_id, guard.search.clone(), guard.session.clone())
    };
    emit_search(&app, &snapshot);
    emit_session(&app, &session);
    let runtime = state.inner.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err((code, message)) = run_institution_search_with_pauseable_timeout(
            &app_handle,
            &runtime,
            &webview,
            &task_id,
            &query,
            source,
        )
        .await
        {
            finish_search_error(&app_handle, &runtime, &task_id, code, message);
        }
    });
    Ok(snapshot)
}

#[tauri::command]
pub async fn sidera_institution_search_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionSearchCancelInput,
) -> Result<SideraInstitutionSearchSnapshot, String> {
    ensure_whu(&input.institution_id)?;
    let compatibility_projection = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let projected = guard
            .research_search
            .active()
            .filter(|run| {
                input
                    .task_id
                    .as_deref()
                    .is_none_or(|requested| requested == run.task_id)
            })
            .cloned()
            .or_else(|| {
                guard
                    .research_search
                    .displayed()
                    .filter(|run| {
                        input
                            .task_id
                            .as_deref()
                            .is_none_or(|requested| requested == run.task_id)
                    })
                    .cloned()
            });
        let should_project = input.task_id.is_some()
            || guard.active_task_id.is_none()
            || guard.search.source == SideraInstitutionSearchSource::AcademicDiscovery;
        should_project.then_some(projected).flatten()
    };
    if let Some(run) = compatibility_projection {
        return Ok(research_run_to_institution_snapshot(&run));
    }
    let (snapshot, session, result_label, close_discovery_auth) = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(requested) = input.task_id.as_deref() {
            if guard.active_task_id.as_deref() != Some(requested) {
                return Err("SIDERA_INSTITUTION_SEARCH_TASK_STALE".to_string());
            }
        }
        guard.epoch = guard.epoch.saturating_add(1);
        guard.sequence = guard.sequence.saturating_add(1);
        guard.active_task_id = None;
        let result_label = guard
            .academic_result_webview
            .take()
            .map(|binding| binding.label);
        let discovery_binding = guard.academic_discovery_auth.take().map(|mut binding| {
            binding.closing = true;
            binding
        });
        let close_discovery_auth = discovery_binding.is_some();
        if let Some(binding) = discovery_binding {
            guard.session.discovery_auth_window_visible = false;
            let _ = finalize_connection_locked(
                &mut guard,
                &binding.connection_token,
                InstitutionConnectionTerminal::Cancelled,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_CANCELLED",
                "当前检索与统一发现认证等待已由用户停止。",
                None,
            );
        }
        guard.search.status = SideraInstitutionSearchStatus::Cancelled;
        guard.search.stage = SideraInstitutionSearchStage::Cancelled;
        guard.search.sequence = guard.sequence;
        guard.search.code = "SIDERA_INSTITUTION_SEARCH_CANCELLED".to_string();
        guard.search.message = "已停止当前机构检索；迟到页面回调将被忽略。".to_string();
        guard.search.updated_at_ms = now_ms();
        guard.search.finished_at_ms = Some(guard.search.updated_at_ms);
        let cancelled_source = guard.search.source;
        let cancelled_snapshot = guard.search.clone();
        guard
            .search_snapshots
            .insert(cancelled_source, cancelled_snapshot);
        set_source_readiness_locked(
            &mut guard,
            cancelled_source,
            SideraInstitutionSourceReadinessStatus::Partial,
            "SIDERA_INSTITUTION_SEARCH_CANCELLED",
            "该来源的当前检索已取消；已有快照仍保留在本次运行中。",
            None,
        );
        guard.session.status = SideraInstitutionSessionStatus::Ready;
        guard.session.code = "SIDERA_INSTITUTION_SESSION_READY".to_string();
        guard.session.message = "机构会话仍然可用。".to_string();
        guard.session.database_auth.status = SideraInstitutionAuthStatus::Ready;
        guard.session.database_auth.code = "SIDERA_INSTITUTION_SESSION_READY".to_string();
        guard.session.database_auth.message = "数据库 SSO 会话仍然可用。".to_string();
        guard.session.database_auth.updated_at_ms = now_ms();
        (
            guard.search.clone(),
            guard.session.clone(),
            result_label,
            close_discovery_auth,
        )
    };
    if close_discovery_auth {
        if let Some(window) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
            let _ = window.close();
        }
        let _ = restore_main_window(&app);
    }
    if let Some(label) = result_label {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
    emit_search(&app, &snapshot);
    emit_session(&app, &session);
    Ok(snapshot)
}

#[tauri::command]
pub async fn sidera_institution_result_open(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionResultOpenInput,
) -> Result<InstitutionActionResult, String> {
    ensure_whu(&input.institution_id)?;
    let source = input.source.unwrap_or_default();
    let target = input.target.as_deref().unwrap_or("record");
    let (url, context) = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.result_open_epoch = guard.result_open_epoch.saturating_add(1);
        let source_urls = if target == "full-text" {
            guard.full_text_urls.get(&source)
        } else {
            guard.detail_urls.get(&source)
        };
        let (url, fallback) =
            if let Some(url) = source_urls.and_then(|urls| urls.get(&input.result_id)) {
                (url.clone(), false)
            } else if let Some(url) = guard.blocked_targets.get(&input.result_id) {
                (url.clone(), true)
            } else {
                return Err("SIDERA_INSTITUTION_RESULT_STALE".to_string());
            };
        let snapshot = guard
            .search_snapshots
            .get(&source)
            .or_else(|| (guard.search.source == source).then_some(&guard.search));
        let item = snapshot.and_then(|snapshot| {
            snapshot.items.iter().find(|item| {
                item.id == input.result_id
                    || item.detail_locator == input.result_id
                    || item.full_text_locator.as_deref() == Some(input.result_id.as_str())
            })
        });
        let source_name = match source {
            SideraInstitutionSearchSource::AcademicDiscovery => "academic-discovery",
            SideraInstitutionSearchSource::Catalog => "catalog",
        };
        let context = crate::sidera_institution_browser::SideraInstitutionBrowserContext {
            institution_id: Some(input.institution_id.clone()),
            source: Some(source_name.to_string()),
            adapter_id: item
                .map(|item| item.provenance.adapter_id.clone())
                .or_else(|| snapshot.map(|snapshot| snapshot.adapter_id.clone())),
            query: snapshot.map(|snapshot| snapshot.query.clone()),
            result_id: item
                .map(|item| item.id.clone())
                .or_else(|| Some(input.result_id.clone())),
            result_title: item.map(|item| item.title.clone()),
        };
        let _ = fallback;
        (url, context)
    };
    if input.mode == "system" {
        let safe = safe_external_display_url(&url)
            .ok_or_else(|| "SIDERA_INSTITUTION_RESULT_URL_REJECTED".to_string())?;
        let _ = safe;
        app.opener()
            .open_url(url, None::<String>)
            .map_err(|_| "SIDERA_INSTITUTION_SYSTEM_BROWSER_FAILED".to_string())?;
        return Ok(InstitutionActionResult {
            ok: true,
            code: "SIDERA_INSTITUTION_RESULT_OPENED_SYSTEM".to_string(),
        });
    }
    let browser_state =
        app.state::<crate::sidera_institution_browser::SideraInstitutionBrowserRuntimeState>();
    crate::sidera_institution_browser::open_url_in_browser(
        &app,
        browser_state.inner(),
        &url,
        Some(context),
        true,
    )
    .await?;
    {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.session.browser_visible = false;
    }
    Ok(InstitutionActionResult {
        ok: true,
        code: "SIDERA_INSTITUTION_RESULT_OPENED_IN_BROWSER_TAB".to_string(),
    })
}

#[tauri::command]
pub async fn sidera_institution_open_current_source(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionIdInput,
) -> Result<InstitutionActionResult, String> {
    ensure_whu(&input.institution_id)?;
    let (label, context) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let label = guard
            .academic_result_webview
            .as_ref()
            .map(|binding| binding.label.clone())
            .unwrap_or_else(|| INSTITUTION_WEBVIEW_LABEL.to_string());
        let source = match guard.search.source {
            SideraInstitutionSearchSource::AcademicDiscovery => "academic-discovery",
            SideraInstitutionSearchSource::Catalog => "catalog",
        };
        let context = crate::sidera_institution_browser::SideraInstitutionBrowserContext {
            institution_id: Some(input.institution_id.clone()),
            source: Some(source.to_string()),
            adapter_id: Some(guard.search.adapter_id.clone()),
            query: (!guard.search.query.trim().is_empty()).then(|| guard.search.query.clone()),
            result_id: None,
            result_title: None,
        };
        (label, context)
    };
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "SIDERA_INSTITUTION_SOURCE_WEBVIEW_UNAVAILABLE".to_string())?;
    let url = webview
        .url()
        .map_err(|_| "SIDERA_INSTITUTION_SOURCE_URL_UNAVAILABLE".to_string())?;
    let browser_state =
        app.state::<crate::sidera_institution_browser::SideraInstitutionBrowserRuntimeState>();
    crate::sidera_institution_browser::open_url_in_browser(
        &app,
        browser_state.inner(),
        url.as_str(),
        Some(context),
        true,
    )
    .await?;
    Ok(InstitutionActionResult {
        ok: true,
        code: "SIDERA_INSTITUTION_SOURCE_OPENED_IN_BROWSER_TAB".to_string(),
    })
}

#[tauri::command]
pub async fn sidera_institution_session_reset(
    app: AppHandle,
    state: State<'_, SideraInstitutionRuntimeState>,
    input: InstitutionIdInput,
) -> Result<SideraInstitutionSessionState, String> {
    ensure_whu(&input.institution_id)?;
    close_academic_result_webview(&app, &state.inner);
    {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        invalidate_session_restore_locked(&mut guard);
        guard.webview_generation = guard.webview_generation.saturating_add(1);
        guard.pending_initial_navigation_epoch = None;
        guard.pending_initial_navigation_connection = None;
        guard.catalog_handoff_epoch = None;
        guard.session.auth_modal_visible = false;
        guard.academic_discovery_auth = None;
        guard.connection.reset();
        guard.connection_auth_popup_token = None;
        guard.explicit_login_required_transaction_id = None;
    }
    if let Some(connection) = app.get_webview_window(INSTITUTION_CONNECTION_WINDOW_LABEL) {
        let _ = connection.close();
    }
    if let Some(connection_auth) = app.get_webview_window(INSTITUTION_CONNECTION_AUTH_WINDOW_LABEL)
    {
        let _ = connection_auth.close();
    }
    if let Some(discovery) = app.get_webview_window(INSTITUTION_DISCOVERY_AUTH_WINDOW_LABEL) {
        let _ = discovery.close();
    }
    if let Some(modal) = app.get_webview_window(INSTITUTION_AUTH_WINDOW_LABEL) {
        let _ = modal.close();
    }
    restore_main_window(&app);
    if let Some(webview) = app.get_webview(INSTITUTION_WEBVIEW_LABEL) {
        let _ = webview.hide();
        webview
            .clear_all_browsing_data()
            .map_err(|_| "SIDERA_INSTITUTION_SESSION_CLEAR_FAILED".to_string())?;
        webview
            .close()
            .map_err(|_| "SIDERA_INSTITUTION_WEBVIEW_CLOSE_FAILED".to_string())?;
    }
    let next = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.epoch = guard.epoch.saturating_add(1);
        guard.active_task_id = None;
        guard.detail_urls.clear();
        guard.full_text_urls.clear();
        guard.search_snapshots.clear();
        guard.blocked_targets.clear();
        guard.search = SideraInstitutionSearchSnapshot::default();
        guard.session = SideraInstitutionSessionState::default();
        guard.session.code = "SIDERA_INSTITUTION_SESSION_RESET".to_string();
        guard.session.message = "机构会话已清除；下次使用需要重新登录。".to_string();
        guard.session.updated_at_ms = now_ms();
        guard.session.clone()
    };
    emit_session(&app, &next);
    Ok(next)
}

async fn run_institution_search_with_pauseable_timeout(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    task_id: &str,
    query: &str,
    source: SideraInstitutionSearchSource,
) -> Result<(), (&'static str, &'static str)> {
    let mut remaining = SEARCH_TOTAL_TIMEOUT;
    let mut last_tick = tokio::time::Instant::now();
    let future = run_institution_search(app, runtime, webview, task_id, query, source);
    tokio::pin!(future);
    loop {
        tokio::select! {
            result = &mut future => return result,
            _ = tokio::time::sleep(Duration::from_millis(120)) => {
                let now = tokio::time::Instant::now();
                let elapsed = now.duration_since(last_tick);
                last_tick = now;
                let awaiting_auth = task_is_awaiting_discovery_auth(runtime, task_id);
                if discovery_auth_search_timeout_should_advance(awaiting_auth) {
                    remaining = remaining.saturating_sub(elapsed);
                    if remaining.is_zero() {
                        return Err((
                            "SIDERA_INSTITUTION_SEARCH_TIMEOUT",
                            "机构检索的活动处理时间超过 90 秒；认证等待时间未计入该上限。",
                        ));
                    }
                }
            }
        }
    }
}

async fn run_institution_search(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    task_id: &str,
    query: &str,
    source: SideraInstitutionSearchSource,
) -> Result<(), (&'static str, &'static str)> {
    match source {
        SideraInstitutionSearchSource::AcademicDiscovery => {
            run_academic_discovery_search(app, runtime, webview, task_id, query).await
        }
        SideraInstitutionSearchSource::Catalog => {
            run_catalog_search(app, runtime, webview, task_id, query).await
        }
    }
}

async fn resolve_whu_academic_discovery_entry() -> Option<Url> {
    tokio::task::spawn_blocking(crate::probe_whu_institution)
        .await
        .ok()
        .and_then(Result::ok)
        .and_then(|probe| {
            probe
                .navigation_targets
                .into_iter()
                .find(|target| target.id == "unified-discovery")
                .and_then(|target| Url::parse(&target.open_url).ok())
        })
}

async fn activate_official_discovery_route(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<(), (&'static str, &'static str)> {
    webview
        .navigate(Url::parse(WHU_LIBRARY_HOME_URL).map_err(|_| {
            (
                "SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED",
                "武汉大学图书馆官网入口配置无效。",
            )
        })?)
        .map_err(|_| {
            (
                "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                "无法在机构会话中打开武汉大学图书馆官网。",
            )
        })?;

    let started = tokio::time::Instant::now();
    let mut paused = Duration::ZERO;
    let mut unresolved_observations = 0_u8;
    while started.elapsed().saturating_sub(paused) < Duration::from_secs(20) {
        assert_task_current(runtime, task_id)?;
        paused = paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
        tokio::time::sleep(Duration::from_millis(650)).await;
        let payload =
            eval_with_timeout(webview, DISCOVERY_ROUTE_SCRIPT, Duration::from_secs(5)).await?;
        let action = serde_json::from_str::<serde_json::Value>(&payload)
            .ok()
            .and_then(|value| {
                value
                    .get("action")
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            })
            .unwrap_or_default();
        if matches!(action.as_str(), "navigating" | "clicked") {
            return Ok(());
        }
        if action == "unresolved" {
            unresolved_observations = unresolved_observations.saturating_add(1);
            if unresolved_observations >= 4 {
                return Err((
                    "SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED",
                    "当前武汉大学官网未解析到严格匹配“珞珈学术搜索/学术搜索”的真实入口；不会回退馆藏目录冒充论文检索。",
                ));
            }
        }
    }
    Err((
        "SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED",
        "武汉大学官网未在限定时间内提供可激活的统一学术发现入口。",
    ))
}

fn active_research_transport_request(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Option<LiteratureSearchRequest> {
    let guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .legacy_academic_transport
        .as_ref()
        .filter(|binding| binding.token.task_id == task_id)
        .map(|binding| binding.request.clone())
}

fn store_research_connector_result(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    result: LiteratureConnectorSearchResult,
) {
    let mut guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(binding) = guard
        .legacy_academic_transport
        .as_mut()
        .filter(|binding| binding.token.task_id == task_id)
    {
        binding.connector_result = Some(result);
    }
}

fn store_research_pages_scanned(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    pages_scanned: usize,
) {
    let mut guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(binding) = guard
        .legacy_academic_transport
        .as_mut()
        .filter(|binding| binding.token.task_id == task_id)
    {
        binding.pages_scanned = binding.pages_scanned.max(pages_scanned);
    }
}

fn requested_academic_facets(request: Option<&LiteratureSearchRequest>) -> Vec<&'static str> {
    let Some(request) = request else {
        return vec!["article", "conference-paper", "thesis"];
    };
    request
        .filters
        .record_kinds
        .iter()
        .filter_map(|kind| match kind {
            SideraInstitutionRecordKind::JournalArticle => Some("article"),
            SideraInstitutionRecordKind::ConferencePaper => Some("conference-paper"),
            SideraInstitutionRecordKind::Thesis => Some("thesis"),
            _ => None,
        })
        .collect()
}

async fn run_academic_discovery_search(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    task_id: &str,
    query: &str,
) -> Result<(), (&'static str, &'static str)> {
    assert_task_current(runtime, task_id)?;
    if let Some(entry) = resolve_whu_academic_discovery_entry().await {
        webview.navigate(entry).map_err(|_| {
            (
                "SIDERA_INSTITUTION_NAVIGATION_FAILED",
                "无法进入武大官方统一学术发现入口。",
            )
        })?;
    } else {
        activate_official_discovery_route(webview, runtime, task_id).await?;
    }

    let form_page = wait_for_academic_page_kind(
        webview,
        runtime,
        task_id,
        &["search-form"],
        Duration::from_secs(25),
    )
    .await?;
    if form_page.page_signature.is_empty() {
        return Err((
            "SIDERA_INSTITUTION_ADAPTER_DRIFT",
            "统一学术发现检索表单缺少页面签名；适配器需要更新。",
        ));
    }
    assert_task_current(runtime, task_id)?;
    let access_state = {
        let mut guard = runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let host = Url::parse(&form_page.url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string));
        mark_discovery_search_access_ready_locked(&mut guard, host);
        guard.session.clone()
    };
    emit_session(app, &access_state);
    if let Ok(inspection) = inspect_discovery_auth_page(webview).await {
        update_discovery_auth_from_inspection(app, runtime, &inspection, None);
    }
    let submission = submit_academic_query(webview, query).await?;
    if submission.page_signature != form_page.page_signature {
        return Err((
            "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
            "统一学术发现页面在提交前发生变化；当前查询未继续。",
        ));
    }
    let result_webview = wait_for_academic_result_webview(app, runtime, task_id).await?;
    let initial_page = wait_for_submitted_academic_result(
        &result_webview,
        runtime,
        task_id,
        &form_page.page_signature,
        query,
        Duration::from_secs(35),
    )
    .await?;
    if let Ok(inspection) = inspect_discovery_auth_page(&result_webview).await {
        update_discovery_auth_from_inspection(app, runtime, &inspection, None);
    }

    let research_request = active_research_transport_request(runtime, task_id);
    let mut collection = AcademicCollectionProgress::new(research_request.clone());
    if initial_page.kind == "zero-results" || initial_page.explicit_zero_results {
        collection.observe(&initial_page);
        store_research_pages_scanned(runtime, task_id, collection.pages_scanned);
        if research_request.is_some() {
            store_research_connector_result(
                runtime,
                task_id,
                LiteratureConnectorSearchResult {
                    connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                    connector_version: "whu-academic-discovery-v1-dom-fallback".to_string(),
                    transport: LiteratureConnectorTransport::DomFallback,
                    observed_transport: None,
                    source_id: "whu-academic-discovery".to_string(),
                    source_name: "武汉大学统一学术发现".to_string(),
                    pages_scanned: collection.pages_scanned,
                    explicit_zero_results: true,
                    partial: false,
                    code: "SIDERA_RESEARCH_SEARCH_COMPLETE_EMPTY".to_string(),
                    message: "官方结果页明确返回零结果。".to_string(),
                    records: Vec::new(),
                    retrieval_positions: Vec::new(),
                    total_hits: Some(0),
                    has_more: Some(false),
                    completion_reason: ResearchSearchCompletionReason::ExplicitZeroResults,
                },
            );
        }
        finish_search_success(app, runtime, task_id, vec![], vec![], false, true);
        return Ok(());
    }
    // The submitted result page has already been successfully inspected. Count
    // that visit immediately so a later facet timeout or adapter failure cannot
    // incorrectly report zero scanned pages. Its records are incorporated only
    // by the typed fallback; combined/sequential modes use their confirmed pages.
    collection.note_page_without_candidates();
    store_research_pages_scanned(runtime, task_id, collection.pages_scanned);
    let (pages, source_exhausted) = match apply_academic_resource_filters(
        app,
        &result_webview,
        runtime,
        task_id,
    )
    .await
    {
        Ok(AcademicFacetMode::Combined) => {
            let page = wait_for_submitted_academic_result(
                &result_webview,
                runtime,
                task_id,
                &initial_page.page_signature,
                query,
                Duration::from_secs(35),
            )
            .await?;
            collect_academic_pages(
                &result_webview,
                runtime,
                task_id,
                query,
                page,
                None,
                false,
                None,
                &mut collection,
            )
            .await?
        }
        Ok(AcademicFacetMode::Sequential) => {
            collect_sequential_academic_facets(
                app,
                &result_webview,
                runtime,
                task_id,
                query,
                &mut collection,
            )
            .await?
        }
        Err(("SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED", _)) => {
            update_search_stage(
                app,
                runtime,
                task_id,
                SideraInstitutionSearchStage::Extracting,
                "SIDERA_INSTITUTION_ACADEMIC_TYPED_FALLBACK",
                "网页分面未能稳定确认；连接器将按每条记录的明确资源类型过滤，未知类型只会使来源降级为部分结果。",
            );
            collect_academic_pages(
                &result_webview,
                runtime,
                task_id,
                query,
                initial_page,
                None,
                true,
                None,
                &mut collection,
            )
            .await?
        }
        Err(error) => return Err(error),
    };

    update_search_stage(
        app,
        runtime,
        task_id,
        SideraInstitutionSearchStage::Extracting,
        "SIDERA_INSTITUTION_ACADEMIC_EXTRACTING",
        "正在从任务绑定结果面抽取、按明确论文类型过滤并去重原生题录。",
    );
    let mut transport_records = Vec::new();
    let mut retrieval_positions = Vec::new();
    for collected in &pages {
        for (position, record) in collected.page.records.iter().enumerate() {
            if !research_transport_accepts_record(record) {
                continue;
            }
            transport_records.push(record.clone());
            retrieval_positions.push(ResearchSearchRetrievalPosition {
                connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                rank: transport_records.len(),
                page: collected.page_number,
                position: position.saturating_add(1),
                facet: collected.facet.clone(),
                basis: ResearchSearchRetrievalPositionBasis::Observed,
            });
        }
    }
    let mut grouped = BTreeMap::<String, Vec<_>>::new();
    let mut rejected_by_source = BTreeMap::<String, usize>::new();
    let mut partial = false;
    let mut explicit_zero_results = false;
    for collected in pages {
        let page = collected.page;
        explicit_zero_results |= page.kind == "zero-results" || page.explicit_zero_results;
        for record in page.records {
            let source_label = record
                .source_provider
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("未标明来源")
                .chars()
                .take(80)
                .collect::<String>();
            if validate_academic_adapter_records(std::slice::from_ref(&record)).is_err() {
                // Mixed-resource discovery pages can still expose books, journal
                // titles, menus or incomplete supplier rows after a confirmed
                // facet transition. Reject every non-paper candidate and mark the
                // snapshot partial; never coerce unknown into a paper kind.
                partial = true;
                *rejected_by_source.entry(source_label).or_default() += 1;
                continue;
            }
            if record
                .source_provider
                .as_deref()
                .unwrap_or("")
                .trim()
                .is_empty()
            {
                partial = true;
            }
            grouped.entry(source_label).or_default().push(record);
        }
    }
    let mut batches = Vec::new();
    let mut source_states = Vec::new();
    for (label, records) in grouped {
        let rejected = rejected_by_source.remove(&label).unwrap_or_default();
        let count = records.len().saturating_add(rejected);
        let normalized = normalize_academic_adapter_records(&label, records, now_ms());
        if normalized.items.is_empty() {
            partial = true;
            source_states.push(SideraInstitutionSourceBucket {
                id: format!("bucket-{}", short_hash(&label)),
                label,
                count: Some(count),
                returned: 0,
                status: "failed".to_string(),
                code: Some("SIDERA_INSTITUTION_ACADEMIC_IDENTITY_MISSING".to_string()),
            });
        } else {
            source_states.push(SideraInstitutionSourceBucket {
                id: format!("bucket-{}", short_hash(&label)),
                label,
                count: Some(count),
                returned: normalized.items.len(),
                status: if rejected > 0 { "failed" } else { "complete" }.to_string(),
                code: (rejected > 0)
                    .then(|| "SIDERA_INSTITUTION_ACADEMIC_SOURCE_PARTIAL_FILTERED".to_string()),
            });
            batches.push(normalized);
        }
    }
    for (label, rejected) in rejected_by_source {
        partial = true;
        source_states.push(SideraInstitutionSourceBucket {
            id: format!("bucket-{}", short_hash(&label)),
            label,
            count: Some(rejected),
            returned: 0,
            status: "failed".to_string(),
            code: Some("SIDERA_INSTITUTION_ACADEMIC_SOURCE_ALL_FILTERED".to_string()),
        });
    }
    if research_request.is_some() {
        let completion_reason = if collection.limit_reached {
            ResearchSearchCompletionReason::ResultLimit
        } else if collection.page_limit_reached {
            ResearchSearchCompletionReason::PageLimit
        } else if explicit_zero_results {
            ResearchSearchCompletionReason::ExplicitZeroResults
        } else if partial || !source_exhausted {
            ResearchSearchCompletionReason::PartialFailure
        } else {
            ResearchSearchCompletionReason::SourceExhausted
        };
        let (code, message) = match completion_reason {
            ResearchSearchCompletionReason::ResultLimit => (
                "SIDERA_RESEARCH_SEARCH_RESULT_LIMIT_REACHED",
                "已达到本次过滤、规范化和去重后的候选目标。",
            ),
            ResearchSearchCompletionReason::PageLimit => (
                "SIDERA_RESEARCH_SEARCH_PAGE_LIMIT_REACHED",
                "已达到 Rust 管理的分页安全上限；结果保持截断状态。",
            ),
            ResearchSearchCompletionReason::ExplicitZeroResults => (
                "SIDERA_RESEARCH_SEARCH_COMPLETE_EMPTY",
                "官方结果页明确返回零结果。",
            ),
            ResearchSearchCompletionReason::SourceExhausted => (
                "SIDERA_RESEARCH_SEARCH_SOURCE_EXHAUSTED",
                "机构来源分页已耗尽。",
            ),
            _ => (
                "SIDERA_RESEARCH_SEARCH_SOURCE_PARTIAL",
                "来源返回了可验证候选，但部分页面或记录无法确认。",
            ),
        };
        store_research_connector_result(
            runtime,
            task_id,
            LiteratureConnectorSearchResult {
                connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                connector_version: "whu-academic-discovery-v1-dom-fallback".to_string(),
                transport: LiteratureConnectorTransport::DomFallback,
                observed_transport: None,
                source_id: "whu-academic-discovery".to_string(),
                source_name: "武汉大学统一学术发现".to_string(),
                pages_scanned: collection.pages_scanned,
                explicit_zero_results,
                partial: partial
                    || collection.page_limit_reached
                    || completion_reason == ResearchSearchCompletionReason::PartialFailure,
                code: code.to_string(),
                message: message.to_string(),
                records: transport_records,
                retrieval_positions,
                total_hits: None,
                has_more: if source_exhausted { Some(false) } else { None },
                completion_reason,
            },
        );
    }
    if batches.is_empty() {
        if explicit_zero_results {
            finish_search_success(app, runtime, task_id, vec![], vec![], false, true);
            return Ok(());
        }
        if !source_states.is_empty() {
            finish_search_success(app, runtime, task_id, source_states, vec![], true, false);
            return Ok(());
        }
        return Err((
            "SIDERA_INSTITUTION_ADAPTER_DRIFT",
            "统一学术发现返回了页面内容，但没有可归属来源的论文候选或过滤诊断。",
        ));
    }
    finish_search_success(
        app,
        runtime,
        task_id,
        source_states,
        batches,
        partial,
        false,
    );
    Ok(())
}

async fn apply_academic_resource_filters(
    app: &AppHandle,
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<AcademicFacetMode, (&'static str, &'static str)> {
    update_search_stage(
        app,
        runtime,
        task_id,
        SideraInstitutionSearchStage::FacetProcessing,
        "SIDERA_INSTITUTION_ACADEMIC_FACET_PROCESSING",
        "官方网页结果可用；正在确认文章、会议论文和学位论文分面。",
    );
    let started = tokio::time::Instant::now();
    let mut paused = Duration::ZERO;
    let mut pending_signature: Option<String> = None;
    while started.elapsed().saturating_sub(paused) < Duration::from_secs(25) {
        assert_task_current(runtime, task_id)?;
        paused = paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
        let payload =
            eval_with_timeout(webview, ACADEMIC_FILTER_SCRIPT, Duration::from_secs(5)).await?;
        if task_is_awaiting_discovery_auth(runtime, task_id) {
            paused =
                paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
            continue;
        }
        validate_institution_extraction_payload(&payload)
            .map_err(|code| (code, "统一发现筛选回执超过安全上限。"))?;
        let receipt: AcademicFilterReceipt = serde_json::from_str(&payload).map_err(|_| {
            (
                "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
                "统一发现资源类型筛选回执无法识别。",
            )
        })?;
        if pending_signature
            .as_deref()
            .is_some_and(|signature| signature == receipt.page_signature)
        {
            tokio::time::sleep(Duration::from_millis(350)).await;
            continue;
        }
        pending_signature = None;
        match receipt.action.as_str() {
            "complete" if receipt.filters.len() == 3 => return Ok(AcademicFacetMode::Combined),
            "sequential-required" if receipt.available_filters.len() == 3 => {
                update_search_stage(
                    app,
                    runtime,
                    task_id,
                    SideraInstitutionSearchStage::FacetProcessing,
                    "SIDERA_INSTITUTION_ACADEMIC_SEQUENTIAL_FACETS",
                    "真实控件不能可靠同时选择三类；正在按文章、会议论文、学位论文顺序执行受控子检索。",
                );
                return Ok(AcademicFacetMode::Sequential);
            }
            "clicked" => {
                if receipt.page_signature.is_empty() || receipt.target.is_none() {
                    return Err((
                        "SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED",
                        "统一发现分面点击缺少页面签名或目标标识。",
                    ));
                }
                pending_signature = Some(receipt.page_signature);
                tokio::time::sleep(Duration::from_millis(350)).await;
            }
            "loading" => tokio::time::sleep(Duration::from_millis(500)).await,
            _ => {
                return Err((
                    "SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED",
                    "Sidera 未能确认统一发现已自动限定文章、会议论文和学位论文；不会把仅靠结果后过滤冒充网页筛选成功。",
                ));
            }
        }
    }
    Err((
        "SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED",
        "统一发现资源类型筛选未在限定时间内完成。",
    ))
}

async fn wait_for_academic_result_webview(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<Webview, (&'static str, &'static str)> {
    let started = tokio::time::Instant::now();
    let mut paused = Duration::ZERO;
    while started.elapsed().saturating_sub(paused) < ACADEMIC_RESULT_WEBVIEW_TIMEOUT {
        assert_task_current(runtime, task_id)?;
        paused = paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
        let label = {
            let guard = runtime
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard
                .academic_result_webview
                .as_ref()
                .filter(|binding| binding.ready && binding.is_current_for(&guard, task_id))
                .map(|binding| binding.label.clone())
        };
        if let Some(label) = label {
            if let Some(webview) = app.get_webview(&label) {
                return Ok(webview);
            }
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    Err((
        "SIDERA_INSTITUTION_RESULT_WEBVIEW_UNAVAILABLE",
        "统一发现没有在同一隔离 UDF 中创建任务绑定结果面；未产生原生快照。",
    ))
}

async fn apply_single_academic_filter(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    facet_id: &'static str,
) -> Result<bool, (&'static str, &'static str)> {
    let script = ACADEMIC_SINGLE_FILTER_SCRIPT.replace("__SIDERA_FILTER_ID__", facet_id);
    let started = tokio::time::Instant::now();
    let mut paused = Duration::ZERO;
    let mut pending_signature: Option<String> = None;
    let mut clicked = false;
    while started.elapsed().saturating_sub(paused) < Duration::from_secs(25) {
        assert_task_current(runtime, task_id)?;
        paused = paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
        let payload = eval_with_timeout(webview, &script, Duration::from_secs(5)).await?;
        if task_is_awaiting_discovery_auth(runtime, task_id) {
            paused =
                paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
            continue;
        }
        validate_institution_extraction_payload(&payload)
            .map_err(|code| (code, "统一发现单分面回执超过安全上限。"))?;
        let receipt: AcademicFilterReceipt = serde_json::from_str(&payload).map_err(|_| {
            (
                "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
                "统一发现单分面回执无法识别。",
            )
        })?;
        if pending_signature
            .as_deref()
            .is_some_and(|signature| signature == receipt.page_signature)
        {
            tokio::time::sleep(Duration::from_millis(350)).await;
            continue;
        }
        pending_signature = None;
        match receipt.action.as_str() {
            "complete" if receipt.filters.len() == 1 && receipt.filters[0].as_str() == facet_id => {
                return Ok(clicked)
            }
            "clicked" => {
                if receipt.page_signature.is_empty() || receipt.target.is_none() {
                    break;
                }
                clicked = true;
                pending_signature = Some(receipt.page_signature);
                tokio::time::sleep(Duration::from_millis(350)).await;
            }
            "loading" => tokio::time::sleep(Duration::from_millis(500)).await,
            _ => break,
        }
    }
    Err((
        "SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED",
        "统一发现无法确认当前顺序子检索只选择了目标论文类型。",
    ))
}

async fn wait_for_academic_result_change(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    before_signature: &str,
    query: &str,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    wait_for_submitted_academic_result(
        webview,
        runtime,
        task_id,
        before_signature,
        query,
        Duration::from_secs(25),
    )
    .await
}

async fn collect_sequential_academic_facets(
    app: &AppHandle,
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    query: &str,
    progress: &mut AcademicCollectionProgress,
) -> Result<(Vec<CollectedAcademicPage>, bool), (&'static str, &'static str)> {
    let mut pages = Vec::new();
    let facets = requested_academic_facets(progress.request.as_ref());
    let facet_count = facets.len();
    let mut all_facets_exhausted = true;
    for (facet_index, facet_id) in facets.into_iter().enumerate() {
        if progress.limit_reached || progress.global_budget_reached() {
            if !progress.limit_reached {
                progress.page_limit_reached = true;
            }
            all_facets_exhausted = false;
            break;
        }
        let _ = wait_while_discovery_auth_active(runtime, task_id).await?;
        let before = inspect_academic_page_read_only(webview, runtime, task_id).await?;
        let clicked = apply_single_academic_filter(webview, runtime, task_id, facet_id).await?;
        let page = if clicked {
            wait_for_academic_result_change(
                webview,
                runtime,
                task_id,
                &before.page_signature,
                query,
            )
            .await?
        } else {
            let page = inspect_academic_page_read_only(webview, runtime, task_id).await?;
            if !matches!(page.kind.as_str(), "records" | "zero-results") {
                return Err((
                    "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                    "顺序子检索分面已确认，但当前结果结构无法抽取。",
                ));
            }
            page
        };
        let message = match facet_id {
            "article" => "文章子检索已确认；正在抽取受控分页结果。",
            "conference-paper" => "会议论文子检索已确认；正在抽取受控分页结果。",
            _ => "学位论文子检索已确认；正在抽取受控分页结果。",
        };
        update_search_stage(
            app,
            runtime,
            task_id,
            SideraInstitutionSearchStage::Extracting,
            "SIDERA_INSTITUTION_ACADEMIC_EXTRACTING",
            message,
        );
        // Preserve a fair share of the Rust-owned global page budget for every
        // remaining mutually exclusive facet. Without this scope budget the
        // first facet can consume all 20 pages and later requested types never
        // execute.
        let facet_page_budget =
            progress.fair_sequential_facet_budget(facet_count.saturating_sub(facet_index));
        let (facet_pages, exhausted) = collect_academic_pages(
            webview,
            runtime,
            task_id,
            query,
            page,
            Some(facet_id.to_string()),
            false,
            Some(facet_page_budget),
            progress,
        )
        .await?;
        pages.extend(facet_pages);
        all_facets_exhausted &= exhausted;
        if progress.limit_reached {
            all_facets_exhausted = false;
            break;
        }
        if progress.global_budget_reached() && facet_index.saturating_add(1) < facet_count {
            progress.page_limit_reached = true;
            all_facets_exhausted = false;
            break;
        }
    }
    Ok((pages, all_facets_exhausted))
}

#[derive(Clone, Debug)]
enum StructuredPaginationBasis {
    DomFallback,
    Exhausted,
    Expected {
        page_number: usize,
        previous_identity: String,
    },
}

fn begin_structured_pagination(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<StructuredPaginationBasis, (&'static str, &'static str)> {
    let mut guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(binding) = guard.academic_result_webview.clone() else {
        return Err((
            "SIDERA_RESEARCH_SEARCH_CANCELLED",
            "结构化分页所属的结果窗口已失效。",
        ));
    };
    if !binding.is_current_for(&guard, task_id) {
        return Err((
            "SIDERA_RESEARCH_SEARCH_CANCELLED",
            "结构化分页任务已被更新的检索替代。",
        ));
    }
    let Some(run) = guard.legacy_academic_transport.as_mut() else {
        return Err(("SIDERA_RESEARCH_SEARCH_CANCELLED", "结构化分页任务已结束。"));
    };
    if run.token.task_id != task_id {
        return Err((
            "SIDERA_RESEARCH_SEARCH_CANCELLED",
            "结构化分页任务已被更新的检索替代。",
        ));
    }
    if run.structured.pages.is_empty() {
        return Ok(StructuredPaginationBasis::DomFallback);
    }
    if run.structured.failure_code.is_some() {
        return Err((
            "SIDERA_RESEARCH_SEARCH_STRUCTURED_PARTIAL",
            "结构化分页在已验证页面之后失效。",
        ));
    }
    let previous_page = run
        .structured
        .pages
        .last()
        .cloned()
        .expect("non-empty structured page list must have a last page");
    if previous_page.has_more == Some(false) {
        return Ok(StructuredPaginationBasis::Exhausted);
    }
    let Some(current_page_number) = previous_page.page_number else {
        run.structured.failure_code = Some(STRUCTURED_PAGINATION_METADATA_MISSING.to_string());
        return Err((
            STRUCTURED_PAGINATION_METADATA_MISSING,
            "官方结构化响应缺少可验证的当前页元数据。",
        ));
    };
    let expected_page_number = current_page_number.saturating_add(1);
    let previous_identity = previous_page.page_identity.clone();
    run.structured.pending_pagination = Some(StructuredPaginationExpectation {
        task_id: binding.task_id,
        epoch: binding.epoch,
        task_sequence: binding.task_sequence,
        webview_generation: binding.webview_generation,
        expected_page_number,
        previous_page,
    });
    Ok(StructuredPaginationBasis::Expected {
        page_number: expected_page_number,
        previous_identity,
    })
}

fn fail_structured_pagination(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    code: &'static str,
) {
    let mut guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(run) = guard.legacy_academic_transport.as_mut() {
        if run.token.task_id == task_id && !run.structured.pages.is_empty() {
            run.structured
                .failure_code
                .get_or_insert_with(|| code.to_string());
            run.structured.pending_pagination = None;
        }
    }
}

fn clear_structured_pagination_expectation(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) {
    let mut guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(run) = guard.legacy_academic_transport.as_mut() {
        if run.token.task_id == task_id {
            run.structured.pending_pagination = None;
        }
    }
}

async fn wait_for_structured_pagination_advance(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    previous_identity: &str,
) -> Result<(), (&'static str, &'static str)> {
    for _ in 0..80_u8 {
        assert_task_current(runtime, task_id)?;
        let state = {
            let guard = runtime
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some(run) = guard.legacy_academic_transport.as_ref() else {
                return Err(("SIDERA_RESEARCH_SEARCH_CANCELLED", "结构化分页任务已结束。"));
            };
            if let Some(code) = run.structured.failure_code.as_deref() {
                Some(Err(code.to_string()))
            } else if run
                .structured
                .pages
                .last()
                .is_some_and(|page| page.page_identity != previous_identity)
                && run.structured.pending_pagination.is_none()
            {
                Some(Ok(()))
            } else {
                None
            }
        };
        match state {
            Some(Ok(())) => return Ok(()),
            Some(Err(code)) if code == STRUCTURED_PAGINATION_REGRESSED => {
                return Err((
                    STRUCTURED_PAGINATION_REGRESSED,
                    "官方结构化响应未按预期页码向前推进。",
                ));
            }
            Some(Err(code)) if code == STRUCTURED_PAGINATION_METADATA_MISSING => {
                return Err((
                    STRUCTURED_PAGINATION_METADATA_MISSING,
                    "新结构化页面缺少可验证的分页元数据。",
                ));
            }
            Some(Err(_)) => {
                return Err((
                    "SIDERA_RESEARCH_SEARCH_STRUCTURED_PARTIAL",
                    "结构化分页在后续页面失效。",
                ));
            }
            None => tokio::time::sleep(Duration::from_millis(125)).await,
        }
    }
    fail_structured_pagination(runtime, task_id, STRUCTURED_PAGINATION_STALLED);
    Err((
        STRUCTURED_PAGINATION_STALLED,
        "分页点击后未收到严格向前推进的新结构化页面。",
    ))
}

async fn collect_academic_pages(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    query: &str,
    first_page: SideraInstitutionAdapterPage,
    facet: Option<String>,
    first_page_already_scanned: bool,
    scope_page_budget: Option<usize>,
    progress: &mut AcademicCollectionProgress,
) -> Result<(Vec<CollectedAcademicPage>, bool), (&'static str, &'static str)> {
    let mut pages = Vec::new();
    let mut current_page = first_page;
    let mut current_page_already_scanned = first_page_already_scanned;
    let mut exhausted = false;
    loop {
        assert_task_current(runtime, task_id)?;
        let _ = wait_while_discovery_auth_active(runtime, task_id).await?;
        if progress.global_budget_reached() {
            progress.page_limit_reached = true;
            break;
        }
        if current_page_already_scanned {
            progress.observe_records(&current_page);
        } else {
            progress.observe(&current_page);
            store_research_pages_scanned(runtime, task_id, progress.pages_scanned);
        }
        synchronize_academic_progress_from_structured(runtime, task_id, progress);
        let zero_results =
            current_page.kind == "zero-results" || current_page.explicit_zero_results;
        pages.push(CollectedAcademicPage {
            page: current_page.clone(),
            // This is the observed remote page inside the active facet. The
            // unfiltered submission page and previously visited facets still
            // count toward pagesScanned, but must not shift this coordinate.
            page_number: pages.len().saturating_add(1),
            facet: facet.clone(),
        });
        current_page_already_scanned = false;
        if zero_results {
            exhausted = true;
            break;
        }
        if progress.limit_reached {
            break;
        }
        if progress.scope_budget_reached(pages.len(), scope_page_budget) {
            match begin_structured_pagination(runtime, task_id)? {
                StructuredPaginationBasis::Exhausted => exhausted = true,
                StructuredPaginationBasis::Expected { .. } => {
                    // The official response confirms that another page exists,
                    // but this facet has consumed its fair share of the global
                    // budget. Do not click or infer remote exhaustion.
                    clear_structured_pagination_expectation(runtime, task_id);
                    progress.page_limit_reached = true;
                }
                StructuredPaginationBasis::DomFallback => {
                    let receipt = inspect_academic_next_page(webview).await?;
                    match receipt.action.as_str() {
                        "complete" => exhausted = true,
                        "available" => progress.page_limit_reached = true,
                        _ => {
                            return Err((
                                "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                                "统一发现分页可用性状态无法确认。",
                            ));
                        }
                    }
                }
            }
            break;
        }
        let pagination_basis = begin_structured_pagination(runtime, task_id)?;
        if matches!(pagination_basis, StructuredPaginationBasis::Exhausted) {
            exhausted = true;
            break;
        }
        let (expected_page, structured_previous_identity) = match &pagination_basis {
            StructuredPaginationBasis::Expected {
                page_number,
                previous_identity,
            } => (*page_number, Some(previous_identity.clone())),
            StructuredPaginationBasis::DomFallback => (pages.len().saturating_add(1), None),
            StructuredPaginationBasis::Exhausted => unreachable!(),
        };
        let receipt = match advance_academic_next_page(
            webview,
            expected_page,
            structured_previous_identity.is_some(),
        )
        .await
        {
            Ok(receipt) => receipt,
            Err(error) => {
                if structured_previous_identity.is_some() {
                    fail_structured_pagination(runtime, task_id, error.0);
                }
                return Err(error);
            }
        };
        match receipt.action.as_str() {
            "complete" => {
                exhausted = true;
                break;
            }
            "clicked" if !receipt.page_signature.is_empty() => {
                if let Some(previous_identity) = structured_previous_identity.as_deref() {
                    wait_for_structured_pagination_advance(runtime, task_id, previous_identity)
                        .await?;
                    // The accepted official response is the authoritative page
                    // advance. Waiting up to another 25 seconds for the legacy DOM
                    // signature wastes the bounded 90-second activity budget
                    // and can cancel the next XHR before its response arrives.
                    current_page_already_scanned = true;
                } else {
                    current_page = wait_for_academic_result_change(
                        webview,
                        runtime,
                        task_id,
                        &receipt.page_signature,
                        query,
                    )
                    .await?;
                }
            }
            _ => {
                return Err((
                    "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                    "统一发现分页控件存在但状态无法确认。",
                ));
            }
        }
    }
    Ok((pages, exhausted))
}

fn academic_pagination_click_point(
    diagnostics: &AcademicPaginationDiagnostics,
) -> Option<(f64, f64)> {
    let x = diagnostics.click_x?;
    let y = diagnostics.click_y?;
    let width = diagnostics.viewport_width?;
    let height = diagnostics.viewport_height?;
    if !diagnostics.hit_test_matches
        || !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
        || width > 32_768.0
        || height > 32_768.0
        || x < 0.0
        || y < 0.0
        || x >= width
        || y >= height
    {
        return None;
    }
    Some((x, y))
}

#[cfg(windows)]
async fn dispatch_academic_pagination_mouse_event(
    webview: &Webview,
    kind: crate::sidera_institution_protocol::WebView2MouseEventKind,
    x: f64,
    y: f64,
) -> Result<(), (&'static str, &'static str)> {
    use crate::sidera_institution_protocol::{
        dispatch_primary_mouse_event, InstitutionProtocolError,
    };

    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let callback_sender = sender.clone();
    let immediate_sender = sender.clone();
    webview
        .with_webview(move |platform| unsafe {
            let result = platform
                .controller()
                .CoreWebView2()
                .map_err(|_| InstitutionProtocolError::WebView2Failure)
                .and_then(|core| {
                    dispatch_primary_mouse_event(&core, kind, x, y, move |result| {
                        if let Some(sender) = callback_sender
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner())
                            .take()
                        {
                            let _ = sender.send(result);
                        }
                    })
                });
            if let Err(error) = result {
                if let Some(sender) = immediate_sender
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .take()
                {
                    let _ = sender.send(Err(error));
                }
            }
        })
        .map_err(|_| {
            (
                STRUCTURED_PAGINATION_STALLED,
                "已定位官方分页控件，但无法访问机构 WebView2 输入通道。",
            )
        })?;
    tokio::time::timeout(Duration::from_secs(3), receiver)
        .await
        .map_err(|_| {
            (
                STRUCTURED_PAGINATION_STALLED,
                "官方分页浏览器级输入在限定时间内未完成。",
            )
        })?
        .map_err(|_| {
            (
                STRUCTURED_PAGINATION_STALLED,
                "官方分页浏览器级输入回调已取消。",
            )
        })?
        .map_err(|_| {
            (
                STRUCTURED_PAGINATION_STALLED,
                "官方分页浏览器级输入执行失败。",
            )
        })
}

#[cfg(windows)]
async fn dispatch_academic_pagination_click(
    webview: &Webview,
    diagnostics: &AcademicPaginationDiagnostics,
) -> Result<(), (&'static str, &'static str)> {
    use crate::sidera_institution_protocol::WebView2MouseEventKind;

    let Some((x, y)) = academic_pagination_click_point(diagnostics) else {
        return Err((
            STRUCTURED_PAGINATION_CONTROL_MISSING,
            "官方分页控件的浏览器视口坐标无法安全确认。",
        ));
    };
    dispatch_academic_pagination_mouse_event(webview, WebView2MouseEventKind::Moved, x, y).await?;
    dispatch_academic_pagination_mouse_event(webview, WebView2MouseEventKind::Pressed, x, y)
        .await?;
    dispatch_academic_pagination_mouse_event(webview, WebView2MouseEventKind::Released, x, y).await
}

async fn advance_academic_next_page(
    webview: &Webview,
    expected_page: usize,
    structured_page_required: bool,
) -> Result<AcademicNextPageReceipt, (&'static str, &'static str)> {
    const DISCOVERY_ATTEMPTS: usize = 4;
    let mut first_pending_signature = None::<String>;
    let mut last_diagnostics = AcademicPaginationDiagnostics::default();
    for attempt in 0..DISCOVERY_ATTEMPTS {
        let script = ACADEMIC_NEXT_PAGE_SCRIPT
            .replace(
                "__SIDERA_EXPECTED_NEXT_PAGE__",
                &expected_page.max(1).to_string(),
            )
            .replace(
                "__SIDERA_LOCATE_FOR_NATIVE_INPUT__",
                if cfg!(windows) && structured_page_required {
                    "true"
                } else {
                    "false"
                },
            );
        let payload = eval_with_timeout(webview, &script, Duration::from_secs(5)).await?;
        validate_institution_extraction_payload(&payload)
            .map_err(|code| (code, "统一发现分页回执超过安全上限。"))?;
        let mut receipt: AcademicNextPageReceipt =
            serde_json::from_str(&payload).map_err(|_| {
                (
                    "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
                    "统一发现分页回执无法识别。",
                )
            })?;
        #[cfg(windows)]
        trace_r6_pagination_receipt(attempt, &receipt);
        last_diagnostics = receipt.diagnostics.clone();
        if receipt.action == "located" {
            #[cfg(windows)]
            {
                dispatch_academic_pagination_click(webview, &receipt.diagnostics).await?;
                receipt.action = "clicked".to_string();
                return Ok(receipt);
            }
            #[cfg(not(windows))]
            {
                return Err((
                    STRUCTURED_PAGINATION_CONTROL_MISSING,
                    "当前平台不支持机构页面的浏览器级分页输入。",
                ));
            }
        }
        if receipt.action != "pending" {
            return Ok(receipt);
        }
        match first_pending_signature.as_deref() {
            Some(before) if !structured_page_required && before != receipt.page_signature => {
                receipt.action = "clicked".to_string();
                receipt.page_signature = before.to_string();
                return Ok(receipt);
            }
            None => first_pending_signature = Some(receipt.page_signature.clone()),
            _ => {}
        }
        if attempt + 1 < DISCOVERY_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(350)).await;
        }
    }
    if structured_page_required {
        Err((
            STRUCTURED_PAGINATION_CONTROL_MISSING,
            "官方结构化响应表示仍有后续结果，但页面内未找到受控分页入口。",
        ))
    } else {
        Ok(AcademicNextPageReceipt {
            action: "complete".to_string(),
            page_signature: first_pending_signature.unwrap_or_default(),
            diagnostics: last_diagnostics,
        })
    }
}

async fn inspect_academic_next_page(
    webview: &Webview,
) -> Result<AcademicNextPageReceipt, (&'static str, &'static str)> {
    let payload = eval_with_timeout(
        webview,
        ACADEMIC_NEXT_PAGE_INSPECT_SCRIPT,
        Duration::from_secs(5),
    )
    .await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "统一发现分页可用性回执超过安全上限。"))?;
    serde_json::from_str(&payload).map_err(|_| {
        (
            "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
            "统一发现分页可用性回执无法识别。",
        )
    })
}

async fn run_catalog_search(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    webview: &Webview,
    task_id: &str,
    query: &str,
) -> Result<(), (&'static str, &'static str)> {
    assert_task_current(runtime, task_id)?;
    let entry = Url::parse(WHU_CATALOG_ENTRY_URL).map_err(|_| {
        (
            "SIDERA_INSTITUTION_ADAPTER_INVALID",
            "馆藏检索入口配置无效。",
        )
    })?;
    webview.navigate(entry).map_err(|_| {
        (
            "SIDERA_INSTITUTION_NAVIGATION_FAILED",
            "无法进入武大馆藏多库检索入口。",
        )
    })?;
    let form_page = wait_for_page_kind(
        webview,
        runtime,
        task_id,
        &["search-form"],
        Duration::from_secs(20),
    )
    .await?;
    if form_page.page_signature.is_empty() {
        return Err((
            "SIDERA_INSTITUTION_ADAPTER_DRIFT",
            "馆藏检索表单缺少页面签名；适配器需要更新。",
        ));
    }
    let submission = submit_catalog_query(webview, query).await?;
    if submission.page_signature != form_page.page_signature {
        return Err((
            "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
            "馆藏页面在提交前发生变化，当前检索未继续；请重试。",
        ));
    }
    let summary = wait_for_submitted_search_result(
        webview,
        runtime,
        task_id,
        &form_page.page_signature,
        query,
        Duration::from_secs(30),
    )
    .await?;

    if summary.kind == "zero-results" || summary.explicit_zero_results {
        let source_buckets = summary
            .buckets
            .iter()
            .map(|bucket| source_bucket(bucket, 0, "complete", None))
            .collect();
        finish_search_success(app, runtime, task_id, source_buckets, vec![], false, true);
        return Ok(());
    }

    if summary.kind == "records" {
        validate_catalog_adapter_records(&summary.records).map_err(|code| {
            if code == "SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE" {
                (code, "馆藏页面把检索导航混入了结果；已拒绝生成伪文献。")
            } else {
                (code, "馆藏结果缺少可验证的真实记录定位；适配器需要更新。")
            }
        })?;
        let normalized = normalize_catalog_adapter_records("馆藏目录", summary.records, now_ms());
        if normalized.items.is_empty() {
            return Err((
                "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                "馆藏页面返回了记录结构，但没有可验证的真实文献。",
            ));
        }
        finish_search_success(
            app,
            runtime,
            task_id,
            vec![],
            vec![normalized],
            false,
            false,
        );
        return Ok(());
    }

    let buckets = summary
        .buckets
        .into_iter()
        .filter(|bucket| is_whu_catalog_result_url(&bucket.href))
        .take(2)
        .collect::<Vec<_>>();
    if buckets.is_empty() {
        return Err((
            "SIDERA_INSTITUTION_ADAPTER_DRIFT",
            "已提交检索，但未识别到合法的来源桶；适配器需要更新。",
        ));
    }

    let all_zero = buckets.iter().all(|bucket| bucket.count == Some(0));
    if all_zero {
        let source_buckets = buckets
            .into_iter()
            .map(|bucket| source_bucket(&bucket, 0, "complete", None))
            .collect();
        finish_search_success(app, runtime, task_id, source_buckets, vec![], false, true);
        return Ok(());
    }

    let mut source_states = Vec::new();
    let mut batches = Vec::new();
    let mut partial = false;
    for bucket in buckets {
        assert_task_current(runtime, task_id)?;
        let label = if bucket.label.trim().is_empty() {
            "未标明来源".to_string()
        } else {
            bucket.label.trim().chars().take(80).collect::<String>()
        };
        let page = if let Some(url) = Url::parse(&bucket.href)
            .ok()
            .filter(|url| is_whu_catalog_result_url(url.as_str()))
        {
            if webview.navigate(url).is_ok() {
                wait_for_page_kind(
                    webview,
                    runtime,
                    task_id,
                    &["records"],
                    Duration::from_secs(20),
                )
                .await
            } else {
                Err((
                    "SIDERA_INSTITUTION_BUCKET_NAVIGATION_FAILED",
                    "无法进入该来源桶。",
                ))
            }
        } else {
            Err((
                "SIDERA_INSTITUTION_BUCKET_URL_REJECTED",
                "来源桶链接未通过连接器白名单。",
            ))
        };
        match page {
            Ok(page) => {
                if let Err(code) = validate_catalog_adapter_records(&page.records) {
                    partial = true;
                    source_states.push(source_bucket(&bucket, 0, "failed", Some(code)));
                    continue;
                }
                let normalized = normalize_catalog_adapter_records(&label, page.records, now_ms());
                if normalized.items.is_empty() && bucket.count != Some(0) {
                    partial = true;
                    source_states.push(source_bucket(
                        &bucket,
                        0,
                        "failed",
                        Some("SIDERA_INSTITUTION_ADAPTER_DRIFT"),
                    ));
                    continue;
                }
                source_states.push(source_bucket(
                    &bucket,
                    normalized.items.len(),
                    "complete",
                    None,
                ));
                batches.push(normalized);
            }
            Err((code, _message)) => {
                partial = true;
                source_states.push(source_bucket(&bucket, 0, "failed", Some(code)));
            }
        }
    }
    if batches.is_empty() {
        return Err((
            "SIDERA_INSTITUTION_ADAPTER_DRIFT",
            "来源桶存在记录，但未提取到任何可验证的真实文献。",
        ));
    }
    finish_search_success(
        app,
        runtime,
        task_id,
        source_states,
        batches,
        partial,
        false,
    );
    Ok(())
}

fn source_bucket(
    bucket: &SideraInstitutionAdapterBucket,
    returned: usize,
    status: &str,
    code: Option<&str>,
) -> SideraInstitutionSourceBucket {
    SideraInstitutionSourceBucket {
        id: format!("bucket-{}", short_hash(&bucket.label)),
        label: bucket.label.trim().chars().take(80).collect(),
        count: bucket.count,
        returned,
        status: status.to_string(),
        code: code.map(str::to_string),
    }
}

fn assert_task_current(
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<(), (&'static str, &'static str)> {
    let guard = runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.active_task_id.as_deref() == Some(task_id) {
        Ok(())
    } else {
        Err((
            "SIDERA_INSTITUTION_SEARCH_CANCELLED",
            "机构检索已取消或被较新的任务替代。",
        ))
    }
}

fn read_only_academic_inspection_error_is_retryable(code: &str) -> bool {
    matches!(
        code,
        "SIDERA_INSTITUTION_EVAL_TIMEOUT" | "SIDERA_INSTITUTION_EVAL_CANCELLED"
    )
}

async fn inspect_academic_page_read_only(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let mut attempt = 0_u8;
    loop {
        assert_task_current(runtime, task_id)?;
        attempt = attempt.saturating_add(1);
        match inspect_academic_page(webview).await {
            Ok(page) => return Ok(page),
            Err(error)
                if attempt < ACADEMIC_READ_ONLY_INSPECTION_ATTEMPTS
                    && read_only_academic_inspection_error_is_retryable(error.0) =>
            {
                tokio::time::sleep(Duration::from_millis(120)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

async fn wait_for_academic_page_kind(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    accepted: &[&str],
    timeout: Duration,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let started = tokio::time::Instant::now();
    let mut paused = Duration::ZERO;
    let mut unknown_observations = 0_u8;
    loop {
        assert_task_current(runtime, task_id)?;
        paused = paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
        if started.elapsed().saturating_sub(paused) >= timeout {
            return Err((
                "SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED",
                "统一学术发现入口未进入可识别的论文检索页面；不会回退馆藏目录。",
            ));
        }
        tokio::time::sleep(Duration::from_millis(650)).await;
        let page = inspect_academic_page_read_only(webview, runtime, task_id).await?;
        let host = Url::parse(&page.url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_ascii_lowercase));
        if host.as_deref() == Some("opac.lib.whu.edu.cn") {
            return Err((
                "SIDERA_INSTITUTION_DISCOVERY_ROUTE_UNRESOLVED",
                "当前入口落到了馆藏目录，而不是统一学术发现；已停止论文检索。",
            ));
        }
        match page.kind.as_str() {
            "login-required" | "expired" => {
                return Err((
                    "SIDERA_INSTITUTION_LOGIN_REQUIRED",
                    "统一学术发现会话需要在当前内嵌页面完成机构登录。",
                ));
            }
            "service-error" => {
                return Err((
                    "SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR",
                    "统一学术发现服务当前返回异常。",
                ));
            }
            kind if accepted.contains(&kind) => return Ok(page),
            "unknown" => {
                unknown_observations = unknown_observations.saturating_add(1);
                if unknown_observations >= 4 {
                    return Err((
                        "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                        "统一学术发现页面结构与 whu-academic-discovery-v1 不一致。",
                    ));
                }
            }
            _ => unknown_observations = 0,
        }
    }
}

async fn wait_for_submitted_academic_result(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    before_signature: &str,
    query: &str,
    timeout: Duration,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let started = tokio::time::Instant::now();
    let mut paused = Duration::ZERO;
    let mut unchanged_observations = 0_u8;
    let mut unknown_observations = 0_u8;
    let mut last_unknown_signature = String::new();
    loop {
        assert_task_current(runtime, task_id)?;
        paused = paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
        if started.elapsed().saturating_sub(paused) >= timeout {
            return Err((
                "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
                "统一学术发现未进入与当前查询对应的结果页。",
            ));
        }
        tokio::time::sleep(Duration::from_millis(650)).await;
        let page = inspect_academic_page_read_only(webview, runtime, task_id).await?;
        if task_is_awaiting_discovery_auth(runtime, task_id) {
            paused =
                paused.saturating_add(wait_while_discovery_auth_active(runtime, task_id).await?);
            continue;
        }
        match page.kind.as_str() {
            "login-required" | "expired" => {
                return Err((
                    "SIDERA_INSTITUTION_LOGIN_REQUIRED",
                    "统一学术发现会话需要重新登录。",
                ));
            }
            "service-error" => {
                return Err((
                    "SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR",
                    "统一学术发现服务当前返回异常。",
                ));
            }
            "records" | "zero-results" => {
                if adapter_page_confirms_query_submission(&page, before_signature, query) {
                    return Ok(page);
                }
                unchanged_observations = unchanged_observations.saturating_add(1);
                unknown_observations = 0;
            }
            "search-form" => {
                unchanged_observations = unchanged_observations.saturating_add(1);
                unknown_observations = 0;
            }
            "unknown" => {
                // Primo is an Angular shell: NavigationCompleted can precede the
                // first result container by several seconds.  Treat an unknown DOM
                // as loading until the same page signature remains stable across a
                // bounded series of observations; a single empty shell must never
                // terminate a real query.
                if page.page_signature == last_unknown_signature {
                    unknown_observations = unknown_observations.saturating_add(1);
                } else {
                    last_unknown_signature = page.page_signature.clone();
                    unknown_observations = 1;
                }
                unchanged_observations = 0;
                if unknown_observations >= 12 {
                    return Err((
                        "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                        "查询提交后的统一学术发现页面结构持续无法识别。",
                    ));
                }
            }
            _ => {
                unknown_observations = 0;
            }
        }
        if unchanged_observations >= 12 {
            return Err((
                "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
                "统一学术发现页面未确认当前查询已真实提交；不会复用旧结果。",
            ));
        }
    }
}

async fn wait_for_page_kind(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    accepted: &[&str],
    timeout: Duration,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let started = tokio::time::Instant::now();
    let mut unknown_observations = 0_u8;
    loop {
        assert_task_current(runtime, task_id)?;
        if started.elapsed() >= timeout {
            return Err((
                "SIDERA_INSTITUTION_PAGE_TIMEOUT",
                "机构页面在限定时间内未进入可提取状态。",
            ));
        }
        tokio::time::sleep(Duration::from_millis(650)).await;
        let page = inspect_adapter_page(webview).await?;
        let (session, code) = classify_adapter_page(&page);
        match session {
            SideraInstitutionSessionStatus::LoginRequired => {
                return Err((code, "机构会话需要重新登录；请打开内嵌官方页面完成登录。"));
            }
            SideraInstitutionSessionStatus::Expired => {
                return Err((code, "机构会话已失效；请重新登录后再检索。"));
            }
            SideraInstitutionSessionStatus::Failed if page.kind == "service-error" => {
                return Err((code, "武大馆藏服务当前返回异常。"));
            }
            _ => {}
        }
        if accepted.iter().any(|kind| page.kind == *kind) {
            return Ok(page);
        }
        if page.kind == "unknown" {
            unknown_observations = unknown_observations.saturating_add(1);
            if unknown_observations >= 4 {
                return Err((
                    "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                    "机构页面结构与 whu-catalog-multidb-v2 不一致；适配器需要更新。",
                ));
            }
        } else {
            unknown_observations = 0;
        }
    }
}

async fn wait_for_submitted_search_result(
    webview: &Webview,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    before_signature: &str,
    query: &str,
    timeout: Duration,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let started = tokio::time::Instant::now();
    let mut unchanged_observations = 0_u8;
    loop {
        assert_task_current(runtime, task_id)?;
        if started.elapsed() >= timeout {
            return Err((
                "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
                "馆藏检索表单未进入与当前查询对应的结果页；本次检索未产生结果。",
            ));
        }
        tokio::time::sleep(Duration::from_millis(650)).await;
        let page = inspect_adapter_page(webview).await?;
        let (session, code) = classify_adapter_page(&page);
        match session {
            SideraInstitutionSessionStatus::LoginRequired => {
                return Err((code, "机构会话需要重新登录；请在内嵌官方页面完成登录。"));
            }
            SideraInstitutionSessionStatus::Expired => {
                return Err((code, "机构会话已失效；请重新登录后再检索。"));
            }
            SideraInstitutionSessionStatus::Failed if page.kind == "service-error" => {
                return Err((code, "武大馆藏服务当前返回异常。"));
            }
            _ => {}
        }

        if matches!(
            page.kind.as_str(),
            "records" | "bucket-summary" | "zero-results"
        ) {
            if page.kind == "records" {
                validate_catalog_adapter_records(&page.records).map_err(|code| {
                    if code == "SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE" {
                        (code, "馆藏页面把检索导航混入了结果；已拒绝生成伪文献。")
                    } else {
                        (code, "馆藏结果缺少可验证的真实记录定位；适配器需要更新。")
                    }
                })?;
            }
            if adapter_page_confirms_query_submission(&page, before_signature, query) {
                return Ok(page);
            }
            unchanged_observations = unchanged_observations.saturating_add(1);
            if unchanged_observations >= 4 {
                return Err((
                    "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
                    "馆藏页面没有确认当前查询已提交；不会复用旧结果或导航链接。",
                ));
            }
        } else if page.kind == "search-form" {
            unchanged_observations = unchanged_observations.saturating_add(1);
            if unchanged_observations >= 4 {
                return Err((
                    "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
                    "馆藏检索表单仍停留在提交前页面；本次查询没有真正发出。",
                ));
            }
        } else if page.kind == "unknown" {
            return Err((
                "SIDERA_INSTITUTION_ADAPTER_DRIFT",
                "查询提交后页面结构无法识别；适配器需要依据真实结果页更新。",
            ));
        }
    }
}

async fn inspect_adapter_page(
    webview: &Webview,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    inspect_adapter_page_with_timeout(webview, Duration::from_secs(5)).await
}

async fn inspect_adapter_page_with_timeout(
    webview: &Webview,
    timeout: Duration,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let payload = eval_with_timeout(webview, CATALOG_INSPECT_SCRIPT, timeout).await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "机构页面提取载荷超过安全上限，已停止当前任务。"))?;
    serde_json::from_str(&payload).map_err(|_| {
        (
            "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
            "机构页面返回了无法识别的适配器载荷。",
        )
    })
}

async fn inspect_academic_page(
    webview: &Webview,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let payload =
        eval_with_timeout(webview, ACADEMIC_INSPECT_SCRIPT, Duration::from_secs(5)).await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "学术发现页面提取载荷超过上限，已停止当前任务。"))?;
    serde_json::from_str(&payload).map_err(|_| {
        (
            "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
            "学术发现页面返回了无法识别的适配器载荷。",
        )
    })
}

async fn inspect_library_auth_page(
    webview: &Webview,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    inspect_library_auth_page_with_timeout(webview, Duration::from_secs(5)).await
}

async fn inspect_library_auth_page_with_timeout(
    webview: &Webview,
    timeout: Duration,
) -> Result<SideraInstitutionAdapterPage, (&'static str, &'static str)> {
    let payload = eval_with_timeout(webview, LIBRARY_AUTH_INSPECT_SCRIPT, timeout).await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "个人图书馆页面检查载荷超过安全上限。"))?;
    serde_json::from_str(&payload).map_err(|_| {
        (
            "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
            "个人图书馆页面检查结果无法识别。",
        )
    })
}

async fn inspect_discovery_auth_page(
    webview: &Webview,
) -> Result<AcademicDiscoveryAuthInspection, (&'static str, &'static str)> {
    inspect_discovery_auth_page_with_timeout(webview, Duration::from_secs(5)).await
}

async fn inspect_discovery_auth_page_with_timeout(
    webview: &Webview,
    timeout: Duration,
) -> Result<AcademicDiscoveryAuthInspection, (&'static str, &'static str)> {
    let payload = eval_with_timeout(webview, DISCOVERY_AUTH_INSPECT_SCRIPT, timeout).await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "统一发现认证页面检查载荷超过安全上限。"))?;
    let inspection: AcademicDiscoveryAuthInspection =
        serde_json::from_str(&payload).map_err(|_| {
            (
                "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
                "统一发现认证页面检查结果无法识别。",
            )
        })?;
    if inspection.adapter_version != DISCOVERY_AUTH_ADAPTER_VERSION {
        return Err((
            "SIDERA_INSTITUTION_DISCOVERY_AUTH_FAILED",
            "统一发现认证页面检查版本不匹配。",
        ));
    }
    Ok(inspection)
}

async fn submit_catalog_query(
    webview: &Webview,
    query: &str,
) -> Result<SideraInstitutionAdapterSubmission, (&'static str, &'static str)> {
    let encoded = serde_json::to_string(query)
        .map_err(|_| ("SIDERA_INSTITUTION_QUERY_INVALID", "检索词无法安全编码。"))?;
    let script = CATALOG_SUBMIT_SCRIPT.replace("__SIDERA_QUERY__", &encoded);
    let payload = eval_with_timeout(webview, &script, Duration::from_secs(5)).await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "馆藏查询提交回执超过安全上限。"))?;
    let submission: SideraInstitutionAdapterSubmission =
        serde_json::from_str(&payload).map_err(|_| {
            (
                "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
                "馆藏查询提交回执无法识别。",
            )
        })?;
    if submission.action != "submitted" || submission.page_signature.is_empty() {
        return Err((
            "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
            "未识别到可提交的馆藏检索表单；当前查询没有发出。",
        ));
    }
    Ok(submission)
}

async fn submit_academic_query(
    webview: &Webview,
    query: &str,
) -> Result<SideraInstitutionAdapterSubmission, (&'static str, &'static str)> {
    let encoded = serde_json::to_string(query)
        .map_err(|_| ("SIDERA_INSTITUTION_QUERY_INVALID", "检索词无法安全编码。"))?;
    let script = ACADEMIC_SUBMIT_SCRIPT.replace("__SIDERA_QUERY__", &encoded);
    let payload = eval_with_timeout(webview, &script, Duration::from_secs(5)).await?;
    validate_institution_extraction_payload(&payload)
        .map_err(|code| (code, "学术论文查询提交回执超过上限。"))?;
    let submission: SideraInstitutionAdapterSubmission =
        serde_json::from_str(&payload).map_err(|_| {
            (
                "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID",
                "学术论文查询提交回执无法识别。",
            )
        })?;
    if submission.action != "submitted" || submission.page_signature.is_empty() {
        return Err((
            "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED",
            "未识别到可提交的统一学术发现检索框；当前查询没有发出。",
        ));
    }
    Ok(submission)
}

async fn eval_with_timeout(
    webview: &Webview,
    script: &str,
    timeout: Duration,
) -> Result<String, (&'static str, &'static str)> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let callback_sender = sender.clone();
    webview
        .eval_with_callback(script.to_string(), move |value| {
            if let Some(sender) = callback_sender
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .take()
            {
                let _ = sender.send(value);
            }
        })
        .map_err(|_| {
            (
                "SIDERA_INSTITUTION_EVAL_FAILED",
                "无法执行固定版本的机构页面适配器。",
            )
        })?;
    tokio::time::timeout(timeout, receiver)
        .await
        .map_err(|_| {
            (
                "SIDERA_INSTITUTION_EVAL_TIMEOUT",
                "机构页面适配器执行超时。",
            )
        })?
        .map_err(|_| {
            (
                "SIDERA_INSTITUTION_EVAL_CANCELLED",
                "机构页面适配器回调已取消。",
            )
        })
}

#[allow(dead_code)]
async fn resolve_academic_full_text_entry(
    webview: Webview,
    runtime: Arc<Mutex<SideraInstitutionRuntimeInner>>,
    result_open_epoch: u64,
) {
    for _ in 0..20_u8 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let is_current = {
            let guard = runtime
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.result_open_epoch == result_open_epoch
        };
        if !is_current {
            return;
        }

        let Ok(payload) = eval_with_timeout(
            &webview,
            ACADEMIC_FULL_TEXT_RESOLVE_SCRIPT,
            Duration::from_secs(3),
        )
        .await
        else {
            continue;
        };
        let Some(href) = serde_json::from_str::<serde_json::Value>(&payload)
            .ok()
            .and_then(|value| {
                value
                    .get("href")
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            })
            .filter(|value| !value.trim().is_empty())
        else {
            continue;
        };
        let Ok(url) = Url::parse(&href) else {
            return;
        };
        if !matches!(url.scheme(), "http" | "https") {
            return;
        }
        let still_current = {
            let guard = runtime
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.result_open_epoch == result_open_epoch
        };
        if still_current {
            let _ = webview.navigate(url);
        }
        return;
    }
}

fn finish_search_success(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    source_buckets: Vec<SideraInstitutionSourceBucket>,
    batches: Vec<NormalizedInstitutionResults>,
    partial: bool,
    explicit_zero_results: bool,
) {
    let normalized = merge_institution_results(batches);
    let (snapshot, session) = {
        let mut guard = runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.active_task_id.as_deref() != Some(task_id) {
            return;
        }
        guard.sequence = guard.sequence.saturating_add(1);
        guard.active_task_id = None;
        let source = guard.search.source;
        guard.detail_urls.insert(source, normalized.detail_urls);
        guard
            .full_text_urls
            .insert(source, normalized.full_text_urls);
        guard.search.sequence = guard.sequence;
        guard.search.status = if partial {
            SideraInstitutionSearchStatus::Partial
        } else {
            SideraInstitutionSearchStatus::Complete
        };
        guard.search.stage = SideraInstitutionSearchStage::NativeSnapshotComplete;
        guard.search.source_buckets = source_buckets;
        guard.search.items = normalized.items;
        guard.search.code = if partial {
            "SIDERA_INSTITUTION_SEARCH_PARTIAL"
        } else if explicit_zero_results {
            "SIDERA_INSTITUTION_SEARCH_COMPLETE_EMPTY"
        } else {
            "SIDERA_INSTITUTION_SEARCH_COMPLETE"
        }
        .to_string();
        guard.search.message = if partial {
            "部分来源或记录类型无法确认；已保留其他可验证结果。"
        } else if explicit_zero_results {
            "官方结果页明确返回 0 条记录；当前结果未写入论文库。"
        } else if source == SideraInstitutionSearchSource::AcademicDiscovery {
            "原生论文快照已完成；原始网页已隐藏，结果仅为内存预览，未入库、未下载全文。"
        } else {
            "馆藏目录检索已完成；结果仅为图书与馆藏信息，不进入论文导入。"
        }
        .to_string();
        guard.search.updated_at_ms = now_ms();
        guard.search.finished_at_ms = Some(guard.search.updated_at_ms);
        guard.session.status = SideraInstitutionSessionStatus::Ready;
        guard.session.browser_visible = false;
        guard.session.code = "SIDERA_INSTITUTION_SESSION_READY".to_string();
        guard.session.message = if partial {
            "机构会话仍然可用；本次检索只有部分来源返回结果。"
        } else {
            "机构会话仍然可用。"
        }
        .to_string();
        guard.session.database_auth.status = SideraInstitutionAuthStatus::Ready;
        guard.session.database_auth.code = "SIDERA_INSTITUTION_SESSION_READY".to_string();
        guard.session.database_auth.message = "数据库 SSO 会话仍然可用。".to_string();
        guard.session.database_auth.updated_at_ms = now_ms();
        let current_host = guard.session.current_host.clone();
        set_source_readiness_locked(
            &mut guard,
            source,
            if partial {
                SideraInstitutionSourceReadinessStatus::Partial
            } else {
                SideraInstitutionSourceReadinessStatus::Ready
            },
            if partial {
                "SIDERA_INSTITUTION_SOURCE_PARTIAL"
            } else {
                "SIDERA_INSTITUTION_SOURCE_READY"
            },
            if source == SideraInstitutionSearchSource::AcademicDiscovery {
                if partial {
                    "统一学术发现可用，但部分记录或来源未能确认。"
                } else {
                    "统一学术发现已通过真实查询确认。"
                }
            } else if partial {
                "馆藏目录可用，但部分来源桶提取失败。"
            } else {
                "馆藏目录已通过真实查询确认。"
            },
            current_host,
        );
        let snapshot = guard.search.clone();
        if source != SideraInstitutionSearchSource::AcademicDiscovery {
            guard.search_snapshots.insert(source, snapshot.clone());
        }
        (snapshot, guard.session.clone())
    };
    hide_current_academic_result_webview(app, runtime, task_id);
    emit_search(app, &snapshot);
    emit_session(app, &session);
}

fn search_error_stage(code: &str) -> SideraInstitutionSearchStage {
    if code == "SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED" {
        SideraInstitutionSearchStage::FilterUnconfirmed
    } else if matches!(
        code,
        "SIDERA_INSTITUTION_ADAPTER_DRIFT"
            | "SIDERA_INSTITUTION_ADAPTER_PAYLOAD_INVALID"
            | "SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE"
    ) {
        SideraInstitutionSearchStage::AdapterDrift
    } else {
        SideraInstitutionSearchStage::Failed
    }
}

fn finish_search_auth_cancelled(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    code: &str,
    message: &str,
) {
    let (snapshot, session) = {
        let mut guard = runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.active_task_id.as_deref() != Some(task_id) {
            return;
        }
        guard.sequence = guard.sequence.saturating_add(1);
        guard.active_task_id = None;
        guard.search.sequence = guard.sequence;
        guard.search.status = SideraInstitutionSearchStatus::Cancelled;
        guard.search.stage = SideraInstitutionSearchStage::Cancelled;
        guard.search.code = code.to_string();
        guard.search.message = message.to_string();
        guard.search.updated_at_ms = now_ms();
        guard.search.finished_at_ms = Some(guard.search.updated_at_ms);
        guard.session.status = SideraInstitutionSessionStatus::Ready;
        guard.session.browser_visible = false;
        guard.session.code = "SIDERA_INSTITUTION_SESSION_READY".to_string();
        guard.session.message =
            "数据库 SSO 与统一发现检索入口仍可用；机构全文认证可在下次检索重试。".to_string();
        let current_host = guard.session.current_host.clone();
        mark_discovery_search_access_ready_locked(&mut guard, current_host);
        let snapshot = guard.search.clone();
        (snapshot, guard.session.clone())
    };
    hide_current_academic_result_webview(app, runtime, task_id);
    emit_search(app, &snapshot);
    emit_session(app, &session);
}

fn finish_search_error(
    app: &AppHandle,
    runtime: &Arc<Mutex<SideraInstitutionRuntimeInner>>,
    task_id: &str,
    code: &str,
    message: &str,
) {
    let (snapshot, session) = {
        let mut guard = runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.active_task_id.as_deref() != Some(task_id) {
            return;
        }
        guard.sequence = guard.sequence.saturating_add(1);
        guard.active_task_id = None;
        guard.search.sequence = guard.sequence;
        guard.search.status = SideraInstitutionSearchStatus::Failed;
        guard.search.stage = search_error_stage(code);
        guard.search.code = code.to_string();
        guard.search.message = message.to_string();
        guard.search.updated_at_ms = now_ms();
        guard.search.finished_at_ms = Some(guard.search.updated_at_ms);
        let source = guard.search.source;
        guard.session.browser_visible = false;
        let authentication_failed = matches!(
            code,
            "SIDERA_INSTITUTION_LOGIN_REQUIRED" | "SIDERA_INSTITUTION_SESSION_EXPIRED"
        );
        guard.session.status = if authentication_failed {
            if code == "SIDERA_INSTITUTION_SESSION_EXPIRED" {
                SideraInstitutionSessionStatus::Expired
            } else {
                SideraInstitutionSessionStatus::LoginRequired
            }
        } else {
            SideraInstitutionSessionStatus::Ready
        };
        guard.session.code = if authentication_failed {
            code.to_string()
        } else {
            "SIDERA_INSTITUTION_SESSION_READY".to_string()
        };
        guard.session.message = if authentication_failed {
            message.to_string()
        } else {
            "数据库 SSO 仍然有效；当前来源不可用或适配器需要更新。".to_string()
        };
        if matches!(
            code,
            "SIDERA_INSTITUTION_LOGIN_REQUIRED" | "SIDERA_INSTITUTION_SESSION_EXPIRED"
        ) {
            guard.session.database_auth.status = SideraInstitutionAuthStatus::LoginRequired;
            guard.session.database_auth.code = code.to_string();
            guard.session.database_auth.message = message.to_string();
            guard.session.database_auth.updated_at_ms = now_ms();
        }
        let current_host = guard.session.current_host.clone();
        if source == SideraInstitutionSearchSource::AcademicDiscovery
            && matches!(
                code,
                "SIDERA_INSTITUTION_DISCOVERY_AUTH_FAILED"
                    | "SIDERA_INSTITUTION_DISCOVERY_AUTH_REQUIRED"
                    | "SIDERA_INSTITUTION_DISCOVERY_AUTH_RESUME_FAILED"
            )
        {
            mark_discovery_search_access_ready_locked(&mut guard, current_host);
        } else {
            set_source_readiness_locked(
                &mut guard,
                source,
                SideraInstitutionSourceReadinessStatus::Failed,
                code,
                message,
                current_host,
            );
        }
        let snapshot = guard.search.clone();
        if source != SideraInstitutionSearchSource::AcademicDiscovery {
            guard.search_snapshots.insert(source, snapshot.clone());
        }
        (snapshot, guard.session.clone())
    };
    hide_current_academic_result_webview(app, runtime, task_id);
    emit_search(app, &snapshot);
    emit_session(app, &session);
}

const DISCOVERY_AUTH_INSPECT_SCRIPT: &str = r#"
(() => {
  const adapterVersion = 'whu-discovery-auth-v1';
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const body = clean(document.body?.innerText, 12000);
  const safeLocation = `${location.origin}${location.pathname}`;
  const result = (kind) => ({ adapterVersion, kind, url: safeLocation });
  const explicitlySignedOut = /未登录|尚未登录|登录后访问|not\s+(?:signed|logged)\s+in|sign\s+in\s+to\s+continue/i.test(body);
  const readyMarker = /(?:当前|您)?已登录|机构(?:全文|访问|授权|身份).{0,20}(?:已建立|已开通|已就绪|已认证)|institutional\s+(?:access|authorization).{0,30}(?:active|enabled|established|ready)|access\s+provided\s+by/i.test(body);
  if (!explicitlySignedOut && readyMarker) return result('ready');
  if (document.querySelector('input[type="password"]') || /统一登录|机构登录|统一身份认证|institutional\s+sign\s*in|sign\s*in\s+with\s+your\s+institution/i.test(body)) {
    return result('login-required');
  }
  if (/服务异常|service unavailable|系统维护|暂时无法访问/i.test(body)) return result('service-error');
  return result('unknown');
})()
"#;

const LIBRARY_ACCOUNT_ROUTE_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const visible = (element) => {
    if (!element || element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
    const style = globalThis.getComputedStyle?.(element);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
      && rect.left < (globalThis.innerWidth || 0) && rect.top < (globalThis.innerHeight || 0));
  };
  const absolute = (value) => {
    const candidate = clean(value, 2000);
    if (!candidate || candidate === 'undefined' || candidate === 'null') return null;
    try { return new URL(candidate, location.href); } catch { return null; }
  };
  const navigateOfficialLibraryLogin = () => {
    try {
      const loginTarget = new URL('/login', location.origin);
      loginTarget.searchParams.set('url', '');
      loginTarget.searchParams.set('referer', location.href);
      location.assign(loginTarget.href);
      return true;
    } catch {
      return false;
    }
  };
  if (location.hostname === 'www.lib.whu.edu.cn' && location.pathname === '/') {
    return {
      action: navigateOfficialLibraryLogin() ? 'navigating' : 'unresolved',
      control: 'official-library-login-route',
    };
  }
  const controls = Array.from(document.querySelectorAll(
    'a[href], button, [role="button"], [tabindex], [onclick], [class*="icon" i]'
  )).filter(visible);
  const anchors = controls.filter((element) => element.matches?.('a[href]'));
  const text = (element) => clean([
    element?.innerText,
    element?.textContent,
    element?.getAttribute?.('aria-label'),
    element?.getAttribute?.('title'),
  ].filter(Boolean).join(' '));
  const safeActivate = (element) => {
    if (!element) return false;
    const href = clean(element.getAttribute?.('href'), 2000);
    const target = absolute(href);
    if (target && /^https?:$/.test(target.protocol)) {
      location.assign(target.href);
      return true;
    }
    if (!href || href === '#' || /^javascript:/i.test(href)) {
      const inlineHandler = clean(element.getAttribute?.('onclick'), 500);
      if (/\bloginFn\s*\(/.test(inlineHandler)) {
        return navigateOfficialLibraryLogin();
      }
      try {
        if (typeof element.click === 'function') element.click();
        else element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: globalThis }));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const explicitAccountRoute = Array.from(document.querySelectorAll(
    'a, button, [role="button"], [tabindex], [onclick], div, span, p'
  ))
    .filter(visible)
    .filter((element) => {
      const label = text(element);
      return label.length > 0 && label.length <= 80
        && /个人图书馆|我的图书馆|读者登录|武汉大学统一(?:身份)?认证登录|统一(?:身份)?认证登录/i.test(label);
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect?.();
      const rightRect = right.getBoundingClientRect?.();
      return ((leftRect?.width ?? 0) * (leftRect?.height ?? 0))
        - ((rightRect?.width ?? 0) * (rightRect?.height ?? 0));
    })[0];
  if (safeActivate(explicitAccountRoute)) return { action: 'navigating', control: 'explicit-account' };

  const gateway = /武汉大学统一(?:身份)?认证登录|统一(?:身份)?认证登录/i.test(
    clean(document.body?.innerText, 12000)
  );
  if (gateway) {
    const gatewayTarget = anchors.find((element) => {
      const target = absolute(element.getAttribute('href'));
      return target && (target.hostname === 'cas.whu.edu.cn'
        || target.hostname === 'metaauth.com'
        || target.hostname.endsWith('.metaauth.com'));
    });
    if (safeActivate(gatewayTarget)) return { action: 'navigating', control: 'authentication-gateway' };
  }

  const viewportWidth = Math.max(Number(globalThis.innerWidth) || 0, Number(document.documentElement?.clientWidth) || 0);
  const accountIconRoute = controls
    .filter((element) => {
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.top < 0 || rect.top > 220 || rect.width > 160 || rect.height > 140) return false;
      if (viewportWidth > 0 && rect.left + rect.width / 2 < viewportWidth * 0.7) return false;
      const shape = clean(`${element.id ?? ''} ${element.className ?? ''}`, 240);
      const hasAccountVisual = /user|account|profile|avatar|login|person|member|reader|mine|yonghu|denglu|iconfont/i.test(shape)
        || Boolean(element.querySelector?.('svg, img, i, [class*="user" i], [class*="account" i], [class*="avatar" i], [class*="login" i]'));
      const href = clean(element.getAttribute?.('href'), 2000);
      const target = absolute(href);
      const sameOriginTarget = target && target.origin === location.origin && target.href !== location.href;
      const clickHandled = !href || href === '#' || /^javascript:/i.test(href);
      return hasAccountVisual && (sameOriginTarget || clickHandled);
    })
    .sort((left, right) => (right.getBoundingClientRect?.().right ?? 0) - (left.getBoundingClientRect?.().right ?? 0))[0];
  if (safeActivate(accountIconRoute)) return { action: 'navigating', control: 'account-icon' };
  return { action: 'unresolved', control: 'none' };
})()
"#;

const LIBRARY_AUTH_INSPECT_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const body = clean(document.body?.innerText, 12000);
  const pageTitle = clean(document.title, 200);
  const safeLocation = `${location.origin}${location.pathname}`;
  const host = String(location.hostname ?? '').toLowerCase();
  const viewportWidth = Math.max(Number(globalThis.innerWidth) || 0, Number(document.documentElement?.clientWidth) || 0);
  const viewportHeight = Math.max(Number(globalThis.innerHeight) || 0, Number(document.documentElement?.clientHeight) || 0);
  const composedParent = (element) => element?.parentElement ?? element?.getRootNode?.()?.host ?? null;
  const visible = (element) => {
    if (!element) return false;
    let current = element;
    for (let depth = 0; current && depth < 12; depth += 1) {
      if (current.hidden || current.getAttribute?.('aria-hidden') === 'true'
        || current.getAttribute?.('inert') !== null) return false;
      const style = globalThis.getComputedStyle?.(current);
      const opacity = Number.parseFloat(String(style?.opacity ?? '1'));
      if (style && (style.display === 'none' || style.visibility === 'hidden'
        || style.visibility === 'collapse' || (Number.isFinite(opacity) && opacity <= 0.01))) return false;
      current = composedParent(current);
    }
    if (typeof element.getClientRects !== 'function' || element.getClientRects().length === 0) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return (viewportWidth <= 0 || (rect.right > 0 && rect.left < viewportWidth))
      && (viewportHeight <= 0 || (rect.bottom > 0 && rect.top < viewportHeight));
  };
  const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
  const elementText = (element) => {
    const rendered = clean(element?.innerText, 500);
    if (rendered) return rendered;
    const accessible = clean([
      element?.getAttribute?.('aria-label'),
      element?.getAttribute?.('title'),
    ].filter(Boolean).join(' '), 500);
    return accessible || clean(element?.textContent, 500);
  };
  const isLogoutAction = (text) => /退出(?:登录|系统)?|注销|sign\s*out|log\s*out/i.test(text);
  const isLoginPrompt = (text) => !isLogoutAction(text)
    && /未登录|尚未登录|请登录|登录我的图书馆|读者登录|统一登录|sign\s*in|log\s*in/i.test(text);
  const base = (kind, message = '') => ({
    kind,
    title: '',
    url: safeLocation,
    message,
    pageSignature: '',
    queryEcho: null,
    explicitZeroResults: false,
    buckets: [],
    records: [],
  });
  const officialLoginLanding = host === 'www.lib.whu.edu.cn'
    && location.pathname === '/page/902099/show'
    && /登录/.test(pageTitle);
  if (officialLoginLanding) {
    return base('login-required', 'OFFICIAL_LIBRARY_LOGIN_LANDING');
  }
  const controls = visibleElements('a, button, [role="button"], [role="menuitem"]');
  const strongAccountAction = controls.some((element) =>
    /退出(?:登录|系统)?|注销|我的借阅|当前借阅|借阅历史|读者信息|个人信息|我的收藏夹/i.test(elementText(element))
  );
  const topUserMenu = visibleElements([
    'header [class*="username" i]', 'header [class*="user-name" i]',
    'header [class*="userinfo" i]', 'header [class*="user-info" i]',
    'header [class*="user-menu" i]', 'header [class*="account-name" i]',
    'header [class*="account-menu" i]', 'header [class*="profile" i]',
    'header [class*="avatar" i]'
  ].join(', ')).some((element) => {
    const text = elementText(element);
    const shape = clean(`${element.id ?? ''} ${element.className ?? ''} ${element.getAttribute?.('role') ?? ''}`, 300);
    const explicitUserStructure = /username|user-name|userinfo|user-info|user-menu|account-name|account-menu|profile/i.test(shape);
    const popupMenu = element.getAttribute?.('aria-haspopup') === 'true';
    const avatarDropdown = /avatar/i.test(shape) && /menu|dropdown/i.test(shape);
    return !isLoginPrompt(text) && text.length > 0 && text.length <= 80
      && (popupMenu || avatarDropdown || explicitUserStructure);
  });
  const structuralTopUserMenu = visibleElements([
    'header a', 'header button', 'header [role="button"]', 'header [aria-haspopup]',
    'header li', 'header div', '[class*="top" i] a', '[class*="top" i] button',
    '[class*="top" i] [role="button"]', '[class*="top" i] [aria-haspopup]',
    '[class*="top" i] li', '[class*="top" i] div'
  ].join(', ')).some((element) => {
    const text = elementText(element);
    if (!text || text.length > 80 || isLoginPrompt(text)) return false;
    const descendants = (selector) => Array.from(element.querySelectorAll?.(selector) ?? []).filter(visible);
    const hasAvatar = descendants([
      '[class*="avatar" i]', '[class*="portrait" i]', '[class*="head-user" i]',
      'img[class*="user" i]', 'img[class*="account" i]', 'img[class*="profile" i]'
    ].join(', ')).length > 0;
    const hasDropdown = element.getAttribute?.('aria-haspopup') === 'true'
      || descendants('[class*="dropdown" i], [class*="caret" i], [class*="arrow" i], [aria-expanded]').length > 0;
    return hasAvatar && hasDropdown;
  });
  const hasPaintedImage = (candidateStyle) => Boolean(candidateStyle && [
    candidateStyle.backgroundImage,
    candidateStyle.maskImage,
    candidateStyle.webkitMaskImage,
  ].some((value) => value && value !== 'none'));
  const hasPseudoGlyph = (candidateStyle) => {
    const content = String(candidateStyle?.content ?? '').trim();
    return Boolean(content && !['none', 'normal', '""', "''"].includes(content));
  };
  const visualSignal = (element) => {
    const nodes = [element, ...Array.from(element?.querySelectorAll?.('*') ?? []).slice(0, 48)];
    return nodes.some((node) => {
      if (!visible(node)) return false;
      const rect = node.getBoundingClientRect?.();
      const compact = rect && rect.width >= 12 && rect.height >= 12 && rect.width <= 96 && rect.height <= 96;
      if (!compact) return false;
      const tag = String(node.tagName ?? '').toLowerCase();
      if (tag === 'img' || tag === 'svg') return true;
      const shape = clean(`${node.id ?? ''} ${node.className ?? ''}`, 240);
      const style = globalThis.getComputedStyle?.(node);
      const beforeStyle = globalThis.getComputedStyle?.(node, '::before');
      const afterStyle = globalThis.getComputedStyle?.(node, '::after');
      return hasPaintedImage(style) || hasPaintedImage(beforeStyle) || hasPaintedImage(afterStyle)
        || ((tag === 'i' || tag === 'em' || /icon|avatar|portrait|user|account|profile/i.test(shape))
          && (hasPseudoGlyph(beforeStyle) || hasPseudoGlyph(afterStyle)));
    });
  };
  const topRightAccountCandidate = (element) => {
    if (!visible(element)) return false;
    const text = elementText(element);
    if (!text || text.length > 40 || isLoginPrompt(text)) return false;
    if (/首页|资源|数据库|服务|帮助|通知|消息|搜索|菜单|公告|反馈|新闻|咨询|相关链接|语言|english|中文|新生|校友|工作网|武汉大学|图书馆|网站地图|联系我们/i.test(text)) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width > 300 || rect.height > 110 || rect.top < 0 || rect.top > 200) return false;
    const rightSide = viewportWidth > 0 && rect.left + rect.width / 2 >= viewportWidth * 0.55;
    if (!rightSide) return false;
    const style = globalThis.getComputedStyle?.(element);
    const interactive = Boolean(element.matches?.('a, button, [role="button"], [aria-haspopup], [tabindex]'))
      || style?.cursor === 'pointer';
    const dropdown = element.getAttribute?.('aria-haspopup') === 'true'
      || Array.from(element.querySelectorAll?.('[class*="dropdown" i], [class*="caret" i], [class*="arrow" i], [aria-expanded]') ?? []).some(visible);
    return interactive || dropdown || visualSignal(element);
  };
  const globalVisualSeeds = Array.from(document.querySelectorAll([
    'img', 'svg', 'i', 'em', 'span', 'a', 'button', '[role="button"]', '[aria-haspopup]', '[tabindex]',
    '[class*="avatar" i]', '[class*="portrait" i]', '[class*="user" i]',
    '[class*="account" i]', '[class*="profile" i]', '[style]'
  ].join(', '))).slice(0, 1200).filter(visible);
  const topRightVisualAccountMenu = globalVisualSeeds.some((seed) => {
    if (!visualSignal(seed)) return false;
    let candidate = seed;
    for (let depth = 0; candidate && depth <= 5; depth += 1) {
      if (topRightAccountCandidate(candidate)) return true;
      candidate = composedParent(candidate);
    }
    return false;
  });
  if (strongAccountAction) return base('library-ready', 'LIBRARY_READY_STRONG_ACTION');
  if (topUserMenu) return base('library-ready', 'LIBRARY_READY_NAMED_MENU');
  if (structuralTopUserMenu) return base('library-ready', 'LIBRARY_READY_STRUCTURAL_MENU');
  if (topRightVisualAccountMenu) return base('library-ready', 'READY_TOP_RIGHT_VISUAL');

  const authenticationHost = host === 'cas.whu.edu.cn' || host === 'metaauth.com' || host.endsWith('.metaauth.com');
  const visiblePasswords = visibleElements('input[type="password"]');
  const visiblePasswordForm = visiblePasswords.some((element) => {
    const form = element.closest?.('form');
    return form ? visible(form) : authenticationHost;
  });
  const exactLoginControl = controls.filter((element) =>
    /^(?:登录我的图书馆|读者登录|登录|统一登录|sign\s*in|log\s*in)$/i.test(elementText(element))
  );
  const visibleAuthenticationForm = authenticationHost && exactLoginControl.some((element) => {
    const form = element.closest?.('form');
    return form ? visible(form) : true;
  });
  if (visiblePasswordForm) return base('login-required', 'LOGIN_VISIBLE_PASSWORD');
  if (visibleAuthenticationForm) return base('login-required', 'LOGIN_VISIBLE_FORM');
  if (/服务异常|service unavailable|系统维护|暂时无法访问/i.test(body)) {
    return base('service-error', 'library upstream service error');
  }
  const bodyLoginHint = /统一身份认证|用户名.{0,30}密码|sign\s*in\s*to\s*continue/i.test(body);
  return base('unknown', bodyLoginHint ? 'UNKNOWN_BODY_HINT' : 'UNKNOWN_NO_PROOF');
})()
"#;

const CATALOG_INSPECT_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const absolute = (value) => { if (!value) return ''; try { return new URL(value, location.href).href; } catch { return ''; } };
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  const body = clean(document.body?.innerText, 12000);
  const lower = body.toLowerCase();
  const safeLocation = `${location.origin}${location.pathname}`;
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const searchInput = document.querySelector('input[name="request" i]:not([type="password"]), input[name="find_request" i]:not([type="password"]), input[type="search"], form[action*="/F"] input[type="text"]:not([type="password"])');
  const pageSignature = hash(`${location.href}|${document.title}|${body}|${anchors.length}|${searchInput ? 'form' : 'no-form'}`);
  const visibleEcho = body.match(/(?:您的检索为|检索(?:词|条件)|关键词|keyword)\s*[:：=]?\s*([^。]{1,200})/i);
  const queryEcho = clean(searchInput?.value, 200) || clean(visibleEcho?.[1], 200) || null;
  const response = (kind, message = '', buckets = [], records = [], explicitZeroResults = false) => ({
    kind,
    title: clean(document.title, 200),
    url: safeLocation,
    message,
    pageSignature,
    queryEcho,
    explicitZeroResults,
    buckets,
    records,
  });

  const login = Boolean(document.querySelector('input[type="password"]'))
    || /统一身份认证|institutional sign in|登录系统|用户名.*密码/i.test(body);
  if (login) return response('login-required', 'official login page');
  if (/服务异常|service unavailable|系统维护|暂时无法访问/i.test(body)) return response('service-error', 'upstream service error');
  if (/会话.*失效|session.*expired|请重新登录/i.test(lower)) return response('expired', 'session expired');

  const authenticatedLanding = /^(?:https?:\/\/)?whu\.metaersp\.(?:com|cn)\/personalIndex\/?$/i.test(safeLocation)
    && body.length >= 20
    && /数据库|资源|导航|个人|收藏|学科/i.test(body);
  if (authenticatedLanding) return response('authenticated-landing', 'authenticated MetaERS landing');

  const buckets = anchors.map((anchor) => {
    const label = clean(anchor.textContent, 80);
    const container = clean((anchor.closest('tr') ?? anchor.closest('li,div,td'))?.textContent, 400);
    const numbers = container.match(/\b\d{1,9}\b/g) ?? [];
    const count = numbers.length ? Number(numbers[numbers.length - 1]) : null;
    return { label, count: Number.isFinite(count) ? count : null, href: absolute(anchor.getAttribute('href')) };
  }).filter((row) => /^(?:中文文献库|西文文献库|chinese literature|western literature)$/i.test(row.label) && row.href).slice(0, 4);

  const navigationTitles = new Set([
    '简单检索', '多字段检索', '高级检索', '通用命令语言', '多库检索', '分类浏览',
    '检索历史', '上次检索结果', 'simple search', 'advanced search', 'search history', 'previous search',
  ].map((value) => value.replace(/\s+/g, '').toLowerCase()));
  const recordTarget = (value) => {
    try {
      const url = new URL(value, location.href);
      if (!/^https?:$/.test(url.protocol)) return false;
      const func = String(url.searchParams.get('func') ?? '').toLowerCase();
      if (func === 'direct') return Boolean(url.searchParams.get('doc_number'));
      if (func === 'full-set-set') return Boolean(url.searchParams.get('set_number') && url.searchParams.get('set_entry'));
      return false;
    } catch {
      return false;
    }
  };
  const isNoiseTitle = (value) => {
    const title = clean(value, 500);
    const compact = title.replace(/\s+/g, '').toLowerCase();
    return !title
      || navigationTitles.has(compact)
      || /^[\d\s._:\-\\/：]+$/.test(title)
      || /doclist\[|fmt_issn\(|dispfmt\(|document\.write\(|flag_review|flag_rating|rateno\+\+|rateurl\+=/i.test(compact)
      || /上一页|下一页|previous|next|返回/i.test(title);
  };
  const sanitizedClone = (container) => {
    const clone = container?.cloneNode(true);
    if (!clone) return null;
    clone.querySelectorAll('script,style,noscript,template,[hidden],[aria-hidden="true"]').forEach((node) => node.remove());
    clone.querySelectorAll('[style]').forEach((node) => {
      const style = String(node.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
      if (/display:none|visibility:hidden/.test(style)) node.remove();
    });
    return clone;
  };
  const logicalIdentity = (url, container) => {
    try {
      const parsed = new URL(url, location.href);
      const doc = clean(parsed.searchParams.get('doc_number'), 160);
      if (doc) return `doc:${doc}`;
      const set = clean(parsed.searchParams.get('set_number'), 80);
      const entry = clean(parsed.searchParams.get('set_entry'), 80);
      if (set && entry) return `set:${set}:${entry}`;
    } catch {}
    const declared = clean(container?.getAttribute?.('data-doc-number') || container?.dataset?.docNumber, 160);
    return declared ? `doc:${declared}` : '';
  };
  const records = [];
  const seenRecords = new Set();
  for (const anchor of anchors) {
    if (records.length >= 80) break;
    const detailUrl = absolute(anchor.getAttribute('href'));
    if (!recordTarget(detailUrl)) continue;
    const container = anchor.closest('tr,li,article,.result-record,.record,.brief-record') ?? anchor.parentElement;
    const identity = logicalIdentity(detailUrl, container);
    if (identity && seenRecords.has(identity)) continue;
    const clone = sanitizedClone(container);
    const text = clean(clone?.textContent, 2400);
    const validAnchors = Array.from(clone?.querySelectorAll('a[href]') ?? [])
      .map((candidate) => clean(candidate.textContent, 500))
      .filter((candidate) => !isNoiseTitle(candidate));
    const explicitTitles = Array.from(clone?.querySelectorAll('.title,.record-title,.brief-title,[data-field="title"],[data-field="name"]') ?? [])
      .map((candidate) => clean(candidate.textContent, 500))
      .filter((candidate) => !isNoiseTitle(candidate));
    const readableLines = String(clone?.innerText ?? clone?.textContent ?? '')
      .split(/[\r\n]+/)
      .map((candidate) => clean(candidate, 500))
      .filter((candidate) => candidate.length >= 2 && candidate.length <= 300 && !isNoiseTitle(candidate));
    const title = (explicitTitles[0]
      || validAnchors.sort((left, right) => right.length - left.length)[0]
      || readableLines.sort((left, right) => right.length - left.length)[0]
      || '');
    if (isNoiseTitle(title)) continue;
    const key = identity || `url:${detailUrl}`;
    if (seenRecords.has(key)) continue;
    seenRecords.add(key);
    const yearMatch = text.match(/(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/);
    const doiMatch = text.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
    const isbnMatch = text.match(/(?:ISBN|ISSN|fmt_issn)[^0-9Xx]{0,12}([0-9Xx][0-9Xx\-\s]{6,24})/i);
    const authorNode = clone?.querySelector('.author,[data-field="author"],td:nth-child(3)');
    const publicationNode = clone?.querySelector('.publication,.publisher,[data-field="publication"]');
    records.push({
      title,
      authors: clean(authorNode?.textContent, 500) || null,
      year: yearMatch ? Number(yearMatch[1]) : null,
      publication: clean(publicationNode?.textContent, 500) || null,
      documentType: /期刊|journal/i.test(text) ? '期刊' : (/学位论文|thesis/i.test(text) ? '学位论文' : (/图书|book|BK\b/i.test(text) ? '图书' : null)),
      doi: doiMatch ? doiMatch[0] : null,
      abstractSnippet: null,
      availability: clean((text.match(/(?:馆藏|可借|在线|available)[^。;；]{0,120}/i) || [])[0], 180) || null,
      detailUrl,
      fullTextUrl: null,
      recordKind: /期刊馆藏|journal holding/i.test(text) ? 'journal-holding' : 'book',
      sourceProvider: '武汉大学馆藏目录',
      fullTextStatus: 'unavailable',
      providerRecordId: null,
      catalogRecordId: identity || null,
      isbnIssn: isbnMatch ? clean(isbnMatch[1], 80) : null,
    });
  }

  const explicitZeroResults = /没有(?:匹配|符合).*记录|未检索到.*记录|\b0\s*(?:条|records?)\b|no records found|zero results/i.test(body)
    || (buckets.length > 0 && buckets.every((bucket) => bucket.count === 0));
  if (buckets.length) return response('bucket-summary', '', buckets, [], explicitZeroResults);
  if (records.length) return response('records', '', [], records, false);
  if (explicitZeroResults) return response('zero-results', 'official zero result marker', [], [], true);
  if (searchInput?.form) return response('search-form');
  return response('unknown', clean(body, 300));
})()
"#;

const CATALOG_SUBMIT_SCRIPT: &str = r#"
(() => {
  const query = __SIDERA_QUERY__;
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  const input = document.querySelector('input[name="request" i]:not([type="password"]), input[name="find_request" i]:not([type="password"]), input[type="search"], form[action*="/F"] input[type="text"]:not([type="password"])');
  if (!input || !input.form) return { action: 'adapter-update-required', pageSignature: '', queryEcho: null };
  const body = clean(document.body?.innerText, 12000);
  const anchors = document.querySelectorAll('a[href]');
  const pageSignature = hash(`${location.href}|${document.title}|${body}|${anchors.length}|form`);
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  for (const checkbox of input.form.querySelectorAll('input[type="checkbox"]')) {
    const label = String((checkbox.closest('tr') ?? checkbox.closest('label,td,div'))?.textContent ?? '');
    if (/中文文献库|西文文献库|chinese literature|western literature/i.test(label)) checkbox.checked = true;
  }
  const form = input.form;
  const submitter = form.querySelector('button[type="submit"], input[type="submit"]');
  setTimeout(() => {
    if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter ?? undefined);
    else form.submit();
  }, 0);
  return { action: 'submitted', pageSignature, queryEcho: query };
})()
"#;

const DISCOVERY_ROUTE_SCRIPT: &str = r#"
(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, '').trim();
  if (document.readyState === 'loading') return { action: 'loading', href: '' };
  const candidates = Array.from(document.querySelectorAll('a[href],button,[role="link"],.search-tabs > span,[data-id]'));
  const target = candidates.find((node) => /^(珞珈学术搜索|学术搜索)$/.test(clean(node.textContent)));
  if (!target) {
    const officialShellStillHydrating = document.querySelector('#htContainer')
      && !document.querySelector('.eng-search-style40');
    return { action: officialShellStillHydrating ? 'loading' : 'unresolved', href: '' };
  }
  const href = target.getAttribute?.('href');
  if (href) {
    try {
      const url = new URL(href, location.href);
      if (!/^https?:$/.test(url.protocol)) return { action: 'unresolved', href: '' };
      setTimeout(() => location.assign(url.href), 0);
      return { action: 'navigating', href: `${url.origin}${url.pathname}` };
    } catch { return { action: 'unresolved', href: '' }; }
  }
  if (!target.classList.contains('current')) target.click();
  const input = document.querySelector('.eng-search-style40 .ipt');
  if (target.classList.contains('current') && input) return { action: 'clicked', href: '' };
  return { action: 'loading', href: '' };
})()
"#;

#[allow(dead_code)]
const ACADEMIC_FULL_TEXT_RESOLVE_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const candidate = anchors.find((node) => /^阅读全文$/i.test(clean(node.textContent, 120)))
    || anchors.find((node) => /在线全文|链接到在线资源|full\s*text|read\s*online/i.test(clean(node.textContent, 180)));
  if (!candidate) return { href: '' };
  try {
    const href = new URL(candidate.getAttribute('href'), location.href);
    return { href: /^(?:http|https):$/i.test(href.protocol) ? href.href : '' };
  } catch {
    return { href: '' };
  }
})()
"#;

const ACADEMIC_FILTER_SCRIPT: &str = r#"
(() => {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalizeLabel = (value) => clean(value)
    .replace(/[（(]\s*\d[\d\s,，.]*\s*[)）]/g, ' ')
    .replace(/(?:\s*[,，:：-]?\s*(?:checkbox|radio|复选框|单选框|not selected|not checked|selected|checked|已选中|未选中))+\s*$/gi, ' ')
    .replace(/^(?:筛选|过滤|选择|filter by|select)\s*[:：]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const hash = (value) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); };
  if (document.readyState === 'loading') return { action: 'loading', filters: [] };
  const wanted = [
    { id: 'article', pattern: /^(?:文章|期刊论文|articles?|journal articles?)$/i },
    { id: 'conference-paper', pattern: /^(?:会议论文|conference papers?)$/i },
    { id: 'thesis', pattern: /^(?:学位论文|dissertations?|thesis|theses)$/i },
  ];
  const nodeLabels = (node) => [
    node?.getAttribute?.('aria-label'),
    node?.getAttribute?.('data-label'),
    node?.getAttribute?.('title'),
    node?.textContent,
    node?.querySelector?.('input')?.getAttribute?.('value'),
  ].map(normalizeLabel).filter(Boolean);
  const controlFor = (node) => node?.matches?.('input,button,[role="checkbox"],[role="radio"],[role="option"],[role="button"]')
    ? node
    : node?.closest?.('prm-facet-exact,mat-checkbox,md-checkbox,label,button,[role="checkbox"],[role="radio"],[role="option"],[role="button"],li') || node;
  const selected = (node) => {
    const control = controlFor(node);
    const input = control.querySelector?.('input[type="checkbox"],input[type="radio"]');
    return Boolean(input?.checked)
      || Boolean(control.querySelector?.('input[type="checkbox"]:checked,input[type="radio"]:checked'))
      || control.getAttribute?.('aria-checked') === 'true'
      || control.getAttribute?.('aria-selected') === 'true'
      || control.getAttribute?.('aria-pressed') === 'true'
      || Boolean(control.querySelector?.('[aria-checked="true"],[aria-selected="true"],[aria-pressed="true"],.md-checked,.mat-checkbox-checked,.mat-mdc-checkbox-checked,.facet-selected,.p-highlight,.p-checkbox-checked'))
      || /(?:^|\s)(?:selected|checked|is-active|facet-selected|md-checked|mat-checkbox-checked|mat-mdc-checkbox-checked|p-highlight|p-checkbox-checked)(?:\s|$)/i.test(String(control.className || ''));
  };
  const groups = Array.from(document.querySelectorAll(
    'prm-facet-group,.facet-group,.facets-group,[data-facet="resourceType"],[data-facet-type="resourceType"],[aria-label*="资源类型"],[aria-label*="Resource type" i],section,fieldset'
  ));
  const group = groups.find((node) => /资源类型|resource\s*type/i.test(clean(node.querySelector?.('h2,h3,h4,legend,.facet-title,.section-title')?.textContent || node.getAttribute?.('aria-label') || '').slice(0, 240))) || document;
  const nodes = Array.from(group.querySelectorAll('prm-facet-exact,mat-checkbox,md-checkbox,label,button,a,[role="checkbox"],[role="radio"],[role="option"],[role="button"],li,[data-facet-value]'));
  const matches = wanted.map((target) => ({
    ...target,
    node: nodes.find((node) => nodeLabels(node).some((label) => target.pattern.test(label))),
  }));
  const availableFilters = matches.filter((entry) => entry.node).map((entry) => entry.id);
  const active = () => matches.filter((entry) => entry.node && selected(entry.node)).map((entry) => entry.id).sort();
  const signature = () => {
    const body = clean(document.body?.innerText).slice(0, 16000);
    const state = matches.map((entry) => `${entry.id}:${entry.node && selected(entry.node) ? 1 : 0}`).join('|');
    return hash(`${location.href}|${document.title}|${body}|${state}|${document.querySelectorAll('a[href]').length}`);
  };
  const clickNode = (node) => {
    const control = controlFor(node);
    const input = control?.querySelector?.('input[type="checkbox"],input[type="radio"]');
    const material = control?.querySelector?.('.md-container,.mat-checkbox-inner-container,.mat-mdc-checkbox-touch-target,.p-checkbox-box');
    const clickable = material || input || control || node;
    if (!clickable || clickable.disabled || clickable.getAttribute?.('aria-disabled') === 'true') return false;
    setTimeout(() => clickable.click(), 0);
    return true;
  };
  const missingNode = matches.find((entry) => !entry.node);
  if (missingNode) {
    const expand = nodes.find((node) => /^(?:显示更多|更多|show more|more)$/i.test(normalizeLabel(node.textContent)));
    if (expand && clickNode(expand)) {
      return { action: 'clicked', target: 'expand', filters: active(), availableFilters, pageSignature: signature() };
    }
    return { action: 'unavailable', filters: active(), availableFilters, pageSignature: signature() };
  }
  const controlsAreExclusive = matches.some((entry) => {
    const control = controlFor(entry.node);
    const input = control?.matches?.('input[type="radio"]') ? control : control?.querySelector?.('input[type="radio"]');
    return Boolean(input) || control?.getAttribute?.('role') === 'radio';
  });
  const state = window.__SIDERA_ACADEMIC_FACET_STATE__ ||= { attempted: [] };
  const activeFilters = active();
  if (controlsAreExclusive || state.attempted.some((id) => !activeFilters.includes(id))) {
    return { action: 'sequential-required', filters: activeFilters, availableFilters, pageSignature: signature() };
  }
  const next = matches.find((entry) => !selected(entry.node));
  if (next) {
    if (!clickNode(next.node)) return { action: 'unavailable', filters: activeFilters, availableFilters, pageSignature: signature() };
    if (!state.attempted.includes(next.id)) state.attempted.push(next.id);
    return { action: 'clicked', target: next.id, filters: activeFilters, availableFilters, pageSignature: signature() };
  }
  return { action: 'complete', filters: activeFilters, availableFilters, pageSignature: signature() };
})()
"#;

const ACADEMIC_SINGLE_FILTER_SCRIPT: &str = r#"
(() => {
  const targetId = '__SIDERA_FILTER_ID__';
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalizeLabel = (value) => clean(value)
    .replace(/[（(]\s*\d[\d\s,，.]*\s*[)）]/g, ' ')
    .replace(/(?:\s*[,，:：-]?\s*(?:checkbox|radio|复选框|单选框|not selected|not checked|selected|checked|已选中|未选中))+\s*$/gi, ' ')
    .replace(/^(?:筛选|过滤|选择|filter by|select)\s*[:：]?\s*/i, '')
    .replace(/\s+/g, ' ').trim();
  const hash = (value) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); };
  if (document.readyState === 'loading') return { action: 'loading', filters: [] };
  const wanted = [
    { id: 'article', pattern: /^(?:文章|期刊论文|articles?|journal articles?)$/i },
    { id: 'conference-paper', pattern: /^(?:会议论文|conference papers?)$/i },
    { id: 'thesis', pattern: /^(?:学位论文|dissertations?|thesis|theses)$/i },
  ];
  const nodeLabels = (node) => [node?.getAttribute?.('aria-label'), node?.getAttribute?.('data-label'), node?.getAttribute?.('title'), node?.textContent, node?.querySelector?.('input')?.getAttribute?.('value')].map(normalizeLabel).filter(Boolean);
  const controlFor = (node) => node?.matches?.('input,button,[role="checkbox"],[role="radio"],[role="option"],[role="button"]') ? node : node?.closest?.('prm-facet-exact,mat-checkbox,md-checkbox,label,button,[role="checkbox"],[role="radio"],[role="option"],[role="button"],li') || node;
  const selected = (node) => {
    const control = controlFor(node);
    const input = control?.querySelector?.('input[type="checkbox"],input[type="radio"]');
    return Boolean(input?.checked)
      || Boolean(control?.querySelector?.('input[type="checkbox"]:checked,input[type="radio"]:checked'))
      || control?.getAttribute?.('aria-checked') === 'true'
      || control?.getAttribute?.('aria-selected') === 'true'
      || control?.getAttribute?.('aria-pressed') === 'true'
      || Boolean(control?.querySelector?.('[aria-checked="true"],[aria-selected="true"],[aria-pressed="true"],.md-checked,.mat-checkbox-checked,.mat-mdc-checkbox-checked,.facet-selected,.p-highlight,.p-checkbox-checked'))
      || /(?:^|\s)(?:selected|checked|is-active|facet-selected|md-checked|mat-checkbox-checked|mat-mdc-checkbox-checked|p-highlight|p-checkbox-checked)(?:\s|$)/i.test(String(control?.className || ''));
  };
  const groups = Array.from(document.querySelectorAll('prm-facet-group,.facet-group,.facets-group,[data-facet="resourceType"],[data-facet-type="resourceType"],[aria-label*="资源类型"],[aria-label*="Resource type" i],section,fieldset'));
  const group = groups.find((node) => /资源类型|resource\s*type/i.test(clean(node.querySelector?.('h2,h3,h4,legend,.facet-title,.section-title')?.textContent || node.getAttribute?.('aria-label') || '').slice(0, 240))) || document;
  const nodes = Array.from(group.querySelectorAll('prm-facet-exact,mat-checkbox,md-checkbox,label,button,a,[role="checkbox"],[role="radio"],[role="option"],[role="button"],li,[data-facet-value]'));
  const matches = wanted.map((target) => ({ ...target, node: nodes.find((node) => nodeLabels(node).some((label) => target.pattern.test(label))) }));
  const availableFilters = matches.filter((entry) => entry.node).map((entry) => entry.id);
  const active = () => matches.filter((entry) => entry.node && selected(entry.node)).map((entry) => entry.id).sort();
  const signature = () => {
    const body = clean(document.body?.innerText).slice(0, 16000);
    const state = matches.map((entry) => `${entry.id}:${entry.node && selected(entry.node) ? 1 : 0}`).join('|');
    return hash(`${location.href}|${document.title}|${body}|${state}|${document.querySelectorAll('a[href]').length}`);
  };
  const clickNode = (node) => {
    const control = controlFor(node);
    const input = control?.querySelector?.('input[type="checkbox"],input[type="radio"]');
    const material = control?.querySelector?.('.md-container,.mat-checkbox-inner-container,.mat-mdc-checkbox-touch-target,.p-checkbox-box');
    const clickable = material || input || control || node;
    if (!clickable || clickable.disabled || clickable.getAttribute?.('aria-disabled') === 'true') return false;
    setTimeout(() => clickable.click(), 0);
    return true;
  };
  if (availableFilters.length !== 3) return { action: 'unavailable', filters: active(), availableFilters, pageSignature: signature() };
  const activeFilters = active();
  const target = matches.find((entry) => entry.id === targetId);
  if (!target || !target.node) return { action: 'unavailable', filters: activeFilters, availableFilters, pageSignature: signature() };
  const controlsAreExclusive = matches.some((entry) => {
    const control = controlFor(entry.node);
    const input = control?.matches?.('input[type="radio"]') ? control : control?.querySelector?.('input[type="radio"]');
    return Boolean(input) || control?.getAttribute?.('role') === 'radio';
  });
  if (!controlsAreExclusive) {
    const other = matches.find((entry) => entry.id !== targetId && selected(entry.node));
    if (other) {
      if (!clickNode(other.node)) return { action: 'unavailable', filters: activeFilters, availableFilters, pageSignature: signature() };
      return { action: 'clicked', target: other.id, filters: activeFilters, availableFilters, pageSignature: signature() };
    }
  }
  if (!selected(target.node)) {
    if (!clickNode(target.node)) return { action: 'unavailable', filters: activeFilters, availableFilters, pageSignature: signature() };
    return { action: 'clicked', target: target.id, filters: activeFilters, availableFilters, pageSignature: signature() };
  }
  return { action: 'complete', filters: active(), availableFilters, pageSignature: signature() };
})()
"#;

const ACADEMIC_NEXT_PAGE_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const expectedPage = __SIDERA_EXPECTED_NEXT_PAGE__;
  const locateForNativeInput = __SIDERA_LOCATE_FOR_NATIVE_INPUT__;
  const hash = (value) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); };
  const bodyText = String(document.body?.innerText || '');
  const body = clean(bodyText, 16000);
  const bodyTail = clean(bodyText.slice(-8000), 8000);
  const searchInput = document.querySelector('#searchBar,prm-search-bar input[role="combobox"],prm-search-bar input[type="search"],prm-search-bar input[type="text"],input[type="search"],input[name*="query" i],input[name*="keyword" i],input[name*="search" i],form[role="search"] input[type="text"],.search-box input[type="text"]');
  const pageSignature = hash(`${location.href}|${document.title}|${body}|${bodyTail}|${document.querySelectorAll('a[href]').length}|${searchInput ? 'form' : 'no-form'}`);
  const numericSelector = 'button,a,[role="button"],[tabindex],li,span';
  const numericLabel = (node) => clean(node?.textContent, 20).match(/^\d{1,4}$/)?.[0] || '';
  const numericNodes = Array.from(document.querySelectorAll(numericSelector)).filter((node) => numericLabel(node));
  const clickableFor = (node) => {
    for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
      const className = String(current.className || '');
      if (['BUTTON', 'A'].includes(current.tagName)
        || current.getAttribute?.('role') === 'button'
        || (current.hasAttribute?.('tabindex') && current.getAttribute?.('tabindex') !== '-1')
        || current.hasAttribute?.('ng-click')
        || current.hasAttribute?.('data-ng-click')
        || current.hasAttribute?.('onclick')
        || /(?:^|\s)(?:md-button|page-link|paginator-page)(?:\s|$)/i.test(className)
        || getComputedStyle(current).cursor === 'pointer') return current;
    }
    return null;
  };
  const pagerContainers = [];
  for (const node of numericNodes) {
    let ancestor = node.parentElement;
    for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) {
      const values = Array.from(ancestor.querySelectorAll(numericSelector))
        .map((entry) => Number(numericLabel(entry)))
        .filter((value) => Number.isInteger(value) && value > 0 && value < 1000);
      const unique = Array.from(new Set(values)).sort((left, right) => left - right);
      const consecutive = unique.filter((value, index) => index > 0 && value === unique[index - 1] + 1).length;
      if (unique.length >= 3 && consecutive >= 2) pagerContainers.push({ node: ancestor, unique, depth, textLength: clean(ancestor.textContent, 2000).length });
    }
  }
  pagerContainers.sort((left, right) => left.textLength - right.textLength || left.depth - right.depth || right.unique.length - left.unique.length);
  const pager = pagerContainers[0]?.node || null;
  const rangeSource = `${body} ${bodyTail}`;
  const range = rangeSource.match(/第\s*(\d+)\s*[-–—至]\s*(\d+)\s*个?结果/i)
    || rangeSource.match(/(?:results?)\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/i);
  // The current page is supplied by the last accepted structured response.
  // DOM active/current markers remain diagnostic-only and never select a page.
  const currentPage = Math.max(0, expectedPage - 1);
  const selectedNumericNode = null;
  const numberedNextNode = pager && expectedPage > 0
    ? Array.from(pager.querySelectorAll(numericSelector)).find((node) => Number(numericLabel(node)) === expectedPage)
    : null;
  // Primo keeps its numbered page listener on an exact scoped div after
  // Angular compilation, without retaining button semantics or ng-click.
  // The exact expected number inside the verified pager remains a safe target.
  const numberedNext = clickableFor(numberedNextNode) || numberedNextNode;
  const pagerArrow = pager ? Array.from(pager.querySelectorAll('button,a,[role="button"]')).find((node) => {
    const label = clean(node.getAttribute?.('aria-label') || node.getAttribute?.('title') || node.textContent, 40);
    return /^(?:下一页|next(?: page)?|>|›|»|→)$/iu.test(label);
  }) : null;
  const candidates = Array.from(new Set([numberedNext, pagerArrow].filter(Boolean)));
  const next = candidates.find((node) => {
    const className = String(node.className || '');
    return !node.disabled
      && node.getAttribute?.('aria-disabled') !== 'true'
      && !/(?:^|\s)(?:disabled|is-disabled|p-disabled)(?:\s|$)/i.test(className)
      && !node.closest?.('[aria-disabled="true"],.disabled,.is-disabled');
  });
  const safeClassTokens = (node) => String(node?.className || '')
    .split(/\s+/)
    .filter((token) => /^[A-Za-z0-9_-]{1,48}$/.test(token))
    .slice(0, 8);
  const safeNode = (node) => node ? {
    tag: clean(node.tagName, 24).toLowerCase(),
    role: clean(node.getAttribute?.('role'), 24),
    classes: safeClassTokens(node),
    ariaCurrent: clean(node.getAttribute?.('aria-current'), 12),
    ariaSelected: clean(node.getAttribute?.('aria-selected'), 12),
    tabindex: clean(node.getAttribute?.('tabindex'), 12),
    numericLabel: numericLabel(node),
  } : null;
  const safeAncestors = (node) => {
    const values = [];
    for (let current = node?.parentElement, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) values.push(safeNode(current));
    return values.filter(Boolean);
  };
  const viewportWidth = Math.max(0, Number(window.innerWidth) || 0);
  const viewportHeight = Math.max(0, Number(window.innerHeight) || 0);
  const nextRect = next?.getBoundingClientRect?.() || null;
  const clickX = nextRect ? nextRect.left + nextRect.width / 2 : null;
  const clickY = nextRect ? nextRect.top + nextRect.height / 2 : null;
  const pointIsVisible = Boolean(nextRect)
    && nextRect.width > 0
    && nextRect.height > 0
    && Number.isFinite(clickX)
    && Number.isFinite(clickY)
    && clickX >= 0
    && clickY >= 0
    && clickX < viewportWidth
    && clickY < viewportHeight;
  const hitNode = pointIsVisible ? document.elementFromPoint(clickX, clickY) : null;
  const hitTestMatches = Boolean(hitNode && (hitNode === next || next.contains?.(hitNode) || hitNode.contains?.(next)));
  const diagnostics = {
    expectedPage,
    rangeFound: Boolean(range),
    currentPage,
    numericLabels: Array.from(new Set(numericNodes.map((node) => Number(numericLabel(node)))
      .filter((value) => Number.isInteger(value) && value > 0 && value < 1000)))
      .sort((left, right) => left - right)
      .slice(0, 20),
    pagerFound: Boolean(pager),
    pagerNumbers: (pagerContainers[0]?.unique || []).slice(0, 20),
    selectedNumericNode: safeNode(selectedNumericNode),
    numberedNextNode: safeNode(numberedNextNode),
    numberedNextTarget: safeNode(numberedNext),
    nextCandidate: safeNode(next),
    nextCandidateAncestors: safeAncestors(next || numberedNextNode),
    candidateCount: candidates.length,
    controlKind: next && next === numberedNext
      ? (numberedNext === numberedNextNode ? 'numbered-page-node' : 'numbered-page-ancestor')
      : next && next === pagerArrow ? 'pager-next' : '',
    clickX: pointIsVisible ? clickX : null,
    clickY: pointIsVisible ? clickY : null,
    viewportWidth,
    viewportHeight,
    hitTestMatches,
  };
  if (!next) {
    window.scrollTo?.({ top: Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0), behavior: 'auto' });
    return { action: 'pending', pageSignature, diagnostics };
  }
  if (locateForNativeInput) {
    if (!pointIsVisible || !hitTestMatches) {
      next.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'auto' });
      return { action: 'pending', pageSignature, diagnostics };
    }
    return { action: 'located', pageSignature, diagnostics };
  }
  next.click();
  return { action: 'clicked', pageSignature, diagnostics };
})()
"#;

const ACADEMIC_NEXT_PAGE_INSPECT_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const hash = (value) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); };
  const bodyText = String(document.body?.innerText || '');
  const body = clean(bodyText, 16000);
  const bodyTail = clean(bodyText.slice(-8000), 8000);
  const searchInput = document.querySelector('#searchBar,prm-search-bar input[role="combobox"],prm-search-bar input[type="search"],prm-search-bar input[type="text"],input[type="search"],input[name*="query" i],input[name*="keyword" i],input[name*="search" i],form[role="search"] input[type="text"],.search-box input[type="text"]');
  const pageSignature = hash(`${location.href}|${document.title}|${body}|${bodyTail}|${document.querySelectorAll('a[href]').length}|${searchInput ? 'form' : 'no-form'}`);
  const selectorCandidates = Array.from(document.querySelectorAll('a[rel="next"],button[aria-label*="下一页"],a[aria-label*="下一页"],button[aria-label*="Next" i],a[aria-label*="Next" i],#load_more_button,#load-more-results,button[id*="load_more" i],button[id*="load-more" i],button[aria-label*="加载更多"],button[aria-label*="更多结果"],button[aria-label*="load more" i],button[title*="加载更多"],button[title*="load more" i],prm-search-result-list .load-more-button,prm-search-result-list [class*="load-more" i],prm-page-nav-menu .next,.pagination .next,.p-paginator-next,.mat-paginator-navigation-next'));
  const interactive = Array.from(document.querySelectorAll('button,a,[role="button"],[tabindex]'));
  const numericSelector = 'button,a,[role="button"],[tabindex],li,span';
  const numericLabel = (node) => clean(node?.textContent, 20).match(/^\d{1,4}$/)?.[0] || '';
  const numericNodes = Array.from(document.querySelectorAll(numericSelector)).filter((node) => numericLabel(node));
  const clickableFor = (node) => {
    for (let current = node, depth = 0; current && depth < 5; current = current.parentElement, depth += 1) {
      const className = String(current.className || '');
      if (['BUTTON', 'A'].includes(current.tagName)
        || current.getAttribute?.('role') === 'button'
        || (current.hasAttribute?.('tabindex') && current.getAttribute?.('tabindex') !== '-1')
        || current.hasAttribute?.('ng-click')
        || current.hasAttribute?.('data-ng-click')
        || current.hasAttribute?.('onclick')
        || /(?:^|\s)(?:md-button|page-link|paginator-page)(?:\s|$)/i.test(className)
        || getComputedStyle(current).cursor === 'pointer') return current;
    }
    return null;
  };
  const pagerContainers = [];
  for (const node of numericNodes) {
    let ancestor = node.parentElement;
    for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) {
      const values = Array.from(ancestor.querySelectorAll(numericSelector))
        .map((entry) => Number(numericLabel(entry)))
        .filter((value) => Number.isInteger(value) && value > 0 && value < 1000);
      const unique = Array.from(new Set(values)).sort((left, right) => left - right);
      const consecutive = unique.filter((value, index) => index > 0 && value === unique[index - 1] + 1).length;
      if (unique.length >= 3 && consecutive >= 2) pagerContainers.push({ node: ancestor, unique, depth, textLength: clean(ancestor.textContent, 2000).length });
    }
  }
  pagerContainers.sort((left, right) => left.textLength - right.textLength || left.depth - right.depth || right.unique.length - left.unique.length);
  const pager = pagerContainers[0]?.node || null;
  const rangeSource = `${body} ${bodyTail}`;
  const range = rangeSource.match(/第\s*(\d+)\s*[-–—至]\s*(\d+)\s*个?结果/i)
    || rangeSource.match(/(?:results?)\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/i);
  let currentPage = 0;
  if (range) {
    const first = Number(range[1]);
    const last = Number(range[2]);
    const pageSize = Math.max(1, last - first + 1);
    if (Number.isFinite(first) && Number.isFinite(last)) currentPage = Math.floor(Math.max(0, first - 1) / pageSize) + 1;
  }
  if (!currentPage && pager) {
    const selected = Array.from(pager.querySelectorAll(numericSelector)).find((node) => {
      for (let current = node, depth = 0; current && depth < 4 && pager.contains(current); current = current.parentElement, depth += 1) {
        const className = String(current.className || '');
        if (current.getAttribute?.('aria-current') === 'page'
          || current.getAttribute?.('aria-selected') === 'true'
          || /(?:^|\s)(?:active|current|selected)(?:\s|$)/i.test(className)
          || current.disabled === true
          || current.getAttribute?.('aria-disabled') === 'true') return true;
      }
      return false;
    });
    currentPage = Number(numericLabel(selected)) || 0;
  }
  const numberedNextNode = pager && currentPage > 0
    ? Array.from(pager.querySelectorAll(numericSelector)).find((node) => Number(numericLabel(node)) === currentPage + 1)
    : null;
  const numberedNext = clickableFor(numberedNextNode);
  const textCandidates = Array.from(document.querySelectorAll('button,a')).filter((node) => {
    const label = clean(node.getAttribute?.('aria-label') || node.getAttribute?.('title') || node.textContent, 120);
    if (/^(?:下一页|next(?: page)?)$/i.test(label)) return true;
    return Boolean(node.closest?.('prm-search-result-list,[data-qa*="result" i],[class*="result-list" i]'))
      && /^(?:加载更多(?:结果)?|显示更多(?:结果)?|load more(?: results)?|show more(?: results)?)$/i.test(label);
  });
  const pagerArrow = pager ? Array.from(pager.querySelectorAll('button,a,[role="button"]')).find((node) => /^(?:>|›|»|→)$/u.test(clean(node.textContent, 20))) : null;
  const candidates = Array.from(new Set([...selectorCandidates, numberedNext, pagerArrow, ...textCandidates].filter(Boolean)));
  const next = candidates.find((node) => {
    const className = String(node.className || '');
    return !node.disabled
      && node.getAttribute?.('aria-disabled') !== 'true'
      && !/(?:^|\s)(?:disabled|is-disabled|p-disabled)(?:\s|$)/i.test(className)
      && !node.closest?.('[aria-disabled="true"],.disabled,.is-disabled');
  });
  return { action: next ? 'available' : 'complete', pageSignature };
})()
"#;

const ACADEMIC_INSPECT_SCRIPT: &str = r#"
(() => {
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const absolute = (value) => {
    const candidate = String(value ?? '').trim();
    if (!candidate || candidate === 'undefined' || candidate === 'null') return '';
    try { return new URL(candidate, location.href).href; } catch { return ''; }
  };
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  const body = clean(document.body?.innerText, 16000);
  const safeLocation = `${location.origin}${location.pathname}`;
  const portalTab = Array.from(document.querySelectorAll('.search-tabs > span,[data-id].current'))
    .find((node) => node.classList.contains('current') && /^(珞珈学术搜索|学术搜索)$/.test(clean(node.textContent, 80).replace(/\s+/g, '')));
  const portalInput = portalTab ? document.querySelector('.eng-search-style40 .ipt') : null;
  const searchInput = portalInput || document.querySelector('#searchBar,prm-search-bar input[role="combobox"],prm-search-bar input[type="search"],prm-search-bar input[type="text"],input[type="search"],input[name*="query" i],input[name*="keyword" i],input[name*="search" i],form[role="search"] input[type="text"],.search-box input[type="text"]');
  const pageSignature = hash(`${location.href}|${document.title}|${body}|${document.querySelectorAll('a[href]').length}|${searchInput ? 'form' : 'no-form'}`);
  const visibleEcho = body.match(/(?:检索词|关键词|您的检索|search(?:ing)? for)\s*[:：=]?\s*([^。]{1,200})/i);
  const queryEcho = clean(searchInput?.value, 200) || clean(visibleEcho?.[1], 200) || null;
  const response = (kind, message = '', buckets = [], records = [], explicitZeroResults = false) => ({
    kind, title: clean(document.title, 200), url: safeLocation, message, pageSignature, queryEcho,
    explicitZeroResults, buckets, records,
  });
  if (document.querySelector('input[type="password"]') || /统一身份认证|institutional sign in|登录系统|用户名.*密码/i.test(body)) return response('login-required');
  if (/服务异常|service unavailable|系统维护|暂时无法访问/i.test(body)) return response('service-error');
  if (/会话.*失效|session.*expired|请重新登录/i.test(body)) return response('expired');

  const typeOf = (text, resourceType = '') => {
    const normalizedType = clean(resourceType, 120)
      .replace(/[（(]\s*\d[\d\s,，.]*\s*[)）]/g, ' ')
      .replace(/\s+(?:selected|checked|已选中)\s*$/i, '')
      .replace(/\s+/g, ' ').trim();
    if (/^(?:期刊|journal)$/i.test(normalizedType)) return 'book';
    if (/^(?:文章|articles?|journal articles?)$/i.test(normalizedType)) return 'journal-article';
    if (/^(?:会议论文|conference papers?)$/i.test(normalizedType)) return 'conference-paper';
    if (/^(?:学位论文|dissertations?|thesis|theses)$/i.test(normalizedType)) return 'thesis';
    if (/^(?:图书|电子书|books?|e-?books?)$/i.test(normalizedType)) return 'book';
    if (/电子书|图书|book|monograph|期刊刊名|馆藏/i.test(text)) return 'book';
    if (/学位论文|博士论文|硕士论文|dissertation|doctoral thesis|master'?s thesis/i.test(text)) return 'thesis';
    if (/会议论文|会议录|conference paper|proceedings/i.test(text)) return 'conference-paper';
    if (/期刊论文|文章|journal article|article|卷\s*\d+.*期\s*\d+/i.test(text)) return 'journal-article';
    return 'unknown';
  };
  const containers = Array.from(document.querySelectorAll('prm-brief-result-container,prm-brief-result,.list-item-wrapper,article,.result-item,.result-list-item,.record-item,.search-result-item,[data-record-id],[data-doc-id],li.result,tr.result'));
  const records = [];
  const seen = new Set();
  for (const container of containers) {
    if (records.length >= 80) break;
    const text = clean(container.innerText || container.textContent, 4000);
    const resourceType = clean(container.querySelector('.media-content-type')?.textContent, 80);
    const kind = typeOf(text, resourceType);
    if (!['journal-article', 'conference-paper', 'thesis'].includes(kind)) continue;
    const titleNode = container.querySelector('.item-title,.title,.record-title,.result-title,[data-field="title"],h2,h3,h4');
    const anchors = Array.from(container.querySelectorAll('a[href]'));
    const detailAnchor = anchors.find((node) => /\/fulldisplay\?|[?&]docid=/i.test(absolute(node.getAttribute('href'))))
      || anchors.find((node) => /详情|题名|查看记录|detail|record/i.test(clean(node.textContent, 120)))
      || anchors.find((node) => clean(node.textContent, 500).length >= 4);
    const title = clean(titleNode?.textContent || detailAnchor?.textContent, 500);
    const detailUrl = absolute(detailAnchor?.getAttribute('href'));
    if (!title || !detailUrl || /^\d+$/.test(title) || /简单检索|高级检索|检索历史/i.test(title)) continue;
    const providerRecordId = clean(container.getAttribute('data-record-id') || container.getAttribute('data-doc-id') || container.getAttribute('data-recordid'), 200)
      || clean((detailUrl.match(/[?&]docid=([^&#]+)/i) || [])[1], 200)
      || null;
    const identity = providerRecordId || detailUrl;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const doiMatch = text.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
    const yearMatch = text.match(/(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/);
    const detailLines = Array.from(container.querySelectorAll('prm-brief-result .item-detail,.item-detail'))
      .map((node) => clean(node.textContent, 500)).filter(Boolean);
    const authorNode = container.querySelector('.author,.authors,[data-field="author"]');
    const journalNode = container.querySelector('.journal,.source-title,.item-details-element,[data-field="journal"]');
    const conferenceNode = container.querySelector('.conference,[data-field="conference"]');
    const degreeNode = container.querySelector('.degree-institution,.university,[data-field="degreeInstitution"]');
    const providerNode = container.querySelector('.database,.provider,.source-database,[data-field="database"]');
    const fullTextAnchor = anchors.find((node) => /全文|full\s*text|PDF|在线阅读/i.test(clean(node.textContent, 120)));
    const fullTextMarker = container.querySelector('.availability-status,.fulltext_linktorsrc');
    const rawFullTextHref = fullTextAnchor && fullTextAnchor.getAttribute('href');
    const resolvedFullTextUrl = absolute(rawFullTextHref);
    const fullTextUrl = resolvedFullTextUrl || (fullTextMarker ? detailUrl : null);
    const providerFromId = (() => {
      const value = String(providerRecordId || '').toLowerCase();
      if (value.includes('_wanfang_')) return '万方';
      if (value.includes('_cass_nssd_')) return '国家哲学社会科学文献中心';
      if (value.includes('_cnki_')) return '中国知网';
      if (value.includes('_proquest_')) return 'ProQuest';
      if (value.includes('_wos_') || value.includes('_webofscience_')) return 'Web of Science';
      if (value.includes('_elsevier_sciencedirect_')) return 'ScienceDirect';
      if (value.includes('_crossref_')) return 'Crossref';
      if (value.includes('_pubmed_')) return 'PubMed';
      if (value.includes('_swepub_')) return 'SwePub';
      return '';
    })();
    const authorText = clean(authorNode?.textContent || detailLines[0], 500).replace(/^[\s;,；，]+|[\s;,；，]+$/g, '');
    const publicationText = clean(journalNode?.textContent || detailLines[detailLines.length - 1], 500).replace(/^[\s;,；，]+|[\s;,；，]+$/g, '');
    records.push({
      title,
      authors: authorText || clean((text.match(/(?:作者|author)\s*[:：]\s*([^。;；]{1,300})/i) || [])[1], 500) || null,
      year: yearMatch ? Number(yearMatch[1]) : null,
      publication: publicationText || clean(conferenceNode?.textContent || degreeNode?.textContent, 500) || null,
      documentType: kind,
      doi: doiMatch ? doiMatch[0] : null,
      abstractSnippet: clean(container.querySelector('.abstract,.summary,[data-field="abstract"]')?.textContent, 1000) || null,
      availability: fullTextUrl ? '存在全文入口' : null,
      detailUrl,
      fullTextUrl,
      recordKind: kind,
      journal: kind === 'journal-article' ? (publicationText || null) : (clean(journalNode?.textContent, 500) || null),
      conference: clean(conferenceNode?.textContent, 500) || null,
      degreeInstitution: clean(degreeNode?.textContent, 500) || null,
      volume: clean((text.match(/(?:卷|volume|vol\.)\s*[:：]?\s*([\w-]+)/i) || [])[1], 80) || null,
      issue: clean((text.match(/(?:期|issue|no\.)\s*[:：]?\s*([\w-]+)/i) || text.match(/vol\.?\s*[\w-]+\s*\(([\w-]+)\)/i) || [])[1], 80) || null,
      pages: clean((text.match(/(?:页码|pages?|pp\.|p\.?)\s*[:：]?\s*([\d-]+)/i) || [])[1], 80) || null,
      sourceProvider: clean(providerNode?.textContent, 180) || providerFromId || clean((text.match(/(?:来源数据库|database)\s*[:：]\s*([^。;；]{1,120})/i) || [])[1], 180) || null,
      fullTextStatus: fullTextUrl ? (/PDF|下载/i.test(clean(fullTextAnchor?.textContent, 120)) ? 'available' : 'link-only') : 'unknown',
      providerRecordId,
      catalogRecordId: null,
      isbnIssn: null,
    });
  }
  const providerCounts = new Map();
  for (const record of records) {
    const label = record.sourceProvider || '未标明来源';
    providerCounts.set(label, (providerCounts.get(label) || 0) + 1);
  }
  const buckets = Array.from(providerCounts, ([label, count]) => ({ label, count, href: safeLocation }));
  const explicitZeroResults = /未检索到|没有找到|无匹配结果|\b0\s*(?:条|results?|records?)\b|no results/i.test(body);
  if (records.length) return response('records', '', buckets, records, false);
  if (explicitZeroResults) return response('zero-results', 'official zero result marker', [], [], true);
  if (searchInput?.form || searchInput) return response('search-form');
  return response('unknown', clean(body, 300));
})()
"#;

const ACADEMIC_SUBMIT_SCRIPT: &str = r#"
(() => {
  const query = __SIDERA_QUERY__;
  const clean = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const hash = (value) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, '0'); };
  const cleanTab = (value) => String(value ?? '').replace(/\s+/g, '').trim();
  const portalTab = Array.from(document.querySelectorAll('.search-tabs > span,[data-id].current'))
    .find((node) => node.classList.contains('current') && /^(珞珈学术搜索|学术搜索)$/.test(cleanTab(node.textContent)));
  const portalInput = portalTab ? document.querySelector('.eng-search-style40 .ipt') : null;
  const input = portalInput || document.querySelector('#searchBar,prm-search-bar input[role="combobox"],prm-search-bar input[type="search"],prm-search-bar input[type="text"],input[type="search"],input[name*="query" i],input[name*="keyword" i],input[name*="search" i],form[role="search"] input[type="text"],.search-box input[type="text"]');
  if (!input) return { action: 'adapter-update-required', pageSignature: '', queryEcho: null };
  const body = clean(document.body?.innerText, 16000);
  const pageSignature = hash(`${location.href}|${document.title}|${body}|${document.querySelectorAll('a[href]').length}|form`);
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  const form = input.form || input.closest('form');
  const submitter = form?.querySelector('button[type="submit"],input[type="submit"],button.search,button[aria-label*="搜索"]')
    || (portalInput ? document.querySelector('.eng-search-style40 .btn-search') : null)
    || document.querySelector('prm-search-bar button[type="submit"],prm-search-bar button[aria-label*="Search" i]');
  setTimeout(() => {
    if (form && typeof form.requestSubmit === 'function') form.requestSubmit(submitter ?? undefined);
    else if (form) form.submit();
    else if (submitter) submitter.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  }, 0);
  return { action: 'submitted', pageSignature, queryEcho: query };
})()
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn background_transport_preserves_desktop_viewport_at_bottom_right() {
        assert_eq!(
            background_transport_park_position(1360, 864, 1.0),
            (1359.0, 863.0)
        );
        assert_eq!(
            background_transport_park_position(2720, 1728, 2.0),
            (1359.0, 863.0)
        );
        assert_eq!(background_transport_park_position(0, 0, 0.0), (0.0, 0.0));
        assert_eq!(INSTITUTION_BACKGROUND_TRANSPORT_WIDTH, 1_280.0);
        assert_eq!(INSTITUTION_BACKGROUND_TRANSPORT_HEIGHT, 900.0);
    }

    #[test]
    fn session_restore_starts_once_and_binds_a_new_epoch() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        let (epoch, state) = begin_session_restore_locked(&mut runtime);
        assert!(runtime.restore_inflight);
        assert_eq!(runtime.restore_epoch, epoch);
        assert_eq!(state.status, SideraInstitutionSessionStatus::Starting);
        assert_eq!(
            state.database_auth.status,
            SideraInstitutionAuthStatus::Starting
        );
        assert_eq!(
            state.academic_discovery_auth.status,
            SideraInstitutionAuthStatus::Starting
        );
        assert_eq!(
            state.library_account_auth.status,
            SideraInstitutionAuthStatus::Starting
        );
        assert!(!state.browser_visible);
        assert!(!state.auth_modal_visible);
        assert!(session_restore_is_current_locked(&runtime, epoch, None));
    }

    #[test]
    fn session_restore_reports_ready_only_when_every_capability_is_ready() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        let (epoch, _) = begin_session_restore_locked(&mut runtime);
        runtime.session.database_auth.status = SideraInstitutionAuthStatus::Ready;
        runtime.session.academic_discovery_auth.status = SideraInstitutionAuthStatus::Ready;
        runtime.session.library_account_auth.status = SideraInstitutionAuthStatus::Ready;
        let state = finalize_session_restore_locked(&mut runtime, epoch).unwrap();
        assert_eq!(state.status, SideraInstitutionSessionStatus::Ready);
        assert_eq!(state.code, "SIDERA_INSTITUTION_SESSION_RESTORE_READY");
        assert!(!runtime.restore_inflight);
    }

    #[test]
    fn session_restore_keeps_partial_and_login_required_truth_distinct() {
        let mut partial = SideraInstitutionRuntimeInner::default();
        let (partial_epoch, _) = begin_session_restore_locked(&mut partial);
        partial.session.database_auth.status = SideraInstitutionAuthStatus::Ready;
        partial.session.academic_discovery_auth.status = SideraInstitutionAuthStatus::Failed;
        partial.session.library_account_auth.status = SideraInstitutionAuthStatus::LoginRequired;
        let partial_state = finalize_session_restore_locked(&mut partial, partial_epoch).unwrap();
        assert_eq!(
            partial_state.status,
            SideraInstitutionSessionStatus::Partial
        );

        let mut login = SideraInstitutionRuntimeInner::default();
        let (login_epoch, _) = begin_session_restore_locked(&mut login);
        login.session.database_auth.status = SideraInstitutionAuthStatus::LoginRequired;
        login.session.academic_discovery_auth.status = SideraInstitutionAuthStatus::Failed;
        login.session.library_account_auth.status = SideraInstitutionAuthStatus::Failed;
        let login_state = finalize_session_restore_locked(&mut login, login_epoch).unwrap();
        assert_eq!(
            login_state.status,
            SideraInstitutionSessionStatus::LoginRequired
        );
        assert_eq!(
            login_state.code,
            "SIDERA_INSTITUTION_SESSION_RESTORE_LOGIN_REQUIRED"
        );
    }

    #[test]
    fn invalidated_restore_rejects_every_late_finalization() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.webview_generation = 5;
        let (epoch, _) = begin_session_restore_locked(&mut runtime);
        assert!(session_restore_is_current_locked(&runtime, epoch, Some(5)));
        invalidate_session_restore_locked(&mut runtime);
        assert!(!session_restore_is_current_locked(&runtime, epoch, Some(5)));
        assert!(finalize_session_restore_locked(&mut runtime, epoch).is_none());
    }

    #[test]
    fn pagination_browser_input_requires_a_verified_viewport_hit() {
        let valid = AcademicPaginationDiagnostics {
            click_x: Some(320.5),
            click_y: Some(640.25),
            viewport_width: Some(1_280.0),
            viewport_height: Some(720.0),
            hit_test_matches: true,
            ..AcademicPaginationDiagnostics::default()
        };
        assert_eq!(
            academic_pagination_click_point(&valid),
            Some((320.5, 640.25))
        );

        let mut blocked = valid.clone();
        blocked.hit_test_matches = false;
        assert_eq!(academic_pagination_click_point(&blocked), None);

        let mut outside = valid;
        outside.click_y = Some(720.0);
        assert_eq!(academic_pagination_click_point(&outside), None);
    }

    #[test]
    fn only_read_only_adapter_callback_interruptions_are_retryable() {
        assert!(read_only_academic_inspection_error_is_retryable(
            "SIDERA_INSTITUTION_EVAL_TIMEOUT"
        ));
        assert!(read_only_academic_inspection_error_is_retryable(
            "SIDERA_INSTITUTION_EVAL_CANCELLED"
        ));
        assert!(!read_only_academic_inspection_error_is_retryable(
            "SIDERA_INSTITUTION_EVAL_FAILED"
        ));
        assert!(!read_only_academic_inspection_error_is_retryable(
            "SIDERA_INSTITUTION_QUERY_NOT_SUBMITTED"
        ));
    }

    #[test]
    fn fixed_adapter_never_reads_cookie_or_password_value() {
        let source = format!(
            "{DISCOVERY_AUTH_INSPECT_SCRIPT}\n{LIBRARY_AUTH_INSPECT_SCRIPT}\n{CATALOG_INSPECT_SCRIPT}\n{CATALOG_SUBMIT_SCRIPT}\n{DISCOVERY_ROUTE_SCRIPT}\n{ACADEMIC_FULL_TEXT_RESOLVE_SCRIPT}\n{ACADEMIC_FILTER_SCRIPT}\n{ACADEMIC_SINGLE_FILTER_SCRIPT}\n{ACADEMIC_NEXT_PAGE_SCRIPT}\n{ACADEMIC_INSPECT_SCRIPT}\n{ACADEMIC_SUBMIT_SCRIPT}"
        );
        assert!(!source.contains("document.cookie"));
        assert!(!source.contains("localStorage"));
        assert!(!source.contains("sessionStorage"));
        assert!(!source.contains(".value") || source.contains("input.value = query"));
        assert!(!source.contains("password').value"));
        assert!(!CATALOG_INSPECT_SCRIPT.contains("full-set-set|find-b"));
        assert!(CATALOG_INSPECT_SCRIPT.contains("navigationTitles"));
        assert!(CATALOG_INSPECT_SCRIPT.contains("sanitizedClone"));
        assert!(CATALOG_INSPECT_SCRIPT.contains("seenRecords"));
        assert!(CATALOG_INSPECT_SCRIPT.contains("pageSignature"));
        assert!(CATALOG_SUBMIT_SCRIPT.contains("pageSignature"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("journal-article"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("conference-paper"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("thesis"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("#searchBar"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("期刊论文|文章"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("_wanfang_"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("_cass_nssd_"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("candidate === 'undefined'"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("fullTextMarker ? detailUrl : null"));
        assert!(!ACADEMIC_INSPECT_SCRIPT.contains("cloneNode"));
        assert!(ACADEMIC_FULL_TEXT_RESOLVE_SCRIPT.contains("^阅读全文$"));
        assert!(ACADEMIC_FULL_TEXT_RESOLVE_SCRIPT.contains("链接到在线资源"));
        assert!(ACADEMIC_SUBMIT_SCRIPT.contains("pageSignature"));
        assert!(CATALOG_INSPECT_SCRIPT.contains("authenticated-landing"));
        assert!(DISCOVERY_ROUTE_SCRIPT.contains(".search-tabs > span"));
        assert!(ACADEMIC_INSPECT_SCRIPT.contains("prm-brief-result-container"));
        assert!(ACADEMIC_SUBMIT_SCRIPT.contains(".eng-search-style40 .btn-search"));
        assert!(DISCOVERY_ROUTE_SCRIPT.contains("珞珈学术搜索|学术搜索"));
        assert!(LIBRARY_AUTH_INSPECT_SCRIPT.contains("library-ready"));
        assert!(LIBRARY_AUTH_INSPECT_SCRIPT.contains("document.title"));
        assert!(LIBRARY_AUTH_INSPECT_SCRIPT.contains("/page/902099/show"));
        assert!(LIBRARY_AUTH_INSPECT_SCRIPT.contains("OFFICIAL_LIBRARY_LOGIN_LANDING"));
        assert!(DISCOVERY_AUTH_INSPECT_SCRIPT.contains(DISCOVERY_AUTH_ADAPTER_VERSION));
        assert!(DISCOVERY_AUTH_INSPECT_SCRIPT.contains("已登录"));
        assert!(DISCOVERY_AUTH_INSPECT_SCRIPT.contains("location.origin"));
        assert!(!DISCOVERY_AUTH_INSPECT_SCRIPT.contains("location.href"));
        assert!(!DISCOVERY_AUTH_INSPECT_SCRIPT.contains(".value"));
        assert!(ACADEMIC_FILTER_SCRIPT.contains("aria-pressed"));
        assert!(ACADEMIC_FILTER_SCRIPT.contains("mat-mdc-checkbox-checked"));
        assert!(ACADEMIC_FILTER_SCRIPT.contains("sequential-required"));
        assert!(ACADEMIC_SINGLE_FILTER_SCRIPT.contains("__SIDERA_FILTER_ID__"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("__SIDERA_EXPECTED_NEXT_PAGE__"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("__SIDERA_LOCATE_FOR_NATIVE_INPUT__"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("document.elementFromPoint"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("action: 'located'"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("=== expectedPage"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("[numberedNext, pagerArrow]"));
        assert!(!ACADEMIC_NEXT_PAGE_SCRIPT.contains("#load_more_button"));
        assert!(!ACADEMIC_NEXT_PAGE_SCRIPT.contains("prm-search-result-list"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("action: 'pending'"));
        assert!(!ACADEMIC_NEXT_PAGE_SCRIPT.contains("currentPage + 1"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("aria-current"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("data-ng-click"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("textLength"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("numericLabels"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("safeClassTokens"));
        assert!(ACADEMIC_NEXT_PAGE_SCRIPT.contains("controlKind"));
        assert!(ACADEMIC_INSPECT_SCRIPT
            .contains("!['journal-article', 'conference-paper', 'thesis'].includes(kind)"));
    }

    #[test]
    fn external_display_removes_query_and_fragment() {
        assert_eq!(
            safe_external_display_url("https://vendor.example/item?ticket=secret#part"),
            Some("https://vendor.example/item".to_string())
        );
        assert_eq!(
            safe_external_display_url("http://vendor.example/item"),
            Some("http://vendor.example/item".to_string())
        );
    }

    #[test]
    fn navigation_trace_is_bounded_and_never_serializes_query_material() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.webview_generation = 4;
        runtime.session.navigation_epoch = 9;
        for index in 0..40_u64 {
            append_navigation_event_locked(
                &mut runtime,
                4,
                Some(index + 1),
                SideraInstitutionAuthKind::DatabaseSso,
                SideraInstitutionNavigationPhase::Redirect,
                Some(&format!(
                    "https://www.metaauth.com/242010/login.html?ticket=secret-{index}#state"
                )),
                true,
                None,
            );
        }
        assert_eq!(runtime.session.navigation_trace.len(), 32);
        let payload = serde_json::to_string(&runtime.session.navigation_trace).unwrap();
        assert!(!payload.contains("ticket"));
        assert!(!payload.contains("secret"));
        assert!(!payload.contains("#state"));
        assert!(payload.contains("/242010/login.html"));
    }

    #[test]
    fn blocked_auth_navigation_is_terminal_before_timeout_can_fire() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.webview_generation = 7;
        runtime.pending_initial_navigation_epoch = Some(3);
        runtime.session.navigation_epoch = 3;
        runtime.session.active_auth_kind = Some(SideraInstitutionAuthKind::DatabaseSso);
        runtime.session.database_auth.status = SideraInstitutionAuthStatus::Starting;

        assert!(apply_blocked_navigation_locked(
            &mut runtime,
            7,
            "custom-auth://continue?ticket=secret",
            "POLICY_NON_NETWORK_SCHEME"
        ));
        assert_eq!(runtime.pending_initial_navigation_epoch, None);
        assert_eq!(
            runtime.session.database_auth.code,
            "SIDERA_INSTITUTION_NAVIGATION_BLOCKED"
        );
        assert_eq!(
            runtime
                .session
                .navigation_trace
                .last()
                .map(|event| event.phase),
            Some(SideraInstitutionNavigationPhase::Blocked)
        );
        assert_eq!(
            runtime
                .session
                .navigation_trace
                .last()
                .and_then(|event| event.web_error_status.as_deref()),
            Some("POLICY_NON_NETWORK_SCHEME")
        );
        assert_eq!(runtime.session.fallback_target_id, None);
    }

    #[test]
    fn webview_errors_are_safe_and_actionable() {
        assert_eq!(web_error_status_code(5), "WEBVIEW2_CERTIFICATE_IS_INVALID");
        assert_eq!(web_error_status_code(7), "WEBVIEW2_TIMEOUT");
        assert_eq!(web_error_status_code(13), "WEBVIEW2_HOST_NAME_NOT_RESOLVED");
        assert_eq!(web_error_status_code(999), "WEBVIEW2_UNRECOGNIZED");
    }

    #[test]
    fn academic_result_binding_rejects_late_task_epoch_sequence_and_generation() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.active_task_id = Some("task-current".to_string());
        runtime.webview_generation = 7;
        runtime.search.task_id = Some("task-current".to_string());
        runtime.search.epoch = 11;
        runtime.search.sequence = 23;
        let binding = AcademicResultWebviewBinding {
            label: "institution-whu-academic-result-11-20".to_string(),
            task_id: "task-current".to_string(),
            epoch: 11,
            task_sequence: 20,
            webview_generation: 7,
            ready: true,
            raw_visible: false,
        };
        assert!(binding.is_current_for(&runtime, "task-current"));

        runtime.search.epoch = 12;
        assert!(!binding.is_current_for(&runtime, "task-current"));
        runtime.search.epoch = 11;
        runtime.webview_generation = 8;
        assert!(!binding.is_current_for(&runtime, "task-current"));
        runtime.webview_generation = 7;
        runtime.active_task_id = Some("task-new".to_string());
        runtime.search.task_id = Some("task-new".to_string());
        assert!(!binding.is_current_for(&runtime, "task-current"));
    }

    #[test]
    fn structured_connector_result_keeps_two_observed_pages_and_remote_truth() {
        let first = parse_whu_structured_discovery_page(
            br#"{"info":{"total":11,"first":1,"last":10},"docs":[{"pnx":{"display":{"title":["First page"],"type":["article"]},"control":{"recordid":["first"]}}}]}"#,
        )
        .unwrap();
        let second = parse_whu_structured_discovery_page(
            br#"{"info":{"total":11,"first":11,"last":11},"docs":[{"pnx":{"display":{"title":["Second page"],"type":["conference paper"]},"control":{"recordid":["second"]}}}]}"#,
        )
        .unwrap();
        let structured = StructuredAcademicTransportState {
            accepted_page_identities: [first.page_identity.clone(), second.page_identity.clone()]
                .into_iter()
                .collect(),
            pages: vec![first, second],
            ..StructuredAcademicTransportState::default()
        };
        let result =
            structured_connector_result(&structured, &LiteratureSearchRequest::whu("evidence"))
                .unwrap();
        assert_eq!(result.pages_scanned, 2);
        assert_eq!(result.records.len(), 2);
        assert_eq!(result.total_hits, Some(11));
        assert_eq!(result.has_more, Some(false));
        assert_eq!(
            result.completion_reason,
            ResearchSearchCompletionReason::SourceExhausted
        );
        assert_eq!(
            result.transport,
            LiteratureConnectorTransport::StructuredApi
        );
    }

    #[test]
    fn structured_connector_result_uses_qualifying_count_for_target_truth() {
        let page = parse_whu_structured_discovery_page(
            br#"{"info":{"total":100,"first":1,"last":2},"docs":[{"pnx":{"display":{"title":["Qualifying article"],"type":["article"],"creationdate":["2021"]},"control":{"recordid":["article-1"]}}},{"pnx":{"display":{"title":["Filtered book"],"type":["book"],"creationdate":["2021"]},"control":{"recordid":["book-1"]}}}]}"#,
        )
        .unwrap();
        let structured = StructuredAcademicTransportState {
            accepted_page_identities: [page.page_identity.clone()].into_iter().collect(),
            pages: vec![page],
            ..StructuredAcademicTransportState::default()
        };
        let mut request = LiteratureSearchRequest::whu("evidence");
        request.result_limit = 2;

        let result = structured_connector_result(&structured, &request).unwrap();

        assert_eq!(result.records.len(), 2);
        assert_eq!(
            structured_qualifying_candidate_keys(&structured, &request).len(),
            1
        );
        assert_eq!(
            result.completion_reason,
            ResearchSearchCompletionReason::PartialFailure
        );
        assert!(result.partial);
    }

    #[test]
    fn structured_page_budget_is_partial_when_target_is_not_reached() {
        let page = parse_whu_structured_discovery_page(
            br#"{"info":{"total":100,"first":1,"last":1},"docs":[{"pnx":{"display":{"title":["One article"],"type":["article"]},"control":{"recordid":["article-1"]}}}]}"#,
        )
        .unwrap();
        let structured = StructuredAcademicTransportState {
            accepted_page_identities: [page.page_identity.clone()].into_iter().collect(),
            pages: vec![page],
            ..StructuredAcademicTransportState::default()
        };
        let mut request = LiteratureSearchRequest::whu("evidence");
        request.max_pages = 1;
        request.result_limit = 100;

        let result = structured_connector_result(&structured, &request).unwrap();

        assert_eq!(
            result.completion_reason,
            ResearchSearchCompletionReason::PageLimit
        );
        assert!(result.partial);
        assert_eq!(result.code, "SIDERA_RESEARCH_SEARCH_PAGE_LIMIT_REACHED");
    }

    #[test]
    fn structured_pagination_failure_keeps_verified_pages_partial() {
        let first = parse_whu_structured_discovery_page(
            br#"{"info":{"total":20,"first":1,"last":10},"docs":[{"pnx":{"display":{"title":["Verified"],"type":["article"]},"control":{"recordid":["verified"]}}}]}"#,
        )
        .unwrap();
        let structured = StructuredAcademicTransportState {
            accepted_page_identities: [first.page_identity.clone()].into_iter().collect(),
            pages: vec![first],
            failure_code: Some(STRUCTURED_PAGINATION_STALLED.to_string()),
            pending_pagination: None,
        };
        let result =
            structured_connector_result(&structured, &LiteratureSearchRequest::whu("evidence"))
                .unwrap();
        assert_eq!(result.records.len(), 1);
        assert!(result.partial);
        assert_eq!(result.code, STRUCTURED_PAGINATION_STALLED);
        assert_eq!(
            result.completion_reason,
            ResearchSearchCompletionReason::PartialFailure
        );
    }

    #[test]
    fn discovery_auth_binding_rejects_old_popup_callbacks_and_keeps_resume_identity() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        let InstitutionConnectionBeginOutcome::Started(connection_token) = runtime
            .connection
            .begin(SideraInstitutionConnectionGoal::DiscoveryFulltext, false, 1)
        else {
            panic!("discovery connection must start");
        };
        let expected = AcademicDiscoveryAuthBinding {
            connection_token,
            auth_epoch: 4,
            parent_label: "institution-whu-academic-result-11-20".to_string(),
            parent_task_id: "task-current".to_string(),
            parent_epoch: 11,
            parent_task_sequence: 20,
            webview_generation: 7,
            resume: Some(AcademicSearchResumeContext {
                task_id: "task-current".to_string(),
                epoch: 11,
                sequence: 23,
                webview_generation: 7,
                query: "人工智能".to_string(),
                result_webview_label: "institution-whu-academic-result-11-20".to_string(),
                phase: SideraInstitutionSearchStage::FacetProcessing,
            }),
            closing: false,
        };
        runtime.active_task_id = Some("task-current".to_string());
        runtime.webview_generation = 7;
        runtime.search.task_id = Some("task-current".to_string());
        runtime.search.epoch = 11;
        runtime.search.sequence = 24;
        runtime.search.query = "人工智能".to_string();
        runtime.search.source = SideraInstitutionSearchSource::AcademicDiscovery;
        runtime.academic_discovery_auth = Some(expected.clone());

        assert!(discovery_auth_binding_is_current(&runtime, &expected));
        assert!(discovery_resume_is_current(
            &runtime,
            expected.resume.as_ref().unwrap()
        ));

        let mut old = expected.clone();
        old.auth_epoch = 3;
        assert!(!discovery_auth_binding_is_current(&runtime, &old));
        runtime.active_task_id = Some("task-new".to_string());
        runtime.search.task_id = Some("task-new".to_string());
        assert!(!discovery_resume_is_current(
            &runtime,
            expected.resume.as_ref().unwrap()
        ));
    }

    #[test]
    fn discovery_auth_destroyed_defers_to_active_close_verification() {
        assert!(discovery_auth_destroyed_requires_cancel(
            Some(SideraInstitutionConnectionPhase::Opening),
            false,
        ));
        assert!(discovery_auth_destroyed_requires_cancel(
            Some(SideraInstitutionConnectionPhase::AwaitingUser),
            false,
        ));
        assert!(!discovery_auth_destroyed_requires_cancel(
            Some(SideraInstitutionConnectionPhase::Verifying),
            false,
        ));
        assert!(!discovery_auth_destroyed_requires_cancel(
            Some(SideraInstitutionConnectionPhase::RefreshingParent),
            false,
        ));
        assert!(!discovery_auth_destroyed_requires_cancel(
            Some(SideraInstitutionConnectionPhase::AwaitingUser),
            true,
        ));
    }

    #[test]
    fn filter_failure_has_a_terminal_non_zero_snapshot_stage() {
        assert_eq!(
            search_error_stage("SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED"),
            SideraInstitutionSearchStage::FilterUnconfirmed
        );
        assert_eq!(
            search_error_stage("SIDERA_INSTITUTION_ADAPTER_DRIFT"),
            SideraInstitutionSearchStage::AdapterDrift
        );
        assert_ne!(
            search_error_stage("SIDERA_INSTITUTION_ACADEMIC_FILTER_UNCONFIRMED"),
            SideraInstitutionSearchStage::NativeSnapshotComplete
        );
    }

    fn research_progress_record(index: usize) -> SideraInstitutionAdapterPage {
        SideraInstitutionAdapterPage {
            kind: "records".to_string(),
            title: "Fixture".to_string(),
            url: "https://discovery.example/results".to_string(),
            message: String::new(),
            page_signature: format!("page-{index}"),
            query_echo: Some("人工智能".to_string()),
            explicit_zero_results: false,
            buckets: Vec::new(),
            records: vec![
                research_hotspots_core::institution_search::SideraInstitutionAdapterRecord {
                    title: format!("Candidate {index}"),
                    authors: Some("Author".to_string()),
                    year: Some(2024),
                    publication: Some("Journal".to_string()),
                    document_type: Some("article".to_string()),
                    doi: Some(format!("10.1000/{index}")),
                    abstract_snippet: None,
                    availability: None,
                    detail_url: format!("https://discovery.example/record/{index}"),
                    full_text_url: None,
                    record_kind: SideraInstitutionRecordKind::JournalArticle,
                    journal: Some("Journal".to_string()),
                    conference: None,
                    degree_institution: None,
                    volume: None,
                    issue: None,
                    pages: None,
                    source_provider: Some(if index % 2 == 0 { "万方" } else { "NSSD" }.to_string()),
                    full_text_status: research_hotspots_core::institution_search::SideraInstitutionFullTextStatus::Unknown,
                    provider_record_id: Some(format!("record-{index}")),
                    catalog_record_id: None,
                    isbn_issn: None,
                },
            ],
        }
    }

    #[test]
    fn research_collection_progress_uses_rust_owned_page_and_result_budgets() {
        let mut request = LiteratureSearchRequest::whu("人工智能");
        request.result_limit = 100;
        request.max_pages = 20;
        let mut progress = AcademicCollectionProgress::new(Some(request));
        for index in 0..20 {
            progress.observe(&research_progress_record(index));
        }
        assert_eq!(progress.pages_scanned, 20);
        assert_eq!(progress.qualifying_keys.len(), 20);
        assert!(progress.global_budget_reached());
        assert!(!progress.limit_reached);

        let mut request = LiteratureSearchRequest::whu("人工智能");
        request.result_limit = 40;
        let mut progress = AcademicCollectionProgress::new(Some(request));
        for index in 0..40 {
            progress.observe(&research_progress_record(index));
        }
        assert!(progress.limit_reached);
        assert_eq!(progress.qualifying_keys.len(), 40);
    }

    #[test]
    fn sequential_facet_budget_reserves_pages_for_every_requested_type() {
        let mut request = LiteratureSearchRequest::whu("machine learning");
        request.max_pages = 20;
        let mut progress = AcademicCollectionProgress::new(Some(request));
        progress.note_page_without_candidates();

        assert_eq!(progress.fair_sequential_facet_budget(2), 10);
        for index in 0..10 {
            progress.observe(&research_progress_record(index));
        }
        assert!(!progress.global_budget_reached());
        assert_eq!(progress.fair_sequential_facet_budget(1), 9);
    }

    #[test]
    fn scope_budget_does_not_replace_the_global_page_budget() {
        let mut request = LiteratureSearchRequest::whu("人工智能");
        request.max_pages = 20;
        let progress = AcademicCollectionProgress::new(Some(request));
        assert!(progress.scope_budget_reached(10, Some(10)));
        assert!(!progress.global_budget_reached());
    }

    #[test]
    fn research_transport_and_limit_share_the_strict_academic_record_gate() {
        let request = LiteratureSearchRequest::whu("人工智能");
        let mut invalid_page = research_progress_record(1);
        invalid_page.records[0].title = "高级检索".to_string();
        assert!(!research_transport_accepts_record(&invalid_page.records[0]));

        let mut progress = AcademicCollectionProgress::new(Some(request));
        progress.observe(&invalid_page);
        assert_eq!(progress.pages_scanned, 1);
        assert!(progress.qualifying_keys.is_empty());

        let valid_page = research_progress_record(2);
        assert!(research_transport_accepts_record(&valid_page.records[0]));
        progress.observe_records(&valid_page);
        assert_eq!(progress.pages_scanned, 1);
        assert_eq!(progress.qualifying_keys.len(), 1);
    }

    #[test]
    fn requested_facets_follow_the_validated_type_subset() {
        let mut request = LiteratureSearchRequest::whu("人工智能");
        request.filters.record_kinds = vec![
            SideraInstitutionRecordKind::ConferencePaper,
            SideraInstitutionRecordKind::Thesis,
        ];
        assert_eq!(
            requested_academic_facets(Some(&request)),
            vec!["conference-paper", "thesis"]
        );
        assert_eq!(
            requested_academic_facets(None),
            vec!["article", "conference-paper", "thesis"]
        );
    }

    #[test]
    fn legacy_auth_kinds_map_to_the_single_connection_goal_contract() {
        assert_eq!(
            auth_kind_connection_goal(SideraInstitutionAuthKind::DatabaseSso),
            SideraInstitutionConnectionGoal::DatabaseAccess
        );
        assert_eq!(
            auth_kind_connection_goal(SideraInstitutionAuthKind::LibraryAccount),
            SideraInstitutionConnectionGoal::LibraryAccount
        );
        assert_eq!(
            connection_goal_auth_kind(SideraInstitutionConnectionGoal::DiscoveryFulltext),
            None
        );
        assert_eq!(INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS, 4_000);
    }

    #[test]
    fn connection_cancel_keeps_a_previously_proven_database_ready() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.session.database_auth.status = SideraInstitutionAuthStatus::Ready;
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::DatabaseAccess,
        ) else {
            panic!("connection must start");
        };
        let outcome = finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Cancelled,
            "SIDERA_INSTITUTION_CONNECTION_CANCELLED",
            "cancelled",
            None,
        )
        .expect("current connection must finalize");
        assert!(outcome.keep_previous_ready);
        assert_eq!(
            runtime.session.database_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
        assert_eq!(
            runtime
                .session
                .active_connection
                .as_ref()
                .map(|connection| connection.phase),
            Some(SideraInstitutionConnectionPhase::Cancelled)
        );
        assert!(finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Failed,
            "LATE",
            "late",
            None,
        )
        .is_none());
    }

    #[test]
    fn proven_capability_survives_transient_failure_but_explicit_login_page_invalidates_it() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.session.library_account_auth.status = SideraInstitutionAuthStatus::Ready;
        set_auth_state_locked(
            &mut runtime,
            SideraInstitutionAuthKind::LibraryAccount,
            SideraInstitutionAuthStatus::Failed,
            "TRANSIENT",
            "transient",
            None,
        );
        assert_eq!(
            runtime.session.library_account_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("connection must start");
        };
        set_auth_state_locked(
            &mut runtime,
            SideraInstitutionAuthKind::LibraryAccount,
            SideraInstitutionAuthStatus::LoginRequired,
            "LOGIN_PROMPT",
            "login prompt",
            None,
        );
        assert_eq!(
            runtime.session.library_account_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
        set_explicit_auth_login_required_locked(
            &mut runtime,
            SideraInstitutionAuthKind::LibraryAccount,
            "EXPLICIT_LOGIN_REQUIRED",
            "login required",
            None,
        );
        assert_eq!(
            runtime.session.library_account_auth.status,
            SideraInstitutionAuthStatus::LoginRequired
        );
        let outcome = finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Cancelled,
            "SIDERA_INSTITUTION_CONNECTION_CANCELLED",
            "cancelled",
            None,
        )
        .expect("current connection must finalize");
        assert!(!outcome.keep_previous_ready);
        assert_eq!(
            runtime.session.library_account_auth.status,
            SideraInstitutionAuthStatus::LoginRequired
        );
    }

    #[test]
    fn ready_terminal_ignores_late_login_required_page_observation() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.session.library_account_auth.status = SideraInstitutionAuthStatus::Ready;
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("connection must start");
        };
        finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Ready,
            "READY",
            "ready",
            None,
        )
        .expect("connection must finalize");
        set_explicit_auth_login_required_locked(
            &mut runtime,
            SideraInstitutionAuthKind::LibraryAccount,
            "LATE_LOGIN_REQUIRED",
            "late",
            None,
        );
        assert_eq!(
            runtime.session.library_account_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
        assert!(!apply_connection_login_required_observation_locked(
            &mut runtime,
            &token,
            None,
        ));
        assert!(
            finalize_connection_login_required_verification_locked(&mut runtime, &token, None,)
                .is_none()
        );
        assert_eq!(
            runtime.session.library_account_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
    }

    #[test]
    fn library_parent_observation_requires_active_matching_navigation() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.webview_generation = 7;
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("connection must start");
        };
        runtime.pending_initial_navigation_epoch = Some(3);
        runtime.pending_initial_navigation_connection = Some(token.clone());
        assert!(library_parent_popup_is_authorized_locked(&runtime, 7));
        assert!(pending_initial_navigation_is_current_locked(
            &runtime,
            7,
            3,
            Some(&token),
        ));
        let (state, claimed) = claim_library_parent_observation_locked(
            &mut runtime,
            7,
            Some("www.lib.whu.edu.cn".to_string()),
        )
        .expect("active library navigation must be claimed");
        assert_eq!(claimed, token);
        assert_eq!(
            state.library_account_auth.status,
            SideraInstitutionAuthStatus::Starting
        );
        assert_eq!(
            state.library_account_auth.code,
            "SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING"
        );
        assert_eq!(runtime.pending_initial_navigation_epoch, None);
        assert_eq!(runtime.pending_initial_navigation_connection, None);

        runtime.pending_initial_navigation_epoch = Some(4);
        runtime.pending_initial_navigation_connection = Some(token.clone());
        assert!(advance_connection_locked(
            &mut runtime,
            &token,
            SideraInstitutionConnectionPhase::Verifying,
            "VERIFYING",
            "verifying",
        ));
        let capability_code = runtime.session.library_account_auth.code.clone();
        assert!(claim_library_parent_observation_locked(&mut runtime, 7, None).is_none());
        assert_eq!(runtime.session.library_account_auth.code, capability_code);
        assert!(!pending_initial_navigation_is_current_locked(
            &runtime,
            7,
            4,
            Some(&token),
        ));
    }

    #[test]
    fn terminal_library_connection_rejects_delayed_parent_pending_and_timeout() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        runtime.webview_generation = 9;
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("connection must start");
        };
        runtime.pending_initial_navigation_epoch = Some(5);
        runtime.pending_initial_navigation_connection = Some(token.clone());
        finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Cancelled,
            "CANCELLED",
            "cancelled",
            None,
        )
        .expect("connection must finalize");
        assert!(!library_parent_popup_is_authorized_locked(&runtime, 9));
        assert_eq!(runtime.pending_initial_navigation_epoch, None);
        assert_eq!(runtime.pending_initial_navigation_connection, None);

        let terminal_status = runtime.session.library_account_auth.status;
        let terminal_code = runtime.session.library_account_auth.code.clone();
        let terminal_updated_at = runtime.session.library_account_auth.updated_at_ms;
        runtime.pending_initial_navigation_epoch = Some(5);
        runtime.pending_initial_navigation_connection = Some(token.clone());
        assert!(claim_library_parent_observation_locked(&mut runtime, 9, None).is_none());
        assert!(!pending_initial_navigation_is_current_locked(
            &runtime,
            9,
            5,
            Some(&token),
        ));
        set_auth_state_locked(
            &mut runtime,
            SideraInstitutionAuthKind::LibraryAccount,
            SideraInstitutionAuthStatus::Starting,
            "LATE_PENDING",
            "late",
            None,
        );
        assert_eq!(runtime.session.library_account_auth.status, terminal_status);
        assert_eq!(runtime.session.library_account_auth.code, terminal_code);
        assert_eq!(
            runtime.session.library_account_auth.updated_at_ms,
            terminal_updated_at
        );

        let mut legacy_runtime = SideraInstitutionRuntimeInner::default();
        legacy_runtime.webview_generation = 9;
        legacy_runtime.session.active_auth_kind = Some(SideraInstitutionAuthKind::LibraryAccount);
        assert!(library_parent_popup_is_authorized_locked(
            &legacy_runtime,
            9
        ));
    }

    #[test]
    fn library_connection_popup_requires_current_active_library_transaction() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        let InstitutionConnectionBeginOutcome::Started(library_token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("library connection must start");
        };
        assert!(library_connection_popup_is_authorized_locked(
            &runtime,
            &library_token,
        ));
        assert!(advance_connection_locked(
            &mut runtime,
            &library_token,
            SideraInstitutionConnectionPhase::AwaitingUser,
            "AWAITING",
            "awaiting",
        ));
        assert!(library_connection_popup_is_authorized_locked(
            &runtime,
            &library_token,
        ));
        assert!(advance_connection_locked(
            &mut runtime,
            &library_token,
            SideraInstitutionConnectionPhase::Verifying,
            "VERIFYING",
            "verifying",
        ));
        assert!(!library_connection_popup_is_authorized_locked(
            &runtime,
            &library_token,
        ));

        runtime.connection.reset();
        let InstitutionConnectionBeginOutcome::Started(database_token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::DatabaseAccess,
        ) else {
            panic!("database connection must start");
        };
        assert!(!library_connection_popup_is_authorized_locked(
            &runtime,
            &library_token,
        ));
        assert!(!library_connection_popup_is_authorized_locked(
            &runtime,
            &database_token,
        ));
    }

    #[test]
    fn connection_coordinator_exclusively_owns_auth_until_terminal() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        assert!(!active_connection_owns_auth_locked(&runtime));
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("library connection must start");
        };
        assert!(active_connection_owns_auth_locked(&runtime));

        finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Cancelled,
            "CANCELLED",
            "cancelled",
            None,
        )
        .expect("connection must finalize");
        assert!(!active_connection_owns_auth_locked(&runtime));
    }

    #[test]
    fn library_connection_popup_binding_ignores_stale_destroy_and_clears_on_finalize() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        let InstitutionConnectionBeginOutcome::Started(first_token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("first library connection must start");
        };
        assert!(bind_library_connection_popup_locked(
            &mut runtime,
            &first_token,
        ));
        assert!(library_connection_popup_is_bound_locked(
            &runtime,
            &first_token,
        ));

        runtime.connection.reset();
        let InstitutionConnectionBeginOutcome::Started(second_token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("second library connection must start");
        };
        assert!(bind_library_connection_popup_locked(
            &mut runtime,
            &second_token,
        ));
        assert!(!clear_matching_library_connection_popup_locked(
            &mut runtime,
            &first_token,
        ));
        assert!(library_connection_popup_is_bound_locked(
            &runtime,
            &second_token,
        ));

        finalize_connection_locked(
            &mut runtime,
            &second_token,
            InstitutionConnectionTerminal::Ready,
            "READY",
            "ready",
            None,
        )
        .expect("connection must finalize");
        assert!(runtime.connection_auth_popup_token.is_none());
    }

    #[test]
    fn library_popup_destroy_refreshes_parent_only_while_transaction_is_active() {
        let mut runtime = SideraInstitutionRuntimeInner::default();
        let InstitutionConnectionBeginOutcome::Started(token) = begin_connection_locked(
            &mut runtime,
            SideraInstitutionConnectionGoal::LibraryAccount,
        ) else {
            panic!("library connection must start");
        };
        assert!(bind_library_connection_popup_locked(&mut runtime, &token));
        assert!(clear_matching_library_connection_popup_locked(
            &mut runtime,
            &token,
        ));
        let state = claim_library_connection_popup_parent_refresh_locked(&mut runtime, &token)
            .expect("active popup destruction must claim a parent refresh");
        assert_eq!(
            state.active_connection.as_ref().map(|value| value.phase),
            Some(SideraInstitutionConnectionPhase::AwaitingUser),
        );
        assert_eq!(
            state.library_account_auth.status,
            SideraInstitutionAuthStatus::Starting,
        );
        assert_eq!(
            state.library_account_auth.code,
            "SIDERA_INSTITUTION_LIBRARY_PAGE_INSPECTION_PENDING",
        );

        finalize_connection_locked(
            &mut runtime,
            &token,
            InstitutionConnectionTerminal::Ready,
            "READY",
            "ready",
            None,
        )
        .expect("connection must finalize");
        let terminal_state = runtime.session.clone();
        assert!(
            claim_library_connection_popup_parent_refresh_locked(&mut runtime, &token).is_none()
        );
        assert_eq!(runtime.session, terminal_state);
    }

    #[test]
    fn library_close_verification_keeps_the_popup_environment_and_refresh_budget() {
        assert_eq!(
            connection_close_current_attempts(SideraInstitutionConnectionGoal::LibraryAccount),
            1,
        );
        assert_eq!(
            connection_parent_verification_route(SideraInstitutionConnectionGoal::LibraryAccount,),
            InstitutionConnectionParentVerificationRoute::SameVisibleLibraryLanding,
        );
        for goal in [
            SideraInstitutionConnectionGoal::DatabaseAccess,
            SideraInstitutionConnectionGoal::DiscoveryFulltext,
        ] {
            assert_eq!(connection_close_current_attempts(goal), 3);
            assert_eq!(
                connection_parent_verification_route(goal),
                InstitutionConnectionParentVerificationRoute::HiddenBoundParentReload,
            );
        }
    }

    #[test]
    fn close_verification_prefers_current_or_parent_ready_and_keeps_unknown_unknown() {
        assert_eq!(
            resolve_connection_close_inspection(
                InstitutionConnectionInspection::Ready,
                InstitutionConnectionInspection::Unknown,
            ),
            InstitutionConnectionInspection::Ready
        );
        assert_eq!(
            resolve_connection_close_inspection(
                InstitutionConnectionInspection::Unknown,
                InstitutionConnectionInspection::Ready,
            ),
            InstitutionConnectionInspection::Ready
        );
        assert_eq!(
            resolve_connection_close_inspection(
                InstitutionConnectionInspection::LoginRequired,
                InstitutionConnectionInspection::Ready,
            ),
            InstitutionConnectionInspection::Ready
        );
        assert_eq!(
            resolve_connection_close_inspection(
                InstitutionConnectionInspection::Unknown,
                InstitutionConnectionInspection::Unknown,
            ),
            InstitutionConnectionInspection::Unknown
        );
    }

    #[test]
    fn close_eval_slice_and_page_observation_are_bounded() {
        assert!(
            CONNECTION_CLOSE_EVAL_SLICE
                < Duration::from_millis(INSTITUTION_CONNECTION_CLOSE_VERIFY_BUDGET_MS)
        );
        assert_eq!(CONNECTION_PAGE_OBSERVATION_ATTEMPTS, 4);
        assert!(CONNECTION_PAGE_OBSERVATION_EVAL_TIMEOUT <= Duration::from_millis(800));
    }
}
