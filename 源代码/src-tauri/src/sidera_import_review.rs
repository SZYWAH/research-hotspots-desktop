use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use research_hotspots_core::agent_store::migrate_library_file;
use research_hotspots_core::import_commit::{
    execute_import_commit, import_commit_history_from_connection,
    import_commit_status_from_connection, prepare_import_commit, rollback_import_commit,
    SideraImportCommitContext, SideraImportCommitExecuteInput, SideraImportCommitHistory,
    SideraImportCommitHistoryInput, SideraImportCommitPrepareInput, SideraImportCommitPreview,
    SideraImportCommitResult, SideraImportCommitStatus, SideraImportCommitStatusInput,
    SideraImportRollbackInput, SideraImportRollbackResult,
};
use research_hotspots_core::import_review::{
    copy_frozen_review_batch, create_review_batch, create_review_batch_from_candidates,
    discard_review_batch, list_review_batches, open_review_batch, save_review_decision,
    SideraImportDecisionKind, SideraImportReviewBatch, SideraImportReviewCopyInput,
    SideraInMemoryImportReviewInput, SideraNormalizedImportCandidate,
};
use serde::Deserialize;

const REVIEW_DATABASE_RELATIVE_PATH: &str = "Sidera/import-review-v1.sqlite";
const LIBRARY_DATABASE_FILE: &str = "research-hotspots-v7.sqlite";
const IMPORT_READ_FAULT_FIXTURE_UNAVAILABLE: &str = "SIDERA_IMPORT_READ_FAULT_FIXTURE_UNAVAILABLE";
const IMPORT_READ_FAULT_FIXTURE_STATE_FAILED: &str =
    "SIDERA_IMPORT_READ_FAULT_FIXTURE_STATE_FAILED";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum SideraImportReadFaultTarget {
    BatchList,
    CommitStatus,
    CommitHistory,
}

impl SideraImportReadFaultTarget {
    fn error_code(self) -> &'static str {
        match self {
            Self::BatchList => "SIDERA_IMPORT_READ_FIXTURE_BATCH_LIST_FAILED",
            Self::CommitStatus => "SIDERA_IMPORT_READ_FIXTURE_COMMIT_STATUS_FAILED",
            Self::CommitHistory => "SIDERA_IMPORT_READ_FIXTURE_COMMIT_HISTORY_FAILED",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportReadFaultFixtureInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    target: SideraImportReadFaultTarget,
}

#[derive(Debug)]
struct SideraImportReadFaultFixture {
    database_dir: PathBuf,
    project_id: String,
    target: SideraImportReadFaultTarget,
}

static IMPORT_READ_FAULT_FIXTURE: OnceLock<Mutex<Option<SideraImportReadFaultFixture>>> =
    OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportReviewCreateInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportReviewProjectInput {
    database_dir: Option<String>,
    project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportReviewBatchInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    batch_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportReviewDecisionInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    batch_id: String,
    candidate_id: String,
    decision: Option<SideraImportDecisionKind>,
    target_paper_id: Option<String>,
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportCommitExecuteCommandInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    batch_id: String,
    preview_id: String,
    preview_hash: String,
    batch_version: i64,
    expected_revision: i64,
    client_commit_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportCommitHistoryCommandInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    batch_id: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SideraImportRollbackCommandInput {
    database_dir: Option<String>,
    project_id: Option<String>,
    batch_id: String,
    commit_id: String,
    expected_revision: i64,
    client_rollback_id: String,
}

fn review_paths(
    app: &tauri::AppHandle,
    database_dir: Option<String>,
) -> Result<(PathBuf, PathBuf), String> {
    let database_dir = super::resolve_database_dir(app, database_dir)?;
    Ok((
        database_dir.join(REVIEW_DATABASE_RELATIVE_PATH),
        database_dir.join(LIBRARY_DATABASE_FILE),
    ))
}

fn project_id(value: Option<String>) -> String {
    value
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(super::default_project_id)
}

fn import_read_fault_fixture_state() -> &'static Mutex<Option<SideraImportReadFaultFixture>> {
    IMPORT_READ_FAULT_FIXTURE.get_or_init(|| Mutex::new(None))
}

fn maybe_fail_import_read(
    database_dir: &Path,
    project_id: &str,
    target: SideraImportReadFaultTarget,
) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Ok(());
    }
    let mut fixture = import_read_fault_fixture_state()
        .lock()
        .map_err(|_| IMPORT_READ_FAULT_FIXTURE_STATE_FAILED.to_string())?;
    let should_fail = fixture.as_ref().is_some_and(|fixture| {
        fixture.database_dir == database_dir
            && fixture.project_id == project_id
            && fixture.target == target
    });
    if should_fail {
        *fixture = None;
        return Err(target.error_code().to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn sidera_import_read_fault_fixture_arm(
    app: tauri::AppHandle,
    input: SideraImportReadFaultFixtureInput,
) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err(IMPORT_READ_FAULT_FIXTURE_UNAVAILABLE.to_string());
    }
    let database_dir = super::resolve_database_dir(&app, input.database_dir)?;
    let project_id = project_id(input.project_id);
    let mut fixture = import_read_fault_fixture_state()
        .lock()
        .map_err(|_| IMPORT_READ_FAULT_FIXTURE_STATE_FAILED.to_string())?;
    *fixture = Some(SideraImportReadFaultFixture {
        database_dir,
        project_id,
        target: input.target,
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn sidera_import_read_fault_fixture_clear() -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err(IMPORT_READ_FAULT_FIXTURE_UNAVAILABLE.to_string());
    }
    let mut fixture = import_read_fault_fixture_state()
        .lock()
        .map_err(|_| IMPORT_READ_FAULT_FIXTURE_STATE_FAILED.to_string())?;
    *fixture = None;
    Ok(())
}

fn validate_batch_id(value: &str) -> Result<(), String> {
    if value.len() > 96
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("SIDERA_IMPORT_REVIEW_BATCH_ID_INVALID".to_string());
    }
    Ok(())
}

