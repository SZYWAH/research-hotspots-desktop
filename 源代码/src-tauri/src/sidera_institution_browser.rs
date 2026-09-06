use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use research_hotspots_core::institution_browser::{
    classify_institution_popup, close_institution_popup, fail_institution_popup_navigation,
    institution_browser_bounds_changed, new_institution_popup_state,
    observe_institution_popup_navigation, parse_institution_browser_target,
    reconcile_institution_popup_with_opener, safe_institution_display_url,
    sanitize_institution_download_file_name, timeout_institution_popup_bridge,
    InstitutionBrowserBounds, InstitutionBrowserTarget, InstitutionPopupAction,
    InstitutionPopupDisposition, InstitutionPopupPhase, InstitutionPopupState,
    INSTITUTION_POPUP_BRIDGE_TIMEOUT_MS,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::webview::{
    DownloadEvent, NewWindowFeatures, NewWindowResponse, PageLoadEvent, WebviewBuilder,
    WebviewWindowBuilder,
};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Rect, Size, State, Url,
    Webview, WebviewUrl, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

use crate::sidera_window_host::{bind_webview_window_owner, resolve_main_window_host};

const BROWSER_EVENT: &str = "sidera-institution-browser";
const DOWNLOAD_EVENT: &str = "sidera-institution-download";
const PROFILE_ID: &str = "institution-shared-v1";
const BROWSER_TAB_PREFIX: &str = "institution-browser-tab";
const BROWSER_POPUP_PREFIX: &str = "institution-browser-popup";
const BROWSER_AUTH_WINDOW_LABEL: &str = "institution-browser-auth";
const BROWSER_RESET_WEBVIEW_LABEL: &str = "institution-browser-reset";
const LEGACY_INSTITUTION_WEBVIEW_LABEL: &str = "institution-whu";
const INSTITUTION_DATA_DIRECTORY: &str = "institution-webview-v1/whu";
const INSTITUTION_DOWNLOAD_DIRECTORY: &str = "institution-downloads-v1";
const MAX_BROWSER_TABS: usize = 12;
const MAX_DOWNLOAD_RECORDS: usize = 200;

#[derive(Clone, Default)]
pub struct SideraInstitutionBrowserRuntimeState {
    inner: Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    visibility_request: Arc<Mutex<InstitutionBrowserVisibilityRequest>>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct InstitutionBrowserVisibilityRequest {
    client_request_id: u64,
    visible: bool,
}

#[derive(Default)]
struct SideraInstitutionBrowserRuntimeInner {
    tabs: BTreeMap<String, SideraInstitutionBrowserTab>,
    active_tab_id: Option<String>,
    visible: bool,
    bounds: Option<InstitutionBrowserBounds>,
    applied_bounds: Option<InstitutionBrowserBounds>,
    applied_tab_id: Option<String>,
    next_tab_id: u64,
    next_popup_id: u64,
    next_popup_generation: u64,
    next_download_id: u64,
    popups: BTreeMap<String, ManagedInstitutionPopup>,
    auth_modal_visible: bool,
    auth_modal_address: Option<String>,
    downloads: BTreeMap<String, SideraInstitutionDownloadRecord>,
    download_sources: HashMap<String, String>,
    download_webviews: HashMap<String, String>,
    pending_downloads_by_url: HashMap<String, Vec<String>>,
    cancelled_downloads: HashMap<String, bool>,
    downloads_loaded: bool,
    updated_at_ms: u128,
}

#[derive(Clone, Debug)]
struct ManagedInstitutionPopup {
    label: String,
    state: InstitutionPopupState,
    bridge_timeout_scheduled: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionBrowserContext {
    pub institution_id: Option<String>,
    pub source: Option<String>,
    pub adapter_id: Option<String>,
    pub query: Option<String>,
    pub result_id: Option<String>,
    pub result_title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionBrowserTab {
    pub id: String,
    pub label: String,
    pub title: String,
    pub address: String,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub code: String,
    pub context: Option<SideraInstitutionBrowserContext>,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SideraInstitutionDownloadStatus {
    Downloading,
    CancelRequested,
    Complete,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionDownloadProvenance {
    pub profile_id: String,
    pub tab_id: String,
    pub source_title: Option<String>,
    pub safe_source_url: String,
    pub institution_id: Option<String>,
    pub source: Option<String>,
    pub adapter_id: Option<String>,
    pub query: Option<String>,
    pub result_id: Option<String>,
    pub result_title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionDownloadRecord {
    pub id: String,
    pub status: SideraInstitutionDownloadStatus,
    pub file_name: String,
    pub file_path: String,
    pub manifest_path: String,
    pub mime_type: Option<String>,
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
    #[serde(default)]
    pub retryable: bool,
    pub code: String,
    pub message: String,
    pub provenance: SideraInstitutionDownloadProvenance,
    pub created_at_ms: u128,
    pub updated_at_ms: u128,
    pub finished_at_ms: Option<u128>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideraInstitutionBrowserState {
    pub profile_id: String,
    pub tabs: Vec<SideraInstitutionBrowserTab>,
    pub active_tab_id: Option<String>,
    pub visible: bool,
    pub auth_modal_visible: bool,
    pub auth_modal_address: Option<String>,
    pub popups: Vec<InstitutionPopupState>,
    pub downloads: Vec<SideraInstitutionDownloadRecord>,
    pub updated_at_ms: u128,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionBrowserEnsureInput {
    institution_id: String,
    #[serde(default)]
    entry: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionBrowserTabNewInput {
    institution_id: String,
    #[serde(default)]
    address: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionBrowserTabInput {
    institution_id: String,
    tab_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionBrowserNavigateInput {
    institution_id: String,
    tab_id: String,
    address: String,
    #[serde(default)]
    context: Option<SideraInstitutionBrowserContext>,
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
    client_request_id: u64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InstitutionDownloadInput {
    institution_id: String,
    download_id: String,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn ensure_whu(institution_id: &str) -> Result<(), String> {
    if institution_id == "whu" {
        Ok(())
    } else {
        Err("SIDERA_INSTITUTION_UNSUPPORTED".to_string())
    }
}

fn browser_snapshot(guard: &SideraInstitutionBrowserRuntimeInner) -> SideraInstitutionBrowserState {
    let mut tabs = guard.tabs.values().cloned().collect::<Vec<_>>();
    tabs.sort_by_key(|tab| tab.created_at_ms);
    let mut popups = guard
        .popups
        .values()
        .map(|popup| popup.state.clone())
        .collect::<Vec<_>>();
    popups.sort_by_key(|popup| popup.created_at_ms);
    let mut downloads = guard.downloads.values().cloned().collect::<Vec<_>>();
    downloads.sort_by_key(|download| std::cmp::Reverse(download.created_at_ms));
    SideraInstitutionBrowserState {
        profile_id: PROFILE_ID.to_string(),
        tabs,
        active_tab_id: guard.active_tab_id.clone(),
        visible: guard.visible,
        auth_modal_visible: guard.auth_modal_visible,
        auth_modal_address: guard.auth_modal_address.clone(),
        popups,
        downloads,
        updated_at_ms: guard.updated_at_ms,
    }
}

fn emit_browser(app: &AppHandle, guard: &SideraInstitutionBrowserRuntimeInner) {
    let _ = app.emit(BROWSER_EVENT, browser_snapshot(guard));
}

fn accept_browser_visibility_request(
    state: &SideraInstitutionBrowserRuntimeState,
    client_request_id: u64,
    visible: bool,
) -> bool {
    let mut latest = state
        .visibility_request
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if client_request_id <= latest.client_request_id {
        return false;
    }
    *latest = InstitutionBrowserVisibilityRequest {
        client_request_id,
        visible,
    };
    true
}

fn latest_browser_visibility_request(
    state: &SideraInstitutionBrowserRuntimeState,
) -> InstitutionBrowserVisibilityRequest {
    *state
        .visibility_request
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn restore_browser_main_window(app: &AppHandle) {
    if let Some(main) = app.get_window("main") {
        let _ = main.set_enabled(true);
        let _ = main.set_focus();
    }
}

fn finalize_browser_auth_modal_presentation(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
) {
    {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let changed = guard.auth_modal_visible || guard.auth_modal_address.is_some();
        guard.auth_modal_visible = false;
        guard.auth_modal_address = None;
        if changed {
            guard.updated_at_ms = now_ms();
            emit_browser(app, &guard);
        }
    }
    restore_browser_main_window(app);
}

fn emit_download(app: &AppHandle, record: &SideraInstitutionDownloadRecord) {
    let _ = app.emit(DOWNLOAD_EVENT, record);
}

fn shared_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "SIDERA_INSTITUTION_DATA_DIRECTORY_UNAVAILABLE".to_string())?
        .join(INSTITUTION_DATA_DIRECTORY);
    fs::create_dir_all(&directory)
        .map_err(|_| "SIDERA_INSTITUTION_DATA_DIRECTORY_CREATE_FAILED".to_string())?;
    Ok(directory)
}

fn clear_shared_browsing_data(app: &AppHandle, tab_labels: &[String]) -> Result<(), String> {
    for label in tab_labels {
        if let Some(webview) = app.get_webview(label) {
            if webview.clear_all_browsing_data().is_ok() {
                return Ok(());
            }
        }
    }

    if let Some(webview) = app.get_webview(LEGACY_INSTITUTION_WEBVIEW_LABEL) {
        if webview.clear_all_browsing_data().is_ok() {
            return Ok(());
        }
    }

    if let Some(existing) = app.get_webview(BROWSER_RESET_WEBVIEW_LABEL) {
        let _ = existing.close();
    }
    let data_directory = shared_data_directory(app)?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING".to_string())?;
    let blank = Url::parse("about:blank")
        .map_err(|_| "SIDERA_INSTITUTION_SESSION_CLEAR_FAILED".to_string())?;
    let webview = window
        .add_child(
            WebviewBuilder::new(BROWSER_RESET_WEBVIEW_LABEL, WebviewUrl::External(blank))
                .data_directory(data_directory)
                .focused(false),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1.0, 1.0),
        )
        .map_err(|_| "SIDERA_INSTITUTION_SESSION_CLEAR_FAILED".to_string())?;
    let _ = webview.hide();
    let clear_result = webview
        .clear_all_browsing_data()
        .map_err(|_| "SIDERA_INSTITUTION_SESSION_CLEAR_FAILED".to_string());
    let _ = webview.close();
    clear_result
}

fn download_root(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "SIDERA_INSTITUTION_DOWNLOAD_DIRECTORY_UNAVAILABLE".to_string())?
        .join(INSTITUTION_DOWNLOAD_DIRECTORY);
    fs::create_dir_all(&directory)
        .map_err(|_| "SIDERA_INSTITUTION_DOWNLOAD_DIRECTORY_CREATE_FAILED".to_string())?;
    Ok(directory)
}

fn load_download_records(app: &AppHandle, guard: &mut SideraInstitutionBrowserRuntimeInner) {
    if guard.downloads_loaded {
        return;
    }
    guard.downloads_loaded = true;
    let Ok(root) = download_root(app) else {
        return;
    };
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let manifest_path = entry.path().join("manifest.json");
        let Ok(bytes) = fs::read(&manifest_path) else {
            continue;
        };
        let Ok(mut record) = serde_json::from_slice::<SideraInstitutionDownloadRecord>(&bytes)
        else {
            continue;
        };
        record.retryable = false;
        if matches!(
            record.status,
            SideraInstitutionDownloadStatus::Downloading
                | SideraInstitutionDownloadStatus::CancelRequested
        ) {
            record.status = SideraInstitutionDownloadStatus::Failed;
            record.code = "SIDERA_INSTITUTION_DOWNLOAD_INTERRUPTED".to_string();
            record.message =
                "上次运行在下载完成前结束；来源记录已保留，可从原页面重新下载。".to_string();
            record.finished_at_ms = Some(now_ms());
            record.updated_at_ms = now_ms();
            write_download_manifest(&record);
        } else if record.status == SideraInstitutionDownloadStatus::Complete
            && !Path::new(&record.file_path).is_file()
        {
            record.status = SideraInstitutionDownloadStatus::Failed;
            record.code = "SIDERA_INSTITUTION_DOWNLOAD_FILE_MISSING".to_string();
            record.message = "下载清单仍在，但文件已不在暂存位置。".to_string();
            record.updated_at_ms = now_ms();
            write_download_manifest(&record);
        }
        guard.downloads.insert(record.id.clone(), record);
    }
    trim_download_records(guard);
}

fn suggested_download_name(url: &Url, destination: &Path) -> String {
    destination
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            url.path_segments()
                .and_then(|segments| segments.filter(|value| !value.is_empty()).next_back())
        })
        .map(sanitize_institution_download_file_name)
        .unwrap_or_else(|| "download.bin".to_string())
}

fn mime_type_from_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match extension.as_str() {
        "pdf" => "application/pdf",
        "html" | "htm" => "text/html",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        "xml" => "application/xml",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    };
    Some(mime.to_string())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|_| "SIDERA_INSTITUTION_DOWNLOAD_HASH_FAILED".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "SIDERA_INSTITUTION_DOWNLOAD_HASH_FAILED".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn write_download_manifest(record: &SideraInstitutionDownloadRecord) {
    if let Ok(value) = serde_json::to_vec_pretty(record) {
        let _ = fs::write(&record.manifest_path, value);
    }
}

fn trim_download_records(guard: &mut SideraInstitutionBrowserRuntimeInner) {
    if guard.downloads.len() <= MAX_DOWNLOAD_RECORDS {
        return;
    }
    let mut rows = guard
        .downloads
        .values()
        .map(|record| (record.created_at_ms, record.id.clone()))
        .collect::<Vec<_>>();
    rows.sort_by_key(|row| row.0);
    for (_, id) in rows
        .into_iter()
        .take(guard.downloads.len() - MAX_DOWNLOAD_RECORDS)
    {
        guard.downloads.remove(&id);
        guard.download_sources.remove(&id);
        guard.download_webviews.remove(&id);
        guard.cancelled_downloads.remove(&id);
    }
}

fn browser_download_handler(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    tab_id: String,
    webview_label: String,
) -> impl Fn(Webview, DownloadEvent<'_>) -> bool + Send + Sync + 'static {
    move |_webview, event| match event {
        DownloadEvent::Requested { url, destination } => {
            let root = match download_root(&app) {
                Ok(root) => root,
                Err(_) => return false,
            };
            let timestamp = now_ms();
            let (id, context, title) = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard.next_download_id = guard.next_download_id.saturating_add(1);
                let id = format!("download-{timestamp}-{}", guard.next_download_id);
                let tab = guard.tabs.get(&tab_id);
                (
                    id,
                    tab.and_then(|tab| tab.context.clone()),
                    tab.map(|tab| tab.title.clone())
                        .filter(|value| !value.trim().is_empty()),
                )
            };
            let folder = root.join(&id);
            if fs::create_dir_all(&folder).is_err() {
                return false;
            }
            let file_name = suggested_download_name(&url, destination);
            let file_path = folder.join(&file_name);
            let manifest_path = folder.join("manifest.json");
            *destination = file_path.clone();
            let context = context.unwrap_or_default();
            let record = SideraInstitutionDownloadRecord {
                id: id.clone(),
                status: SideraInstitutionDownloadStatus::Downloading,
                file_name,
                file_path: file_path.to_string_lossy().to_string(),
                manifest_path: manifest_path.to_string_lossy().to_string(),
                mime_type: mime_type_from_path(&file_path),
                size_bytes: None,
                sha256: None,
                retryable: true,
                code: "SIDERA_INSTITUTION_DOWNLOAD_STARTED".to_string(),
                message: "文件正在下载到 Sidera 机构下载暂存区。".to_string(),
                provenance: SideraInstitutionDownloadProvenance {
                    profile_id: PROFILE_ID.to_string(),
                    tab_id: tab_id.clone(),
                    source_title: title,
                    safe_source_url: safe_institution_display_url(&url),
                    institution_id: context.institution_id,
                    source: context.source,
                    adapter_id: context.adapter_id,
                    query: context.query,
                    result_id: context.result_id,
                    result_title: context.result_title,
                },
                created_at_ms: timestamp,
                updated_at_ms: timestamp,
                finished_at_ms: None,
            };
            write_download_manifest(&record);
            {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                guard.download_sources.insert(id.clone(), url.to_string());
                guard
                    .download_webviews
                    .insert(id.clone(), webview_label.clone());
                guard
                    .pending_downloads_by_url
                    .entry(url.to_string())
                    .or_default()
                    .push(id.clone());
                guard.downloads.insert(id, record.clone());
                guard.updated_at_ms = timestamp;
                trim_download_records(&mut guard);
                emit_browser(&app, &guard);
            }
            emit_download(&app, &record);
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            let timestamp = now_ms();
            let record = {
                let mut guard = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let id = guard
                    .pending_downloads_by_url
                    .get_mut(url.as_str())
                    .and_then(|ids| {
                        if ids.is_empty() {
                            None
                        } else {
                            Some(ids.remove(0))
                        }
                    });
                let Some(id) = id else {
                    return true;
                };
                let cancelled = guard.cancelled_downloads.remove(&id).unwrap_or(false);
                let Some(record) = guard.downloads.get_mut(&id) else {
                    return true;
                };
                let final_path = path
                    .clone()
                    .unwrap_or_else(|| PathBuf::from(&record.file_path));
                if cancelled {
                    let _ = fs::remove_file(&final_path);
                    record.status = SideraInstitutionDownloadStatus::Cancelled;
                    record.code = "SIDERA_INSTITUTION_DOWNLOAD_CANCELLED".to_string();
                    record.message = "下载已取消；未保留不完整文件。".to_string();
                } else if success && final_path.is_file() {
                    record.status = SideraInstitutionDownloadStatus::Complete;
                    record.file_path = final_path.to_string_lossy().to_string();
                    record.size_bytes = fs::metadata(&final_path).ok().map(|value| value.len());
                    record.sha256 = sha256_file(&final_path).ok();
                    record.mime_type = mime_type_from_path(&final_path);
                    record.code = "SIDERA_INSTITUTION_DOWNLOAD_COMPLETE".to_string();
                    record.message = "下载完成，文件身份与来源清单已生成。".to_string();
                } else {
                    record.status = SideraInstitutionDownloadStatus::Failed;
                    record.code = "SIDERA_INSTITUTION_DOWNLOAD_FAILED".to_string();
                    record.message = "下载失败；可从原页面重新触发。".to_string();
                }
                record.updated_at_ms = timestamp;
                record.finished_at_ms = Some(timestamp);
                let output = record.clone();
                write_download_manifest(&output);
                guard.updated_at_ms = timestamp;
                emit_browser(&app, &guard);
                output
            };
            emit_download(&app, &record);
            true
        }
        _ => true,
    }
}

fn update_tab(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    tab_id: &str,
    update: impl FnOnce(&mut SideraInstitutionBrowserTab),
) {
    let mut guard = inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(tab) = guard.tabs.get_mut(tab_id) {
        update(tab);
        tab.updated_at_ms = now_ms();
        guard.updated_at_ms = tab.updated_at_ms;
        emit_browser(app, &guard);
    }
}

fn update_history_state(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    tab_id: String,
    webview: Webview,
) {
    #[cfg(windows)]
    {
        let _ = webview.with_webview(move |platform| unsafe {
            let mut can_go_back = windows_core::BOOL(0);
            let mut can_go_forward = windows_core::BOOL(0);
            if let Ok(core) = platform.controller().CoreWebView2() {
                let _ = core.CanGoBack(&mut can_go_back);
                let _ = core.CanGoForward(&mut can_go_forward);
                update_tab(&app, &inner, &tab_id, |tab| {
                    tab.can_go_back = can_go_back.as_bool();
                    tab.can_go_forward = can_go_forward.as_bool();
                });
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = webview.eval_with_callback(
            "JSON.stringify({back: history.length > 1})",
            move |payload| {
                let decoded = serde_json::from_str::<String>(&payload).unwrap_or(payload);
                let value = serde_json::from_str::<serde_json::Value>(&decoded).unwrap_or_default();
                update_tab(&app, &inner, &tab_id, |tab| {
                    tab.can_go_back = value
                        .get("back")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false);
                    tab.can_go_forward = false;
                });
            },
        );
    }
}

fn apply_active_browser_bounds_for_visibility(
    app: &AppHandle,
    guard: &mut SideraInstitutionBrowserRuntimeInner,
    force: bool,
    visible: bool,
) -> Result<bool, String> {
    if !visible {
        return Ok(false);
    }
    let Some(bounds) = guard.bounds else {
        return Ok(false);
    };
    let Some(active_tab_id) = guard.active_tab_id.clone() else {
        return Ok(false);
    };
    if !force
        && guard.applied_tab_id.as_deref() == Some(active_tab_id.as_str())
        && !institution_browser_bounds_changed(guard.applied_bounds, bounds)
    {
        return Ok(false);
    }
    let label = guard
        .tabs
        .get(&active_tab_id)
        .map(|tab| tab.label.clone())
        .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?;
    webview
        .set_bounds(Rect {
            position: Position::Logical(LogicalPosition::new(bounds.x, bounds.y)),
            size: Size::Logical(LogicalSize::new(bounds.width, bounds.height)),
        })
        .map_err(|_| "SIDERA_INSTITUTION_BROWSER_BOUNDS_APPLY_FAILED".to_string())?;
    guard.applied_bounds = Some(bounds);
    guard.applied_tab_id = Some(active_tab_id);
    Ok(true)
}

fn apply_active_browser_bounds(
    app: &AppHandle,
    guard: &mut SideraInstitutionBrowserRuntimeInner,
    force: bool,
) -> Result<bool, String> {
    let visible = guard.visible;
    apply_active_browser_bounds_for_visibility(app, guard, force, visible)
}

fn hide_all_browser_tabs(
    app: &AppHandle,
    guard: &SideraInstitutionBrowserRuntimeInner,
) -> Result<(), String> {
    let mut failure = None;
    for tab in guard.tabs.values() {
        let Some(webview) = app.get_webview(&tab.label) else {
            continue;
        };
        let result = webview
            .hide()
            .map_err(|_| "SIDERA_INSTITUTION_BROWSER_HIDE_FAILED".to_string());
        if failure.is_none() {
            failure = result.err();
        }
    }
    failure.map_or(Ok(()), Err)
}

fn apply_browser_visibility(
    app: &AppHandle,
    guard: &SideraInstitutionBrowserRuntimeInner,
    visible: bool,
) -> Result<(), String> {
    if !visible {
        return hide_all_browser_tabs(app, guard);
    }
    let active_tab_id = guard.active_tab_id.as_deref();
    let mut hide_failure = None;
    for tab in guard.tabs.values() {
        if active_tab_id == Some(tab.id.as_str()) {
            continue;
        }
        let Some(webview) = app.get_webview(&tab.label) else {
            continue;
        };
        let result = webview
            .hide()
            .map_err(|_| "SIDERA_INSTITUTION_BROWSER_HIDE_FAILED".to_string());
        if hide_failure.is_none() {
            hide_failure = result.err();
        }
    }
    if let Some(error) = hide_failure {
        let _ = hide_all_browser_tabs(app, guard);
        return Err(error);
    }
    let Some(active_tab_id) = active_tab_id else {
        return Ok(());
    };
    let Some(label) = guard.tabs.get(active_tab_id).map(|tab| tab.label.as_str()) else {
        return Ok(());
    };
    let Some(webview) = app.get_webview(label) else {
        return Ok(());
    };
    if webview.show().is_err() {
        let _ = hide_all_browser_tabs(app, guard);
        return Err("SIDERA_INSTITUTION_BROWSER_SHOW_FAILED".to_string());
    }
    Ok(())
}

fn focus_active_browser_tab(
    app: &AppHandle,
    guard: &SideraInstitutionBrowserRuntimeInner,
) -> Result<(), String> {
    if !guard.visible {
        return Ok(());
    }
    let Some(active_tab_id) = guard.active_tab_id.as_deref() else {
        return Ok(());
    };
    let label = guard
        .tabs
        .get(active_tab_id)
        .map(|tab| tab.label.clone())
        .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?;
    app.get_webview(&label)
        .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
        .set_focus()
        .map_err(|_| "SIDERA_INSTITUTION_BROWSER_FOCUS_FAILED".to_string())
}

fn fail_managed_popup(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    popup_id: &str,
    opener_tab_id: &str,
    generation: u64,
) {
    let label = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(popup) = guard.popups.get_mut(popup_id) else {
            return;
        };
        if fail_institution_popup_navigation(&mut popup.state, popup_id, opener_tab_id, generation)
            != InstitutionPopupAction::CloseFailed
        {
            return;
        }
        let label = popup.label.clone();
        guard.updated_at_ms = now_ms();
        emit_browser(app, &guard);
        label
    };
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }
}

fn reconcile_managed_popups_for_opener(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    opener_tab_id: &str,
    opener_target: &Url,
) {
    let labels = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut labels = Vec::new();
        for popup in guard.popups.values_mut() {
            let generation = popup.state.generation;
            if reconcile_institution_popup_with_opener(
                &mut popup.state,
                opener_tab_id,
                generation,
                opener_target,
            ) == InstitutionPopupAction::CloseDuplicate
            {
                labels.push(popup.label.clone());
            }
        }
        if !labels.is_empty() {
            guard.updated_at_ms = now_ms();
            emit_browser(app, &guard);
        }
        labels
    };
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
}

fn close_managed_popups_for_opener(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    opener_tab_id: &str,
) {
    let labels = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut labels = Vec::new();
        for popup in guard.popups.values_mut() {
            let popup_id = popup.state.popup_id.clone();
            let generation = popup.state.generation;
            if close_institution_popup(&mut popup.state, &popup_id, opener_tab_id, generation)
                != InstitutionPopupAction::IgnoreStale
            {
                labels.push(popup.label.clone());
            }
        }
        if !labels.is_empty() {
            guard.updated_at_ms = now_ms();
            emit_browser(app, &guard);
        }
        labels
    };
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
}

fn spawn_managed_popup_bridge_timeout(
    app: AppHandle,
    inner: Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    popup_id: String,
    opener_tab_id: String,
    generation: u64,
    label: String,
    created_at_ms: u128,
) {
    tauri::async_runtime::spawn(async move {
        let elapsed_ms = now_ms().saturating_sub(created_at_ms);
        let remaining_ms = INSTITUTION_POPUP_BRIDGE_TIMEOUT_MS.saturating_sub(elapsed_ms);
        tokio::time::sleep(Duration::from_millis(remaining_ms as u64)).await;
        let should_close = {
            let mut guard = inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some(popup) = guard.popups.get_mut(&popup_id) else {
                return;
            };
            let should_close = timeout_institution_popup_bridge(
                &mut popup.state,
                &popup_id,
                &opener_tab_id,
                generation,
                now_ms(),
            ) == InstitutionPopupAction::CloseFailed;
            if should_close {
                guard.updated_at_ms = now_ms();
                emit_browser(&app, &guard);
            }
            should_close
        };
        if should_close {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.close();
            }
        }
    });
}

fn create_managed_browser_popup(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    opener_tab_id: &str,
    url: &Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    if !matches!(url.scheme(), "http" | "https" | "about") {
        return NewWindowResponse::Deny;
    }
    let Ok(main_host) = resolve_main_window_host(app) else {
        return NewWindowResponse::Deny;
    };
    let Ok(data_directory) = shared_data_directory(app) else {
        return NewWindowResponse::Deny;
    };
    let timestamp = now_ms();
    let (popup_id, generation, label, created_at_ms, schedule_initial_bridge_timeout) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !guard.tabs.contains_key(opener_tab_id) {
            return NewWindowResponse::Deny;
        }
        guard.next_popup_id = guard.next_popup_id.saturating_add(1);
        guard.next_popup_generation = guard.next_popup_generation.saturating_add(1);
        let popup_id = format!("popup-{}", guard.next_popup_id);
        let generation = guard.next_popup_generation;
        let label = format!("{BROWSER_POPUP_PREFIX}-{}", guard.next_popup_id);
        let popup_state = new_institution_popup_state(
            popup_id.clone(),
            opener_tab_id.to_string(),
            generation,
            timestamp,
            url,
        );
        let schedule_initial_bridge_timeout = popup_state.phase == InstitutionPopupPhase::Transient;
        guard.popups.insert(
            popup_id.clone(),
            ManagedInstitutionPopup {
                label: label.clone(),
                state: popup_state,
                bridge_timeout_scheduled: schedule_initial_bridge_timeout,
            },
        );
        guard.updated_at_ms = timestamp;
        emit_browser(app, &guard);
        (
            popup_id,
            generation,
            label,
            timestamp,
            schedule_initial_bridge_timeout,
        )
    };

    if schedule_initial_bridge_timeout {
        spawn_managed_popup_bridge_timeout(
            app.clone(),
            inner.clone(),
            popup_id.clone(),
            opener_tab_id.to_string(),
            generation,
            label.clone(),
            created_at_ms,
        );
    }

    let blank = Url::parse("about:blank").expect("about:blank must be valid");
    let navigation_app = app.clone();
    let navigation_inner = inner.clone();
    let navigation_popup_id = popup_id.clone();
    let navigation_opener_tab_id = opener_tab_id.to_string();
    let nested_app = app.clone();
    let nested_inner = inner.clone();
    let nested_opener_tab_id = opener_tab_id.to_string();
    let page_app = app.clone();
    let page_inner = inner.clone();
    let page_popup_id = popup_id.clone();
    let page_opener_tab_id = opener_tab_id.to_string();
    let page_popup_label = label.clone();
    let download_app = app.clone();
    let download_inner = inner.clone();
    let builder = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::External(blank))
        .data_directory(data_directory)
        .title("Sidera · 机构页面")
        .inner_size(1080.0, 760.0)
        .min_inner_size(720.0, 520.0)
        .center()
        .resizable(true)
        .decorations(true)
        .focused(true)
        .visible(true)
        .window_features(features)
        .on_navigation(move |target| {
            if matches!(target.scheme(), "http" | "https" | "about") {
                true
            } else {
                fail_managed_popup(
                    &navigation_app,
                    &navigation_inner,
                    &navigation_popup_id,
                    &navigation_opener_tab_id,
                    generation,
                );
                false
            }
        })
        .on_new_window(move |target, nested_features| {
            if !matches!(target.scheme(), "http" | "https" | "about") {
                return NewWindowResponse::Deny;
            }
            if classify_institution_popup(&target) == InstitutionPopupDisposition::AuthModal {
                create_browser_auth_modal(&nested_app, &nested_inner, &target, nested_features)
            } else {
                create_managed_browser_popup(
                    &nested_app,
                    &nested_inner,
                    &nested_opener_tab_id,
                    &target,
                    nested_features,
                )
            }
        })
        .on_page_load(move |webview, payload| {
            let finished = payload.event() == PageLoadEvent::Finished;
            let schedule_bridge_timeout = {
                let mut guard = page_inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let Some(popup) = guard.popups.get_mut(&page_popup_id) else {
                    return;
                };
                let action = observe_institution_popup_navigation(
                    &mut popup.state,
                    &page_popup_id,
                    &page_opener_tab_id,
                    generation,
                    payload.url(),
                    finished,
                    false,
                    true,
                );
                let schedule_bridge_timeout = action != InstitutionPopupAction::IgnoreStale
                    && popup.state.phase == InstitutionPopupPhase::Transient
                    && !popup.bridge_timeout_scheduled;
                if schedule_bridge_timeout {
                    popup.bridge_timeout_scheduled = true;
                }
                if action != InstitutionPopupAction::IgnoreStale {
                    guard.updated_at_ms = now_ms();
                    emit_browser(&page_app, &guard);
                }
                schedule_bridge_timeout
            };
            if schedule_bridge_timeout {
                spawn_managed_popup_bridge_timeout(
                    page_app.clone(),
                    page_inner.clone(),
                    page_popup_id.clone(),
                    page_opener_tab_id.clone(),
                    generation,
                    page_popup_label.clone(),
                    created_at_ms,
                );
            }
            if finished && payload.url().as_str() != "about:blank" {
                crate::sidera_institution_runtime::observe_shared_browser_page(
                    &page_app,
                    &webview.as_ref().clone(),
                );
            }
        })
        .on_download(browser_download_handler(
            download_app,
            download_inner,
            opener_tab_id.to_string(),
            label.clone(),
        ));
    let builder = match bind_webview_window_owner(builder, &main_host) {
        Ok(builder) => builder,
        Err(_) => {
            fail_managed_popup(app, inner, &popup_id, opener_tab_id, generation);
            return NewWindowResponse::Deny;
        }
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(_) => {
            fail_managed_popup(app, inner, &popup_id, opener_tab_id, generation);
            return NewWindowResponse::Deny;
        }
    };

    let close_app = app.clone();
    let close_inner = inner.clone();
    let close_popup_id = popup_id.clone();
    let close_opener_tab_id = opener_tab_id.to_string();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            let mut guard = close_inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some(popup) = guard.popups.get_mut(&close_popup_id) else {
                return;
            };
            if close_institution_popup(
                &mut popup.state,
                &close_popup_id,
                &close_opener_tab_id,
                generation,
            ) != InstitutionPopupAction::IgnoreStale
            {
                guard.updated_at_ms = now_ms();
                emit_browser(&close_app, &guard);
            }
        }
    });

    NewWindowResponse::Create { window }
}

