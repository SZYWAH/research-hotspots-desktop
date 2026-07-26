import type { App17GalaxyPayload, HotspotEvidenceBundle, Paper } from "../types";
import type { App17HotspotEvidenceInput } from "./desktop";

function resolveSnapshotBase() {
  if (typeof window === "undefined") return "";
  const variant = new URLSearchParams(window.location.search).get("layout");
  return variant === "v3" || variant === "a" || variant === "b" || variant === "c"
    ? `/variants/${variant}`
    : "";
}

const SNAPSHOT_BASE = resolveSnapshotBase();
const SUPPORTED_SCHEMA_VERSION = 1;

export type GalaxyVisualReviewStage = "overview" | "system" | "paper";

export type GalaxyVisualReviewIntent = {
  field?: string;
  topic?: number;
  paperId?: string;
  stage: GalaxyVisualReviewStage;
};

export type GalaxyVisualReviewTopicEntry = {
  key: string;
  fileId: string;
  field: string;
  topicId: number;
  hotspotId: string;
  title: string;
  paperCount: number;
  evidencePath: string;
  papersPath: string;
};

export type GalaxyVisualReviewManifest = {
  schemaVersion: number;
  generatedAt: string;
  databaseModifiedMs: number;
  databaseSizeBytes: number;
  projectId: string;
  payloadPath: string;
  paperCount: number;
  hotspotCount: number;
  topicCount: number;
  topics: GalaxyVisualReviewTopicEntry[];
};

export type GalaxyVisualReviewSnapshotState = {
  manifest: GalaxyVisualReviewManifest;
  payload: App17GalaxyPayload;
};

let manifestPromise: Promise<GalaxyVisualReviewManifest> | undefined;
let payloadPromise: Promise<App17GalaxyPayload> | undefined;
const evidencePromises = new Map<string, Promise<HotspotEvidenceBundle>>();
const paperPromises = new Map<string, Promise<Paper[]>>();
let paperTopicAliases: Map<string, GalaxyVisualReviewTopicEntry> | undefined;

export function isGalaxyVisualReviewMode() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return new URLSearchParams(window.location.search).get("visual-review") === "galaxy";
}

export function getGalaxyVisualReviewIntent(): GalaxyVisualReviewIntent | undefined {
  if (!isGalaxyVisualReviewMode()) return undefined;
  const params = new URLSearchParams(window.location.search);
  const topicValue = params.get("topic");
  const parsedTopic = topicValue === null ? undefined : Number(topicValue);
  const requestedStage = params.get("stage");
  const stage: GalaxyVisualReviewStage = requestedStage === "system" || requestedStage === "paper" ? requestedStage : "overview";
  return {
    field: params.get("field")?.trim() || undefined,
    topic: Number.isFinite(parsedTopic) ? parsedTopic : undefined,
    paperId: params.get("paperId")?.trim() || undefined,
    stage,
  };
}

export function clearGalaxyVisualReviewCache() {
  manifestPromise = undefined;
  payloadPromise = undefined;
  evidencePromises.clear();
  paperPromises.clear();
  paperTopicAliases = undefined;
}

