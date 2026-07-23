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
assert.equal(derive({ jobs: [job("clean", "done", "2026-07-20T09:00:00.000Z")] }).clusterState, "done", "cross-database job timestamps must not stale a revision-matched snapshot");
assert.equal(derive({ snapshot: { ...snapshot, currentLibraryRevision: 8 } }).clusterState, "pending", "library revision drift must stale clustering");
assert.equal(derive({ paperCount: 25_464 }).snapshotStale, true, "paper count mismatch must stale snapshot");
assert.equal(derive({ hotspotCount: 159 }).clusterState, "pending", "hotspot count mismatch must require modeling");
assert.equal(derive({ snapshot: null }).requiresModeling, true, "missing snapshot must show explicit modeling guidance");
assert.deepEqual(
  { clean: derive({ paperCount: 0, hotspotCount: 0, snapshot: null }).cleanState, cluster: derive({ paperCount: 0, hotspotCount: 0, snapshot: null }).clusterState },
  { clean: "pending", cluster: "pending" },
  "empty library must remain pending without sample data",
);

console.log(JSON.stringify({ ok: true, cases: 9, snapshotId: snapshot.snapshotId }));
