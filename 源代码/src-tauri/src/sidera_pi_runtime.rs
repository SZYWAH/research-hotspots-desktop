use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, Weak};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const PI_PACKAGE_VERSION: &str = "0.82.1";
const PI_PROVIDER_ID: &str = "sidera-openai-compatible";
const PI_EVENT_NAME: &str = "sidera-pi-event";
const MAX_JSONL_RECORD_BYTES: usize = 1024 * 1024;
const MAX_TURN_OUTPUT_BYTES: usize = 8 * 1024 * 1024;
const MAX_PROMPT_BYTES: usize = 64 * 1024;
const MAX_DIAGNOSTIC_BYTES: usize = 16 * 1024;

const SIDERA_PI_SYSTEM_PROMPT: &str = r#"You are Sidera, a research conversation assistant. Reply in the same language as the user unless they ask otherwise. This runtime currently has no access to the local paper library, databases, files, shell, web, tools, extensions, skills, prompt templates, or context files. Never claim that you searched or read local literature. Never invent paper IDs, citation numbers, local evidence, or tool results. If the user asks for unavailable local evidence, state that this capability is not connected yet."#;

#[derive(Clone, Debug)]
pub struct PiLaunchConfig {
    pub project_id: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub package_json_path: PathBuf,
    pub cache_root: PathBuf,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraPiSubmitPromptInput {
    pub session_id: String,
    pub message_id: String,
    pub prompt: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraPiAbortTurnInput {
    pub session_id: String,
    pub message_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraPiSessionInfo {
    pub session_id: String,
    pub provider: String,
    pub model: String,
    pub package_version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraPiRuntimeStatus {
    pub phase: String,
    pub session_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub active_message_id: Option<String>,
    pub revision: u64,
    pub process_alive: bool,
    pub output_bytes: usize,
    pub stderr_bytes: usize,
    pub last_error_code: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SideraPiUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum SideraPiEventPayload {
    SessionReady {
        session_id: String,
        provider: String,
        model: String,
    },
    TurnStart {
        session_id: String,
        message_id: String,
    },
    AssistantDelta {
        session_id: String,
        message_id: String,
        delta: String,
    },
    TurnComplete {
        session_id: String,
        message_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<SideraPiUsage>,
    },
    TurnCancelled {
        session_id: String,
        message_id: String,
    },
    RuntimeError {
        #[serde(skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
        code: String,
        message: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SideraPiEventEnvelope {
    sequence: u64,
    revision: u64,
    #[serde(flatten)]
    payload: SideraPiEventPayload,
}

#[derive(Debug)]
struct ActiveTurn {
    message_id: String,
    request_id: String,
    revision: u64,
    output_bytes: usize,
    abort_requested: bool,
    terminal_error: Option<String>,
}

struct RuntimeProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    session: SideraPiSessionInfo,
    fingerprint: String,
    epoch: u64,
    active_turn: Option<ActiveTurn>,
    alive: bool,
    blocked: bool,
    output_bytes: usize,
    stderr_bytes: usize,
}

struct RuntimeInner {
    process: Option<RuntimeProcess>,
    revision: u64,
    event_sequence: u64,
    epoch: u64,
    last_error_code: Option<String>,
}

impl Default for RuntimeInner {
    fn default() -> Self {
        Self {
            process: None,
            revision: 0,
            event_sequence: 0,
            epoch: 0,
            last_error_code: None,
        }
    }
}

#[derive(Default)]
pub struct SideraPiRuntimeState {
    inner: Arc<Mutex<RuntimeInner>>,
}

impl Drop for SideraPiRuntimeState {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.inner.lock() {
            stop_locked(&mut inner, None, false);
        }
    }
}

impl SideraPiRuntimeState {
    pub fn start_session(
        &self,
        app: &AppHandle,
        config: PiLaunchConfig,
    ) -> Result<SideraPiSessionInfo, String> {
        let project_id = config.project_id.trim();
        let provider = config.provider.trim().to_ascii_lowercase();
        let model = config.model.trim();
        let api_key = config.api_key.trim();
        if project_id.is_empty() {
            return Err("SIDERA_PI_PROJECT_REQUIRED".to_string());
        }
        if !matches!(provider.as_str(), "deepseek" | "openai-compatible") {
            return Err("SIDERA_PI_PROVIDER_UNSUPPORTED".to_string());
        }
        if model.is_empty() {
            return Err("SIDERA_PI_MODEL_REQUIRED".to_string());
        }
        if api_key.is_empty() {
            return Err("SIDERA_PI_CREDENTIAL_REQUIRED".to_string());
        }

        let base_url = normalize_openai_base_url(&config.base_url)?;
        let pi_bin = resolve_pi_bin(&config.package_json_path)?;
        let fingerprint = format!("{project_id}\0{provider}\0{base_url}\0{model}");

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "SIDERA_PI_RUNTIME_LOCKED".to_string())?;
        if let Some(process) = inner.process.as_mut() {
            let exited = process
                .child
                .try_wait()
                .map_err(|error| format!("SIDERA_PI_PROCESS_STATUS_FAILED:{error}"))?
                .is_some();
            if !exited && process.alive && !process.blocked && process.fingerprint == fingerprint {
                return Ok(process.session.clone());
            }
        }
        stop_locked(&mut inner, Some(app), true);

        inner.epoch = inner.epoch.saturating_add(1);
        let epoch = inner.epoch;
        let session_id = make_session_id(epoch);
        let session_dir = config.cache_root.join("sidera-pi").join(&session_id);
        fs::create_dir_all(&session_dir)
            .map_err(|error| format!("SIDERA_PI_CACHE_CREATE_FAILED:{error}"))?;
        write_models_json(&session_dir, &base_url, model)?;

        let mut command = Command::new("node");
        command
            .arg(&pi_bin)
            .args([
                "--mode",
                "rpc",
                "--no-session",
                "--no-tools",
                "--no-extensions",
                "--no-skills",
                "--no-prompt-templates",
                "--no-context-files",
                "--no-approve",
                "--provider",
                PI_PROVIDER_ID,
                "--model",
                model,
                "--system-prompt",
                SIDERA_PI_SYSTEM_PROMPT,
            ])
            .current_dir(&session_dir)
            .env("PI_CODING_AGENT_DIR", &session_dir)
            .env("SIDERA_PI_API_KEY", api_key)
            .env("PI_SKIP_VERSION_CHECK", "1")
            .env("PI_TELEMETRY", "0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }

        let mut child = command
            .spawn()
            .map_err(|error| format!("SIDERA_PI_PROCESS_START_FAILED:{error}"))?;
        let stdin = Arc::new(Mutex::new(
            child.stdin.take().ok_or("SIDERA_PI_STDIN_UNAVAILABLE")?,
        ));
        let stdout = child.stdout.take().ok_or("SIDERA_PI_STDOUT_UNAVAILABLE")?;
        let stderr = child.stderr.take().ok_or("SIDERA_PI_STDERR_UNAVAILABLE")?;
        let session = SideraPiSessionInfo {
            session_id: session_id.clone(),
            provider: provider.clone(),
            model: model.to_string(),
            package_version: PI_PACKAGE_VERSION.to_string(),
        };
        inner.process = Some(RuntimeProcess {
            child,
            stdin: stdin.clone(),
            session: session.clone(),
            fingerprint,
            epoch,
            active_turn: None,
            alive: true,
            blocked: false,
            output_bytes: 0,
            stderr_bytes: 0,
        });
        inner.last_error_code = None;
        emit_locked(
            app,
            &mut inner,
            0,
            SideraPiEventPayload::SessionReady {
                session_id,
                provider,
                model: model.to_string(),
            },
        );
        let weak = Arc::downgrade(&self.inner);
        spawn_stdout_reader(stdout, weak.clone(), app.clone(), epoch);
        spawn_stderr_reader(stderr, weak, epoch);
        Ok(session)
    }

    pub fn submit_prompt(
        &self,
        app: &AppHandle,
        input: SideraPiSubmitPromptInput,
    ) -> Result<(), String> {
        let prompt = input.prompt.trim();
        if prompt.is_empty() {
            return Err("SIDERA_PI_PROMPT_REQUIRED".to_string());
        }
        if prompt.as_bytes().len() > MAX_PROMPT_BYTES {
            return Err("SIDERA_PI_PROMPT_TOO_LARGE".to_string());
        }
        if input.message_id.trim().is_empty() {
            return Err("SIDERA_PI_MESSAGE_ID_REQUIRED".to_string());
        }
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "SIDERA_PI_RUNTIME_LOCKED".to_string())?;
        let next_revision = inner.revision.saturating_add(1);
        let (session_id, stdin, request_id) = {
            let process = inner
                .process
                .as_mut()
                .ok_or("SIDERA_PI_SESSION_NOT_STARTED")?;
            if !process.alive || process.blocked {
                return Err("SIDERA_PI_RUNTIME_UNAVAILABLE".to_string());
            }
            if process.session.session_id != input.session_id {
                return Err("SIDERA_PI_SESSION_MISMATCH".to_string());
            }
            if process.active_turn.is_some() {
                return Err("SIDERA_PI_TURN_ALREADY_ACTIVE".to_string());
            }
            let request_id = format!("prompt-{next_revision}");
            (
                process.session.session_id.clone(),
                process.stdin.clone(),
                request_id,
            )
        };
        write_jsonl(
            &stdin,
            &json!({
                "id": request_id,
                "type": "prompt",
                "message": prompt,
            }),
        )?;
        inner.revision = next_revision;
        if let Some(process) = inner.process.as_mut() {
            process.active_turn = Some(ActiveTurn {
                message_id: input.message_id.clone(),
                request_id,
                revision: next_revision,
                output_bytes: 0,
                abort_requested: false,
                terminal_error: None,
            });
        }
        emit_locked(
            app,
            &mut inner,
            next_revision,
            SideraPiEventPayload::TurnStart {
                session_id,
                message_id: input.message_id,
            },
        );
        Ok(())
    }

    pub fn abort_turn(&self, input: SideraPiAbortTurnInput) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "SIDERA_PI_RUNTIME_LOCKED".to_string())?;
        let process = inner
            .process
            .as_mut()
            .ok_or("SIDERA_PI_SESSION_NOT_STARTED")?;
        if process.session.session_id != input.session_id {
            return Err("SIDERA_PI_SESSION_MISMATCH".to_string());
        }
        let Some(turn) = process.active_turn.as_mut() else {
            return Ok(());
        };
        if turn.message_id != input.message_id {
            return Err("SIDERA_PI_MESSAGE_MISMATCH".to_string());
        }
        turn.abort_requested = true;
        write_jsonl(
            &process.stdin,
            &json!({
                "id": format!("abort-{}", turn.revision),
                "type": "abort",
            }),
        )
    }

    pub fn status(&self) -> SideraPiRuntimeStatus {
        let Ok(inner) = self.inner.lock() else {
            return SideraPiRuntimeStatus {
                phase: "error".to_string(),
                session_id: None,
                provider: None,
                model: None,
                active_message_id: None,
                revision: 0,
                process_alive: false,
                output_bytes: 0,
                stderr_bytes: 0,
                last_error_code: Some("SIDERA_PI_RUNTIME_LOCKED".to_string()),
            };
        };
        let process = inner.process.as_ref();
        let active = process.and_then(|value| value.active_turn.as_ref());
        SideraPiRuntimeStatus {
            phase: if process.map(|value| value.blocked).unwrap_or(false) {
                "error"
            } else if active.is_some() {
                "generating"
            } else if process.map(|value| value.alive).unwrap_or(false) {
                "ready"
            } else {
                "idle"
            }
            .to_string(),
            session_id: process.map(|value| value.session.session_id.clone()),
            provider: process.map(|value| value.session.provider.clone()),
            model: process.map(|value| value.session.model.clone()),
            active_message_id: active.map(|value| value.message_id.clone()),
            revision: inner.revision,
            process_alive: process.map(|value| value.alive).unwrap_or(false),
            output_bytes: process.map(|value| value.output_bytes).unwrap_or(0),
            stderr_bytes: process.map(|value| value.stderr_bytes).unwrap_or(0),
            last_error_code: inner.last_error_code.clone(),
        }
    }

    pub fn stop_session(&self, app: Option<&AppHandle>) {
        if let Ok(mut inner) = self.inner.lock() {
            stop_locked(&mut inner, app, true);
        }
    }
}

fn write_models_json(session_dir: &Path, base_url: &str, model: &str) -> Result<(), String> {
    let models = json!({
        "providers": {
            (PI_PROVIDER_ID): {
                "baseUrl": base_url,
                "api": "openai-completions",
                "apiKey": "$SIDERA_PI_API_KEY",
                "models": [{
                    "id": model,
                    "compat": {
                        "supportsDeveloperRole": false,
                        "supportsReasoningEffort": false
                    }
                }]
            }
        }
    });
    let bytes = serde_json::to_vec_pretty(&models)
        .map_err(|error| format!("SIDERA_PI_MODELS_SERIALIZE_FAILED:{error}"))?;
    fs::write(session_dir.join("models.json"), bytes)
        .map_err(|error| format!("SIDERA_PI_MODELS_WRITE_FAILED:{error}"))
}

fn normalize_openai_base_url(value: &str) -> Result<String, String> {
    let mut normalized = value.trim().trim_end_matches('/').to_string();
    if normalized.is_empty()
        || !(normalized.starts_with("https://") || normalized.starts_with("http://"))
    {
        return Err("SIDERA_PI_ENDPOINT_INVALID".to_string());
    }
    if normalized.ends_with("/chat/completions") {
        normalized.truncate(normalized.len() - "/chat/completions".len());
    }
    if !normalized.ends_with("/v1") {
        normalized.push_str("/v1");
    }
    Ok(normalized)
}

fn resolve_pi_bin(package_json_path: &Path) -> Result<PathBuf, String> {
    let bytes = fs::read(package_json_path)
        .map_err(|error| format!("SIDERA_PI_PACKAGE_NOT_FOUND:{error}"))?;
    let package: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("SIDERA_PI_PACKAGE_INVALID:{error}"))?;
    if package.get("version").and_then(Value::as_str) != Some(PI_PACKAGE_VERSION) {
        return Err("SIDERA_PI_PACKAGE_VERSION_MISMATCH".to_string());
    }
    let bin = package
        .get("bin")
        .and_then(|value| value.get("pi"))
        .and_then(Value::as_str)
        .ok_or("SIDERA_PI_PACKAGE_BIN_MISSING")?;
    let root = package_json_path
        .parent()
        .ok_or("SIDERA_PI_PACKAGE_ROOT_MISSING")?;
    let target = root.join(bin);
    if !target.is_file() {
        return Err("SIDERA_PI_PACKAGE_BIN_NOT_FOUND".to_string());
    }
    Ok(target)
}

fn make_session_id(epoch: u64) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("sidera-pi-{millis}-{epoch}")
}

