use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{redirect, Client, StatusCode, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(any(test, feature = "dev-tools"))]
use sha2::{Digest, Sha256};
use std::fmt;
use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::watch;

const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const DEFAULT_PLANNER_TIMEOUT: Duration = Duration::from_secs(90);
const DEFAULT_SIMPLE_WRITER_TIMEOUT: Duration = Duration::from_secs(90);
const DEFAULT_DEEP_WRITER_TIMEOUT: Duration = Duration::from_secs(180);
const DEFAULT_REVISION_WRITER_TIMEOUT: Duration = Duration::from_secs(180);
const DEFAULT_MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const MAX_SCHEMA_BYTES: usize = 128 * 1024;
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const MAX_MESSAGES: usize = 100;
const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentModelProtocol {
    OpenaiChatCompletions,
    OpenaiResponses,
    AnthropicMessages,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelPurpose {
    Planner,
    SimpleWriter,
    DeepWriter,
    RevisionWriter,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentModelProfile {
    pub protocol: AgentModelProtocol,
    pub base_url: String,
    pub model: String,
    #[serde(default = "default_true")]
    pub native_structured_output: bool,
    #[serde(default)]
    pub anthropic_version: Option<String>,
    #[serde(default)]
    pub allow_local_http: bool,
}

impl AgentModelProfile {
    #[cfg(any(test, feature = "dev-tools"))]
    #[allow(dead_code)]
    pub fn config_hash(&self) -> Result<String, ModelGatewayError> {
        let canonical = serde_json::to_vec(self).map_err(|_| {
            ModelGatewayError::new(
                ModelGatewayErrorCode::InvalidRequest,
                false,
                "Model profile cannot be normalized.",
            )
        })?;
        Ok(hex_sha256(&canonical))
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelMessage {
    pub role: ModelMessageRole,
    pub content: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelMessageRole {
    System,
    User,
    Assistant,
}

#[derive(Clone)]
pub struct StructuredModelRequest {
    pub purpose: ModelPurpose,
    pub schema_name: String,
    pub schema: Value,
    pub messages: Vec<ModelMessage>,
    pub temperature: Option<f64>,
    pub max_output_tokens: usize,
    pub max_response_bytes: usize,
    pub allow_structure_repair: bool,
}

impl StructuredModelRequest {
    pub fn new(
        purpose: ModelPurpose,
        schema_name: impl Into<String>,
        schema: Value,
        messages: Vec<ModelMessage>,
        max_output_tokens: usize,
    ) -> Self {
        Self {
            purpose,
            schema_name: schema_name.into(),
            schema,
            messages,
            temperature: None,
            max_output_tokens,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
            allow_structure_repair: true,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTurnResult<T> {
    pub value: T,
    pub protocol: AgentModelProtocol,
    pub request_id: Option<String>,
    pub usage: ModelUsage,
    pub finish_reason: Option<String>,
    pub elapsed_ms: u128,
    pub retry_count: usize,
    pub structure_repair_count: usize,
    pub fallback_used: bool,
}

impl<T> fmt::Debug for ModelTurnResult<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ModelTurnResult")
            .field("value", &"<structured-output-redacted>")
            .field("protocol", &self.protocol)
            .field("request_id", &self.request_id)
            .field("usage", &self.usage)
            .field("finish_reason", &self.finish_reason)
            .field("elapsed_ms", &self.elapsed_ms)
            .field("retry_count", &self.retry_count)
            .field("structure_repair_count", &self.structure_repair_count)
            .field("fallback_used", &self.fallback_used)
            .finish()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModelGatewayErrorCode {
    InvalidEndpoint,
    EndpointAddressBlocked,
    EndpointResolutionFailed,
    RedirectBlocked,
    InvalidRequest,
    InvalidCredential,
    Cancelled,
    Timeout,
    Network,
    HttpStatus,
    ResponseTooLarge,
    EmptyResponse,
    ModelRefusal,
    InvalidStructuredOutput,
    AttemptBudgetExhausted,
    AttemptLeaseLost,
    AttemptAccountingFailed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelGatewayError {
    pub code: ModelGatewayErrorCode,
    pub retryable: bool,
    pub http_status: Option<u16>,
    pub message: String,
    pub structure_repair_count: usize,
}

impl ModelGatewayError {
    fn new(code: ModelGatewayErrorCode, retryable: bool, message: &str) -> Self {
        Self {
            code,
            retryable,
            http_status: None,
            message: message.to_string(),
            structure_repair_count: 0,
        }
    }

    fn http(status: StatusCode) -> Self {
        let retryable = status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
        Self {
            code: if status.is_redirection() {
                ModelGatewayErrorCode::RedirectBlocked
            } else {
                ModelGatewayErrorCode::HttpStatus
            },
            retryable,
            http_status: Some(status.as_u16()),
            message: if status.is_redirection() {
                "Model endpoint redirect was blocked by endpoint policy.".to_string()
            } else {
                format!("Model service returned HTTP {}.", status.as_u16())
            },
            structure_repair_count: 0,
        }
    }

    fn with_structure_repair_count(mut self, count: usize) -> Self {
        self.structure_repair_count = count;
        self
    }
}

impl fmt::Display for ModelGatewayError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ModelGatewayError {}

#[derive(Clone)]
pub struct ModelCancellation {
    receiver: watch::Receiver<bool>,
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct ModelCancelHandle {
    sender: watch::Sender<bool>,
}

impl ModelCancellation {
    pub fn channel() -> (ModelCancelHandle, Self) {
        let (sender, receiver) = watch::channel(false);
        (ModelCancelHandle { sender }, Self { receiver })
    }

    #[cfg(any(test, feature = "dev-tools"))]
    #[allow(dead_code)]
    pub fn never() -> Self {
        Self::channel().1
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        *self.receiver.borrow()
    }

    async fn cancelled(&mut self) {
        loop {
            if self.is_cancelled() {
                return;
            }
            if self.receiver.changed().await.is_err() {
                std::future::pending::<()>().await;
            }
        }
    }
}

impl ModelCancelHandle {
    #[allow(dead_code)]
    pub fn cancel(&self) {
        let _ = self.sender.send(true);
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelAttemptKind {
    Initial,
    Retry,
    NativeSchemaFallback,
    StructureRepair,
}

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ModelAttemptHookError {
    BudgetExhausted,
    LeaseLost,
    AccountingFailed,
}

type ModelAttemptFuture =
    Pin<Box<dyn Future<Output = Result<(), ModelAttemptHookError>> + Send + 'static>>;
type ModelAttemptCallback = dyn Fn(ModelAttemptKind) -> ModelAttemptFuture + Send + Sync + 'static;

#[derive(Clone)]
pub struct ModelAttemptHook {
    callback: Arc<ModelAttemptCallback>,
}

impl ModelAttemptHook {
    #[allow(dead_code)]
    pub fn new<F, Fut>(callback: F) -> Self
    where
        F: Fn(ModelAttemptKind) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), ModelAttemptHookError>> + Send + 'static,
    {
        Self {
            callback: Arc::new(move |kind| Box::pin(callback(kind))),
        }
    }

    async fn reserve(&self, kind: ModelAttemptKind) -> Result<(), ModelGatewayError> {
        (self.callback)(kind).await.map_err(|error| match error {
            ModelAttemptHookError::BudgetExhausted => ModelGatewayError::new(
                ModelGatewayErrorCode::AttemptBudgetExhausted,
                false,
                "Model attempt budget is exhausted.",
            ),
            ModelAttemptHookError::LeaseLost => ModelGatewayError::new(
                ModelGatewayErrorCode::AttemptLeaseLost,
                false,
                "Model attempt lease is no longer owned.",
            ),
            ModelAttemptHookError::AccountingFailed => ModelGatewayError::new(
                ModelGatewayErrorCode::AttemptAccountingFailed,
                false,
                "Model attempt could not be accounted for.",
            ),
        })
    }
}

#[derive(Clone, Debug)]
pub struct ValidatedEndpoint {
    pub url: Url,
    pub host: String,
    pub pinned_addresses: Vec<SocketAddr>,
}

#[derive(Clone, Copy, Debug)]
pub struct ModelGatewayLimits {
    pub connect_timeout: Duration,
    pub planner_timeout: Duration,
    pub simple_writer_timeout: Duration,
    pub deep_writer_timeout: Duration,
    pub revision_writer_timeout: Duration,
}

impl Default for ModelGatewayLimits {
    fn default() -> Self {
        Self {
            connect_timeout: DEFAULT_CONNECT_TIMEOUT,
            planner_timeout: DEFAULT_PLANNER_TIMEOUT,
            simple_writer_timeout: DEFAULT_SIMPLE_WRITER_TIMEOUT,
            deep_writer_timeout: DEFAULT_DEEP_WRITER_TIMEOUT,
            revision_writer_timeout: DEFAULT_REVISION_WRITER_TIMEOUT,
        }
    }
}

impl ModelGatewayLimits {
    fn timeout_for(self, purpose: ModelPurpose) -> Duration {
        match purpose {
            ModelPurpose::Planner => self.planner_timeout,
            ModelPurpose::SimpleWriter => self.simple_writer_timeout,
            ModelPurpose::DeepWriter => self.deep_writer_timeout,
            ModelPurpose::RevisionWriter => self.revision_writer_timeout,
        }
    }
}

#[derive(Clone, Debug)]
pub struct AgentModelGateway {
    limits: ModelGatewayLimits,
}

impl Default for AgentModelGateway {
    fn default() -> Self {
        Self {
            limits: ModelGatewayLimits::default(),
        }
    }
}

impl AgentModelGateway {
    #[cfg(test)]
    pub fn with_limits(limits: ModelGatewayLimits) -> Self {
        Self { limits }
    }

    pub async fn execute_structured<T: DeserializeOwned>(
        &self,
        profile: &AgentModelProfile,
        credential: &str,
        request: &StructuredModelRequest,
        cancellation: ModelCancellation,
    ) -> Result<ModelTurnResult<T>, ModelGatewayError> {
        self.execute_structured_with_attempt_hook(profile, credential, request, None, cancellation)
            .await
    }

    pub async fn execute_structured_with_attempt_hook<T: DeserializeOwned>(
        &self,
        profile: &AgentModelProfile,
        credential: &str,
        request: &StructuredModelRequest,
        attempt_hook: Option<&ModelAttemptHook>,
        cancellation: ModelCancellation,
    ) -> Result<ModelTurnResult<T>, ModelGatewayError> {
        validate_request(profile, credential, request)?;
        if cancellation.is_cancelled() {
            return Err(cancelled_error());
        }

        let timeout = self.limits.timeout_for(request.purpose);
        let started = Instant::now();
        let resolution_cancellation = cancellation.clone();
        let future = async {
            let endpoint = resolve_endpoint_with_cancellation(
                resolve_and_validate_endpoint(profile),
                resolution_cancellation,
            )
            .await?;
            execute_with_policy::<T>(
                profile,
                credential,
                request,
                &endpoint,
                self.limits.connect_timeout,
                attempt_hook,
                cancellation,
            )
            .await
        };
        run_with_total_timeout(timeout, started, future).await
    }
}

async fn resolve_endpoint_with_cancellation<F>(
    endpoint_future: F,
    mut cancellation: ModelCancellation,
) -> Result<ValidatedEndpoint, ModelGatewayError>
where
    F: Future<Output = Result<ValidatedEndpoint, ModelGatewayError>>,
{
    tokio::select! {
        _ = cancellation.cancelled() => Err(cancelled_error()),
        result = endpoint_future => result,
    }
}

async fn run_with_total_timeout<T, F>(
    timeout: Duration,
    started: Instant,
    future: F,
) -> Result<ModelTurnResult<T>, ModelGatewayError>
where
    F: Future<Output = Result<ModelTurnResult<T>, ModelGatewayError>>,
{
    match tokio::time::timeout(timeout, future).await {
        Ok(Ok(mut result)) => {
            result.elapsed_ms = started.elapsed().as_millis();
            Ok(result)
        }
        Ok(Err(error)) => Err(error),
        Err(_) => Err(ModelGatewayError::new(
            ModelGatewayErrorCode::Timeout,
            true,
            "Model request exceeded its total timeout.",
        )),
    }
}

fn default_true() -> bool {
    true
}

#[cfg(any(test, feature = "dev-tools"))]
#[allow(dead_code)]
fn hex_sha256(value: &[u8]) -> String {
    let hash = Sha256::digest(value);
    hash.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn validate_request(
    profile: &AgentModelProfile,
    credential: &str,
    request: &StructuredModelRequest,
) -> Result<(), ModelGatewayError> {
    if profile.model.trim().is_empty() || profile.model.len() > 256 {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "A bounded model name is required.",
        ));
    }
    if credential.trim().is_empty() || credential.contains(['\r', '\n']) {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidCredential,
            false,
            "A valid model credential is required.",
        ));
    }
    if request.messages.is_empty() || request.messages.len() > MAX_MESSAGES {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Model messages are missing or exceed the message count limit.",
        ));
    }
    let total_message_bytes = request
        .messages
        .iter()
        .try_fold(0usize, |total, message| {
            total.checked_add(message.content.len())
        })
        .ok_or_else(|| {
            ModelGatewayError::new(
                ModelGatewayErrorCode::InvalidRequest,
                false,
                "Model messages exceed the input size limit.",
            )
        })?;
    if total_message_bytes > MAX_MESSAGE_BYTES {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Model messages exceed the input size limit.",
        ));
    }
    if !valid_schema_name(&request.schema_name) {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Structured output schema name is invalid.",
        ));
    }
    if !request.schema.is_object()
        || serde_json::to_vec(&request.schema)
            .map(|value| value.len() > MAX_SCHEMA_BYTES)
            .unwrap_or(true)
    {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Structured output schema is invalid or too large.",
        ));
    }
    if request.max_output_tokens == 0 || request.max_output_tokens > 131_072 {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Model output token limit is invalid.",
        ));
    }
    if request.max_response_bytes == 0 || request.max_response_bytes > DEFAULT_MAX_RESPONSE_BYTES {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Model response byte limit is invalid.",
        ));
    }
    if let Some(temperature) = request.temperature {
        if !temperature.is_finite() || !(0.0..=2.0).contains(&temperature) {
            return Err(ModelGatewayError::new(
                ModelGatewayErrorCode::InvalidRequest,
                false,
                "Model temperature is invalid.",
            ));
        }
    }
    Ok(())
}

