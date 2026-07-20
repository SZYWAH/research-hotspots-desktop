use std::{
    env, fs,
    path::{Path, PathBuf},
};

use research_hotspots_core::{
    agent::{
        canonical_value_sha256, AgentAutomationMode, AgentBudget, AgentPlan, AgentPlanStep,
        AgentRiskLevel, AgentRunStatus, AgentStepStatus, AgentSuccessCriterion,
    },
    agent_executor::{
        evaluate_completion_gate, governed_action_hash, CompletionDisposition, CompletionGateInput,
    },
    agent_store::{
        AgentArtifactRecord, AgentLease, AgentLeaseFence, AgentRepository,
        AgentStepExecutionBinding, NewAgentRun,
    },
    agent_tools::AgentToolRegistry,
    ensure_library_schema, AnalysisState, LIBRARY_SCHEMA_VERSION,
};
use rusqlite::Connection;
use serde_json::{json, Value};

const PROJECT_ID: &str = "project-default";
const SNAPSHOT_ID: &str = "audit-snapshot-v20";
const PLANNER_PROFILE: &str = "audit-planner-profile";
const WRITER_PROFILE: &str = "audit-writer-profile";

fn main() -> Result<(), String> {
    let root = parse_root()?;
    prepare_owned_root(&root)?;
    let database = root.join("agent-executor-v10.sqlite");
    remove_owned_database_files(&database)?;

    let connection = Connection::open(&database).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|error| error.to_string())?;
    ensure_library_schema(&connection)?;
    connection
        .execute(
            "INSERT INTO v20_analysis_snapshots(id,project_id,algorithm_version,paper_count,hotspot_count,membership_count,status,created_at) VALUES(?1,?2,'v20-audit',3,1,3,'ready','audit')",
            rusqlite::params![SNAPSHOT_ID, PROJECT_ID],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO v20_analysis_state(project_id,active_snapshot_id,updated_at) VALUES(?1,?2,'audit')",
            rusqlite::params![PROJECT_ID, SNAPSHOT_ID],
        )
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "user_version", LIBRARY_SCHEMA_VERSION)
        .map_err(|error| error.to_string())?;
    let schema_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if schema_version != 10 || LIBRARY_SCHEMA_VERSION != 10 {
        return Err(format!(
            "AGENT_EXECUTOR_AUDIT_SCHEMA_MISMATCH:{schema_version}:{}",
            LIBRARY_SCHEMA_VERSION
        ));
    }

    let registry = AgentToolRegistry::standard()?;
    let repository = AgentRepository::new(&connection)?;
    let completion = audit_supervised_write_and_completion(&repository, &registry)?;
    let recovery = audit_stale_lease_receipt_and_recovery(&repository, &registry)?;

    drop(repository);
    drop(connection);
    let reopened = Connection::open(&database).map_err(|error| error.to_string())?;
    let reopened_repository = AgentRepository::new(&reopened)?;
    let completed_run = reopened_repository.snapshot("completion-run")?;
    let recovered_run = reopened_repository.snapshot("recovery-run")?;
    if completed_run.run.status != AgentRunStatus::Completed
        || recovered_run.run.status != AgentRunStatus::Paused
    {
        return Err("AGENT_EXECUTOR_AUDIT_REOPEN_STATE_MISMATCH".into());
    }
    assert_event_sequence(&completed_run.events)?;
    assert_event_sequence(&recovered_run.events)?;

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "ok": true,
            "schemaVersion": schema_version,
            "registryHash": registry.hash(),
            "supervisedPlanApproved": completion.plan_approved,
            "writeActionApproved": completion.action_approved,
            "completionDisposition": completion.disposition,
            "receiptIdempotent": completion.receipt_idempotent && recovery.receipt_idempotent,
            "staleLeaseRejected": recovery.stale_lease_rejected,
            "recoveredFromReceipt": recovery.completed_step_count,
            "requeuedWithoutReceipt": recovery.requeued_step_count,
            "reopenRestored": true,
            "database": database,
        }))
        .map_err(|error| error.to_string())?
    );
    Ok(())
}

#[derive(Debug)]
struct CompletionAudit {
    plan_approved: bool,
    action_approved: bool,
    disposition: CompletionDisposition,
    receipt_idempotent: bool,
}