fn create_browser_auth_modal(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    url: &Url,
    features: NewWindowFeatures,
) -> NewWindowResponse<tauri::Wry> {
    if let Some(existing) = app.get_webview_window(BROWSER_AUTH_WINDOW_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return NewWindowResponse::Deny;
    }
    if !matches!(url.scheme(), "http" | "https" | "about") {
        return NewWindowResponse::Deny;
    }
    let Ok(main_host) = resolve_main_window_host(app) else {
        return NewWindowResponse::Deny;
    };
    let Ok(data_directory) = shared_data_directory(app) else {
        return NewWindowResponse::Deny;
    };
    let blank = Url::parse("about:blank").expect("about:blank must be valid");
    let page_app = app.clone();
    let page_inner = inner.clone();
    let nested_app = app.clone();
    let download_app = app.clone();
    let download_inner = inner.clone();
    let builder =
        WebviewWindowBuilder::new(app, BROWSER_AUTH_WINDOW_LABEL, WebviewUrl::External(blank))
            .data_directory(data_directory)
            .title("Sidera · 机构认证")
            .inner_size(960.0, 720.0)
            .min_inner_size(720.0, 560.0)
            .center()
            .resizable(true)
            .decorations(true)
            .focused(false)
            .visible(false)
            .window_features(features)
            .on_navigation(|target| matches!(target.scheme(), "http" | "https" | "about"))
            .on_new_window(move |target, _features| {
                if matches!(target.scheme(), "http" | "https") {
                    if let Some(modal) = nested_app.get_webview_window(BROWSER_AUTH_WINDOW_LABEL) {
                        let _ = modal.navigate(target);
                    }
                }
                NewWindowResponse::Deny
            })
            .on_page_load(move |webview, payload| {
                if payload.event() != PageLoadEvent::Finished
                    || payload.url().as_str() == "about:blank"
                {
                    return;
                }
                let safe_address = safe_institution_display_url(payload.url());
                {
                    let mut guard = page_inner
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    guard.auth_modal_address = Some(safe_address);
                    guard.updated_at_ms = now_ms();
                    emit_browser(&page_app, &guard);
                }
                crate::sidera_institution_runtime::observe_shared_browser_page(
                    &page_app,
                    &webview.as_ref().clone(),
                );
            })
            .on_download(browser_download_handler(
                download_app,
                download_inner,
                "auth-modal".to_string(),
                BROWSER_AUTH_WINDOW_LABEL.to_string(),
            ));
    let builder = match bind_webview_window_owner(builder, &main_host) {
        Ok(builder) => builder,
        Err(_) => return NewWindowResponse::Deny,
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(_) => return NewWindowResponse::Deny,
    };
    {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.auth_modal_visible = true;
        guard.auth_modal_address = Some(safe_institution_display_url(url));
        guard.updated_at_ms = now_ms();
        emit_browser(app, &guard);
    }
    let close_app = app.clone();
    let close_inner = inner.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            finalize_browser_auth_modal_presentation(&close_app, &close_inner);
        }
    });
    if window.show().is_err() || window.set_focus().is_err() {
        let _ = window.close();
        finalize_browser_auth_modal_presentation(app, inner);
        return NewWindowResponse::Deny;
    }
    NewWindowResponse::Create { window }
}

