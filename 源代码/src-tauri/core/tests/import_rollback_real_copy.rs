use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use research_hotspots_core::import_commit::{
    rollback_import_commit, SideraImportCommitContext, SideraImportRollbackInput,
};
use rusqlite::backup::Backup;
use rusqlite::{params, Connection, OpenFlags};

fn required_env(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("missing required environment variable {name}"))
}

fn unique_copy_root(case_name: &str) -> PathBuf {
    let root = PathBuf::from(required_env("SIDERA_ACCEPTANCE_COPY_ROOT"));
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis();
    root.join(format!("{case_name}-{stamp}-{}", std::process::id()))
}

fn clone_sqlite(source: &Path, destination: &Path) {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).expect("create copy directory");
    }
    let source = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .expect("open source database read-only");
    let mut destination = Connection::open(destination).expect("create destination database");
    let backup = Backup::new(&source, &mut destination).expect("start SQLite backup");
    backup
        .run_to_completion(128, Duration::from_millis(5), None)
        .expect("complete SQLite backup");
}

fn clone_acceptance_databases(case_name: &str) -> (PathBuf, PathBuf, PathBuf) {
    let source_library = PathBuf::from(required_env("SIDERA_ACCEPTANCE_LIBRARY"));
    let source_review = PathBuf::from(required_env("SIDERA_ACCEPTANCE_REVIEW"));
    let root = unique_copy_root(case_name);
    let library = root.join("research-hotspots-v7.sqlite");
    let review = root.join("Sidera").join("import-review-v1.sqlite");
    clone_sqlite(&source_library, &library);
    clone_sqlite(&source_review, &review);
    (root, library, review)
}

fn context(library: &Path, review: &Path) -> SideraImportCommitContext {
    SideraImportCommitContext {
        review_database: review.to_path_buf(),
        library_database: library.to_path_buf(),
        project_id: required_env("SIDERA_ACCEPTANCE_PROJECT_ID"),
        batch_id: required_env("SIDERA_ACCEPTANCE_BATCH_ID"),
    }
}

fn commit_id() -> String {
    required_env("SIDERA_ACCEPTANCE_COMMIT_ID")
}

fn revision(connection: &Connection, project_id: &str) -> i64 {
    connection
        .query_row(
            "SELECT revision FROM library_revision_state WHERE project_id=?1",
            params![project_id],
            |row| row.get(0),
        )
        .expect("library revision")
}

fn paper_count(connection: &Connection, project_id: &str) -> i64 {
    connection
        .query_row(
            "SELECT COUNT(*) FROM papers WHERE project_id=?1",
            params![project_id],
            |row| row.get(0),
        )
        .expect("paper count")
}

fn ledger_after_revision(connection: &Connection, commit_id: &str) -> i64 {
    connection
        .query_row(
            "SELECT after_revision FROM paper_import_commits WHERE id=?1",
            params![commit_id],
            |row| row.get(0),
        )
        .expect("commit after revision")
}

#[test]
#[ignore = "requires explicit paths to copies of a user-accepted committed library"]
fn accepted_commit_rolls_back_atomically_on_a_copy() {
    let (root, library_path, review_path) = clone_acceptance_databases("rollback-pass");
    let context = context(&library_path, &review_path);
    let commit_id = commit_id();
    let library = Connection::open(&library_path).expect("library copy");
    let before_count = paper_count(&library, &context.project_id);
    let expected_revision = ledger_after_revision(&library, &commit_id);
    assert_eq!(revision(&library, &context.project_id), expected_revision);
    drop(library);

    let result = rollback_import_commit(SideraImportRollbackInput {
        context: context.clone(),
        commit_id: commit_id.clone(),
        expected_revision,
        client_rollback_id: "real-copy-rollback-pass".to_string(),
    })
    .expect("rollback real acceptance copy");
    assert_eq!(result.status, "rolled-back");
    assert!(result.rollback_conflicts.is_empty());

    let library = Connection::open(&library_path).expect("rolled back library copy");
    assert_eq!(
        paper_count(&library, &context.project_id),
        before_count - result.deleted_count as i64
    );
    assert_eq!(
        revision(&library, &context.project_id),
        expected_revision + i64::from(result.deleted_count + result.restored_count > 0)
    );
    assert_eq!(
        library
            .query_row(
                "SELECT status FROM paper_import_commits WHERE id=?1",
                params![commit_id],
                |row| row.get::<_, String>(0),
            )
            .expect("ledger status"),
        "rolled-back"
    );
    assert_eq!(
        library
            .query_row(
                "SELECT COUNT(*) FROM paper_source_records WHERE commit_id=?1",
                params![commit_id],
                |row| row.get::<_, i64>(0),
            )
            .expect("remaining source records"),
        0
    );
    let foreign_key_violations: i64 = library
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .expect("foreign key check");
    assert_eq!(foreign_key_violations, 0);
    let review = Connection::open(&review_path).expect("review copy");
    assert_eq!(
        review
            .query_row(
                "SELECT status FROM review_batches WHERE id=?1",
                params![context.batch_id],
                |row| row.get::<_, String>(0),
            )
            .expect("review status"),
        "rolled-back"
    );
    println!(
        "REAL_COPY_ROLLBACK_PASS root={} deleted={} restored={} revision={}",
        root.display(),
        result.deleted_count,
        result.restored_count,
        result.rollback_revision.expect("rollback revision")
    );
}

