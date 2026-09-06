use std::path::Path;

use serde::{Deserialize, Serialize};
use url::Url;

pub const INSTITUTION_POPUP_BRIDGE_TIMEOUT_MS: u128 = 30_000;
pub const INSTITUTION_BROWSER_BOUNDS_EPSILON: f64 = 1.0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InstitutionBrowserTarget {
    Web(Url),
    External(Url),
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstitutionPopupDisposition {
    ManagedPopup,
    TransientBridge,
    AuthModal,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstitutionPopupPhase {
    Transient,
    Interactive,
    StableContent,
    Authentication,
    Closed,
    Failed,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstitutionPopupResolution {
    Pending,
    RetainPopup,
    MigrateSafeGet,
    CloseDuplicate,
    Closed,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstitutionPopupAction {
    KeepPopup,
    MigrateSafeGet,
    CloseDuplicate,
    CloseFailed,
    IgnoreStale,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstitutionPopupLocation {
    pub origin: String,
    pub path: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstitutionPopupState {
    pub popup_id: String,
    pub opener_tab_id: String,
    pub generation: u64,
    pub created_at_ms: u128,
    pub location: InstitutionPopupLocation,
    pub phase: InstitutionPopupPhase,
    pub disposition: InstitutionPopupDisposition,
    pub resolution: InstitutionPopupResolution,
    pub code: String,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InstitutionBrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstitutionBrowserBoundsCause {
    InitialShow,
    VisibilityChange,
    ActiveTabChange,
    WindowResize,
    LayoutResize,
    OuterScroll,
    Wheel,
}

pub fn parse_institution_browser_target(value: &str) -> Result<InstitutionBrowserTarget, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("SIDERA_INSTITUTION_BROWSER_ADDRESS_EMPTY".to_string());
    }
    if trimmed.eq_ignore_ascii_case("about:blank") {
        return Url::parse("about:blank")
            .map(InstitutionBrowserTarget::Web)
            .map_err(|_| "SIDERA_INSTITUTION_BROWSER_ADDRESS_INVALID".to_string());
    }
    let explicit_scheme = trimmed.split_once(':').is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme.chars().enumerate().all(|(index, character)| {
                character.is_ascii_alphanumeric()
                    || (index > 0 && matches!(character, '+' | '-' | '.'))
            })
    });
    let candidate = if trimmed.contains("://")
        || trimmed.starts_with("mailto:")
        || trimmed.starts_with("tel:")
        || (explicit_scheme && !trimmed.starts_with("localhost:"))
    {
        trimmed.to_string()
    } else if trimmed.contains('.') || trimmed.starts_with("localhost") {
        format!("https://{trimmed}")
    } else {
        return Err("SIDERA_INSTITUTION_BROWSER_ADDRESS_INVALID".to_string());
    };
    let url = Url::parse(&candidate)
        .map_err(|_| "SIDERA_INSTITUTION_BROWSER_ADDRESS_INVALID".to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(InstitutionBrowserTarget::Web(url)),
        "about" if url.as_str() == "about:blank" => Ok(InstitutionBrowserTarget::Web(url)),
        "mailto" | "tel" => Ok(InstitutionBrowserTarget::External(url)),
        _ => Err("SIDERA_INSTITUTION_BROWSER_SCHEME_UNSUPPORTED".to_string()),
    }
}

pub fn classify_institution_popup(url: &Url) -> InstitutionPopupDisposition {
    if url.as_str() == "about:blank" {
        return InstitutionPopupDisposition::AuthModal;
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let path = url.path().to_ascii_lowercase();
    let authentication_hint = [
        "login", "signin", "sign-in", "auth", "oauth", "saml", "sso", "cas", "metaauth", "identity",
    ]
    .iter()
    .any(|needle| host.contains(needle) || path.contains(needle));
    if authentication_hint {
        InstitutionPopupDisposition::AuthModal
    } else if host == "whu.metaersp.com" && path.trim_end_matches('/') == "/loading" {
        InstitutionPopupDisposition::TransientBridge
    } else {
        InstitutionPopupDisposition::ManagedPopup
    }
}

pub fn sanitize_institution_popup_location(url: &Url) -> InstitutionPopupLocation {
    if url.as_str() == "about:blank" {
        return InstitutionPopupLocation {
            origin: "about:".to_string(),
            path: "blank".to_string(),
        };
    }
    let origin = match (url.host_str(), url.port()) {
        (Some(host), Some(port)) => {
            format!("{}://{}:{port}", url.scheme(), host.to_ascii_lowercase())
        }
        (Some(host), None) => format!("{}://{}", url.scheme(), host.to_ascii_lowercase()),
        _ => format!("{}:", url.scheme()),
    };
    let mut path = url.path().to_string();
    if path.is_empty() {
        path.push('/');
    }
    if path.chars().count() > 240 {
        path = format!("{}…", path.chars().take(239).collect::<String>());
    }
    InstitutionPopupLocation { origin, path }
}

pub fn new_institution_popup_state(
    popup_id: String,
    opener_tab_id: String,
    generation: u64,
    created_at_ms: u128,
    url: &Url,
) -> InstitutionPopupState {
    let disposition = classify_institution_popup(url);
    let phase = match disposition {
        InstitutionPopupDisposition::AuthModal => InstitutionPopupPhase::Authentication,
        InstitutionPopupDisposition::TransientBridge => InstitutionPopupPhase::Transient,
        InstitutionPopupDisposition::ManagedPopup => InstitutionPopupPhase::Interactive,
    };
    InstitutionPopupState {
        popup_id,
        opener_tab_id,
        generation,
        created_at_ms,
        location: sanitize_institution_popup_location(url),
        phase,
        disposition,
        resolution: InstitutionPopupResolution::Pending,
        code: "SIDERA_INSTITUTION_POPUP_OPENING".to_string(),
    }
}

fn popup_callback_is_current(
    popup: &InstitutionPopupState,
    popup_id: &str,
    opener_tab_id: &str,
    generation: u64,
) -> bool {
    popup.popup_id == popup_id
        && popup.opener_tab_id == opener_tab_id
        && popup.generation == generation
        && !matches!(
            popup.phase,
            InstitutionPopupPhase::Closed | InstitutionPopupPhase::Failed
        )
}

pub fn observe_institution_popup_navigation(
    popup: &mut InstitutionPopupState,
    popup_id: &str,
    opener_tab_id: &str,
    generation: u64,
    target: &Url,
    finished: bool,
    safe_get_proven: bool,
    opener_semantics_required: bool,
) -> InstitutionPopupAction {
    if !popup_callback_is_current(popup, popup_id, opener_tab_id, generation) {
        return InstitutionPopupAction::IgnoreStale;
    }
    popup.location = sanitize_institution_popup_location(target);
    popup.disposition = classify_institution_popup(target);
    match popup.disposition {
        InstitutionPopupDisposition::AuthModal => {
            popup.phase = InstitutionPopupPhase::Authentication;
            popup.resolution = InstitutionPopupResolution::RetainPopup;
            popup.code = "SIDERA_INSTITUTION_POPUP_AUTHENTICATION".to_string();
            InstitutionPopupAction::KeepPopup
        }
        InstitutionPopupDisposition::TransientBridge => {
            popup.phase = InstitutionPopupPhase::Transient;
            popup.resolution = InstitutionPopupResolution::Pending;
            popup.code = "SIDERA_INSTITUTION_POPUP_BRIDGE_PENDING".to_string();
            InstitutionPopupAction::KeepPopup
        }
        InstitutionPopupDisposition::ManagedPopup if !finished => {
            popup.phase = InstitutionPopupPhase::Interactive;
            popup.resolution = InstitutionPopupResolution::Pending;
            popup.code = "SIDERA_INSTITUTION_POPUP_NAVIGATING".to_string();
            InstitutionPopupAction::KeepPopup
        }
        InstitutionPopupDisposition::ManagedPopup
            if safe_get_proven && !opener_semantics_required =>
        {
            popup.phase = InstitutionPopupPhase::StableContent;
            popup.resolution = InstitutionPopupResolution::MigrateSafeGet;
            popup.code = "SIDERA_INSTITUTION_POPUP_SAFE_GET_READY".to_string();
            InstitutionPopupAction::MigrateSafeGet
        }
        InstitutionPopupDisposition::ManagedPopup => {
            popup.phase = InstitutionPopupPhase::StableContent;
            popup.resolution = InstitutionPopupResolution::RetainPopup;
            popup.code = "SIDERA_INSTITUTION_POPUP_RETAINED".to_string();
            InstitutionPopupAction::KeepPopup
        }
    }
}

fn canonical_popup_host(host: &str) -> String {
    let host = host.trim_start_matches("www.").to_ascii_lowercase();
    if host == "cnki.net" || host.ends_with(".cnki.net") {
        "cnki.net".to_string()
    } else if host.contains("webofscience") || host.ends_with(".clarivate.com") {
        "webofscience".to_string()
    } else {
        host
    }
}

fn same_canonical_popup_target(left: &InstitutionPopupLocation, right: &Url) -> bool {
    let Some(right_host) = right.host_str() else {
        return false;
    };
    let left_host = Url::parse(&format!("{}/", left.origin))
        .ok()
        .and_then(|value| value.host_str().map(str::to_string))
        .unwrap_or_default();
    let left_host = canonical_popup_host(&left_host);
    let right_host = canonical_popup_host(right_host);
    left_host == right_host
        && (matches!(left_host.as_str(), "cnki.net" | "webofscience")
            || left.path.trim_end_matches('/') == right.path().trim_end_matches('/'))
}

pub fn reconcile_institution_popup_with_opener(
    popup: &mut InstitutionPopupState,
    opener_tab_id: &str,
    generation: u64,
    opener_target: &Url,
) -> InstitutionPopupAction {
    if !popup_callback_is_current(popup, &popup.popup_id.clone(), opener_tab_id, generation) {
        return InstitutionPopupAction::IgnoreStale;
    }
    if !matches!(opener_target.scheme(), "http" | "https")
        || classify_institution_popup(opener_target) == InstitutionPopupDisposition::TransientBridge
    {
        return InstitutionPopupAction::KeepPopup;
    }
    let opener_location = sanitize_institution_popup_location(opener_target);
    let opener_left_transient_bridge = popup.phase == InstitutionPopupPhase::Transient
        && popup.location.origin != opener_location.origin;
    if opener_left_transient_bridge || same_canonical_popup_target(&popup.location, opener_target) {
        popup.phase = InstitutionPopupPhase::Closed;
        popup.resolution = InstitutionPopupResolution::CloseDuplicate;
        popup.code = "SIDERA_INSTITUTION_POPUP_DUPLICATE_CLOSED".to_string();
        InstitutionPopupAction::CloseDuplicate
    } else {
        InstitutionPopupAction::KeepPopup
    }
}

pub fn timeout_institution_popup_bridge(
    popup: &mut InstitutionPopupState,
    popup_id: &str,
    opener_tab_id: &str,
    generation: u64,
    now_ms: u128,
) -> InstitutionPopupAction {
    if !popup_callback_is_current(popup, popup_id, opener_tab_id, generation) {
        return InstitutionPopupAction::IgnoreStale;
    }
    if popup.phase != InstitutionPopupPhase::Transient
        || now_ms.saturating_sub(popup.created_at_ms) < INSTITUTION_POPUP_BRIDGE_TIMEOUT_MS
    {
        return InstitutionPopupAction::KeepPopup;
    }
    popup.phase = InstitutionPopupPhase::Failed;
    popup.resolution = InstitutionPopupResolution::Failed;
    popup.code = "SIDERA_INSTITUTION_POPUP_BRIDGE_TIMEOUT".to_string();
    InstitutionPopupAction::CloseFailed
}

pub fn fail_institution_popup_navigation(
    popup: &mut InstitutionPopupState,
    popup_id: &str,
    opener_tab_id: &str,
    generation: u64,
) -> InstitutionPopupAction {
    if !popup_callback_is_current(popup, popup_id, opener_tab_id, generation) {
        return InstitutionPopupAction::IgnoreStale;
    }
    popup.phase = InstitutionPopupPhase::Failed;
    popup.resolution = InstitutionPopupResolution::Failed;
    popup.code = "SIDERA_INSTITUTION_POPUP_NAVIGATION_FAILED".to_string();
    InstitutionPopupAction::CloseFailed
}

pub fn close_institution_popup(
    popup: &mut InstitutionPopupState,
    popup_id: &str,
    opener_tab_id: &str,
    generation: u64,
) -> InstitutionPopupAction {
    if !popup_callback_is_current(popup, popup_id, opener_tab_id, generation) {
        return InstitutionPopupAction::IgnoreStale;
    }
    popup.phase = InstitutionPopupPhase::Closed;
    popup.resolution = InstitutionPopupResolution::Closed;
    popup.code = "SIDERA_INSTITUTION_POPUP_CLOSED".to_string();
    InstitutionPopupAction::KeepPopup
}

pub fn institution_browser_bounds_changed(
    current: Option<InstitutionBrowserBounds>,
    next: InstitutionBrowserBounds,
) -> bool {
    current.is_none_or(|current| {
        (current.x - next.x).abs() >= INSTITUTION_BROWSER_BOUNDS_EPSILON
            || (current.y - next.y).abs() >= INSTITUTION_BROWSER_BOUNDS_EPSILON
            || (current.width - next.width).abs() >= INSTITUTION_BROWSER_BOUNDS_EPSILON
            || (current.height - next.height).abs() >= INSTITUTION_BROWSER_BOUNDS_EPSILON
    })
}

pub fn institution_browser_bounds_cause_schedules_update(
    cause: InstitutionBrowserBoundsCause,
) -> bool {
    !matches!(
        cause,
        InstitutionBrowserBoundsCause::OuterScroll | InstitutionBrowserBoundsCause::Wheel
    )
}

pub fn safe_institution_display_url(url: &Url) -> String {
    if url.as_str() == "about:blank" {
        return url.to_string();
    }
    let mut safe = url.clone();
    let _ = safe.set_username("");
    let _ = safe.set_password(None);
    safe.set_fragment(None);
    let safe_pairs = url
        .query_pairs()
        .filter(|(key, _)| {
            let key = key.to_ascii_lowercase();
            ![
                "ticket",
                "token",
                "code",
                "credential",
                "password",
                "session",
                "saml",
                "assertion",
                "auth",
            ]
            .iter()
            .any(|needle| key.contains(needle))
        })
        .take(24)
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    safe.set_query(None);
    if !safe_pairs.is_empty() {
        safe.query_pairs_mut().extend_pairs(safe_pairs);
    }
    safe.to_string()
}

pub fn sanitize_institution_download_file_name(value: &str) -> String {
    let mut output = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    output = output.trim().trim_matches('.').trim_end().to_string();
    if output.is_empty() {
        output = "download.bin".to_string();
    }
    let stem = Path::new(&output)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_uppercase();
    let windows_reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .and_then(|suffix| suffix.parse::<u8>().ok())
            .is_some_and(|number| (1..=9).contains(&number));
    if windows_reserved {
        output.insert(0, '_');
    }
    if output.chars().count() > 180 {
        let extension = Path::new(&output)
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!(".{value}"))
            .unwrap_or_default();
        output = format!(
            "{}{}",
            output.chars().take(150).collect::<String>(),
            extension
        );
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn address_parser_accepts_open_web_navigation_and_external_protocols() {
        let InstitutionBrowserTarget::Web(domain) =
            parse_institution_browser_target("example.org/paper").unwrap()
        else {
            panic!("bare domain must become a web target");
        };
        assert_eq!(domain.as_str(), "https://example.org/paper");

        let InstitutionBrowserTarget::Web(http) =
            parse_institution_browser_target("http://127.0.0.1:8080/test").unwrap()
        else {
            panic!("http must remain available to the browser kernel");
        };
        assert_eq!(http.scheme(), "http");

        assert!(matches!(
            parse_institution_browser_target("mailto:library@example.org").unwrap(),
            InstitutionBrowserTarget::External(_)
        ));
        assert!(matches!(
            parse_institution_browser_target("tel:+8602768750000").unwrap(),
            InstitutionBrowserTarget::External(_)
        ));
    }

    #[test]
    fn address_parser_rejects_executable_and_local_file_schemes() {
        for target in [
            "javascript:alert(1)",
            "file:///C:/secret.txt",
            "data:text/html,hello",
            "about:config",
        ] {
            assert_eq!(
                parse_institution_browser_target(target).unwrap_err(),
                "SIDERA_INSTITUTION_BROWSER_SCHEME_UNSUPPORTED"
            );
        }
    }

    #[test]
    fn popup_classifier_preserves_authentication_and_metaersp_bridge_semantics() {
        for target in [
            "about:blank",
            "https://cas.whu.edu.cn/authserver/login",
            "https://www.metaauth.com/242010/login.html",
            "https://example.org/oauth/callback",
        ] {
            let url = Url::parse(target).unwrap();
            assert_eq!(
                classify_institution_popup(&url),
                InstitutionPopupDisposition::AuthModal
            );
        }
        assert_eq!(
            classify_institution_popup(
                &Url::parse("https://whu.metaersp.com/loading?ticket=not-recorded#state").unwrap()
            ),
            InstitutionPopupDisposition::TransientBridge
        );
        for target in [
            "https://example.org/search?q=ai",
            "https://publisher.example/article/10.1",
            "https://example.org/download/paper.pdf",
        ] {
            let url = Url::parse(target).unwrap();
            assert_eq!(
                classify_institution_popup(&url),
                InstitutionPopupDisposition::ManagedPopup
            );
        }
    }

    fn bridge_popup() -> InstitutionPopupState {
        new_institution_popup_state(
            "popup-7".to_string(),
            "tab-2".to_string(),
            11,
            1_000,
            &Url::parse("https://whu.metaersp.com/loading?ticket=secret#fragment").unwrap(),
        )
    }

    #[test]
    fn popup_state_records_only_sanitized_origin_and_path() {
        let popup = bridge_popup();
        assert_eq!(popup.location.origin, "https://whu.metaersp.com");
        assert_eq!(popup.location.path, "/loading");
        let serialized = serde_json::to_string(&popup).unwrap();
        assert!(!serialized.contains("ticket"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("fragment"));
    }

    #[test]
    fn metaersp_bridge_closes_when_opener_reaches_cnki_or_wos_without_a_ghost_tab() {
        for final_target in [
            "https://kns.cnki.net/kcms2/article/abstract",
            "https://www.webofscience.com/wos/woscc/summary",
        ] {
            let mut popup = bridge_popup();
            assert_eq!(
                reconcile_institution_popup_with_opener(
                    &mut popup,
                    "tab-2",
                    11,
                    &Url::parse(final_target).unwrap(),
                ),
                InstitutionPopupAction::CloseDuplicate
            );
            assert_eq!(popup.phase, InstitutionPopupPhase::Closed);
            assert_eq!(popup.resolution, InstitutionPopupResolution::CloseDuplicate);
        }
    }

    #[test]
    fn metaersp_same_origin_intermediate_page_does_not_close_the_bridge() {
        let mut popup = bridge_popup();
        assert_eq!(
            reconcile_institution_popup_with_opener(
                &mut popup,
                "tab-2",
                11,
                &Url::parse("https://whu.metaersp.com/database/detail").unwrap(),
            ),
            InstitutionPopupAction::KeepPopup
        );
        assert_eq!(popup.phase, InstitutionPopupPhase::Transient);
    }

    #[test]
    fn matching_final_targets_deduplicate_after_bridge_navigation() {
        let mut popup = bridge_popup();
        let final_target = Url::parse("https://www.webofscience.com/wos/woscc/summary").unwrap();
        assert_eq!(
            observe_institution_popup_navigation(
                &mut popup,
                "popup-7",
                "tab-2",
                11,
                &final_target,
                true,
                false,
                true,
            ),
            InstitutionPopupAction::KeepPopup
        );
        assert_eq!(popup.phase, InstitutionPopupPhase::StableContent);
        assert_eq!(popup.resolution, InstitutionPopupResolution::RetainPopup);
        assert_eq!(
            reconcile_institution_popup_with_opener(&mut popup, "tab-2", 11, &final_target),
            InstitutionPopupAction::CloseDuplicate
        );
    }

    #[test]
    fn safe_get_can_migrate_but_opener_or_post_dependent_content_stays_in_popup() {
        let final_target = Url::parse("https://publisher.example/article/10.1").unwrap();
        let mut safe = bridge_popup();
        assert_eq!(
            observe_institution_popup_navigation(
                &mut safe,
                "popup-7",
                "tab-2",
                11,
                &final_target,
                true,
                true,
                false,
            ),
            InstitutionPopupAction::MigrateSafeGet
        );
        assert_eq!(safe.resolution, InstitutionPopupResolution::MigrateSafeGet);

        let mut opener_dependent = bridge_popup();
        assert_eq!(
            observe_institution_popup_navigation(
                &mut opener_dependent,
                "popup-7",
                "tab-2",
                11,
                &final_target,
                true,
                true,
                true,
            ),
            InstitutionPopupAction::KeepPopup
        );
        assert_eq!(
            opener_dependent.resolution,
            InstitutionPopupResolution::RetainPopup
        );
    }

    #[test]
    fn bridge_timeout_close_and_late_callbacks_are_generation_safe() {
        let mut popup = bridge_popup();
        assert_eq!(
            timeout_institution_popup_bridge(
                &mut popup,
                "popup-7",
                "tab-2",
                11,
                1_000 + INSTITUTION_POPUP_BRIDGE_TIMEOUT_MS - 1,
            ),
            InstitutionPopupAction::KeepPopup
        );
        assert_eq!(
            timeout_institution_popup_bridge(
                &mut popup,
                "popup-7",
                "tab-2",
                11,
                1_000 + INSTITUTION_POPUP_BRIDGE_TIMEOUT_MS,
            ),
            InstitutionPopupAction::CloseFailed
        );
        assert_eq!(popup.code, "SIDERA_INSTITUTION_POPUP_BRIDGE_TIMEOUT");
        assert_eq!(
            observe_institution_popup_navigation(
                &mut popup,
                "popup-7",
                "tab-2",
                11,
                &Url::parse("https://kns.cnki.net/").unwrap(),
                true,
                true,
                false,
            ),
            InstitutionPopupAction::IgnoreStale
        );

        let mut active = bridge_popup();
        assert_eq!(
            observe_institution_popup_navigation(
                &mut active,
                "popup-7",
                "tab-2",
                10,
                &Url::parse("https://kns.cnki.net/").unwrap(),
                true,
                true,
                false,
            ),
            InstitutionPopupAction::IgnoreStale
        );
        assert_eq!(active.phase, InstitutionPopupPhase::Transient);
    }

    #[test]
    fn popup_navigation_failure_and_close_are_terminal() {
        let mut failed = bridge_popup();
        assert_eq!(
            fail_institution_popup_navigation(&mut failed, "popup-7", "tab-2", 11),
            InstitutionPopupAction::CloseFailed
        );
        assert_eq!(failed.code, "SIDERA_INSTITUTION_POPUP_NAVIGATION_FAILED");

        let mut closed = bridge_popup();
        assert_eq!(
            close_institution_popup(&mut closed, "popup-7", "tab-2", 11),
            InstitutionPopupAction::KeepPopup
        );
        assert_eq!(closed.phase, InstitutionPopupPhase::Closed);
        assert_eq!(
            fail_institution_popup_navigation(&mut closed, "popup-7", "tab-2", 11),
            InstitutionPopupAction::IgnoreStale
        );
    }

    #[test]
    fn unchanged_subpixel_bounds_are_a_noop() {
        let current = InstitutionBrowserBounds {
            x: 100.0,
            y: 180.0,
            width: 1200.0,
            height: 720.0,
        };
        assert!(!institution_browser_bounds_changed(
            Some(current),
            InstitutionBrowserBounds {
                x: 100.5,
                y: 179.4,
                width: 1200.9,
                height: 719.2,
            }
        ));
        assert!(institution_browser_bounds_changed(
            Some(current),
            InstitutionBrowserBounds {
                x: 101.0,
                ..current
            }
        ));
        assert!(institution_browser_bounds_changed(None, current));
    }

    #[test]
    fn ordinary_wheel_and_outer_scroll_never_schedule_bounds_updates() {
        for cause in [
            InstitutionBrowserBoundsCause::OuterScroll,
            InstitutionBrowserBoundsCause::Wheel,
        ] {
            assert!(!institution_browser_bounds_cause_schedules_update(cause));
        }
        for cause in [
            InstitutionBrowserBoundsCause::InitialShow,
            InstitutionBrowserBoundsCause::VisibilityChange,
            InstitutionBrowserBoundsCause::ActiveTabChange,
            InstitutionBrowserBoundsCause::WindowResize,
            InstitutionBrowserBoundsCause::LayoutResize,
        ] {
            assert!(institution_browser_bounds_cause_schedules_update(cause));
        }
    }

    #[test]
    fn safe_display_url_removes_authentication_material_but_keeps_navigation_context() {
        let url = Url::parse(
            "https://alice:secret@example.org/search?q=ai&page=2&ticket=T1&access_token=X#fragment",
        )
        .unwrap();
        let safe = safe_institution_display_url(&url);
        assert!(safe.starts_with("https://example.org/search?"));
        assert!(safe.contains("q=ai"));
        assert!(safe.contains("page=2"));
        for secret in [
            "alice",
            "secret",
            "ticket",
            "T1",
            "access_token",
            "X",
            "fragment",
        ] {
            assert!(!safe.contains(secret));
        }
    }

    #[test]
    fn file_name_sanitizer_handles_windows_invalid_and_reserved_names() {
        assert_eq!(
            sanitize_institution_download_file_name("paper:2026?.pdf"),
            "paper_2026_.pdf"
        );
        assert_eq!(
            sanitize_institution_download_file_name("CON.pdf"),
            "_CON.pdf"
        );
        assert_eq!(
            sanitize_institution_download_file_name("  ...  "),
            "download.bin"
        );
        let long = format!("{}.pdf", "x".repeat(210));
        let sanitized = sanitize_institution_download_file_name(&long);
        assert!(sanitized.ends_with(".pdf"));
        assert!(sanitized.chars().count() <= 154);
    }
}