fn audit_supervised_write_and_completion(
    repository: &AgentRepository<'_>,
    registry: &AgentToolRegistry,
) -> Result<CompletionAudit, String> {
    let run_id = "completion-run";
    repository.create_run(NewAgentRun {
        id: run_id.into(),
        project_id: PROJECT_ID.into(),
        snapshot_id: Some(SNAPSHOT_ID.into()),
        automation_mode: AgentAutomationMode::Supervised,
        objective: "Produce a governed local evidence report".into(),
        budget: AgentBudget::default(),
        now_ms: 1,
    })?;
    repository.transition_run(run_id, AgentRunStatus::Planning, None, 2)?;

    let input = json!({
        "topic": "quantum error correction",
        "paperIds": ["p1", "p2", "p3"],
        "hotspotIds": ["h1"],
        "mode": "simple"
    });
    registry.validate_resolved_input("save_research_evidence", &input)?;
    let (plan, bindings) = canonical_flagship_plan(registry, &input)?;
    repository.save_generated_plan_and_transition(
        run_id,
        &plan,
        &bindings,
        registry.hash(),
        PLANNER_PROFILE,
        WRITER_PROFILE,
        AgentRunStatus::AwaitingPlanApproval,
        3,
    )?;
    let plan_approval = repository.decide_current_plan(
        run_id,
        "approved",
        "audit-user",
        Some("executor audit plan approval"),
        4,
    )?;
    if plan_approval.decision != "approved" {
        return Err("AGENT_EXECUTOR_AUDIT_PLAN_APPROVAL_FAILED".into());
    }

    let first_lease = repository.acquire_lease(run_id, "audit-executor", "lease-1", 5)?;
    let first_fence = lease_fence(&first_lease);
    repository.transition_run_fenced(
        &first_fence,
        AgentRunStatus::Ready,
        AgentRunStatus::Running,
        None,
        6,
    )?;
    for (offset, step_id) in [
        "inspect-library",
        "inspect-snapshot",
        "search-papers",
        "search-hotspots",
        "load-evidence",
    ]
    .iter()
    .enumerate()
    {
        succeed_step(
            repository,
            run_id,
            step_id,
            &json!({"ok": true}),
            7 + (offset as i64 * 2),
        )?;
    }
    let definition = registry.get("save_research_evidence")?;
    let action_hash = governed_action_hash(
        &definition.name,
        &definition.version,
        registry.hash(),
        definition.risk,
        &input,
        Some(WRITER_PROFILE),
    )?;
    repository.request_action_approval(
        &first_fence,
        1,
        "save-evidence",
        &input,
        &action_hash,
        17,
    )?;
    let action_approval = repository.decide_current_action(
        run_id,
        "save-evidence",
        "approved",
        "audit-user",
        Some("executor audit write approval"),
        18,
    )?;
    if action_approval.decision != "approved" || action_approval.risk != Some(AgentRiskLevel::Write)
    {
        return Err("AGENT_EXECUTOR_AUDIT_ACTION_APPROVAL_FAILED".into());
    }

    let second_lease = repository.acquire_lease(run_id, "audit-executor", "lease-2", 19)?;
    let second_fence = lease_fence(&second_lease);
    repository.transition_run_fenced(
        &second_fence,
        AgentRunStatus::AwaitingActionApproval,
        AgentRunStatus::Running,
        None,
        20,
    )?;
    repository.claim_step(&second_fence, 1, "save-evidence", &input, &action_hash, 21)?;

    let evidence_content = json!({
        "topic": "quantum error correction",
        "snapshotId": SNAPSHOT_ID,
        "papers": [
            {"id":"p1","title":"Paper 1"},
            {"id":"p2","title":"Paper 2"},
            {"id":"p3","title":"Paper 3"}
        ]
    });
    let evidence = artifact(
        "evidence-artifact",
        run_id,
        Some("save-evidence"),
        "evidence",
        evidence_content,
        22,
    )?;
    let result = json!({
        "artifacts": [{
            "id": evidence.id,
            "kind": "evidence",
            "contentHash": evidence.content_sha256
        }]
    });
    registry.validate_output("save_research_evidence", &result)?;
    let operation_key = repository.operation_key(
        run_id,
        1,
        "save-evidence",
        "save_research_evidence",
        &action_hash,
    )?;
    let committed = repository.commit_tool_success(
        &second_fence,
        1,
        "save-evidence",
        &operation_key,
        "save_research_evidence",
        &action_hash,
        &result,
        Some(&evidence),
        22,
        |_| Ok(()),
    )?;
    let replayed = repository.execute_idempotent_sqlite_mutation(
        &operation_key,
        run_id,
        1,
        "save-evidence",
        "save_research_evidence",
        &action_hash,
        23,
        |_| Err("AGENT_EXECUTOR_AUDIT_DUPLICATE_MUTATION_RAN".into()),
    )?;
    if committed != replayed {
        return Err("AGENT_EXECUTOR_AUDIT_RECEIPT_REPLAY_MISMATCH".into());
    }

    let report = artifact(
        "report-artifact",
        run_id,
        Some("create-report"),
        "report_draft",
        json!({
            "title":"Audit report",
            "content":"Evidence [1] [2] [3]",
            "evidenceArtifactId": evidence.id,
            "paperIds": ["p1", "p2", "p3"]
        }),
        24,
    )?;
    repository.put_artifact(&report)?;
    let report_observation = artifact_observation(&report);
    succeed_step(repository, run_id, "create-report", &report_observation, 25)?;
    let report_content_hash =
        canonical_value_sha256(&Value::String("Evidence [1] [2] [3]".into()))?;
    let audit = artifact(
        "audit-artifact",
        run_id,
        Some("audit-report"),
        "report_audit",
        json!({
            "invalidCitationCount": 0,
            "evidenceProfilePresent": true,
            "missingRequiredSections": [],
            "riskLevel": "low",
            "reportContentHash": report_content_hash,
            "evidenceContentHash": evidence.content_sha256
        }),
        27,
    )?;
    repository.put_artifact(&audit)?;
    let audit_observation = artifact_observation(&audit);
    succeed_step(repository, run_id, "audit-report", &audit_observation, 28)?;
    repository.skip_step_fenced(
        &second_fence,
        1,
        "revise-high-risk",
        "AGENT_REPORT_REVISION_NOT_REQUIRED",
        30,
    )?;
    repository.skip_step_fenced(
        &second_fence,
        1,
        "audit-revised",
        "AGENT_REPORT_REVISION_NOT_REQUIRED",
        31,
    )?;
    repository.transition_run_fenced(
        &second_fence,
        AgentRunStatus::Running,
        AgentRunStatus::Evaluating,
        None,
        32,
    )?;

    let snapshot = repository.snapshot(run_id)?;
    let context = repository
        .current_plan_context(run_id)?
        .ok_or("AGENT_EXECUTOR_AUDIT_PLAN_CONTEXT_MISSING")?;
    let plan_approved = repository
        .resolve_effective_approval(
            run_id,
            1,
            None,
            "plan",
            &context.plan_hash,
            &context.registry_hash,
            None,
            Some(&context.planner_profile_hash),
        )?
        .is_some_and(|approval| approval.is_approved);
    let active = AnalysisState {
        project_id: PROJECT_ID.into(),
        active_snapshot_id: SNAPSHOT_ID.into(),
        algorithm_version: "v20".into(),
        paper_count: 3,
        hotspot_count: 1,
        membership_count: 3,
        generated_at: "audit".into(),
    };
    let gate = evaluate_completion_gate(CompletionGateInput {
        run: &snapshot.run,
        active_snapshot: Some(&active),
        plan_approved,
        pending_action_approval: false,
        steps: &snapshot.steps,
        artifacts: &snapshot.artifacts,
        evidence_papers_exist: true,
        latest_report_review_approved: false,
    });
    if gate.disposition != CompletionDisposition::Completed {
        return Err(format!(
            "AGENT_EXECUTOR_AUDIT_COMPLETION_REJECTED:{:?}",
            gate.reasons
        ));
    }
    repository.transition_run_fenced(
        &second_fence,
        AgentRunStatus::Evaluating,
        AgentRunStatus::Completed,
        None,
        33,
    )?;
    Ok(CompletionAudit {
        plan_approved,
        action_approved: true,
        disposition: gate.disposition,
        receipt_idempotent: committed == replayed,
    })
}

