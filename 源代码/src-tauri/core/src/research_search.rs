use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use crate::institution_search::{
    validate_institution_query, SideraInstitutionAdapterRecord, SideraInstitutionFullTextRoute,
    SideraInstitutionFullTextStatus, SideraInstitutionRecordKind, INSTITUTION_BUCKET_ITEM_LIMIT,
    INSTITUTION_TOTAL_ITEM_LIMIT,
};

pub const WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID: &str = "whu-academic-discovery-v2";
pub const RESEARCH_SEARCH_TIMEOUT_MS: u64 = 90_000;
pub const RESEARCH_SEARCH_MAX_PAGES: usize = 20;
pub const RESEARCH_SEARCH_MAX_ITEMS: usize = INSTITUTION_TOTAL_ITEM_LIMIT;
pub const RESEARCH_SEARCH_SOURCE_ITEM_LIMIT: usize = INSTITUTION_BUCKET_ITEM_LIMIT;
pub const RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT: usize = RESEARCH_SEARCH_MAX_ITEMS;
pub const RESEARCH_SEARCH_MAX_RESULT_LIMIT: usize = 100;
const RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT: usize = 32;

pub fn fair_sequential_page_budget(remaining_pages: usize, remaining_facets: usize) -> usize {
    let remaining_facets = remaining_facets.max(1);
    remaining_pages.saturating_add(remaining_facets.saturating_sub(1)) / remaining_facets
}