fn write_jsonl(stdin: &Arc<Mutex<ChildStdin>>, value: &Value) -> Result<(), String> {
    let mut encoded = serde_json::to_vec(value)
        .map_err(|error| format!("SIDERA_PI_RPC_SERIALIZE_FAILED:{error}"))?;
    if encoded.len() > MAX_JSONL_RECORD_BYTES {
        return Err("SIDERA_PI_RPC_RECORD_TOO_LARGE".to_string());
    }
    encoded.push(b'\n');
    let mut writer = stdin
        .lock()
        .map_err(|_| "SIDERA_PI_STDIN_LOCKED".to_string())?;
    writer
        .write_all(&encoded)
        .and_then(|_| writer.flush())
        .map_err(|error| format!("SIDERA_PI_RPC_WRITE_FAILED:{error}"))
}

fn emit_locked(
    app: &AppHandle,
    inner: &mut RuntimeInner,
    revision: u64,
    payload: SideraPiEventPayload,
) {
    inner.event_sequence = inner.event_sequence.saturating_add(1);
    let _ = app.emit(
        PI_EVENT_NAME,
        SideraPiEventEnvelope {
            sequence: inner.event_sequence,
            revision,
            payload,
        },
    );
}

fn stop_locked(inner: &mut RuntimeInner, app: Option<&AppHandle>, emit_cancel: bool) {
    let Some(mut process) = inner.process.take() else {
        return;
    };
    if let Some(turn) = process.active_turn.take() {
        let _ = write_jsonl(
            &process.stdin,
            &json!({ "id": format!("stop-{}", turn.revision), "type": "abort" }),
        );
        if emit_cancel {
            if let Some(app) = app {
                emit_locked(
                    app,
                    inner,
                    turn.revision,
                    SideraPiEventPayload::TurnCancelled {
                        session_id: process.session.session_id.clone(),
                        message_id: turn.message_id,
                    },
                );
            }
        }
    }
    let _ = process.child.kill();
    let _ = process.child.wait();
}

