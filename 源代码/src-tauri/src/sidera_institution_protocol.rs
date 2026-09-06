//! Redacted, in-memory helpers for institution WebView2 protocol capture.
//!
//! This module intentionally has no Tauri command surface. Raw DevTools payloads and
//! cookie values are process-local secrets: they are neither `Serialize` nor printable,
//! and their backing buffers are overwritten when cleared or dropped.

use serde::de::{DeserializeSeed, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, VecDeque};
use std::fmt;
use std::net::Ipv6Addr;
use std::str::FromStr;

pub(crate) const MAX_RAW_PROTOCOL_EVENT_BYTES: usize = 256 * 1024;
pub(crate) const MAX_RESPONSE_BODY_BYTES: usize = 512 * 1024;
pub(crate) const MAX_REDACTED_EVENTS: usize = 128;
const MAX_REDACTED_EVENT_BYTES: usize = 32 * 1024;
const MAX_FIELD_NAMES: usize = 64;
const MAX_FIELD_NAME_CHARS: usize = 128;
const MAX_PATH_CHARS: usize = 2_048;
const MAX_JSON_DEPTH: usize = 12;
const MAX_JSON_NODES: usize = 1_024;
const MAX_ARRAY_SCHEMA_VARIANTS: usize = 8;
const MAX_COOKIES: usize = 256;
const MAX_COOKIE_VALUE_BYTES: usize = 64 * 1024;
const MAX_COOKIE_TOTAL_BYTES: usize = 256 * 1024;

pub(crate) const WEBVIEW2_PROTOCOL_UNSUPPORTED: &str =
    "SIDERA_INSTITUTION_PROTOCOL_WEBVIEW2_UNSUPPORTED";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InstitutionProtocolError {
    HttpsRequired,
    InvalidUrl,
    InvalidMethod,
    InvalidFieldName,
    InvalidStatus,
    RawEventTooLarge,
    ResponseBodyTooLarge,
    RedactedEventTooLarge,
    InvalidProtocolPayload,
    Unsupported,
    WebView2Failure,
    CookieLimitExceeded,
    Base64ResponseUnsupported,
}

impl InstitutionProtocolError {
    pub(crate) const fn code(self) -> &'static str {
        match self {
            Self::HttpsRequired => "SIDERA_INSTITUTION_PROTOCOL_HTTPS_REQUIRED",
            Self::InvalidUrl => "SIDERA_INSTITUTION_PROTOCOL_INVALID_URL",
            Self::InvalidMethod => "SIDERA_INSTITUTION_PROTOCOL_INVALID_METHOD",
            Self::InvalidFieldName => "SIDERA_INSTITUTION_PROTOCOL_INVALID_FIELD_NAME",
            Self::InvalidStatus => "SIDERA_INSTITUTION_PROTOCOL_INVALID_STATUS",
            Self::RawEventTooLarge => "SIDERA_INSTITUTION_PROTOCOL_RAW_EVENT_TOO_LARGE",
            Self::ResponseBodyTooLarge => "SIDERA_INSTITUTION_PROTOCOL_RESPONSE_BODY_TOO_LARGE",
            Self::RedactedEventTooLarge => "SIDERA_INSTITUTION_PROTOCOL_REDACTED_EVENT_TOO_LARGE",
            Self::InvalidProtocolPayload => "SIDERA_INSTITUTION_PROTOCOL_INVALID_PAYLOAD",
            Self::Unsupported => WEBVIEW2_PROTOCOL_UNSUPPORTED,
            Self::WebView2Failure => "SIDERA_INSTITUTION_PROTOCOL_WEBVIEW2_FAILURE",
            Self::CookieLimitExceeded => "SIDERA_INSTITUTION_PROTOCOL_COOKIE_LIMIT_EXCEEDED",
            Self::Base64ResponseUnsupported => {
                "SIDERA_INSTITUTION_PROTOCOL_BASE64_RESPONSE_UNSUPPORTED"
            }
        }
    }
}

impl fmt::Display for InstitutionProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for InstitutionProtocolError {}

/// A non-printable, non-serializable buffer for short-lived protocol secrets.
pub(crate) struct SecretBytes(Vec<u8>);

impl SecretBytes {
    pub(crate) fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }

    pub(crate) fn from_string(value: String) -> Self {
        Self(value.into_bytes())
    }

    pub(crate) fn len(&self) -> usize {
        self.0.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub(crate) fn as_slice(&self) -> &[u8] {
        &self.0
    }

    fn as_utf8(&self) -> Result<&str, InstitutionProtocolError> {
        std::str::from_utf8(&self.0).map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)
    }

    pub(crate) fn clear(&mut self) {
        self.0.fill(0);
        self.0.clear();
    }
}

impl fmt::Debug for SecretBytes {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SecretBytes([REDACTED])")
    }
}

impl Drop for SecretBytes {
    fn drop(&mut self) {
        self.clear();
    }
}

impl<'de> Deserialize<'de> for SecretBytes {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct SecretVisitor;