#[derive(Debug)]
struct RecoveryAudit {
    stale_lease_rejected: bool,
    receipt_idempotent: bool,
    completed_step_count: u32,
    requeued_step_count: u32,
}

fn audit_stale_lease_receipt_and_recovery(
    repository: &AgentRepository<'_>,
    registry: &AgentToolRegistry,
) -> Result<RecoveryAudit, String> {
    let run_id = "recovery-run";
    repository.create_run(NewAgentRun {
        id: run_id.into(),
        project_id: PROJECT_ID.into(),
        snapshot_id: Some(SNAPSHOT_ID.into()),
        automation_mode: AgentAutomationMode::Supervised,
        objective: "Audit lease recovery".into(),
        budget: AgentBudget::default(),
        now_ms: 100,
    })?;
    repository.transition_run(run_id, AgentRunStatus::Planning, None, 101)?;
    let steps = [
        ("receipt-step", "inspect_library_state"),
        ("requeue-step", "inspect_v20_snapshot"),
    ];
    let mut plan_steps = Vec::new();
    let mut bindings = Vec::new();
    for (step_id, tool_name) in steps {
        let definition = registry.get(tool_name)?;
        plan_steps.push(AgentPlanStep {
            id: step_id.into(),
            title: format!("Audit {tool_name}"),
            tool: tool_name.into(),
            input: json!({}),
            risk: definition.risk,
        });
        bindings.push(AgentStepExecutionBinding {
            step_id: step_id.into(),
            tool_name: tool_name.into(),
            tool_version: definition.version.clone(),
            registry_hash: registry.hash().into(),
            unresolved_input: json!({}),
            authoritative_risk: definition.risk,
        });
    }
    let plan = AgentPlan {
        version: 1,
        objective: "Audit lease recovery".into(),
        assumptions: vec![],
        success_criteria: vec![AgentSuccessCriterion {
            id: "recovered".into(),
            description: "Receipts converge and unfinished work becomes retryable".into(),
        }],
        steps: plan_steps,
    };
    repository.save_generated_plan_and_transition(
        run_id,
        &plan,
        &bindings,
        registry.hash(),
        PLANNER_PROFILE,
        WRITER_PROFILE,
        AgentRunStatus::AwaitingPlanApproval,
        102,
    )?;
    repository.decide_current_plan(run_id, "approved", "audit-user", None, 103)?;

    let old_lease = repository.acquire_lease(run_id, "executor-old", "old-token", 104)?;
    let old_fence = lease_fence(&old_lease);
    repository.transition_run_fenced(
        &old_fence,
        AgentRunStatus::Ready,
        AgentRunStatus::Running,
        None,
        105,
    )?;
    let mut hashes = Vec::new();
    for (index, (step_id, tool_name)) in steps.iter().enumerate() {
        let definition = registry.get(tool_name)?;
        let hash = governed_action_hash(
            tool_name,
            &definition.version,
            registry.hash(),
            definition.risk,
            &json!({}),
            Some(WRITER_PROFILE),
        )?;
        repository.claim_step(
            &old_fence,
            1,
            step_id,
            &json!({}),
            &hash,
            106 + index as i64,
        )?;
        hashes.push(hash);
    }

    let receipt_key = repository.operation_key(
        run_id,
        1,
        "receipt-step",
        "inspect_library_state",
        &hashes[0],
    )?;
    let first = repository.execute_idempotent_sqlite_mutation(
        &receipt_key,
        run_id,
        1,
        "receipt-step",
        "inspect_library_state",
        &hashes[0],
        110,
        |_| Ok(json!({"paperCount": 3})),
    )?;
    let second = repository.execute_idempotent_sqlite_mutation(
        &receipt_key,
        run_id,
        1,
        "receipt-step",
        "inspect_library_state",
        &hashes[0],
        111,
        |_| Err("AGENT_EXECUTOR_AUDIT_RECEIPT_REEXECUTED".into()),
    )?;
    if first != second {
        return Err("AGENT_EXECUTOR_AUDIT_RECEIPT_NOT_IDEMPOTENT".into());
    }

    let replacement = repository.acquire_lease(
        run_id,
        "executor-replacement",
        "replacement-token",
        old_lease.expires_at_ms,
    )?;
    let stale_error = repository
        .renew_lease_fenced(&old_fence, old_lease.expires_at_ms + 1)
        .unwrap_err();
    if stale_error != "AGENT_RUN_LEASE_NOT_OWNED" {
        return Err(format!(
            "AGENT_EXECUTOR_AUDIT_STALE_LEASE_NOT_REJECTED:{stale_error}"
        ));
    }
    let recovered = repository.recover_expired_runs(replacement.expires_at_ms + 1)?;
    if recovered.completed_step_count != 1 || recovered.requeued_step_count != 1 {
        return Err(format!(
            "AGENT_EXECUTOR_AUDIT_RECOVERY_COUNTS_INVALID:{}:{}",
            recovered.completed_step_count, recovered.requeued_step_count
        ));
    }
    let snapshot = repository.snapshot(run_id)?;
    let receipt_step = snapshot
        .steps
        .iter()
        .find(|step| step.step_id == "receipt-step")
        .ok_or("AGENT_EXECUTOR_AUDIT_RECEIPT_STEP_MISSING")?;
    let requeue_step = snapshot
        .steps
        .iter()
        .find(|step| step.step_id == "requeue-step")
        .ok_or("AGENT_EXECUTOR_AUDIT_REQUEUE_STEP_MISSING")?;
    if receipt_step.status != AgentStepStatus::Succeeded
        || requeue_step.status != AgentStepStatus::Ready
        || requeue_step.last_error_code.as_deref() != Some("AGENT_EXECUTOR_LOST")
        || snapshot.run.status != AgentRunStatus::Paused
    {
        return Err("AGENT_EXECUTOR_AUDIT_RECOVERY_STATE_INVALID".into());
    }
    Ok(RecoveryAudit {
        stale_lease_rejected: true,
        receipt_idempotent: first == second,
        completed_step_count: recovered.completed_step_count,
        requeued_step_count: recovered.requeued_step_count,
    })
}

