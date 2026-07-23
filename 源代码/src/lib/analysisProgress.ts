import type { PipelineJob, V20HotspotSnapshot } from "../types";

export type AnalysisStageState = "pending" | "running" | "done" | "failed";

export type AnalysisProgress = {
  cleanState: AnalysisStageState;
  clusterState: AnalysisStageState;
  snapshotCurrent: boolean;
  snapshotStale: boolean;
  requiresModeling: boolean;
  cleanJob?: PipelineJob;
  clusterJob?: PipelineJob;
};

function timestamp(value?: string) {
  if (!value) return 0;
  const unixMatch = /^unix-ms:(\d+)$/.exec(value);
  if (unixMatch) return Number(unixMatch[1]);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestStageJob(jobs: PipelineJob[], stage: PipelineJob["stage"]) {
  return jobs
    .filter((job) => job.stage === stage)
    .slice()
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0];
}

function jobIsNewerThanSnapshot(job: PipelineJob | undefined, snapshot: V20HotspotSnapshot | null) {
  return Boolean(job && snapshot && timestamp(job.updatedAt) > timestamp(snapshot.generatedAt));
}

export function deriveAnalysisProgress({
  paperCount,
  hotspotCount,
  jobs,
  snapshot,
}: {
  paperCount: number;
  hotspotCount: number;
  jobs: PipelineJob[];
  snapshot: V20HotspotSnapshot | null;
}): AnalysisProgress {
  const cleanJob = latestStageJob(jobs, "clean");
  const clusterJob = latestStageJob(jobs, "cluster");
  const cleanRunning = cleanJob?.status === "running";
  const clusterRunning = clusterJob?.status === "running";
  const hasSnapshot = Boolean(snapshot?.activeSnapshotId && (snapshot.snapshotId ?? snapshot.activeSnapshotId));
  const snapshotCountsMatch = Boolean(
    snapshot
      && snapshot.paperCount === paperCount
      && snapshot.membershipCount === paperCount
      && snapshot.hotspotCount === hotspotCount
      && snapshot.hotspots.length === hotspotCount,
  );
  const hasRevisionTruth = Number.isInteger(snapshot?.libraryRevision)
    && Number.isInteger(snapshot?.currentLibraryRevision);
  const snapshotRevisionMatches = !hasRevisionTruth
    || snapshot?.libraryRevision === snapshot?.currentLibraryRevision;
  // v11+ SQLite revision state is authoritative. IndexedDB jobs are retained
  // for history and can belong to a previously selected database, so their
  // timestamps must not invalidate a revision-matched snapshot.
  const cleanCompletedAfterSnapshot = !hasRevisionTruth
    && cleanJob?.status === "done"
    && jobIsNewerThanSnapshot(cleanJob, snapshot);
  const snapshotCurrent = hasSnapshot
    && snapshotCountsMatch
    && snapshotRevisionMatches
    && !cleanCompletedAfterSnapshot;
  const snapshotStale = hasSnapshot && !snapshotCurrent;

  let cleanState: AnalysisStageState = "pending";
  if (paperCount > 0) {
    if (cleanRunning) cleanState = "running";
    else if (cleanJob?.status === "failed" && (!snapshotCurrent || jobIsNewerThanSnapshot(cleanJob, snapshot))) cleanState = "failed";
    else if (snapshotCurrent || cleanJob?.status === "done") cleanState = "done";
  }

  let clusterState: AnalysisStageState = "pending";
  if (paperCount > 0) {
    if (clusterRunning) clusterState = "running";
    else if (cleanRunning || cleanState !== "done") clusterState = "pending";
    else if (snapshotCurrent) clusterState = "done";
    else if (clusterJob?.status === "failed" && (!snapshot || jobIsNewerThanSnapshot(clusterJob, snapshot))) clusterState = "failed";
  }

  return {
    cleanState,
    clusterState,
    snapshotCurrent,
    snapshotStale,
    requiresModeling: paperCount > 0 && clusterState !== "done" && clusterState !== "running",
    cleanJob,
    clusterJob,
  };
}