        impl<'de> Visitor<'de> for SecretVisitor {
            type Value = SecretBytes;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a string held in a redacted buffer")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(SecretBytes::new(value.as_bytes().to_vec()))
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(SecretBytes::from_string(value))
            }
        }

        deserializer.deserialize_string(SecretVisitor)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProtocolResourceKind {
    Document,
    Stylesheet,
    Image,
    Media,
    Font,
    Script,
    TextTrack,
    Xhr,
    Fetch,
    EventSource,
    WebSocket,
    Manifest,
    SignedExchange,
    Ping,
    CspViolationReport,
    Preflight,
    #[default]
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum InstitutionProtocolTransportEvidence {
    StructuredApi,
    SessionWebRequest,
    DomFallback,
}

impl ProtocolResourceKind {
    fn from_devtools(value: Option<&str>) -> Self {
        match value.unwrap_or_default().to_ascii_lowercase().as_str() {
            "document" => Self::Document,
            "stylesheet" => Self::Stylesheet,
            "image" => Self::Image,
            "media" => Self::Media,
            "font" => Self::Font,
            "script" => Self::Script,
            "texttrack" => Self::TextTrack,
            "xhr" => Self::Xhr,
            "fetch" => Self::Fetch,
            "eventsource" => Self::EventSource,
            "websocket" => Self::WebSocket,
            "manifest" => Self::Manifest,
            "signedexchange" => Self::SignedExchange,
            "ping" => Self::Ping,
            "cspviolationreport" => Self::CspViolationReport,
            "preflight" => Self::Preflight,
            _ => Self::Other,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct RedactedProtocolRequest {
    pub(crate) method: String,
    pub(crate) https_host: String,
    pub(crate) path: String,
    pub(crate) resource_kind: ProtocolResourceKind,
    pub(crate) query_fields: Vec<String>,
    pub(crate) body_fields: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct RedactedProtocolResponse {
    pub(crate) https_host: String,
    pub(crate) path: String,
    pub(crate) status: u16,
    pub(crate) content_type: String,
    pub(crate) resource_kind: ProtocolResourceKind,
    pub(crate) json_schema: Option<RedactedJsonSchema>,
    pub(crate) body_size_bytes: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "snake_case")]
pub(crate) enum RedactedProtocolEvent {
    Request(RedactedProtocolRequest),
    Response(RedactedProtocolResponse),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum RedactedJsonSchema {
    Null,
    Boolean,
    Number,
    String,
    Array {
        variants: Vec<RedactedJsonSchema>,
        truncated: bool,
    },
    Object {
        fields: BTreeMap<String, RedactedJsonSchema>,
        truncated: bool,
    },
    Truncated,
}

#[derive(Default)]
pub(crate) struct InstitutionProtocolSession {
    events: VecDeque<RedactedProtocolEvent>,
}

impl InstitutionProtocolSession {
    pub(crate) fn push(
        &mut self,
        event: RedactedProtocolEvent,
    ) -> Result<(), InstitutionProtocolError> {
        let encoded_size = serde_json::to_vec(&event)
            .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?
            .len();
        if encoded_size > MAX_REDACTED_EVENT_BYTES {
            return Err(InstitutionProtocolError::RedactedEventTooLarge);
        }
        while self.events.len() >= MAX_REDACTED_EVENTS {
            self.events.pop_front();
        }
        self.events.push_back(event);
        Ok(())
    }

    pub(crate) fn snapshot(&self) -> Vec<RedactedProtocolEvent> {
        self.events.iter().cloned().collect()
    }

    pub(crate) fn len(&self) -> usize {
        self.events.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub(crate) fn clear(&mut self) {
        self.events.clear();
    }
}

/// Chooses the strongest *observed* route without claiming that Sidera can
/// already execute it.  A JSON XHR/fetch response is evidence for a possible
/// structured connector; an opaque XHR/fetch is evidence for a same-session
/// request route.  The runtime must still use `DomFallback` as the actual
/// transport until a versioned parser/request implementation consumes that
/// route.
pub(crate) fn select_protocol_transport(
    events: &[RedactedProtocolEvent],
) -> InstitutionProtocolTransportEvidence {
    let mut saw_session_request = false;
    for event in events {
        match event {
            RedactedProtocolEvent::Response(response)
                if matches!(
                    response.resource_kind,
                    ProtocolResourceKind::Xhr | ProtocolResourceKind::Fetch
                ) && response.json_schema.is_some() =>
            {
                return InstitutionProtocolTransportEvidence::StructuredApi;
            }
            RedactedProtocolEvent::Request(request)
                if matches!(
                    request.resource_kind,
                    ProtocolResourceKind::Xhr | ProtocolResourceKind::Fetch
                ) =>
            {
                saw_session_request = true;
            }
            RedactedProtocolEvent::Response(response)
                if matches!(
                    response.resource_kind,
                    ProtocolResourceKind::Xhr | ProtocolResourceKind::Fetch
                ) =>
            {
                saw_session_request = true;
            }
            _ => {}
        }
    }
    if saw_session_request {
        InstitutionProtocolTransportEvidence::SessionWebRequest
    } else {
        InstitutionProtocolTransportEvidence::DomFallback
    }
}

struct RedactedLocation {
    host: String,
    path: String,
    query_fields: Vec<String>,
}

pub(crate) fn redact_request(
    method: &str,
    raw_url: &SecretBytes,
    resource_kind: ProtocolResourceKind,
    body_field_names: impl IntoIterator<Item = String>,
) -> Result<RedactedProtocolRequest, InstitutionProtocolError> {
    let location = redact_https_location(raw_url.as_utf8()?)?;
    let method = sanitize_method(method)?;
    let body_fields = sanitize_field_names(body_field_names)?;
    Ok(RedactedProtocolRequest {
        method,
        https_host: location.host,
        path: location.path,
        resource_kind,
        query_fields: location.query_fields,
        body_fields,
    })
}

pub(crate) fn redact_response(
    raw_url: &SecretBytes,
    status: u16,
    content_type: &str,
    resource_kind: ProtocolResourceKind,
) -> Result<RedactedProtocolResponse, InstitutionProtocolError> {
    if !(100..=599).contains(&status) {
        return Err(InstitutionProtocolError::InvalidStatus);
    }
    let location = redact_https_location(raw_url.as_utf8()?)?;
    Ok(RedactedProtocolResponse {
        https_host: location.host,
        path: location.path,
        status,
        content_type: sanitize_content_type(content_type),
        resource_kind,
        json_schema: None,
        body_size_bytes: None,
    })
}

pub(crate) fn attach_response_body_schema(
    response: &mut RedactedProtocolResponse,
    mut body: SecretBytes,
) -> Result<(), InstitutionProtocolError> {
    let result = inspect_response_body_schema(response, &body);
    body.clear();
    result
}

pub(crate) fn inspect_response_body_schema(
    response: &mut RedactedProtocolResponse,
    body: &SecretBytes,
) -> Result<(), InstitutionProtocolError> {
    let body_size = body.len();
    if body_size > MAX_RESPONSE_BODY_BYTES {
        return Err(InstitutionProtocolError::ResponseBodyTooLarge);
    }

    response.body_size_bytes = Some(body_size);
    if is_json_content_type(&response.content_type) && !body.is_empty() {
        response.json_schema = Some(parse_json_schema(body.as_slice())?);
    }
    Ok(())
}

fn parse_json_schema(bytes: &[u8]) -> Result<RedactedJsonSchema, InstitutionProtocolError> {
    let mut budget = SchemaBudget {
        remaining_nodes: MAX_JSON_NODES,
    };
    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    let schema = SchemaSeed {
        budget: &mut budget,
        depth: 0,
    }
    .deserialize(&mut deserializer)
    .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
    deserializer
        .end()
        .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
    Ok(schema)
}

struct SchemaBudget {
    remaining_nodes: usize,
}

struct SchemaSeed<'a> {
    budget: &'a mut SchemaBudget,
    depth: usize,
}

impl<'de> DeserializeSeed<'de> for SchemaSeed<'_> {
    type Value = RedactedJsonSchema;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        if self.budget.remaining_nodes == 0 || self.depth > MAX_JSON_DEPTH {
            IgnoredAny::deserialize(deserializer)?;
            return Ok(RedactedJsonSchema::Truncated);
        }
        self.budget.remaining_nodes -= 1;
        deserializer.deserialize_any(SchemaVisitor {
            budget: self.budget,
            depth: self.depth,
        })
    }
}

struct SchemaVisitor<'a> {
    budget: &'a mut SchemaBudget,
    depth: usize,
}

impl<'de> Visitor<'de> for SchemaVisitor<'_> {
    type Value = RedactedJsonSchema;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("any JSON value")
    }

    fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::Boolean)
    }

    fn visit_i64<E>(self, _value: i64) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::Number)
    }

    fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::Number)
    }

    fn visit_f64<E>(self, _value: f64) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::Number)
    }

    fn visit_str<E>(self, _value: &str) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::String)
    }

    fn visit_string<E>(self, _value: String) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::String)
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::Null)
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(RedactedJsonSchema::Null)
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        SchemaSeed {
            budget: self.budget,
            depth: self.depth + 1,
        }
        .deserialize(deserializer)
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut variants = Vec::new();
        let mut truncated = false;
        while let Some(schema) = sequence.next_element_seed(SchemaSeed {
            budget: self.budget,
            depth: self.depth + 1,
        })? {
            if variants.contains(&schema) {
                continue;
            }
            if variants.len() < MAX_ARRAY_SCHEMA_VARIANTS {
                variants.push(schema);
            } else {
                truncated = true;
            }
        }
        Ok(RedactedJsonSchema::Array {
            variants,
            truncated,
        })
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut fields = BTreeMap::new();
        let mut truncated = false;
        while let Some(key) = map.next_key::<String>()? {
            if fields.len() >= MAX_FIELD_NAMES {
                map.next_value::<IgnoredAny>()?;
                truncated = true;
                continue;
            }
            let safe_key = redact_json_field_name(&key);
            let schema = map.next_value_seed(SchemaSeed {
                budget: self.budget,
                depth: self.depth + 1,
            })?;
            fields.entry(safe_key).or_insert(schema);
        }
        Ok(RedactedJsonSchema::Object { fields, truncated })
    }
}

