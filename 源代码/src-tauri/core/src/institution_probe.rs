use serde::{Deserialize, Serialize};
use url::Url;

pub const WHU_LIBRARY_HOME_URL: &str = "https://www.lib.whu.edu.cn/";
pub const WHU_DATABASE_DIRECTORY_URL: &str = "https://whu.metaersp.cn/databaseList";
pub const WHU_OFFICIAL_NAVIGATION_SCRIPT_PATH: &str = "/whuWebsite.js";
pub const WHU_ATRUST_PROCESS_NAME: &str = "aTrustTray.exe";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SideraInstitutionId {
    Whu,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionProbeStatus {
    Ready,
    Partial,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionEndpointStatus {
    NativeDirect,
    BrowserRequired,
    Unresolved,
    Failed,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionClientStatus {
    InstalledRunning,
    InstalledStopped,
    RunningPathUnknown,
    NotFound,
    DetectionFailed,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionCapabilityStatus {
    Available,
    BrowserRequired,
    Unresolved,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionNavigationKind {
    Direct,
    OfficialSso,
    OfficialExternal,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionNavigationSource {
    FixedConfig,
    OfficialResponse,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionClientProbe {
    pub status: SideraInstitutionClientStatus,
    pub installed: bool,
    pub running: bool,
    pub executable_path: Option<String>,
    pub code: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionEndpointCheck {
    pub id: String,
    pub label: String,
    pub url: String,
    pub status: SideraInstitutionEndpointStatus,
    pub http_status: Option<u16>,
    pub latency_ms: Option<u128>,
    pub code: String,
    pub detail: String,
    pub detected_entry: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionCapabilityReport {
    pub unified_discovery: SideraInstitutionCapabilityStatus,
    pub metadata_export: SideraInstitutionCapabilityStatus,
    pub online_navigation: SideraInstitutionCapabilityStatus,
    pub full_text_resolution: SideraInstitutionCapabilityStatus,
    pub dedicated_adapters: SideraInstitutionCapabilityStatus,
    pub catalog_entry_count: Option<usize>,
    pub route_recommendation: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionCatalogEntry {
    pub name: String,
    pub category: Option<String>,
    pub entry_url: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionCatalogSummary {
    pub structured: bool,
    pub entry_count: Option<usize>,
    pub categories: Vec<String>,
    pub sample_entries: Vec<SideraInstitutionCatalogEntry>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionNavigationTarget {
    pub id: String,
    pub kind: SideraInstitutionNavigationKind,
    pub open_url: String,
    pub display_url: String,
    pub source: SideraInstitutionNavigationSource,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionProbeResult {
    pub institution_id: SideraInstitutionId,
    pub institution_name: String,
    pub access_method: String,
    pub status: SideraInstitutionProbeStatus,
    pub client: SideraInstitutionClientProbe,
    pub endpoints: Vec<SideraInstitutionEndpointCheck>,
    pub capabilities: SideraInstitutionCapabilityReport,
    pub catalog: SideraInstitutionCatalogSummary,
    pub navigation_targets: Vec<SideraInstitutionNavigationTarget>,
    pub checked_at_ms: u128,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EndpointObservation<'a> {
    pub status: Option<u16>,
    pub content_type: &'a str,
    pub body: &'a str,
    pub truncated: bool,
    pub latency_ms: u128,
    pub error_code: Option<&'a str>,
}

pub fn is_atrust_running(process_names: &[String]) -> bool {
    process_names
        .iter()
        .any(|name| name.eq_ignore_ascii_case(WHU_ATRUST_PROCESS_NAME))
}

pub fn classify_atrust_client(
    installed_path: Result<Option<String>, &str>,
    process_names: Result<&[String], &str>,
) -> SideraInstitutionClientProbe {
    let running = process_names
        .as_ref()
        .map(|names| is_atrust_running(names))
        .unwrap_or(false);
    let installed = installed_path
        .as_ref()
        .ok()
        .and_then(|path| path.as_ref())
        .is_some();
    let executable_path = installed_path.as_ref().ok().and_then(|path| path.clone());

    if installed_path.is_err() {
        return SideraInstitutionClientProbe {
            status: SideraInstitutionClientStatus::DetectionFailed,
            installed: false,
            running,
            executable_path: None,
            code: "SIDERA_INSTITUTION_ATRUST_PATH_UNREADABLE".to_string(),
            detail: "aTrust 安装路径不可读；未读取账号、窗口或客户端配置。".to_string(),
        };
    }
    if process_names.is_err() {
        return SideraInstitutionClientProbe {
            status: SideraInstitutionClientStatus::DetectionFailed,
            installed,
            running: false,
            executable_path,
            code: "SIDERA_INSTITUTION_PROCESS_DETECTION_FAILED".to_string(),
            detail: "无法读取 Windows 进程快照；未检查账号、窗口或客户端配置。".to_string(),
        };
    }

    let (status, code, detail) = match (installed, running) {
        (true, true) => (
            SideraInstitutionClientStatus::InstalledRunning,
            "SIDERA_INSTITUTION_ATRUST_RUNNING",
            "已检测到 aTrust 安装和运行；无 Cookie 探针不判断数据库登录状态。",
        ),
        (true, false) => (
            SideraInstitutionClientStatus::InstalledStopped,
            "SIDERA_INSTITUTION_ATRUST_STOPPED",
            "已检测到 aTrust 安装，但客户端当前未运行。",
        ),
        (false, true) => (
            SideraInstitutionClientStatus::RunningPathUnknown,
            "SIDERA_INSTITUTION_ATRUST_RUNNING_PATH_UNKNOWN",
            "aTrust 正在运行，但安装路径不在已登记的 Program Files 位置。",
        ),
        (false, false) => (
            SideraInstitutionClientStatus::NotFound,
            "SIDERA_INSTITUTION_ATRUST_NOT_FOUND",
            "未检测到 aTrust 安装或运行；请先在 aTrust 中完成登录。",
        ),
    };
    SideraInstitutionClientProbe {
        status,
        installed,
        running,
        executable_path,
        code: code.to_string(),
        detail: detail.to_string(),
    }
}

pub fn validate_whu_probe_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https" || url.username() != "" || url.password().is_some() {
        return false;
    }
    matches!(
        url.host_str()
            .map(|host| host.to_ascii_lowercase())
            .as_deref(),
        Some("www.lib.whu.edu.cn") | Some("lib.whu.edu.cn") | Some("whu.metaersp.cn")
    )
}

pub fn validate_whu_official_script_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https"
        || url.username() != ""
        || url.password().is_some()
        || url.fragment().is_some()
        || url.path() != WHU_OFFICIAL_NAVIGATION_SCRIPT_PATH
        || !matches!(
            url.host_str()
                .map(|host| host.to_ascii_lowercase())
                .as_deref(),
            Some("www.lib.whu.edu.cn") | Some("lib.whu.edu.cn")
        )
    {
        return false;
    }

    let query = url.query_pairs().collect::<Vec<_>>();
    if query.is_empty() {
        return true;
    }
    if query.len() != 1 || query[0].0 != "v" {
        return false;
    }
    let version = query[0].1.as_ref();
    !version.is_empty()
        && version.len() <= 32
        && version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
}

pub fn validate_whu_official_script_content_type(value: &str) -> bool {
    matches!(
        value
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "application/javascript" | "text/javascript"
    )
}

pub fn resolve_whu_official_script_url(document: &str) -> Option<String> {
    let base = Url::parse(WHU_LIBRARY_HOME_URL).ok()?;
    let mut candidates = extract_html_script_sources(document)
        .into_iter()
        .filter_map(|source| base.join(&source).ok())
        .filter(|url| validate_whu_official_script_url(url.as_str()))
        .map(|url| url.to_string())
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.dedup();
    (candidates.len() == 1).then(|| candidates.remove(0))
}

pub fn safe_url_without_query(value: &str) -> Option<String> {
    let mut url = Url::parse(value).ok()?;
    if url.scheme() != "https" {
        return None;
    }
    url.set_username("").ok()?;
    url.set_password(None).ok()?;
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string())
}

pub fn classify_endpoint_observation(
    id: &str,
    label: &str,
    url: &str,
    observation: &EndpointObservation<'_>,
) -> SideraInstitutionEndpointCheck {
    if let Some(code) = observation.error_code {
        return SideraInstitutionEndpointCheck {
            id: id.to_string(),
            label: label.to_string(),
            url: url.to_string(),
            status: SideraInstitutionEndpointStatus::Failed,
            http_status: observation.status,
            latency_ms: Some(observation.latency_ms),
            code: code.to_string(),
            detail: endpoint_error_detail(code).to_string(),
            detected_entry: None,
        };
    }

    let Some(status) = observation.status else {
        return SideraInstitutionEndpointCheck {
            id: id.to_string(),
            label: label.to_string(),
            url: url.to_string(),
            status: SideraInstitutionEndpointStatus::Failed,
            http_status: None,
            latency_ms: Some(observation.latency_ms),
            code: "SIDERA_INSTITUTION_HTTP_UNKNOWN".to_string(),
            detail: "没有收到可识别的 HTTPS 响应。".to_string(),
            detected_entry: None,
        };
    };

    if !(200..300).contains(&status) {
        return SideraInstitutionEndpointCheck {
            id: id.to_string(),
            label: label.to_string(),
            url: url.to_string(),
            status: SideraInstitutionEndpointStatus::Failed,
            http_status: Some(status),
            latency_ms: Some(observation.latency_ms),
            code: format!("SIDERA_INSTITUTION_HTTP_STATUS_{status}"),
            detail: format!("机构入口返回 HTTP {status}。"),
            detected_entry: None,
        };
    }

    let normalized = observation.body.to_ascii_lowercase();
    let is_service_failure = normalized.contains("服务异常")
        && (normalized.contains("暂无数据") || normalized.contains("service unavailable"));
    if is_service_failure {
        return SideraInstitutionEndpointCheck {
            id: id.to_string(),
            label: label.to_string(),
            url: url.to_string(),
            status: SideraInstitutionEndpointStatus::Failed,
            http_status: Some(status),
            latency_ms: Some(observation.latency_ms),
            code: "SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR".to_string(),
            detail: "机构入口已响应，但上游目录服务返回异常。".to_string(),
            detected_entry: None,
        };
    }
    let is_login = [
        "统一身份认证",
        "institutional sign in",
        "authserver",
        "shibboleth",
        "wayfless",
        "carsi",
    ]
    .iter()
    .any(|needle| normalized.contains(&needle.to_ascii_lowercase()));
    let is_javascript_shell = normalized.contains("<script")
        && (normalized.contains("id=\"app\"")
            || normalized.contains("id='app'")
            || normalized.contains("id=\"root\"")
            || normalized.contains("javascript is required")
            || normalized.contains("请启用javascript"))
        && !contains_discovery_evidence(observation.body);
    let browser_required = is_login
        || is_javascript_shell
        || observation
            .content_type
            .to_ascii_lowercase()
            .contains("application/javascript");

    let (endpoint_status, code, detail) = if observation.truncated {
        (
            SideraInstitutionEndpointStatus::BrowserRequired,
            "SIDERA_INSTITUTION_RESPONSE_TRUNCATED",
            "入口可达，但响应超过诊断上限；请在系统浏览器确认实际内容。",
        )
    } else if browser_required {
        (
            SideraInstitutionEndpointStatus::BrowserRequired,
            "SIDERA_INSTITUTION_BROWSER_REQUIRED",
            "入口可达，但需要浏览器、JavaScript 或机构会话继续确认。",
        )
    } else {
        (
            SideraInstitutionEndpointStatus::NativeDirect,
            "SIDERA_INSTITUTION_NATIVE_DIRECT",
            "Rust HTTPS 可直接读取该机构入口；这不代表供应商数据库已经登录。",
        )
    };

    SideraInstitutionEndpointCheck {
        id: id.to_string(),
        label: label.to_string(),
        url: url.to_string(),
        status: endpoint_status,
        http_status: Some(status),
        latency_ms: Some(observation.latency_ms),
        code: code.to_string(),
        detail: detail.to_string(),
        detected_entry: None,
    }
}

pub fn unresolved_discovery_check(detail: &str) -> SideraInstitutionEndpointCheck {
    SideraInstitutionEndpointCheck {
        id: "unified-discovery".to_string(),
        label: "全馆统一发现".to_string(),
        url: WHU_LIBRARY_HOME_URL.to_string(),
        status: SideraInstitutionEndpointStatus::Unresolved,
        http_status: None,
        latency_ms: None,
        code: "SIDERA_INSTITUTION_DISCOVERY_UNRESOLVED".to_string(),
        detail: detail.to_string(),
        detected_entry: None,
    }
}

pub fn validate_whu_database_sso_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https"
        || url.username() != ""
        || url.password().is_some()
        || url.fragment().is_some()
        || !matches!(
            url.host_str()
                .map(|host| host.to_ascii_lowercase())
                .as_deref(),
            Some("metaauth.com") | Some("www.metaauth.com")
        )
        || url.path() != "/242010/login.html"
    {
        return false;
    }

    let query = url.query_pairs().collect::<Vec<_>>();
    if query.len() != 1 || query[0].0 != "service" {
        return false;
    }
    let Ok(service) = Url::parse(query[0].1.as_ref()) else {
        return false;
    };
    service.scheme() == "https"
        && service.username() == ""
        && service.password().is_none()
        && service.query().is_none()
        && service.fragment().is_none()
        && matches!(
            service
                .host_str()
                .map(|host| host.to_ascii_lowercase())
                .as_deref(),
            Some("whu.metaersp.com") | Some("whu.metaersp.cn")
        )
        && matches!(service.path(), "/personalIndex" | "/databaseList")
}

pub fn resolve_database_sso_entry(documents: &[&str]) -> Option<String> {
    documents
        .iter()
        .flat_map(|document| extract_html_anchors(document))
        .find(|anchor| {
            anchor.text.contains("数据库导航") && validate_whu_database_sso_url(&anchor.href)
        })
        .map(|anchor| anchor.href)
}

pub fn resolve_database_sso_from_official_script(script: &str) -> Option<String> {
    if !has_database_navigation_binding(script) {
        return None;
    }
    let function_body = extract_js_function_body(script, "jumpDatabases")?;
    let mut candidates = extract_js_string_literals(function_body)
        .into_iter()
        .filter(|value| validate_whu_database_sso_url(value))
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.dedup();
    (candidates.len() == 1).then(|| candidates.remove(0))
}

pub fn resolve_discovery_entry(documents: &[&str]) -> Option<String> {
    const KEYWORDS: [&str; 7] = [
        "珞珈学术搜索",
        "学术搜索",
        "findplus",
        "ebscohost",
        "discovery",
        "eds",
        "academic-search",
    ];
    documents
        .iter()
        .flat_map(|document| extract_html_anchors(document))
        .find(|anchor| {
            let normalized = anchor.text.to_ascii_lowercase();
            KEYWORDS
                .iter()
                .any(|keyword| normalized.contains(&keyword.to_ascii_lowercase()))
                && validate_browser_navigation_url(&anchor.href)
        })
        .map(|anchor| anchor.href)
}

pub fn build_navigation_targets(documents: &[&str]) -> Vec<SideraInstitutionNavigationTarget> {
    build_navigation_targets_with_database_sso(documents, None)
}

pub fn build_navigation_targets_with_database_sso(
    documents: &[&str],
    database_sso: Option<&str>,
) -> Vec<SideraInstitutionNavigationTarget> {
    let mut targets = vec![SideraInstitutionNavigationTarget {
        id: "library-home".to_string(),
        kind: SideraInstitutionNavigationKind::Direct,
        open_url: WHU_LIBRARY_HOME_URL.to_string(),
        display_url: WHU_LIBRARY_HOME_URL.to_string(),
        source: SideraInstitutionNavigationSource::FixedConfig,
    }];
    let database_open_url = database_sso
        .filter(|value| validate_whu_database_sso_url(value))
        .map(str::to_string)
        .or_else(|| resolve_database_sso_entry(documents));
    if let Some(open_url) = database_open_url {
        if let Some(display_url) = safe_url_without_query(&open_url) {
            targets.push(SideraInstitutionNavigationTarget {
                id: "database-directory".to_string(),
                kind: SideraInstitutionNavigationKind::OfficialSso,
                open_url,
                display_url,
                source: SideraInstitutionNavigationSource::OfficialResponse,
            });
        }
    }
    if let Some(open_url) = resolve_discovery_entry(documents) {
        if let Some(display_url) = safe_url_without_query(&open_url) {
            targets.push(SideraInstitutionNavigationTarget {
                id: "unified-discovery".to_string(),
                kind: SideraInstitutionNavigationKind::OfficialExternal,
                open_url,
                display_url,
                source: SideraInstitutionNavigationSource::OfficialResponse,
            });
        }
    }
    targets
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct HtmlAnchor {
    href: String,
    text: String,
}

fn extract_html_anchors(document: &str) -> Vec<HtmlAnchor> {
    let lowered = document.to_ascii_lowercase();
    let mut anchors = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = lowered[cursor..].find("<a") {
        let start = cursor + relative_start;
        let boundary = lowered.as_bytes().get(start + 2).copied();
        if !matches!(
            boundary,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            cursor = start + 2;
            continue;
        }
        let Some(tag_end_relative) = find_html_tag_end(&document[start..]) else {
            break;
        };
        let tag_end = start + tag_end_relative;
        let opening_tag = &document[start..=tag_end];
        let inner_start = tag_end + 1;
        let Some(close_relative) = lowered[inner_start..].find("</a>") else {
            cursor = inner_start;
            continue;
        };
        let close_start = inner_start + close_relative;
        if let Some(href) = extract_html_attribute(opening_tag, "href") {
            anchors.push(HtmlAnchor {
                href: decode_html_entities(&href),
                text: normalize_anchor_text(&document[inner_start..close_start]),
            });
        }
        cursor = close_start + 4;
    }
    anchors
}

fn extract_html_script_sources(document: &str) -> Vec<String> {
    let lowered = document.to_ascii_lowercase();
    let mut sources = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = lowered[cursor..].find("<script") {
        let start = cursor + relative_start;
        let boundary = lowered.as_bytes().get(start + 7).copied();
        if !matches!(
            boundary,
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n')
        ) {
            cursor = start + 7;
            continue;
        }
        let Some(tag_end_relative) = find_html_tag_end(&document[start..]) else {
            break;
        };
        let tag_end = start + tag_end_relative;
        if let Some(source) = extract_html_attribute(&document[start..=tag_end], "src") {
            sources.push(decode_html_entities(&source));
        }
        cursor = tag_end + 1;
    }
    sources
}

fn has_database_navigation_binding(script: &str) -> bool {
    let normalized = script.replace("\\\"", "\"").replace("\\'", "'");
    let compact = normalized
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    let Some(function_start) = compact.find("functionjumpDatabases(") else {
        return false;
    };
    let handler = &compact[..function_start];
    let marker = handler
        .find("contains(\"数据库导航\")")
        .or_else(|| handler.find("contains('数据库导航')"));
    let Some(marker) = marker else {
        return false;
    };
    let bound_handler = &handler[marker..];
    handler[..marker].contains(".on('click'")
        && (bound_handler.contains("jumpDatabases(uname,'')")
            || bound_handler.contains("jumpDatabases(enc,uname,'')"))
}

fn extract_js_function_body<'a>(script: &'a str, name: &str) -> Option<&'a str> {
    let signature = format!("function {name}");
    let signature_start = script.find(&signature)?;
    let opening_relative = script[signature_start + signature.len()..].find('{')?;
    let opening = signature_start + signature.len() + opening_relative;
    let mut depth = 0usize;
    let mut quote = None;
    let mut escaped = false;
    for (relative, character) in script[opening..].char_indices() {
        if let Some(active_quote) = quote {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' | '`' => quote = Some(character),
            '{' => depth += 1,
            '}' => {
                depth = depth.checked_sub(1)?;
                if depth == 0 {
                    return Some(&script[opening + 1..opening + relative]);
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_js_string_literals(source: &str) -> Vec<String> {
    let mut literals = Vec::new();
    let mut characters = source.chars().peekable();
    while let Some(character) = characters.next() {
        if !matches!(character, '\'' | '"') {
            continue;
        }
        let quote = character;
        let mut raw = String::new();
        let mut closed = false;
        while let Some(current) = characters.next() {
            if current == '\\' {
                raw.push(current);
                if let Some(escaped) = characters.next() {
                    raw.push(escaped);
                    continue;
                }
                break;
            }
            if current == quote {
                closed = true;
                break;
            }
            raw.push(current);
        }
        if closed {
            if let Some(decoded) = decode_js_string_literal(&raw) {
                literals.push(decoded);
            }
        }
    }
    literals
}

fn decode_js_string_literal(raw: &str) -> Option<String> {
    let mut decoded = String::new();
    let mut characters = raw.chars();
    while let Some(character) = characters.next() {
        if character != '\\' {
            decoded.push(character);
            continue;
        }
        let escaped = characters.next()?;
        match escaped {
            '\\' | '\'' | '"' | '/' => decoded.push(escaped),
            'n' => decoded.push('\n'),
            'r' => decoded.push('\r'),
            't' => decoded.push('\t'),
            'u' => {
                let digits = (0..4)
                    .map(|_| characters.next())
                    .collect::<Option<String>>()?;
                decoded.push(char::from_u32(u32::from_str_radix(&digits, 16).ok()?)?);
            }
            'x' => {
                let digits = (0..2)
                    .map(|_| characters.next())
                    .collect::<Option<String>>()?;
                decoded.push(char::from_u32(u32::from_str_radix(&digits, 16).ok()?)?);
            }
            _ => return None,
        }
    }
    Some(decoded)
}

fn find_html_tag_end(fragment: &str) -> Option<usize> {
    let mut quote = None;
    for (index, character) in fragment.char_indices() {
        match (quote, character) {
            (Some(active), current) if active == current => quote = None,
            (None, '\'' | '"') => quote = Some(character),
            (None, '>') => return Some(index),
            _ => {}
        }
    }
    None
}

fn extract_html_attribute(tag: &str, name: &str) -> Option<String> {
    let lowered = tag.to_ascii_lowercase();
    let mut search_start = 0;
    while let Some(relative) = lowered[search_start..].find(name) {
        let start = search_start + relative;
        let before = start
            .checked_sub(1)
            .and_then(|index| lowered.as_bytes().get(index));
        let after = lowered.as_bytes().get(start + name.len());
        let valid_before = before
            .map(|byte| byte.is_ascii_whitespace() || *byte == b'<')
            .unwrap_or(true);
        let valid_after = after
            .map(|byte| byte.is_ascii_whitespace() || *byte == b'=')
            .unwrap_or(false);
        if !valid_before || !valid_after {
            search_start = start + name.len();
            continue;
        }
        let mut value_start = start + name.len();
        while lowered
            .as_bytes()
            .get(value_start)
            .is_some_and(u8::is_ascii_whitespace)
        {
            value_start += 1;
        }
        if lowered.as_bytes().get(value_start) != Some(&b'=') {
            search_start = start + name.len();
            continue;
        }
        value_start += 1;
        while lowered
            .as_bytes()
            .get(value_start)
            .is_some_and(u8::is_ascii_whitespace)
        {
            value_start += 1;
        }
        let quote = lowered.as_bytes().get(value_start).copied();
        let (content_start, content_end) = if matches!(quote, Some(b'\'') | Some(b'"')) {
            let quote = quote.unwrap();
            let content_start = value_start + 1;
            let relative_end = lowered.as_bytes()[content_start..]
                .iter()
                .position(|byte| *byte == quote)?;
            (content_start, content_start + relative_end)
        } else {
            let relative_end = lowered.as_bytes()[value_start..]
                .iter()
                .position(|byte| byte.is_ascii_whitespace() || *byte == b'>')
                .unwrap_or(lowered.len() - value_start);
            (value_start, value_start + relative_end)
        };
        return Some(tag[content_start..content_end].to_string());
    }
    None
}

fn normalize_anchor_text(value: &str) -> String {
    let mut text = String::new();
    let mut inside_tag = false;
    for character in value.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => text.push(character),
            _ => {}
        }
    }
    decode_html_entities(&text)
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>()
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&#38;", "&")
        .replace("&#x26;", "&")
        .replace("&nbsp;", " ")
        .replace("&gt;", ">")
        .replace("&lt;", "<")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn validate_browser_navigation_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https"
        || url.username() != ""
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return false;
    }
    !url.query_pairs().any(|(key, _)| {
        matches!(
            key.to_ascii_lowercase().as_str(),
            "token" | "ticket" | "cookie" | "password" | "passwd" | "auth"
        )
    })
}

pub fn estimate_catalog_entry_count(body: &str) -> Option<usize> {
    summarize_catalog(body).entry_count
}

pub fn summarize_catalog(body: &str) -> SideraInstitutionCatalogSummary {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return SideraInstitutionCatalogSummary::default();
    };
    let mut entries = Vec::new();
    collect_catalog_entries(&value, &mut entries);
    let entry_count = entries.len();
    let mut categories = entries
        .iter()
        .filter_map(|entry| entry.category.clone())
        .collect::<Vec<_>>();
    categories.sort();
    categories.dedup();
    categories.truncate(8);
    entries.truncate(8);
    SideraInstitutionCatalogSummary {
        structured: entry_count > 0,
        entry_count: (entry_count > 0).then_some(entry_count),
        categories,
        sample_entries: entries,
    }
}

pub fn build_capability_report(
    endpoints: &[SideraInstitutionEndpointCheck],
    catalog_entry_count: Option<usize>,
    metadata_export_detected: bool,
) -> SideraInstitutionCapabilityReport {
    let discovery = endpoints
        .iter()
        .find(|item| item.id == "unified-discovery")
        .map(|item| item.status)
        .unwrap_or(SideraInstitutionEndpointStatus::Unresolved);
    let directory = endpoints
        .iter()
        .find(|item| item.id == "database-directory")
        .map(|item| item.status)
        .unwrap_or(SideraInstitutionEndpointStatus::Unresolved);
    let unified_discovery = capability_from_endpoint(discovery);
    let online_navigation = capability_from_endpoint(directory);
    let metadata_export = if metadata_export_detected {
        SideraInstitutionCapabilityStatus::Available
    } else if matches!(
        discovery,
        SideraInstitutionEndpointStatus::NativeDirect
            | SideraInstitutionEndpointStatus::BrowserRequired
    ) {
        SideraInstitutionCapabilityStatus::BrowserRequired
    } else {
        SideraInstitutionCapabilityStatus::Unresolved
    };
    let full_text_resolution = if matches!(
        discovery,
        SideraInstitutionEndpointStatus::NativeDirect
            | SideraInstitutionEndpointStatus::BrowserRequired
    ) {
        SideraInstitutionCapabilityStatus::BrowserRequired
    } else {
        SideraInstitutionCapabilityStatus::Unresolved
    };
    let route_recommendation = match discovery {
        SideraInstitutionEndpointStatus::NativeDirect if metadata_export_detected => {
            "direct-unified-search"
        }
        SideraInstitutionEndpointStatus::NativeDirect => "hybrid",
        _ => "visible-browser-export",
    };

    SideraInstitutionCapabilityReport {
        unified_discovery,
        metadata_export,
        online_navigation,
        full_text_resolution,
        dedicated_adapters: SideraInstitutionCapabilityStatus::Unresolved,
        catalog_entry_count,
        route_recommendation: route_recommendation.to_string(),
    }
}

pub fn aggregate_probe_status(
    client_running: bool,
    endpoints: &[SideraInstitutionEndpointCheck],
) -> SideraInstitutionProbeStatus {
    let core = endpoints
        .iter()
        .filter(|item| item.id == "library-home" || item.id == "database-directory")
        .collect::<Vec<_>>();
    let all_failed = !core.is_empty()
        && core
            .iter()
            .all(|item| item.status == SideraInstitutionEndpointStatus::Failed);
    let discovery_resolved = endpoints.iter().any(|item| {
        item.id == "unified-discovery"
            && matches!(
                item.status,
                SideraInstitutionEndpointStatus::NativeDirect
                    | SideraInstitutionEndpointStatus::BrowserRequired
            )
    });
    if all_failed {
        SideraInstitutionProbeStatus::Unavailable
    } else if client_running && discovery_resolved {
        SideraInstitutionProbeStatus::Ready
    } else {
        SideraInstitutionProbeStatus::Partial
    }
}

pub fn contains_metadata_export_evidence(body: &str) -> bool {
    let normalized = body.to_ascii_lowercase();
    ["bibtex", "ris", "endnote", "题录导出", "导出题录"]
        .iter()
        .any(|needle| normalized.contains(&needle.to_ascii_lowercase()))
}

fn contains_discovery_evidence(body: &str) -> bool {
    let normalized = body.to_ascii_lowercase();
    ["珞珈学术搜索", "findplus", "ebscohost", "discovery"]
        .iter()
        .any(|needle| normalized.contains(&needle.to_ascii_lowercase()))
}

fn capability_from_endpoint(
    status: SideraInstitutionEndpointStatus,
) -> SideraInstitutionCapabilityStatus {
    match status {
        SideraInstitutionEndpointStatus::NativeDirect => {
            SideraInstitutionCapabilityStatus::Available
        }
        SideraInstitutionEndpointStatus::BrowserRequired => {
            SideraInstitutionCapabilityStatus::BrowserRequired
        }
        SideraInstitutionEndpointStatus::Unresolved | SideraInstitutionEndpointStatus::Failed => {
            SideraInstitutionCapabilityStatus::Unresolved
        }
    }
}

fn endpoint_error_detail(code: &str) -> &'static str {
    match code {
        "SIDERA_INSTITUTION_HTTP_TIMEOUT" => "机构入口响应超时，请检查 aTrust 后重试。",
        "SIDERA_INSTITUTION_HTTP_TLS" => "机构入口 TLS 握手失败。",
        "SIDERA_INSTITUTION_HTTP_DNS" => "无法解析机构入口域名。",
        "SIDERA_INSTITUTION_RESPONSE_TOO_LARGE" => "机构入口响应超过诊断上限，请在系统浏览器确认。",
        "SIDERA_INSTITUTION_URL_REJECTED" => "机构入口不在受限白名单内。",
        _ => "机构入口暂时不可达。",
    }
}

fn collect_catalog_entries(
    value: &serde_json::Value,
    entries: &mut Vec<SideraInstitutionCatalogEntry>,
) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_catalog_entries(item, entries);
            }
        }
        serde_json::Value::Object(object) => {
            let name = first_string(object, &["name", "title", "dbName", "databaseName"])
                .map(|value| limited_text(&value, 160));
            if let Some(name) = name {
                let category = first_string(
                    object,
                    &[
                        "category",
                        "categoryName",
                        "type",
                        "subject",
                        "resourceType",
                    ],
                )
                .map(|value| limited_text(&value, 80));
                let entry_url = first_string(object, &["url", "link", "entry", "accessUrl"])
                    .and_then(|url| safe_url_without_query(&url));
                entries.push(SideraInstitutionCatalogEntry {
                    name,
                    category,
                    entry_url,
                });
            }
            for nested in object.values() {
                collect_catalog_entries(nested, entries);
            }
        }
        _ => {}
    }
}

fn first_string(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| {
        object
            .get(*key)
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn limited_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observation<'a>(body: &'a str) -> EndpointObservation<'a> {
        EndpointObservation {
            status: Some(200),
            content_type: "text/html; charset=utf-8",
            body,
            truncated: false,
            latency_ms: 12,
            error_code: None,
        }
    }

    #[test]
    fn process_matching_is_case_insensitive_and_name_scoped() {
        assert!(is_atrust_running(&["ATRUSTTRAY.EXE".to_string()]));
        assert!(!is_atrust_running(&["aTrustService.exe".to_string()]));
    }

    #[test]
    fn atrust_snapshot_classifies_installed_running_stopped_missing_and_unreadable() {
        let running = vec!["ATRUSTTRAY.EXE".to_string()];
        let unrelated = vec!["explorer.exe".to_string()];
        let installed_running = classify_atrust_client(
            Ok(Some(
                "C:\\Program Files (x86)\\Sangfor\\aTrustTray.exe".to_string(),
            )),
            Ok(&running),
        );
        assert_eq!(
            installed_running.status,
            SideraInstitutionClientStatus::InstalledRunning
        );
        let installed_stopped = classify_atrust_client(
            Ok(Some(
                "C:\\Program Files (x86)\\Sangfor\\aTrustTray.exe".to_string(),
            )),
            Ok(&unrelated),
        );
        assert_eq!(
            installed_stopped.status,
            SideraInstitutionClientStatus::InstalledStopped
        );
        let missing = classify_atrust_client(Ok(None), Ok(&unrelated));
        assert_eq!(missing.status, SideraInstitutionClientStatus::NotFound);
        let unreadable = classify_atrust_client(Err("access denied"), Ok(&running));
        assert_eq!(
            unreadable.status,
            SideraInstitutionClientStatus::DetectionFailed
        );
        assert_eq!(unreadable.code, "SIDERA_INSTITUTION_ATRUST_PATH_UNREADABLE");
    }

    #[test]
    fn probe_url_allowlist_rejects_arbitrary_and_non_https_urls() {
        assert!(validate_whu_probe_url(WHU_LIBRARY_HOME_URL));
        assert!(validate_whu_probe_url(WHU_DATABASE_DIRECTORY_URL));
        assert!(!validate_whu_probe_url("http://www.lib.whu.edu.cn/"));
        assert!(!validate_whu_probe_url("https://example.com/"));
        assert!(!validate_whu_probe_url(
            "https://user:secret@www.lib.whu.edu.cn/"
        ));
    }

    #[test]
    fn official_script_url_is_discovered_from_realistic_home_shell() {
        let shell = r#"
            <html><body><div id="app"></div>
            <script src="/assets/lib/vue.js"></script>
            <script src="/whuWebsite.js?v=20240929"></script>
            </body></html>
        "#;
        assert_eq!(
            resolve_whu_official_script_url(shell).as_deref(),
            Some("https://www.lib.whu.edu.cn/whuWebsite.js?v=20240929")
        );
        assert!(validate_whu_official_script_url(
            "https://www.lib.whu.edu.cn/whuWebsite.js?v=20260415-2"
        ));
        assert!(validate_whu_official_script_url(
            "https://lib.whu.edu.cn/whuWebsite.js"
        ));
        for rejected in [
            "http://www.lib.whu.edu.cn/whuWebsite.js?v=20240929",
            "https://example.com/whuWebsite.js?v=20240929",
            "https://user:secret@www.lib.whu.edu.cn/whuWebsite.js?v=20240929",
            "https://www.lib.whu.edu.cn/other.js?v=20240929",
            "https://www.lib.whu.edu.cn/whuWebsite.js?v=",
            "https://www.lib.whu.edu.cn/whuWebsite.js?v=20240929&token=secret",
            "https://www.lib.whu.edu.cn/whuWebsite.js?v=1&v=2",
            "https://www.lib.whu.edu.cn/whuWebsite.js?v=20240929#fragment",
        ] {
            assert!(
                !validate_whu_official_script_url(rejected),
                "accepted {rejected}"
            );
        }
        assert!(validate_whu_official_script_content_type(
            "application/javascript; charset=UTF-8"
        ));
        assert!(validate_whu_official_script_content_type("text/javascript"));
        assert!(!validate_whu_official_script_content_type("text/html"));
    }

    #[test]
    fn official_script_url_rejects_ambiguous_registered_assets() {
        let ambiguous = r#"
            <script src="https://www.lib.whu.edu.cn/whuWebsite.js?v=1"></script>
            <script src="https://lib.whu.edu.cn/whuWebsite.js?v=2"></script>
        "#;
        assert_eq!(resolve_whu_official_script_url(ambiguous), None);
        let duplicate = r#"
            <script src="/whuWebsite.js?v=1"></script>
            <script src="/whuWebsite.js?v=1"></script>
        "#;
        assert!(resolve_whu_official_script_url(duplicate).is_some());
    }

    #[test]
    fn database_sso_anchor_is_scoped_decoded_and_strictly_validated() {
        let unrelated = r#"<a href="https://example.com/not-the-entry">其他入口</a>"#;
        let official = r#"<a class="database" href="https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex&amp;ignored=1">数据库导航</a>"#;
        assert_eq!(resolve_database_sso_entry(&[unrelated, official]), None);

        let valid = r#"<a class="database" href="https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex"><span>常用数据库</span>——数据库导航&gt;&gt;</a>"#;
        let resolved = resolve_database_sso_entry(&[unrelated, valid]).unwrap();
        assert!(validate_whu_database_sso_url(&resolved));
        assert_eq!(
            safe_url_without_query(&resolved).as_deref(),
            Some("https://www.metaauth.com/242010/login.html")
        );
    }

    #[test]
    fn database_sso_is_statically_resolved_from_official_dynamic_config() {
        let official = r#"
            script.text = "$(function() {
              $('body').on('click', 'a p:contains(\"数据库导航\")', function(event) {
                event.preventDefault(); jumpDatabases(uname, '')
              })
              function jumpDatabases(uname, databaseNum) {
                let url = 'https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex';
                if (databaseNum !== '') {
                  url = 'https://www.metaauth.com/242010/login.html?service=https://whu.metaersp.cn/databaseDetail?databaseNum=' + databaseNum;
                }
                window.open(url)
              }
            });";
        "#;
        let resolved = resolve_database_sso_from_official_script(official).unwrap();
        assert!(validate_whu_database_sso_url(&resolved));
        assert!(resolved.contains("personalIndex"));
        assert!(!resolved.contains("databaseDetail"));

        let targets = build_navigation_targets_with_database_sso(
            &["<a href=\"https://discovery.example.edu/search\">珞珈学术搜索</a>"],
            Some(&resolved),
        );
        let database = targets
            .iter()
            .find(|target| target.id == "database-directory")
            .unwrap();
        assert_eq!(database.kind, SideraInstitutionNavigationKind::OfficialSso);
        assert_eq!(
            database.display_url,
            "https://www.metaauth.com/242010/login.html"
        );
    }

    #[test]
    fn database_sso_accepts_current_three_argument_official_binding() {
        let official = r#"
            script.text = "$(function() {
              $('body').on('click', 'a p:contains(\"数据库导航\")', function(event) {
                event.preventDefault(); jumpDatabases(enc, uname, '')
              })
              function jumpDatabases(enc, uname, databaseNum) {
                let url = 'https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex';
                if (databaseNum !== '') {
                  url = 'https://www.metaauth.com/242010/login.html?service=https://whu.metaersp.cn/databaseDetail?databaseNum=' + databaseNum;
                }
                window.open(url)
              }
            });";
        "#;
        let resolved = resolve_database_sso_from_official_script(official).unwrap();
        assert!(validate_whu_database_sso_url(&resolved));
        assert!(resolved.contains("personalIndex"));
        assert!(!resolved.contains("databaseDetail"));
    }

    #[test]
    fn database_sso_dynamic_config_requires_binding_and_one_valid_candidate() {
        let unbound = r#"
            function jumpDatabases(uname, databaseNum) {
              let url = 'https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex';
            }
        "#;
        assert_eq!(resolve_database_sso_from_official_script(unbound), None);

        let unrelated = r#"
            $('body').on('click', 'a p:contains(\"其他入口\")', function() { jumpDatabases(uname, '') })
            function jumpDatabases(uname, databaseNum) {
              let url = 'https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex';
            }
        "#;
        assert_eq!(resolve_database_sso_from_official_script(unrelated), None);

        let ambiguous = r#"
            $('body').on('click', 'a p:contains(\"数据库导航\")', function() { jumpDatabases(uname, '') })
            function jumpDatabases(uname, databaseNum) {
              let first = 'https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex';
              let second = 'https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.cn%2FdatabaseList';
            }
        "#;
        assert_eq!(resolve_database_sso_from_official_script(ambiguous), None);
    }

    #[test]
    fn database_sso_rejects_wrong_tenant_service_credentials_and_extra_parameters() {
        let rejected = [
            "http://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex",
            "https://user:secret@www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex",
            "https://www.metaauth.com/999999/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex",
            "https://www.metaauth.com/242010/login.html?service=http%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex",
            "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fexample.com%2FpersonalIndex",
            "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2Fother",
            "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex%3Fticket%3Dsecret",
            "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex&token=secret",
            "https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex&service=https%3A%2F%2Fwhu.metaersp.cn%2FdatabaseList",
        ];
        for value in rejected {
            assert!(!validate_whu_database_sso_url(value), "accepted {value}");
        }
    }

    #[test]
    fn direct_html_and_javascript_shell_are_distinguished() {
        let direct = classify_endpoint_observation(
            "library-home",
            "图书馆官网",
            WHU_LIBRARY_HOME_URL,
            &observation("<html><main>武汉大学图书馆馆藏服务</main></html>"),
        );
        assert_eq!(direct.status, SideraInstitutionEndpointStatus::NativeDirect);

        let shell = classify_endpoint_observation(
            "database-directory",
            "数据库导航",
            WHU_DATABASE_DIRECTORY_URL,
            &observation("<html><div id=\"app\"></div><script src=\"/app.js\"></script></html>"),
        );
        assert_eq!(
            shell.status,
            SideraInstitutionEndpointStatus::BrowserRequired
        );
    }

    #[test]
    fn login_and_network_failure_are_safe_classifications() {
        let login = classify_endpoint_observation(
            "library-home",
            "图书馆官网",
            WHU_LIBRARY_HOME_URL,
            &observation("<html>统一身份认证 authserver</html>"),
        );
        assert_eq!(
            login.status,
            SideraInstitutionEndpointStatus::BrowserRequired
        );

        let failure = classify_endpoint_observation(
            "library-home",
            "图书馆官网",
            WHU_LIBRARY_HOME_URL,
            &EndpointObservation {
                status: None,
                content_type: "",
                body: "Cookie: secret=never-return-this",
                truncated: false,
                latency_ms: 8_000,
                error_code: Some("SIDERA_INSTITUTION_HTTP_TIMEOUT"),
            },
        );
        assert_eq!(failure.status, SideraInstitutionEndpointStatus::Failed);
        assert!(!failure.detail.contains("secret"));
    }

    #[test]
    fn response_limits_and_http_errors_do_not_become_direct_access() {
        let truncated = classify_endpoint_observation(
            "library-home",
            "图书馆官网",
            WHU_LIBRARY_HOME_URL,
            &EndpointObservation {
                truncated: true,
                ..observation("<html>large response</html>")
            },
        );
        assert_eq!(
            truncated.status,
            SideraInstitutionEndpointStatus::BrowserRequired
        );
        let status = classify_endpoint_observation(
            "library-home",
            "图书馆官网",
            WHU_LIBRARY_HOME_URL,
            &EndpointObservation {
                status: Some(503),
                ..observation("upstream detail must not be returned")
            },
        );
        assert_eq!(status.status, SideraInstitutionEndpointStatus::Failed);
        assert_eq!(status.code, "SIDERA_INSTITUTION_HTTP_STATUS_503");
        assert!(!status.detail.contains("upstream"));

        let redirect = classify_endpoint_observation(
            "library-home",
            "图书馆官网",
            WHU_LIBRARY_HOME_URL,
            &EndpointObservation {
                status: Some(302),
                ..observation("")
            },
        );
        assert_eq!(redirect.status, SideraInstitutionEndpointStatus::Failed);

        let upstream = classify_endpoint_observation(
            "database-directory",
            "数据库导航",
            WHU_DATABASE_DIRECTORY_URL,
            &observation("<html><p>服务异常</p><div>暂无数据</div></html>"),
        );
        assert_eq!(upstream.status, SideraInstitutionEndpointStatus::Failed);
        assert_eq!(upstream.code, "SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR");
    }

    #[test]
    fn discovery_resolution_sanitizes_query_for_display() {
        let document = r#"<a href="https://unrelated.example.edu/">其他服务</a><a href="https://discovery.example.edu/search?q=public">珞珈学术搜索</a>"#;
        let resolved = resolve_discovery_entry(&[document]).unwrap();
        assert_eq!(
            safe_url_without_query(&resolved).as_deref(),
            Some("https://discovery.example.edu/search")
        );
        assert_eq!(
            safe_url_without_query("https://user:secret@discovery.example.edu/search?q=secret")
                .as_deref(),
            Some("https://discovery.example.edu/search")
        );
        assert_eq!(resolve_discovery_entry(&["<div id='app'></div>"]), None);
        assert_eq!(
            resolve_discovery_entry(&[
                r#"<a href="https://discovery.example.edu/search?ticket=secret">珞珈学术搜索</a>"#
            ]),
            None
        );
    }

    #[test]
    fn navigation_targets_keep_open_url_private_from_display_url() {
        let document = r#"
            <a href="https://www.metaauth.com/242010/login.html?service=https%3A%2F%2Fwhu.metaersp.com%2FpersonalIndex">数据库导航</a>
            <a href="https://discovery.example.edu/search?q=machine-learning">珞珈学术搜索</a>
        "#;
        let targets = build_navigation_targets(&[document]);
        assert_eq!(targets.len(), 3);
        let database = targets
            .iter()
            .find(|target| target.id == "database-directory")
            .unwrap();
        assert_eq!(database.kind, SideraInstitutionNavigationKind::OfficialSso);
        assert!(database.open_url.contains("service="));
        assert_eq!(
            database.display_url,
            "https://www.metaauth.com/242010/login.html"
        );
        assert!(!database.display_url.contains("service"));
        let discovery = targets
            .iter()
            .find(|target| target.id == "unified-discovery")
            .unwrap();
        assert_eq!(
            discovery.kind,
            SideraInstitutionNavigationKind::OfficialExternal
        );
        assert!(!discovery.display_url.contains("machine-learning"));
    }

    #[test]
    fn catalog_count_and_capability_route_are_deterministic() {
        let body = r#"{"data":[{"name":"A","categoryName":"中文数据库","url":"https://example.com/db?ticket=secret"},{"databaseName":"B","category":"外文数据库"},{"other":true}]}"#;
        let catalog = summarize_catalog(body);
        let count = estimate_catalog_entry_count(body);
        assert_eq!(count, Some(2));
        assert!(catalog.structured);
        assert_eq!(catalog.entry_count, Some(2));
        assert_eq!(catalog.categories, vec!["中文数据库", "外文数据库"]);
        assert_eq!(catalog.sample_entries[0].name, "A");
        assert_eq!(
            catalog.sample_entries[0].entry_url.as_deref(),
            Some("https://example.com/db")
        );
        let endpoints = vec![
            classify_endpoint_observation(
                "database-directory",
                "数据库导航",
                WHU_DATABASE_DIRECTORY_URL,
                &observation("<html>目录</html>"),
            ),
            classify_endpoint_observation(
                "unified-discovery",
                "全馆统一发现",
                WHU_LIBRARY_HOME_URL,
                &observation("<html>珞珈学术搜索 BibTeX RIS</html>"),
            ),
        ];
        let report = build_capability_report(&endpoints, count, true);
        assert_eq!(
            report.unified_discovery,
            SideraInstitutionCapabilityStatus::Available
        );
        assert_eq!(report.route_recommendation, "direct-unified-search");
        assert_eq!(
            aggregate_probe_status(true, &endpoints),
            SideraInstitutionProbeStatus::Ready
        );
    }
}