fn spawn_stdout_reader(
    mut stdout: impl Read + Send + 'static,
    state: Weak<Mutex<RuntimeInner>>,
    app: AppHandle,
    epoch: u64,
) {
    thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        let mut pending = Vec::<u8>::new();
        loop {
            match stdout.read(&mut chunk) {
                Ok(0) => {
                    mark_process_exit(&state, &app, epoch);
                    break;
                }
                Ok(read) => {
                    pending.extend_from_slice(&chunk[..read]);
                    let records = drain_jsonl_records(&mut pending);
                    if pending.len() > MAX_JSONL_RECORD_BYTES {
                        runtime_fault(
                            &state,
                            &app,
                            epoch,
                            "SIDERA_PI_RPC_RECORD_TOO_LARGE",
                            "Pi returned an oversized JSONL record.",
                        );
                        break;
                    }
                    for line in records {
                        if line.is_empty() {
                            continue;
                        }
                        handle_rpc_line(&state, &app, epoch, &line);
                    }
                }
                Err(_) => {
                    runtime_fault(
                        &state,
                        &app,
                        epoch,
                        "SIDERA_PI_STDOUT_READ_FAILED",
                        "Pi output stream closed unexpectedly.",
                    );
                    break;
                }
            }
        }
    });
}

fn drain_jsonl_records(pending: &mut Vec<u8>) -> Vec<Vec<u8>> {
    let mut records = Vec::new();
    while let Some(index) = pending.iter().position(|byte| *byte == b'\n') {
        let mut line = pending.drain(..=index).collect::<Vec<_>>();
        line.pop();
        if line.last() == Some(&b'\r') {
            line.pop();
        }
        records.push(line);
    }
    records
}