fn sanitize_method(method: &str) -> Result<String, InstitutionProtocolError> {
    let method = method.trim().to_ascii_uppercase();
    if method.is_empty()
        || method.len() > 16
        || !method
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte == b'-')
    {
        return Err(InstitutionProtocolError::InvalidMethod);
    }
    Ok(method)
}

fn sanitize_content_type(value: &str) -> String {
    value
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|character| character.is_ascii_graphic())
        .take(MAX_FIELD_NAME_CHARS)
        .collect()
}

fn is_json_content_type(value: &str) -> bool {
    value == "application/json" || value.ends_with("+json") || value == "text/json"
}

fn sanitize_field_names(
    fields: impl IntoIterator<Item = String>,
) -> Result<Vec<String>, InstitutionProtocolError> {
    let mut safe = Vec::new();
    for field in fields {
        if safe.len() >= MAX_FIELD_NAMES {
            break;
        }
        let trimmed = field.trim();
        if trimmed.is_empty()
            || trimmed.chars().count() > MAX_FIELD_NAME_CHARS
            || !trimmed.chars().all(is_safe_field_character)
        {
            return Err(InstitutionProtocolError::InvalidFieldName);
        }
        safe.push(trimmed.to_string());
    }
    safe.sort_unstable();
    safe.dedup();
    Ok(safe)
}

fn is_safe_field_character(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '-' | '.' | '[' | ']' | ':')
}

