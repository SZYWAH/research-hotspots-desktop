use serde::{Deserialize, Serialize};
use serde_json::json;

pub const SIDERA_PI_PROVIDER_ID: &str = "sidera-openai-compatible";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraPiUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraToolApprovalRequest {
    pub approval_id: String,
    pub session_id: String,
    pub message_id: String,
    pub tool_call_id: String,
    pub tool: String,
    pub summary: String,
    pub target: Option<String>,
    pub command: Option<String>,
    pub diff_preview: Option<String>,
    pub parameter_hash: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SideraToolApprovalDecisionInput {
    pub approval_id: String,
    pub decision: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraAnswerEntityReference {
    pub kind: &'static str,
    pub entity_id: String,
    pub citation_index: usize,
    pub mention_order: usize,
    pub role: String,
    pub relation_summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paper_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<crate::document_derived::SideraDocumentEvidenceAnchor>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum SideraPiEventPayload {
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
    AssistantReplace {
        session_id: String,
        message_id: String,
        markdown: String,
    },
    TurnComplete {
        session_id: String,
        message_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<SideraPiUsage>,
        entity_refs: Vec<SideraAnswerEntityReference>,
        #[serde(skip_serializing_if = "Option::is_none")]
        retrieval_mode: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        citation_status: Option<String>,
        evidence_gate_status: String,
    },
    ToolStage {
        session_id: String,
        message_id: String,
        stage: String,
    },
    ToolApprovalRequested {
        request: SideraToolApprovalRequest,
    },
    ToolApprovalResolved {
        approval_id: String,
        decision: String,
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
pub struct SideraPiEventEnvelope {
    pub sequence: u64,
    pub revision: u64,
    #[serde(flatten)]
    pub payload: SideraPiEventPayload,
}

pub fn build_models_json(base_url: &str, model: &str) -> Result<Vec<u8>, String> {
    let models = json!({
        "providers": {
            (SIDERA_PI_PROVIDER_ID): {
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
    serde_json::to_vec_pretty(&models)
        .map_err(|error| format!("SIDERA_PI_MODELS_SERIALIZE_FAILED:{error}"))
}

pub fn normalize_openai_base_url(value: &str) -> Result<String, String> {
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

pub fn drain_jsonl_records(pending: &mut Vec<u8>) -> Vec<Vec<u8>> {
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
    fn base_url_normalization_rejects_invalid_endpoints() {
        for endpoint in ["", "   ", "api.example.test", "ftp://example.test/v1"] {
            assert_eq!(
                normalize_openai_base_url(endpoint).unwrap_err(),
                "SIDERA_PI_ENDPOINT_INVALID",
                "unexpectedly accepted {endpoint:?}"
            );
        }
    }

    #[test]
    fn models_json_references_environment_without_secret() {
        let bytes = build_models_json("https://example.test/v1", "model-id").unwrap();
        let content = String::from_utf8(bytes).unwrap();
        assert!(content.contains("$SIDERA_PI_API_KEY"));
        assert!(content.contains(SIDERA_PI_PROVIDER_ID));
        assert!(!content.contains("secret-value"));
    }

    #[test]
    fn jsonl_parser_waits_for_lf_and_preserves_unicode() {
        let mut pending = "{\"delta\":\"中".as_bytes().to_vec();
        assert!(drain_jsonl_records(&mut pending).is_empty());
        pending.extend_from_slice("文\"}\r\n{\"next\":1}\npartial".as_bytes());
        let records = drain_jsonl_records(&mut pending);
        assert_eq!(records.len(), 2);
        assert_eq!(
            String::from_utf8(records[0].clone()).unwrap(),
            "{\"delta\":\"中文\"}"
        );
        assert_eq!(
            String::from_utf8(records[1].clone()).unwrap(),
            "{\"next\":1}"
        );
        assert_eq!(String::from_utf8(pending).unwrap(), "partial");
    }

    #[test]
    fn jsonl_parser_does_not_split_unicode_line_separators() {
        let mut pending = "{\"value\":\"a\u{2028}b\"}\n".as_bytes().to_vec();
        let records = drain_jsonl_records(&mut pending);
        assert_eq!(records.len(), 1);
        assert!(String::from_utf8(records[0].clone())
            .unwrap()
            .contains('\u{2028}'));
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

    #[test]
    fn turn_complete_event_has_an_exact_stable_json_contract() {
        let payload = SideraPiEventEnvelope {
            sequence: 8,
            revision: 5,
            payload: SideraPiEventPayload::TurnComplete {
                session_id: "session-1".to_string(),
                message_id: "message-2".to_string(),
                usage: Some(SideraPiUsage {
                    input_tokens: Some(21),
                    output_tokens: Some(34),
                }),
                entity_refs: vec![SideraAnswerEntityReference {
                    kind: "paper",
                    entity_id: "paper-7".to_string(),
                    citation_index: 1,
                    mention_order: 0,
                    role: "evidence".to_string(),
                    relation_summary: "supports claim".to_string(),
                    paper_id: None,
                    document_version_id: None,
                    page_index: None,
                    anchor: None,
                }],
                retrieval_mode: Some("hybrid".to_string()),
                citation_status: Some("verified".to_string()),
                evidence_gate_status: "passed".to_string(),
            },
        };

        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({
                "sequence": 8,
                "revision": 5,
                "type": "turn-complete",
                "sessionId": "session-1",
                "messageId": "message-2",
                "usage": {
                    "inputTokens": 21,
                    "outputTokens": 34
                },
                "entityRefs": [{
                    "kind": "paper",
                    "entityId": "paper-7",
                    "citationIndex": 1,
                    "mentionOrder": 0,
                    "role": "evidence",
                    "relationSummary": "supports claim"
                }],
                "retrievalMode": "hybrid",
                "citationStatus": "verified",
                "evidenceGateStatus": "passed"
            })
        );
    }

    #[test]
    fn approval_events_have_exact_stable_json_contracts() {
        let requested = SideraPiEventEnvelope {
            sequence: 11,
            revision: 6,
            payload: SideraPiEventPayload::ToolApprovalRequested {
                request: SideraToolApprovalRequest {
                    approval_id: "approval-1".to_string(),
                    session_id: "session-1".to_string(),
                    message_id: "message-2".to_string(),
                    tool_call_id: "call-3".to_string(),
                    tool: "write_file".to_string(),
                    summary: "Update the note".to_string(),
                    target: Some("note.md".to_string()),
                    command: None,
                    diff_preview: Some("+ evidence".to_string()),
                    parameter_hash: "sha256:abc".to_string(),
                },
            },
        };
        let resolved = SideraPiEventEnvelope {
            sequence: 12,
            revision: 7,
            payload: SideraPiEventPayload::ToolApprovalResolved {
                approval_id: "approval-1".to_string(),
                decision: "approved".to_string(),
            },
        };

        assert_eq!(
            serde_json::to_value(requested).unwrap(),
            serde_json::json!({
                "sequence": 11,
                "revision": 6,
                "type": "tool-approval-requested",
                "request": {
                    "approvalId": "approval-1",
                    "sessionId": "session-1",
                    "messageId": "message-2",
                    "toolCallId": "call-3",
                    "tool": "write_file",
                    "summary": "Update the note",
                    "target": "note.md",
                    "command": null,
                    "diffPreview": "+ evidence",
                    "parameterHash": "sha256:abc"
                }
            })
        );
        assert_eq!(
            serde_json::to_value(resolved).unwrap(),
            serde_json::json!({
                "sequence": 12,
                "revision": 7,
                "type": "tool-approval-resolved",
                "approvalId": "approval-1",
                "decision": "approved"
            })
        );
    }
}
