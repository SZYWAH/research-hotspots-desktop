import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import type {
  AgentGalaxyBackgroundPayloadV1,
  App17GalaxyPayload,
} from "../types";
import type {
  AgentGalaxyFocusIntent,
  ResolvedAgentGalaxyEntity,
} from "../lib/agentGalaxyFlowContract";
import {
  findAgentGalaxyReviewEntityIds,
  normalizeAgentGalaxyResolvedEntity,
  resolveAgentGalaxyReviewEntities,
} from "../lib/agentGalaxyEntityResolver";
import {
  nextAgentGalaxyImmersivePaperId,
  resolveAgentGalaxyImmersiveContextFromEntity,
  resolveAgentGalaxyImmersivePaperId,
} from "../lib/agentGalaxyImmersiveContext";
import type {
  AgentGalaxyImmersiveEntityKind,
  AgentGalaxyImmersiveQuality,
  AgentGalaxyImmersiveState,
  AgentGalaxyImmersiveView,
} from "../lib/agentGalaxyImmersiveReview";
import type { AgentGalaxyFocusRuntimeSnapshot } from "../lib/agentGalaxyResidentFocus";
import AgentGalaxyImmersiveCanvas from "./AgentGalaxyImmersiveCanvas";
import AgentGalaxyTheoryBridgeCanvas from "./AgentGalaxyTheoryBridgeCanvas";
import type { AgentGalaxyFlowMetrics } from "./AgentGalaxyFlowCanvas";
import "./AgentGalaxyImmersiveWorkspace.css";

type Props = {
  payload: AgentGalaxyBackgroundPayloadV1;
  fullPayload: App17GalaxyPayload;
  initialState: AgentGalaxyImmersiveState;
  initialEntityId?: string;
  initialEntityKind: AgentGalaxyImmersiveEntityKind;
  initialView: AgentGalaxyImmersiveView;
  quality: AgentGalaxyImmersiveQuality;
  reducedMotion?: boolean;
  showHud?: boolean;
};

const STATE_COPY: Record<AgentGalaxyImmersiveState, string> = {
  idle: "知识空间正在低频流动。提出问题后，Agent 会从论文库中组织可追溯的证据。",
  input: "输入区域进入缓流状态，星体身份和锐利度保持不变。",
  thinking: "真实候选证据区域正在产生低频相位响应，不生成虚构热点或论文。",
  answer: "回答引用的论文按证据顺序显现，脉冲仅表达检索过程，不代表新论文。",
  reading: "当前论文上下文保持可见，背景与相机运动已降低。",
  focus: "目标与最多 24 篇真实上下文正在从同一流场中显现，没有复制或空间重排。",
};

const STATE_LABEL: Record<AgentGalaxyImmersiveState, string> = {
  idle: "静置",
  input: "输入",
  thinking: "思考",
  answer: "回答",
  reading: "阅读",
  focus: "聚焦",
};

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function compactEntityId(value: string) {
  const suffix = value.split(":").at(-1) ?? value;
  return suffix.length > 24 ? `${suffix.slice(0, 21)}...` : suffix;
}

function activeOnlyReviewFixture(
  payload: AgentGalaxyBackgroundPayloadV1,
): ResolvedAgentGalaxyEntity {
  return normalizeAgentGalaxyResolvedEntity(payload, {
    kind: "paper",
    entityId: "fixture:active-only:unclassified-paper",
    membership: "active-only",
    sourceSnapshotId: payload.sourceSnapshotId,
    title: "评审夹具：活动库新增、尚未聚类",
    field: "Unclassified",
    year: 2026,
    color: "#aeb8bf",
  });
}