fn redact_json_field_name(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    if [
        "password",
        "passwd",
        "secret",
        "token",
        "ticket",
        "cookie",
        "authorization",
        "api_key",
        "apikey",
        "session",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
    {
        return "[sensitive-field]".to_string();
    }

    let sanitized: String = value
        .chars()
        .take(MAX_FIELD_NAME_CHARS)
        .map(|character| {
            if is_safe_field_character(character) {
                character
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() {
        "[unnamed-field]".to_string()
    } else {
        sanitized
    }
}

fn redact_https_location(raw_url: &str) -> Result<RedactedLocation, InstitutionProtocolError> {
    let scheme_end = raw_url
        .find("://")
        .ok_or(InstitutionProtocolError::InvalidUrl)?;
    if !raw_url[..scheme_end].eq_ignore_ascii_case("https") {
        return Err(InstitutionProtocolError::HttpsRequired);
    }

    let remainder = &raw_url[scheme_end + 3..];
    let authority_end = remainder.find(['/', '?', '#']).unwrap_or(remainder.len());
    let authority = &remainder[..authority_end];
    if authority.is_empty() || authority.contains('@') {
        return Err(InstitutionProtocolError::InvalidUrl);
    }
    let host = sanitize_https_host(authority)?;

    let suffix = &remainder[authority_end..];
    let fragment_start = suffix.find('#').unwrap_or(suffix.len());
    let before_fragment = &suffix[..fragment_start];
    let query_start = before_fragment.find('?');
    let path = match query_start {
        Some(index) => &before_fragment[..index],
        None => before_fragment,
    };
    let path = if path.is_empty() { "/" } else { path };
    if !path.starts_with('/')
        || path.chars().count() > MAX_PATH_CHARS
        || path.chars().any(char::is_control)
    {
        return Err(InstitutionProtocolError::InvalidUrl);
    }

    let query_fields = match query_start {
        Some(index) => extract_query_field_names(&before_fragment[index + 1..])?,
        None => Vec::new(),
    };
    Ok(RedactedLocation {
        host,
        path: path.to_string(),
        query_fields,
    })
}

fn sanitize_https_host(authority: &str) -> Result<String, InstitutionProtocolError> {
    let host = if let Some(stripped) = authority.strip_prefix('[') {
        let closing = stripped
            .find(']')
            .ok_or(InstitutionProtocolError::InvalidUrl)?;
        let address = &stripped[..closing];
        Ipv6Addr::from_str(address).map_err(|_| InstitutionProtocolError::InvalidUrl)?;
        let tail = &stripped[closing + 1..];
        if !tail.is_empty()
            && (!tail.starts_with(':')
                || tail[1..].is_empty()
                || !tail[1..].bytes().all(|byte| byte.is_ascii_digit()))
        {
            return Err(InstitutionProtocolError::InvalidUrl);
        }
        format!("[{address}]")
    } else {
        let (host, port) = match authority.rsplit_once(':') {
            Some((candidate, port)) if !candidate.contains(':') => (candidate, Some(port)),
            Some(_) => return Err(InstitutionProtocolError::InvalidUrl),
            None => (authority, None),
        };
        if let Some(port) = port {
            if port.is_empty() || !port.bytes().all(|byte| byte.is_ascii_digit()) {
                return Err(InstitutionProtocolError::InvalidUrl);
            }
        }
        if host.is_empty()
            || host.len() > 253
            || !host
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
        {
            return Err(InstitutionProtocolError::InvalidUrl);
        }
        host.to_string()
    };
    Ok(host.to_ascii_lowercase())
}

fn extract_query_field_names(query: &str) -> Result<Vec<String>, InstitutionProtocolError> {
    let keys = query.split('&').filter_map(|part| {
        let raw_key = part.split_once('=').map_or(part, |(key, _value)| key);
        if raw_key.is_empty() {
            None
        } else {
            Some(percent_decode_query_key(raw_key))
        }
    });
    sanitize_field_names(keys.collect::<Result<Vec<_>, _>>()?)
}

fn percent_decode_query_key(value: &str) -> Result<String, InstitutionProtocolError> {
    let source = value.as_bytes();
    let mut decoded = Vec::with_capacity(source.len());
    let mut index = 0;
    while index < source.len() {
        match source[index] {
            b'%' if index + 2 < source.len() => {
                let high = hex_value(source[index + 1])?;
                let low = hex_value(source[index + 2])?;
                decoded.push((high << 4) | low);
                index += 3;
            }
            b'%' => return Err(InstitutionProtocolError::InvalidFieldName),
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).map_err(|_| InstitutionProtocolError::InvalidFieldName)
}

fn hex_value(byte: u8) -> Result<u8, InstitutionProtocolError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(InstitutionProtocolError::InvalidFieldName),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WebView2NetworkEvent {
    RequestWillBeSent,
    ResponseReceived,
}

impl WebView2NetworkEvent {
    #[cfg(windows)]
    const fn as_devtools_name(self) -> &'static str {
        match self {
            Self::RequestWillBeSent => "Network.requestWillBeSent",
            Self::ResponseReceived => "Network.responseReceived",
        }
    }
}

/// Internal capture result. It deliberately has no `Serialize` implementation.
pub(crate) struct CapturedProtocolEvent {
    request_id: SecretBytes,
    redacted: RedactedProtocolEvent,
}

impl CapturedProtocolEvent {
    pub(crate) fn redacted(&self) -> &RedactedProtocolEvent {
        &self.redacted
    }

    pub(crate) fn into_redacted(self) -> RedactedProtocolEvent {
        self.redacted
    }

    pub(crate) fn request_id(&self) -> &SecretBytes {
        &self.request_id
    }

    pub(crate) fn request_key(&self) -> [u8; 32] {
        Sha256::digest(self.request_id.as_slice()).into()
    }
}

impl fmt::Debug for CapturedProtocolEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CapturedProtocolEvent")
            .field("request_id", &"[REDACTED]")
            .field("redacted", &self.redacted)
            .finish()
    }
}

/// The only information retained from `Network.loadingFinished`. The opaque
/// DevTools request id never leaves this process and is cleared on drop; its
/// SHA-256 key is used to join the already-redacted request/response metadata.
pub(crate) struct CapturedRequestId {
    request_id: SecretBytes,
}

impl CapturedRequestId {
    pub(crate) fn request_id(&self) -> &SecretBytes {
        &self.request_id
    }

    pub(crate) fn request_key(&self) -> [u8; 32] {
        Sha256::digest(self.request_id.as_slice()).into()
    }
}

impl fmt::Debug for CapturedRequestId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CapturedRequestId")
            .field("request_id", &"[REDACTED]")
            .finish()
    }
}

#[derive(Deserialize)]
struct DevToolsRequestIdEnvelope {
    #[serde(rename = "requestId")]
    request_id: SecretBytes,
}

pub(crate) fn capture_devtools_request_id(
    raw_json: SecretBytes,
) -> Result<CapturedRequestId, InstitutionProtocolError> {
    if raw_json.len() > MAX_RAW_PROTOCOL_EVENT_BYTES {
        return Err(InstitutionProtocolError::RawEventTooLarge);
    }
    let envelope: DevToolsRequestIdEnvelope = serde_json::from_slice(raw_json.as_slice())
        .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
    if envelope.request_id.is_empty() || envelope.request_id.len() > 256 {
        return Err(InstitutionProtocolError::InvalidProtocolPayload);
    }
    Ok(CapturedRequestId {
        request_id: envelope.request_id,
    })
}

#[derive(Deserialize)]
struct DevToolsRequestEnvelope {
    #[serde(rename = "requestId")]
    request_id: SecretBytes,
    #[serde(rename = "type")]
    resource_type: Option<String>,
    request: DevToolsRequest,
}

#[derive(Deserialize)]
struct DevToolsRequest {
    url: SecretBytes,
    method: String,
    // `postData`, headers, cookies, and credentials are intentionally not deserialized.
}

#[derive(Deserialize)]
struct DevToolsResponseEnvelope {
    #[serde(rename = "requestId")]
    request_id: SecretBytes,
    #[serde(rename = "type")]
    resource_type: Option<String>,
    response: DevToolsResponse,
}