fn canonical_flagship_plan(
    registry: &AgentToolRegistry,
    evidence_input: &Value,
) -> Result<(AgentPlan, Vec<AgentStepExecutionBinding>), String> {
    let definitions = [
        (
            "inspect-library",
            "Inspect library",
            "inspect_library_state",
            json!({}),
        ),
        (
            "inspect-snapshot",
            "Inspect V20 snapshot",
            "inspect_v20_snapshot",
            json!({}),
        ),
        (
            "search-papers",
            "Search local papers",
            "search_local_papers",
            json!({"query":"quantum error correction","limit":20}),
        ),
        (
            "search-hotspots",
            "Search V20 hotspots",
            "search_v20_hotspots",
            json!({"query":"quantum error correction","limit":10}),
        ),
        (
            "load-evidence",
            "Load hotspot evidence",
            "load_hotspot_evidence",
            json!({"hotspotIds":["h1"],"maxPapersPerHotspot":18}),
        ),
        (
            "save-evidence",
            "Save immutable evidence",
            "save_research_evidence",
            evidence_input.clone(),
        ),
        (
            "create-report",
            "Create report draft",
            "create_report_draft",
            json!({
                "topic":"quantum error correction",
                "evidenceArtifactId":"evidence-artifact",
                "mode":"simple"
            }),
        ),
        (
            "audit-report",
            "Audit report draft",
            "inspect_report_audit",
            json!({"reportArtifactId":"report-artifact"}),
        ),
        (
            "revise-high-risk",
            "Revise high-risk report",
            "revise_report_draft",
            json!({
                "reportArtifactId":"report-artifact",
                "auditArtifactId":"audit-artifact",
                "instructions":"Resolve deterministic audit findings"
            }),
        ),
        (
            "audit-revised",
            "Audit revised report",
            "inspect_report_audit",
            json!({"reportArtifactId":"revised-report-artifact"}),
        ),
    ];
    let mut plan_steps = Vec::with_capacity(definitions.len());
    let mut bindings = Vec::with_capacity(definitions.len());
    for (step_id, title, tool_name, input) in definitions {
        let definition = registry.get(tool_name)?;
        registry.validate_resolved_input(tool_name, &input)?;
        plan_steps.push(AgentPlanStep {
            id: step_id.into(),
            title: title.into(),
            tool: tool_name.into(),
            input: input.clone(),
            risk: definition.risk,
        });
        bindings.push(AgentStepExecutionBinding {
            step_id: step_id.into(),
            tool_name: tool_name.into(),
            tool_version: definition.version.clone(),
            registry_hash: registry.hash().into(),
            unresolved_input: input,
            authoritative_risk: definition.risk,
        });
    }
    let plan = AgentPlan {
        version: 1,
        objective: "Produce a governed local evidence report".into(),
        assumptions: vec![],
        success_criteria: vec![AgentSuccessCriterion {
            id: "complete".into(),
            description: "Completion gate accepts immutable evidence and report artifacts".into(),
        }],
        steps: plan_steps,
    };
    Ok((plan, bindings))
}

