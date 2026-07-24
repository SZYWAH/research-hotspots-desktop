import assert from "node:assert/strict";

import { deriveAnalysisProgress } from "../src/lib/analysisProgress.ts";

const snapshot = {
  projectId: "project-default",
  activeSnapshotId: "snapshot-1",
  snapshotId: "snapshot-1",
  databaseKey: "D:/library",
  algorithmVersion: "v20-unified-1",
  paperCount: 25_463,
  hotspotCount: 160,
  membershipCount: 25_463,
  generatedAt: "2026-07-20T08:00:00.000Z",
  libraryRevision: 7,
  currentLibraryRevision: 7,
  hotspots: Array.from({ length: 160 }, (_, index) => ({ id: `hotspot-${index}` })),
};

const job = (stage, status, updatedAt) => ({
  id: `${stage}-${status}-${updatedAt}`,
  databaseKey: "D:/library",
  executionSessionId: "session-current",
  stage,
  status,
  title: stage,
  detail: "",
  progress: status === "done" ? 100 : 20,
  createdAt: updatedAt,
  updatedAt,
});

const derive = (overrides = {}) => deriveAnalysisProgress({
  paperCount: 25_463,
  hotspotCount: 160,
  snapshot,
  jobs: [],
  databaseKey: "D:/library",
  executionSessionId: "session-current",
  ...overrides,
});

assert.deepEqual(
  { clean: derive().cleanState, cluster: derive().clusterState },
  { clean: "done", cluster: "done" },
  "matching activity snapshot must override seeded waiting jobs",
);
assert.equal(derive({ jobs: [job("clean", "queued", "2026-07-20T09:00:00.000Z")] }).cleanState, "done", "queued must not mean running");
assert.equal(derive({ jobs: [job("clean", "running", "2026-07-20T09:00:00.000Z")] }).cleanState, "running", "real running job must override snapshot");
assert.equal(derive({ jobs: [job("cluster", "running", "2026-07-20T09:00:00.000Z")] }).clusterState, "running", "real cluster task must override snapshot");
assert.equal(
  derive({ jobs: [{ ...job("clean", "running", "2026-07-20T09:00:00.000Z"), executionSessionId: "session-old" }] }).cleanState,
  "done",
  "a running row from a crashed WebView session must not override SQLite revision truth",
);
assert.equal(
  derive({ jobs: [{ ...job("cluster", "running", "2026-07-20T09:00:00.000Z"), databaseKey: "D:/other-library" }] }).clusterState,
  "done",
  "a running row from another database must not override the current snapshot",
);
assert.equal(
  derive({
    activeMutationKind: "cluster",
    jobs: [{ ...job("cluster", "running", "2026-07-20T09:00:00.000Z"), executionSessionId: "session-before-refresh" }],
  }).clusterState,
  "running",
  "the Rust mutation registry must keep a real background cluster visible after WebView refresh",
);
assert.equal(
  derive({
    jobs: [{ ...job("clean", "failed", "2026-07-20T10:00:00.000Z"), databaseKey: "D:/other-library" }],
  }).cleanState,
  "done",
  "a failed job from another database must not override current SQLite revision truth",
);
assert.equal(derive({ jobs: [job("clean", "done", "2026-07-20T09:00:00.000Z")] }).clusterState, "done", "cross-database job timestamps must not stale a revision-matched snapshot");
assert.equal(derive({ snapshot: { ...snapshot, currentLibraryRevision: 8 } }).clusterState, "pending", "library revision drift must stale clustering");
assert.equal(derive({ snapshot: { ...snapshot, snapshotId: "snapshot-cache-old" } }).snapshotCurrent, false, "cache snapshot id must match SQLite active snapshot id");
assert.equal(derive({ paperCount: 25_464 }).snapshotStale, true, "paper count mismatch must stale snapshot");
assert.equal(derive({ hotspotCount: 159 }).clusterState, "pending", "hotspot count mismatch must require modeling");
assert.equal(derive({ snapshot: null }).requiresModeling, true, "missing snapshot must show explicit modeling guidance");
assert.deepEqual(
  { clean: derive({ paperCount: 0, hotspotCount: 0, snapshot: null }).cleanState, cluster: derive({ paperCount: 0, hotspotCount: 0, snapshot: null }).clusterState },
  { clean: "pending", cluster: "pending" },
  "empty library must remain pending without sample data",
);

console.log(JSON.stringify({ ok: true, cases: 14, snapshotId: snapshot.snapshotId }));