#[derive(Deserialize)]
struct DevToolsResponse {
    url: SecretBytes,
    status: f64,
    #[serde(rename = "mimeType")]
    mime_type: String,
    // Headers, security details, and remote addresses are intentionally ignored.
}

pub(crate) fn redact_devtools_network_event(
    event: WebView2NetworkEvent,
    raw_json: SecretBytes,
) -> Result<CapturedProtocolEvent, InstitutionProtocolError> {
    if raw_json.len() > MAX_RAW_PROTOCOL_EVENT_BYTES {
        return Err(InstitutionProtocolError::RawEventTooLarge);
    }
    match event {
        WebView2NetworkEvent::RequestWillBeSent => {
            let envelope: DevToolsRequestEnvelope = serde_json::from_slice(raw_json.as_slice())
                .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
            let redacted = redact_request(
                &envelope.request.method,
                &envelope.request.url,
                ProtocolResourceKind::from_devtools(envelope.resource_type.as_deref()),
                std::iter::empty(),
            )?;
            Ok(CapturedProtocolEvent {
                request_id: envelope.request_id,
                redacted: RedactedProtocolEvent::Request(redacted),
            })
        }
        WebView2NetworkEvent::ResponseReceived => {
            let envelope: DevToolsResponseEnvelope = serde_json::from_slice(raw_json.as_slice())
                .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
            if !envelope.response.status.is_finite()
                || envelope.response.status.fract() != 0.0
                || envelope.response.status < 0.0
                || envelope.response.status > u16::MAX as f64
            {
                return Err(InstitutionProtocolError::InvalidStatus);
            }
            let redacted = redact_response(
                &envelope.response.url,
                envelope.response.status as u16,
                &envelope.response.mime_type,
                ProtocolResourceKind::from_devtools(envelope.resource_type.as_deref()),
            )?;
            Ok(CapturedProtocolEvent {
                request_id: envelope.request_id,
                redacted: RedactedProtocolEvent::Response(redacted),
            })
        }
    }
}

#[derive(Deserialize)]
struct DevToolsResponseBody {
    body: SecretBytes,
    #[serde(rename = "base64Encoded")]
    base64_encoded: bool,
}

pub(crate) fn decode_devtools_response_body(
    raw_result: SecretBytes,
) -> Result<SecretBytes, InstitutionProtocolError> {
    if raw_result.len() > MAX_RESPONSE_BODY_BYTES.saturating_mul(2) {
        return Err(InstitutionProtocolError::ResponseBodyTooLarge);
    }
    let result: DevToolsResponseBody = serde_json::from_slice(raw_result.as_slice())
        .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
    if result.base64_encoded {
        return Err(InstitutionProtocolError::Base64ResponseUnsupported);
    }
    if result.body.len() > MAX_RESPONSE_BODY_BYTES {
        return Err(InstitutionProtocolError::ResponseBodyTooLarge);
    }
    Ok(result.body)
}

pub(crate) struct EphemeralCookieJar {
    scope_host: String,
    cookies: Vec<EphemeralCookie>,
    total_value_bytes: usize,
}

struct EphemeralCookie {
    name: String,
    value: SecretBytes,
    path: String,
}

impl fmt::Debug for EphemeralCookieJar {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EphemeralCookieJar")
            .field("scope_host", &self.scope_host)
            .field("cookie_count", &self.cookies.len())
            .field("values", &"[REDACTED]")
            .finish()
    }
}

impl EphemeralCookieJar {
    fn new(scope_host: String) -> Self {
        Self {
            scope_host,
            cookies: Vec::new(),
            total_value_bytes: 0,
        }
    }

    fn push(
        &mut self,
        name: String,
        value: SecretBytes,
        path: String,
    ) -> Result<(), InstitutionProtocolError> {
        if self.cookies.len() >= MAX_COOKIES
            || value.len() > MAX_COOKIE_VALUE_BYTES
            || self.total_value_bytes.saturating_add(value.len()) > MAX_COOKIE_TOTAL_BYTES
        {
            return Err(InstitutionProtocolError::CookieLimitExceeded);
        }
        self.total_value_bytes += value.len();
        self.cookies.push(EphemeralCookie { name, value, path });
        Ok(())
    }

    pub(crate) fn len(&self) -> usize {
        self.cookies.len()
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.cookies.is_empty()
    }

    pub(crate) fn clear(&mut self) {
        self.cookies.clear();
        self.total_value_bytes = 0;
    }

    /// Applies cookies directly to an HTTP request. Cookie bytes are never returned to the caller.
    pub(crate) fn apply_to_request(
        &self,
        request: reqwest::RequestBuilder,
        target_url: &SecretBytes,
    ) -> Result<reqwest::RequestBuilder, InstitutionProtocolError> {
        let location = redact_https_location(target_url.as_utf8()?)?;
        if location.host != self.scope_host {
            return Err(InstitutionProtocolError::InvalidUrl);
        }

        let mut header = SecretBytes::new(Vec::with_capacity(self.total_value_bytes + 64));
        for cookie in &self.cookies {
            if !cookie_path_matches(&location.path, &cookie.path) {
                continue;
            }
            if !header.0.is_empty() {
                header.0.extend_from_slice(b"; ");
            }
            header.0.extend_from_slice(cookie.name.as_bytes());
            header.0.push(b'=');
            header.0.extend_from_slice(cookie.value.as_slice());
        }
        let mut value = reqwest::header::HeaderValue::from_bytes(header.as_slice())
            .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
        value.set_sensitive(true);
        let request = request.header(reqwest::header::COOKIE, value);
        header.clear();
        Ok(request)
    }
}

fn cookie_path_matches(request_path: &str, cookie_path: &str) -> bool {
    request_path == cookie_path
        || (request_path.starts_with(cookie_path)
            && (cookie_path.ends_with('/')
                || request_path
                    .as_bytes()
                    .get(cookie_path.len())
                    .is_some_and(|byte| *byte == b'/')))
}

impl Drop for EphemeralCookieJar {
    fn drop(&mut self) {
        self.clear();
    }
}