fn succeed_step(
    repository: &AgentRepository<'_>,
    run_id: &str,
    step_id: &str,
    observation: &Value,
    now: i64,
) -> Result<(), String> {
    repository.transition_step(
        run_id,
        1,
        step_id,
        AgentStepStatus::Running,
        None,
        None,
        now,
    )?;
    repository.transition_step(
        run_id,
        1,
        step_id,
        AgentStepStatus::Succeeded,
        Some(observation),
        None,
        now + 1,
    )
}

fn artifact_observation(artifact: &AgentArtifactRecord) -> Value {
    json!({
        "artifacts": [{
            "id": artifact.id,
            "kind": artifact.artifact_kind,
            "contentHash": artifact.content_sha256
        }]
    })
}

fn artifact(
    id: &str,
    run_id: &str,
    step_id: Option<&str>,
    kind: &str,
    content: Value,
    now: i64,
) -> Result<AgentArtifactRecord, String> {
    Ok(AgentArtifactRecord {
        id: id.into(),
        run_id: run_id.into(),
        step_id: step_id.map(str::to_string),
        artifact_kind: kind.into(),
        content_sha256: canonical_value_sha256(&content)?,
        content,
        snapshot_id: Some(SNAPSHOT_ID.into()),
        audit: None,
        review_status: Some("approved".into()),
        supersedes_artifact_id: None,
        created_at_ms: now,
    })
}