fn validate_candidate_id(value: &str) -> Result<(), String> {
    if value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("SIDERA_IMPORT_REVIEW_CANDIDATE_ID_INVALID".to_string());
    }
    Ok(())
}

fn commit_context(
    app: &tauri::AppHandle,
    database_dir: Option<String>,
    project_id_value: Option<String>,
    batch_id: String,
) -> Result<SideraImportCommitContext, String> {
    if !batch_id.is_empty() {
        validate_batch_id(&batch_id)?;
    }
    let (review_database, library_database) = review_paths(app, database_dir)?;
    Ok(SideraImportCommitContext {
        review_database,
        library_database,
        project_id: project_id(project_id_value),
        batch_id,
    })
}

fn migrate_commit_library(context: &SideraImportCommitContext) -> Result<(), String> {
    if !context.library_database.is_file() {
        return Err("SIDERA_IMPORT_COMMIT_LIBRARY_NOT_FOUND".to_string());
    }
    migrate_library_file(
        &context.library_database,
        &context.project_id,
        super::now_millis().min(i64::MAX as u128) as i64,
        true,
    )
    .map(|_| ())
    .map_err(|error| format!("SIDERA_IMPORT_COMMIT_LIBRARY_MIGRATION_FAILED:{error}"))
}

#[tauri::command]
pub(crate) async fn sidera_import_review_batch_create(
    app: tauri::AppHandle,
    input: SideraImportReviewCreateInput,
) -> Result<SideraImportReviewBatch, String> {
    let (review_database, library_database) = review_paths(&app, input.database_dir)?;
    let project_id = project_id(input.project_id);
    let file_path = Path::new(&input.file_path).to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        create_review_batch(&review_database, &library_database, &project_id, &file_path)
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_REVIEW_TASK_FAILED".to_string())?
}