fn default_research_search_result_limit() -> usize {
    RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LiteratureConnectorTransport {
    StructuredApi,
    SessionWebRequest,
    DomFallback,
}

impl Default for LiteratureConnectorTransport {
    fn default() -> Self {
        Self::DomFallback
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiteratureConnectorCapabilities {
    pub connector_id: String,
    pub institution_id: String,
    pub transport: LiteratureConnectorTransport,
    pub record_kinds: Vec<SideraInstitutionRecordKind>,
    pub requires_institution_session: bool,
    pub supports_pagination: bool,
    pub supports_full_text_resolution: bool,
    pub requires_page_facet_confirmation: bool,
    pub experimental_fallback: bool,
}

pub fn whu_academic_discovery_v2_capabilities() -> LiteratureConnectorCapabilities {
    LiteratureConnectorCapabilities {
        connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
        institution_id: "whu".to_string(),
        // The orchestrator is ready for a structured/session transport, but the
        // current WHU runtime must prove such a route from protocol evidence
        // before advertising it.  Until then the only executable extractor is
        // the versioned DOM fallback.
        transport: LiteratureConnectorTransport::DomFallback,
        record_kinds: supported_paper_kinds(),
        requires_institution_session: true,
        supports_pagination: true,
        supports_full_text_resolution: true,
        // V2 accepts typed records from a structured connector response. A remote
        // page may expose facets, but proving all facet controls is not a generic
        // success condition for the research-search service.
        requires_page_facet_confirmation: false,
        experimental_fallback: true,
    }
}

pub trait LiteratureConnector {
    fn capabilities(&self) -> LiteratureConnectorCapabilities;

    fn search(
        &mut self,
        request: &LiteratureSearchRequest,
    ) -> Result<LiteratureConnectorSearchResult, LiteratureConnectorFailure>;
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiteratureSearchFilters {
    #[serde(default)]
    pub record_kinds: Vec<SideraInstitutionRecordKind>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    #[serde(default)]
    pub full_text_only: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiteratureSearchRequest {
    pub institution_id: String,
    #[serde(default)]
    pub connector_ids: Vec<String>,
    pub query: String,
    #[serde(default)]
    pub filters: LiteratureSearchFilters,
    pub cursor: Option<String>,
    pub page_size: usize,
    pub max_pages: usize,
    pub timeout_ms: u64,
    #[serde(default = "default_research_search_result_limit")]
    pub result_limit: usize,
}

impl LiteratureSearchRequest {
    pub fn whu(query: impl Into<String>) -> Self {
        Self {
            institution_id: "whu".to_string(),
            connector_ids: vec![WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string()],
            query: query.into(),
            filters: LiteratureSearchFilters {
                record_kinds: supported_paper_kinds(),
                ..LiteratureSearchFilters::default()
            },
            cursor: None,
            page_size: RESEARCH_SEARCH_SOURCE_ITEM_LIMIT,
            max_pages: RESEARCH_SEARCH_MAX_PAGES,
            timeout_ms: RESEARCH_SEARCH_TIMEOUT_MS,
            result_limit: RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT,
        }
    }
}

pub fn validate_literature_search_request(
    mut request: LiteratureSearchRequest,
) -> Result<LiteratureSearchRequest, &'static str> {
    request.query = validate_institution_query(&request.query)?;
    request.institution_id = request.institution_id.trim().to_string();
    if request.institution_id.is_empty() {
        return Err("SIDERA_RESEARCH_SEARCH_INSTITUTION_REQUIRED");
    }
    if request.connector_ids.is_empty() {
        request
            .connector_ids
            .push(WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string());
    }
    request.connector_ids = request
        .connector_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if request.connector_ids.is_empty() {
        return Err("SIDERA_RESEARCH_SEARCH_CONNECTOR_REQUIRED");
    }
    if request.page_size == 0 {
        request.page_size = RESEARCH_SEARCH_SOURCE_ITEM_LIMIT;
    }
    if request.page_size > RESEARCH_SEARCH_MAX_ITEMS {
        return Err("SIDERA_RESEARCH_SEARCH_PAGE_SIZE_INVALID");
    }
    if request.max_pages == 0 {
        request.max_pages = RESEARCH_SEARCH_MAX_PAGES;
    }
    if request.max_pages > RESEARCH_SEARCH_MAX_PAGES {
        return Err("SIDERA_RESEARCH_SEARCH_PAGE_LIMIT_EXCEEDED");
    }
    if request.timeout_ms == 0 {
        request.timeout_ms = RESEARCH_SEARCH_TIMEOUT_MS;
    }
    if request.timeout_ms > RESEARCH_SEARCH_TIMEOUT_MS {
        return Err("SIDERA_RESEARCH_SEARCH_TIMEOUT_EXCEEDED");
    }
    if !matches!(request.result_limit, 40 | 100) {
        return Err("SIDERA_RESEARCH_SEARCH_RESULT_LIMIT_INVALID");
    }
    if let (Some(from), Some(to)) = (request.filters.year_from, request.filters.year_to) {
        if from > to {
            return Err("SIDERA_RESEARCH_SEARCH_YEAR_RANGE_INVALID");
        }
    }
    let requested_kinds = if request.filters.record_kinds.is_empty() {
        supported_paper_kinds()
    } else {
        let mut kinds = Vec::new();
        for kind in request.filters.record_kinds {
            if is_supported_paper_kind(&kind) && !kinds.contains(&kind) {
                kinds.push(kind);
            }
        }
        kinds
    };
    if requested_kinds.is_empty() {
        return Err("SIDERA_RESEARCH_SEARCH_RECORD_KIND_REQUIRED");
    }
    request.filters.record_kinds = requested_kinds;
    Ok(request)
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiteratureConnectorSearchResult {
    pub connector_id: String,
    pub connector_version: String,
    #[serde(default)]
    pub transport: LiteratureConnectorTransport,
    #[serde(default)]
    pub observed_transport: Option<LiteratureConnectorTransport>,
    pub source_id: String,
    pub source_name: String,
    pub pages_scanned: usize,
    #[serde(default)]
    pub explicit_zero_results: bool,
    #[serde(default)]
    pub partial: bool,
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub records: Vec<SideraInstitutionAdapterRecord>,
    #[serde(default)]
    pub retrieval_positions: Vec<ResearchSearchRetrievalPosition>,
    #[serde(default)]
    pub total_hits: Option<usize>,
    #[serde(default)]
    pub has_more: Option<bool>,
    #[serde(default)]
    pub completion_reason: ResearchSearchCompletionReason,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiteratureConnectorFailure {
    pub connector_id: String,
    pub source_id: String,
    pub source_name: String,
    #[serde(default)]
    pub pages_scanned: usize,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchSearchSourceStatus {
    Complete,
    Partial,
    Failed,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchSearchCompletionReason {
    #[default]
    InProgress,
    ResultLimit,
    PageLimit,
    Timeout,
    ExplicitZeroResults,
    SourceExhausted,
    PartialFailure,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchSearchOrderBasis {
    #[default]
    SourceReturnOrder,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchRetrievalPosition {
    pub connector_id: String,
    pub rank: usize,
    pub page: usize,
    pub position: usize,
    pub facet: Option<String>,
    #[serde(default)]
    pub basis: ResearchSearchRetrievalPositionBasis,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchSearchRetrievalPositionBasis {
    Observed,
    #[default]
    Synthesized,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchProviderBreakdown {
    pub provider_id: String,
    pub provider_name: String,
    pub records_received: usize,
    pub records_accepted: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchSourceReport {
    pub connector_id: String,
    pub connector_version: String,
    pub transport: LiteratureConnectorTransport,
    pub observed_transport: Option<LiteratureConnectorTransport>,
    pub source_id: String,
    pub source_name: String,
    pub status: ResearchSearchSourceStatus,
    pub pages_scanned: usize,
    pub records_received: usize,
    pub records_accepted: usize,
    pub excluded_non_paper: usize,
    pub excluded_unknown: usize,
    pub excluded_invalid: usize,
    pub explicit_zero_results: bool,
    #[serde(default)]
    pub provider_breakdown: Vec<ResearchSearchProviderBreakdown>,
    #[serde(default)]
    pub total_hits: Option<usize>,
    #[serde(default)]
    pub has_more: Option<bool>,
    #[serde(default)]
    pub completion_reason: ResearchSearchCompletionReason,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedCandidateDraft {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub first_author: Option<String>,
    pub year: Option<i32>,
    pub doi: Option<String>,
    pub source_database: String,
    pub source_ids: Vec<String>,
    pub provider_record_id: Option<String>,
    #[serde(default, skip_serializing)]
    pub canonical_url: Option<String>,
    pub venue: Option<String>,
    pub journal: Option<String>,
    pub conference: Option<String>,
    pub degree_institution: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub pages: Option<String>,
    pub abstract_text: Option<String>,
    pub record_kind: SideraInstitutionRecordKind,
    pub full_text_status: SideraInstitutionFullTextStatus,
    pub full_text_route: SideraInstitutionFullTextRoute,
    #[serde(default)]
    pub detail_locator: Option<String>,
    #[serde(default)]
    pub full_text_locator: Option<String>,
    #[serde(default, skip_serializing)]
    pub full_text_url: Option<String>,
    pub connector_ids: Vec<String>,
    pub producer_versions: Vec<String>,
    pub field_provenance: BTreeMap<String, CandidateFieldProvenance>,
    #[serde(default)]
    pub retrieval_position: ResearchSearchRetrievalPosition,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchTruth {
    pub result_limit: usize,
    /// Backward-compatible mirror of `target_reached`.
    pub limit_reached: bool,
    #[serde(default)]
    pub target_reached: bool,
    #[serde(default)]
    pub has_more: Option<bool>,
    pub pages_scanned: usize,
    pub records_received: usize,
    pub records_accepted: usize,
    pub duplicates_merged: usize,
    pub total_hits: Option<usize>,
    pub coverage: usize,
    pub completion_reason: ResearchSearchCompletionReason,
    pub order_basis: ResearchSearchOrderBasis,
}

impl Default for ResearchSearchTruth {
    fn default() -> Self {
        Self {
            result_limit: RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT,
            limit_reached: false,
            target_reached: false,
            has_more: None,
            pages_scanned: 0,
            records_received: 0,
            records_accepted: 0,
            duplicates_merged: 0,
            total_hits: None,
            coverage: 0,
            completion_reason: ResearchSearchCompletionReason::InProgress,
            order_basis: ResearchSearchOrderBasis::SourceReturnOrder,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateFieldProvenance {
    pub connector_id: String,
    pub connector_version: String,
    pub source_id: String,
    pub source_field: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResearchSearchStatus {
    Idle,
    CheckingSession,
    AwaitingUserAuth,
    ResolvingConnectors,
    Searching,
    Normalizing,
    Complete,
    Partial,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchRun {
    pub task_id: String,
    pub epoch: u64,
    pub sequence: u64,
    pub request: LiteratureSearchRequest,
    pub status: ResearchSearchStatus,
    pub candidates: Vec<NormalizedCandidateDraft>,
    pub source_reports: Vec<ResearchSearchSourceReport>,
    #[serde(default)]
    pub truth: ResearchSearchTruth,
    pub code: String,
    pub message: String,
    pub started_at_ms: u128,
    pub updated_at_ms: u128,
    pub finished_at_ms: Option<u128>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSearchToken {
    pub task_id: String,
    pub client_request_id: String,
    pub epoch: u64,
    pub sequence: u64,
    pub webview_generation: u64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraResearchSearchStartReason {
    #[default]
    UserSearch,
    Retry,
    Compatibility,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraResearchSearchAttempt {
    pub client_request_id: String,
    pub start_reason: SideraResearchSearchStartReason,
    pub webview_generation: u64,
    #[serde(default)]
    pub auth_context: Option<SideraResearchSearchAuthContext>,
    #[serde(flatten)]
    pub run: ResearchSearchRun,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraResearchSearchAuthGoal {
    DiscoveryFulltext,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraResearchSearchAuthPhase {
    AwaitingUser,
    Verifying,
    RefreshingParent,
    Resuming,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraResearchSearchAuthContext {
    pub goal: SideraResearchSearchAuthGoal,
    pub phase: SideraResearchSearchAuthPhase,
    /// Opaque idempotency identity; never contains a query or navigation URL.
    pub search_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraResearchSearchFailure {
    pub task_id: String,
    pub client_request_id: String,
    pub query: String,
    pub status: ResearchSearchStatus,
    pub code: String,
    pub message: String,
    pub failed_at_ms: u128,
    pub terminal_snapshot: ResearchSearchRun,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraResearchSearchLifecycleKind {
    Started,
    Progress,
    Promoted,
    Failed,
    Cancelled,
    StaleCallbackDropped,
    IdempotentReplay,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraResearchSearchLifecycleEvent {
    pub kind: SideraResearchSearchLifecycleKind,
    pub task_id: Option<String>,
    pub client_request_id: Option<String>,
    pub epoch: u64,
    pub sequence: u64,
    pub webview_generation: u64,
    pub code: String,
    pub at_ms: u128,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraResearchSearchState {
    pub displayed_snapshot: Option<ResearchSearchRun>,
    pub active_attempt: Option<SideraResearchSearchAttempt>,
    pub last_failure: Option<SideraResearchSearchFailure>,
    #[serde(default)]
    pub lifecycle: Vec<SideraResearchSearchLifecycleEvent>,
}

#[derive(Default)]
pub struct ResearchSearchStore {
    epoch: u64,
    sequence: u64,
    state: SideraResearchSearchState,
    request_tasks: HashMap<String, String>,
    request_task_recency: VecDeque<String>,
}

pub type ResearchSearchOrchestrator = ResearchSearchStore;

impl ResearchSearchStore {
    pub fn begin(
        &mut self,
        request: LiteratureSearchRequest,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let client_request_id = format!("legacy-{now_ms}-{}", self.epoch.saturating_add(1));
        let (state, _) = self.begin_with_context(
            request,
            client_request_id,
            SideraResearchSearchStartReason::UserSearch,
            0,
            now_ms,
        )?;
        state
            .active_attempt
            .map(|attempt| attempt.run)
            .ok_or("SIDERA_RESEARCH_SEARCH_NOT_ACTIVE")
    }

    pub fn begin_with_context(
        &mut self,
        request: LiteratureSearchRequest,
        client_request_id: impl Into<String>,
        start_reason: SideraResearchSearchStartReason,
        webview_generation: u64,
        now_ms: u128,
    ) -> Result<(SideraResearchSearchState, bool), &'static str> {
        let request = validate_literature_search_request(request)?;
        let client_request_id = normalize_client_request_id(client_request_id.into())?;
        if let Some(remembered_task_id) = self.request_tasks.get(&client_request_id).cloned() {
            self.touch_request_task(&client_request_id);
            let current = self.state.active_attempt.as_ref();
            let (task_id, epoch, sequence, generation) = current
                .filter(|attempt| attempt.client_request_id == client_request_id)
                .map(|attempt| {
                    (
                        Some(attempt.run.task_id.clone()),
                        attempt.run.epoch,
                        attempt.run.sequence,
                        attempt.webview_generation,
                    )
                })
                .unwrap_or_else(|| {
                    (
                        Some(remembered_task_id),
                        self.epoch,
                        self.sequence,
                        webview_generation,
                    )
                });
            self.push_lifecycle(SideraResearchSearchLifecycleEvent {
                kind: SideraResearchSearchLifecycleKind::IdempotentReplay,
                task_id,
                client_request_id: Some(client_request_id),
                epoch,
                sequence,
                webview_generation: generation,
                code: "SIDERA_RESEARCH_SEARCH_IDEMPOTENT_REPLAY".to_string(),
                at_ms: now_ms,
            });
            return Ok((self.state.clone(), false));
        }
        self.epoch = self.epoch.saturating_add(1);
        self.sequence = self.sequence.saturating_add(1);
        let run = ResearchSearchRun {
            task_id: format!("research-{now_ms}-{}", self.epoch),
            epoch: self.epoch,
            sequence: self.sequence,
            truth: ResearchSearchTruth {
                result_limit: request.result_limit,
                ..ResearchSearchTruth::default()
            },
            request,
            status: ResearchSearchStatus::CheckingSession,
            candidates: Vec::new(),
            source_reports: Vec::new(),
            code: "SIDERA_RESEARCH_SEARCH_CHECKING_SESSION".to_string(),
            message: "正在检查机构会话。".to_string(),
            started_at_ms: now_ms,
            updated_at_ms: now_ms,
            finished_at_ms: None,
        };
        self.state.active_attempt = Some(SideraResearchSearchAttempt {
            client_request_id: client_request_id.clone(),
            start_reason,
            webview_generation,
            auth_context: None,
            run: run.clone(),
        });
        self.remember_request_task(client_request_id.clone(), run.task_id.clone());
        self.push_lifecycle(SideraResearchSearchLifecycleEvent {
            kind: SideraResearchSearchLifecycleKind::Started,
            task_id: Some(run.task_id.clone()),
            client_request_id: Some(client_request_id),
            epoch: run.epoch,
            sequence: run.sequence,
            webview_generation,
            code: run.code.clone(),
            at_ms: now_ms,
        });
        Ok((self.state.clone(), true))
    }

    pub fn active(&self) -> Option<&ResearchSearchRun> {
        self.state
            .active_attempt
            .as_ref()
            .map(|attempt| &attempt.run)
    }

    pub fn displayed(&self) -> Option<&ResearchSearchRun> {
        self.state.displayed_snapshot.as_ref()
    }

    pub fn state(&self) -> &SideraResearchSearchState {
        &self.state
    }

    pub fn state_snapshot(&self) -> SideraResearchSearchState {
        self.state.clone()
    }

    pub fn next_token(&self) -> Option<ResearchSearchToken> {
        self.state
            .active_attempt
            .as_ref()
            .map(|attempt| ResearchSearchToken {
                task_id: attempt.run.task_id.clone(),
                client_request_id: attempt.client_request_id.clone(),
                epoch: attempt.run.epoch,
                sequence: attempt.run.sequence.saturating_add(1),
                webview_generation: attempt.webview_generation,
            })
    }

    pub fn current_token(&self) -> Option<ResearchSearchToken> {
        self.state
            .active_attempt
            .as_ref()
            .map(|attempt| ResearchSearchToken {
                task_id: attempt.run.task_id.clone(),
                client_request_id: attempt.client_request_id.clone(),
                epoch: attempt.run.epoch,
                sequence: attempt.run.sequence,
                webview_generation: attempt.webview_generation,
            })
    }

    pub fn token_is_current(&self, token: &ResearchSearchToken) -> bool {
        self.state.active_attempt.as_ref().is_some_and(|attempt| {
            attempt.run.task_id == token.task_id
                && attempt.client_request_id == token.client_request_id
                && attempt.run.epoch == token.epoch
                && attempt.webview_generation == token.webview_generation
                && token.sequence == attempt.run.sequence
                && !is_terminal_status(&attempt.run.status)
        })
    }

    pub fn mark_status(
        &mut self,
        token: &ResearchSearchToken,
        status: ResearchSearchStatus,
        code: impl Into<String>,
        message: impl Into<String>,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let snapshot = {
            let run = self.current_for_token_mut(token)?;
            if !is_progress_status(&status) {
                return Err("SIDERA_RESEARCH_SEARCH_STATUS_INVALID");
            }
            if !is_valid_progress_transition(&run.status, &status) {
                return Err("SIDERA_RESEARCH_SEARCH_STATUS_TRANSITION_INVALID");
            }
            run.sequence = token.sequence;
            run.status = status;
            run.code = code.into();
            run.message = message.into();
            run.updated_at_ms = now_ms;
            run.finished_at_ms = None;
            run.clone()
        };
        self.sequence = self.sequence.max(token.sequence);
        self.push_progress_lifecycle(&snapshot, token, now_ms);
        Ok(snapshot)
    }

    pub fn mark_task_bound_auth_phase(
        &mut self,
        token: &ResearchSearchToken,
        phase: SideraResearchSearchAuthPhase,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let (code, message) = match phase {
            SideraResearchSearchAuthPhase::AwaitingUser => (
                "SIDERA_RESEARCH_SEARCH_DISCOVERY_AUTH_AWAITING_USER",
                "统一发现需要机构全文认证；当前检索已暂停，认证等待不计入 90 秒活动预算。",
            ),
            SideraResearchSearchAuthPhase::Verifying => (
                "SIDERA_RESEARCH_SEARCH_DISCOVERY_AUTH_VERIFYING",
                "正在核对统一发现认证结果；当前检索仍保持暂停。",
            ),
            SideraResearchSearchAuthPhase::RefreshingParent => (
                "SIDERA_RESEARCH_SEARCH_DISCOVERY_AUTH_REFRESHING_PARENT",
                "统一发现身份已确认；正在刷新同一任务绑定结果页。",
            ),
            SideraResearchSearchAuthPhase::Resuming => (
                "SIDERA_RESEARCH_SEARCH_DISCOVERY_AUTH_RESUMING",
                "任务绑定结果页已恢复；正在继续同一检索。",
            ),
        };
        let snapshot = {
            let run = self.current_for_token_mut(token)?;
            if !is_valid_progress_transition(&run.status, &ResearchSearchStatus::AwaitingUserAuth) {
                return Err("SIDERA_RESEARCH_SEARCH_STATUS_TRANSITION_INVALID");
            }
            run.sequence = token.sequence;
            run.status = ResearchSearchStatus::AwaitingUserAuth;
            run.code = code.to_string();
            run.message = message.to_string();
            run.updated_at_ms = now_ms;
            run.finished_at_ms = None;
            run.clone()
        };
        let attempt = self
            .state
            .active_attempt
            .as_mut()
            .ok_or("SIDERA_RESEARCH_SEARCH_NOT_ACTIVE")?;
        attempt.auth_context = Some(SideraResearchSearchAuthContext {
            goal: SideraResearchSearchAuthGoal::DiscoveryFulltext,
            phase,
            search_id: attempt.client_request_id.clone(),
        });
        self.sequence = self.sequence.max(token.sequence);
        self.push_progress_lifecycle(&snapshot, token, now_ms);
        Ok(snapshot)
    }

    pub fn resume_after_task_bound_auth(
        &mut self,
        token: &ResearchSearchToken,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let context_is_current = self.state.active_attempt.as_ref().is_some_and(|attempt| {
            attempt.auth_context.as_ref().is_some_and(|context| {
                context.goal == SideraResearchSearchAuthGoal::DiscoveryFulltext
                    && context.search_id == token.client_request_id
            })
        });
        if !context_is_current {
            return Err("SIDERA_RESEARCH_SEARCH_AUTH_CONTEXT_STALE");
        }
        let snapshot = {
            let run = self.current_for_token_mut(token)?;
            if !is_valid_progress_transition(&run.status, &ResearchSearchStatus::Searching) {
                return Err("SIDERA_RESEARCH_SEARCH_STATUS_TRANSITION_INVALID");
            }
            run.sequence = token.sequence;
            run.status = ResearchSearchStatus::Searching;
            run.code = "SIDERA_RESEARCH_SEARCH_DISCOVERY_AUTH_RESUMED".to_string();
            run.message = "统一发现认证已回写；同一检索正在继续。".to_string();
            run.updated_at_ms = now_ms;
            run.finished_at_ms = None;
            run.clone()
        };
        self.state
            .active_attempt
            .as_mut()
            .ok_or("SIDERA_RESEARCH_SEARCH_NOT_ACTIVE")?
            .auth_context = None;
        self.sequence = self.sequence.max(token.sequence);
        self.push_progress_lifecycle(&snapshot, token, now_ms);
        Ok(snapshot)
    }

    pub fn execute_connector(
        &mut self,
        connector: &mut dyn LiteratureConnector,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let token = self
            .next_token()
            .ok_or("SIDERA_RESEARCH_SEARCH_NOT_ACTIVE")?;
        let request = self
            .state
            .active_attempt
            .as_ref()
            .ok_or("SIDERA_RESEARCH_SEARCH_NOT_ACTIVE")?
            .run
            .request
            .clone();
        let capabilities = connector.capabilities();
        if !request.connector_ids.contains(&capabilities.connector_id) {
            return Err("SIDERA_RESEARCH_SEARCH_CONNECTOR_NOT_REQUESTED");
        }
        match connector.search(&request) {
            Ok(result) => self.apply_connector_result(&token, result, now_ms),
            Err(failure) => self.apply_connector_failure(&token, failure, now_ms),
        }
    }

    pub fn apply_connector_result(
        &mut self,
        token: &ResearchSearchToken,
        result: LiteratureConnectorSearchResult,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let snapshot = {
            let run = self.current_for_token_mut(token)?;
            if !run.request.connector_ids.contains(&result.connector_id) {
                return Err("SIDERA_RESEARCH_SEARCH_CONNECTOR_NOT_REQUESTED");
            }
            let (mut candidates, mut report) = normalize_connector_result(&run.request, result);
            run.status = ResearchSearchStatus::Normalizing;
            let merge = merge_candidates(
                &mut run.candidates,
                candidates.drain(..),
                run.request.result_limit,
            );
            if merge.limit_reached {
                report.status = ResearchSearchSourceStatus::Partial;
                report.code = "SIDERA_RESEARCH_SEARCH_RESULT_LIMIT_REACHED".to_string();
                report.message =
                    format!("已达到单次检索 {} 条候选上限。", run.request.result_limit);
                report.completion_reason = ResearchSearchCompletionReason::ResultLimit;
            }
            let first_report = run.source_reports.is_empty();
            run.truth.limit_reached |= merge.limit_reached;
            run.truth.target_reached = run.truth.limit_reached;
            if merge.has_more {
                run.truth.has_more = Some(true);
            } else if let Some(has_more) = report.has_more {
                run.truth.has_more = Some(has_more);
            }
            run.truth.pages_scanned = run.truth.pages_scanned.saturating_add(report.pages_scanned);
            run.truth.records_received = run
                .truth
                .records_received
                .saturating_add(report.records_received);
            run.truth.records_accepted = run
                .truth
                .records_accepted
                .saturating_add(report.records_accepted);
            run.truth.duplicates_merged = run
                .truth
                .duplicates_merged
                .saturating_add(merge.duplicates_merged);
            run.truth.total_hits = if first_report {
                report.total_hits
            } else {
                None
            };
            run.truth.completion_reason = if merge.limit_reached {
                ResearchSearchCompletionReason::ResultLimit
            } else {
                report.completion_reason
            };
            run.source_reports.push(report);
            run.truth.coverage = provider_coverage(&run.source_reports);
            run.sequence = token.sequence;
            run.status = ResearchSearchStatus::Searching;
            run.code = "SIDERA_RESEARCH_SEARCH_SOURCE_COLLECTED".to_string();
            run.message = "已接收一个文献来源，正在等待其余来源。".to_string();
            run.updated_at_ms = now_ms;
            run.clone()
        };
        self.sequence = self.sequence.max(token.sequence);
        self.push_progress_lifecycle(&snapshot, token, now_ms);
        Ok(snapshot)
    }

    pub fn apply_connector_failure(
        &mut self,
        token: &ResearchSearchToken,
        failure: LiteratureConnectorFailure,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let snapshot = {
            let run = self.current_for_token_mut(token)?;
            if !run.request.connector_ids.contains(&failure.connector_id) {
                return Err("SIDERA_RESEARCH_SEARCH_CONNECTOR_NOT_REQUESTED");
            }
            let pages_scanned = failure.pages_scanned.min(run.request.max_pages);
            run.source_reports.push(ResearchSearchSourceReport {
                connector_id: failure.connector_id,
                connector_version: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                transport: LiteratureConnectorTransport::DomFallback,
                observed_transport: None,
                source_id: failure.source_id,
                source_name: failure.source_name,
                status: ResearchSearchSourceStatus::Failed,
                pages_scanned,
                records_received: 0,
                records_accepted: 0,
                excluded_non_paper: 0,
                excluded_unknown: 0,
                excluded_invalid: 0,
                explicit_zero_results: false,
                provider_breakdown: Vec::new(),
                total_hits: None,
                has_more: None,
                completion_reason: completion_reason_from_failure_code(&failure.code),
                code: failure.code,
                message: failure.message,
            });
            run.truth.pages_scanned = run.truth.pages_scanned.saturating_add(pages_scanned);
            run.truth.completion_reason = run
                .source_reports
                .last()
                .map(|report| report.completion_reason)
                .unwrap_or(ResearchSearchCompletionReason::PartialFailure);
            run.sequence = token.sequence;
            run.status = ResearchSearchStatus::Searching;
            run.code = "SIDERA_RESEARCH_SEARCH_SOURCE_FAILED".to_string();
            run.message = "一个文献来源失败；其余来源仍可继续。".to_string();
            run.updated_at_ms = now_ms;
            run.clone()
        };
        self.sequence = self.sequence.max(token.sequence);
        self.push_progress_lifecycle(&snapshot, token, now_ms);
        Ok(snapshot)
    }

    pub fn finish(
        &mut self,
        token: &ResearchSearchToken,
        now_ms: u128,
    ) -> Result<ResearchSearchRun, &'static str> {
        let snapshot = {
            let run = self.current_for_token_mut(token)?;
            let no_source_reports = run.source_reports.is_empty();
            let has_degraded_source = run
                .source_reports
                .iter()
                .any(|report| !matches!(report.status, ResearchSearchSourceStatus::Complete));
            let all_sources_failed = !run.source_reports.is_empty()
                && run
                    .source_reports
                    .iter()
                    .all(|report| report.status == ResearchSearchSourceStatus::Failed);
            let explicit_zero = !run.source_reports.is_empty()
                && run.source_reports.iter().all(|report| {
                    report.explicit_zero_results
                        || report.status == ResearchSearchSourceStatus::Failed
                });
            if no_source_reports || all_sources_failed {
                run.status = ResearchSearchStatus::Failed;
                if let [report] = run.source_reports.as_slice() {
                    run.code = report.code.clone();
                    run.message = report.message.clone();
                } else {
                    run.code = "SIDERA_RESEARCH_SEARCH_FAILED".to_string();
                    run.message = "所有文献来源均失败。".to_string();
                }
            } else if has_degraded_source {
                run.status = ResearchSearchStatus::Partial;
                run.code = "SIDERA_RESEARCH_SEARCH_PARTIAL".to_string();
                run.message = "部分来源或记录类型无法确认；已保留可验证论文。".to_string();
            } else {
                run.status = ResearchSearchStatus::Complete;
                run.code = if explicit_zero {
                    "SIDERA_RESEARCH_SEARCH_COMPLETE_EMPTY"
                } else {
                    "SIDERA_RESEARCH_SEARCH_COMPLETE"
                }
                .to_string();
                run.message = if explicit_zero {
                    "所有成功来源均明确返回零结果。"
                } else {
                    "文献候选已规范化完成。"
                }
                .to_string();
            }
            if run.truth.completion_reason == ResearchSearchCompletionReason::InProgress {
                run.truth.completion_reason = if no_source_reports || all_sources_failed {
                    ResearchSearchCompletionReason::PartialFailure
                } else if explicit_zero {
                    ResearchSearchCompletionReason::ExplicitZeroResults
                } else if has_degraded_source {
                    ResearchSearchCompletionReason::PartialFailure
                } else {
                    ResearchSearchCompletionReason::SourceExhausted
                };
            } else if has_degraded_source
                && run.truth.completion_reason == ResearchSearchCompletionReason::SourceExhausted
            {
                run.truth.completion_reason = ResearchSearchCompletionReason::PartialFailure;
            }
            run.truth.target_reached = run.truth.limit_reached;
            let reported_has_more = if run.source_reports.len() == 1 {
                run.source_reports
                    .first()
                    .and_then(|report| report.has_more)
            } else {
                None
            };
            run.truth.has_more = match run.truth.completion_reason {
                ResearchSearchCompletionReason::ExplicitZeroResults => Some(false),
                ResearchSearchCompletionReason::SourceExhausted if !run.truth.target_reached => {
                    Some(false)
                }
                ResearchSearchCompletionReason::ResultLimit if run.truth.has_more == Some(true) => {
                    Some(true)
                }
                ResearchSearchCompletionReason::ResultLimit
                | ResearchSearchCompletionReason::PageLimit
                | ResearchSearchCompletionReason::Timeout
                | ResearchSearchCompletionReason::InProgress
                | ResearchSearchCompletionReason::SourceExhausted => None,
                ResearchSearchCompletionReason::PartialFailure => reported_has_more,
            };
            run.sequence = token.sequence;
            run.updated_at_ms = now_ms;
            run.finished_at_ms = Some(now_ms);
            run.clone()
        };
        self.sequence = self.sequence.max(token.sequence);
        let attempt = self
            .state
            .active_attempt
            .take()
            .ok_or("SIDERA_RESEARCH_SEARCH_NOT_ACTIVE")?;
        if matches!(
            snapshot.status,
            ResearchSearchStatus::Complete | ResearchSearchStatus::Partial
        ) {
            self.state.displayed_snapshot = Some(snapshot.clone());
            self.state.last_failure = None;
            self.push_lifecycle(SideraResearchSearchLifecycleEvent {
                kind: SideraResearchSearchLifecycleKind::Promoted,
                task_id: Some(snapshot.task_id.clone()),
                client_request_id: Some(attempt.client_request_id),
                epoch: snapshot.epoch,
                sequence: snapshot.sequence,
                webview_generation: attempt.webview_generation,
                code: snapshot.code.clone(),
                at_ms: now_ms,
            });
        } else {
            self.state.last_failure = Some(SideraResearchSearchFailure {
                task_id: snapshot.task_id.clone(),
                client_request_id: attempt.client_request_id.clone(),
                query: snapshot.request.query.clone(),
                status: snapshot.status,
                code: snapshot.code.clone(),
                message: snapshot.message.clone(),
                failed_at_ms: now_ms,
                terminal_snapshot: snapshot.clone(),
            });
            self.push_lifecycle(SideraResearchSearchLifecycleEvent {
                kind: SideraResearchSearchLifecycleKind::Failed,
                task_id: Some(snapshot.task_id.clone()),
                client_request_id: Some(attempt.client_request_id),
                epoch: snapshot.epoch,
                sequence: snapshot.sequence,
                webview_generation: attempt.webview_generation,
                code: snapshot.code.clone(),
                at_ms: now_ms,
            });
        }
        Ok(snapshot)
    }

    pub fn cancel(&mut self, now_ms: u128) -> Option<ResearchSearchRun> {
        let mut attempt = self.state.active_attempt.take()?;
        self.sequence = self.sequence.saturating_add(1);
        let run = &mut attempt.run;
        run.sequence = self.sequence;
        run.status = ResearchSearchStatus::Cancelled;
        run.code = "SIDERA_RESEARCH_SEARCH_CANCELLED".to_string();
        run.message = "当前文献检索已取消；迟到来源响应将被忽略。".to_string();
        run.updated_at_ms = now_ms;
        run.finished_at_ms = Some(now_ms);
        let snapshot = run.clone();
        self.state.last_failure = Some(SideraResearchSearchFailure {
            task_id: snapshot.task_id.clone(),
            client_request_id: attempt.client_request_id.clone(),
            query: snapshot.request.query.clone(),
            status: ResearchSearchStatus::Cancelled,
            code: snapshot.code.clone(),
            message: snapshot.message.clone(),
            failed_at_ms: now_ms,
            terminal_snapshot: snapshot.clone(),
        });
        self.push_lifecycle(SideraResearchSearchLifecycleEvent {
            kind: SideraResearchSearchLifecycleKind::Cancelled,
            task_id: Some(snapshot.task_id.clone()),
            client_request_id: Some(attempt.client_request_id),
            epoch: snapshot.epoch,
            sequence: snapshot.sequence,
            webview_generation: attempt.webview_generation,
            code: snapshot.code.clone(),
            at_ms: now_ms,
        });
        Some(snapshot)
    }

    fn current_for_token_mut(
        &mut self,
        token: &ResearchSearchToken,
    ) -> Result<&mut ResearchSearchRun, &'static str> {
        let is_current = self.state.active_attempt.as_ref().is_some_and(|attempt| {
            attempt.run.task_id == token.task_id
                && attempt.client_request_id == token.client_request_id
                && attempt.run.epoch == token.epoch
                && attempt.webview_generation == token.webview_generation
                && token.sequence == attempt.run.sequence.saturating_add(1)
                && !is_terminal_status(&attempt.run.status)
        });
        if !is_current {
            self.push_lifecycle(SideraResearchSearchLifecycleEvent {
                kind: SideraResearchSearchLifecycleKind::StaleCallbackDropped,
                task_id: Some(token.task_id.clone()),
                client_request_id: Some(token.client_request_id.clone()),
                epoch: token.epoch,
                sequence: token.sequence,
                webview_generation: token.webview_generation,
                code: "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK".to_string(),
                at_ms: 0,
            });
            return Err("SIDERA_RESEARCH_SEARCH_STALE_CALLBACK");
        }
        Ok(&mut self
            .state
            .active_attempt
            .as_mut()
            .expect("current attempt checked above")
            .run)
    }

    fn push_progress_lifecycle(
        &mut self,
        snapshot: &ResearchSearchRun,
        token: &ResearchSearchToken,
        now_ms: u128,
    ) {
        self.push_lifecycle(SideraResearchSearchLifecycleEvent {
            kind: SideraResearchSearchLifecycleKind::Progress,
            task_id: Some(snapshot.task_id.clone()),
            client_request_id: Some(token.client_request_id.clone()),
            epoch: snapshot.epoch,
            sequence: snapshot.sequence,
            webview_generation: token.webview_generation,
            code: snapshot.code.clone(),
            at_ms: now_ms,
        });
    }

    fn push_lifecycle(&mut self, event: SideraResearchSearchLifecycleEvent) {
        self.state.lifecycle.push(event);
        if self.state.lifecycle.len() > 32 {
            let overflow = self.state.lifecycle.len() - 32;
            self.state.lifecycle.drain(0..overflow);
        }
    }

    fn remember_request_task(&mut self, client_request_id: String, task_id: String) {
        self.request_tasks
            .insert(client_request_id.clone(), task_id);
        self.touch_request_task(&client_request_id);

        while self.request_tasks.len() > RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT {
            let current_request_id = self
                .state
                .active_attempt
                .as_ref()
                .map(|attempt| attempt.client_request_id.as_str());
            let Some(eviction_index) = self
                .request_task_recency
                .iter()
                .position(|remembered| current_request_id != Some(remembered.as_str()))
            else {
                break;
            };
            let evicted_request_id = self
                .request_task_recency
                .remove(eviction_index)
                .expect("request-task eviction index was selected from recency queue");
            self.request_tasks.remove(&evicted_request_id);
        }
    }

    fn touch_request_task(&mut self, client_request_id: &str) {
        if let Some(index) = self
            .request_task_recency
            .iter()
            .position(|remembered| remembered == client_request_id)
        {
            self.request_task_recency.remove(index);
        }
        self.request_task_recency
            .push_back(client_request_id.to_string());
    }
}

fn normalize_client_request_id(value: String) -> Result<String, &'static str> {
    let value = value.trim();
    if value.is_empty() || value.len() > 128 {
        return Err("SIDERA_RESEARCH_SEARCH_CLIENT_REQUEST_ID_INVALID");
    }
    if !value
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | ':'))
    {
        return Err("SIDERA_RESEARCH_SEARCH_CLIENT_REQUEST_ID_INVALID");
    }
    Ok(value.to_string())
}

fn is_terminal_status(status: &ResearchSearchStatus) -> bool {
    matches!(
        status,
        ResearchSearchStatus::Complete
            | ResearchSearchStatus::Partial
            | ResearchSearchStatus::Failed
            | ResearchSearchStatus::Cancelled
    )
}

fn normalize_connector_result(
    request: &LiteratureSearchRequest,
    mut result: LiteratureConnectorSearchResult,
) -> (Vec<NormalizedCandidateDraft>, ResearchSearchSourceReport) {
    let records_received = result.records.len();
    let records = std::mem::take(&mut result.records);
    let retrieval_positions = std::mem::take(&mut result.retrieval_positions);
    let mut candidates = Vec::new();
    let mut excluded_non_paper = 0;
    let mut excluded_unsupported = 0;
    let mut excluded_unknown = 0;
    let mut excluded_invalid = 0;
    let connector_id = result.connector_id.clone();
    let connector_version = result.connector_version.clone();
    let source_id = result.source_id.clone();
    let source_name =
        clean_text(&result.source_name, 180).unwrap_or_else(|| result.source_id.clone());
    let mut provider_indexes = HashMap::<String, usize>::new();
    let mut provider_breakdown = Vec::<ResearchSearchProviderBreakdown>::new();

    for (record_index, record) in records.into_iter().enumerate() {
        let explicit_provider_name = record
            .source_provider
            .as_deref()
            .and_then(|value| clean_text(value, 180));
        let provider_index = explicit_provider_name.as_ref().map(|provider_name| {
            if let Some(index) = provider_indexes.get(provider_name).copied() {
                index
            } else {
                let index = provider_breakdown.len();
                provider_indexes.insert(provider_name.clone(), index);
                provider_breakdown.push(ResearchSearchProviderBreakdown {
                    provider_id: format!("provider-{}", short_sha256(provider_name)),
                    provider_name: provider_name.clone(),
                    records_received: 0,
                    records_accepted: 0,
                });
                index
            }
        });
        if let Some(provider_index) = provider_index {
            provider_breakdown[provider_index].records_received = provider_breakdown
                [provider_index]
                .records_received
                .saturating_add(1);
        }
        let provider_name =
            explicit_provider_name.unwrap_or_else(|| format!("供应商未标明（{source_name}）"));
        if record.record_kind == SideraInstitutionRecordKind::Unknown {
            excluded_unknown += 1;
            continue;
        }
        if !is_supported_paper_kind(&record.record_kind) {
            excluded_non_paper += 1;
            excluded_unsupported += 1;
            continue;
        }
        if !request.filters.record_kinds.contains(&record.record_kind) {
            excluded_non_paper += 1;
            continue;
        }
        let Some(candidate) = normalize_record(
            &connector_id,
            &connector_version,
            &source_id,
            &provider_name,
            record,
            normalize_retrieval_position(
                &connector_id,
                record_index,
                retrieval_positions.get(record_index),
            ),
        ) else {
            excluded_invalid += 1;
            continue;
        };
        if !candidate_matches_filters(request, &candidate) {
            excluded_non_paper += 1;
            continue;
        }
        if let Some(provider_index) = provider_index {
            provider_breakdown[provider_index].records_accepted = provider_breakdown
                [provider_index]
                .records_accepted
                .saturating_add(1);
        }
        candidates.push(candidate);
    }

    // A valid paper excluded only by the user's type/year/full-text filters is
    // an ordinary empty filtered result, not an adapter failure. Degrade only
    // when the source returned unsupported, unknown or structurally invalid
    // records and no usable candidate survived.
    let all_records_unusable = records_received > 0
        && candidates.is_empty()
        && (excluded_unsupported > 0 || excluded_unknown > 0 || excluded_invalid > 0)
        && !result.explicit_zero_results;
    let partial = result.partial
        || result.pages_scanned > request.max_pages
        || excluded_unknown > 0
        || excluded_invalid > 0
        || all_records_unusable
        || matches!(
            result.completion_reason,
            ResearchSearchCompletionReason::PageLimit
                | ResearchSearchCompletionReason::Timeout
                | ResearchSearchCompletionReason::PartialFailure
        );
    let status = if partial {
        ResearchSearchSourceStatus::Partial
    } else {
        ResearchSearchSourceStatus::Complete
    };
    let upstream_partial_truth = result.partial
        && matches!(
            result.completion_reason,
            ResearchSearchCompletionReason::PageLimit
                | ResearchSearchCompletionReason::Timeout
                | ResearchSearchCompletionReason::PartialFailure
        );
    let (code, message) = if upstream_partial_truth {
        // Pagination, timeout and transport truth must not be hidden by a less
        // important per-record exclusion that happened on an earlier page.
        (result.code, result.message)
    } else if all_records_unusable {
        (
            "SIDERA_RESEARCH_SEARCH_SOURCE_ALL_FILTERED".to_string(),
            "该来源返回了记录，但没有一条满足明确论文类型与身份要求；已保留为部分失败。"
                .to_string(),
        )
    } else if excluded_unknown > 0 {
        (
            "SIDERA_RESEARCH_SEARCH_RECORD_TYPE_UNCONFIRMED".to_string(),
            "已排除无法确认文献类型的记录；其余明确论文仍保留。".to_string(),
        )
    } else if partial {
        (result.code, result.message)
    } else {
        (result.code, result.message)
    };
    let report = ResearchSearchSourceReport {
        connector_id,
        connector_version: result.connector_version,
        transport: result.transport,
        observed_transport: result.observed_transport,
        source_id,
        source_name,
        status,
        pages_scanned: result.pages_scanned.min(RESEARCH_SEARCH_MAX_PAGES),
        records_received,
        records_accepted: candidates.len(),
        excluded_non_paper,
        excluded_unknown,
        excluded_invalid,
        explicit_zero_results: result.explicit_zero_results,
        provider_breakdown,
        total_hits: result.total_hits.filter(|total| *total >= records_received),
        has_more: result.has_more,
        completion_reason: if result.explicit_zero_results {
            ResearchSearchCompletionReason::ExplicitZeroResults
        } else {
            result.completion_reason
        },
        code,
        message,
    };
    (candidates, report)
}

fn normalize_retrieval_position(
    connector_id: &str,
    record_index: usize,
    position: Option<&ResearchSearchRetrievalPosition>,
) -> ResearchSearchRetrievalPosition {
    let observed = position.is_some_and(|value| {
        value.basis == ResearchSearchRetrievalPositionBasis::Observed
            && value.rank > 0
            && value.page > 0
            && value.position > 0
    });
    ResearchSearchRetrievalPosition {
        // Connector identity is owned by the Rust connector result rather than
        // accepted from a page payload.
        connector_id: connector_id.to_string(),
        rank: position
            .map(|value| value.rank)
            .filter(|value| *value > 0)
            .unwrap_or(record_index.saturating_add(1)),
        page: position
            .map(|value| value.page)
            .filter(|value| *value > 0)
            .unwrap_or(1),
        position: position
            .map(|value| value.position)
            .filter(|value| *value > 0)
            .unwrap_or(record_index.saturating_add(1)),
        facet: position
            .and_then(|value| value.facet.as_deref())
            .and_then(|value| clean_text(value, 80)),
        basis: if observed {
            ResearchSearchRetrievalPositionBasis::Observed
        } else {
            ResearchSearchRetrievalPositionBasis::Synthesized
        },
    }
}

fn candidate_matches_filters(
    request: &LiteratureSearchRequest,
    candidate: &NormalizedCandidateDraft,
) -> bool {
    if request.filters.full_text_only
        && matches!(
            candidate.full_text_status,
            SideraInstitutionFullTextStatus::Unavailable | SideraInstitutionFullTextStatus::Unknown
        )
    {
        return false;
    }
    if request
        .filters
        .year_from
        .is_some_and(|year| candidate.year.is_none_or(|value| value < year))
        || request
            .filters
            .year_to
            .is_some_and(|year| candidate.year.is_none_or(|value| value > year))
    {
        return false;
    }
    true
}

fn normalize_record(
    connector_id: &str,
    connector_version: &str,
    source_id: &str,
    source_name: &str,
    record: SideraInstitutionAdapterRecord,
    retrieval_position: ResearchSearchRetrievalPosition,
) -> Option<NormalizedCandidateDraft> {
    let title = clean_text(&record.title, 500)?;
    let authors = record
        .authors
        .as_deref()
        .map(split_authors)
        .unwrap_or_default();
    let first_author = authors.first().cloned();
    let year = record.year.filter(|value| (1000..=2200).contains(value));
    let doi = normalize_doi(record.doi.as_deref());
    let provider_record_id = record
        .provider_record_id
        .as_deref()
        .and_then(|value| clean_text(value, 200));
    let canonical_url = canonical_http_url(&record.detail_url);
    if doi.is_none()
        && provider_record_id.is_none()
        && canonical_url.is_none()
        && (first_author.is_none() || year.is_none())
    {
        return None;
    }
    let journal = record
        .journal
        .as_deref()
        .and_then(|value| clean_text(value, 500));
    let conference = record
        .conference
        .as_deref()
        .and_then(|value| clean_text(value, 500));
    let degree_institution = record
        .degree_institution
        .as_deref()
        .and_then(|value| clean_text(value, 500));
    let publication = record
        .publication
        .as_deref()
        .and_then(|value| clean_text(value, 500));
    let venue = journal
        .clone()
        .or_else(|| conference.clone())
        .or_else(|| degree_institution.clone())
        .or(publication);
    let volume = record
        .volume
        .as_deref()
        .and_then(|value| clean_text(value, 80));
    let issue = record
        .issue
        .as_deref()
        .and_then(|value| clean_text(value, 80));
    let pages = record
        .pages
        .as_deref()
        .and_then(|value| clean_text(value, 80));
    let identity = candidate_identity_key(
        &title,
        first_author.as_deref(),
        year,
        doi.as_deref(),
        source_name,
        provider_record_id.as_deref(),
        canonical_url.as_deref(),
    );
    let full_text_url = record.full_text_url.as_deref().and_then(canonical_http_url);
    let full_text_route = classify_full_text_route(
        full_text_url.as_deref(),
        doi.as_deref(),
        provider_record_id.as_deref(),
        canonical_url.as_deref(),
    );
    let id = format!("candidate-{}", short_sha256(&identity));
    let detail_locator = canonical_url
        .as_ref()
        .map(|_| format!("research-detail-{}", short_sha256(&id)));
    let full_text_locator = full_text_url
        .as_ref()
        .map(|_| format!("research-full-text-{}", short_sha256(&id)));
    let mut field_provenance = BTreeMap::new();
    for (field, present) in [
        ("title", true),
        ("authors", !authors.is_empty()),
        ("year", year.is_some()),
        ("doi", doi.is_some()),
        ("providerRecordId", provider_record_id.is_some()),
        ("canonicalUrl", canonical_url.is_some()),
        ("journal", journal.is_some()),
        ("conference", conference.is_some()),
        ("degreeInstitution", degree_institution.is_some()),
        ("volume", volume.is_some()),
        ("issue", issue.is_some()),
        ("pages", pages.is_some()),
        ("abstract", record.abstract_snippet.is_some()),
        ("fullText", full_text_url.is_some()),
    ] {
        if present {
            field_provenance.insert(
                field.to_string(),
                CandidateFieldProvenance {
                    connector_id: connector_id.to_string(),
                    connector_version: connector_version.to_string(),
                    source_id: source_id.to_string(),
                    source_field: field.to_string(),
                },
            );
        }
    }
    Some(NormalizedCandidateDraft {
        id: id.clone(),
        title,
        authors,
        first_author,
        year,
        doi,
        source_database: source_name.to_string(),
        source_ids: vec![source_id.to_string()],
        provider_record_id,
        canonical_url,
        venue,
        journal,
        conference,
        degree_institution,
        volume,
        issue,
        pages,
        abstract_text: record
            .abstract_snippet
            .as_deref()
            .and_then(|value| clean_text(value, 2_000)),
        record_kind: record.record_kind,
        full_text_status: if full_text_url.is_some()
            && record.full_text_status == SideraInstitutionFullTextStatus::Unknown
        {
            SideraInstitutionFullTextStatus::LinkOnly
        } else {
            record.full_text_status
        },
        full_text_route,
        detail_locator,
        full_text_locator,
        full_text_url,
        connector_ids: vec![connector_id.to_string()],
        producer_versions: vec![connector_version.to_string()],
        field_provenance,
        retrieval_position,
    })
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct MergeCandidatesOutcome {
    limit_reached: bool,
    has_more: bool,
    duplicates_merged: usize,
}

fn merge_candidates(
    target: &mut Vec<NormalizedCandidateDraft>,
    incoming: impl Iterator<Item = NormalizedCandidateDraft>,
    result_limit: usize,
) -> MergeCandidatesOutcome {
    let mut outcome = MergeCandidatesOutcome::default();
    let mut indexes = target
        .iter()
        .enumerate()
        .map(|(index, item)| (candidate_dedupe_key(item), index))
        .collect::<HashMap<_, _>>();
    for candidate in incoming {
        let key = candidate_dedupe_key(&candidate);
        if let Some(index) = indexes.get(&key).copied() {
            outcome.duplicates_merged = outcome.duplicates_merged.saturating_add(1);
            let existing = &mut target[index];
            if existing.retrieval_position.connector_id == candidate.retrieval_position.connector_id
                && candidate.retrieval_position.rank > 0
                && (existing.retrieval_position.rank == 0
                    || candidate.retrieval_position.rank < existing.retrieval_position.rank)
            {
                existing.retrieval_position = candidate.retrieval_position.clone();
            }
            append_unique(&mut existing.connector_ids, candidate.connector_ids);
            append_unique(&mut existing.producer_versions, candidate.producer_versions);
            append_unique(&mut existing.source_ids, candidate.source_ids);
            if existing.doi.is_none() {
                existing.doi = candidate.doi;
            }
            if existing.provider_record_id.is_none() {
                existing.provider_record_id = candidate.provider_record_id;
            }
            if existing.canonical_url.is_none() {
                existing.canonical_url = candidate.canonical_url;
            }
            if existing.abstract_text.is_none() {
                existing.abstract_text = candidate.abstract_text;
            }
            if existing.venue.is_none() {
                existing.venue = candidate.venue;
            }
            if existing.journal.is_none() {
                existing.journal = candidate.journal;
            }
            if existing.conference.is_none() {
                existing.conference = candidate.conference;
            }
            if existing.degree_institution.is_none() {
                existing.degree_institution = candidate.degree_institution;
            }
            if existing.volume.is_none() {
                existing.volume = candidate.volume;
            }
            if existing.issue.is_none() {
                existing.issue = candidate.issue;
            }
            if existing.pages.is_none() {
                existing.pages = candidate.pages;
            }
            if existing.full_text_url.is_none() {
                existing.full_text_url = candidate.full_text_url;
                existing.full_text_status = candidate.full_text_status;
                existing.full_text_route = candidate.full_text_route;
            }
            for (field, provenance) in candidate.field_provenance {
                existing.field_provenance.entry(field).or_insert(provenance);
            }
        } else if target.len() < result_limit {
            indexes.insert(key, target.len());
            target.push(candidate);
        } else {
            outcome.limit_reached = true;
            outcome.has_more = true;
        }
    }
    outcome.limit_reached |= target.len() >= result_limit;
    outcome
}

fn supported_paper_kinds() -> Vec<SideraInstitutionRecordKind> {
    vec![
        SideraInstitutionRecordKind::JournalArticle,
        SideraInstitutionRecordKind::ConferencePaper,
        SideraInstitutionRecordKind::Thesis,
    ]
}

fn is_progress_status(status: &ResearchSearchStatus) -> bool {
    matches!(
        status,
        ResearchSearchStatus::CheckingSession
            | ResearchSearchStatus::AwaitingUserAuth
            | ResearchSearchStatus::ResolvingConnectors
            | ResearchSearchStatus::Searching
            | ResearchSearchStatus::Normalizing
    )
}

fn is_valid_progress_transition(
    current: &ResearchSearchStatus,
    next: &ResearchSearchStatus,
) -> bool {
    current == next
        || matches!(
            (current, next),
            (
                ResearchSearchStatus::CheckingSession,
                ResearchSearchStatus::AwaitingUserAuth | ResearchSearchStatus::ResolvingConnectors
            ) | (
                ResearchSearchStatus::AwaitingUserAuth,
                ResearchSearchStatus::CheckingSession
                    | ResearchSearchStatus::ResolvingConnectors
                    | ResearchSearchStatus::Searching
            ) | (
                ResearchSearchStatus::ResolvingConnectors,
                ResearchSearchStatus::AwaitingUserAuth | ResearchSearchStatus::Searching
            ) | (
                ResearchSearchStatus::Searching,
                ResearchSearchStatus::AwaitingUserAuth | ResearchSearchStatus::Normalizing
            ) | (
                ResearchSearchStatus::Normalizing,
                ResearchSearchStatus::AwaitingUserAuth | ResearchSearchStatus::Searching
            )
        )
}

fn is_supported_paper_kind(kind: &SideraInstitutionRecordKind) -> bool {
    matches!(
        kind,
        SideraInstitutionRecordKind::JournalArticle
            | SideraInstitutionRecordKind::ConferencePaper
            | SideraInstitutionRecordKind::Thesis
    )
}

fn clean_text(value: &str, max_chars: usize) -> Option<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.chars().take(max_chars).collect())
}

fn split_authors(value: &str) -> Vec<String> {
    value
        .split([';', '；', '|'])
        .flat_map(|part| {
            let normalized = part.trim();
            if normalized.contains('，') {
                normalized.split('，').collect::<Vec<_>>()
            } else {
                vec![normalized]
            }
        })
        .filter_map(|value| clean_text(value, 160))
        .collect()
}

fn normalize_doi(value: Option<&str>) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    let value = value
        .strip_prefix("https://doi.org/")
        .or_else(|| value.strip_prefix("http://doi.org/"))
        .or_else(|| value.strip_prefix("doi:"))
        .unwrap_or(&value)
        .trim();
    (!value.is_empty() && value.starts_with("10.")).then(|| value.to_string())
}

pub fn canonicalize_identity_url(value: &str) -> Option<String> {
    let mut url = Url::parse(value.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    url.set_fragment(None);
    let mut safe_pairs = url
        .query_pairs()
        .filter(|(key, _)| !is_sensitive_locator_query_key(key))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    safe_pairs.sort();
    if safe_pairs.is_empty() {
        url.set_query(None);
    } else {
        url.query_pairs_mut().clear().extend_pairs(
            safe_pairs
                .iter()
                .map(|(key, value)| (key.as_str(), value.as_str())),
        );
    }
    Some(url.to_string())
}

fn canonical_http_url(value: &str) -> Option<String> {
    canonicalize_identity_url(value)
}

fn is_sensitive_locator_query_key(key: &str) -> bool {
    let normalized = key.trim().to_ascii_lowercase().replace(['-', '_', '.'], "");
    normalized.contains("token")
        || normalized.contains("ticket")
        || normalized.contains("cookie")
        || normalized.contains("session")
        || matches!(
            normalized.as_str(),
            "auth"
                | "authorization"
                | "code"
                | "state"
                | "samlresponse"
                | "relaystate"
                | "assertion"
                | "signature"
                | "sig"
                | "credential"
                | "password"
                | "passwd"
        )
}

fn normalize_identity_source(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn candidate_identity_key(
    title: &str,
    first_author: Option<&str>,
    year: Option<i32>,
    doi: Option<&str>,
    source_database: &str,
    provider_record_id: Option<&str>,
    canonical_url: Option<&str>,
) -> String {
    if let Some(doi) = doi {
        return format!("doi:{doi}");
    }
    if let Some(provider_record_id) = provider_record_id {
        return format!(
            "provider:{}:{}",
            normalize_identity_source(source_database),
            provider_record_id.trim()
        );
    }
    if let Some(url) = canonical_url {
        return format!("url:{url}");
    }
    format!(
        "title:{}:{}:{}",
        title.split_whitespace().collect::<String>().to_lowercase(),
        first_author.unwrap_or("").trim().to_lowercase(),
        year.unwrap_or_default()
    )
}

fn candidate_dedupe_key(candidate: &NormalizedCandidateDraft) -> String {
    candidate_identity_key(
        &candidate.title,
        candidate.first_author.as_deref(),
        candidate.year,
        candidate.doi.as_deref(),
        &candidate.source_database,
        candidate.provider_record_id.as_deref(),
        candidate.canonical_url.as_deref(),
    )
}

pub fn qualifying_research_candidate_key(
    request: &LiteratureSearchRequest,
    record: &SideraInstitutionAdapterRecord,
) -> Option<String> {
    if !is_supported_paper_kind(&record.record_kind)
        || !request.filters.record_kinds.contains(&record.record_kind)
    {
        return None;
    }
    let source_name = record
        .source_provider
        .as_deref()
        .and_then(|value| clean_text(value, 180))
        .unwrap_or_else(|| "武汉大学统一学术发现".to_string());
    let candidate = normalize_record(
        WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID,
        WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID,
        "whu-academic-discovery",
        &source_name,
        record.clone(),
        ResearchSearchRetrievalPosition {
            connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
            rank: 1,
            page: 1,
            position: 1,
            facet: None,
            basis: ResearchSearchRetrievalPositionBasis::Synthesized,
        },
    )?;
    candidate_matches_filters(request, &candidate).then(|| candidate_dedupe_key(&candidate))
}

fn provider_coverage(reports: &[ResearchSearchSourceReport]) -> usize {
    reports
        .iter()
        .flat_map(|report| report.provider_breakdown.iter())
        .map(|provider| provider.provider_id.as_str())
        .collect::<BTreeSet<_>>()
        .len()
}

fn completion_reason_from_failure_code(code: &str) -> ResearchSearchCompletionReason {
    if code.to_ascii_uppercase().contains("TIMEOUT") {
        ResearchSearchCompletionReason::Timeout
    } else {
        ResearchSearchCompletionReason::PartialFailure
    }
}

fn classify_full_text_route(
    full_text_url: Option<&str>,
    doi: Option<&str>,
    provider_record_id: Option<&str>,
    canonical_url: Option<&str>,
) -> SideraInstitutionFullTextRoute {
    if let Some(value) = full_text_url {
        let lower = value.to_ascii_lowercase();
        if lower.starts_with("https://doi.org/") {
            return SideraInstitutionFullTextRoute::Doi;
        }
        if lower.contains("openurl") || lower.contains("linkresolver") {
            return SideraInstitutionFullTextRoute::OpenurlLinkResolver;
        }
        if lower.ends_with(".pdf")
            || lower.contains("/pdf/")
            || lower.contains("/fulltext/")
            || lower.contains("/full-text/")
        {
            return SideraInstitutionFullTextRoute::DirectHtmlPdf;
        }
        if canonical_url
            .and_then(|value| Url::parse(value).ok())
            .and_then(|value| value.host_str().map(str::to_string))
            != Url::parse(value)
                .ok()
                .and_then(|value| value.host_str().map(str::to_string))
        {
            return SideraInstitutionFullTextRoute::PublisherPage;
        }
        return SideraInstitutionFullTextRoute::ProviderRecord;
    }
    if doi.is_some() {
        SideraInstitutionFullTextRoute::Doi
    } else if provider_record_id.is_some() {
        SideraInstitutionFullTextRoute::ProviderRecord
    } else {
        SideraInstitutionFullTextRoute::BrowserFallback
    }
}

fn short_sha256(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn append_unique(target: &mut Vec<String>, incoming: Vec<String>) {
    for value in incoming {
        if !target.contains(&value) {
            target.push(value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fair_page_budget_reserves_capacity_for_remaining_facets() {
        assert_eq!(fair_sequential_page_budget(19, 2), 10);
        assert_eq!(fair_sequential_page_budget(9, 1), 9);
        assert_eq!(fair_sequential_page_budget(19, 3), 7);
        assert_eq!(fair_sequential_page_budget(0, 0), 0);
    }

    struct FixtureConnector {
        capabilities: LiteratureConnectorCapabilities,
        result: Result<LiteratureConnectorSearchResult, LiteratureConnectorFailure>,
    }

    impl LiteratureConnector for FixtureConnector {
        fn capabilities(&self) -> LiteratureConnectorCapabilities {
            self.capabilities.clone()
        }

        fn search(
            &mut self,
            _request: &LiteratureSearchRequest,
        ) -> Result<LiteratureConnectorSearchResult, LiteratureConnectorFailure> {
            self.result.clone()
        }
    }

    fn record(
        title: &str,
        kind: SideraInstitutionRecordKind,
        doi: Option<&str>,
    ) -> SideraInstitutionAdapterRecord {
        SideraInstitutionAdapterRecord {
            title: title.to_string(),
            authors: Some("王五; Smith, Alice".to_string()),
            year: Some(2024),
            publication: Some("Journal of Research".to_string()),
            document_type: Some("article".to_string()),
            doi: doi.map(str::to_string),
            abstract_snippet: Some("Evidence abstract".to_string()),
            availability: Some("online".to_string()),
            detail_url: format!("https://discovery.example/record/{}", title.len()),
            full_text_url: None,
            record_kind: kind,
            journal: Some("Journal of Research".to_string()),
            conference: None,
            degree_institution: None,
            volume: Some("3".to_string()),
            issue: Some("1".to_string()),
            pages: Some("1-9".to_string()),
            source_provider: Some("Fixture".to_string()),
            full_text_status: SideraInstitutionFullTextStatus::Unknown,
            provider_record_id: None,
            catalog_record_id: None,
            isbn_issn: None,
        }
    }

    fn result(records: Vec<SideraInstitutionAdapterRecord>) -> LiteratureConnectorSearchResult {
        LiteratureConnectorSearchResult {
            connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
            connector_version: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
            transport: LiteratureConnectorTransport::DomFallback,
            observed_transport: None,
            source_id: "whu-discovery".to_string(),
            source_name: "武汉大学统一发现".to_string(),
            pages_scanned: 1,
            explicit_zero_results: false,
            partial: false,
            code: "SIDERA_RESEARCH_SEARCH_SOURCE_COMPLETE".to_string(),
            message: "来源检索完成。".to_string(),
            records,
            retrieval_positions: Vec::new(),
            total_hits: None,
            has_more: Some(false),
            completion_reason: ResearchSearchCompletionReason::SourceExhausted,
        }
    }

    fn begin(query: &str) -> ResearchSearchOrchestrator {
        let mut orchestrator = ResearchSearchOrchestrator::default();
        orchestrator
            .begin(LiteratureSearchRequest::whu(query), 100)
            .unwrap();
        orchestrator
    }

    #[test]
    fn whu_v2_contract_accepts_chinese_and_english_queries_without_facet_gate() {
        for query in ["人工智能", "machine learning"] {
            let request =
                validate_literature_search_request(LiteratureSearchRequest::whu(query)).unwrap();
            assert_eq!(request.query, query);
            assert_eq!(RESEARCH_SEARCH_MAX_ITEMS, 40);
            assert_eq!(request.result_limit, RESEARCH_SEARCH_DEFAULT_RESULT_LIMIT);
            assert_eq!(RESEARCH_SEARCH_MAX_RESULT_LIMIT, 100);
            assert_eq!(request.max_pages, 20);
            assert_eq!(request.timeout_ms, 90_000);
        }
        let capabilities = whu_academic_discovery_v2_capabilities();
        assert_eq!(
            capabilities.connector_id,
            WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID
        );
        assert!(!capabilities.requires_page_facet_confirmation);
        assert_eq!(
            capabilities.transport,
            LiteratureConnectorTransport::DomFallback
        );
        assert!(capabilities.experimental_fallback);
        assert_eq!(capabilities.record_kinds, supported_paper_kinds());
    }

    #[test]
    fn result_limit_defaults_to_forty_accepts_one_hundred_and_rejects_other_values() {
        let default_request =
            validate_literature_search_request(LiteratureSearchRequest::whu("machine learning"))
                .unwrap();
        assert_eq!(default_request.result_limit, 40);

        let mut one_hundred = LiteratureSearchRequest::whu("machine learning");
        one_hundred.result_limit = 100;
        assert_eq!(
            validate_literature_search_request(one_hundred)
                .unwrap()
                .result_limit,
            100
        );

        for invalid in [0, 1, 39, 41, 99, 101] {
            let mut request = LiteratureSearchRequest::whu("machine learning");
            request.result_limit = invalid;
            assert_eq!(
                validate_literature_search_request(request),
                Err("SIDERA_RESEARCH_SEARCH_RESULT_LIMIT_INVALID")
            );
        }
    }

    #[test]
    fn requested_type_and_year_filters_run_before_the_result_limit() {
        let mut request = LiteratureSearchRequest::whu("人工智能");
        request.filters.record_kinds = vec![SideraInstitutionRecordKind::Thesis];
        request.filters.year_from = Some(2020);
        request.filters.year_to = Some(2022);
        let mut accepted = record(
            "Accepted thesis",
            SideraInstitutionRecordKind::Thesis,
            Some("10.8/accepted"),
        );
        accepted.year = Some(2021);
        let mut too_old = record(
            "Old thesis",
            SideraInstitutionRecordKind::Thesis,
            Some("10.8/old"),
        );
        too_old.year = Some(2019);
        let journal = record(
            "Journal",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.8/journal"),
        );
        let (candidates, report) =
            normalize_connector_result(&request, result(vec![too_old, journal, accepted]));
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].title, "Accepted thesis");
        assert_eq!(report.records_received, 3);
        assert_eq!(report.records_accepted, 1);
        assert_eq!(
            report.records_received,
            report.records_accepted
                + report.excluded_non_paper
                + report.excluded_unknown
                + report.excluded_invalid
        );

        let (filtered_empty, report) = normalize_connector_result(
            &request,
            result(vec![record(
                "Valid journal outside requested type",
                SideraInstitutionRecordKind::JournalArticle,
                Some("10.8/filtered"),
            )]),
        );
        assert!(filtered_empty.is_empty());
        assert_eq!(report.status, ResearchSearchSourceStatus::Complete);
        assert_eq!(
            report.completion_reason,
            ResearchSearchCompletionReason::SourceExhausted
        );
    }

    #[test]
    fn one_hundred_is_a_hard_post_dedupe_limit() {
        let mut request = LiteratureSearchRequest::whu("machine learning");
        request.result_limit = 100;
        let mut orchestrator = ResearchSearchOrchestrator::default();
        orchestrator.begin(request, 100).unwrap();
        let records = (0..101)
            .map(|index| {
                record(
                    &format!("Candidate {index}"),
                    SideraInstitutionRecordKind::JournalArticle,
                    Some(&format!("10.1000/{index}")),
                )
            })
            .collect();
        let token = orchestrator.next_token().unwrap();
        let run = orchestrator
            .apply_connector_result(&token, result(records), 200)
            .unwrap();
        assert_eq!(run.candidates.len(), 100);
        assert!(run.truth.limit_reached);
        assert!(run.truth.target_reached);
        assert_eq!(run.truth.has_more, Some(true));
        assert_eq!(run.truth.result_limit, 100);
        assert_eq!(
            run.truth.completion_reason,
            ResearchSearchCompletionReason::ResultLimit
        );
        assert_eq!(run.truth.records_received, 101);
        assert_eq!(run.truth.records_accepted, 101);
    }

    #[test]
    fn reaching_the_target_does_not_invent_more_results() {
        let records = (0..40)
            .map(|index| {
                record(
                    &format!("Exact target {index}"),
                    SideraInstitutionRecordKind::JournalArticle,
                    Some(&format!("10.1001/{index}")),
                )
            })
            .collect();
        let mut orchestrator = begin("exact target");
        let token = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_result(&token, result(records), 200)
            .unwrap();
        let finish = orchestrator.next_token().unwrap();
        let run = orchestrator.finish(&finish, 300).unwrap();
        assert!(run.truth.limit_reached);
        assert!(run.truth.target_reached);
        assert_eq!(run.truth.has_more, None);
    }

    #[test]
    fn provider_interleaving_and_earliest_retrieval_rank_are_stable() {
        let mut first = record(
            "First",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.55/duplicate"),
        );
        first.source_provider = Some("万方".to_string());
        let mut second = record(
            "Second",
            SideraInstitutionRecordKind::ConferencePaper,
            Some("10.55/second"),
        );
        second.source_provider = Some("国家哲学社会科学文献中心".to_string());
        let mut duplicate = record(
            "Duplicate later",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.55/duplicate"),
        );
        duplicate.source_provider = Some("万方".to_string());
        let mut source = result(vec![first, second, duplicate]);
        source.retrieval_positions = vec![
            ResearchSearchRetrievalPosition {
                connector_id: "ignored-page-value".to_string(),
                rank: 1,
                page: 1,
                position: 1,
                facet: Some("article".to_string()),
                basis: ResearchSearchRetrievalPositionBasis::Observed,
            },
            ResearchSearchRetrievalPosition {
                connector_id: "ignored-page-value".to_string(),
                rank: 2,
                page: 1,
                position: 2,
                facet: Some("conference-paper".to_string()),
                basis: ResearchSearchRetrievalPositionBasis::Observed,
            },
            ResearchSearchRetrievalPosition {
                connector_id: "ignored-page-value".to_string(),
                rank: 3,
                page: 2,
                position: 1,
                facet: Some("article".to_string()),
                basis: ResearchSearchRetrievalPositionBasis::Observed,
            },
        ];
        let mut orchestrator = begin("人工智能");
        let token = orchestrator.next_token().unwrap();
        let run = orchestrator
            .apply_connector_result(&token, source, 200)
            .unwrap();
        assert_eq!(run.candidates.len(), 2);
        assert_eq!(run.candidates[0].source_database, "万方");
        assert_eq!(
            run.candidates[1].source_database,
            "国家哲学社会科学文献中心"
        );
        assert_eq!(run.candidates[0].retrieval_position.rank, 1);
        assert_eq!(run.candidates[1].retrieval_position.rank, 2);
        assert_eq!(
            run.candidates[0].retrieval_position.basis,
            ResearchSearchRetrievalPositionBasis::Observed
        );
        assert_eq!(
            run.candidates[0].retrieval_position.connector_id,
            WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID
        );
        assert_eq!(run.truth.duplicates_merged, 1);
        assert_eq!(run.truth.coverage, 2);
        assert_eq!(run.source_reports.len(), 1);
        assert_eq!(run.source_reports[0].provider_breakdown.len(), 2);
        assert_eq!(
            run.source_reports[0].provider_breakdown[0].provider_name,
            "万方"
        );
        assert_eq!(
            run.source_reports[0].provider_breakdown[1].provider_name,
            "国家哲学社会科学文献中心"
        );
    }

    #[test]
    fn missing_provider_identity_is_not_counted_as_provider_coverage() {
        let mut item = record(
            "Provider identity missing",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.55/provider-missing"),
        );
        item.source_provider = None;
        let mut orchestrator = begin("人工智能");
        let token = orchestrator.next_token().unwrap();
        let run = orchestrator
            .apply_connector_result(&token, result(vec![item]), 200)
            .unwrap();
        assert_eq!(run.candidates.len(), 1);
        assert_eq!(
            run.candidates[0].source_database,
            "供应商未标明（武汉大学统一发现）"
        );
        assert_eq!(
            run.candidates[0].retrieval_position.basis,
            ResearchSearchRetrievalPositionBasis::Synthesized
        );
        assert_eq!(run.truth.coverage, 0);
        assert!(run.source_reports[0].provider_breakdown.is_empty());
    }

    #[test]
    fn truth_keeps_unknown_total_and_real_page_completion_reason() {
        let mut source = result(vec![record(
            "Page bounded",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.77/page"),
        )]);
        source.pages_scanned = 7;
        source.total_hits = None;
        source.partial = true;
        source.completion_reason = ResearchSearchCompletionReason::PageLimit;
        let mut orchestrator = begin("人工智能");
        let token = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_result(&token, source, 200)
            .unwrap();
        let finish = orchestrator.next_token().unwrap();
        let run = orchestrator.finish(&finish, 300).unwrap();
        assert_eq!(run.truth.pages_scanned, 7);
        assert_eq!(run.truth.total_hits, None);
        assert!(!run.truth.target_reached);
        assert_eq!(run.truth.has_more, None);
        assert_eq!(
            run.truth.completion_reason,
            ResearchSearchCompletionReason::PageLimit
        );
        assert_eq!(run.status, ResearchSearchStatus::Partial);
    }

    #[test]
    fn official_has_more_survives_partial_structured_completion() {
        let mut source = result(vec![record(
            "Structured page",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.77/structured"),
        )]);
        source.transport = LiteratureConnectorTransport::StructuredApi;
        source.has_more = Some(true);
        source.partial = true;
        source.completion_reason = ResearchSearchCompletionReason::PartialFailure;
        let mut orchestrator = begin("machine learning");
        let token = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_result(&token, source, 200)
            .unwrap();
        let finish = orchestrator.next_token().unwrap();
        let run = orchestrator.finish(&finish, 300).unwrap();
        assert_eq!(run.truth.has_more, Some(true));
        assert_eq!(run.status, ResearchSearchStatus::Partial);
    }

    #[test]
    fn explicit_zero_and_timeout_have_distinct_truth() {
        let mut zero = result(Vec::new());
        zero.explicit_zero_results = true;
        zero.total_hits = Some(0);
        zero.completion_reason = ResearchSearchCompletionReason::ExplicitZeroResults;
        let mut orchestrator = begin("no match");
        let token = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_result(&token, zero, 200)
            .unwrap();
        let finish = orchestrator.next_token().unwrap();
        let run = orchestrator.finish(&finish, 300).unwrap();
        assert_eq!(run.status, ResearchSearchStatus::Complete);
        assert_eq!(run.truth.total_hits, Some(0));
        assert_eq!(run.truth.has_more, Some(false));
        assert_eq!(
            run.truth.completion_reason,
            ResearchSearchCompletionReason::ExplicitZeroResults
        );

        let mut orchestrator = begin("timeout");
        let token = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_failure(
                &token,
                LiteratureConnectorFailure {
                    connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                    source_id: "whu-academic-discovery".to_string(),
                    source_name: "武汉大学统一发现".to_string(),
                    pages_scanned: 7,
                    code: "SIDERA_INSTITUTION_SEARCH_TIMEOUT".to_string(),
                    message: "timeout".to_string(),
                },
                200,
            )
            .unwrap();
        let finish = orchestrator.next_token().unwrap();
        let run = orchestrator.finish(&finish, 300).unwrap();
        assert_eq!(run.status, ResearchSearchStatus::Failed);
        assert_eq!(run.truth.pages_scanned, 7);
        assert_eq!(run.truth.total_hits, None);
        assert_eq!(
            run.truth.completion_reason,
            ResearchSearchCompletionReason::Timeout
        );
        let failure = orchestrator.state().last_failure.as_ref().unwrap();
        assert_eq!(failure.code, "SIDERA_INSTITUTION_SEARCH_TIMEOUT");
        assert_eq!(failure.message, "timeout");
        assert_eq!(failure.terminal_snapshot.truth.pages_scanned, 7);
        assert_eq!(
            failure.terminal_snapshot.truth.completion_reason,
            ResearchSearchCompletionReason::Timeout
        );
        assert_eq!(failure.terminal_snapshot.source_reports.len(), 1);
    }

    #[test]
    fn explicit_paper_kinds_survive_while_books_and_unknown_are_excluded() {
        let records = vec![
            record(
                "期刊论文",
                SideraInstitutionRecordKind::JournalArticle,
                Some("10.1/a"),
            ),
            record(
                "Conference Paper",
                SideraInstitutionRecordKind::ConferencePaper,
                Some("10.1/b"),
            ),
            record(
                "学位论文",
                SideraInstitutionRecordKind::Thesis,
                Some("10.1/c"),
            ),
            record("图书", SideraInstitutionRecordKind::Book, None),
            record("类型未知", SideraInstitutionRecordKind::Unknown, None),
        ];
        let mut orchestrator = begin("人工智能");
        let token = orchestrator.next_token().unwrap();
        let run = orchestrator
            .apply_connector_result(&token, result(records), 200)
            .unwrap();
        assert_eq!(run.candidates.len(), 3);
        assert!(run
            .candidates
            .iter()
            .all(|candidate| { is_supported_paper_kind(&candidate.record_kind) }));
        assert_eq!(
            run.candidates[0].journal.as_deref(),
            Some("Journal of Research")
        );
        assert_eq!(run.candidates[0].volume.as_deref(), Some("3"));
        assert_eq!(run.candidates[0].issue.as_deref(), Some("1"));
        assert_eq!(run.candidates[0].pages.as_deref(), Some("1-9"));
        assert!(run.candidates[0].field_provenance.contains_key("journal"));
        assert_eq!(
            run.candidates[0].producer_versions,
            vec![WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string()]
        );
        assert_eq!(
            run.candidates[0]
                .field_provenance
                .get("journal")
                .map(|value| value.connector_version.as_str()),
            Some(WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID)
        );
        assert_eq!(run.source_reports[0].excluded_non_paper, 1);
        assert_eq!(run.source_reports[0].excluded_unknown, 1);
        assert_eq!(
            run.source_reports[0].status,
            ResearchSearchSourceStatus::Partial
        );
        assert_eq!(
            run.source_reports[0].code,
            "SIDERA_RESEARCH_SEARCH_RECORD_TYPE_UNCONFIRMED"
        );
    }

    #[test]
    fn transport_partial_truth_is_not_masked_by_unknown_record_exclusion() {
        let mut connector = result(vec![
            record(
                "Confirmed paper",
                SideraInstitutionRecordKind::JournalArticle,
                Some("10.1/confirmed"),
            ),
            record("Unknown record", SideraInstitutionRecordKind::Unknown, None),
        ]);
        connector.partial = true;
        connector.code = "SIDERA_RESEARCH_STRUCTURED_PAGINATION_STALLED".to_string();
        connector.message = "The next structured page did not arrive.".to_string();
        connector.has_more = Some(true);
        connector.completion_reason = ResearchSearchCompletionReason::PartialFailure;

        let mut orchestrator = begin("machine learning");
        let token = orchestrator.next_token().unwrap();
        let run = orchestrator
            .apply_connector_result(&token, connector, 200)
            .unwrap();

        assert_eq!(run.candidates.len(), 1);
        assert_eq!(run.source_reports[0].excluded_unknown, 1);
        assert_eq!(
            run.source_reports[0].code,
            "SIDERA_RESEARCH_STRUCTURED_PAGINATION_STALLED"
        );
    }

    #[test]
    fn candidates_dedupe_by_doi_across_sources() {
        let mut orchestrator = begin("machine learning");
        let first = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_result(
                &first,
                result(vec![record(
                    "Machine Learning",
                    SideraInstitutionRecordKind::JournalArticle,
                    Some("https://doi.org/10.1000/ABC"),
                )]),
                200,
            )
            .unwrap();
        let second = orchestrator.next_token().unwrap();
        let mut duplicate = result(vec![record(
            "机器学习",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.1000/abc"),
        )]);
        duplicate.source_id = "provider-two".to_string();
        duplicate.source_name = "第二来源".to_string();
        let run = orchestrator
            .apply_connector_result(&second, duplicate, 300)
            .unwrap();
        assert_eq!(run.candidates.len(), 1);
        assert_eq!(run.candidates[0].source_ids.len(), 2);
        assert_eq!(run.candidates[0].doi.as_deref(), Some("10.1000/abc"));
    }

    #[test]
    fn provider_record_identity_is_scoped_to_the_source_database() {
        let mut first_record = record(
            "Shared provider identifier",
            SideraInstitutionRecordKind::JournalArticle,
            None,
        );
        first_record.provider_record_id = Some("REC-42".to_string());
        first_record.source_provider = Some("第一来源数据库".to_string());
        let mut orchestrator = begin("machine learning");
        let first = orchestrator.next_token().unwrap();
        orchestrator
            .apply_connector_result(&first, result(vec![first_record.clone()]), 200)
            .unwrap();

        let second = orchestrator.next_token().unwrap();
        let mut other_source = result(vec![first_record.clone()]);
        other_source.source_id = "provider-two".to_string();
        other_source.source_name = "第二来源数据库".to_string();
        other_source.records[0].source_provider = Some("第二来源数据库".to_string());
        let run = orchestrator
            .apply_connector_result(&second, other_source, 300)
            .unwrap();
        assert_eq!(run.candidates.len(), 2);

        let third = orchestrator.next_token().unwrap();
        let run = orchestrator
            .apply_connector_result(&third, result(vec![first_record]), 400)
            .unwrap();
        assert_eq!(run.candidates.len(), 2);
    }

    #[test]
    fn single_partial_source_keeps_verified_candidates_and_finishes_partial() {
        let mut orchestrator = begin("人工智能");
        let token = orchestrator.next_token().unwrap();
        let mut partial = result(vec![record(
            "可信论文",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.2/verified"),
        )]);
        partial.partial = true;
        partial.code = "UPSTREAM_PARTIAL".to_string();
        orchestrator
            .apply_connector_result(&token, partial, 200)
            .unwrap();
        let finish = orchestrator.next_token().unwrap();
        let run = orchestrator.finish(&finish, 300).unwrap();
        assert_eq!(run.status, ResearchSearchStatus::Partial);
        assert_eq!(run.candidates.len(), 1);
    }

    #[test]
    fn a_source_with_only_filtered_records_is_partial_not_a_fake_zero_result() {
        let (candidates, report) = normalize_connector_result(
            &LiteratureSearchRequest::whu("人工智能"),
            result(vec![record(
                "Only a book",
                SideraInstitutionRecordKind::Book,
                None,
            )]),
        );
        assert!(candidates.is_empty());
        assert_eq!(report.status, ResearchSearchSourceStatus::Partial);
        assert!(!report.explicit_zero_results);
        assert_eq!(report.code, "SIDERA_RESEARCH_SEARCH_SOURCE_ALL_FILTERED");
        assert_eq!(report.records_received, 1);
        assert_eq!(report.records_accepted, 0);
    }

    #[test]
    fn a_new_task_rejects_late_task_epoch_and_sequence_callbacks() {
        let mut orchestrator = begin("first");
        let late = orchestrator.next_token().unwrap();
        orchestrator
            .begin(LiteratureSearchRequest::whu("second"), 200)
            .unwrap();
        assert_eq!(
            orchestrator
                .apply_connector_result(
                    &late,
                    result(vec![record(
                        "Late",
                        SideraInstitutionRecordKind::JournalArticle,
                        Some("10.3/late"),
                    )]),
                    300,
                )
                .unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK"
        );
        let valid = orchestrator.next_token().unwrap();
        let mut wrong_sequence = valid.clone();
        wrong_sequence.sequence += 1;
        assert_eq!(
            orchestrator
                .apply_connector_result(&wrong_sequence, result(Vec::new()), 300)
                .unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK"
        );
    }

    #[test]
    fn progress_statuses_advance_with_the_same_token_isolation_as_source_callbacks() {
        let mut orchestrator = begin("人工智能");
        assert_eq!(
            orchestrator.active().unwrap().status,
            ResearchSearchStatus::CheckingSession
        );

        let first = orchestrator.next_token().unwrap();
        let awaiting = orchestrator
            .mark_status(
                &first,
                ResearchSearchStatus::AwaitingUserAuth,
                "AUTH_REQUIRED",
                "等待用户完成机构认证。",
                110,
            )
            .unwrap();
        assert_eq!(awaiting.status, ResearchSearchStatus::AwaitingUserAuth);
        assert_eq!(awaiting.sequence, first.sequence);

        assert_eq!(
            orchestrator
                .mark_status(
                    &first,
                    ResearchSearchStatus::ResolvingConnectors,
                    "STALE",
                    "迟到状态。",
                    120,
                )
                .unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK"
        );

        for (status, code) in [
            (ResearchSearchStatus::CheckingSession, "SESSION_RECHECK"),
            (ResearchSearchStatus::ResolvingConnectors, "RESOLVING"),
            (ResearchSearchStatus::Searching, "SEARCHING"),
            (ResearchSearchStatus::Normalizing, "NORMALIZING"),
            (ResearchSearchStatus::Searching, "SEARCH_RESUMED"),
        ] {
            let token = orchestrator.next_token().unwrap();
            let run = orchestrator
                .mark_status(&token, status, code, code, 120 + token.sequence as u128)
                .unwrap();
            assert_eq!(run.status, status);
            assert_eq!(run.sequence, token.sequence);
        }

        let invalid = orchestrator.next_token().unwrap();
        assert_eq!(
            orchestrator
                .mark_status(
                    &invalid,
                    ResearchSearchStatus::Complete,
                    "INVALID",
                    "终态必须由 finish 收口。",
                    200,
                )
                .unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_STATUS_INVALID"
        );
    }

    #[test]
    fn task_bound_discovery_auth_keeps_task_and_search_identity_until_resume() {
        let mut store = ResearchSearchStore::default();
        let (state, started) = store
            .begin_with_context(
                LiteratureSearchRequest::whu("人工智能"),
                "search-014-r4",
                SideraResearchSearchStartReason::UserSearch,
                9,
                100,
            )
            .unwrap();
        assert!(started);
        let original_task_id = state.active_attempt.unwrap().run.task_id;
        for (phase, at_ms) in [
            (SideraResearchSearchAuthPhase::AwaitingUser, 110),
            (SideraResearchSearchAuthPhase::Verifying, 120),
            (SideraResearchSearchAuthPhase::RefreshingParent, 130),
            (SideraResearchSearchAuthPhase::Resuming, 140),
        ] {
            let token = store.next_token().unwrap();
            store
                .mark_task_bound_auth_phase(&token, phase, at_ms)
                .unwrap();
            let attempt = store.state().active_attempt.as_ref().unwrap();
            assert_eq!(attempt.run.task_id, original_task_id);
            assert_eq!(attempt.client_request_id, "search-014-r4");
            assert_eq!(attempt.run.status, ResearchSearchStatus::AwaitingUserAuth);
            let context = attempt.auth_context.as_ref().unwrap();
            assert_eq!(
                context.goal,
                SideraResearchSearchAuthGoal::DiscoveryFulltext
            );
            assert_eq!(context.phase, phase);
            assert_eq!(context.search_id, "search-014-r4");
            let serialized = serde_json::to_string(context).unwrap();
            assert!(!serialized.contains("人工智能"));
            assert!(!serialized.contains("http"));
        }
        let stale = store.next_token().unwrap();
        let resumed = store.resume_after_task_bound_auth(&stale, 150).unwrap();
        assert_eq!(resumed.task_id, original_task_id);
        assert_eq!(resumed.status, ResearchSearchStatus::Searching);
        assert!(store
            .state()
            .active_attempt
            .as_ref()
            .unwrap()
            .auth_context
            .is_none());
        assert_eq!(
            store.resume_after_task_bound_auth(&stale, 160).unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_AUTH_CONTEXT_STALE"
        );
    }

    #[test]
    fn serialized_candidates_expose_only_nullable_opaque_locators_not_real_urls() {
        let mut item = record(
            "Secure Candidate",
            SideraInstitutionRecordKind::JournalArticle,
            Some("10.9/secure"),
        );
        item.detail_url = "https://provider.example/record/secret?record=42&ticket=private&access_token=hidden#credential".to_string();
        item.full_text_url = Some(
            "https://provider.example/fulltext/secret.pdf?download=1&session_id=hidden".to_string(),
        );
        let (candidates, _) =
            normalize_connector_result(&LiteratureSearchRequest::whu("secure"), result(vec![item]));
        let candidate = &candidates[0];
        assert!(candidate.canonical_url.is_some());
        assert!(candidate.full_text_url.is_some());
        assert_eq!(
            candidate.canonical_url.as_deref(),
            Some("https://provider.example/record/secret?record=42")
        );
        assert_eq!(
            candidate.full_text_url.as_deref(),
            Some("https://provider.example/fulltext/secret.pdf?download=1")
        );
        assert!(candidate
            .detail_locator
            .as_deref()
            .is_some_and(|value| value.starts_with("research-detail-")));
        assert!(candidate
            .full_text_locator
            .as_deref()
            .is_some_and(|value| value.starts_with("research-full-text-")));

        let serialized = serde_json::to_string(candidate).unwrap();
        assert!(!serialized.contains("https://"));
        assert!(!serialized.contains("ticket"));
        assert!(serialized.contains("\"detailLocator\":\"research-detail-"));
        assert!(serialized.contains("\"fullTextLocator\":\"research-full-text-"));
    }

    #[test]
    fn trait_connector_can_feed_the_ui_independent_orchestrator() {
        let mut orchestrator = begin("machine learning");
        let mut connector = FixtureConnector {
            capabilities: whu_academic_discovery_v2_capabilities(),
            result: Ok(result(vec![record(
                "Machine Learning Systems",
                SideraInstitutionRecordKind::ConferencePaper,
                Some("10.4/system"),
            )])),
        };
        let run = orchestrator.execute_connector(&mut connector, 200).unwrap();
        assert_eq!(run.candidates.len(), 1);
        assert_eq!(run.status, ResearchSearchStatus::Searching);
    }

    fn complete_displayed_snapshot(
        store: &mut ResearchSearchStore,
        query: &str,
        client_request_id: &str,
        now_ms: u128,
    ) -> ResearchSearchRun {
        store
            .begin_with_context(
                LiteratureSearchRequest::whu(query),
                client_request_id,
                SideraResearchSearchStartReason::UserSearch,
                7,
                now_ms,
            )
            .unwrap();
        let token = store.next_token().unwrap();
        store
            .apply_connector_result(
                &token,
                result(vec![record(
                    query,
                    SideraInstitutionRecordKind::JournalArticle,
                    Some("10.1000/stable"),
                )]),
                now_ms + 1,
            )
            .unwrap();
        let token = store.next_token().unwrap();
        store.finish(&token, now_ms + 2).unwrap()
    }

    #[test]
    fn failed_attempt_preserves_the_last_displayed_snapshot() {
        let mut store = ResearchSearchStore::default();
        let displayed = complete_displayed_snapshot(&mut store, "人工智能", "request-cn", 100);
        store
            .begin_with_context(
                LiteratureSearchRequest::whu("machine learning"),
                "request-en",
                SideraResearchSearchStartReason::UserSearch,
                8,
                200,
            )
            .unwrap();
        let token = store.next_token().unwrap();
        store
            .apply_connector_failure(
                &token,
                LiteratureConnectorFailure {
                    connector_id: WHU_ACADEMIC_DISCOVERY_V2_CONNECTOR_ID.to_string(),
                    source_id: "failed-source".to_string(),
                    source_name: "失败来源".to_string(),
                    pages_scanned: 0,
                    code: "UPSTREAM_TIMEOUT".to_string(),
                    message: "来源超时。".to_string(),
                },
                201,
            )
            .unwrap();
        let token = store.next_token().unwrap();
        let failed = store.finish(&token, 202).unwrap();
        assert_eq!(failed.status, ResearchSearchStatus::Failed);
        assert_eq!(store.displayed().unwrap().task_id, displayed.task_id);
        assert_eq!(
            store.state().last_failure.as_ref().unwrap().task_id,
            failed.task_id
        );
        assert_eq!(
            store
                .state()
                .last_failure
                .as_ref()
                .unwrap()
                .terminal_snapshot
                .task_id,
            failed.task_id
        );
        assert!(store.active().is_none());
    }

    #[test]
    fn cancelled_attempt_preserves_displayed_snapshot() {
        let mut store = ResearchSearchStore::default();
        let displayed = complete_displayed_snapshot(&mut store, "人工智能", "request-cn", 100);
        store
            .begin_with_context(
                LiteratureSearchRequest::whu("machine learning"),
                "request-en",
                SideraResearchSearchStartReason::Retry,
                9,
                200,
            )
            .unwrap();
        let cancelled = store.cancel(201).unwrap();
        assert_eq!(cancelled.status, ResearchSearchStatus::Cancelled);
        assert_eq!(store.displayed().unwrap().task_id, displayed.task_id);
        assert_eq!(
            store.state().last_failure.as_ref().unwrap().status,
            ResearchSearchStatus::Cancelled
        );
    }

    #[test]
    fn client_request_id_is_idempotent_and_does_not_replace_the_attempt() {
        let mut store = ResearchSearchStore::default();
        let (first, started) = store
            .begin_with_context(
                LiteratureSearchRequest::whu("人工智能"),
                "same-request",
                SideraResearchSearchStartReason::UserSearch,
                3,
                100,
            )
            .unwrap();
        assert!(started);
        let first_task = first.active_attempt.unwrap().run.task_id;
        let (replayed, started) = store
            .begin_with_context(
                LiteratureSearchRequest::whu("machine learning"),
                "same-request",
                SideraResearchSearchStartReason::UserSearch,
                99,
                101,
            )
            .unwrap();
        assert!(!started);
        assert_eq!(replayed.active_attempt.unwrap().run.task_id, first_task);
        assert_eq!(
            store.state().lifecycle.last().unwrap().kind,
            SideraResearchSearchLifecycleKind::IdempotentReplay
        );
    }

    #[test]
    fn client_request_id_history_is_bounded_and_evicts_least_recently_used() {
        let mut store = ResearchSearchStore::default();
        let mut first_task_id = String::new();
        for index in 0..RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT {
            let (state, started) = store
                .begin_with_context(
                    LiteratureSearchRequest::whu("人工智能"),
                    format!("request-{index}"),
                    SideraResearchSearchStartReason::UserSearch,
                    1,
                    100 + index as u128,
                )
                .unwrap();
            assert!(started);
            if index == 0 {
                first_task_id = state.active_attempt.unwrap().run.task_id;
            }
        }

        assert_eq!(
            store.request_tasks.len(),
            RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT
        );
        assert_eq!(
            store.request_task_recency.len(),
            RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT
        );
        let current_task_id = store.active().unwrap().task_id.clone();

        let (replayed, started) = store
            .begin_with_context(
                LiteratureSearchRequest::whu("different query"),
                "request-0",
                SideraResearchSearchStartReason::Retry,
                99,
                1_000,
            )
            .unwrap();
        assert!(!started);
        assert_eq!(
            replayed.active_attempt.unwrap().run.task_id,
            current_task_id
        );
        assert_eq!(
            store.state().lifecycle.last().unwrap().task_id.as_deref(),
            Some(first_task_id.as_str())
        );
        assert_eq!(
            store.request_task_recency.back().map(String::as_str),
            Some("request-0")
        );

        let (_, started) = store
            .begin_with_context(
                LiteratureSearchRequest::whu("人工智能"),
                format!("request-{RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT}"),
                SideraResearchSearchStartReason::UserSearch,
                1,
                1_001,
            )
            .unwrap();
        assert!(started);
        assert_eq!(
            store.request_tasks.len(),
            RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT
        );
        assert!(store.request_tasks.contains_key("request-0"));
        assert!(!store.request_tasks.contains_key("request-1"));
        assert!(store.request_tasks.contains_key("request-31"));
        assert!(store.request_tasks.contains_key("request-32"));
        assert_eq!(
            store.request_task_recency.front().map(String::as_str),
            Some("request-2")
        );
        assert_eq!(
            store.request_task_recency.back().map(String::as_str),
            Some("request-32")
        );

        let (_, started) = store
            .begin_with_context(
                LiteratureSearchRequest::whu("人工智能"),
                "request-1",
                SideraResearchSearchStartReason::UserSearch,
                1,
                1_002,
            )
            .unwrap();
        assert!(started);
        assert_eq!(
            store.request_tasks.len(),
            RESEARCH_SEARCH_REQUEST_TASK_HISTORY_LIMIT
        );
        assert_eq!(
            store
                .state()
                .active_attempt
                .as_ref()
                .unwrap()
                .client_request_id,
            "request-1"
        );
    }

    #[test]
    fn full_transport_token_rejects_wrong_client_or_webview_generation() {
        let mut store = ResearchSearchStore::default();
        store
            .begin_with_context(
                LiteratureSearchRequest::whu("人工智能"),
                "request-cn",
                SideraResearchSearchStartReason::UserSearch,
                42,
                100,
            )
            .unwrap();
        let valid = store.next_token().unwrap();
        let mut wrong_client = valid.clone();
        wrong_client.client_request_id = "other-request".to_string();
        assert_eq!(
            store
                .apply_connector_result(&wrong_client, result(Vec::new()), 101)
                .unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK"
        );
        let mut wrong_generation = valid;
        wrong_generation.webview_generation += 1;
        assert_eq!(
            store
                .apply_connector_result(&wrong_generation, result(Vec::new()), 102)
                .unwrap_err(),
            "SIDERA_RESEARCH_SEARCH_STALE_CALLBACK"
        );
    }

    #[test]
    fn lifecycle_journal_is_bounded_to_thirty_two_events() {
        let mut store = ResearchSearchStore::default();
        store
            .begin_with_context(
                LiteratureSearchRequest::whu("人工智能"),
                "same-request",
                SideraResearchSearchStartReason::UserSearch,
                1,
                100,
            )
            .unwrap();
        for now in 101..150 {
            store
                .begin_with_context(
                    LiteratureSearchRequest::whu("人工智能"),
                    "same-request",
                    SideraResearchSearchStartReason::UserSearch,
                    1,
                    now,
                )
                .unwrap();
        }
        assert_eq!(store.state().lifecycle.len(), 32);
    }
}