fn lease_fence(lease: &AgentLease) -> AgentLeaseFence {
    AgentLeaseFence {
        run_id: lease.run_id.clone(),
        owner_id: lease.owner_id.clone(),
        lease_token: lease.lease_token.clone(),
        generation: lease.generation,
    }
}

fn assert_event_sequence(
    events: &[research_hotspots_core::agent_store::AgentEventRecord],
) -> Result<(), String> {
    if events
        .windows(2)
        .any(|pair| pair[1].sequence != pair[0].sequence + 1)
    {
        return Err("AGENT_EXECUTOR_AUDIT_EVENT_SEQUENCE_GAP".into());
    }
    Ok(())
}

fn parse_root() -> Result<PathBuf, String> {
    let mut arguments = env::args().skip(1);
    let mut root = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--root" => root = arguments.next().map(PathBuf::from),
            _ => return Err(format!("AGENT_EXECUTOR_AUDIT_UNKNOWN_ARGUMENT:{argument}")),
        }
    }
    root.ok_or_else(|| "AGENT_EXECUTOR_AUDIT_ROOT_REQUIRED".into())
}

fn prepare_owned_root(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let canonical = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let text = canonical.to_string_lossy();
    let drive_path = text.strip_prefix(r"\\?\").unwrap_or(&text);
    if !drive_path.to_ascii_uppercase().starts_with("D:\\") {
        return Err(format!("AGENT_EXECUTOR_AUDIT_REQUIRES_D_DRIVE:{text}"));
    }
    fs::write(
        canonical.join(".agent-executor-audit-owned"),
        "Only files named agent-executor-v10.sqlite* are managed by this audit.\n",
    )
    .map_err(|error| error.to_string())
}

fn remove_owned_database_files(database: &Path) -> Result<(), String> {
    for path in [
        database.to_path_buf(),
        PathBuf::from(format!("{}-wal", database.display())),
        PathBuf::from(format!("{}-shm", database.display())),
    ] {
        if path.exists() {
            fs::remove_file(&path).map_err(|error| format!("{}:{error}", path.display()))?;
        }
    }
    Ok(())
}