fn spawn_stderr_reader(
    mut stderr: impl Read + Send + 'static,
    state: Weak<Mutex<RuntimeInner>>,
    epoch: u64,
) {
    thread::spawn(move || {
        let mut chunk = [0u8; 2048];
        let mut total = 0usize;
        loop {
            match stderr.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    total = total.saturating_add(read).min(MAX_DIAGNOSTIC_BYTES);
                    let Some(inner) = state.upgrade() else {
                        break;
                    };
                    let Ok(mut inner) = inner.lock() else {
                        break;
                    };
                    if let Some(process) =
                        inner.process.as_mut().filter(|value| value.epoch == epoch)
                    {
                        process.stderr_bytes = total;
                    } else {
                        break;
                    }
                    if total >= MAX_DIAGNOSTIC_BYTES {
                        break;
                    }
                }
            }
        }
    });
}

fn handle_rpc_line(state: &Weak<Mutex<RuntimeInner>>, app: &AppHandle, epoch: u64, line: &[u8]) {
    let value: Value = match serde_json::from_slice(line) {
        Ok(value) => value,
        Err(_) => {
            runtime_fault(
                state,
                app,
                epoch,
                "SIDERA_PI_RPC_INVALID_JSON",
                "Pi returned invalid JSONL output.",
            );
            return;
        }
    };
    let Some(shared) = state.upgrade() else {
        return;
    };
    let Ok(mut inner) = shared.lock() else {
        return;
    };
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if matches!(
        event_type,
        "tool_execution_start" | "tool_execution_update" | "tool_execution_end"
    ) {
        let current_revision = inner.revision;
        let (session_id, revision, message_id, stdin) = {
            let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) else {
                return;
            };
            process.blocked = true;
            let revision = process
                .active_turn
                .as_ref()
                .map(|turn| turn.revision)
                .unwrap_or(current_revision);
            let message_id = process
                .active_turn
                .as_ref()
                .map(|turn| turn.message_id.clone());
            (
                process.session.session_id.clone(),
                revision,
                message_id,
                process.stdin.clone(),
            )
        };
        let _ = write_jsonl(&stdin, &json!({ "id": "security-abort", "type": "abort" }));
        inner.last_error_code = Some("SIDERA_PI_TOOL_EVENT_BLOCKED".to_string());
        emit_locked(
            app,
            &mut inner,
            revision,
            SideraPiEventPayload::RuntimeError {
                session_id: Some(session_id),
                code: "SIDERA_PI_TOOL_EVENT_BLOCKED".to_string(),
                message: match message_id {
                    Some(_) => "Pi attempted a tool event in a no-tools session.".to_string(),
                    None => "Pi emitted an unexpected tool event.".to_string(),
                },
            },
        );
        return;
    }

    match event_type {
        "message_update" => handle_message_update(app, &mut inner, epoch, &value),
        "agent_settled" => settle_active_turn(app, &mut inner, epoch),
        "response" if value.get("success").and_then(Value::as_bool) == Some(false) => {
            handle_failed_response(app, &mut inner, epoch, &value)
        }
        _ => {}
    }
}

