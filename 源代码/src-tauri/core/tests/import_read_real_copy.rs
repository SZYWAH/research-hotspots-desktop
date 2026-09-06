use std::env;
use std::path::PathBuf;

use research_hotspots_core::import_commit::{
    import_commit_history, import_commit_status, SideraImportCommitContext,
    SideraImportCommitHistoryInput, SideraImportCommitStatusInput,
};

fn required_path(name: &str) -> PathBuf {
    PathBuf::from(
        env::var(name).unwrap_or_else(|_| panic!("missing required environment variable {name}")),
    )
}

#[test]
fn status_and_history_read_a_v14_exact_copy_without_review_receipts() {
    let library_database = required_path("SIDERA_R3_LIBRARY_COPY");
    let review_database = library_database
        .parent()
        .expect("copy parent")
        .join("missing-review-store.sqlite");
    assert!(!review_database.exists(), "review fixture must stay absent");

    let history = import_commit_history(SideraImportCommitHistoryInput {
        context: SideraImportCommitContext {
            review_database: review_database.clone(),
            library_database: library_database.clone(),
            project_id: "project-default".to_string(),
            batch_id: String::new(),
        },
        limit: Some(20),
    })
    .expect("read authoritative commit history");
    let latest = history
        .entries
        .first()
        .expect("real copy contains an authoritative commit ledger entry");

    let status = import_commit_status(SideraImportCommitStatusInput {
        context: SideraImportCommitContext {
            review_database: review_database.clone(),
            library_database,
            project_id: "project-default".to_string(),
            batch_id: latest.batch_id.clone(),
        },
    })
    .expect("read authoritative commit status without review receipt");

    assert_eq!(status.batch_id, latest.batch_id);
    assert_eq!(status.commit_id, latest.commit_id);
    assert!(
        !review_database.exists(),
        "read path must not create review store"
    );
    println!(
        "R3_REAL_COPY_READ_PASS history={} batch={} status={}",
        history.entries.len(),
        status.batch_id,
        status.batch_status
    );
}