fn valid_schema_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

pub fn endpoint_for_profile(profile: &AgentModelProfile) -> Result<Url, ModelGatewayError> {
    let mut url = Url::parse(profile.base_url.trim()).map_err(|_| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidEndpoint,
            false,
            "Model endpoint URL is invalid.",
        )
    })?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidEndpoint,
            false,
            "Model endpoint cannot contain credentials, query parameters, or fragments.",
        ));
    }
    let host = url.host_str().ok_or_else(|| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidEndpoint,
            false,
            "Model endpoint host is missing.",
        )
    })?;
    let host_normalized = normalize_host_name(host);
    let scheme = url.scheme();
    if scheme != "https"
        && !(scheme == "http"
            && profile.allow_local_http
            && is_loopback_host_name(&host_normalized))
    {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidEndpoint,
            false,
            "Model endpoint must use public HTTPS or explicitly allowed loopback HTTP.",
        ));
    }
    let suffix = match profile.protocol {
        AgentModelProtocol::OpenaiChatCompletions => "/chat/completions",
        AgentModelProtocol::OpenaiResponses => "/responses",
        AgentModelProtocol::AnthropicMessages => "/messages",
    };
    let current = url.path().trim_end_matches('/');
    let target_path = if current.ends_with(suffix) {
        current.to_string()
    } else if current.ends_with("/v1") {
        format!("{current}{suffix}")
    } else {
        format!("{current}/v1{suffix}")
    };
    url.set_path(&target_path);
    Ok(url)
}