fn handle_message_update(app: &AppHandle, inner: &mut RuntimeInner, epoch: u64, value: &Value) {
    let event = value.get("assistantMessageEvent").unwrap_or(&Value::Null);
    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if event_type == "text_delta" {
        let delta = event
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if delta.is_empty() {
            return;
        }
        let (session_id, message_id, revision) = {
            let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) else {
                return;
            };
            let Some(turn) = process.active_turn.as_mut() else {
                return;
            };
            let next_bytes = turn.output_bytes.saturating_add(delta.as_bytes().len());
            if next_bytes > MAX_TURN_OUTPUT_BYTES {
                turn.terminal_error = Some("SIDERA_PI_OUTPUT_LIMIT_EXCEEDED".to_string());
                turn.abort_requested = true;
                let _ = write_jsonl(
                    &process.stdin,
                    &json!({ "id": format!("limit-{}", turn.revision), "type": "abort" }),
                );
                return;
            }
            turn.output_bytes = next_bytes;
            process.output_bytes = process.output_bytes.saturating_add(delta.as_bytes().len());
            (
                process.session.session_id.clone(),
                turn.message_id.clone(),
                turn.revision,
            )
        };
        emit_locked(
            app,
            inner,
            revision,
            SideraPiEventPayload::AssistantDelta {
                session_id,
                message_id,
                delta: delta.to_string(),
            },
        );
    } else if event_type == "error" {
        if let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) {
            if let Some(turn) = process.active_turn.as_mut() {
                turn.terminal_error = Some("SIDERA_PI_PROVIDER_ERROR".to_string());
            }
        }
    }
}

