use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

const STORE_VERSION: i64 = 1;
const DEFAULT_TITLE: &str = "新对话";
const STORE_SCHEMA_SQL: &str = include_str!("sidera_conversations_schema.sql");
#[derive(Clone, Copy)]
struct ExpectedColumn {
    name: &'static str,
    kind: &'static str,
    not_null: bool,
    primary_key: bool,
}

const CONVERSATION_COLUMNS: &[ExpectedColumn] = &[
    ExpectedColumn {
        name: "id",
        kind: "TEXT",
        not_null: false,
        primary_key: true,
    },
    ExpectedColumn {
        name: "project_id",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "title",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "status",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "provider",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "model",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "created_at_ms",
        kind: "INTEGER",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "updated_at_ms",
        kind: "INTEGER",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "last_opened_at_ms",
        kind: "INTEGER",
        not_null: true,
        primary_key: false,
    },
];
const TURN_COLUMNS: &[ExpectedColumn] = &[
    ExpectedColumn {
        name: "id",
        kind: "TEXT",
        not_null: false,
        primary_key: true,
    },
    ExpectedColumn {
        name: "conversation_id",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "submitted_at_ms",
        kind: "INTEGER",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "user_text",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "assistant_status",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "assistant_markdown",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "entity_refs_json",
        kind: "TEXT",
        not_null: true,
        primary_key: false,
    },
    ExpectedColumn {
        name: "retrieval_mode",
        kind: "TEXT",
        not_null: false,
        primary_key: false,
    },
    ExpectedColumn {
        name: "citation_status",
        kind: "TEXT",
        not_null: false,
        primary_key: false,
    },
    ExpectedColumn {
        name: "evidence_gate_status",
        kind: "TEXT",
        not_null: false,
        primary_key: false,
    },
    ExpectedColumn {
        name: "usage_json",
        kind: "TEXT",
        not_null: false,
        primary_key: false,
    },
    ExpectedColumn {
        name: "updated_at_ms",
        kind: "INTEGER",
        not_null: true,
        primary_key: false,
    },
];
const PROJECT_STATE_COLUMNS: &[ExpectedColumn] = &[
    ExpectedColumn {
        name: "project_id",
        kind: "TEXT",
        not_null: false,
        primary_key: true,
    },
    ExpectedColumn {
        name: "active_conversation_id",
        kind: "TEXT",
        not_null: false,
        primary_key: false,
    },
    ExpectedColumn {
        name: "updated_at_ms",
        kind: "INTEGER",
        not_null: true,
        primary_key: false,
    },
];
static CONVERSATION_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraConversationSummary {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
    pub provider: String,
    pub model: String,
    pub context_available: bool,
    pub turn_count: u64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub last_opened_at_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraStoredTurn {
    pub id: String,
    pub submitted_at_ms: i64,
    pub user_text: String,
    pub assistant_status: String,
    pub assistant_markdown: String,
    pub entity_refs: Value,
    pub retrieval_mode: Option<String>,
    pub citation_status: Option<String>,
    pub evidence_gate_status: Option<String>,
    pub usage: Option<Value>,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraConversationSnapshot {
    pub conversation: SideraConversationSummary,
    pub turns: Vec<SideraStoredTurn>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideraConversationStoreReadiness {
    pub status: String,
    pub schema_version: i64,
    pub repaired: bool,
    pub conversation_count: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConversationScopeInput {
    pub database_dir: String,
    pub project_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListConversationsInput {
    pub database_dir: String,
    pub project_id: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateConversationInput {
    pub database_dir: String,
    pub project_id: String,
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub model: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConversationIdInput {
    pub database_dir: String,
    pub project_id: String,
    pub conversation_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenameConversationInput {
    pub database_dir: String,
    pub project_id: String,
    pub conversation_id: String,
    pub title: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpsertConversationTurnInput {
    pub database_dir: String,
    pub project_id: String,
    pub conversation_id: String,
    pub id: String,
    pub submitted_at_ms: i64,
    pub user_text: String,
    pub assistant_status: String,
    pub assistant_markdown: String,
    #[serde(default)]
    pub entity_refs: Value,
    #[serde(default)]
    pub retrieval_mode: Option<String>,
    #[serde(default)]
    pub citation_status: Option<String>,
    #[serde(default)]
    pub evidence_gate_status: Option<String>,
    #[serde(default)]
    pub usage: Option<Value>,
}

pub fn list_conversations(
    input: ListConversationsInput,
) -> Result<Vec<SideraConversationSummary>, String> {
    let project_id = validate_project_id(&input.project_id)?;
    let root = storage_root(&input.database_dir)?;
    let connection = open_store(&root)?;
    mark_interrupted(&connection, project_id)?;
    let status = normalize_status_filter(input.status.as_deref())?;
    let query = input.query.unwrap_or_default().trim().to_lowercase();
    let mut statement = connection
        .prepare(
            r#"SELECT c.id, c.project_id, c.title, c.status, c.provider, c.model,
                      c.created_at_ms, c.updated_at_ms, c.last_opened_at_ms, COUNT(t.id)
                 FROM conversations c
                 LEFT JOIN turns t ON t.conversation_id = c.id
                WHERE c.project_id = ?1
                GROUP BY c.id
                ORDER BY c.updated_at_ms DESC, c.id DESC"#,
        )
        .map_err(store_error)?;
    let rows = statement
        .query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })
        .map_err(store_error)?;
    let mut summaries = Vec::new();
    for row in rows {
        let (id, project_id, title, row_status, provider, model, created, updated, opened, count) =
            row.map_err(store_error)?;
        if status.as_deref().is_some_and(|value| value != row_status) {
            continue;
        }
        if !query.is_empty() && !title.to_lowercase().contains(&query) {
            let matches_turn = connection
                .query_row(
                    r#"SELECT EXISTS(
                         SELECT 1 FROM turns
                          WHERE conversation_id = ?1
                            AND (lower(user_text) LIKE ?2 OR lower(assistant_markdown) LIKE ?2)
                       )"#,
                    params![id, format!("%{query}%")],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(store_error)?
                != 0;
            if !matches_turn {
                continue;
            }
        }
        summaries.push(summary_from_parts(
            &root,
            id,
            project_id,
            title,
            row_status,
            provider,
            model,
            count.max(0) as u64,
            created,
            updated,
            opened,
        ));
    }
    Ok(summaries)
}

pub fn create_conversation(
    input: CreateConversationInput,
) -> Result<SideraConversationSnapshot, String> {
    let project_id = validate_project_id(&input.project_id)?;
    let root = storage_root(&input.database_dir)?;
    let mut connection = open_store(&root)?;
    let now = timestamp_ms();
    let id = input.conversation_id.unwrap_or_else(make_conversation_id);
    validate_conversation_id(&id)?;
    let transaction = connection.transaction().map_err(store_error)?;
    transaction
        .execute(
            r#"INSERT INTO conversations(
                 id, project_id, title, status, provider, model,
                 created_at_ms, updated_at_ms, last_opened_at_ms
               ) VALUES(?1, ?2, ?3, 'active', ?4, ?5, ?6, ?6, ?6)"#,
            params![
                id,
                project_id,
                DEFAULT_TITLE,
                input.provider.trim(),
                input.model.trim(),
                now
            ],
        )
        .map_err(store_error)?;
    set_active_tx(&transaction, project_id, &id, now)?;
    transaction.commit().map_err(store_error)?;
    get_snapshot_by_id(&connection, &root, project_id, &id)
}

pub fn open_conversation(input: ConversationIdInput) -> Result<SideraConversationSnapshot, String> {
    let project_id = validate_project_id(&input.project_id)?;
    validate_conversation_id(&input.conversation_id)?;
    let root = storage_root(&input.database_dir)?;
    let mut connection = open_store(&root)?;
    mark_interrupted(&connection, project_id)?;
    let now = timestamp_ms();
    let transaction = connection.transaction().map_err(store_error)?;
    let changed = transaction
        .execute(
            r#"UPDATE conversations
                  SET last_opened_at_ms = ?1,
                      updated_at_ms = MAX(updated_at_ms, ?1)
                WHERE id = ?2 AND project_id = ?3"#,
            params![now, input.conversation_id, project_id],
        )
        .map_err(store_error)?;
    if changed != 1 {
        return Err("SIDERA_CONVERSATION_NOT_FOUND".to_string());
    }
    set_active_tx(&transaction, project_id, &input.conversation_id, now)?;
    transaction.commit().map_err(store_error)?;
    get_snapshot_by_id(&connection, &root, project_id, &input.conversation_id)
}

pub fn open_most_recent(
    input: ConversationScopeInput,
) -> Result<Option<SideraConversationSnapshot>, String> {
    let project_id = validate_project_id(&input.project_id)?;
    let root = storage_root(&input.database_dir)?;
    let connection = open_store(&root)?;
    mark_interrupted(&connection, project_id)?;
    let id = connection
        .query_row(
            r#"SELECT c.id
                 FROM conversations c
                 LEFT JOIN project_state p ON p.project_id = c.project_id
                WHERE c.project_id = ?1 AND c.status = 'active'
                ORDER BY CASE WHEN c.id = p.active_conversation_id THEN 0 ELSE 1 END,
                         c.last_opened_at_ms DESC,
                         c.updated_at_ms DESC
                LIMIT 1"#,
            params![project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?;
    id.map(|value| get_snapshot_by_id(&connection, &root, project_id, &value))
        .transpose()
}

pub fn rename_conversation(
    input: RenameConversationInput,
) -> Result<SideraConversationSummary, String> {
    let title = normalize_title(&input.title);
    if title.is_empty() {
        return Err("SIDERA_CONVERSATION_TITLE_REQUIRED".to_string());
    }
    mutate_status_or_title(
        &input.database_dir,
        &input.project_id,
        &input.conversation_id,
        "rename",
        Some(&title),
    )
}

pub fn archive_conversation(
    input: ConversationIdInput,
) -> Result<SideraConversationSummary, String> {
    mutate_status_or_title(
        &input.database_dir,
        &input.project_id,
        &input.conversation_id,
        "archive",
        None,
    )
}

pub fn restore_conversation(
    input: ConversationIdInput,
) -> Result<SideraConversationSummary, String> {
    mutate_status_or_title(
        &input.database_dir,
        &input.project_id,
        &input.conversation_id,
        "restore",
        None,
    )
}

pub fn delete_conversation(input: ConversationIdInput) -> Result<(), String> {
    let project_id = validate_project_id(&input.project_id)?;
    validate_conversation_id(&input.conversation_id)?;
    let root = storage_root(&input.database_dir)?;
    let mut connection = open_store(&root)?;
    let status = connection
        .query_row(
            "SELECT status FROM conversations WHERE id=?1 AND project_id=?2",
            params![input.conversation_id, project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_CONVERSATION_NOT_FOUND".to_string())?;
    if status != "archived" {
        return Err("SIDERA_CONVERSATION_DELETE_REQUIRES_ARCHIVE".to_string());
    }
    for session_file in find_session_files(&root, project_id, &input.conversation_id)? {
        fs::remove_file(&session_file)
            .map_err(|error| format!("SIDERA_CONVERSATION_SESSION_DELETE_FAILED:{error}"))?;
    }
    let transaction = connection.transaction().map_err(store_error)?;
    transaction
        .execute(
            "DELETE FROM conversations WHERE id=?1 AND project_id=?2 AND status='archived'",
            params![input.conversation_id, project_id],
        )
        .map_err(store_error)?;
    transaction.commit().map_err(store_error)?;
    Ok(())
}

pub fn upsert_turn(input: UpsertConversationTurnInput) -> Result<SideraStoredTurn, String> {
    let project_id = validate_project_id(&input.project_id)?;
    validate_conversation_id(&input.conversation_id)?;
    if input.id.trim().is_empty() {
        return Err("SIDERA_CONVERSATION_TURN_ID_REQUIRED".to_string());
    }
    let status = normalize_turn_status(&input.assistant_status)?;
    let root = storage_root(&input.database_dir)?;
    let mut connection = open_store(&root)?;
    let now = timestamp_ms();
    let transaction = connection.transaction().map_err(store_error)?;
    let owns_conversation = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM conversations WHERE id=?1 AND project_id=?2)",
            params![input.conversation_id, project_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(store_error)?
        != 0;
    if !owns_conversation {
        return Err("SIDERA_CONVERSATION_NOT_FOUND".to_string());
    }
    transaction
        .execute(
            r#"INSERT INTO turns(
                 id, conversation_id, submitted_at_ms, user_text, assistant_status,
                 assistant_markdown, entity_refs_json, retrieval_mode, citation_status,
                 evidence_gate_status, usage_json, updated_at_ms
               ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
               ON CONFLICT(id) DO UPDATE SET
                 assistant_status = excluded.assistant_status,
                 assistant_markdown = excluded.assistant_markdown,
                 entity_refs_json = excluded.entity_refs_json,
                 retrieval_mode = excluded.retrieval_mode,
                 citation_status = excluded.citation_status,
                 evidence_gate_status = excluded.evidence_gate_status,
                 usage_json = excluded.usage_json,
                 updated_at_ms = excluded.updated_at_ms"#,
            params![
                input.id,
                input.conversation_id,
                input.submitted_at_ms,
                input.user_text,
                status,
                input.assistant_markdown,
                serde_json::to_string(&input.entity_refs).map_err(|error| error.to_string())?,
                input.retrieval_mode,
                input.citation_status,
                input.evidence_gate_status,
                input
                    .usage
                    .map(|value| serde_json::to_string(&value))
                    .transpose()
                    .map_err(|error| error.to_string())?,
                now,
            ],
        )
        .map_err(store_error)?;
    let title = first_prompt_title(&input.user_text);
    transaction
        .execute(
            r#"UPDATE conversations
                  SET title = CASE WHEN title = ?1 THEN ?2 ELSE title END,
                      updated_at_ms = ?3,
                      last_opened_at_ms = ?3
                WHERE id = ?4 AND project_id = ?5"#,
            params![DEFAULT_TITLE, title, now, input.conversation_id, project_id],
        )
        .map_err(store_error)?;
    set_active_tx(&transaction, project_id, &input.conversation_id, now)?;
    transaction.commit().map_err(store_error)?;
    get_turn(&connection, &input.id)
}

pub fn session_root(database_dir: &str, project_id: &str) -> Result<PathBuf, String> {
    let root = storage_root(database_dir)?;
    let project_id = validate_project_id(project_id)?;
    let path = root
        .join("pi-sessions")
        .join(project_storage_key(project_id));
    fs::create_dir_all(&path)
        .map_err(|error| format!("SIDERA_CONVERSATION_SESSION_PATH_FAILED:{error}"))?;
    Ok(path)
}

pub fn check_conversation_store(
    input: ConversationScopeInput,
) -> Result<SideraConversationStoreReadiness, String> {
    validate_project_id(&input.project_id)?;
    let root = storage_root(&input.database_dir)?;
    let (connection, repaired) = open_store_with_recovery(&root)?;
    let schema_version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
        .map_err(store_error)?;
    let conversation_count = connection
        .query_row("SELECT COUNT(*) FROM conversations", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(store_error)?
        .max(0) as u64;
    Ok(SideraConversationStoreReadiness {
        status: if repaired { "repaired" } else { "pass" }.to_string(),
        schema_version,
        repaired,
        conversation_count,
    })
}

fn open_store(root: &Path) -> Result<Connection, String> {
    open_store_with_recovery(root).map(|(connection, _)| connection)
}

fn open_store_with_recovery(root: &Path) -> Result<(Connection, bool), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("SIDERA_CONVERSATION_DIRECTORY_FAILED:{error}"))?;
    let database_path = root.join("conversations-v1.sqlite");
    let existed_before_open = database_path.is_file();
    let mut connection = Connection::open(&database_path).map_err(store_error)?;
    connection
        .execute_batch(
            r#"PRAGMA foreign_keys = ON;
               PRAGMA journal_mode = WAL;
               PRAGMA synchronous = NORMAL;"#,
        )
        .map_err(store_error)?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(store_error)?;
    if version > STORE_VERSION {
        return Err("SIDERA_CONVERSATION_SCHEMA_TOO_NEW".to_string());
    }
    let existing_objects = expected_object_count(&connection)?;
    let repaired = existed_before_open && version == 0 && existing_objects > 0;
    if version == 0 {
        validate_existing_table(&connection, "conversations", CONVERSATION_COLUMNS)?;
        validate_existing_table(&connection, "turns", TURN_COLUMNS)?;
        validate_existing_table(&connection, "project_state", PROJECT_STATE_COLUMNS)?;
        let transaction = connection.transaction().map_err(store_error)?;
        transaction
            .execute_batch(STORE_SCHEMA_SQL)
            .map_err(|error| incompatible_schema_error(&error.to_string()))?;
        validate_schema(&transaction)?;
        transaction
            .pragma_update(None, "user_version", STORE_VERSION)
            .map_err(store_error)?;
        transaction.commit().map_err(store_error)?;
    }
    validate_schema(&connection)?;
    Ok((connection, repaired))
}

fn expected_object_count(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            r#"SELECT COUNT(*) FROM sqlite_master
                WHERE name IN (
                  'conversations',
                  'turns',
                  'project_state',
                  'idx_sidera_conversations_project_status_updated',
                  'idx_sidera_turns_conversation_time'
                )"#,
            [],
            |row| row.get(0),
        )
        .map_err(store_error)
}

fn validate_existing_table(
    connection: &Connection,
    table: &str,
    required_columns: &[ExpectedColumn],
) -> Result<(), String> {
    if !schema_object_exists(connection, "table", table)? {
        return Ok(());
    }
    validate_table_columns(connection, table, required_columns)
}

fn validate_schema(connection: &Connection) -> Result<(), String> {
    validate_table_columns(connection, "conversations", CONVERSATION_COLUMNS)?;
    validate_table_columns(connection, "turns", TURN_COLUMNS)?;
    validate_table_columns(connection, "project_state", PROJECT_STATE_COLUMNS)?;
    validate_index_columns(
        connection,
        "idx_sidera_conversations_project_status_updated",
        &[
            ("project_id", false),
            ("status", false),
            ("updated_at_ms", true),
        ],
    )?;
    validate_index_columns(
        connection,
        "idx_sidera_turns_conversation_time",
        &[
            ("conversation_id", false),
            ("submitted_at_ms", false),
            ("id", false),
        ],
    )?;
    let mut foreign_keys = connection
        .prepare("PRAGMA foreign_key_list(turns)")
        .map_err(store_error)?;
    let rows = foreign_keys
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(store_error)?;
    let mut cascade_found = false;
    for row in rows {
        let (table, from, to, on_delete) = row.map_err(store_error)?;
        cascade_found |= table == "conversations"
            && from == "conversation_id"
            && to == "id"
            && on_delete.eq_ignore_ascii_case("CASCADE");
    }
    if !cascade_found {
        return Err(incompatible_schema_error(
            "turns.conversation_id cascade foreign key missing",
        ));
    }
    Ok(())
}

fn validate_table_columns(
    connection: &Connection,
    table: &str,
    required_columns: &[ExpectedColumn],
) -> Result<(), String> {
    if !schema_object_exists(connection, "table", table)? {
        return Err(incompatible_schema_error(&format!("missing table {table}")));
    }
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(store_error)?;
    let columns = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? != 0,
                row.get::<_, i64>(5)? != 0,
            ))
        })
        .map_err(store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(store_error)?;
    for column in required_columns {
        let Some((_, kind, not_null, primary_key)) =
            columns.iter().find(|(name, _, _, _)| name == column.name)
        else {
            return Err(incompatible_schema_error(&format!(
                "missing column {table}.{}",
                column.name
            )));
        };
        if !kind.eq_ignore_ascii_case(column.kind)
            || *not_null != column.not_null
            || *primary_key != column.primary_key
        {
            return Err(incompatible_schema_error(&format!(
                "incompatible column {table}.{}",
                column.name
            )));
        }
    }
    Ok(())
}

fn validate_index_columns(
    connection: &Connection,
    index: &str,
    expected: &[(&str, bool)],
) -> Result<(), String> {
    if !schema_object_exists(connection, "index", index)? {
        return Err(incompatible_schema_error(&format!("missing index {index}")));
    }
    let mut statement = connection
        .prepare(&format!("PRAGMA index_xinfo({index})"))
        .map_err(store_error)?;
    let columns = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)? != 0,
                row.get::<_, i64>(5)? != 0,
            ))
        })
        .map_err(store_error)?
        .filter_map(|row| match row {
            Ok((Some(name), descending, true)) => Some(Ok((name, descending))),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(store_error)?;
    if columns.len() != expected.len()
        || columns.iter().zip(expected).any(
            |((name, descending), (expected_name, expected_descending))| {
                name != expected_name || descending != expected_descending
            },
        )
    {
        return Err(incompatible_schema_error(&format!(
            "incompatible index {index}"
        )));
    }
    Ok(())
}

fn schema_object_exists(
    connection: &Connection,
    object_type: &str,
    name: &str,
) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = ?1 AND name = ?2)",
            params![object_type, name],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .map_err(store_error)
}