pub(crate) fn close_browser_auth_modal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(BROWSER_AUTH_WINDOW_LABEL) {
        let _ = window.close();
    }
    let state = app.state::<SideraInstitutionBrowserRuntimeState>();
    finalize_browser_auth_modal_presentation(app, &state.inner);
}

async fn create_browser_tab(
    app: &AppHandle,
    inner: &Arc<Mutex<SideraInstitutionBrowserRuntimeInner>>,
    url: Url,
    context: Option<SideraInstitutionBrowserContext>,
    select: bool,
) -> Result<SideraInstitutionBrowserState, String> {
    let data_directory = shared_data_directory(app)?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "SIDERA_INSTITUTION_MAIN_WINDOW_MISSING".to_string())?;
    let timestamp = now_ms();
    let (tab_id, label) = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.tabs.len() >= MAX_BROWSER_TABS {
            return Err("SIDERA_INSTITUTION_BROWSER_TAB_LIMIT".to_string());
        }
        guard.next_tab_id = guard.next_tab_id.saturating_add(1);
        let tab_id = format!("tab-{}", guard.next_tab_id);
        let label = format!("{BROWSER_TAB_PREFIX}-{}", guard.next_tab_id);
        (tab_id, label)
    };
    let navigation_app = app.clone();
    let popup_app = app.clone();
    let popup_inner = inner.clone();
    let popup_opener_tab_id = tab_id.clone();
    let page_app = app.clone();
    let page_inner = inner.clone();
    let page_tab_id = tab_id.clone();
    let title_app = app.clone();
    let title_inner = inner.clone();
    let title_tab_id = tab_id.clone();
    let download_app = app.clone();
    let download_inner = inner.clone();
    let download_tab_id = tab_id.clone();
    let download_label = label.clone();
    let builder = WebviewBuilder::new(label.clone(), WebviewUrl::External(url.clone()))
        .data_directory(data_directory)
        .focused(false)
        .on_navigation(move |target| match target.scheme() {
            "http" | "https" | "about" => true,
            "mailto" | "tel" => {
                let _ = navigation_app
                    .opener()
                    .open_url(target.as_str(), None::<String>);
                false
            }
            _ => false,
        })
        .on_new_window(move |target, features| {
            if !matches!(target.scheme(), "http" | "https" | "about") {
                return NewWindowResponse::Deny;
            }
            if classify_institution_popup(&target) == InstitutionPopupDisposition::AuthModal {
                create_browser_auth_modal(&popup_app, &popup_inner, &target, features)
            } else {
                create_managed_browser_popup(
                    &popup_app,
                    &popup_inner,
                    &popup_opener_tab_id,
                    &target,
                    features,
                )
            }
        })
        .on_page_load(move |webview, payload| {
            let address = safe_institution_display_url(payload.url());
            let finished = payload.event() == PageLoadEvent::Finished;
            update_tab(&page_app, &page_inner, &page_tab_id, |tab| {
                tab.address = address;
                tab.loading = !finished;
                tab.code = if finished {
                    "SIDERA_INSTITUTION_BROWSER_PAGE_READY".to_string()
                } else {
                    "SIDERA_INSTITUTION_BROWSER_LOADING".to_string()
                };
            });
            if finished {
                reconcile_managed_popups_for_opener(
                    &page_app,
                    &page_inner,
                    &page_tab_id,
                    payload.url(),
                );
                update_history_state(
                    page_app.clone(),
                    page_inner.clone(),
                    page_tab_id.clone(),
                    webview.clone(),
                );
                crate::sidera_institution_runtime::observe_shared_browser_page(&page_app, &webview);
            }
        })
        .on_document_title_changed(move |_webview, title| {
            update_tab(&title_app, &title_inner, &title_tab_id, |tab| {
                tab.title = title.trim().chars().take(120).collect::<String>();
            });
        })
        .on_download(browser_download_handler(
            download_app,
            download_inner,
            download_tab_id,
            download_label,
        ));
    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(1.0, 1.0),
        )
        .map_err(|_| "SIDERA_INSTITUTION_BROWSER_TAB_CREATE_FAILED".to_string())?;
    let state = {
        let mut guard = inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.tabs.insert(
            tab_id.clone(),
            SideraInstitutionBrowserTab {
                id: tab_id.clone(),
                label: label.clone(),
                title: url.host_str().unwrap_or("新标签页").to_string(),
                address: safe_institution_display_url(&url),
                loading: true,
                can_go_back: false,
                can_go_forward: false,
                code: "SIDERA_INSTITUTION_BROWSER_LOADING".to_string(),
                context,
                created_at_ms: timestamp,
                updated_at_ms: timestamp,
            },
        );
        let became_active = select || guard.active_tab_id.is_none();
        if became_active {
            guard.active_tab_id = Some(tab_id.clone());
        }
        guard.updated_at_ms = timestamp;
        if became_active {
            let _ = apply_active_browser_bounds(app, &mut guard, true)?;
        }
        apply_browser_visibility(app, &guard, guard.visible)?;
        if became_active {
            focus_active_browser_tab(app, &guard)?;
        }
        emit_browser(app, &guard);
        browser_snapshot(&guard)
    };
    if !state.visible || state.active_tab_id.as_deref() != Some(tab_id.as_str()) {
        let _ = webview.hide();
    }
    Ok(state)
}