fn settle_active_turn(app: &AppHandle, inner: &mut RuntimeInner, epoch: u64) {
    let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) else {
        return;
    };
    let Some(turn) = process.active_turn.take() else {
        return;
    };
    let session_id = process.session.session_id.clone();
    if let Some(code) = turn.terminal_error {
        inner.last_error_code = Some(code.clone());
        emit_locked(
            app,
            inner,
            turn.revision,
            SideraPiEventPayload::RuntimeError {
                session_id: Some(session_id),
                code,
                message: "Pi could not complete this response.".to_string(),
            },
        );
    } else if turn.abort_requested {
        emit_locked(
            app,
            inner,
            turn.revision,
            SideraPiEventPayload::TurnCancelled {
                session_id,
                message_id: turn.message_id,
            },
        );
    } else {
        emit_locked(
            app,
            inner,
            turn.revision,
            SideraPiEventPayload::TurnComplete {
                session_id,
                message_id: turn.message_id,
                usage: None,
            },
        );
    }
}

fn handle_failed_response(app: &AppHandle, inner: &mut RuntimeInner, epoch: u64, value: &Value) {
    let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) else {
        return;
    };
    let response_id = value.get("id").and_then(Value::as_str).unwrap_or_default();
    let matches_active = process
        .active_turn
        .as_ref()
        .map(|turn| turn.request_id == response_id)
        .unwrap_or(false);
    if !matches_active {
        return;
    }
    let turn = process.active_turn.take().expect("active turn checked");
    let session_id = process.session.session_id.clone();
    let message = safe_error_message(value.get("error").and_then(Value::as_str));
    inner.last_error_code = Some("SIDERA_PI_RPC_COMMAND_FAILED".to_string());
    emit_locked(
        app,
        inner,
        turn.revision,
        SideraPiEventPayload::RuntimeError {
            session_id: Some(session_id),
            code: "SIDERA_PI_RPC_COMMAND_FAILED".to_string(),
            message,
        },
    );
}

fn safe_error_message(value: Option<&str>) -> String {
    let value = value.unwrap_or("Pi rejected the request.");
    let compact = value
        .chars()
        .filter(|character| !character.is_control() || *character == ' ')
        .take(400)
        .collect::<String>();
    if compact.trim().is_empty() {
        "Pi rejected the request.".to_string()
    } else {
        compact
    }
}

