import type { GalaxyCameraPose } from "../components/App17GalaxyCanvas";

export type SideraShellScene =
  | "agent"
  | "workbench"
  | "research-galaxy"
  | "pipeline-formation";

export type SideraNavigationLayout = "spatial-overlay" | "workbench-reserve";

export type SideraChromeSafeArea = {
  titlebarHeight: number;
  navigationWidth: number;
  workbenchGap: number;
  windowControlsWidth: number;
};

export type SideraRendererOwner =
  | "agent-immersive"
  | "agent-theory"
  | "workbench-star-river"
  | "research-galaxy"
  | "pipeline-formation"
  | "static-fallback";

export type SideraBackgroundCheckpoint = {
  owner: SideraRendererOwner;
  projectId: string;
  snapshotId?: string;
  sessionSeed?: string;
  elapsedSeconds: number;
  cameraPose?: GalaxyCameraPose;
  payloadVersion: string;
};

export type SideraSceneTransition = {
  revision: number;
  from: SideraRendererOwner | null;
  to: SideraRendererOwner;
  phase: "covering" | "releasing" | "mounting" | "revealing" | "ready";
};

export type SideraNavigationState<TView extends string = string> = {
  open: boolean;
  activeView: TView;
};

export type SideraPipelineSpatialState = {
  active: boolean;
  runId?: string;
  stage?: string;
  progress: number;
  paused: boolean;
};

export const WORKBENCH_BACKGROUND = Object.freeze({
  style: "star-river" as const,
  brightness: 0.34,
  speedScale: 0.2,
  interactive: false,
});

export const SIDERA_CHROME_SAFE_AREA: Readonly<SideraChromeSafeArea> = Object.freeze({
  titlebarHeight: 38,
  navigationWidth: 232,
  workbenchGap: 24,
  windowControlsWidth: 138,
});