async fn default_entry(_app: &AppHandle, entry: &str) -> Result<Url, String> {
    match entry {
        "blank" => Url::parse("about:blank")
            .map_err(|_| "SIDERA_INSTITUTION_BROWSER_ADDRESS_INVALID".to_string()),
        "library-home" => {
            Url::parse(research_hotspots_core::institution_probe::WHU_LIBRARY_HOME_URL)
                .map_err(|_| "SIDERA_INSTITUTION_LIBRARY_ENTRY_INVALID".to_string())
        }
        "database-sso" => {
            let value = tauri::async_runtime::spawn_blocking(crate::probe_whu_institution)
                .await
                .map_err(|_| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())?
                .map_err(|_| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())?
                .navigation_targets
                .into_iter()
                .find(|target| target.id == "database-directory")
                .map(|target| target.open_url)
                .ok_or_else(|| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())?;
            Url::parse(&value).map_err(|_| "SIDERA_INSTITUTION_SSO_ROUTE_UNRESOLVED".to_string())
        }
        _ => Err("SIDERA_INSTITUTION_BROWSER_ENTRY_INVALID".to_string()),
    }
}

pub async fn open_url_in_browser(
    app: &AppHandle,
    state: &SideraInstitutionBrowserRuntimeState,
    url: &str,
    context: Option<SideraInstitutionBrowserContext>,
    new_tab: bool,
) -> Result<SideraInstitutionBrowserState, String> {
    let target = match parse_institution_browser_target(url)? {
        InstitutionBrowserTarget::Web(url) => url,
        InstitutionBrowserTarget::External(url) => {
            app.opener()
                .open_url(url.as_str(), None::<String>)
                .map_err(|_| "SIDERA_INSTITUTION_BROWSER_EXTERNAL_OPEN_FAILED".to_string())?;
            let guard = state
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            return Ok(browser_snapshot(&guard));
        }
    };
    let active = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if new_tab {
            None
        } else {
            guard.active_tab_id.clone()
        }
    };
    if let Some(tab_id) = active {
        let label = {
            let mut guard = state
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let tab = guard
                .tabs
                .get_mut(&tab_id)
                .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?;
            tab.context = context;
            tab.loading = true;
            tab.code = "SIDERA_INSTITUTION_BROWSER_LOADING".to_string();
            tab.label.clone()
        };
        app.get_webview(&label)
            .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
            .navigate(target)
            .map_err(|_| "SIDERA_INSTITUTION_BROWSER_NAVIGATION_FAILED".to_string())?;
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        emit_browser(app, &guard);
        Ok(browser_snapshot(&guard))
    } else {
        create_browser_tab(app, &state.inner, target, context, true).await
    }
}

