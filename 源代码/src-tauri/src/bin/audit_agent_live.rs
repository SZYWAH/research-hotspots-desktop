#[path = "../agent_model_gateway.rs"]
mod agent_model_gateway;

use std::{collections::BTreeMap, env};

use agent_model_gateway::{
    AgentModelGateway, AgentModelProfile, AgentModelProtocol, ModelCancellation, ModelMessage,
    ModelMessageRole, ModelPurpose, StructuredModelRequest,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug)]
struct LiveConfiguration {
    project_id: String,
    credential_service: String,
    credential_env: Option<String>,
    profile: AgentModelProfile,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LiveResponse {
    status: String,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), String> {
    let configuration = parse_configuration()?;
    let credential = load_credential(&configuration)?;
    let request = StructuredModelRequest::new(
        ModelPurpose::Planner,
        "agent_live_connectivity",
        json!({
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["ok"]}
            },
            "required": ["status"],
            "additionalProperties": false
        }),
        vec![
            ModelMessage {
                role: ModelMessageRole::System,
                content:
                    "Return only the requested structured connectivity result. Do not call tools."
                        .into(),
            },
            ModelMessage {
                role: ModelMessageRole::User,
                content: "Confirm the model endpoint is available by returning status ok.".into(),
            },
        ],
        64,
    );
    let result = AgentModelGateway::default()
        .execute_structured::<LiveResponse>(
            &configuration.profile,
            &credential,
            &request,
            ModelCancellation::never(),
        )
        .await
        .map_err(|error| {
            format!(
                "AGENT_LIVE_REQUEST_FAILED:{:?}:status={:?}:retryable={}",
                error.code, error.http_status, error.retryable
            )
        })?;
    if result.value.status != "ok" {
        return Err("AGENT_LIVE_STRUCTURED_RESPONSE_INVALID".into());
    }

    // Deliberately emit only the non-sensitive fields allowed by the live-audit contract.
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "ok": true,
            "status": "connected",
            "protocol": result.protocol,
            "model": configuration.profile.model,
            "elapsedMs": result.elapsed_ms,
            "retryCount": result.retry_count,
            "structureRepairCount": result.structure_repair_count,
            "usage": result.usage,
        }))
        .map_err(|error| error.to_string())?
    );
    Ok(())
}

fn parse_configuration() -> Result<LiveConfiguration, String> {
    let mut values = BTreeMap::<String, String>::new();
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        if !argument.starts_with("--") {
            return Err(format!("AGENT_LIVE_UNKNOWN_ARGUMENT:{argument}"));
        }
        let value = arguments
            .next()
            .ok_or_else(|| format!("AGENT_LIVE_ARGUMENT_VALUE_REQUIRED:{argument}"))?;
        values.insert(argument, value);
    }

    let protocol = match values
        .remove("--protocol")
        .unwrap_or_else(|| "openai_chat_completions".into())
        .as_str()
    {
        "openai_chat_completions" => AgentModelProtocol::OpenaiChatCompletions,
        "openai_responses" => AgentModelProtocol::OpenaiResponses,
        "anthropic_messages" => AgentModelProtocol::AnthropicMessages,
        value => return Err(format!("AGENT_LIVE_PROTOCOL_UNSUPPORTED:{value}")),
    };
    let default_env = match protocol {
        AgentModelProtocol::AnthropicMessages => "ANTHROPIC_API_KEY",
        AgentModelProtocol::OpenaiChatCompletions | AgentModelProtocol::OpenaiResponses => {
            "DEEPSEEK_API_KEY"
        }
    };
    let credential_env = values
        .remove("--credential-env")
        .or_else(|| Some(default_env.into()))
        .filter(|value| !value.trim().is_empty());
    if credential_env.as_deref().is_some_and(|value| {
        !matches!(
            value,
            "DEEPSEEK_API_KEY" | "OPENAI_API_KEY" | "ANTHROPIC_API_KEY"
        )
    }) {
        return Err("AGENT_LIVE_CREDENTIAL_ENV_NOT_ALLOWED".into());
    }

    let base_url = values.remove("--base-url").unwrap_or_else(|| {
        env::var("DEEPSEEK_BASE_URL").unwrap_or_else(|_| "https://api.deepseek.com".into())
    });
    let model = values
        .remove("--model")
        .unwrap_or_else(|| env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| "deepseek-chat".into()));
    let project_id = values
        .remove("--project")
        .unwrap_or_else(|| "project-default".into());
    let credential_service = values
        .remove("--credential-service")
        .unwrap_or_else(|| "ai-deepseek".into());
    let native_structured_output = values
        .remove("--native-structured-output")
        .map(|value| parse_bool(&value))
        .transpose()?
        // The current desktop default is DeepSeek/OpenAI-compatible JSON mode.
        // Native JSON Schema can be enabled explicitly for a saved profile that supports it.
        .unwrap_or(false);
    let allow_local_http = values
        .remove("--allow-local-http")
        .map(|value| parse_bool(&value))
        .transpose()?
        .unwrap_or(false);
    let anthropic_version = values.remove("--anthropic-version").or_else(|| {
        (protocol == AgentModelProtocol::AnthropicMessages).then(|| "2023-06-01".into())
    });
    if !values.is_empty() {
        return Err(format!(
            "AGENT_LIVE_UNKNOWN_ARGUMENT:{}",
            values.keys().next().expect("non-empty map")
        ));
    }
    if project_id.trim().is_empty()
        || credential_service.trim().is_empty()
        || model.trim().is_empty()
        || base_url.trim().is_empty()
    {
        return Err("AGENT_LIVE_CONFIGURATION_INCOMPLETE".into());
    }
    Ok(LiveConfiguration {
        project_id,
        credential_service,
        credential_env,
        profile: AgentModelProfile {
            protocol,
            base_url,
            model,
            native_structured_output,
            anthropic_version,
            allow_local_http,
        },
    })
}

fn load_credential(configuration: &LiveConfiguration) -> Result<String, String> {
    let target = credential_target(&configuration.project_id, &configuration.credential_service);
    let from_manager = keyring::Entry::new(&target, "credential")
        .ok()
        .and_then(|entry| entry.get_password().ok());
    let from_environment = configuration
        .credential_env
        .as_deref()
        .and_then(|name| env::var(name).ok());
    from_manager
        .or(from_environment)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            format!(
                "AGENT_LIVE_CREDENTIAL_MISSING:project={}:service={}",
                safe_component(&configuration.project_id),
                safe_component(&configuration.credential_service)
            )
        })
}

fn credential_target(project_id: &str, service: &str) -> String {
    format!(
        "research-hotspots-desktop:{}:{}",
        safe_component(project_id),
        safe_component(service)
    )
}

fn safe_component(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn parse_bool(value: &str) -> Result<bool, String> {
    match value {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => Err(format!("AGENT_LIVE_BOOLEAN_INVALID:{value}")),
    }
}
