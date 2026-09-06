use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use crate::institution_connection::SideraInstitutionActiveConnection;
use crate::institution_probe::validate_whu_database_sso_url;

pub const WHU_ACADEMIC_DISCOVERY_ADAPTER_ID: &str = "whu-academic-discovery-v1";
pub const WHU_OPAC_CATALOG_ADAPTER_ID: &str = "whu-opac-catalog-v3";
pub const WHU_CATALOG_ADAPTER_ID: &str = WHU_OPAC_CATALOG_ADAPTER_ID;
pub const WHU_CATALOG_ENTRY_URL: &str = "https://opac.lib.whu.edu.cn/F/?func=find-m";
pub const INSTITUTION_QUERY_MAX_CHARS: usize = 200;
pub const INSTITUTION_EXTRACTION_MAX_BYTES: usize = 256 * 1024;
pub const INSTITUTION_BUCKET_ITEM_LIMIT: usize = 20;
pub const INSTITUTION_TOTAL_ITEM_LIMIT: usize = 40;
pub const INSTITUTION_NAVIGATION_TRACE_LIMIT: usize = 32;
pub const INSTITUTION_CONNECTION_VERIFICATION_TRACE_LIMIT: usize = 12;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionSessionStatus {
    Uninitialized,
    Starting,
    LoginRequired,
    Ready,
    Expired,
    Searching,
    Partial,
    Failed,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionAuthKind {
    #[default]
    DatabaseSso,
    LibraryAccount,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionAuthStatus {
    #[default]
    Idle,
    Starting,
    LoginRequired,
    Ready,
    Cancelled,
    Failed,
}

pub fn institution_restore_is_current(
    inflight: bool,
    current_epoch: u64,
    expected_epoch: u64,
    current_generation: u64,
    expected_generation: Option<u64>,
) -> bool {
    inflight
        && current_epoch == expected_epoch
        && expected_generation.map_or(true, |value| current_generation == value)
}

pub fn classify_institution_restore_status(
    statuses: &[SideraInstitutionAuthStatus],
) -> SideraInstitutionSessionStatus {
    let ready = statuses
        .iter()
        .filter(|status| **status == SideraInstitutionAuthStatus::Ready)
        .count();
    if ready == statuses.len() && !statuses.is_empty() {
        SideraInstitutionSessionStatus::Ready
    } else if ready > 0 {
        SideraInstitutionSessionStatus::Partial
    } else if statuses
        .iter()
        .any(|status| *status == SideraInstitutionAuthStatus::LoginRequired)
    {
        SideraInstitutionSessionStatus::LoginRequired
    } else {
        SideraInstitutionSessionStatus::Failed
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionNavigationPhase {
    Starting,
    Redirect,
    Completed,
    Blocked,
    Failed,
    Timeout,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionNavigationEvent {
    pub navigation_id: Option<u64>,
    pub generation: u64,
    pub epoch: u64,
    pub auth_kind: SideraInstitutionAuthKind,
    pub phase: SideraInstitutionNavigationPhase,
    pub host: String,
    pub path: String,
    pub redirected: bool,
    pub web_error_status: Option<String>,
    pub timestamp_ms: u128,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionConnectionVerificationStage {
    PageObservation,
    CloseCurrent,
    CloseParent,
    Resolved,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionConnectionVerificationSurface {
    AuthWindow,
    Parent,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionConnectionVerificationVerdict {
    Ready,
    LoginRequired,
    Failed,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionConnectionVerificationEvent {
    pub transaction_id: String,
    pub stage: SideraInstitutionConnectionVerificationStage,
    pub surface: SideraInstitutionConnectionVerificationSurface,
    pub verdict: SideraInstitutionConnectionVerificationVerdict,
    pub reason_code: String,
    pub attempt: u8,
    pub elapsed_ms: u64,
    pub timestamp_ms: u128,
}

pub fn push_bounded_navigation_event(
    trace: &mut Vec<SideraInstitutionNavigationEvent>,
    event: SideraInstitutionNavigationEvent,
) {
    trace.push(event);
    if trace.len() > INSTITUTION_NAVIGATION_TRACE_LIMIT {
        let overflow = trace.len() - INSTITUTION_NAVIGATION_TRACE_LIMIT;
        trace.drain(0..overflow);
    }
}

pub fn push_bounded_connection_verification_event(
    trace: &mut Vec<SideraInstitutionConnectionVerificationEvent>,
    event: SideraInstitutionConnectionVerificationEvent,
) {
    trace.push(event);
    if trace.len() > INSTITUTION_CONNECTION_VERIFICATION_TRACE_LIMIT {
        let overflow = trace.len() - INSTITUTION_CONNECTION_VERIFICATION_TRACE_LIMIT;
        trace.drain(0..overflow);
    }
}

pub fn initial_navigation_wait_is_current(
    current_generation: u64,
    expected_generation: u64,
    pending_epoch: Option<u64>,
    expected_epoch: u64,
) -> bool {
    current_generation == expected_generation && pending_epoch == Some(expected_epoch)
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionAuthState {
    pub status: SideraInstitutionAuthStatus,
    pub code: String,
    pub message: String,
    pub current_host: Option<String>,
    pub updated_at_ms: u128,
}

impl SideraInstitutionAuthState {
    fn idle(message: &str) -> Self {
        Self {
            status: SideraInstitutionAuthStatus::Idle,
            code: "SIDERA_INSTITUTION_AUTH_IDLE".to_string(),
            message: message.to_string(),
            current_host: None,
            updated_at_ms: 0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SideraInstitutionPopupDisposition {
    AuthModal,
    Reject,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SideraInstitutionNavigationDecision {
    Allow,
    Reject(&'static str),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionSessionState {
    pub institution_id: String,
    pub status: SideraInstitutionSessionStatus,
    pub code: String,
    pub message: String,
    pub current_host: Option<String>,
    pub browser_visible: bool,
    pub fallback_target_id: Option<String>,
    pub fallback_display_url: Option<String>,
    pub database_auth: SideraInstitutionAuthState,
    pub academic_discovery_auth: SideraInstitutionAuthState,
    pub library_account_auth: SideraInstitutionAuthState,
    pub active_connection: Option<SideraInstitutionActiveConnection>,
    pub active_auth_kind: Option<SideraInstitutionAuthKind>,
    pub auth_modal_visible: bool,
    pub discovery_auth_window_visible: bool,
    pub navigation_epoch: u64,
    pub navigation_trace: Vec<SideraInstitutionNavigationEvent>,
    pub connection_verification_trace: Vec<SideraInstitutionConnectionVerificationEvent>,
    pub source_readiness: Vec<SideraInstitutionSourceReadiness>,
    pub updated_at_ms: u128,
}

impl Default for SideraInstitutionSessionState {
    fn default() -> Self {
        Self {
            institution_id: "whu".to_string(),
            status: SideraInstitutionSessionStatus::Uninitialized,
            code: "SIDERA_INSTITUTION_SESSION_UNINITIALIZED".to_string(),
            message: "机构会话尚未初始化。".to_string(),
            current_host: None,
            browser_visible: false,
            fallback_target_id: None,
            fallback_display_url: None,
            database_auth: SideraInstitutionAuthState::idle("数据库 SSO 会话尚未初始化。"),
            academic_discovery_auth: SideraInstitutionAuthState::idle(
                "统一发现检索入口与机构全文身份尚待分别确认。",
            ),
            library_account_auth: SideraInstitutionAuthState::idle("个人图书馆会话尚未初始化。"),
            active_connection: None,
            active_auth_kind: None,
            auth_modal_visible: false,
            discovery_auth_window_visible: false,
            navigation_epoch: 0,
            navigation_trace: Vec::new(),
            connection_verification_trace: Vec::new(),
            source_readiness: vec![
                SideraInstitutionSourceReadiness::uninitialized(
                    SideraInstitutionSearchSource::AcademicDiscovery,
                    "学术论文来源尚未初始化。",
                ),
                SideraInstitutionSourceReadiness::uninitialized(
                    SideraInstitutionSearchSource::Catalog,
                    "馆藏目录来源尚未初始化。",
                ),
            ],
            updated_at_ms: 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionSearchStatus {
    Idle,
    Searching,
    Complete,
    Partial,
    Cancelled,
    Failed,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionSearchStage {
    #[default]
    Idle,
    OpeningWebResult,
    WebResultAvailable,
    AwaitingAuth,
    ResumingAfterAuth,
    FacetProcessing,
    Extracting,
    NativeSnapshotComplete,
    FilterUnconfirmed,
    AdapterDrift,
    Cancelled,
    Failed,
}

pub fn discovery_auth_resume_is_current(
    current_task_id: Option<&str>,
    current_epoch: u64,
    current_generation: u64,
    expected_task_id: &str,
    expected_epoch: u64,
    expected_generation: u64,
) -> bool {
    current_task_id == Some(expected_task_id)
        && current_epoch == expected_epoch
        && current_generation == expected_generation
}

pub fn discovery_auth_search_timeout_should_advance(awaiting_auth: bool) -> bool {
    !awaiting_auth
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionSearchSource {
    #[default]
    AcademicDiscovery,
    Catalog,
}

impl SideraInstitutionSearchSource {
    pub fn adapter_id(self) -> &'static str {
        match self {
            Self::AcademicDiscovery => WHU_ACADEMIC_DISCOVERY_ADAPTER_ID,
            Self::Catalog => WHU_OPAC_CATALOG_ADAPTER_ID,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionRecordKind {
    JournalArticle,
    ConferencePaper,
    Thesis,
    Book,
    JournalHolding,
    #[default]
    Unknown,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionFullTextStatus {
    Available,
    LinkOnly,
    Unavailable,
    #[default]
    Unknown,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionFullTextRoute {
    DirectHtmlPdf,
    Doi,
    OpenurlLinkResolver,
    ProviderRecord,
    PublisherPage,
    #[default]
    BrowserFallback,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionSourceReadinessStatus {
    #[default]
    Uninitialized,
    Starting,
    Ready,
    Partial,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionSourceReadiness {
    pub source: SideraInstitutionSearchSource,
    pub status: SideraInstitutionSourceReadinessStatus,
    pub code: String,
    pub message: String,
    pub current_host: Option<String>,
    pub updated_at_ms: u128,
}

impl SideraInstitutionSourceReadiness {
    fn uninitialized(source: SideraInstitutionSearchSource, message: &str) -> Self {
        Self {
            source,
            status: SideraInstitutionSourceReadinessStatus::Uninitialized,
            code: "SIDERA_INSTITUTION_SOURCE_UNINITIALIZED".to_string(),
            message: message.to_string(),
            current_host: None,
            updated_at_ms: 0,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionSearchProvenance {
    pub institution_id: String,
    pub adapter_id: String,
    pub source_buckets: Vec<String>,
    pub source_host: Option<String>,
    pub extracted_at_ms: u128,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionSearchItem {
    pub id: String,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i32>,
    pub publication: Option<String>,
    pub source_bucket: String,
    pub source_buckets: Vec<String>,
    pub document_type: Option<String>,
    pub doi: Option<String>,
    pub abstract_snippet: Option<String>,
    pub availability: Option<String>,
    pub record_kind: SideraInstitutionRecordKind,
    pub journal: Option<String>,
    pub conference: Option<String>,
    pub degree_institution: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub pages: Option<String>,
    pub source_provider: Option<String>,
    pub full_text_status: SideraInstitutionFullTextStatus,
    pub full_text_route: SideraInstitutionFullTextRoute,
    pub detail_locator: String,
    pub full_text_locator: Option<String>,
    pub provenance: SideraInstitutionSearchProvenance,
    #[serde(skip)]
    pub canonical_locator: Option<String>,
    #[serde(skip)]
    pub provider_record_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionSourceBucket {
    pub id: String,
    pub label: String,
    pub count: Option<usize>,
    pub returned: usize,
    pub status: String,
    pub code: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionSearchSnapshot {
    pub institution_id: String,
    pub adapter_id: String,
    pub source: SideraInstitutionSearchSource,
    pub task_id: Option<String>,
    pub epoch: u64,
    pub sequence: u64,
    pub query: String,
    pub status: SideraInstitutionSearchStatus,
    pub stage: SideraInstitutionSearchStage,
    pub source_buckets: Vec<SideraInstitutionSourceBucket>,
    pub items: Vec<SideraInstitutionSearchItem>,
    pub code: String,
    pub message: String,
    pub started_at_ms: Option<u128>,
    pub updated_at_ms: u128,
    pub finished_at_ms: Option<u128>,
}

impl Default for SideraInstitutionSearchSnapshot {
    fn default() -> Self {
        Self {
            institution_id: "whu".to_string(),
            adapter_id: WHU_ACADEMIC_DISCOVERY_ADAPTER_ID.to_string(),
            source: SideraInstitutionSearchSource::AcademicDiscovery,
            task_id: None,
            epoch: 0,
            sequence: 0,
            query: String::new(),
            status: SideraInstitutionSearchStatus::Idle,
            stage: SideraInstitutionSearchStage::Idle,
            source_buckets: Vec::new(),
            items: Vec::new(),
            code: "SIDERA_INSTITUTION_SEARCH_IDLE".to_string(),
            message: "尚未开始机构检索。".to_string(),
            started_at_ms: None,
            updated_at_ms: 0,
            finished_at_ms: None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionAdapterPage {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub page_signature: String,
    #[serde(default)]
    pub query_echo: Option<String>,
    #[serde(default)]
    pub explicit_zero_results: bool,
    #[serde(default)]
    pub buckets: Vec<SideraInstitutionAdapterBucket>,
    #[serde(default)]
    pub records: Vec<SideraInstitutionAdapterRecord>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionAdapterSubmission {
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub page_signature: String,
    #[serde(default)]
    pub query_echo: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionAdapterBucket {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub count: Option<usize>,
    #[serde(default)]
    pub href: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionAdapterRecord {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub authors: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default)]
    pub publication: Option<String>,
    #[serde(default)]
    pub document_type: Option<String>,
    #[serde(default)]
    pub doi: Option<String>,
    #[serde(default)]
    pub abstract_snippet: Option<String>,
    #[serde(default)]
    pub availability: Option<String>,
    #[serde(default)]
    pub detail_url: String,
    #[serde(default)]
    pub full_text_url: Option<String>,
    #[serde(default)]
    pub record_kind: SideraInstitutionRecordKind,
    #[serde(default)]
    pub journal: Option<String>,
    #[serde(default)]
    pub conference: Option<String>,
    #[serde(default)]
    pub degree_institution: Option<String>,
    #[serde(default)]
    pub volume: Option<String>,
    #[serde(default)]
    pub issue: Option<String>,
    #[serde(default)]
    pub pages: Option<String>,
    #[serde(default)]
    pub source_provider: Option<String>,
    #[serde(default)]
    pub full_text_status: SideraInstitutionFullTextStatus,
    #[serde(default)]
    pub provider_record_id: Option<String>,
    #[serde(default)]
    pub catalog_record_id: Option<String>,
    #[serde(default)]
    pub isbn_issn: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct NormalizedInstitutionResults {
    pub items: Vec<SideraInstitutionSearchItem>,
    pub detail_urls: HashMap<String, String>,
    pub full_text_urls: HashMap<String, String>,
}

pub fn validate_institution_query(query: &str) -> Result<String, &'static str> {
    let normalized = query.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return Err("SIDERA_INSTITUTION_QUERY_EMPTY");
    }
    if normalized.chars().count() > INSTITUTION_QUERY_MAX_CHARS {
        return Err("SIDERA_INSTITUTION_QUERY_TOO_LONG");
    }
    if normalized.chars().any(|value| value.is_control()) {
        return Err("SIDERA_INSTITUTION_QUERY_INVALID");
    }
    Ok(normalized)
}

pub fn validate_institution_extraction_payload(payload: &str) -> Result<(), &'static str> {
    if payload.len() > INSTITUTION_EXTRACTION_MAX_BYTES {
        return Err("SIDERA_INSTITUTION_EXTRACTION_TOO_LARGE");
    }
    Ok(())
}

pub fn is_whu_database_sso_entry_url(value: &str) -> bool {
    validate_whu_database_sso_url(value)
}

pub fn is_whu_database_authenticated_landing_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    matches!(url.scheme(), "http" | "https")
        && matches!(
            normalized_host(&url).as_deref(),
            Some("whu.metaersp.com" | "whu.metaersp.cn")
        )
        && url.path().trim_end_matches('/') == "/personalIndex"
}

pub fn decide_whu_institution_navigation(value: &str) -> SideraInstitutionNavigationDecision {
    let Ok(url) = Url::parse(value) else {
        return SideraInstitutionNavigationDecision::Reject("POLICY_INVALID_URL");
    };
    match url.scheme() {
        "https" | "http" => SideraInstitutionNavigationDecision::Allow,
        _ => SideraInstitutionNavigationDecision::Reject("POLICY_NON_NETWORK_SCHEME"),
    }
}

pub fn safe_institution_navigation_parts(value: &str) -> Option<(String, String)> {
    let url = Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    Some((normalized_host(&url)?, url.path().to_string()))
}

pub fn is_whu_institution_navigation_url(value: &str) -> bool {
    decide_whu_institution_navigation(value) == SideraInstitutionNavigationDecision::Allow
}

pub fn classify_whu_popup_navigation(value: &str) -> SideraInstitutionPopupDisposition {
    if is_whu_institution_navigation_url(value) {
        SideraInstitutionPopupDisposition::AuthModal
    } else {
        SideraInstitutionPopupDisposition::Reject
    }
}

pub fn is_whu_catalog_result_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    matches!(url.scheme(), "http" | "https")
}

pub fn is_whu_catalog_record_detail_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    let pairs = url
        .query_pairs()
        .map(|(key, value)| (key.to_ascii_lowercase(), value.into_owned()))
        .collect::<HashMap<_, _>>();
    match pairs.get("func").map(String::as_str) {
        Some("direct") => pairs
            .get("doc_number")
            .is_some_and(|value| !value.trim().is_empty()),
        Some("full-set-set") => {
            pairs
                .get("set_number")
                .is_some_and(|value| !value.trim().is_empty())
                && pairs
                    .get("set_entry")
                    .is_some_and(|value| !value.trim().is_empty())
        }
        _ => false,
    }
}

pub fn is_institution_navigation_title(value: &str) -> bool {
    let title = value
        .split_whitespace()
        .collect::<String>()
        .to_ascii_lowercase();
    [
        "简单检索",
        "多字段检索",
        "高级检索",
        "通用命令语言",
        "多库检索",
        "分类浏览",
        "检索历史",
        "上次检索结果",
        "simple search",
        "advanced search",
        "search history",
        "previous search",
    ]
    .iter()
    .any(|candidate| title == candidate.replace(' ', "").to_ascii_lowercase())
}

pub fn is_catalog_title_noise(value: &str) -> bool {
    let title = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() || is_institution_navigation_title(&title) {
        return true;
    }
    let compact = title
        .split_whitespace()
        .collect::<String>()
        .to_ascii_lowercase();
    if compact.chars().all(|value| {
        value.is_ascii_digit() || matches!(value, '-' | '_' | '.' | ':' | '：' | '/' | '\\')
    }) {
        return true;
    }
    [
        "doclist[",
        "fmt_issn(",
        "dispfmt(",
        "document.write(",
        "flag_review",
        "flag_rating",
        "rateno++",
        "rateurl+=",
    ]
    .iter()
    .any(|needle| compact.contains(needle))
}

pub fn validate_adapter_records(
    records: &[SideraInstitutionAdapterRecord],
) -> Result<(), &'static str> {
    validate_catalog_adapter_records(records)
}

pub fn validate_catalog_adapter_records(
    records: &[SideraInstitutionAdapterRecord],
) -> Result<(), &'static str> {
    for record in records {
        let title = record.title.trim();
        if is_catalog_title_noise(title) {
            return Err("SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE");
        }
        if !is_whu_catalog_record_detail_url(&record.detail_url) {
            return Err("SIDERA_INSTITUTION_ADAPTER_DRIFT");
        }
    }
    Ok(())
}

pub fn validate_academic_adapter_records(
    records: &[SideraInstitutionAdapterRecord],
) -> Result<(), &'static str> {
    for record in records {
        let Some(title) = bounded_text(&record.title, 500) else {
            return Err("SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE");
        };
        if is_catalog_title_noise(&title)
            || !is_whu_catalog_result_url(&record.detail_url)
            || !matches!(
                record.record_kind,
                SideraInstitutionRecordKind::JournalArticle
                    | SideraInstitutionRecordKind::ConferencePaper
                    | SideraInstitutionRecordKind::Thesis
            )
        {
            return Err("SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE");
        }
        let doi = normalize_doi(record.doi.as_deref());
        let authors = record
            .authors
            .as_deref()
            .and_then(|value| bounded_text(value, 500));
        let venue = record
            .journal
            .as_deref()
            .or(record.conference.as_deref())
            .or(record.degree_institution.as_deref())
            .or(record.publication.as_deref())
            .and_then(|value| bounded_text(value, 500));
        if doi.is_none() && (authors.is_none() || (venue.is_none() && record.year.is_none())) {
            return Err("SIDERA_INSTITUTION_ACADEMIC_IDENTITY_MISSING");
        }
    }
    Ok(())
}

pub fn adapter_page_confirms_query_submission(
    page: &SideraInstitutionAdapterPage,
    before_signature: &str,
    query: &str,
) -> bool {
    if !matches!(
        page.kind.as_str(),
        "bucket-summary" | "records" | "zero-results"
    ) {
        return false;
    }
    let signature_changed = !before_signature.is_empty()
        && !page.page_signature.is_empty()
        && page.page_signature != before_signature;
    let query = query.split_whitespace().collect::<String>().to_lowercase();
    let query_echo_matches = page
        .query_echo
        .as_deref()
        .map(|value| value.split_whitespace().collect::<String>().to_lowercase())
        .is_some_and(|value| !query.is_empty() && value.contains(&query));
    signature_changed || query_echo_matches
}

pub fn safe_institution_url_display(value: &str) -> Option<String> {
    let mut url = Url::parse(value).ok()?;
    if !is_whu_institution_navigation_url(value) {
        return None;
    }
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

pub fn classify_adapter_page(
    page: &SideraInstitutionAdapterPage,
) -> (SideraInstitutionSessionStatus, &'static str) {
    match page.kind.as_str() {
        "login-required" => (
            SideraInstitutionSessionStatus::LoginRequired,
            "SIDERA_INSTITUTION_LOGIN_REQUIRED",
        ),
        "expired" => (
            SideraInstitutionSessionStatus::Expired,
            "SIDERA_INSTITUTION_SESSION_EXPIRED",
        ),
        "authenticated-landing" | "search-form" | "bucket-summary" | "records" | "zero-results" => {
            (
                SideraInstitutionSessionStatus::Ready,
                "SIDERA_INSTITUTION_SESSION_READY",
            )
        }
        "service-error" => (
            SideraInstitutionSessionStatus::Failed,
            "SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR",
        ),
        _ => (
            SideraInstitutionSessionStatus::Failed,
            "SIDERA_INSTITUTION_ADAPTER_DRIFT",
        ),
    }
}

pub fn normalize_adapter_records(
    source_bucket: &str,
    records: Vec<SideraInstitutionAdapterRecord>,
    extracted_at_ms: u128,
) -> NormalizedInstitutionResults {
    normalize_catalog_adapter_records(source_bucket, records, extracted_at_ms)
}

pub fn normalize_catalog_adapter_records(
    source_bucket: &str,
    records: Vec<SideraInstitutionAdapterRecord>,
    extracted_at_ms: u128,
) -> NormalizedInstitutionResults {
    let bucket = bounded_text(source_bucket, 80).unwrap_or_else(|| "未标明来源".to_string());
    let mut items = Vec::new();
    let mut detail_urls = HashMap::new();
    let mut logical_records = BTreeSet::new();
    for record in records {
        let Some(title) = bounded_text(&record.title, 500) else {
            continue;
        };
        if is_catalog_title_noise(&title) || !is_whu_catalog_record_detail_url(&record.detail_url) {
            continue;
        }
        let detail_url = record.detail_url.trim().to_string();
        let canonical_url = canonical_catalog_url(&detail_url);
        let doi = normalize_doi(record.doi.as_deref());
        let catalog_record_id = record
            .catalog_record_id
            .as_deref()
            .and_then(|value| bounded_text(value, 160));
        let isbn_issn = record
            .isbn_issn
            .as_deref()
            .and_then(|value| bounded_text(value, 160));
        let id_seed = catalog_record_id
            .clone()
            .map(|value| format!("catalog:{value}"))
            .or_else(|| canonical_url.clone().map(|value| format!("url:{value}")))
            .or_else(|| isbn_issn.clone().map(|value| format!("isbn-issn:{value}")))
            .unwrap_or_else(|| {
                format!(
                    "title:{}:{}",
                    title.to_lowercase(),
                    record.year.unwrap_or_default()
                )
            });
        if !logical_records.insert(id_seed.clone()) {
            continue;
        }
        if items.len() >= INSTITUTION_BUCKET_ITEM_LIMIT {
            break;
        }
        let id = format!("institution-{}", short_sha256(&id_seed));
        if let Some(url) = canonical_url.clone() {
            detail_urls.insert(id.clone(), url);
        }
        items.push(SideraInstitutionSearchItem {
            id: id.clone(),
            title,
            authors: record
                .authors
                .as_deref()
                .and_then(|value| bounded_text(value, 500)),
            year: record.year.filter(|value| (1000..=2200).contains(value)),
            publication: record
                .publication
                .as_deref()
                .and_then(|value| bounded_text(value, 500)),
            source_bucket: bucket.clone(),
            source_buckets: vec![bucket.clone()],
            document_type: record
                .document_type
                .as_deref()
                .and_then(|value| bounded_text(value, 120)),
            doi,
            abstract_snippet: record
                .abstract_snippet
                .as_deref()
                .and_then(|value| bounded_text(value, 1_000)),
            availability: record
                .availability
                .as_deref()
                .and_then(|value| bounded_text(value, 180)),
            record_kind: match record.record_kind {
                SideraInstitutionRecordKind::Unknown => SideraInstitutionRecordKind::Book,
                value => value,
            },
            journal: None,
            conference: None,
            degree_institution: None,
            volume: None,
            issue: None,
            pages: None,
            source_provider: Some("武汉大学馆藏目录".to_string()),
            full_text_status: SideraInstitutionFullTextStatus::Unavailable,
            full_text_route: SideraInstitutionFullTextRoute::BrowserFallback,
            detail_locator: id,
            full_text_locator: None,
            provenance: SideraInstitutionSearchProvenance {
                institution_id: "whu".to_string(),
                adapter_id: WHU_OPAC_CATALOG_ADAPTER_ID.to_string(),
                source_buckets: vec![bucket.clone()],
                source_host: detail_url_host(&detail_url),
                extracted_at_ms,
            },
            canonical_locator: canonical_url,
            provider_record_id: catalog_record_id.or(isbn_issn),
        });
    }
    NormalizedInstitutionResults {
        items,
        detail_urls,
        full_text_urls: HashMap::new(),
    }
}

pub fn normalize_academic_adapter_records(
    source_bucket: &str,
    records: Vec<SideraInstitutionAdapterRecord>,
    extracted_at_ms: u128,
) -> NormalizedInstitutionResults {
    let bucket = bounded_text(source_bucket, 80).unwrap_or_else(|| "未标明来源".to_string());
    let mut items = Vec::new();
    let mut detail_urls = HashMap::new();
    let mut full_text_urls = HashMap::new();
    let mut logical_records = BTreeSet::new();

    for record in records {
        let Some(title) = bounded_text(&record.title, 500) else {
            continue;
        };
        if is_catalog_title_noise(&title)
            || !matches!(
                record.record_kind,
                SideraInstitutionRecordKind::JournalArticle
                    | SideraInstitutionRecordKind::ConferencePaper
                    | SideraInstitutionRecordKind::Thesis
            )
            || !is_whu_catalog_result_url(&record.detail_url)
        {
            continue;
        }
        let detail_url = record.detail_url.trim().to_string();
        let canonical_url = canonical_navigation_url(&detail_url);
        let doi = normalize_doi(record.doi.as_deref());
        let authors = record
            .authors
            .as_deref()
            .and_then(|value| bounded_text(value, 500));
        let journal = record
            .journal
            .as_deref()
            .and_then(|value| bounded_text(value, 500));
        let conference = record
            .conference
            .as_deref()
            .and_then(|value| bounded_text(value, 500));
        let degree_institution = record
            .degree_institution
            .as_deref()
            .and_then(|value| bounded_text(value, 500));
        let publication = record
            .publication
            .as_deref()
            .and_then(|value| bounded_text(value, 500));
        let venue_present = journal.is_some()
            || conference.is_some()
            || degree_institution.is_some()
            || publication.is_some();
        if doi.is_none() && (authors.is_none() || (!venue_present && record.year.is_none())) {
            continue;
        }
        let provider_record_id = record
            .provider_record_id
            .as_deref()
            .and_then(|value| bounded_text(value, 200));
        let first_author = authors
            .as_deref()
            .and_then(|value| value.split([';', '；', ',', '，']).next())
            .unwrap_or("")
            .trim()
            .to_lowercase();
        let id_seed = doi
            .clone()
            .map(|value| format!("doi:{value}"))
            .or_else(|| {
                provider_record_id
                    .clone()
                    .map(|value| format!("provider:{value}"))
            })
            .or_else(|| canonical_url.clone().map(|value| format!("url:{value}")))
            .unwrap_or_else(|| {
                format!(
                    "paper:{}:{}:{}",
                    title.to_lowercase(),
                    first_author,
                    record.year.unwrap_or_default()
                )
            });
        if !logical_records.insert(id_seed.clone()) {
            continue;
        }
        if items.len() >= INSTITUTION_BUCKET_ITEM_LIMIT {
            break;
        }
        let id = format!("institution-{}", short_sha256(&id_seed));
        if let Some(url) = canonical_url.clone() {
            detail_urls.insert(id.clone(), url);
        }
        let explicit_full_text_url = record
            .full_text_url
            .as_deref()
            .and_then(canonical_navigation_url);
        let full_text_route = classify_full_text_route(
            explicit_full_text_url.as_deref(),
            &detail_url,
            doi.as_deref(),
            provider_record_id.as_deref(),
        );
        let resolved_full_text_url =
            explicit_full_text_url
                .clone()
                .or_else(|| match full_text_route {
                    SideraInstitutionFullTextRoute::Doi => {
                        doi.as_ref().map(|value| format!("https://doi.org/{value}"))
                    }
                    SideraInstitutionFullTextRoute::ProviderRecord
                    | SideraInstitutionFullTextRoute::BrowserFallback => canonical_url.clone(),
                    _ => None,
                });
        let full_text_locator = resolved_full_text_url
            .as_ref()
            .map(|_| format!("{id}:full-text"));
        if let (Some(locator), Some(url)) = (full_text_locator.as_ref(), resolved_full_text_url) {
            full_text_urls.insert(locator.clone(), url);
        }
        items.push(SideraInstitutionSearchItem {
            id: id.clone(),
            title,
            authors,
            year: record.year.filter(|value| (1000..=2200).contains(value)),
            publication,
            source_bucket: bucket.clone(),
            source_buckets: vec![bucket.clone()],
            document_type: record
                .document_type
                .as_deref()
                .and_then(|value| bounded_text(value, 120)),
            doi,
            abstract_snippet: record
                .abstract_snippet
                .as_deref()
                .and_then(|value| bounded_text(value, 1_000)),
            availability: record
                .availability
                .as_deref()
                .and_then(|value| bounded_text(value, 180)),
            record_kind: record.record_kind,
            journal,
            conference,
            degree_institution,
            volume: record
                .volume
                .as_deref()
                .and_then(|value| bounded_text(value, 80)),
            issue: record
                .issue
                .as_deref()
                .and_then(|value| bounded_text(value, 80)),
            pages: record
                .pages
                .as_deref()
                .and_then(|value| bounded_text(value, 80)),
            source_provider: record
                .source_provider
                .as_deref()
                .and_then(|value| bounded_text(value, 180)),
            full_text_status: if explicit_full_text_url.is_some()
                && record.full_text_status == SideraInstitutionFullTextStatus::Unknown
            {
                SideraInstitutionFullTextStatus::LinkOnly
            } else {
                record.full_text_status
            },
            full_text_route,
            detail_locator: id,
            full_text_locator,
            provenance: SideraInstitutionSearchProvenance {
                institution_id: "whu".to_string(),
                adapter_id: WHU_ACADEMIC_DISCOVERY_ADAPTER_ID.to_string(),
                source_buckets: vec![bucket.clone()],
                source_host: detail_url_host(&detail_url),
                extracted_at_ms,
            },
            canonical_locator: canonical_url,
            provider_record_id,
        });
    }

    NormalizedInstitutionResults {
        items,
        detail_urls,
        full_text_urls,
    }
}

pub fn merge_institution_results(
    batches: Vec<NormalizedInstitutionResults>,
) -> NormalizedInstitutionResults {
    let mut merged: Vec<SideraInstitutionSearchItem> = Vec::new();
    let mut details = HashMap::new();
    let mut full_texts = HashMap::new();
    let mut keys: HashMap<String, usize> = HashMap::new();

    for batch in batches {
        details.extend(batch.detail_urls);
        full_texts.extend(batch.full_text_urls);
        for item in batch.items {
            let key = dedupe_key(&item);
            if let Some(index) = keys.get(&key).copied() {
                let current = &mut merged[index];
                let mut sources = current
                    .source_buckets
                    .iter()
                    .cloned()
                    .collect::<BTreeSet<_>>();
                sources.extend(item.source_buckets.iter().cloned());
                current.source_buckets = sources.into_iter().collect();
                current.provenance.source_buckets = current.source_buckets.clone();
                fill_missing(&mut current.authors, item.authors);
                fill_missing(&mut current.publication, item.publication);
                fill_missing(&mut current.document_type, item.document_type);
                fill_missing(&mut current.doi, item.doi);
                fill_missing(&mut current.abstract_snippet, item.abstract_snippet);
                fill_missing(&mut current.availability, item.availability);
                fill_missing(&mut current.journal, item.journal);
                fill_missing(&mut current.conference, item.conference);
                fill_missing(&mut current.degree_institution, item.degree_institution);
                fill_missing(&mut current.volume, item.volume);
                fill_missing(&mut current.issue, item.issue);
                fill_missing(&mut current.pages, item.pages);
                fill_missing(&mut current.source_provider, item.source_provider);
                fill_missing(&mut current.full_text_locator, item.full_text_locator);
                fill_missing(&mut current.provider_record_id, item.provider_record_id);
                if current.full_text_status == SideraInstitutionFullTextStatus::Unknown {
                    current.full_text_status = item.full_text_status;
                }
                if current.year.is_none() {
                    current.year = item.year;
                }
                continue;
            }
            if merged.len() >= INSTITUTION_TOTAL_ITEM_LIMIT {
                continue;
            }
            keys.insert(key, merged.len());
            merged.push(item);
        }
    }

    details.retain(|id, _| merged.iter().any(|item| &item.id == id));
    full_texts.retain(|id, _| {
        merged
            .iter()
            .any(|item| item.full_text_locator.as_deref() == Some(id.as_str()))
    });
    NormalizedInstitutionResults {
        items: merged,
        detail_urls: details,
        full_text_urls: full_texts,
    }
}

fn normalized_host(url: &Url) -> Option<String> {
    url.host_str().map(|value| value.to_ascii_lowercase())
}

fn canonical_catalog_url(value: &str) -> Option<String> {
    let mut url = Url::parse(value).ok()?;
    if !is_whu_catalog_record_detail_url(value) {
        return None;
    }
    url.set_fragment(None);
    let mut pairs = url
        .query_pairs()
        .filter(|(key, _)| !matches!(key.as_ref(), "session" | "ticket" | "token"))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    pairs.sort();
    url.set_query(None);
    if !pairs.is_empty() {
        url.query_pairs_mut().extend_pairs(pairs);
    }
    Some(url.to_string())
}

fn canonical_navigation_url(value: &str) -> Option<String> {
    let mut url = Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    url.set_fragment(None);
    let mut pairs = url
        .query_pairs()
        .filter(|(key, _)| {
            !matches!(
                key.to_ascii_lowercase().as_str(),
                "session" | "ticket" | "token" | "cookie"
            )
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    pairs.sort();
    url.set_query(None);
    if !pairs.is_empty() {
        url.query_pairs_mut().extend_pairs(pairs);
    }
    Some(url.to_string())
}

fn detail_url_host(value: &str) -> Option<String> {
    Url::parse(value).ok().and_then(|url| normalized_host(&url))
}

fn bounded_text(value: &str, max_chars: usize) -> Option<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.chars().take(max_chars).collect())
}

fn normalize_doi(value: Option<&str>) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    let value = value
        .strip_prefix("https://doi.org/")
        .or_else(|| value.strip_prefix("http://doi.org/"))
        .or_else(|| value.strip_prefix("doi:"))
        .unwrap_or(&value)
        .trim();
    if value.starts_with("10.") && value.contains('/') && value.len() <= 256 {
        Some(value.to_string())
    } else {
        None
    }
}

fn classify_full_text_route(
    full_text_url: Option<&str>,
    detail_url: &str,
    doi: Option<&str>,
    provider_record_id: Option<&str>,
) -> SideraInstitutionFullTextRoute {
    if let Some(value) = full_text_url {
        let lower = value.to_ascii_lowercase();
        if lower.starts_with("https://doi.org/") || lower.starts_with("http://doi.org/") {
            return SideraInstitutionFullTextRoute::Doi;
        }
        if lower.contains("openurl")
            || lower.contains("linkresolver")
            || lower.contains("link-resolver")
            || lower.contains("resolver?")
        {
            return SideraInstitutionFullTextRoute::OpenurlLinkResolver;
        }
        if lower.ends_with(".pdf")
            || lower.contains("/pdf/")
            || lower.contains("/fulltext/")
            || lower.contains("/full-text/")
            || lower.ends_with("/fulltext")
            || lower.ends_with("/full-text")
        {
            return SideraInstitutionFullTextRoute::DirectHtmlPdf;
        }
        let full_host = detail_url_host(value);
        let detail_host = detail_url_host(detail_url);
        if full_host.is_some() && full_host != detail_host {
            return SideraInstitutionFullTextRoute::PublisherPage;
        }
        return SideraInstitutionFullTextRoute::ProviderRecord;
    }
    if doi.is_some() {
        return SideraInstitutionFullTextRoute::Doi;
    }
    if provider_record_id.is_some() {
        return SideraInstitutionFullTextRoute::ProviderRecord;
    }
    SideraInstitutionFullTextRoute::BrowserFallback
}

fn short_sha256(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn dedupe_key(item: &SideraInstitutionSearchItem) -> String {
    if let Some(doi) = &item.doi {
        return format!("doi:{doi}");
    }
    if let Some(provider_record_id) = &item.provider_record_id {
        return format!("provider:{provider_record_id}");
    }
    if let Some(locator) = &item.canonical_locator {
        return format!("url:{locator}");
    }
    let first_author = item
        .authors
        .as_deref()
        .and_then(|value| value.split([';', '；', ',', '，']).next())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    format!(
        "title:{}:{}:{}",
        item.title
            .split_whitespace()
            .collect::<String>()
            .to_lowercase(),
        first_author,
        item.year.unwrap_or_default()
    )
}

fn fill_missing<T>(target: &mut Option<T>, candidate: Option<T>) {
    if target.is_none() {
        *target = candidate;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn institution_restore_lifecycle_rejects_epoch_and_generation_drift() {
        assert!(institution_restore_is_current(true, 4, 4, 9, Some(9)));
        assert!(!institution_restore_is_current(false, 4, 4, 9, Some(9)));
        assert!(!institution_restore_is_current(true, 5, 4, 9, Some(9)));
        assert!(!institution_restore_is_current(true, 4, 4, 10, Some(9)));
        assert!(institution_restore_is_current(true, 4, 4, 10, None));
    }

    #[test]
    fn institution_restore_truth_keeps_terminal_outcomes_distinct() {
        assert_eq!(
            classify_institution_restore_status(&[
                SideraInstitutionAuthStatus::Ready,
                SideraInstitutionAuthStatus::Ready,
                SideraInstitutionAuthStatus::Ready,
            ]),
            SideraInstitutionSessionStatus::Ready
        );
        assert_eq!(
            classify_institution_restore_status(&[
                SideraInstitutionAuthStatus::Ready,
                SideraInstitutionAuthStatus::Failed,
                SideraInstitutionAuthStatus::LoginRequired,
            ]),
            SideraInstitutionSessionStatus::Partial
        );
        assert_eq!(
            classify_institution_restore_status(&[
                SideraInstitutionAuthStatus::LoginRequired,
                SideraInstitutionAuthStatus::Failed,
                SideraInstitutionAuthStatus::Failed,
            ]),
            SideraInstitutionSessionStatus::LoginRequired
        );
        assert_eq!(
            classify_institution_restore_status(&[
                SideraInstitutionAuthStatus::Failed,
                SideraInstitutionAuthStatus::Failed,
                SideraInstitutionAuthStatus::Failed,
            ]),
            SideraInstitutionSessionStatus::Failed
        );
    }

    fn record(
        title: &str,
        year: i32,
        doi: Option<&str>,
        detail_url: &str,
    ) -> SideraInstitutionAdapterRecord {
        SideraInstitutionAdapterRecord {
            title: title.to_string(),
            authors: Some("张三 ; Alice".to_string()),
            year: Some(year),
            publication: Some("测试出版物".to_string()),
            document_type: Some("图书".to_string()),
            doi: doi.map(str::to_string),
            abstract_snippet: Some("摘要片段".to_string()),
            availability: Some("馆藏可用".to_string()),
            detail_url: detail_url.to_string(),
            ..Default::default()
        }
    }

    fn academic_record(
        title: &str,
        kind: SideraInstitutionRecordKind,
        detail_url: &str,
    ) -> SideraInstitutionAdapterRecord {
        SideraInstitutionAdapterRecord {
            title: title.to_string(),
            authors: Some("Alice Zhang; Bob Li".to_string()),
            year: Some(2025),
            publication: Some("Journal of Verifiable Research".to_string()),
            document_type: Some("论文".to_string()),
            detail_url: detail_url.to_string(),
            record_kind: kind,
            journal: (kind == SideraInstitutionRecordKind::JournalArticle)
                .then(|| "Journal of Verifiable Research".to_string()),
            conference: (kind == SideraInstitutionRecordKind::ConferencePaper)
                .then(|| "Sidera Conference".to_string()),
            degree_institution: (kind == SideraInstitutionRecordKind::Thesis)
                .then(|| "武汉大学".to_string()),
            source_provider: Some("测试学术数据库".to_string()),
            provider_record_id: Some(format!("provider-{title}")),
            ..Default::default()
        }
    }

    #[test]
    fn query_validation_rejects_empty_long_and_control_values() {
        assert_eq!(
            validate_institution_query("  machine   learning ").unwrap(),
            "machine learning"
        );
        assert_eq!(
            validate_institution_query("  "),
            Err("SIDERA_INSTITUTION_QUERY_EMPTY")
        );
        assert_eq!(
            validate_institution_query(&"甲".repeat(201)),
            Err("SIDERA_INSTITUTION_QUERY_TOO_LONG")
        );
        assert_eq!(
            validate_institution_query("a\u{0007}b"),
            Err("SIDERA_INSTITUTION_QUERY_INVALID")
        );
    }

    #[test]
    fn strict_entry_and_open_session_navigation_policies_are_separate() {
        assert!(is_whu_institution_navigation_url(WHU_CATALOG_ENTRY_URL));
        assert!(is_whu_database_sso_entry_url(
            "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex"
        ));
        assert!(!is_whu_database_sso_entry_url(
            "https://www.metaauth.com/242010/login.html?service=x"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://www.metaauth.com/242010/login.html?service=x&ticket=opaque#state"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://www.metaauth.com/other-tenant/login.html?ticket=opaque"
        ));
        assert!(is_whu_institution_navigation_url(
            "http://opac.lib.whu.edu.cn/F/"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://user:pass@opac.lib.whu.edu.cn/F/"
        ));
        assert!(is_whu_institution_navigation_url("https://example.com/F/"));
        assert!(is_whu_institution_navigation_url(
            "https://opac.lib.whu.edu.cn:444/F/"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://cas.whu.edu.cn/authserver/login?type=dynamicLogin"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://cas.whu.edu.cn/not-authserver/login"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://other.whu.edu.cn/authserver/login"
        ));
        assert!(!is_whu_institution_navigation_url("ftp://example.com/file"));
        assert!(!is_whu_institution_navigation_url("javascript:alert(1)"));
    }

    #[test]
    fn metaersp_personal_index_is_an_authenticated_handoff_not_a_catalog_page() {
        assert!(is_whu_database_authenticated_landing_url(
            "https://whu.metaersp.com/personalIndex?ticket=opaque#state"
        ));
        assert!(is_whu_database_authenticated_landing_url(
            "http://whu.metaersp.cn/personalIndex/"
        ));
        assert!(!is_whu_database_authenticated_landing_url(
            "https://whu.metaersp.com/databaseList"
        ));
        assert!(!is_whu_database_authenticated_landing_url(
            "https://vendor.example/personalIndex"
        ));
    }

    #[test]
    fn all_network_auth_popups_are_allowed() {
        assert_eq!(
            classify_whu_popup_navigation(
                "https://www.lib.whu.edu.cn/engine2/general-rest/outer-proxy-detail-url"
            ),
            SideraInstitutionPopupDisposition::AuthModal
        );
        assert_eq!(
            classify_whu_popup_navigation(
                "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex"
            ),
            SideraInstitutionPopupDisposition::AuthModal
        );
        assert_eq!(
            classify_whu_popup_navigation(
                "https://cas.whu.edu.cn/authserver/login?type=dynamicLogin"
            ),
            SideraInstitutionPopupDisposition::AuthModal
        );
        for allowed in [
            "https://example.com/login",
            "http://www.lib.whu.edu.cn/engine2/general-rest/outer-proxy-detail-url",
            "https://user:pass@www.lib.whu.edu.cn/engine2/general-rest/outer-proxy-detail-url",
            "https://www.metaauth.com/other-tenant/login.html?service=x",
        ] {
            assert_eq!(
                classify_whu_popup_navigation(allowed),
                SideraInstitutionPopupDisposition::AuthModal
            );
        }
        assert_eq!(
            classify_whu_popup_navigation("ftp://example.com/login"),
            SideraInstitutionPopupDisposition::Reject
        );
    }

    #[test]
    fn safe_navigation_parts_drop_query_fragment_and_credentials() {
        assert_eq!(
            safe_institution_navigation_parts(
                "https://www.metaauth.com/242010/login.html?ticket=secret#opaque"
            ),
            Some((
                "www.metaauth.com".to_string(),
                "/242010/login.html".to_string()
            ))
        );
        assert_eq!(
            safe_institution_navigation_parts("https://user:pass@www.metaauth.com/242010/"),
            Some(("www.metaauth.com".to_string(), "/242010/".to_string()))
        );
    }

    #[test]
    fn session_navigation_allows_every_http_and_https_target() {
        assert!(is_whu_institution_navigation_url(
            "http://whu.metaersp.com/personalIndex?ticket=opaque"
        ));
        assert!(is_whu_institution_navigation_url(
            "https://unknown.example:8443/callback?ticket=opaque#state"
        ));
        assert_eq!(
            safe_institution_navigation_parts(
                "http://whu.metaersp.com/personalIndex?ticket=secret#hidden"
            ),
            Some(("whu.metaersp.com".to_string(), "/personalIndex".to_string()))
        );
        assert_eq!(
            decide_whu_institution_navigation("http://example.com/personalIndex"),
            SideraInstitutionNavigationDecision::Allow
        );
        assert_eq!(
            decide_whu_institution_navigation("ftp://whu.metaersp.com/personalIndex"),
            SideraInstitutionNavigationDecision::Reject("POLICY_NON_NETWORK_SCHEME")
        );
    }

    #[test]
    fn navigation_trace_bound_and_terminal_wait_gate_are_deterministic() {
        let mut trace = Vec::new();
        for navigation_id in 1..=40_u64 {
            push_bounded_navigation_event(
                &mut trace,
                SideraInstitutionNavigationEvent {
                    navigation_id: Some(navigation_id),
                    generation: 3,
                    epoch: 8,
                    auth_kind: SideraInstitutionAuthKind::DatabaseSso,
                    phase: SideraInstitutionNavigationPhase::Redirect,
                    host: "www.metaauth.com".to_string(),
                    path: "/242010/login.html".to_string(),
                    redirected: true,
                    web_error_status: None,
                    timestamp_ms: navigation_id as u128,
                },
            );
        }
        assert_eq!(trace.len(), INSTITUTION_NAVIGATION_TRACE_LIMIT);
        assert_eq!(trace.first().and_then(|event| event.navigation_id), Some(9));
        assert!(initial_navigation_wait_is_current(3, 3, Some(8), 8));
        assert!(!initial_navigation_wait_is_current(3, 3, None, 8));
        assert!(!initial_navigation_wait_is_current(4, 3, Some(8), 8));
    }

    #[test]
    fn database_and_library_auth_states_are_independent() {
        let mut state = SideraInstitutionSessionState::default();
        state.database_auth.status = SideraInstitutionAuthStatus::Ready;
        state.database_auth.code = "SIDERA_INSTITUTION_SESSION_READY".to_string();
        state.library_account_auth.status = SideraInstitutionAuthStatus::Cancelled;
        state.library_account_auth.code = "SIDERA_INSTITUTION_AUTH_CANCELLED".to_string();

        assert_eq!(
            state.database_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
        assert_eq!(
            state.library_account_auth.status,
            SideraInstitutionAuthStatus::Cancelled
        );
        assert!(!state.auth_modal_visible);
    }

    #[test]
    fn normalizes_missing_fields_and_deduplicates_by_doi() {
        let chinese = normalize_adapter_records(
            "中文文献库",
            vec![record(
                "机器学习",
                2024,
                Some("https://doi.org/10.1000/ABC"),
                "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=1&session=secret",
            )],
            10,
        );
        let western = normalize_adapter_records(
            "西文文献库",
            vec![record(
                "Machine Learning",
                2024,
                Some("10.1000/abc"),
                "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=2",
            )],
            11,
        );
        let merged = merge_institution_results(vec![chinese, western]);
        assert_eq!(merged.items.len(), 1);
        assert_eq!(
            merged.items[0].source_buckets,
            vec!["中文文献库", "西文文献库"]
        );
        assert!(!merged
            .detail_urls
            .values()
            .any(|url| url.contains("session=")));
    }

    #[test]
    fn only_real_catalog_record_targets_are_normalized() {
        let result = normalize_adapter_records(
            "中文文献库",
            vec![
                record(
                    "真实馆藏记录",
                    2020,
                    None,
                    "https://opac.lib.whu.edu.cn/F/?func=full-set-set&set_number=1&set_entry=000001&session=secret",
                ),
                record("非网络记录", 2021, None, "javascript:alert(1)"),
                record(
                    "简单检索",
                    2022,
                    None,
                    "https://opac.lib.whu.edu.cn/F/?func=find-b",
                ),
            ],
            1,
        );
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.detail_urls.len(), 1);
        assert!(result
            .detail_urls
            .values()
            .any(|url| url.contains("func=full-set-set")));
        assert!(!result
            .detail_urls
            .values()
            .any(|url| url.contains("session")));
    }

    #[test]
    fn result_quality_gate_rejects_navigation_links_and_missing_record_identity() {
        assert!(!is_whu_catalog_record_detail_url(
            "https://opac.lib.whu.edu.cn/F/?func=find-b"
        ));
        assert!(is_whu_catalog_record_detail_url(
            "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=123"
        ));
        assert!(is_whu_catalog_record_detail_url(
            "https://opac.lib.whu.edu.cn/F/?func=full-set-set&set_number=42&set_entry=000003"
        ));
        assert_eq!(
            validate_adapter_records(&[record(
                "简单检索",
                2024,
                None,
                "https://opac.lib.whu.edu.cn/F/?func=find-b",
            )]),
            Err("SIDERA_INSTITUTION_RESULT_FALSE_POSITIVE")
        );
        assert_eq!(
            validate_adapter_records(&[record(
                "机器学习",
                2024,
                None,
                "https://opac.lib.whu.edu.cn/F/?func=full-set-set&set_number=42",
            )]),
            Err("SIDERA_INSTITUTION_ADAPTER_DRIFT")
        );
    }

    #[test]
    fn catalog_v3_rejects_script_titles_and_caps_unique_logical_records() {
        for noise in [
            "1",
            "doclist[\"WHU09000989132\"]=1;",
            "fmt_issn('9787302709008 pbk')",
            "dispfmt('BK') document.write('评级')",
        ] {
            assert!(is_catalog_title_noise(noise));
        }

        let mut rows = vec![
            SideraInstitutionAdapterRecord {
                title: "1".to_string(),
                detail_url: "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=WHU1"
                    .to_string(),
                catalog_record_id: Some("doc:WHU1".to_string()),
                ..Default::default()
            },
            SideraInstitutionAdapterRecord {
                title: "doclist[\"WHU1\"]=1;".to_string(),
                detail_url: "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=WHU1"
                    .to_string(),
                catalog_record_id: Some("doc:WHU1".to_string()),
                ..Default::default()
            },
            SideraInstitutionAdapterRecord {
                title: "人工智能专业英语教程".to_string(),
                year: Some(2026),
                detail_url: "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=WHU1"
                    .to_string(),
                catalog_record_id: Some("doc:WHU1".to_string()),
                ..Default::default()
            },
        ];
        rows.extend((2..=30).map(|index| SideraInstitutionAdapterRecord {
            title: format!("馆藏书目 {index}"),
            detail_url: format!("https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=WHU{index}"),
            catalog_record_id: Some(format!("doc:WHU{index}")),
            ..Default::default()
        }));
        let normalized = normalize_catalog_adapter_records("馆藏目录", rows, 10);
        assert_eq!(normalized.items.len(), INSTITUTION_BUCKET_ITEM_LIMIT);
        assert_eq!(
            normalized
                .items
                .iter()
                .filter(|item| item.title == "人工智能专业英语教程")
                .count(),
            1
        );
        assert!(normalized
            .items
            .iter()
            .all(|item| !is_catalog_title_noise(&item.title)));
    }

    #[test]
    fn academic_discovery_keeps_only_papers_and_opaque_full_text_locators() {
        let mut journal = academic_record(
            "Evidence-aware agents",
            SideraInstitutionRecordKind::JournalArticle,
            "https://discovery.example/record/1?ticket=secret",
        );
        journal.doi = Some("10.1000/agents".to_string());
        journal.full_text_url = Some("https://vendor.example/full/1?ticket=secret".to_string());
        let conference = academic_record(
            "Machine learning systems",
            SideraInstitutionRecordKind::ConferencePaper,
            "https://discovery.example/record/2",
        );
        let thesis = academic_record(
            "人工智能可信性研究",
            SideraInstitutionRecordKind::Thesis,
            "https://discovery.example/record/3",
        );
        let book = academic_record(
            "Machine learning textbook",
            SideraInstitutionRecordKind::Book,
            "https://discovery.example/record/4",
        );
        let unknown = academic_record(
            "Unknown resource with paper-like metadata",
            SideraInstitutionRecordKind::Unknown,
            "https://discovery.example/record/5",
        );
        let normalized = normalize_academic_adapter_records(
            "测试学术数据库",
            vec![journal, conference, thesis, book, unknown],
            20,
        );
        assert_eq!(normalized.items.len(), 3);
        assert!(normalized.items.iter().all(|item| matches!(
            item.record_kind,
            SideraInstitutionRecordKind::JournalArticle
                | SideraInstitutionRecordKind::ConferencePaper
                | SideraInstitutionRecordKind::Thesis
        )));
        let journal = normalized
            .items
            .iter()
            .find(|item| item.record_kind == SideraInstitutionRecordKind::JournalArticle)
            .unwrap();
        assert_eq!(
            journal.full_text_status,
            SideraInstitutionFullTextStatus::LinkOnly
        );
        assert!(journal.full_text_locator.is_some());
        assert!(normalized
            .full_text_urls
            .values()
            .all(|url| !url.contains("ticket=")));
    }

    #[test]
    fn classifies_all_read_only_full_text_routes_without_fetching_content() {
        let cases = [
            (
                Some("https://content.example/paper/1.pdf"),
                None,
                None,
                SideraInstitutionFullTextRoute::DirectHtmlPdf,
            ),
            (
                None,
                Some("10.1000/route"),
                None,
                SideraInstitutionFullTextRoute::Doi,
            ),
            (
                Some("https://resolver.example/openurl?sid=sidera"),
                None,
                None,
                SideraInstitutionFullTextRoute::OpenurlLinkResolver,
            ),
            (
                Some("https://discovery.example/record/1/fulltext"),
                None,
                Some("provider-1"),
                SideraInstitutionFullTextRoute::DirectHtmlPdf,
            ),
            (
                Some("https://publisher.example/article/1"),
                None,
                None,
                SideraInstitutionFullTextRoute::PublisherPage,
            ),
            (
                None,
                None,
                None,
                SideraInstitutionFullTextRoute::BrowserFallback,
            ),
        ];
        for (index, (full_text_url, doi, provider_record_id, expected)) in
            cases.into_iter().enumerate()
        {
            let mut record = academic_record(
                &format!("Read-only route {index}"),
                SideraInstitutionRecordKind::JournalArticle,
                &format!("https://discovery.example/record/{index}"),
            );
            record.full_text_url = full_text_url.map(str::to_string);
            record.doi = doi.map(str::to_string);
            record.provider_record_id = provider_record_id.map(str::to_string);
            let normalized = normalize_academic_adapter_records("来源", vec![record], 1);
            assert_eq!(normalized.items[0].full_text_route, expected);
            assert!(normalized.items[0].full_text_locator.is_some());
        }

        assert_eq!(
            classify_full_text_route(
                Some("https://discovery.example/record/1"),
                "https://discovery.example/record/1",
                None,
                Some("provider-1"),
            ),
            SideraInstitutionFullTextRoute::ProviderRecord
        );
    }

    #[test]
    fn academic_identity_gate_requires_doi_or_author_and_venue_or_year() {
        let valid = academic_record(
            "Verifiable research",
            SideraInstitutionRecordKind::JournalArticle,
            "https://discovery.example/record/valid",
        );
        assert!(validate_academic_adapter_records(&[valid]).is_ok());

        let invalid = SideraInstitutionAdapterRecord {
            title: "Unidentified research".to_string(),
            record_kind: SideraInstitutionRecordKind::JournalArticle,
            detail_url: "https://discovery.example/record/invalid".to_string(),
            ..Default::default()
        };
        assert_eq!(
            validate_academic_adapter_records(&[invalid]),
            Err("SIDERA_INSTITUTION_ACADEMIC_IDENTITY_MISSING")
        );
    }

    #[test]
    fn source_defaults_do_not_conflate_auth_catalog_and_academic_readiness() {
        let state = SideraInstitutionSessionState::default();
        assert_eq!(state.source_readiness.len(), 2);
        assert!(state.source_readiness.iter().all(|source| {
            source.status == SideraInstitutionSourceReadinessStatus::Uninitialized
        }));
        let snapshot = SideraInstitutionSearchSnapshot::default();
        assert_eq!(
            snapshot.source,
            SideraInstitutionSearchSource::AcademicDiscovery
        );
        assert_eq!(snapshot.adapter_id, WHU_ACADEMIC_DISCOVERY_ADAPTER_ID);
        assert_eq!(snapshot.stage, SideraInstitutionSearchStage::Idle);
    }

    #[test]
    fn query_submission_requires_a_new_result_page_or_matching_echo() {
        let unchanged = SideraInstitutionAdapterPage {
            kind: "records".to_string(),
            page_signature: "same".to_string(),
            records: vec![record(
                "机器学习",
                2024,
                None,
                "https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=1",
            )],
            ..Default::default()
        };
        assert!(!adapter_page_confirms_query_submission(
            &unchanged,
            "same",
            "机器学习"
        ));

        let changed = SideraInstitutionAdapterPage {
            page_signature: "after".to_string(),
            ..unchanged.clone()
        };
        assert!(adapter_page_confirms_query_submission(
            &changed,
            "before",
            "机器学习"
        ));

        let echoed = SideraInstitutionAdapterPage {
            query_echo: Some("关键词 = machine learning".to_string()),
            ..unchanged
        };
        assert!(adapter_page_confirms_query_submission(
            &echoed,
            "same",
            "machine learning"
        ));
    }

    #[test]
    fn payload_limit_and_page_classification_are_explicit() {
        assert!(validate_institution_extraction_payload(
            &"x".repeat(INSTITUTION_EXTRACTION_MAX_BYTES)
        )
        .is_ok());
        assert_eq!(
            validate_institution_extraction_payload(
                &"x".repeat(INSTITUTION_EXTRACTION_MAX_BYTES + 1)
            ),
            Err("SIDERA_INSTITUTION_EXTRACTION_TOO_LARGE")
        );
        let login = SideraInstitutionAdapterPage {
            kind: "login-required".to_string(),
            ..Default::default()
        };
        let expired = SideraInstitutionAdapterPage {
            kind: "expired".to_string(),
            ..Default::default()
        };
        let service = SideraInstitutionAdapterPage {
            kind: "service-error".to_string(),
            ..Default::default()
        };
        let ready = SideraInstitutionAdapterPage {
            kind: "records".to_string(),
            ..Default::default()
        };
        let authenticated_landing = SideraInstitutionAdapterPage {
            kind: "authenticated-landing".to_string(),
            ..Default::default()
        };
        let zero = SideraInstitutionAdapterPage {
            kind: "zero-results".to_string(),
            explicit_zero_results: true,
            ..Default::default()
        };
        let drift = SideraInstitutionAdapterPage {
            kind: "unknown".to_string(),
            ..Default::default()
        };
        assert_eq!(
            classify_adapter_page(&login).0,
            SideraInstitutionSessionStatus::LoginRequired
        );
        assert_eq!(
            classify_adapter_page(&expired).0,
            SideraInstitutionSessionStatus::Expired
        );
        assert_eq!(
            classify_adapter_page(&service).1,
            "SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR"
        );
        assert_eq!(
            classify_adapter_page(&ready).0,
            SideraInstitutionSessionStatus::Ready
        );
        assert_eq!(
            classify_adapter_page(&authenticated_landing).0,
            SideraInstitutionSessionStatus::Ready
        );
        assert_eq!(
            classify_adapter_page(&zero).0,
            SideraInstitutionSessionStatus::Ready
        );
        assert_eq!(
            classify_adapter_page(&drift).1,
            "SIDERA_INSTITUTION_ADAPTER_DRIFT"
        );
    }

    #[test]
    fn html_fixture_payload_supports_chinese_english_and_missing_fields() {
        let search_form_fixture = r#"
          <nav><a href="/F/?func=find-b">简单检索</a><a href="/F/?func=find-m">多库检索</a></nav>
          <form action="/F/"><input type="hidden" name="func" value="find-b"><input name="request" type="text"><button type="submit">检索</button></form>
        "#;
        let bucket_fixture = r#"
          <table><tr><th>数据库</th><th>记录数</th></tr><tr><td><a href="/F/?func=full-set-set&amp;set_number=1&amp;set_entry=1">西文文献库</a></td><td>71</td></tr><tr><td><a href="/F/?func=full-set-set&amp;set_number=2&amp;set_entry=1">中文文献库</a></td><td>1000</td></tr></table>
        "#;
        let result_fixture = r#"
          <section data-source-bucket="中文文献库">
            <article class="result-record"><a class="title" href="/F/?func=direct&amp;doc_number=1">人工智能导论</a><span class="author">王五</span><time>2023</time></article>
          </section>
          <section data-source-bucket="Western Literature">
            <article class="result-record"><a class="title" href="/F/?func=direct&amp;doc_number=2">Machine Learning</a></article>
          </section>
        "#;
        let zero_fixture = "<main>没有符合检索条件的记录</main>";
        let login_fixture = "<form><input name=\"username\"><input type=\"password\"></form>";
        let service_fixture = "<main>服务异常，请稍后再试</main>";
        let callback_fixture = r#"{
          "kind":"records",
          "title":"多库检索结果",
          "url":"https://opac.lib.whu.edu.cn/F/?func=find-b",
          "message":"",
          "pageSignature":"result-1",
          "queryEcho":"关键词=人工智能",
          "explicitZeroResults":false,
          "buckets":[],
          "records":[
            {"title":"人工智能导论","authors":"王五","year":2023,"detailUrl":"https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=1"},
            {"title":"Machine Learning","authors":null,"year":null,"detailUrl":"https://opac.lib.whu.edu.cn/F/?func=direct&doc_number=2"}
          ]
        }"#;
        let page: SideraInstitutionAdapterPage = serde_json::from_str(callback_fixture).unwrap();
        validate_adapter_records(&page.records).unwrap();
        let normalized = normalize_adapter_records("馆藏目录", page.records, 42);

        assert!(search_form_fixture.contains("func=find-b"));
        assert!(search_form_fixture.contains("name=\"request\""));
        assert!(bucket_fixture.contains("西文文献库"));
        assert!(bucket_fixture.contains("1000"));
        assert!(result_fixture.contains("人工智能导论"));
        assert!(result_fixture.contains("Machine Learning"));
        assert!(result_fixture.contains("result-record"));
        assert!(zero_fixture.contains("没有符合"));
        assert!(login_fixture.contains("password"));
        assert!(service_fixture.contains("服务异常"));
        assert!(!result_fixture.contains("password"));
        assert_eq!(normalized.items.len(), 2);
        assert_eq!(normalized.items[0].title, "人工智能导论");
        assert_eq!(normalized.items[1].title, "Machine Learning");
        assert_eq!(normalized.items[1].authors, None);
        assert_eq!(normalized.items[1].year, None);
    }

    #[test]
    fn discovery_auth_is_independent_and_resume_token_rejects_stale_callbacks() {
        let mut session = SideraInstitutionSessionState::default();
        session.database_auth.status = SideraInstitutionAuthStatus::Ready;
        session.academic_discovery_auth.status = SideraInstitutionAuthStatus::LoginRequired;
        session.library_account_auth.status = SideraInstitutionAuthStatus::Idle;

        assert_eq!(
            session.database_auth.status,
            SideraInstitutionAuthStatus::Ready
        );
        assert_eq!(
            session.academic_discovery_auth.status,
            SideraInstitutionAuthStatus::LoginRequired
        );
        assert!(discovery_auth_resume_is_current(
            Some("task-7"),
            11,
            3,
            "task-7",
            11,
            3
        ));
        assert!(!discovery_auth_resume_is_current(
            Some("task-8"),
            11,
            3,
            "task-7",
            11,
            3
        ));
        assert!(!discovery_auth_resume_is_current(
            Some("task-7"),
            12,
            3,
            "task-7",
            11,
            3
        ));
        assert!(!discovery_auth_resume_is_current(
            Some("task-7"),
            11,
            4,
            "task-7",
            11,
            3
        ));
    }

    #[test]
    fn discovery_auth_wait_pauses_the_ordinary_search_timeout() {
        assert!(!discovery_auth_search_timeout_should_advance(true));
        assert!(discovery_auth_search_timeout_should_advance(false));
    }
}