#[tauri::command]
pub async fn sidera_institution_browser_ensure(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserEnsureInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let entry = input.entry.as_deref();
    let has_tabs = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        load_download_records(&app, &mut guard);
        !guard.tabs.is_empty()
    };
    if has_tabs {
        if let Some(entry) = entry {
            let url = default_entry(&app, entry).await?;
            return open_url_in_browser(&app, state.inner(), url.as_str(), None, false).await;
        }
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        return Ok(browser_snapshot(&guard));
    }
    let url = default_entry(&app, entry.unwrap_or("library-home")).await?;
    create_browser_tab(&app, &state.inner, url, None, true).await
}

#[tauri::command]
pub async fn sidera_institution_browser_state(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserEnsureInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    load_download_records(&app, &mut guard);
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_tab_new(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabNewInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let target = input.address.as_deref().unwrap_or("about:blank");
    let url = match parse_institution_browser_target(target)? {
        InstitutionBrowserTarget::Web(url) => url,
        InstitutionBrowserTarget::External(url) => {
            app.opener()
                .open_url(url.as_str(), None::<String>)
                .map_err(|_| "SIDERA_INSTITUTION_BROWSER_EXTERNAL_OPEN_FAILED".to_string())?;
            let guard = state
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            return Ok(browser_snapshot(&guard));
        }
    };
    create_browser_tab(&app, &state.inner, url, None, true).await
}

#[tauri::command]
pub async fn sidera_institution_browser_tab_select(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !guard.tabs.contains_key(&input.tab_id) {
        return Err("SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string());
    }
    guard.active_tab_id = Some(input.tab_id);
    guard.updated_at_ms = now_ms();
    let _ = apply_active_browser_bounds(&app, &mut guard, true)?;
    apply_browser_visibility(&app, &guard, guard.visible)?;
    focus_active_browser_tab(&app, &guard)?;
    emit_browser(&app, &guard);
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_tab_close(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let (label, keep_last) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let tab = guard
            .tabs
            .get(&input.tab_id)
            .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?;
        (tab.label.clone(), guard.tabs.len() == 1)
    };
    close_managed_popups_for_opener(&app, &state.inner, &input.tab_id);
    if keep_last {
        app.get_webview(&label)
            .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
            .navigate(Url::parse("about:blank").expect("about:blank must be valid"))
            .map_err(|_| "SIDERA_INSTITUTION_BROWSER_NAVIGATION_FAILED".to_string())?;
        update_tab(&app, &state.inner, &input.tab_id, |tab| {
            tab.title = "新标签页".to_string();
            tab.address = "about:blank".to_string();
            tab.context = None;
        });
    } else {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.hide();
            let _ = webview.close();
        }
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.tabs.remove(&input.tab_id);
        if guard.active_tab_id.as_deref() == Some(input.tab_id.as_str()) {
            guard.active_tab_id = guard
                .tabs
                .values()
                .max_by_key(|tab| tab.created_at_ms)
                .map(|tab| tab.id.clone());
        }
        guard.updated_at_ms = now_ms();
        let _ = apply_active_browser_bounds(&app, &mut guard, true)?;
        apply_browser_visibility(&app, &guard, guard.visible)?;
        focus_active_browser_tab(&app, &guard)?;
        emit_browser(&app, &guard);
    }
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_navigate(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserNavigateInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let (label, context) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let tab = guard
            .tabs
            .get(&input.tab_id)
            .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?;
        (tab.label.clone(), input.context)
    };
    match parse_institution_browser_target(&input.address)? {
        InstitutionBrowserTarget::External(url) => {
            app.opener()
                .open_url(url.as_str(), None::<String>)
                .map_err(|_| "SIDERA_INSTITUTION_BROWSER_EXTERNAL_OPEN_FAILED".to_string())?;
        }
        InstitutionBrowserTarget::Web(url) => {
            update_tab(&app, &state.inner, &input.tab_id, |tab| {
                tab.loading = true;
                tab.context = context;
                tab.code = "SIDERA_INSTITUTION_BROWSER_LOADING".to_string();
            });
            app.get_webview(&label)
                .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
                .navigate(url)
                .map_err(|_| "SIDERA_INSTITUTION_BROWSER_NAVIGATION_FAILED".to_string())?;
        }
    }
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(browser_snapshot(&guard))
}

async fn browser_history_action(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
    script: &'static str,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let label = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .tabs
            .get(&input.tab_id)
            .map(|tab| tab.label.clone())
            .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
    };
    app.get_webview(&label)
        .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
        .eval(script)
        .map_err(|_| "SIDERA_INSTITUTION_BROWSER_HISTORY_FAILED".to_string())?;
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_back(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
) -> Result<SideraInstitutionBrowserState, String> {
    browser_history_action(app, state, input, "history.back()").await
}

#[tauri::command]
pub async fn sidera_institution_browser_forward(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
) -> Result<SideraInstitutionBrowserState, String> {
    browser_history_action(app, state, input, "history.forward()").await
}

#[tauri::command]
pub async fn sidera_institution_browser_reload(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let label = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .tabs
            .get(&input.tab_id)
            .map(|tab| tab.label.clone())
            .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
    };
    app.get_webview(&label)
        .ok_or_else(|| "SIDERA_INSTITUTION_BROWSER_TAB_STALE".to_string())?
        .reload()
        .map_err(|_| "SIDERA_INSTITUTION_BROWSER_RELOAD_FAILED".to_string())?;
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_stop(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserTabInput,
) -> Result<SideraInstitutionBrowserState, String> {
    browser_history_action(app, state, input, "window.stop()").await
}

#[tauri::command]
pub async fn sidera_institution_browser_shell_set_bounds(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserBoundsInput,
) -> Result<SideraInstitutionBrowserState, String> {
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
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let next = InstitutionBrowserBounds {
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
    };
    if !institution_browser_bounds_changed(guard.bounds, next) {
        return Ok(browser_snapshot(&guard));
    }
    let previous_bounds = guard.bounds;
    guard.bounds = Some(next);
    guard.updated_at_ms = now_ms();
    if let Err(error) = apply_active_browser_bounds(&app, &mut guard, false) {
        guard.bounds = previous_bounds;
        return Err(error);
    }
    emit_browser(&app, &guard);
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_shell_set_visible(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserVisibleInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    if input.client_request_id == 0 {
        return Err("SIDERA_INSTITUTION_BROWSER_VISIBILITY_REQUEST_INVALID".to_string());
    }
    let accepted =
        accept_browser_visibility_request(&state, input.client_request_id, input.visible);
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !accepted {
        let latest = latest_browser_visibility_request(&state);
        if !input.visible && !latest.visible {
            apply_browser_visibility(&app, &guard, false)?;
        }
        return Ok(browser_snapshot(&guard));
    }
    let latest = latest_browser_visibility_request(&state);
    if latest.client_request_id != input.client_request_id {
        if !input.visible && !latest.visible {
            apply_browser_visibility(&app, &guard, false)?;
        }
        return Ok(browser_snapshot(&guard));
    }
    if input.visible {
        let _ = apply_active_browser_bounds_for_visibility(&app, &mut guard, true, true)?;
    }
    apply_browser_visibility(&app, &guard, input.visible)?;
    let latest = state
        .visibility_request
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if latest.client_request_id != input.client_request_id {
        drop(latest);
        if input.visible {
            apply_browser_visibility(&app, &guard, false)?;
        }
        return Ok(browser_snapshot(&guard));
    }
    guard.visible = input.visible;
    guard.updated_at_ms = now_ms();
    drop(latest);
    if guard.visible {
        let _ = focus_active_browser_tab(&app, &guard);
    }
    emit_browser(&app, &guard);
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_auth_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserEnsureInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    if let Some(window) = app.get_webview_window(BROWSER_AUTH_WINDOW_LABEL) {
        let _ = window.close();
    }
    finalize_browser_auth_modal_presentation(&app, &state.inner);
    let guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_browser_reset(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserEnsureInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    if let Some(window) = app.get_webview_window(BROWSER_AUTH_WINDOW_LABEL) {
        let _ = window.close();
    }
    finalize_browser_auth_modal_presentation(&app, &state.inner);
    let (labels, popup_labels) = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (
            guard
                .tabs
                .values()
                .map(|tab| tab.label.clone())
                .collect::<Vec<_>>(),
            guard
                .popups
                .values()
                .map(|popup| popup.label.clone())
                .collect::<Vec<_>>(),
        )
    };
    for label in popup_labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }
    clear_shared_browsing_data(&app, &labels)?;
    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.hide();
            let _ = webview.close();
        }
    }
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.tabs.clear();
    guard.popups.clear();
    guard.active_tab_id = None;
    guard.visible = false;
    guard.applied_bounds = None;
    guard.applied_tab_id = None;
    guard.auth_modal_visible = false;
    guard.auth_modal_address = None;
    guard.download_webviews.clear();
    guard.updated_at_ms = now_ms();
    emit_browser(&app, &guard);
    Ok(browser_snapshot(&guard))
}