fn incompatible_schema_error(detail: &str) -> String {
    format!("SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE:{detail}")
}

fn get_snapshot_by_id(
    connection: &Connection,
    root: &Path,
    project_id: &str,
    conversation_id: &str,
) -> Result<SideraConversationSnapshot, String> {
    let conversation = get_summary(connection, root, project_id, conversation_id)?;
    let mut statement = connection
        .prepare(
            r#"SELECT id, submitted_at_ms, user_text, assistant_status, assistant_markdown,
                      entity_refs_json, retrieval_mode, citation_status, evidence_gate_status,
                      usage_json, updated_at_ms
                 FROM turns
                WHERE conversation_id = ?1
                ORDER BY submitted_at_ms, id"#,
        )
        .map_err(store_error)?;
    let rows = statement
        .query_map(params![conversation_id], stored_turn_from_row)
        .map_err(store_error)?;
    let mut turns = Vec::new();
    for row in rows {
        turns.push(row.map_err(store_error)?);
    }
    Ok(SideraConversationSnapshot {
        conversation,
        turns,
    })
}

fn get_summary(
    connection: &Connection,
    root: &Path,
    project_id: &str,
    conversation_id: &str,
) -> Result<SideraConversationSummary, String> {
    let parts = connection
        .query_row(
            r#"SELECT c.id, c.project_id, c.title, c.status, c.provider, c.model,
                      COUNT(t.id), c.created_at_ms, c.updated_at_ms, c.last_opened_at_ms
                 FROM conversations c
                 LEFT JOIN turns t ON t.conversation_id = c.id
                WHERE c.id = ?1 AND c.project_id = ?2
                GROUP BY c.id"#,
            params![conversation_id, project_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get::<_, i64>(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()
        .map_err(store_error)?
        .ok_or_else(|| "SIDERA_CONVERSATION_NOT_FOUND".to_string())?;
    Ok(summary_from_parts(
        root,
        parts.0,
        parts.1,
        parts.2,
        parts.3,
        parts.4,
        parts.5,
        parts.6.max(0) as u64,
        parts.7,
        parts.8,
        parts.9,
    ))
}

fn summary_from_parts(
    root: &Path,
    id: String,
    project_id: String,
    title: String,
    status: String,
    provider: String,
    model: String,
    turn_count: u64,
    created_at_ms: i64,
    updated_at_ms: i64,
    last_opened_at_ms: i64,
) -> SideraConversationSummary {
    let context_available = turn_count == 0
        || find_session_files(root, &project_id, &id)
            .map(|files| !files.is_empty())
            .unwrap_or(false);
    SideraConversationSummary {
        id,
        project_id,
        title,
        status,
        provider,
        model,
        context_available,
        turn_count,
        created_at_ms,
        updated_at_ms,
        last_opened_at_ms,
    }
}

fn get_turn(connection: &Connection, id: &str) -> Result<SideraStoredTurn, String> {
    connection
        .query_row(
            r#"SELECT id, submitted_at_ms, user_text, assistant_status, assistant_markdown,
                      entity_refs_json, retrieval_mode, citation_status, evidence_gate_status,
                      usage_json, updated_at_ms
                 FROM turns
                WHERE id = ?1"#,
            params![id],
            stored_turn_from_row,
        )
        .map_err(store_error)
}

fn stored_turn_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SideraStoredTurn> {
    let entity_refs: String = row.get(5)?;
    let usage: Option<String> = row.get(9)?;
    Ok(SideraStoredTurn {
        id: row.get(0)?,
        submitted_at_ms: row.get(1)?,
        user_text: row.get(2)?,
        assistant_status: row.get(3)?,
        assistant_markdown: row.get(4)?,
        entity_refs: serde_json::from_str(&entity_refs)
            .unwrap_or_else(|_| Value::Array(Vec::new())),
        retrieval_mode: row.get(6)?,
        citation_status: row.get(7)?,
        evidence_gate_status: row.get(8)?,
        usage: usage.and_then(|value| serde_json::from_str(&value).ok()),
        updated_at_ms: row.get(10)?,
    })
}

fn mutate_status_or_title(
    database_dir: &str,
    project_id: &str,
    conversation_id: &str,
    mutation: &str,
    title: Option<&str>,
) -> Result<SideraConversationSummary, String> {
    let project_id = validate_project_id(project_id)?;
    validate_conversation_id(conversation_id)?;
    let root = storage_root(database_dir)?;
    let mut connection = open_store(&root)?;
    let now = timestamp_ms();
    let transaction = connection.transaction().map_err(store_error)?;
    let changed = match mutation {
        "rename" => transaction.execute(
            "UPDATE conversations SET title=?1,updated_at_ms=?2 WHERE id=?3 AND project_id=?4",
            params![title.unwrap_or(DEFAULT_TITLE), now, conversation_id, project_id],
        ),
        "archive" => transaction.execute(
            "UPDATE conversations SET status='archived',updated_at_ms=?1 WHERE id=?2 AND project_id=?3",
            params![now, conversation_id, project_id],
        ),
        "restore" => transaction.execute(
            "UPDATE conversations SET status='active',updated_at_ms=?1 WHERE id=?2 AND project_id=?3",
            params![now, conversation_id, project_id],
        ),
        _ => return Err("SIDERA_CONVERSATION_MUTATION_INVALID".to_string()),
    }
    .map_err(store_error)?;
    if changed != 1 {
        return Err("SIDERA_CONVERSATION_NOT_FOUND".to_string());
    }
    if mutation == "archive" {
        transaction
            .execute(
                r#"UPDATE project_state
                      SET active_conversation_id = NULL, updated_at_ms = ?1
                    WHERE project_id = ?2 AND active_conversation_id = ?3"#,
                params![now, project_id, conversation_id],
            )
            .map_err(store_error)?;
    }
    transaction.commit().map_err(store_error)?;
    get_summary(&connection, &root, project_id, conversation_id)
}

fn set_active_tx(
    transaction: &Transaction<'_>,
    project_id: &str,
    conversation_id: &str,
    now: i64,
) -> Result<(), String> {
    transaction
        .execute(
            r#"INSERT INTO project_state(project_id, active_conversation_id, updated_at_ms)
               VALUES(?1, ?2, ?3)
               ON CONFLICT(project_id) DO UPDATE SET
                 active_conversation_id = excluded.active_conversation_id,
                 updated_at_ms = excluded.updated_at_ms"#,
            params![project_id, conversation_id, now],
        )
        .map_err(store_error)?;
    Ok(())
}

fn mark_interrupted(connection: &Connection, project_id: &str) -> Result<(), String> {
    connection
        .execute(
            r#"UPDATE turns
                  SET assistant_status = 'interrupted', updated_at_ms = ?1
                WHERE assistant_status = 'streaming'
                  AND conversation_id IN (
                    SELECT id FROM conversations WHERE project_id = ?2
                  )"#,
            params![timestamp_ms(), project_id],
        )
        .map_err(store_error)?;
    Ok(())
}

fn storage_root(database_dir: &str) -> Result<PathBuf, String> {
    let trimmed = database_dir.trim();
    if trimmed.is_empty() {
        return Err("SIDERA_CONVERSATION_DATABASE_DIR_REQUIRED".to_string());
    }
    let base = PathBuf::from(trimmed);
    if !base.is_dir() {
        return Err("SIDERA_CONVERSATION_DATABASE_DIR_NOT_FOUND".to_string());
    }
    Ok(base.join("Sidera"))
}

fn project_storage_key(project_id: &str) -> String {
    let digest = Sha256::digest(project_id.as_bytes());
    format!("project-{}", hex_prefix(&digest, 16))
}

fn find_session_files(
    root: &Path,
    project_id: &str,
    conversation_id: &str,
) -> Result<Vec<PathBuf>, String> {
    validate_conversation_id(conversation_id)?;
    let directory = root
        .join("pi-sessions")
        .join(project_storage_key(project_id));
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut matches = Vec::new();
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("SIDERA_CONVERSATION_SESSION_SCAN_FAILED:{error}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
            continue;
        }
        let filename_match = path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.contains(conversation_id));
        let header_match = fs::read_to_string(&path)
            .ok()
            .and_then(|text| text.lines().next().map(str::to_string))
            .and_then(|line| serde_json::from_str::<Value>(&line).ok())
            .is_some_and(|header| {
                header.get("id").and_then(Value::as_str) == Some(conversation_id)
                    || header.get("sessionId").and_then(Value::as_str) == Some(conversation_id)
            });
        if filename_match || header_match {
            matches.push(path);
        }
    }
    matches.sort();
    Ok(matches)
}

fn validate_project_id(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty() || value.as_bytes().len() > 300 {
        return Err("SIDERA_CONVERSATION_PROJECT_INVALID".to_string());
    }
    Ok(value)
}

fn validate_conversation_id(value: &str) -> Result<(), String> {
    let valid = !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err("SIDERA_CONVERSATION_ID_INVALID".to_string())
    }
}