pub fn validate_endpoint_with_resolved_ips(
    profile: &AgentModelProfile,
    resolved_ips: &[IpAddr],
) -> Result<ValidatedEndpoint, ModelGatewayError> {
    let url = endpoint_for_profile(profile)?;
    let host = normalize_host_name(url.host_str().expect("validated URL always has a host"));
    let loopback_http = url.scheme() == "http" && is_loopback_host_name(&host);
    let port = url.port_or_known_default().ok_or_else(|| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidEndpoint,
            false,
            "Model endpoint port cannot be determined.",
        )
    })?;
    if resolved_ips.is_empty() {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::EndpointResolutionFailed,
            true,
            "Model endpoint did not resolve to an address.",
        ));
    }
    let mut pinned_addresses = Vec::with_capacity(resolved_ips.len());
    for address in resolved_ips {
        if (loopback_http && !address.is_loopback())
            || (!loopback_http && is_private_or_link_local(*address))
        {
            return Err(ModelGatewayError::new(
                ModelGatewayErrorCode::EndpointAddressBlocked,
                false,
                "Model endpoint resolved to a blocked address.",
            ));
        }
        pinned_addresses.push(SocketAddr::new(*address, port));
    }
    pinned_addresses.sort_unstable();
    pinned_addresses.dedup();
    Ok(ValidatedEndpoint {
        url,
        host,
        pinned_addresses,
    })
}

async fn resolve_and_validate_endpoint(
    profile: &AgentModelProfile,
) -> Result<ValidatedEndpoint, ModelGatewayError> {
    let url = endpoint_for_profile(profile)?;
    let host = normalize_host_name(url.host_str().expect("validated URL always has a host"));
    let port = url.port_or_known_default().ok_or_else(|| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidEndpoint,
            false,
            "Model endpoint port cannot be determined.",
        )
    })?;
    let addresses = tokio::net::lookup_host((host.as_str(), port))
        .await
        .map_err(|_| {
            ModelGatewayError::new(
                ModelGatewayErrorCode::EndpointResolutionFailed,
                true,
                "Model endpoint DNS resolution failed.",
            )
        })?
        .map(|address| address.ip())
        .collect::<Vec<_>>();
    validate_endpoint_with_resolved_ips(profile, &addresses)
}

fn is_loopback_host_name(host: &str) -> bool {
    host == "localhost"
        || host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false)
}

fn normalize_host_name(host: &str) -> String {
    host.trim_end_matches('.')
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_ascii_lowercase()
}

fn is_private_or_link_local(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_blocked_ipv4(address),
        IpAddr::V6(address) => {
            address
                .to_ipv4_mapped()
                .map(is_blocked_ipv4)
                .unwrap_or(false)
                || address.is_loopback()
                || address.is_unspecified()
                || address.is_multicast()
                || address.is_unique_local()
                || address.is_unicast_link_local()
        }
    }
}

fn is_blocked_ipv4(address: std::net::Ipv4Addr) -> bool {
    let octets = address.octets();
    address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_unspecified()
        || address.is_multicast()
        || address.is_broadcast()
        || octets[0] == 0
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
}

#[derive(Clone, Copy)]
enum StructuredMode {
    Native,
    JsonOnly,
}

struct RawTurn {
    text: String,
    request_id: Option<String>,
    usage: ModelUsage,
    finish_reason: Option<String>,
}

struct RawHttpResponse {
    status: StatusCode,
    request_id_header: Option<String>,
    body: Vec<u8>,
}

#[derive(Debug)]
struct AttemptFailure {
    error: ModelGatewayError,
    native_schema_unsupported: bool,
}

async fn execute_with_policy<T: DeserializeOwned>(
    profile: &AgentModelProfile,
    credential: &str,
    request: &StructuredModelRequest,
    endpoint: &ValidatedEndpoint,
    connect_timeout: Duration,
    attempt_hook: Option<&ModelAttemptHook>,
    cancellation: ModelCancellation,
) -> Result<ModelTurnResult<T>, ModelGatewayError> {
    let client = build_client(endpoint, connect_timeout)?;
    let mut retry_count = 0usize;
    let mut fallback_used = !profile.native_structured_output;
    let mut mode = if profile.native_structured_output {
        StructuredMode::Native
    } else {
        StructuredMode::JsonOnly
    };
    let mut next_attempt_kind = ModelAttemptKind::Initial;

    let first = loop {
        match execute_attempt(
            &client,
            profile,
            credential,
            request,
            endpoint,
            mode,
            &request.messages,
            next_attempt_kind,
            attempt_hook,
            cancellation.clone(),
        )
        .await
        {
            Ok(turn) => break turn,
            Err(failure) if failure.native_schema_unsupported && !fallback_used => {
                fallback_used = true;
                mode = StructuredMode::JsonOnly;
                next_attempt_kind = ModelAttemptKind::NativeSchemaFallback;
            }
            Err(failure) if failure.error.retryable && retry_count == 0 => {
                retry_count += 1;
                next_attempt_kind = ModelAttemptKind::Retry;
            }
            Err(failure) => return Err(failure.error),
        }
    };

    match serde_json::from_str::<T>(&first.text) {
        Ok(value) => Ok(ModelTurnResult {
            value,
            protocol: profile.protocol,
            request_id: first.request_id,
            usage: first.usage,
            finish_reason: first.finish_reason,
            elapsed_ms: 0,
            retry_count,
            structure_repair_count: 0,
            fallback_used,
        }),
        Err(_) => {
            if !request.allow_structure_repair {
                return Err(ModelGatewayError::new(
                    ModelGatewayErrorCode::InvalidStructuredOutput,
                    false,
                    "Model response did not satisfy the required structured output.",
                ));
            }
            let repair_messages = repair_messages(request, &first.text)?;
            let mut repair_attempt_kind = ModelAttemptKind::StructureRepair;
            let repaired = loop {
                match execute_attempt(
                    &client,
                    profile,
                    credential,
                    request,
                    endpoint,
                    mode,
                    &repair_messages,
                    repair_attempt_kind,
                    attempt_hook,
                    cancellation.clone(),
                )
                .await
                {
                    Ok(turn) => break turn,
                    Err(failure) if failure.error.retryable && retry_count == 0 => {
                        retry_count += 1;
                        repair_attempt_kind = ModelAttemptKind::Retry;
                    }
                    Err(failure) => {
                        return Err(failure.error.with_structure_repair_count(1));
                    }
                }
            };
            let value = serde_json::from_str::<T>(&repaired.text).map_err(|_| {
                ModelGatewayError::new(
                    ModelGatewayErrorCode::InvalidStructuredOutput,
                    false,
                    "Model response remained invalid after one structure repair.",
                )
                .with_structure_repair_count(1)
            })?;
            Ok(ModelTurnResult {
                value,
                protocol: profile.protocol,
                request_id: repaired.request_id.or(first.request_id),
                usage: add_usage(first.usage, repaired.usage),
                finish_reason: repaired.finish_reason,
                elapsed_ms: 0,
                retry_count,
                structure_repair_count: 1,
                fallback_used,
            })
        }
    }
}

