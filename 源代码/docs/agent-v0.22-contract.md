# Research Agent v0.22 Contract

## Purpose

Version `0.22.0-beta.1` introduces a supervised research Agent above the existing local paper library, V20 hotspot snapshot, evidence loading, AI report generation, and report audit capabilities. The first flagship workflow is:

> Analyse a user-specified research topic from the active local paper library and V20 snapshot, then produce an audited report whose claims can be traced to the exact snapshot, hotspots, and papers used.

The Agent is an orchestrator, not an unrestricted automation surface. Existing deterministic library, V20, report, credential, recovery, and paper-camera behaviour remains authoritative.

## Automation modes

The first Agent beta supports exactly two modes:

- `advisor`: creates and explains a plan but cannot execute tools.
- `supervised`: requires approval for the plan, then may execute approved low-risk read tools. Write and high-risk tools require separate action approval.

There is no fully autonomous mode in v0.22. Navigation never starts cleaning, clustering, importing, or exporting.

## Planner protocol

Every planner turn returns one strict, schema-validated action:

- `call_tool`: request one registered tool with structured JSON input and a declared risk level.
- `ask_user`: stop and request information or a decision that cannot be derived safely.
- `complete`: request completion after deterministic success gates have passed.

Only one action is processed per turn. Unknown action variants, unknown tools, unknown execution fields, malformed input, or sensitive credential fields are rejected before execution. The model cannot execute arbitrary SQL, shell commands, filesystem writes, or unregistered URLs.

Plans contain a non-empty objective, explicit success criteria, assumptions, and an ordered list of at most 20 typed tool steps. The executor accepts only tool names and JSON object inputs that pass the registered tool schema.

## Approval binding

Plan approval is bound to a monotonically increasing plan version and a SHA-256 hash of canonical JSON containing the objective, assumptions, success criteria, and executable step fields. Display-only step titles, timestamps, progress, observations, and runtime state do not participate in the hash. Editing any approved executable content invalidates the approval.

Action approval is bound to the tool name, canonical tool input, and declared risk level. Changing any of those fields invalidates the approval. Approval records must identify the actor and approved hash; they never contain credentials.

In supervised mode:

- read actions may run after the plan is approved;
- write and high-risk actions require action approval;
- cleaning, V20 clustering, paper import, and formal report export are always high-risk approval boundaries;
- report generation and revision may write Agent artifacts but cannot bypass the existing report review and formal-export gate.

Advisor mode forbids all tool execution, including read tools.

## Budgets and termination

Default limits are:

- at most 20 executed steps;
- at most one retry after a tool failure;
- at most one automatic rewrite of a high-risk report.

When any applicable budget is exhausted, the Agent enters a user-waiting state. It must not silently expand the budget or continue invoking AI. Repeated identical tool calls with identical input are rejected unless they are the one permitted retry.

A model response alone cannot complete a run. Completion requires deterministic checks for the active database and V20 snapshot, evidence coverage, report audit status, unresolved approvals, and remaining running steps. A high-risk report remains `needs-review` and cannot be formally exported until the existing human review gate approves it.

## State model

Run states are:

`draft`, `planning`, `awaiting_plan_approval`, `ready`, `running`, `awaiting_action_approval`, `evaluating`, `paused`, `cancelling`, `cancelled`, `failed`, and `completed`.

Step states are:

`planned`, `ready`, `running`, `waiting_user`, `succeeded`, `failed`, and `skipped`.

All state changes are validated by the Core state machine. `running` cannot transition directly to `completed`; completion is only reachable through `evaluating`. Terminal run and step states cannot be reopened silently.

## Persistence and recovery boundary

The schema v9 implementation in the next development step will make SQLite the sole authority for Agent runs, steps, append-only events, approvals, execution receipts, and canonical artifacts. IndexedDB may cache Agent views but cannot decide whether a run or step succeeded.

Each state transition will update state and append its event in one SQLite transaction. The UI is notified only after commit and reconstructs itself from SQLite after a refresh or WebView restart.

Each mutating tool will use an `operationKey`. Its business mutation and `agent_tool_receipts` record must commit in the same SQLite transaction. Recovery checks the receipt before retrying, preventing a crash between business commit and step completion from duplicating clustering, imports, reports, or exports. Per-run leases prevent concurrent executors; expired leases may be recovered after application restart.

Canonical Agent-generated report content and audit metadata will be stored as SQLite artifacts. The existing IndexedDB report library remains a compatibility mirror that can be rebuilt if mirroring fails.

## Data, provenance, and confidentiality

Every run and artifact is bound to a database identity, project ID, and V20 snapshot ID when a snapshot is required. Hotspot and paper evidence must belong to that same snapshot. A missing or stale snapshot causes the Agent to propose modelling and wait for approval; it never clusters automatically.

The Agent stores concise decision summaries and policy reasons only. It does not persist chain-of-thought. API keys, passwords, Authorization headers, credential objects, access tokens, and refresh tokens are forbidden in plans, tool inputs, observations, events, artifacts, logs, and backups. Backend credential handling remains isolated from the WebView and model-visible observations.

## Compatibility boundaries

This contract does not change Tauri commands, frontend routes, SQLite schema v8, `PipelineJob`, `TaskLog`, `ResearchReport`, V20 data structures, report review rules, installation behaviour, or the paper journey. The application version remains `0.21.0-beta.2` until the final v0.22 release step.

The first Agent beta deliberately excludes multi-Agent coordination, arbitrary web browsing, arbitrary plugins, arbitrary SQL or shell access, autonomous deletion, vector long-term memory, and unsupervised external paper import.