fn normalize_status_filter(value: Option<&str>) -> Result<Option<String>, String> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("all") => Ok(None),
        Some("active") => Ok(Some("active".to_string())),
        Some("archived") => Ok(Some("archived".to_string())),
        _ => Err("SIDERA_CONVERSATION_STATUS_INVALID".to_string()),
    }
}

fn normalize_turn_status(value: &str) -> Result<&str, String> {
    match value {
        "streaming" | "complete" | "cancelled" | "failed" | "interrupted" => Ok(value),
        _ => Err("SIDERA_CONVERSATION_TURN_STATUS_INVALID".to_string()),
    }
}

fn normalize_title(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(80)
        .collect()
}

fn first_prompt_title(value: &str) -> String {
    let title = normalize_title(value);
    let compact = title.chars().take(40).collect::<String>();
    if compact.is_empty() {
        DEFAULT_TITLE.to_string()
    } else {
        compact
    }
}

fn make_conversation_id() -> String {
    let sequence = CONVERSATION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("sidera-{}-{sequence}", timestamp_ms())
}

fn timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn hex_prefix(bytes: &[u8], count: usize) -> String {
    bytes
        .iter()
        .flat_map(|byte| format!("{byte:02x}").chars().collect::<Vec<_>>())
        .take(count)
        .collect()
}