fn repair_messages(
    request: &StructuredModelRequest,
    invalid_text: &str,
) -> Result<Vec<ModelMessage>, ModelGatewayError> {
    let mut messages = request.messages.clone();
    let bounded = invalid_text
        .char_indices()
        .take_while(|(index, _)| *index < 256 * 1024)
        .map(|(_, value)| value)
        .collect::<String>();
    messages.push(ModelMessage {
        role: ModelMessageRole::Assistant,
        content: bounded,
    });
    messages.push(ModelMessage {
        role: ModelMessageRole::User,
        content: "The previous response did not satisfy the required JSON schema. Return exactly one JSON value matching the schema, with no prose or code fence.".to_string(),
    });
    if messages
        .iter()
        .map(|value| value.content.len())
        .sum::<usize>()
        > MAX_MESSAGE_BYTES
    {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidStructuredOutput,
            false,
            "Model response could not be repaired within the input limit.",
        ));
    }
    Ok(messages)
}

fn add_usage(left: ModelUsage, right: ModelUsage) -> ModelUsage {
    ModelUsage {
        input_tokens: add_optional(left.input_tokens, right.input_tokens),
        output_tokens: add_optional(left.output_tokens, right.output_tokens),
        total_tokens: add_optional(left.total_tokens, right.total_tokens),
    }
}

fn add_optional(left: Option<u64>, right: Option<u64>) -> Option<u64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.saturating_add(right)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn build_client(
    endpoint: &ValidatedEndpoint,
    connect_timeout: Duration,
) -> Result<Client, ModelGatewayError> {
    let origin_scheme = endpoint.url.scheme().to_string();
    let origin_host = endpoint.host.clone();
    let origin_port = endpoint.url.port_or_known_default();
    let redirect_policy = redirect::Policy::custom(move |attempt| {
        let candidate = attempt.url();
        let candidate_host = candidate.host_str().map(normalize_host_name);
        if attempt.previous().len() >= MAX_REDIRECTS
            || candidate.scheme() != origin_scheme
            || candidate_host.as_deref() != Some(origin_host.as_str())
            || candidate.port_or_known_default() != origin_port
            || !candidate.username().is_empty()
            || candidate.password().is_some()
        {
            attempt.stop()
        } else {
            attempt.follow()
        }
    });
    let mut builder = Client::builder()
        .connect_timeout(connect_timeout)
        // The endpoint addresses above were resolved, policy-checked, and pinned by us.
        // An implicit HTTP(S)/SOCKS system proxy would resolve the original hostname again
        // and could therefore bypass that DNS-rebinding/SSRF boundary.
        .no_proxy()
        .redirect(redirect_policy);
    if endpoint.host.parse::<IpAddr>().is_err() {
        builder = builder.resolve_to_addrs(&endpoint.host, &endpoint.pinned_addresses);
    }
    builder.build().map_err(|_| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::Network,
            false,
            "Model HTTP client could not be initialized.",
        )
    })
}

#[allow(clippy::too_many_arguments)]
async fn execute_attempt(
    client: &Client,
    profile: &AgentModelProfile,
    credential: &str,
    request: &StructuredModelRequest,
    endpoint: &ValidatedEndpoint,
    mode: StructuredMode,
    messages: &[ModelMessage],
    attempt_kind: ModelAttemptKind,
    attempt_hook: Option<&ModelAttemptHook>,
    cancellation: ModelCancellation,
) -> Result<RawTurn, AttemptFailure> {
    let body = request_body(profile, request, mode, messages).map_err(|error| AttemptFailure {
        error,
        native_schema_unsupported: false,
    })?;
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    match profile.protocol {
        AgentModelProtocol::OpenaiChatCompletions | AgentModelProtocol::OpenaiResponses => {
            let authorization =
                HeaderValue::from_str(&format!("Bearer {credential}")).map_err(|_| {
                    AttemptFailure {
                        error: ModelGatewayError::new(
                            ModelGatewayErrorCode::InvalidCredential,
                            false,
                            "Model credential cannot be encoded safely.",
                        ),
                        native_schema_unsupported: false,
                    }
                })?;
            headers.insert(AUTHORIZATION, authorization);
        }
        AgentModelProtocol::AnthropicMessages => {
            let key = HeaderValue::from_str(credential).map_err(|_| AttemptFailure {
                error: ModelGatewayError::new(
                    ModelGatewayErrorCode::InvalidCredential,
                    false,
                    "Model credential cannot be encoded safely.",
                ),
                native_schema_unsupported: false,
            })?;
            let version = profile.anthropic_version.as_deref().unwrap_or("2023-06-01");
            let version = HeaderValue::from_str(version).map_err(|_| AttemptFailure {
                error: ModelGatewayError::new(
                    ModelGatewayErrorCode::InvalidRequest,
                    false,
                    "Anthropic protocol version is invalid.",
                ),
                native_schema_unsupported: false,
            })?;
            headers.insert("x-api-key", key);
            headers.insert("anthropic-version", version);
        }
    }
    if cancellation.is_cancelled() {
        return Err(AttemptFailure {
            error: cancelled_error(),
            native_schema_unsupported: false,
        });
    }
    if let Some(hook) = attempt_hook {
        hook.reserve(attempt_kind)
            .await
            .map_err(|error| AttemptFailure {
                error,
                native_schema_unsupported: false,
            })?;
    }
    let response = send_and_read_bounded(
        client,
        endpoint.url.clone(),
        headers,
        body,
        request.max_response_bytes,
        cancellation,
    )
    .await
    .map_err(|error| AttemptFailure {
        error,
        native_schema_unsupported: false,
    })?;

    if !response.status.is_success() {
        return Err(AttemptFailure {
            native_schema_unsupported: matches!(mode, StructuredMode::Native)
                && native_schema_is_unsupported(response.status, &response.body),
            error: ModelGatewayError::http(response.status),
        });
    }
    parse_provider_response(profile.protocol, &response.body, response.request_id_header).map_err(
        |error| AttemptFailure {
            error,
            native_schema_unsupported: false,
        },
    )
}

async fn send_and_read_bounded(
    client: &Client,
    url: Url,
    headers: HeaderMap,
    body: Value,
    max_bytes: usize,
    mut cancellation: ModelCancellation,
) -> Result<RawHttpResponse, ModelGatewayError> {
    if cancellation.is_cancelled() {
        return Err(cancelled_error());
    }
    let response = tokio::select! {
        _ = cancellation.cancelled() => {
            return Err(cancelled_error());
        }
        result = client.post(url).headers(headers).json(&body).send() => {
            result.map_err(map_network_error)?
        }
    };
    let status = response.status();
    let request_id_header = response
        .headers()
        .get("x-request-id")
        .or_else(|| response.headers().get("request-id"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if response
        .content_length()
        .map(|length| length > max_bytes as u64)
        .unwrap_or(false)
    {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::ResponseTooLarge,
            false,
            "Model response exceeded the configured byte limit.",
        ));
    }
    let mut response = response;
    let mut body_bytes = Vec::new();
    loop {
        let chunk = tokio::select! {
            _ = cancellation.cancelled() => {
                return Err(cancelled_error());
            }
            result = response.chunk() => result.map_err(map_network_error)?,
        };
        let Some(chunk) = chunk else { break };
        if body_bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err(ModelGatewayError::new(
                ModelGatewayErrorCode::ResponseTooLarge,
                false,
                "Model response exceeded the configured byte limit.",
            ));
        }
        body_bytes.extend_from_slice(&chunk);
    }
    Ok(RawHttpResponse {
        status,
        request_id_header,
        body: body_bytes,
    })
}