#[cfg(windows)]
mod webview2_bridge {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2DevToolsProtocolEventReceiver, ICoreWebView2_2,
    };
    use webview2_com::{
        CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler,
        GetCookiesCompletedHandler,
    };
    use windows_core::{Interface, HSTRING, PWSTR};
    use windows_sys::Win32::System::Com::CoTaskMemFree;

    pub(crate) struct WebView2ProtocolSubscription {
        receiver: ICoreWebView2DevToolsProtocolEventReceiver,
        token: i64,
    }

    #[derive(Clone, Copy)]
    pub(crate) enum WebView2MouseEventKind {
        Moved,
        Pressed,
        Released,
    }

    thread_local! {
        /// WebView2 event receivers are apartment-bound COM values and therefore must never
        /// enter Tauri managed state (which is required to be Send + Sync). Tauri executes
        /// `Webview::with_webview` callbacks on the UI thread, so that thread owns the
        /// subscriptions for their complete lifetime.
        static ACTIVE_PROTOCOL_SUBSCRIPTIONS:
            RefCell<HashMap<String, Vec<WebView2ProtocolSubscription>>> =
                RefCell::new(HashMap::new());
    }

    impl Drop for WebView2ProtocolSubscription {
        fn drop(&mut self) {
            unsafe {
                let _ = self
                    .receiver
                    .remove_DevToolsProtocolEventReceived(self.token);
            }
        }
    }

    pub(crate) fn retain_protocol_subscriptions(
        webview_label: String,
        subscriptions: Vec<WebView2ProtocolSubscription>,
    ) {
        ACTIVE_PROTOCOL_SUBSCRIPTIONS.with(|active| {
            active.borrow_mut().insert(webview_label, subscriptions);
        });
    }

    pub(crate) fn clear_protocol_subscriptions() {
        ACTIVE_PROTOCOL_SUBSCRIPTIONS.with(|active| active.borrow_mut().clear());
    }

    unsafe fn subscribe_devtools_event<F>(
        core: &ICoreWebView2,
        event_name: &'static str,
        callback: F,
    ) -> Result<WebView2ProtocolSubscription, InstitutionProtocolError>
    where
        F: Fn(SecretBytes) + 'static,
    {
        let event_name = HSTRING::from(event_name);
        let receiver = core
            .GetDevToolsProtocolEventReceiver(&event_name)
            .map_err(|_| InstitutionProtocolError::WebView2Failure)?;
        let handler =
            DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut raw = PWSTR::null();
                args.ParameterObjectAsJson(&mut raw)?;
                let converted = if raw.is_null() {
                    Err(InstitutionProtocolError::InvalidProtocolPayload)
                } else {
                    raw.to_string()
                        .map(SecretBytes::from_string)
                        .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)
                };
                if !raw.is_null() {
                    CoTaskMemFree(raw.as_ptr().cast());
                }
                if let Ok(payload) = converted {
                    callback(payload);
                }
                Ok(())
            }));
        let mut token = 0_i64;
        receiver
            .add_DevToolsProtocolEventReceived(&handler, &mut token)
            .map_err(|_| InstitutionProtocolError::WebView2Failure)?;
        Ok(WebView2ProtocolSubscription { receiver, token })
    }

    pub(crate) unsafe fn subscribe_network_event<F>(
        core: &ICoreWebView2,
        event: WebView2NetworkEvent,
        callback: F,
    ) -> Result<WebView2ProtocolSubscription, InstitutionProtocolError>
    where
        F: Fn(SecretBytes) + 'static,
    {
        subscribe_devtools_event(core, event.as_devtools_name(), callback)
    }

    pub(crate) unsafe fn subscribe_loading_finished<F>(
        core: &ICoreWebView2,
        callback: F,
    ) -> Result<WebView2ProtocolSubscription, InstitutionProtocolError>
    where
        F: Fn(SecretBytes) + 'static,
    {
        subscribe_devtools_event(core, "Network.loadingFinished", callback)
    }

    fn call_devtools_method<F>(
        core: &ICoreWebView2,
        method: &'static str,
        parameters: String,
        callback: F,
    ) -> Result<(), InstitutionProtocolError>
    where
        F: FnOnce(Result<SecretBytes, InstitutionProtocolError>) + 'static,
    {
        let callback = Arc::new(Mutex::new(Some(callback)));
        let callback_for_handler = Arc::clone(&callback);
        let handler =
            CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, raw| {
                let result = if status.is_err() || raw.is_empty() {
                    Err(InstitutionProtocolError::WebView2Failure)
                } else {
                    Ok(SecretBytes::from_string(raw))
                };
                if let Ok(mut locked) = callback_for_handler.lock() {
                    if let Some(callback) = locked.take() {
                        callback(result);
                    }
                }
                Ok(())
            }));
        let method = HSTRING::from(method);
        let parameters = HSTRING::from(parameters);
        unsafe {
            core.CallDevToolsProtocolMethod(&method, &parameters, &handler)
                .map_err(|_| InstitutionProtocolError::WebView2Failure)
        }
    }

    pub(crate) fn enable_network<F>(
        core: &ICoreWebView2,
        callback: F,
    ) -> Result<(), InstitutionProtocolError>
    where
        F: FnOnce(Result<(), InstitutionProtocolError>) + 'static,
    {
        call_devtools_method(core, "Network.enable", "{}".to_string(), move |result| {
            callback(result.map(|_| ()))
        })
    }

    pub(crate) fn get_response_body<F>(
        core: &ICoreWebView2,
        request_id: &SecretBytes,
        callback: F,
    ) -> Result<(), InstitutionProtocolError>
    where
        F: FnOnce(Result<SecretBytes, InstitutionProtocolError>) + 'static,
    {
        let request_id = request_id.as_utf8()?;
        if request_id.is_empty()
            || request_id.len() > 256
            || !request_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
        {
            return Err(InstitutionProtocolError::InvalidProtocolPayload);
        }
        let parameters = serde_json::to_string(&serde_json::json!({ "requestId": request_id }))
            .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
        call_devtools_method(core, "Network.getResponseBody", parameters, callback)
    }

    pub(crate) fn dispatch_primary_mouse_event<F>(
        core: &ICoreWebView2,
        kind: WebView2MouseEventKind,
        x: f64,
        y: f64,
        callback: F,
    ) -> Result<(), InstitutionProtocolError>
    where
        F: FnOnce(Result<(), InstitutionProtocolError>) + 'static,
    {
        if !x.is_finite()
            || !y.is_finite()
            || !(0.0..=32_768.0).contains(&x)
            || !(0.0..=32_768.0).contains(&y)
        {
            return Err(InstitutionProtocolError::InvalidProtocolPayload);
        }
        let parameters = match kind {
            WebView2MouseEventKind::Moved => serde_json::json!({
                "type": "mouseMoved",
                "x": x,
                "y": y,
                "buttons": 0,
                "pointerType": "mouse",
            }),
            WebView2MouseEventKind::Pressed => serde_json::json!({
                "type": "mousePressed",
                "x": x,
                "y": y,
                "button": "left",
                "buttons": 1,
                "clickCount": 1,
                "pointerType": "mouse",
            }),
            WebView2MouseEventKind::Released => serde_json::json!({
                "type": "mouseReleased",
                "x": x,
                "y": y,
                "button": "left",
                "buttons": 0,
                "clickCount": 1,
                "pointerType": "mouse",
            }),
        };
        let parameters = serde_json::to_string(&parameters)
            .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)?;
        call_devtools_method(
            core,
            "Input.dispatchMouseEvent",
            parameters,
            move |result| callback(result.map(|_| ())),
        )
    }

    pub(crate) fn read_ephemeral_cookies<F>(
        core: &ICoreWebView2,
        https_url: &SecretBytes,
        callback: F,
    ) -> Result<(), InstitutionProtocolError>
    where
        F: FnOnce(Result<EphemeralCookieJar, InstitutionProtocolError>) + 'static,
    {
        let location = redact_https_location(https_url.as_utf8()?)?;
        let url = HSTRING::from(https_url.as_utf8()?);
        let core_v2: ICoreWebView2_2 = core
            .cast()
            .map_err(|_| InstitutionProtocolError::Unsupported)?;
        let manager = unsafe {
            core_v2
                .CookieManager()
                .map_err(|_| InstitutionProtocolError::WebView2Failure)?
        };
        let callback = Arc::new(Mutex::new(Some(callback)));
        let callback_for_handler = Arc::clone(&callback);
        let handler = GetCookiesCompletedHandler::create(Box::new(move |status, list| {
            let result = if status.is_err() {
                Err(InstitutionProtocolError::WebView2Failure)
            } else if let Some(list) = list {
                unsafe { collect_cookies(&list, location.host.clone()) }
            } else {
                Err(InstitutionProtocolError::WebView2Failure)
            };
            if let Ok(mut locked) = callback_for_handler.lock() {
                if let Some(callback) = locked.take() {
                    callback(result);
                }
            }
            Ok(())
        }));
        unsafe {
            manager
                .GetCookies(&url, &handler)
                .map_err(|_| InstitutionProtocolError::WebView2Failure)
        }
    }

    unsafe fn collect_cookies(
        list: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2CookieList,
        scope_host: String,
    ) -> Result<EphemeralCookieJar, InstitutionProtocolError> {
        let mut count = 0_u32;
        list.Count(&mut count)
            .map_err(|_| InstitutionProtocolError::WebView2Failure)?;
        if count as usize > MAX_COOKIES {
            return Err(InstitutionProtocolError::CookieLimitExceeded);
        }
        let mut jar = EphemeralCookieJar::new(scope_host);
        for index in 0..count {
            let cookie = list
                .GetValueAtIndex(index)
                .map_err(|_| InstitutionProtocolError::WebView2Failure)?;
            let name = take_com_string(|value| cookie.Name(value))?;
            if name.is_empty()
                || name.len() > MAX_FIELD_NAME_CHARS
                || !name.bytes().all(is_cookie_name_byte)
            {
                return Err(InstitutionProtocolError::InvalidProtocolPayload);
            }
            let value = SecretBytes::from_string(take_com_string(|output| cookie.Value(output))?);
            let path = take_com_string(|output| cookie.Path(output))?;
            if path.is_empty()
                || !path.starts_with('/')
                || path.chars().count() > MAX_PATH_CHARS
                || path.chars().any(char::is_control)
            {
                return Err(InstitutionProtocolError::InvalidProtocolPayload);
            }
            jar.push(name, value, path)?;
        }
        Ok(jar)
    }

    unsafe fn take_com_string<F>(operation: F) -> Result<String, InstitutionProtocolError>
    where
        F: FnOnce(*mut PWSTR) -> windows_core::Result<()>,
    {
        let mut raw = PWSTR::null();
        operation(&mut raw).map_err(|_| InstitutionProtocolError::WebView2Failure)?;
        let converted = if raw.is_null() {
            Err(InstitutionProtocolError::InvalidProtocolPayload)
        } else {
            raw.to_string()
                .map_err(|_| InstitutionProtocolError::InvalidProtocolPayload)
        };
        if !raw.is_null() {
            CoTaskMemFree(raw.as_ptr().cast());
        }
        converted
    }

    fn is_cookie_name_byte(byte: u8) -> bool {
        byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'!' | b'#'
                    | b'$'
                    | b'%'
                    | b'&'
                    | b'\''
                    | b'*'
                    | b'+'
                    | b'-'
                    | b'.'
                    | b'^'
                    | b'_'
                    | b'`'
                    | b'|'
                    | b'~'
            )
    }
}