pub(crate) async fn create_from_validated_search(
    app: tauri::AppHandle,
    database_dir: Option<String>,
    project_id_value: Option<String>,
    search_id: String,
    generation: u64,
    connector_version: String,
    query: String,
    candidates: Vec<SideraNormalizedImportCandidate>,
) -> Result<SideraImportReviewBatch, String> {
    let (review_database, library_database) = review_paths(&app, database_dir)?;
    let project_id = project_id(project_id_value);
    let review_input = SideraInMemoryImportReviewInput {
        query,
        search_id,
        generation,
        connector_version,
        candidates,
    };
    tauri::async_runtime::spawn_blocking(move || {
        create_review_batch_from_candidates(
            &review_database,
            &library_database,
            &project_id,
            review_input,
        )
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_REVIEW_TASK_FAILED".to_string())?
}

#[tauri::command]
pub(crate) fn sidera_import_review_batch_list(
    app: tauri::AppHandle,
    input: SideraImportReviewProjectInput,
) -> Result<Vec<SideraImportReviewBatch>, String> {
    let database_dir = super::resolve_database_dir(&app, input.database_dir)?;
    let project_id = project_id(input.project_id);
    maybe_fail_import_read(
        &database_dir,
        &project_id,
        SideraImportReadFaultTarget::BatchList,
    )?;
    let review_database = database_dir.join(REVIEW_DATABASE_RELATIVE_PATH);
    list_review_batches(&review_database, &project_id)
}

#[tauri::command]
pub(crate) fn sidera_import_review_batch_open(
    app: tauri::AppHandle,
    input: SideraImportReviewBatchInput,
) -> Result<SideraImportReviewBatch, String> {
    validate_batch_id(&input.batch_id)?;
    let (review_database, _) = review_paths(&app, input.database_dir)?;
    open_review_batch(
        &review_database,
        &project_id(input.project_id),
        &input.batch_id,
    )
}

#[tauri::command]
pub(crate) fn sidera_import_review_batch_clone(
    app: tauri::AppHandle,
    input: SideraImportReviewBatchInput,
) -> Result<SideraImportReviewBatch, String> {
    validate_batch_id(&input.batch_id)?;
    let (review_database, _) = review_paths(&app, input.database_dir)?;
    copy_frozen_review_batch(SideraImportReviewCopyInput {
        review_database,
        project_id: project_id(input.project_id),
        source_batch_id: input.batch_id,
    })
}

#[tauri::command]
pub(crate) fn sidera_import_review_decision_save(
    app: tauri::AppHandle,
    input: SideraImportReviewDecisionInput,
) -> Result<SideraImportReviewBatch, String> {
    validate_batch_id(&input.batch_id)?;
    validate_candidate_id(&input.candidate_id)?;
    let (review_database, _) = review_paths(&app, input.database_dir)?;
    save_review_decision(
        &review_database,
        &project_id(input.project_id),
        &input.batch_id,
        &input.candidate_id,
        input.decision,
        input.target_paper_id,
        input.note,
    )
}

#[tauri::command]
pub(crate) fn sidera_import_review_batch_discard(
    app: tauri::AppHandle,
    input: SideraImportReviewBatchInput,
) -> Result<(), String> {
    validate_batch_id(&input.batch_id)?;
    let (review_database, _) = review_paths(&app, input.database_dir)?;
    discard_review_batch(
        &review_database,
        &project_id(input.project_id),
        &input.batch_id,
    )
}

#[tauri::command]
pub(crate) async fn sidera_import_review_commit_prepare(
    app: tauri::AppHandle,
    mutation_state: tauri::State<'_, super::LibraryMutationRegistry>,
    input: SideraImportReviewBatchInput,
) -> Result<SideraImportCommitPreview, String> {
    let context = commit_context(&app, input.database_dir, input.project_id, input.batch_id)?;
    let registry = mutation_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = registry.try_acquire(&context.library_database, "import-commit-prepare")?;
        migrate_commit_library(&context)?;
        prepare_import_commit(SideraImportCommitPrepareInput { context })
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_COMMIT_TASK_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn sidera_import_review_commit_execute(
    app: tauri::AppHandle,
    mutation_state: tauri::State<'_, super::LibraryMutationRegistry>,
    input: SideraImportCommitExecuteCommandInput,
) -> Result<SideraImportCommitResult, String> {
    let context = commit_context(&app, input.database_dir, input.project_id, input.batch_id)?;
    let registry = mutation_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = registry.try_acquire(&context.library_database, "import-commit")?;
        migrate_commit_library(&context)?;
        execute_import_commit(SideraImportCommitExecuteInput {
            context,
            preview_id: input.preview_id,
            preview_hash: input.preview_hash,
            batch_version: input.batch_version,
            expected_revision: input.expected_revision,
            client_commit_id: input.client_commit_id,
        })
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_COMMIT_TASK_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn sidera_import_review_commit_status(
    app: tauri::AppHandle,
    input: SideraImportReviewBatchInput,
) -> Result<SideraImportCommitStatus, String> {
    let resolved_database_dir = super::resolve_database_dir(&app, input.database_dir.clone())?;
    maybe_fail_import_read(
        &resolved_database_dir,
        &project_id(input.project_id.clone()),
        SideraImportReadFaultTarget::CommitStatus,
    )?;
    let database_dir = input.database_dir.clone();
    let context = commit_context(&app, input.database_dir, input.project_id, input.batch_id)?;
    let (library, _, database_path) = super::open_library_database_read_only(&app, database_dir)?;
    if database_path != context.library_database {
        return Err("SIDERA_IMPORT_COMMIT_LIBRARY_PATH_MISMATCH".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        import_commit_status_from_connection(SideraImportCommitStatusInput { context }, &library)
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_COMMIT_TASK_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn sidera_import_review_commit_history(
    app: tauri::AppHandle,
    input: SideraImportCommitHistoryCommandInput,
) -> Result<SideraImportCommitHistory, String> {
    let resolved_database_dir = super::resolve_database_dir(&app, input.database_dir.clone())?;
    maybe_fail_import_read(
        &resolved_database_dir,
        &project_id(input.project_id.clone()),
        SideraImportReadFaultTarget::CommitHistory,
    )?;
    let database_dir = input.database_dir.clone();
    let context = commit_context(
        &app,
        input.database_dir,
        input.project_id,
        input.batch_id.unwrap_or_default(),
    )?;
    let (library, _, database_path) = super::open_library_database_read_only(&app, database_dir)?;
    if database_path != context.library_database {
        return Err("SIDERA_IMPORT_COMMIT_LIBRARY_PATH_MISMATCH".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        import_commit_history_from_connection(
            SideraImportCommitHistoryInput {
                context,
                limit: input.limit,
            },
            &library,
        )
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_COMMIT_TASK_FAILED".to_string())?
}

#[tauri::command]
pub(crate) async fn sidera_import_review_commit_rollback(
    app: tauri::AppHandle,
    mutation_state: tauri::State<'_, super::LibraryMutationRegistry>,
    input: SideraImportRollbackCommandInput,
) -> Result<SideraImportRollbackResult, String> {
    let context = commit_context(&app, input.database_dir, input.project_id, input.batch_id)?;
    let registry = mutation_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = registry.try_acquire(&context.library_database, "import-commit-rollback")?;
        migrate_commit_library(&context)?;
        rollback_import_commit(SideraImportRollbackInput {
            context,
            commit_id: input.commit_id,
            expected_revision: input.expected_revision,
            client_rollback_id: input.client_rollback_id,
        })
    })
    .await
    .map_err(|_| "SIDERA_IMPORT_COMMIT_TASK_FAILED".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_read_fault_fixture_is_scoped_and_consumed_once() {
        let database_dir = PathBuf::from("fixture-library");
        let project_id = "project-fixture".to_string();
        {
            let mut fixture = import_read_fault_fixture_state()
                .lock()
                .expect("fixture lock");
            *fixture = Some(SideraImportReadFaultFixture {
                database_dir: database_dir.clone(),
                project_id: project_id.clone(),
                target: SideraImportReadFaultTarget::CommitStatus,
            });
        }

        assert!(maybe_fail_import_read(
            &database_dir,
            "another-project",
            SideraImportReadFaultTarget::CommitStatus,
        )
        .is_ok());
        assert_eq!(
            maybe_fail_import_read(
                &database_dir,
                &project_id,
                SideraImportReadFaultTarget::CommitStatus,
            )
            .expect_err("matching fixture must fail"),
            "SIDERA_IMPORT_READ_FIXTURE_COMMIT_STATUS_FAILED"
        );
        assert!(maybe_fail_import_read(
            &database_dir,
            &project_id,
            SideraImportReadFaultTarget::CommitStatus,
        )
        .is_ok());
    }
}