fn map_network_error(error: reqwest::Error) -> ModelGatewayError {
    if error.is_timeout() {
        ModelGatewayError::new(
            ModelGatewayErrorCode::Timeout,
            true,
            "Model network operation timed out.",
        )
    } else {
        ModelGatewayError::new(
            ModelGatewayErrorCode::Network,
            error.is_connect() || error.is_request() || error.is_body(),
            "Model network operation failed.",
        )
    }
}

fn cancelled_error() -> ModelGatewayError {
    ModelGatewayError::new(
        ModelGatewayErrorCode::Cancelled,
        false,
        "Model request was cancelled.",
    )
}

fn request_body(
    profile: &AgentModelProfile,
    request: &StructuredModelRequest,
    mode: StructuredMode,
    messages: &[ModelMessage],
) -> Result<Value, ModelGatewayError> {
    let mut normalized_messages = messages
        .iter()
        .map(|message| {
            json!({
                "role": match message.role {
                    ModelMessageRole::System => "system",
                    ModelMessageRole::User => "user",
                    ModelMessageRole::Assistant => "assistant",
                },
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();
    if matches!(mode, StructuredMode::JsonOnly) {
        normalized_messages.insert(
            0,
            json!({
                "role": "system",
                "content": json_only_instruction(request)?,
            }),
        );
    }
    let mut body = match profile.protocol {
        AgentModelProtocol::OpenaiChatCompletions => json!({
            "model": profile.model,
            "messages": normalized_messages,
            "max_tokens": request.max_output_tokens,
        }),
        AgentModelProtocol::OpenaiResponses => json!({
            "model": profile.model,
            "input": normalized_messages,
            "max_output_tokens": request.max_output_tokens,
            "store": false,
        }),
        AgentModelProtocol::AnthropicMessages => {
            let system = normalized_messages
                .iter()
                .filter(|message| message.get("role").and_then(Value::as_str) == Some("system"))
                .filter_map(|message| message.get("content").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n\n");
            let messages = normalized_messages
                .into_iter()
                .filter(|message| message.get("role").and_then(Value::as_str) != Some("system"))
                .collect::<Vec<_>>();
            let mut value = json!({
                "model": profile.model,
                "messages": messages,
                "max_tokens": request.max_output_tokens,
            });
            if !system.is_empty() {
                value["system"] = Value::String(system);
            }
            value
        }
    };
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }
    if matches!(mode, StructuredMode::Native) {
        match profile.protocol {
            AgentModelProtocol::OpenaiChatCompletions => {
                body["response_format"] = json!({
                    "type": "json_schema",
                    "json_schema": {
                        "name": request.schema_name,
                        "strict": true,
                        "schema": request.schema,
                    }
                });
            }
            AgentModelProtocol::OpenaiResponses => {
                body["text"] = json!({
                    "format": {
                        "type": "json_schema",
                        "name": request.schema_name,
                        "strict": true,
                        "schema": request.schema,
                    }
                });
            }
            AgentModelProtocol::AnthropicMessages => {
                body["output_config"] = json!({
                    "format": {
                        "type": "json_schema",
                        "schema": request.schema,
                    }
                });
            }
        }
    }
    Ok(body)
}

fn json_only_instruction(request: &StructuredModelRequest) -> Result<String, ModelGatewayError> {
    let schema = serde_json::to_string(&request.schema).map_err(|_| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidRequest,
            false,
            "Structured output schema cannot be encoded.",
        )
    })?;
    Ok(format!(
        "Return exactly one JSON value matching schema `{}`. Do not use Markdown or prose. JSON Schema: {schema}",
        request.schema_name
    ))
}

fn native_schema_is_unsupported(status: StatusCode, body: &[u8]) -> bool {
    if !matches!(status.as_u16(), 400 | 404 | 415 | 422) {
        return false;
    }
    let Ok(value) = serde_json::from_slice::<Value>(body) else {
        return false;
    };
    let code = value
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let parameter = value
        .pointer("/error/param")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let message = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    [code.as_str(), parameter.as_str(), message.as_str()]
        .iter()
        .any(|value| {
            value.contains("json_schema")
                || value.contains("response_format")
                || value.contains("output_config")
                || value.contains("structured output")
        })
}

fn parse_provider_response(
    protocol: AgentModelProtocol,
    body: &[u8],
    request_id_header: Option<String>,
) -> Result<RawTurn, ModelGatewayError> {
    let payload = serde_json::from_slice::<Value>(body).map_err(|_| {
        ModelGatewayError::new(
            ModelGatewayErrorCode::InvalidStructuredOutput,
            false,
            "Model service returned an invalid response envelope.",
        )
    })?;
    let payload_request_id = payload
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let request_id = request_id_header.or(payload_request_id);
    match protocol {
        AgentModelProtocol::OpenaiChatCompletions => parse_chat_response(payload, request_id),
        AgentModelProtocol::OpenaiResponses => parse_responses_response(payload, request_id),
        AgentModelProtocol::AnthropicMessages => parse_anthropic_response(payload, request_id),
    }
}

fn parse_chat_response(
    payload: Value,
    request_id: Option<String>,
) -> Result<RawTurn, ModelGatewayError> {
    if payload
        .pointer("/choices/0/message/refusal")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .is_some()
    {
        return Err(ModelGatewayError::new(
            ModelGatewayErrorCode::ModelRefusal,
            false,
            "Model refused the structured request.",
        ));
    }
    let text = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    Ok(RawTurn {
        text,
        request_id,
        usage: ModelUsage {
            input_tokens: u64_at(&payload, "/usage/prompt_tokens"),
            output_tokens: u64_at(&payload, "/usage/completion_tokens"),
            total_tokens: u64_at(&payload, "/usage/total_tokens"),
        },
        finish_reason: string_at(&payload, "/choices/0/finish_reason"),
    })
}

fn parse_responses_response(
    payload: Value,
    request_id: Option<String>,
) -> Result<RawTurn, ModelGatewayError> {
    let mut texts = Vec::new();
    if let Some(output) = payload.get("output").and_then(Value::as_array) {
        for item in output {
            if let Some(content) = item.get("content").and_then(Value::as_array) {
                for part in content {
                    match part.get("type").and_then(Value::as_str) {
                        Some("output_text") => {
                            if let Some(text) = part.get("text").and_then(Value::as_str) {
                                texts.push(text);
                            }
                        }
                        Some("refusal") => {
                            return Err(ModelGatewayError::new(
                                ModelGatewayErrorCode::ModelRefusal,
                                false,
                                "Model refused the structured request.",
                            ));
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    if texts.is_empty() {
        if let Some(text) = payload.get("output_text").and_then(Value::as_str) {
            texts.push(text);
        }
    }
    let text = texts.join("").trim().to_string();
    let finish_reason = string_at(&payload, "/incomplete_details/reason")
        .or_else(|| string_at(&payload, "/status"));
    Ok(RawTurn {
        text,
        request_id,
        usage: ModelUsage {
            input_tokens: u64_at(&payload, "/usage/input_tokens"),
            output_tokens: u64_at(&payload, "/usage/output_tokens"),
            total_tokens: u64_at(&payload, "/usage/total_tokens"),
        },
        finish_reason,
    })
}

fn parse_anthropic_response(
    payload: Value,
    request_id: Option<String>,
) -> Result<RawTurn, ModelGatewayError> {
    let texts = payload
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>();
    let text = texts.join("").trim().to_string();
    Ok(RawTurn {
        text,
        request_id,
        usage: ModelUsage {
            input_tokens: u64_at(&payload, "/usage/input_tokens"),
            output_tokens: u64_at(&payload, "/usage/output_tokens"),
            total_tokens: match (
                u64_at(&payload, "/usage/input_tokens"),
                u64_at(&payload, "/usage/output_tokens"),
            ) {
                (Some(input), Some(output)) => Some(input.saturating_add(output)),
                _ => None,
            },
        },
        finish_reason: string_at(&payload, "/stop_reason"),
    })
}

fn u64_at(value: &Value, pointer: &str) -> Option<u64> {
    value.pointer(pointer).and_then(Value::as_u64)
}

fn string_at(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
    use std::thread;

    #[derive(Debug, Deserialize, Eq, PartialEq)]
    #[serde(deny_unknown_fields)]
    struct ExampleOutput {
        answer: String,
    }

    #[derive(Clone, Debug)]
    struct CapturedRequest {
        path: String,
        headers: String,
        body: Value,
    }

    struct MockServer {
        base_url: String,
        captured: Arc<Mutex<Vec<CapturedRequest>>>,
        thread: Option<thread::JoinHandle<()>>,
    }

    struct SlowMockServer {
        base_url: String,
        thread: Option<thread::JoinHandle<()>>,
    }

    impl SlowMockServer {
        fn start(delay: Duration) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let thread = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let _ = read_request(&mut stream);
                thread::sleep(delay);
                let body = json!({
                    "choices": [{ "message": { "content": "{\"answer\":\"late\"}" } }]
                })
                .to_string();
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            });
            Self {
                base_url: format!("http://{address}"),
                thread: Some(thread),
            }
        }
    }

    impl Drop for SlowMockServer {
        fn drop(&mut self) {
            if let Some(thread) = self.thread.take() {
                thread.join().unwrap();
            }
        }
    }

    impl MockServer {
        fn start(responses: Vec<(u16, Vec<(String, String)>, String)>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let captured = Arc::new(Mutex::new(Vec::new()));
            let captured_thread = Arc::clone(&captured);
            let thread = thread::spawn(move || {
                for response in responses {
                    let (mut stream, _) = listener.accept().unwrap();
                    let request = read_request(&mut stream);
                    captured_thread.lock().unwrap().push(request);
                    let reason = match response.0 {
                        200 => "OK",
                        302 => "Found",
                        400 => "Bad Request",
                        429 => "Too Many Requests",
                        500 => "Internal Server Error",
                        _ => "Status",
                    };
                    let mut headers = format!(
                        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
                        response.0,
                        reason,
                        response.2.len()
                    );
                    for (name, value) in response.1 {
                        headers.push_str(&format!("{name}: {value}\r\n"));
                    }
                    headers.push_str("\r\n");
                    stream.write_all(headers.as_bytes()).unwrap();
                    stream.write_all(response.2.as_bytes()).unwrap();
                }
            });
            Self {
                base_url: format!("http://{address}"),
                captured,
                thread: Some(thread),
            }
        }

        fn captured(&self) -> Vec<CapturedRequest> {
            self.captured.lock().unwrap().clone()
        }
    }

    impl Drop for MockServer {
        fn drop(&mut self) {
            if let Some(thread) = self.thread.take() {
                thread.join().unwrap();
            }
        }
    }

    fn read_request(stream: &mut TcpStream) -> CapturedRequest {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 4096];
        let header_end;
        loop {
            let count = stream.read(&mut buffer).unwrap();
            assert!(count > 0);
            bytes.extend_from_slice(&buffer[..count]);
            if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                header_end = index + 4;
                break;
            }
        }
        let headers = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
        let content_length = headers
            .lines()
            .find_map(|line| {
                line.split_once(':').and_then(|(name, value)| {
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
            })
            .unwrap_or(0);
        while bytes.len() < header_end + content_length {
            let count = stream.read(&mut buffer).unwrap();
            assert!(count > 0);
            bytes.extend_from_slice(&buffer[..count]);
        }
        let request_line = headers.lines().next().unwrap();
        let path = request_line.split_whitespace().nth(1).unwrap().to_string();
        let body = serde_json::from_slice(&bytes[header_end..header_end + content_length]).unwrap();
        CapturedRequest {
            path,
            headers,
            body,
        }
    }

    fn profile(protocol: AgentModelProtocol, base_url: String) -> AgentModelProfile {
        AgentModelProfile {
            protocol,
            base_url,
            model: "test-model".to_string(),
            native_structured_output: true,
            anthropic_version: None,
            allow_local_http: true,
        }
    }

    fn request() -> StructuredModelRequest {
        StructuredModelRequest::new(
            ModelPurpose::Planner,
            "example_output",
            json!({
                "type": "object",
                "additionalProperties": false,
                "properties": { "answer": { "type": "string" } },
                "required": ["answer"]
            }),
            vec![ModelMessage {
                role: ModelMessageRole::User,
                content: "Return an answer.".to_string(),
            }],
            512,
        )
    }

    fn gateway() -> AgentModelGateway {
        AgentModelGateway::with_limits(ModelGatewayLimits {
            connect_timeout: Duration::from_secs(2),
            planner_timeout: Duration::from_secs(3),
            simple_writer_timeout: Duration::from_secs(3),
            deep_writer_timeout: Duration::from_secs(3),
            revision_writer_timeout: Duration::from_secs(3),
        })
    }

    #[test]
    fn endpoint_policy_rejects_credentials_fragments_and_private_resolution() {
        let mut value = profile(
            AgentModelProtocol::OpenaiChatCompletions,
            "https://user:secret@example.com".to_string(),
        );
        assert_eq!(
            endpoint_for_profile(&value).unwrap_err().code,
            ModelGatewayErrorCode::InvalidEndpoint
        );
        value.base_url = "https://example.com/#fragment".to_string();
        assert_eq!(
            endpoint_for_profile(&value).unwrap_err().code,
            ModelGatewayErrorCode::InvalidEndpoint
        );
        value.base_url = "https://example.com".to_string();
        assert_eq!(
            validate_endpoint_with_resolved_ips(&value, &["192.168.1.20".parse().unwrap()])
                .unwrap_err()
                .code,
            ModelGatewayErrorCode::EndpointAddressBlocked
        );
        let validated =
            validate_endpoint_with_resolved_ips(&value, &["93.184.216.34".parse().unwrap()])
                .unwrap();
        assert_eq!(validated.url.path(), "/v1/chat/completions");
        assert_eq!(validated.pinned_addresses.len(), 1);
    }

    #[test]
    fn pinned_client_disables_implicit_system_proxies() {
        let endpoint = ValidatedEndpoint {
            url: Url::parse("http://localhost:31337/v1/chat/completions").unwrap(),
            host: "localhost".into(),
            pinned_addresses: vec!["127.0.0.1:31337".parse().unwrap()],
        };
        let client = build_client(&endpoint, Duration::from_secs(1)).unwrap();

        // reqwest's Debug representation includes a `proxies` field whenever its
        // system/custom proxy matcher list is non-empty. This guards the invariant
        // that resolve_to_addrs below is the only route used for the validated host.
        assert!(
            !format!("{client:?}").contains("proxies"),
            "the pinned model client must not install implicit proxy matchers"
        );
    }

    #[test]
    fn local_http_requires_explicit_permission_and_loopback_resolution() {
        let mut value = profile(
            AgentModelProtocol::OpenaiResponses,
            "http://127.0.0.1:9000".to_string(),
        );
        value.allow_local_http = false;
        assert_eq!(
            endpoint_for_profile(&value).unwrap_err().code,
            ModelGatewayErrorCode::InvalidEndpoint
        );
        value.allow_local_http = true;
        let validated =
            validate_endpoint_with_resolved_ips(&value, &["127.0.0.1".parse().unwrap()]).unwrap();
        assert_eq!(validated.url.path(), "/v1/responses");

        value.base_url = "http://[::1]:9000".to_string();
        let validated =
            validate_endpoint_with_resolved_ips(&value, &["::1".parse().unwrap()]).unwrap();
        assert_eq!(validated.host, "::1");
        assert_eq!(validated.url.path(), "/v1/responses");
    }

    #[tokio::test]
    async fn sends_openai_chat_native_schema_and_normalizes_metadata() {
        let server = MockServer::start(vec![(
            200,
            vec![("x-request-id".to_string(), "req-header".to_string())],
            json!({
                "id": "chat-id",
                "choices": [{
                    "message": { "content": "{\"answer\":\"chat\"}" },
                    "finish_reason": "stop"
                }],
                "usage": { "prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5 }
            })
            .to_string(),
        )]);
        let result = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "chat");
        assert_eq!(result.request_id.as_deref(), Some("req-header"));
        assert_eq!(result.usage.total_tokens, Some(5));
        let captured = server.captured();
        assert_eq!(captured[0].path, "/v1/chat/completions");
        assert!(captured[0]
            .headers
            .contains("authorization: Bearer test-secret"));
        assert_eq!(
            captured[0].body.pointer("/response_format/type"),
            Some(&json!("json_schema"))
        );
        drop(server);
    }

    #[tokio::test]
    async fn sends_openai_responses_schema_store_false_and_extracts_output_text() {
        let server = MockServer::start(vec![(
            200,
            vec![],
            json!({
                "id": "response-id",
                "status": "completed",
                "output": [{ "content": [{ "type": "output_text", "text": "{\"answer\":\"responses\"}" }] }],
                "usage": { "input_tokens": 4, "output_tokens": 5, "total_tokens": 9 }
            })
            .to_string(),
        )]);
        let result = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(AgentModelProtocol::OpenaiResponses, server.base_url.clone()),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "responses");
        let captured = server.captured();
        assert_eq!(captured[0].path, "/v1/responses");
        assert_eq!(captured[0].body.get("store"), Some(&json!(false)));
        assert_eq!(
            captured[0].body.pointer("/text/format/type"),
            Some(&json!("json_schema"))
        );
        drop(server);
    }

    #[tokio::test]
    async fn sends_anthropic_headers_schema_and_extracts_text() {
        let server = MockServer::start(vec![(
            200,
            vec![("request-id".to_string(), "anthropic-request".to_string())],
            json!({
                "id": "message-id",
                "content": [{ "type": "text", "text": "{\"answer\":\"anthropic\"}" }],
                "stop_reason": "end_turn",
                "usage": { "input_tokens": 7, "output_tokens": 8 }
            })
            .to_string(),
        )]);
        let mut model_profile = profile(
            AgentModelProtocol::AnthropicMessages,
            server.base_url.clone(),
        );
        model_profile.anthropic_version = Some("2023-06-01".to_string());
        let result = gateway()
            .execute_structured::<ExampleOutput>(
                &model_profile,
                "anthropic-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "anthropic");
        assert_eq!(result.usage.total_tokens, Some(15));
        let captured = server.captured();
        assert_eq!(captured[0].path, "/v1/messages");
        assert!(captured[0].headers.contains("x-api-key: anthropic-secret"));
        assert!(captured[0]
            .headers
            .contains("anthropic-version: 2023-06-01"));
        assert_eq!(
            captured[0].body.pointer("/output_config/format/type"),
            Some(&json!("json_schema"))
        );
        drop(server);
    }

    #[tokio::test]
    async fn falls_back_when_native_schema_is_explicitly_unsupported() {
        let server = MockServer::start(vec![
            (
                400,
                vec![],
                json!({ "error": { "code": "unsupported_response_format", "param": "response_format" } }).to_string(),
            ),
            (
                200,
                vec![],
                json!({
                    "choices": [{ "message": { "content": "{\"answer\":\"fallback\"}" }, "finish_reason": "stop" }]
                })
                .to_string(),
            ),
        ]);
        let result = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "fallback");
        assert!(result.fallback_used);
        assert_eq!(result.retry_count, 0);
        let captured = server.captured();
        assert!(captured[0].body.get("response_format").is_some());
        assert!(captured[1].body.get("response_format").is_none());
        drop(server);
    }

    #[tokio::test]
    async fn performs_exactly_one_structural_repair() {
        let server = MockServer::start(vec![
            (
                200,
                vec![],
                json!({ "choices": [{ "message": { "content": "{\"answer\":\"invalid\",\"unexpected\":true}" } }] }).to_string(),
            ),
            (
                200,
                vec![],
                json!({ "choices": [{ "message": { "content": "{\"answer\":\"repaired\"}" } }] })
                    .to_string(),
            ),
        ]);
        let result = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "repaired");
        assert_eq!(result.structure_repair_count, 1);
        assert_eq!(server.captured().len(), 2);
        drop(server);
    }

    #[tokio::test]
    async fn attempt_hook_observes_retry_fallback_and_structure_repair_before_requests() {
        let server = MockServer::start(vec![
            (500, vec![], "{}".to_string()),
            (
                400,
                vec![],
                json!({ "error": { "code": "unsupported_response_format", "param": "response_format" } }).to_string(),
            ),
            (
                200,
                vec![],
                json!({ "choices": [{ "message": { "content": "{\"answer\":\"invalid\",\"unexpected\":true}" } }] }).to_string(),
            ),
            (
                200,
                vec![],
                json!({ "choices": [{ "message": { "content": "{\"answer\":\"repaired\"}" } }] }).to_string(),
            ),
        ]);
        let attempts = Arc::new(Mutex::new(Vec::new()));
        let captured_attempts = Arc::clone(&attempts);
        let hook = ModelAttemptHook::new(move |kind| {
            let captured_attempts = Arc::clone(&captured_attempts);
            async move {
                captured_attempts.lock().unwrap().push(kind);
                Ok::<(), ModelAttemptHookError>(())
            }
        });
        let result = gateway()
            .execute_structured_with_attempt_hook::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                Some(&hook),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "repaired");
        assert_eq!(result.retry_count, 1);
        assert!(result.fallback_used);
        assert_eq!(result.structure_repair_count, 1);
        assert_eq!(
            *attempts.lock().unwrap(),
            vec![
                ModelAttemptKind::Initial,
                ModelAttemptKind::Retry,
                ModelAttemptKind::NativeSchemaFallback,
                ModelAttemptKind::StructureRepair,
            ]
        );
        assert_eq!(server.captured().len(), 4);
        drop(server);
    }

    #[tokio::test]
    async fn exhausted_attempt_budget_prevents_the_http_request() {
        let server = MockServer::start(Vec::new());
        let hook = ModelAttemptHook::new(|_| async {
            Err::<(), ModelAttemptHookError>(ModelAttemptHookError::BudgetExhausted)
        });
        let error = gateway()
            .execute_structured_with_attempt_hook::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                Some(&hook),
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::AttemptBudgetExhausted);
        assert!(server.captured().is_empty());
        drop(server);
    }

    #[tokio::test]
    async fn stops_after_one_failed_structure_repair() {
        let server = MockServer::start(vec![
            (
                200,
                vec![],
                json!({ "choices": [{ "message": { "content": "not-json" } }] }).to_string(),
            ),
            (
                200,
                vec![],
                json!({ "choices": [{ "message": { "content": "still-not-json" } }] }).to_string(),
            ),
        ]);
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::InvalidStructuredOutput);
        assert_eq!(error.structure_repair_count, 1);
        assert_eq!(server.captured().len(), 2);
        drop(server);
    }

    #[tokio::test]
    async fn exhausted_repair_budget_does_not_send_a_repair_request() {
        let server = MockServer::start(vec![(
            200,
            vec![],
            json!({ "choices": [{ "message": { "content": "not-json" } }] }).to_string(),
        )]);
        let mut bounded_request = request();
        bounded_request.allow_structure_repair = false;
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &bounded_request,
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::InvalidStructuredOutput);
        assert_eq!(error.structure_repair_count, 0);
        assert_eq!(server.captured().len(), 1);
        drop(server);
    }

    #[tokio::test]
    async fn retries_429_once_and_never_exposes_server_body_in_error() {
        let server = MockServer::start(vec![
            (
                429,
                vec![],
                json!({ "error": { "message": "secret-echo-should-not-escape" } }).to_string(),
            ),
            (
                500,
                vec![],
                json!({ "error": { "message": "another-secret-echo" } }).to_string(),
            ),
        ]);
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::HttpStatus);
        assert_eq!(error.http_status, Some(500));
        assert!(!error.to_string().contains("secret"));
        assert_eq!(server.captured().len(), 2);
        drop(server);
    }

    #[tokio::test]
    async fn retries_one_5xx_then_returns_the_successful_structured_result() {
        let server = MockServer::start(vec![
            (
                503,
                vec![],
                json!({ "error": { "message": "temporary-upstream-secret" } }).to_string(),
            ),
            (
                200,
                vec![],
                json!({
                    "choices": [{ "message": { "content": "{\"answer\":\"recovered\"}" }, "finish_reason": "stop" }]
                })
                .to_string(),
            ),
        ]);
        let result = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap();
        assert_eq!(result.value.answer, "recovered");
        assert_eq!(result.retry_count, 1);
        assert_eq!(server.captured().len(), 2);
        drop(server);
    }

    #[tokio::test]
    async fn ordinary_4xx_is_not_retried_or_exposed() {
        let server = MockServer::start(vec![(
            401,
            vec![],
            json!({ "error": { "message": "credential-echo-must-not-escape" } }).to_string(),
        )]);
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::HttpStatus);
        assert_eq!(error.http_status, Some(401));
        assert!(!error.retryable);
        assert!(!error.to_string().contains("credential-echo"));
        assert_eq!(server.captured().len(), 1);
        drop(server);
    }

    #[tokio::test]
    async fn empty_model_text_is_rejected_without_a_second_request() {
        let server = MockServer::start(vec![(
            200,
            vec![],
            json!({
                "choices": [{ "message": { "content": "" }, "finish_reason": "stop" }]
            })
            .to_string(),
        )]);
        let mut bounded_request = request();
        bounded_request.allow_structure_repair = false;
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &bounded_request,
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::InvalidStructuredOutput);
        assert!(!error.retryable);
        assert_eq!(server.captured().len(), 1);
        drop(server);
    }

    #[tokio::test]
    async fn oversized_response_is_rejected_without_exposing_its_body() {
        let secret_body = format!(
            "{{\"choices\":[{{\"message\":{{\"content\":\"{}\"}}}}]}}",
            "oversized-secret-response-body".repeat(16)
        );
        let server = MockServer::start(vec![(200, vec![], secret_body)]);
        let mut bounded_request = request();
        bounded_request.max_response_bytes = 64;
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &bounded_request,
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::ResponseTooLarge);
        assert!(!error.retryable);
        assert!(!error.to_string().contains("oversized-secret-response-body"));
        assert_eq!(server.captured().len(), 1);
        drop(server);
    }

    #[tokio::test]
    async fn blocks_cross_origin_redirect_without_contacting_destination() {
        let server = MockServer::start(vec![(
            302,
            vec![(
                "Location".to_string(),
                "http://127.0.0.1:9/v1/chat/completions".to_string(),
            )],
            "{}".to_string(),
        )]);
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::RedirectBlocked);
        assert_eq!(server.captured().len(), 1);
        drop(server);
    }

    #[tokio::test]
    async fn cancellation_prevents_any_network_request() {
        let server = MockServer::start(Vec::new());
        let (handle, cancellation) = ModelCancellation::channel();
        handle.cancel();
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                cancellation,
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::Cancelled);
        assert!(server.captured().is_empty());
        drop(server);
    }

    #[tokio::test]
    async fn cancellation_interrupts_endpoint_resolution() {
        let (handle, cancellation) = ModelCancellation::channel();
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(10)).await;
            handle.cancel();
        });
        let pending_resolution =
            std::future::pending::<Result<ValidatedEndpoint, ModelGatewayError>>();
        let error = tokio::time::timeout(
            Duration::from_millis(250),
            resolve_endpoint_with_cancellation(pending_resolution, cancellation),
        )
        .await
        .expect("endpoint resolution should observe cancellation")
        .unwrap_err();
        cancel_task.await.unwrap();
        assert_eq!(error.code, ModelGatewayErrorCode::Cancelled);
    }

    #[tokio::test]
    async fn in_flight_cancellation_stops_waiting_for_the_response() {
        let server = SlowMockServer::start(Duration::from_millis(200));
        let (handle, cancellation) = ModelCancellation::channel();
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            handle.cancel();
        });
        let error = gateway()
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                cancellation,
            )
            .await
            .unwrap_err();
        cancel_task.await.unwrap();
        assert_eq!(error.code, ModelGatewayErrorCode::Cancelled);
        drop(server);
    }

    #[tokio::test]
    async fn total_timeout_includes_endpoint_resolution() {
        let cancellation = ModelCancellation::never();
        let operation = async move {
            let _endpoint = resolve_endpoint_with_cancellation(
                std::future::pending::<Result<ValidatedEndpoint, ModelGatewayError>>(),
                cancellation,
            )
            .await?;
            unreachable!("a pending endpoint resolution cannot reach request execution")
        };
        let error = run_with_total_timeout::<ExampleOutput, _>(
            Duration::from_millis(20),
            Instant::now(),
            operation,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::Timeout);
    }

    #[tokio::test]
    async fn enforces_total_timeout_without_returning_transport_details() {
        let server = SlowMockServer::start(Duration::from_millis(200));
        let short_gateway = AgentModelGateway::with_limits(ModelGatewayLimits {
            connect_timeout: Duration::from_secs(1),
            planner_timeout: Duration::from_millis(20),
            simple_writer_timeout: Duration::from_millis(20),
            deep_writer_timeout: Duration::from_millis(20),
            revision_writer_timeout: Duration::from_millis(20),
        });
        let error = short_gateway
            .execute_structured::<ExampleOutput>(
                &profile(
                    AgentModelProtocol::OpenaiChatCompletions,
                    server.base_url.clone(),
                ),
                "test-secret",
                &request(),
                ModelCancellation::never(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, ModelGatewayErrorCode::Timeout);
        assert!(!error.message.contains(&server.base_url));
        drop(server);
    }

    #[test]
    fn profile_hash_excludes_credentials_and_changes_with_protocol_config() {
        let mut value = profile(
            AgentModelProtocol::OpenaiChatCompletions,
            "https://api.example.com".to_string(),
        );
        let first = value.config_hash().unwrap();
        assert!(!first.contains("secret"));
        value.protocol = AgentModelProtocol::OpenaiResponses;
        assert_ne!(first, value.config_hash().unwrap());
    }
}