fn runtime_fault(
    state: &Weak<Mutex<RuntimeInner>>,
    app: &AppHandle,
    epoch: u64,
    code: &str,
    message: &str,
) {
    let Some(shared) = state.upgrade() else {
        return;
    };
    let Ok(mut inner) = shared.lock() else {
        return;
    };
    let current_revision = inner.revision;
    let (session_id, revision) = {
        let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) else {
            return;
        };
        process.alive = false;
        process.blocked = true;
        let revision = process
            .active_turn
            .as_ref()
            .map(|turn| turn.revision)
            .unwrap_or(current_revision);
        (process.session.session_id.clone(), revision)
    };
    inner.last_error_code = Some(code.to_string());
    emit_locked(
        app,
        &mut inner,
        revision,
        SideraPiEventPayload::RuntimeError {
            session_id: Some(session_id),
            code: code.to_string(),
            message: message.to_string(),
        },
    );
}

fn mark_process_exit(state: &Weak<Mutex<RuntimeInner>>, app: &AppHandle, epoch: u64) {
    let Some(shared) = state.upgrade() else {
        return;
    };
    let Ok(mut inner) = shared.lock() else {
        return;
    };
    let current_revision = inner.revision;
    let (session_id, revision, unexpected) = {
        let Some(process) = inner.process.as_mut().filter(|value| value.epoch == epoch) else {
            return;
        };
        let unexpected = process.alive;
        process.alive = false;
        let revision = process
            .active_turn
            .as_ref()
            .map(|turn| turn.revision)
            .unwrap_or(current_revision);
        (process.session.session_id.clone(), revision, unexpected)
    };
    if unexpected {
        inner.last_error_code = Some("SIDERA_PI_PROCESS_EXITED".to_string());
        emit_locked(
            app,
            &mut inner,
            revision,
            SideraPiEventPayload::RuntimeError {
                session_id: Some(session_id),
                code: "SIDERA_PI_PROCESS_EXITED".to_string(),
                message: "Pi stopped unexpectedly. Your question was not replayed.".to_string(),
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_normalization_is_openai_compatible() {
        assert_eq!(
            normalize_openai_base_url("https://api.deepseek.com").unwrap(),
            "https://api.deepseek.com/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://example.test/v1/chat/completions").unwrap(),
            "https://example.test/v1"
        );
    }

    #[test]
    fn models_json_references_environment_without_secret() {
        let root = std::env::temp_dir().join(format!("sidera-pi-test-{}", make_session_id(1)));
        fs::create_dir_all(&root).unwrap();
        write_models_json(&root, "https://example.test/v1", "model-id").unwrap();
        let content = fs::read_to_string(root.join("models.json")).unwrap();
        assert!(content.contains("$SIDERA_PI_API_KEY"));
        assert!(content.contains("sidera-openai-compatible"));
        assert!(!content.contains("secret-value"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn jsonl_parser_waits_for_lf_and_preserves_unicode() {
        let mut pending = "{\"delta\":\"中".as_bytes().to_vec();
        assert!(drain_jsonl_records(&mut pending).is_empty());
        pending.extend_from_slice("文\"}\r\n{\"next\":1}\npartial".as_bytes());
        let records = drain_jsonl_records(&mut pending);
        assert_eq!(records.len(), 2);
        assert_eq!(String::from_utf8(records[0].clone()).unwrap(), "{\"delta\":\"中文\"}");
        assert_eq!(String::from_utf8(records[1].clone()).unwrap(), "{\"next\":1}");
        assert_eq!(String::from_utf8(pending).unwrap(), "partial");
    }

    #[test]
    fn jsonl_parser_does_not_split_unicode_line_separators() {
        let mut pending = "{\"value\":\"a\u{2028}b\"}\n".as_bytes().to_vec();
        let records = drain_jsonl_records(&mut pending);
        assert_eq!(records.len(), 1);
        assert!(String::from_utf8(records[0].clone()).unwrap().contains('\u{2028}'));
    }

    #[test]
    fn standardized_events_use_frontend_camel_case_fields() {
        let payload = SideraPiEventEnvelope {
            sequence: 3,
            revision: 2,
            payload: SideraPiEventPayload::TurnStart {
                session_id: "session-1".to_string(),
                message_id: "message-1".to_string(),
            },
        };
        let value = serde_json::to_value(payload).unwrap();
        assert_eq!(value["type"], "turn-start");
        assert_eq!(value["sessionId"], "session-1");
        assert_eq!(value["messageId"], "message-1");
        assert!(value.get("session_id").is_none());
        assert!(value.get("message_id").is_none());
    }
}