#[tauri::command]
pub async fn sidera_institution_download_list(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionBrowserEnsureInput,
) -> Result<Vec<SideraInstitutionDownloadRecord>, String> {
    ensure_whu(&input.institution_id)?;
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    load_download_records(&app, &mut guard);
    Ok(browser_snapshot(&guard).downloads)
}

pub(crate) fn completed_institution_download(
    app: &AppHandle,
    state: &SideraInstitutionBrowserRuntimeState,
    download_id: &str,
) -> Result<SideraInstitutionDownloadRecord, String> {
    let mut guard = state
        .inner
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    load_download_records(app, &mut guard);
    let record = guard
        .downloads
        .get(download_id)
        .cloned()
        .ok_or_else(|| "SIDERA_INSTITUTION_DOWNLOAD_STALE".to_string())?;
    if record.status != SideraInstitutionDownloadStatus::Complete
        || !Path::new(&record.file_path).is_file()
    {
        return Err("SIDERA_INSTITUTION_DOWNLOAD_FILE_UNAVAILABLE".to_string());
    }
    Ok(record)
}

#[tauri::command]
pub async fn sidera_institution_download_cancel(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionDownloadInput,
) -> Result<SideraInstitutionDownloadRecord, String> {
    ensure_whu(&input.institution_id)?;
    let (record, label) = {
        let mut guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let label = guard.download_webviews.get(&input.download_id).cloned();
        guard
            .cancelled_downloads
            .insert(input.download_id.clone(), true);
        let record = guard
            .downloads
            .get_mut(&input.download_id)
            .ok_or_else(|| "SIDERA_INSTITUTION_DOWNLOAD_STALE".to_string())?;
        if record.status != SideraInstitutionDownloadStatus::Downloading {
            return Err("SIDERA_INSTITUTION_DOWNLOAD_NOT_ACTIVE".to_string());
        }
        record.status = SideraInstitutionDownloadStatus::CancelRequested;
        record.code = "SIDERA_INSTITUTION_DOWNLOAD_CANCEL_REQUESTED".to_string();
        record.message = "已请求停止下载；完成回调到达后将删除不完整文件。".to_string();
        record.updated_at_ms = now_ms();
        write_download_manifest(record);
        (record.clone(), label)
    };
    if let Some(label) = label {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.eval("window.stop()");
        }
    }
    {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        emit_browser(&app, &guard);
    }
    emit_download(&app, &record);
    Ok(record)
}