async function fetchSnapshotJson<T>(relativePath: string): Promise<T> {
  const cleanPath = relativePath.replace(/^\/+/, "");
  const response = await fetch(`${SNAPSHOT_BASE}/${cleanPath}?review=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`浏览器视觉快照读取失败（${response.status}）：${cleanPath}。请重新运行 pnpm visual:galaxy:snapshot。`);
  }
  return response.json() as Promise<T>;
}

async function loadManifest() {
  manifestPromise ??= fetchSnapshotJson<GalaxyVisualReviewManifest>("manifest.json").then((manifest) => {
    if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(`视觉快照 schemaVersion=${manifest.schemaVersion}，当前仅支持 ${SUPPORTED_SCHEMA_VERSION}。请重新生成快照。`);
    }
    return manifest;
  });
  return manifestPromise;
}

async function loadPayload() {
  payloadPromise ??= loadManifest().then(async (manifest) => {
    const payload = await fetchSnapshotJson<App17GalaxyPayload>(manifest.payloadPath);
    return {
      ...payload,
      source: "visual-review-snapshot",
      message: `浏览器视觉快照：${payload.paperCount.toLocaleString()} 篇论文 / ${payload.hotspotCount.toLocaleString()} 个热点`,
    };
  });
  return payloadPromise;
}

export async function getGalaxyVisualReviewSnapshot(force = false): Promise<GalaxyVisualReviewSnapshotState> {
  if (force) clearGalaxyVisualReviewCache();
  const [manifest, payload] = await Promise.all([loadManifest(), loadPayload()]);
  return { manifest, payload };
}

function topicKey(field: string, topicId: number) {
  return `${field}::${topicId}`;
}

async function findTopic(field: string, topicId: number) {
  const manifest = await loadManifest();
  const topic = manifest.topics.find((entry) => entry.key === topicKey(field, topicId))
    ?? manifest.topics.find((entry) => entry.field === field && entry.topicId === topicId);
  if (!topic) throw new Error(`视觉快照中没有热点：${field} / topic ${topicId}。`);
  return topic;
}

export async function getGalaxyVisualReviewEvidence(input: App17HotspotEvidenceInput) {
  const topic = await findTopic(input.field, input.topicId);
  let promise = evidencePromises.get(topic.key);
  if (!promise) {
    promise = fetchSnapshotJson<HotspotEvidenceBundle>(topic.evidencePath);
    evidencePromises.set(topic.key, promise);
  }
  return promise;
}

async function buildPaperTopicAliases() {
  if (paperTopicAliases) return paperTopicAliases;
  const [manifest, payload] = await Promise.all([loadManifest(), loadPayload()]);
  const topics = new Map(manifest.topics.map((entry) => [topicKey(entry.field, entry.topicId), entry]));
  const aliases = new Map<string, GalaxyVisualReviewTopicEntry>();
  for (const paper of payload.papers) {
    const topic = topics.get(topicKey(paper.field, paper.topicId));
    if (!topic) continue;
    aliases.set(paper.scopedPaperId, topic);
    aliases.set(paper.rawPaperId, topic);
  }
  paperTopicAliases = aliases;
  return aliases;
}

async function loadTopicPapers(topic: GalaxyVisualReviewTopicEntry) {
  let promise = paperPromises.get(topic.key);
  if (!promise) {
    promise = fetchSnapshotJson<Paper[]>(topic.papersPath);
    paperPromises.set(topic.key, promise);
  }
  return promise;
}

export async function getGalaxyVisualReviewPapersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const [aliases, payload] = await Promise.all([buildPaperTopicAliases(), loadPayload()]);
  const payloadAliases = new Map<string, string>();
  for (const point of payload.papers) {
    payloadAliases.set(point.rawPaperId, point.scopedPaperId);
    payloadAliases.set(point.scopedPaperId, point.scopedPaperId);
  }
  const topics = new Map<string, GalaxyVisualReviewTopicEntry>();
  for (const id of ids) {
    const topic = aliases.get(id);
    if (topic) topics.set(topic.key, topic);
  }
  const topicRows = await Promise.all(Array.from(topics.values()).map(loadTopicPapers));
  const papersById = new Map<string, Paper>();
  for (const paper of topicRows.flat()) papersById.set(paper.id, paper);
  return ids
    .map((id) => papersById.get(id) ?? papersById.get(payloadAliases.get(id) ?? ""))
    .filter((paper): paper is Paper => Boolean(paper));
}

export function formatGalaxyVisualReviewGeneratedAt(value?: string) {
  if (!value) return "未知时间";
  const unixMatch = /^unix-ms:(\d+)$/.exec(value);
  const date = unixMatch ? new Date(Number(unixMatch[1])) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