fn store_error(error: rusqlite::Error) -> String {
    format!("SIDERA_CONVERSATION_STORE_FAILED:{error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "sidera-r4-{label}-{}-{}",
                std::process::id(),
                CONVERSATION_SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
            fs::create_dir_all(&path).expect("create test library directory");
            Self(path)
        }

        fn as_string(&self) -> String {
            self.0.display().to_string()
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn scope(root: &TestDirectory) -> ConversationScopeInput {
        ConversationScopeInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
        }
    }

    fn conversation(root: &TestDirectory, id: &str) -> CreateConversationInput {
        CreateConversationInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: Some(id.to_string()),
            provider: "openai-compatible".to_string(),
            model: "test-model".to_string(),
        }
    }

    #[test]
    fn conversation_lifecycle_marks_interrupted_and_cascades_session_delete() {
        let root = TestDirectory::new("lifecycle");
        let created = create_conversation(conversation(&root, "conversation-one"))
            .expect("create conversation");
        assert_eq!(created.conversation.title, DEFAULT_TITLE);
        assert_eq!(created.conversation.turn_count, 0);

        upsert_turn(UpsertConversationTurnInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
            id: "turn-one".to_string(),
            submitted_at_ms: 1,
            user_text: "分析量子材料研究趋势".to_string(),
            assistant_status: "streaming".to_string(),
            assistant_markdown: "部分回答".to_string(),
            entity_refs: Value::Array(Vec::new()),
            retrieval_mode: None,
            citation_status: None,
            evidence_gate_status: None,
            usage: None,
        })
        .expect("checkpoint streaming turn");

        let pi_root =
            session_root(&root.as_string(), "project-test").expect("create Pi session directory");
        let session_file = pi_root.join("conversation-one.jsonl");
        fs::write(&session_file, "{\"id\":\"conversation-one\"}\n")
            .expect("write Pi session fixture");

        let listed = list_conversations(ListConversationsInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            status: Some("active".to_string()),
            query: Some("量子材料".to_string()),
        })
        .expect("list conversations");
        assert_eq!(listed.len(), 1);
        assert!(listed[0].context_available);
        assert_eq!(listed[0].title, "分析量子材料研究趋势");

        let reopened = open_most_recent(scope(&root))
            .expect("open recent conversation")
            .expect("recent conversation exists");
        assert_eq!(reopened.turns[0].assistant_status, "interrupted");

        let renamed = rename_conversation(RenameConversationInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
            title: "手动标题".to_string(),
        })
        .expect("rename conversation");
        assert_eq!(renamed.title, "手动标题");

        let active_delete = delete_conversation(ConversationIdInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
        });
        assert!(active_delete
            .expect_err("active conversation cannot be permanently deleted")
            .contains("DELETE_REQUIRES_ARCHIVE"));

        archive_conversation(ConversationIdInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
        })
        .expect("archive conversation");
        let restored = restore_conversation(ConversationIdInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
        })
        .expect("restore conversation");
        assert_eq!(restored.status, "active");
        archive_conversation(ConversationIdInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
        })
        .expect("archive restored conversation");
        delete_conversation(ConversationIdInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            conversation_id: "conversation-one".to_string(),
        })
        .expect("delete archived conversation");
        assert!(!session_file.exists());
        assert!(list_conversations(ListConversationsInput {
            database_dir: root.as_string(),
            project_id: "project-test".to_string(),
            status: Some("all".to_string()),
            query: None,
        })
        .expect("list after delete")
        .is_empty());
    }

    #[test]
    fn conversation_ids_and_projects_are_strictly_scoped() {
        let root = TestDirectory::new("scope");
        let invalid = create_conversation(conversation(&root, "../escape"));
        assert!(invalid
            .expect_err("path-like conversation ID must be rejected")
            .contains("ID_INVALID"));

        create_conversation(conversation(&root, "conversation-two"))
            .expect("create scoped conversation");
        let wrong_project = open_conversation(ConversationIdInput {
            database_dir: root.as_string(),
            project_id: "project-other".to_string(),
            conversation_id: "conversation-two".to_string(),
        });
        assert!(wrong_project
            .expect_err("cross-project open must fail")
            .contains("NOT_FOUND"));
    }

    #[test]
    fn partial_v0_store_repairs_in_place_and_preserves_rows() {
        let root = TestDirectory::new("partial-v0");
        let store_root = root.0.join("Sidera");
        fs::create_dir_all(&store_root).expect("create Sidera store root");
        let database_path = store_root.join("conversations-v1.sqlite");
        let connection = Connection::open(&database_path).expect("open partial store");
        connection
            .execute_batch(
                r#"CREATE TABLE conversations (
                     id TEXT PRIMARY KEY,
                     project_id TEXT NOT NULL,
                     title TEXT NOT NULL,
                     status TEXT NOT NULL,
                     provider TEXT NOT NULL,
                     model TEXT NOT NULL,
                     created_at_ms INTEGER NOT NULL,
                     updated_at_ms INTEGER NOT NULL,
                     last_opened_at_ms INTEGER NOT NULL
                   );
                   INSERT INTO conversations(
                     id, project_id, title, status, provider, model,
                     created_at_ms, updated_at_ms, last_opened_at_ms
                   ) VALUES(
                     'partial-one', 'project-test', '保留的会话', 'active',
                     'openai-compatible', 'test-model', 1, 2, 3
                   );"#,
            )
            .expect("create broken-release partial schema");
        drop(connection);

        let readiness = check_conversation_store(scope(&root)).expect("repair partial store");
        assert_eq!(readiness.status, "repaired");
        assert!(readiness.repaired);
        assert_eq!(readiness.schema_version, STORE_VERSION);
        assert_eq!(readiness.conversation_count, 1);

        let connection = Connection::open(&database_path).expect("reopen repaired store");
        validate_schema(&connection).expect("complete schema after repair");
        let preserved_title = connection
            .query_row(
                "SELECT title FROM conversations WHERE id = 'partial-one'",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("preserved conversation row");
        assert_eq!(preserved_title, "保留的会话");
        let version = connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .expect("schema version");
        assert_eq!(version, STORE_VERSION);
    }

    #[test]
    fn incompatible_partial_store_is_not_recreated() {
        let root = TestDirectory::new("incompatible-v0");
        let store_root = root.0.join("Sidera");
        fs::create_dir_all(&store_root).expect("create Sidera store root");
        let database_path = store_root.join("conversations-v1.sqlite");
        let connection = Connection::open(&database_path).expect("open incompatible store");
        connection
            .execute_batch(
                r#"CREATE TABLE conversations(
                     id TEXT,
                     project_id TEXT,
                     title TEXT,
                     status TEXT,
                     provider TEXT,
                     model TEXT,
                     created_at_ms INTEGER,
                     updated_at_ms INTEGER,
                     last_opened_at_ms INTEGER
                   );"#,
            )
            .expect("create incompatible schema");
        drop(connection);

        let error = check_conversation_store(scope(&root))
            .expect_err("incompatible store must not be rebuilt");
        assert!(error.contains("SIDERA_CONVERSATION_SCHEMA_INCOMPATIBLE"));
        let connection = Connection::open(&database_path).expect("reopen incompatible store");
        let version = connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .expect("read unchanged version");
        assert_eq!(version, 0);
        assert!(
            !schema_object_exists(&connection, "table", "turns").expect("inspect unchanged store")
        );
    }
}