#[cfg(windows)]
pub(crate) use webview2_bridge::{
    clear_protocol_subscriptions, dispatch_primary_mouse_event, enable_network, get_response_body,
    retain_protocol_subscriptions, subscribe_loading_finished, subscribe_network_event,
    WebView2MouseEventKind, WebView2ProtocolSubscription,
};

#[cfg(not(windows))]
pub(crate) fn ensure_webview2_protocol_supported() -> Result<(), InstitutionProtocolError> {
    Err(InstitutionProtocolError::Unsupported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_redaction_keeps_names_and_drops_values_and_fragment() {
        let url = SecretBytes::new(
            b"https://Example.EDU/search?q=private-value&year=2026#access-token".to_vec(),
        );
        let result = redact_request(
            "get",
            &url,
            ProtocolResourceKind::Document,
            vec!["keyword".to_string(), "page".to_string()],
        )
        .expect("redaction should succeed");
        let encoded = serde_json::to_string(&result).expect("safe model should serialize");

        assert_eq!(result.https_host, "example.edu");
        assert_eq!(result.path, "/search");
        assert_eq!(result.query_fields, vec!["q", "year"]);
        assert!(!encoded.contains("private-value"));
        assert!(!encoded.contains("access-token"));
    }

    #[test]
    fn request_redaction_rejects_non_https_and_value_shaped_field_names() {
        let http = SecretBytes::new(b"http://example.edu/search?q=secret".to_vec());
        assert_eq!(
            redact_request(
                "GET",
                &http,
                ProtocolResourceKind::Document,
                Vec::<String>::new(),
            )
            .expect_err("HTTP must not be captured"),
            InstitutionProtocolError::HttpsRequired
        );

        let https = SecretBytes::new(b"https://example.edu/search".to_vec());
        assert_eq!(
            redact_request(
                "POST",
                &https,
                ProtocolResourceKind::Xhr,
                vec!["password=do-not-smuggle".to_string()],
            )
            .expect_err("field names cannot contain values"),
            InstitutionProtocolError::InvalidFieldName
        );
    }

    #[test]
    fn json_schema_contains_types_but_never_scalar_secrets() {
        let mut response = redact_response(
            &SecretBytes::new(b"https://example.edu/api/profile?id=hidden".to_vec()),
            200,
            "application/json; charset=utf-8",
            ProtocolResourceKind::Fetch,
        )
        .expect("response should redact");
        let body = br#"{"name":"Alice Secret","password":"never-log-me","items":[1,"hidden"]}"#;
        attach_response_body_schema(&mut response, SecretBytes::new(body.to_vec()))
            .expect("schema extraction should succeed");
        let encoded = serde_json::to_string(&response).expect("safe model should serialize");

        assert!(encoded.contains("name"));
        assert!(encoded.contains("[sensitive-field]"));
        assert!(!encoded.contains("Alice Secret"));
        assert!(!encoded.contains("never-log-me"));
        assert!(!encoded.contains("hidden"));
        assert_eq!(response.body_size_bytes, Some(body.len()));
    }

    #[test]
    fn oversized_body_is_rejected_and_secret_debug_is_redacted() {
        let secret = SecretBytes::new(b"credential-cookie-value".to_vec());
        assert_eq!(format!("{secret:?}"), "SecretBytes([REDACTED])");

        let mut response = redact_response(
            &SecretBytes::new(b"https://example.edu/api".to_vec()),
            200,
            "application/json",
            ProtocolResourceKind::Fetch,
        )
        .expect("response should redact");
        let too_large = SecretBytes::new(vec![b'x'; MAX_RESPONSE_BODY_BYTES + 1]);
        assert_eq!(
            attach_response_body_schema(&mut response, too_large)
                .expect_err("oversized body must fail"),
            InstitutionProtocolError::ResponseBodyTooLarge
        );
        assert_eq!(response.body_size_bytes, None);
    }

    #[test]
    fn session_is_bounded_and_clearable() {
        let url = SecretBytes::new(b"https://example.edu/".to_vec());
        let request = redact_request(
            "GET",
            &url,
            ProtocolResourceKind::Document,
            Vec::<String>::new(),
        )
        .expect("request should redact");
        let mut session = InstitutionProtocolSession::default();
        for _ in 0..MAX_REDACTED_EVENTS + 4 {
            session
                .push(RedactedProtocolEvent::Request(request.clone()))
                .expect("safe event should fit");
        }
        assert_eq!(session.len(), MAX_REDACTED_EVENTS);
        session.clear();
        assert!(session.is_empty());
    }

    #[test]
    fn route_selection_requires_consumable_protocol_evidence() {
        let request = RedactedProtocolEvent::Request(RedactedProtocolRequest {
            method: "GET".to_string(),
            https_host: "discovery.example.edu".to_string(),
            path: "/api/search".to_string(),
            resource_kind: ProtocolResourceKind::Xhr,
            query_fields: vec!["q".to_string()],
            body_fields: Vec::new(),
        });
        assert_eq!(
            select_protocol_transport(&[request.clone()]),
            InstitutionProtocolTransportEvidence::SessionWebRequest
        );

        let response = RedactedProtocolEvent::Response(RedactedProtocolResponse {
            https_host: "discovery.example.edu".to_string(),
            path: "/api/search".to_string(),
            status: 200,
            content_type: "application/json".to_string(),
            resource_kind: ProtocolResourceKind::Fetch,
            json_schema: Some(RedactedJsonSchema::Array {
                variants: vec![RedactedJsonSchema::Object {
                    fields: BTreeMap::new(),
                    truncated: false,
                }],
                truncated: false,
            }),
            body_size_bytes: Some(2),
        });
        assert_eq!(
            select_protocol_transport(&[request, response]),
            InstitutionProtocolTransportEvidence::StructuredApi
        );
        assert_eq!(
            select_protocol_transport(&[]),
            InstitutionProtocolTransportEvidence::DomFallback
        );
    }

    #[test]
    fn devtools_request_does_not_deserialize_post_data() {
        let raw = SecretBytes::new(
            br#"{
                "requestId":"123.45",
                "type":"XHR",
                "request":{
                    "url":"https://example.edu/login?mode=sso",
                    "method":"POST",
                    "postData":"username=alice&password=do-not-read"
                }
            }"#
            .to_vec(),
        );
        let captured = redact_devtools_network_event(WebView2NetworkEvent::RequestWillBeSent, raw)
            .expect("event should redact");
        let encoded = serde_json::to_string(captured.redacted()).expect("safe event serializes");
        assert!(encoded.contains("mode"));
        assert!(!encoded.contains("alice"));
        assert!(!encoded.contains("do-not-read"));
    }

    #[test]
    fn loading_finished_keeps_only_an_opaque_request_id() {
        let raw = SecretBytes::new(
            br#"{
                "requestId":"123.45",
                "encodedDataLength":4096,
                "timestamp":123.0
            }"#
            .to_vec(),
        );
        let captured = capture_devtools_request_id(raw).expect("request id should be captured");
        assert_eq!(captured.request_id().as_utf8().unwrap(), "123.45");
        assert_eq!(
            format!("{captured:?}"),
            "CapturedRequestId { request_id: \"[REDACTED]\" }"
        );
    }
}