export default function AgentGalaxyImmersiveWorkspace({
  payload,
  fullPayload,
  initialState,
  initialEntityId,
  initialEntityKind,
  initialView,
  quality,
  reducedMotion: forcedReducedMotion,
  showHud = false,
}: Props) {
  const preferredReducedMotion = useReducedMotionPreference();
  const reducedMotion = forcedReducedMotion ?? preferredReducedMotion;
  const fixtures = useMemo(
    () => findAgentGalaxyReviewEntityIds(payload, fullPayload),
    [fullPayload, payload],
  );
  const fallbackPaperId = resolveAgentGalaxyImmersivePaperId(
    payload,
    initialEntityKind === "paper" ? initialEntityId : undefined,
  ) ?? "";
  const [state, setState] = useState<AgentGalaxyImmersiveState>(initialState);
  const [view, setView] = useState<AgentGalaxyImmersiveView>(initialView);
  const [entityId, setEntityId] = useState(
    initialEntityId || fallbackPaperId,
  );
  const [entityKind, setEntityKind] =
    useState<AgentGalaxyImmersiveEntityKind>(initialEntityKind);
  const [activeOnlyFixtureSelected, setActiveOnlyFixtureSelected] =
    useState(false);
  const [metrics, setMetrics] = useState<AgentGalaxyFlowMetrics>();
  const [focusSnapshot, setFocusSnapshot] =
    useState<AgentGalaxyFocusRuntimeSnapshot>();

  const resolvedTarget = useMemo(() => {
    if (activeOnlyFixtureSelected) return activeOnlyReviewFixture(payload);
    return resolveAgentGalaxyReviewEntities(
      payload,
      fullPayload,
      [{ kind: entityKind, entityId }],
    )[0];
  }, [
    activeOnlyFixtureSelected,
    entityId,
    entityKind,
    fullPayload,
    payload,
  ]);
  const contextSet = useMemo(
    () => resolvedTarget
      ? resolveAgentGalaxyImmersiveContextFromEntity(
          payload,
          resolvedTarget,
          {
            // In product integration these arrays come from actual answer
            // citations. The review route uses stable neighbours only.
            maximumContextPapers: 24,
          },
        )
      : undefined,
    [payload, resolvedTarget],
  );
  const focusIntent = useMemo<AgentGalaxyFocusIntent | undefined>(() => (
    state === "focus"
    && resolvedTarget?.kind === "paper"
    && resolvedTarget.membership !== "missing"
      ? {
          kind: "paper",
          entityId: resolvedTarget.entityId,
          mode: "full-focus",
          reason: "citation-click",
        }
      : undefined
  ), [resolvedTarget, state]);
  const targetSide = focusSnapshot?.anchorNdc
    ? focusSnapshot.anchorNdc[0] >= 0
      ? "right"
      : "left"
    : contextSet?.extractionSide ?? "right";
  const panelSide = targetSide === "right" ? "left" : "right";
  const panelVisible = view === "immersive"
    && (
      state === "answer"
      || state === "reading"
      || state === "focus"
    )
    && Boolean(contextSet);
  const focusColor = focusSnapshot?.semanticPaperColor
    ?? resolvedTarget?.color
    ?? "#b8c2c8";
  const workspaceStyle = {
    "--agent-immersive-focus": focusColor,
  } as CSSProperties;

  const selectEntity = useCallback((
    kind: AgentGalaxyImmersiveEntityKind,
    id: string,
    isActiveOnlyFixture = false,
  ) => {
    setEntityKind(kind);
    setEntityId(id);
    setActiveOnlyFixtureSelected(isActiveOnlyFixture);
    setState("focus");
  }, []);

  const selectNextPaper = useCallback(() => {
    const nextPaperId = nextAgentGalaxyImmersivePaperId(payload, entityId);
    if (!nextPaperId) return;
    selectEntity("paper", nextPaperId);
  }, [entityId, payload, selectEntity]);

  const relationLabel = contextSet?.relation === "answer-evidence"
    ? "回答证据"
    : contextSet?.relation === "citation-neighborhood"
      ? "引用关联"
      : contextSet?.relation === "hotspot-membership"
        ? "同热点语义邻域"
        : "待解析";
  const membershipLabel = resolvedTarget?.membership ?? "missing";
  const hotspotLabel = contextSet?.hotspot?.field
    ?? resolvedTarget?.field
    ?? (
      resolvedTarget?.membership === "active-only"
        ? "未分类外围区"
        : "等待上下文"
    );

  return (
    <main
      className="agent-immersive-workspace"
      data-agent-state={state}
      data-agent-view={view}
      data-review-ready={metrics?.webglAvailable ? "true" : "false"}
      data-focus-phase={focusSnapshot?.phase ?? "idle"}
      data-source-snapshot={payload.sourceSnapshotId}
      data-target-membership={membershipLabel}
      style={workspaceStyle}
    >
      <div
        className={[
          "agent-immersive-view",
          "agent-immersive-view--flow",
          view === "immersive" ? "is-active" : "",
        ].join(" ")}
        aria-hidden={view !== "immersive"}
      >
        <AgentGalaxyImmersiveCanvas
          payload={payload}
          state={state}
          quality={quality}
          focusIntent={focusIntent}
          contextSet={contextSet}
          reducedMotion={reducedMotion}
          onMetrics={setMetrics}
          onFocusSnapshot={setFocusSnapshot}
        />
      </div>
      <div
        className={[
          "agent-immersive-view",
          "agent-immersive-view--theory",
          view === "theory" ? "is-active" : "",
        ].join(" ")}
        aria-hidden={view !== "theory"}
      >
        <AgentGalaxyTheoryBridgeCanvas
          payload={fullPayload}
          target={resolvedTarget}
        />
      </div>
      <div
        key={view}
        className="agent-immersive-view-mask"
        aria-hidden="true"
      />

      <div className="agent-immersive-workspace__overlay">
        <aside
          className={[
            "agent-immersive-context",
            `agent-immersive-context--${panelSide}`,
            panelVisible ? "is-visible" : "",
          ].join(" ")}
          aria-hidden={!panelVisible}
          aria-label="当前论文上下文"
        >
          <span className="agent-immersive-context__kind">
            {resolvedTarget?.kind === "hotspot" ? "热点上下文" : "论文上下文"}
          </span>
          <h2>{hotspotLabel}</h2>
          <p className="agent-immersive-context__entity">
            {resolvedTarget
              ? compactEntityId(resolvedTarget.entityId)
              : "尚未选择实体"}
          </p>
          <dl>
            <div>
              <dt>关系</dt>
              <dd>{relationLabel}</dd>
            </div>
            <div>
              <dt>上下文</dt>
              <dd>{contextSet?.contextPapers.length ?? 0} 篇</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{membershipLabel}</dd>
            </div>
          </dl>
          <p className="agent-immersive-context__note">
            {resolvedTarget?.membership === "active-only"
              ? "该实体明确显示为未聚类新信号，不伪造热点归属或理论位置。"
              : "星体、热点和成员关系来自同一快照；页面不生成随机标题或相关度。"}
          </p>
          <button
            type="button"
            className="agent-immersive-context__theory"
            disabled={resolvedTarget?.membership === "active-only"}
            onClick={() => setView("theory")}
          >
            {resolvedTarget?.membership === "active-only"
              ? "尚无理论位置"
              : "查看语义位置"}
          </button>
        </aside>

        <section className="agent-immersive-dialog" aria-label="Research Agent">
          <header>
            <span className="agent-immersive-dialog__signal" aria-hidden="true" />
            <div>
              <h1>Research Agent</h1>
              <p>{view === "theory" ? "理论坐标" : STATE_LABEL[state]}</p>
            </div>
          </header>

          <div className="agent-immersive-dialog__answer" aria-live="polite">
            <p>
              {view === "theory"
                ? "当前使用真实理论 XYZ 定位同一实体；与沉浸展示空间之间不进行逐星插值。"
                : STATE_COPY[state]}
            </p>
            {resolvedTarget ? (
              <span>
                {compactEntityId(resolvedTarget.entityId)}
                {"  "}
                {hotspotLabel}
              </span>
            ) : null}
          </div>

          {view === "immersive" ? (
            <div
              className="agent-immersive-dialog__controls"
              role="group"
              aria-label="Agent 状态"
            >
              {(Object.keys(STATE_LABEL) as AgentGalaxyImmersiveState[])
                .map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={state === value}
                    onClick={() => setState(value)}
                  >
                    {STATE_LABEL[value]}
                  </button>
                ))}
            </div>
          ) : (
            <button
              type="button"
              className="agent-immersive-dialog__return"
              onClick={() => setView("immersive")}
            >
              返回沉浸视图
            </button>
          )}

          {view === "immersive" ? (
            <button
              type="button"
              className="agent-immersive-dialog__next"
              onClick={selectNextPaper}
            >
              切换真实论文实体
            </button>
          ) : null}
        </section>
      </div>

      {showHud ? (
        <div className="agent-immersive-workspace__review-tools">
          <button
            type="button"
            onClick={() => fixtures.sampledPaperId
              && selectEntity("paper", fixtures.sampledPaperId)}
          >
            sampled
          </button>
          <button
            type="button"
            onClick={() => fixtures.snapshotUnsampledPaperId
              && selectEntity("paper", fixtures.snapshotUnsampledPaperId)}
          >
            snapshot-unsampled
          </button>
          <button
            type="button"
            onClick={() => selectEntity(
              "paper",
              "fixture:active-only:unclassified-paper",
              true,
            )}
          >
            active-only fixture
          </button>
          <button
            type="button"
            onClick={() => fixtures.hotspotId
              && selectEntity("hotspot", fixtures.hotspotId)}
          >
            hotspot
          </button>
          <button
            type="button"
            onClick={() => selectEntity(
              "paper",
              "missing:paper:does-not-exist",
            )}
          >
            missing
          </button>
        </div>
      ) : null}

      {showHud ? (
        <output className="agent-immersive-workspace__hud">
          <span>{metrics?.averageFps.toFixed(0) ?? "0"} FPS</span>
          <span>{metrics?.quality ?? quality}</span>
          <span>{metrics?.contextState ?? state}</span>
          <span>{membershipLabel}</span>
          <span>{metrics?.contextEntityCount ?? 0} context</span>
          <span>{metrics?.dynamicEntityCount ?? 0} dynamic</span>
        </output>
      ) : null}
    </main>
  );
}