#[test]
#[ignore = "requires explicit paths to copies of a user-accepted committed library"]
fn accepted_commit_with_a_later_edit_blocks_rollback_on_a_copy() {
    let (root, library_path, review_path) = clone_acceptance_databases("rollback-drift");
    let context = context(&library_path, &review_path);
    let commit_id = commit_id();
    let library = Connection::open(&library_path).expect("library copy");
    let expected_revision = ledger_after_revision(&library, &commit_id);
    let before_count = paper_count(&library, &context.project_id);
    let paper_id: String = library
        .query_row(
            "SELECT paper_id FROM paper_import_commit_items
             WHERE commit_id=?1 AND paper_id IS NOT NULL ORDER BY candidate_id LIMIT 1",
            params![commit_id],
            |row| row.get(0),
        )
        .expect("committed paper id");
    library
        .execute(
            "UPDATE papers SET title=title || ' [post-commit-edit]' WHERE id=?1 AND project_id=?2",
            params![paper_id, context.project_id],
        )
        .expect("simulate later paper edit");
    library
        .execute(
            "UPDATE library_revision_state SET revision=revision+1 WHERE project_id=?1",
            params![context.project_id],
        )
        .expect("simulate later revision");
    drop(library);

    let result = rollback_import_commit(SideraImportRollbackInput {
        context: context.clone(),
        commit_id: commit_id.clone(),
        expected_revision,
        client_rollback_id: "real-copy-rollback-drift".to_string(),
    })
    .expect("blocked rollback result");
    assert_eq!(result.status, "blocked");
    assert!(result
        .rollback_conflicts
        .iter()
        .any(|conflict| conflict.code == "SIDERA_IMPORT_ROLLBACK_REVISION_DRIFT"));
    assert!(result
        .rollback_conflicts
        .iter()
        .any(|conflict| conflict.code == "SIDERA_IMPORT_ROLLBACK_PAPER_DRIFT"));

    let library = Connection::open(&library_path).expect("blocked library copy");
    assert_eq!(paper_count(&library, &context.project_id), before_count);
    assert_eq!(
        library
            .query_row(
                "SELECT status FROM paper_import_commits WHERE id=?1",
                params![commit_id],
                |row| row.get::<_, String>(0),
            )
            .expect("ledger status"),
        "committed"
    );
    let edited_title: String = library
        .query_row(
            "SELECT title FROM papers WHERE id=?1 AND project_id=?2",
            params![paper_id, context.project_id],
            |row| row.get(0),
        )
        .expect("edited paper retained");
    assert!(edited_title.ends_with(" [post-commit-edit]"));
    let review = Connection::open(&review_path).expect("review copy");
    assert_eq!(
        review
            .query_row(
                "SELECT status FROM review_batches WHERE id=?1",
                params![context.batch_id],
                |row| row.get::<_, String>(0),
            )
            .expect("review status"),
        "committed"
    );
    println!(
        "REAL_COPY_ROLLBACK_DRIFT_BLOCKED root={} paper_id={} conflicts={}",
        root.display(),
        paper_id,
        result.rollback_conflicts.len()
    );
}