#[tauri::command]
pub async fn sidera_institution_download_retry(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionDownloadInput,
) -> Result<SideraInstitutionBrowserState, String> {
    ensure_whu(&input.institution_id)?;
    let (url, context) =
        {
            let guard = state
                .inner
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let url = guard
                .download_sources
                .get(&input.download_id)
                .cloned()
                .ok_or_else(|| "SIDERA_INSTITUTION_DOWNLOAD_STALE".to_string())?;
            let context = guard.downloads.get(&input.download_id).map(|record| {
                SideraInstitutionBrowserContext {
                    institution_id: record.provenance.institution_id.clone(),
                    source: record.provenance.source.clone(),
                    adapter_id: record.provenance.adapter_id.clone(),
                    query: record.provenance.query.clone(),
                    result_id: record.provenance.result_id.clone(),
                    result_title: record.provenance.result_title.clone(),
                }
            });
            (url, context)
        };
    open_url_in_browser(&app, state.inner(), &url, context, false).await
}

#[tauri::command]
pub async fn sidera_institution_download_open(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionDownloadInput,
) -> Result<SideraInstitutionDownloadRecord, String> {
    ensure_whu(&input.institution_id)?;
    let record = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .downloads
            .get(&input.download_id)
            .cloned()
            .ok_or_else(|| "SIDERA_INSTITUTION_DOWNLOAD_STALE".to_string())?
    };
    if record.status != SideraInstitutionDownloadStatus::Complete
        || !Path::new(&record.file_path).is_file()
    {
        return Err("SIDERA_INSTITUTION_DOWNLOAD_FILE_UNAVAILABLE".to_string());
    }
    app.opener()
        .open_path(record.file_path.clone(), None::<String>)
        .map_err(|_| "SIDERA_INSTITUTION_DOWNLOAD_OPEN_FAILED".to_string())?;
    Ok(record)
}

#[tauri::command]
pub async fn sidera_institution_download_reveal(
    app: AppHandle,
    state: State<'_, SideraInstitutionBrowserRuntimeState>,
    input: InstitutionDownloadInput,
) -> Result<SideraInstitutionDownloadRecord, String> {
    ensure_whu(&input.institution_id)?;
    let record = {
        let guard = state
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard
            .downloads
            .get(&input.download_id)
            .cloned()
            .ok_or_else(|| "SIDERA_INSTITUTION_DOWNLOAD_STALE".to_string())?
    };
    if !Path::new(&record.file_path).exists() {
        return Err("SIDERA_INSTITUTION_DOWNLOAD_FILE_UNAVAILABLE".to_string());
    }
    app.opener()
        .reveal_item_in_dir(&record.file_path)
        .map_err(|_| "SIDERA_INSTITUTION_DOWNLOAD_REVEAL_FAILED".to_string())?;
    Ok(record)
}
