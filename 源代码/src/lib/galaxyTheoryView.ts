export type GalaxyTheoryViewPoint = {
  x: number;
  y: number;
  z: number;
  topicKey?: string;
  displaySize?: number;
};

export type GalaxyTheoryViewScore = {
  score: number;
  overlapPenalty: number;
  emptyGridRatio: number;
  centerOffset: number;
  edgeCrowding: number;
};

export type AgentGalaxyTheoryViewScore = GalaxyTheoryViewScore & {
  depthCompressionPenalty: number;
  parallaxPenalty: number;
};

export type GalaxyTheoryViewSelection = {
  azimuth: number;
  elevation: number;
  distance: number;
  baselineScore: number;
  selectedScore: number;
  improvementRatio: number;
  usedOptimizedView: boolean;
  score: GalaxyTheoryViewScore;
};

export type AgentGalaxyTheoryViewSelection = Omit<
  GalaxyTheoryViewSelection,
  "score"
> & {
  score: AgentGalaxyTheoryViewScore;
};

const DEG = Math.PI / 180;
const VIEW_ELEVATIONS = [18, 26, 34, 42, 50].map((value) => value * DEG);
const BASELINE_AZIMUTH = 45 * DEG;
const BASELINE_ELEVATION = 26 * DEG;
const GRID_COLUMNS = 8;
const GRID_ROWS = 5;
const MAX_PAPER_SCORE_SAMPLES = 2_048;
const FIT_COVERAGE = 0.88;

type Basis = {
  cameraDirection: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
};

type ProjectedPoint = {
  x: number;
  y: number;
  viewDepth: number;
  displaySize: number;
};

export function selectDeterministicTheoryView(
  hotspots: GalaxyTheoryViewPoint[],
  papers: GalaxyTheoryViewPoint[],
  aspect = 16 / 9,
  verticalFovDegrees = 48,
): GalaxyTheoryViewSelection {
  if (hotspots.length === 0) {
    return {
      azimuth: BASELINE_AZIMUTH,
      elevation: BASELINE_ELEVATION,
      distance: 1,
      baselineScore: 0,
      selectedScore: 0,
      improvementRatio: 0,
      usedOptimizedView: false,
      score: zeroScore(),
    };
  }

  const center = medianCenter(hotspots);
  const allPoints = [...hotspots, ...papers];
  const scorePapers = stratifiedPaperSample(papers, MAX_PAPER_SCORE_SAMPLES);
  const scorePoints = [...hotspots, ...scorePapers];
  const verticalTangent = Math.tan(verticalFovDegrees * DEG * 0.5);
  const horizontalTangent = verticalTangent * Math.max(0.1, aspect);
  const candidates: Array<{ azimuth: number; elevation: number }> = [];
  for (let index = 0; index < 24; index += 1) {
    for (const elevation of VIEW_ELEVATIONS) {
      candidates.push({ azimuth: index * 15 * DEG, elevation });
    }
  }

  const evaluate = (azimuth: number, elevation: number) => {
    const basis = viewBasis(azimuth, elevation);
    const distance = fitDistance(allPoints, center, basis, horizontalTangent, verticalTangent);
    const projectedHotspots = projectPoints(
      hotspots,
      center,
      basis,
      distance,
      horizontalTangent,
      verticalTangent,
    );
    const projectedScorePoints = projectPoints(
      scorePoints,
      center,
      basis,
      distance,
      horizontalTangent,
      verticalTangent,
    );
    return {
      azimuth,
      elevation,
      distance,
      score: scoreView(projectedHotspots, projectedScorePoints),
    };
  };

  const baseline = evaluate(BASELINE_AZIMUTH, BASELINE_ELEVATION);
  let best = baseline;
  for (const candidate of candidates) {
    const evaluated = evaluate(candidate.azimuth, candidate.elevation);
    if (
      evaluated.score.score < best.score.score - 1e-12
      || (
        Math.abs(evaluated.score.score - best.score.score) <= 1e-12
        && candidateOrder(evaluated) < candidateOrder(best)
      )
    ) {
      best = evaluated;
    }
  }
  const improvementRatio = baseline.score.score > 1e-12
    ? Math.max(0, (baseline.score.score - best.score.score) / baseline.score.score)
    : 0;
  const selected = improvementRatio >= 0.05 ? best : baseline;
  return {
    azimuth: selected.azimuth,
    elevation: selected.elevation,
    distance: selected.distance,
    baselineScore: baseline.score.score,
    selectedScore: selected.score.score,
    improvementRatio,
    usedOptimizedView: selected === best && improvementRatio >= 0.05,
    score: selected.score,
  };
}

export function selectDeterministicAgentTheoryView(
  hotspots: GalaxyTheoryViewPoint[],
  papers: GalaxyTheoryViewPoint[],
  aspect = 16 / 9,
  verticalFovDegrees = 42,
): AgentGalaxyTheoryViewSelection {
  if (hotspots.length === 0) {
    return {
      azimuth: BASELINE_AZIMUTH,
      elevation: BASELINE_ELEVATION,
      distance: 1,
      baselineScore: 0,
      selectedScore: 0,
      improvementRatio: 0,
      usedOptimizedView: false,
      score: {
        ...zeroScore(),
        depthCompressionPenalty: 0,
        parallaxPenalty: 0,
      },
    };
  }

  const center = medianCenter(hotspots);
  const allPoints = [...hotspots, ...papers];
  const scorePapers = stratifiedPaperSample(papers, MAX_PAPER_SCORE_SAMPLES);
  const scorePoints = [...hotspots, ...scorePapers];
  const verticalTangent = Math.tan(verticalFovDegrees * DEG * 0.5);
  const horizontalTangent = verticalTangent * Math.max(0.1, aspect);
  const candidates: Array<{ azimuth: number; elevation: number }> = [];
  for (let index = 0; index < 24; index += 1) {
    for (const elevation of VIEW_ELEVATIONS) {
      candidates.push({ azimuth: index * 15 * DEG, elevation });
    }
  }

  const evaluate = (azimuth: number, elevation: number) => {
    const basis = viewBasis(azimuth, elevation);
    const distance = fitDistance(
      allPoints,
      center,
      basis,
      horizontalTangent,
      verticalTangent,
    );
    const projectedHotspots = projectPoints(
      hotspots,
      center,
      basis,
      distance,
      horizontalTangent,
      verticalTangent,
    );
    const projectedScorePoints = projectPoints(
      scorePoints,
      center,
      basis,
      distance,
      horizontalTangent,
      verticalTangent,
    );
    const statistical = scoreView(projectedHotspots, projectedScorePoints);
    const depthCompressionPenalty = scoreDepthCompression(
      projectedScorePoints,
      distance,
    );
    const parallaxPenalty = scoreParallaxPotential(
      scorePoints,
      center,
      azimuth,
      elevation,
      distance,
      horizontalTangent,
      verticalTangent,
    );
    const score: AgentGalaxyTheoryViewScore = {
      ...statistical,
      depthCompressionPenalty,
      parallaxPenalty,
      score:
        statistical.overlapPenalty * 0.30
        + statistical.emptyGridRatio * 0.15
        + statistical.centerOffset * 0.15
        + statistical.edgeCrowding * 0.10
        + depthCompressionPenalty * 0.20
        + parallaxPenalty * 0.10,
    };
    return { azimuth, elevation, distance, score };
  };

  const baseline = evaluate(BASELINE_AZIMUTH, BASELINE_ELEVATION);
  let best = baseline;
  for (const candidate of candidates) {
    const evaluated = evaluate(candidate.azimuth, candidate.elevation);
    if (
      evaluated.score.score < best.score.score - 1e-12
      || (
        Math.abs(evaluated.score.score - best.score.score) <= 1e-12
        && candidateOrder(evaluated) < candidateOrder(best)
      )
    ) {
      best = evaluated;
    }
  }
  const improvementRatio = baseline.score.score > 1e-12
    ? Math.max(0, (baseline.score.score - best.score.score) / baseline.score.score)
    : 0;
  return {
    azimuth: best.azimuth,
    elevation: best.elevation,
    distance: best.distance,
    baselineScore: baseline.score.score,
    selectedScore: best.score.score,
    improvementRatio,
    usedOptimizedView: candidateOrder(best) !== candidateOrder(baseline),
    score: best.score,
  };
}

function scoreView(hotspots: ProjectedPoint[], points: ProjectedPoint[]): GalaxyTheoryViewScore {
  const overlapPenalty = hotspotOverlapPenalty(hotspots);
  const occupied = new Set<number>();
  let sumX = 0;
  let sumY = 0;
  let edgeCount = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    if (Math.abs(point.x) >= 0.86 || Math.abs(point.y) >= 0.86) edgeCount += 1;
    const column = clampIndex(Math.floor((point.x * 0.5 + 0.5) * GRID_COLUMNS), GRID_COLUMNS);
    const row = clampIndex(Math.floor((-point.y * 0.5 + 0.5) * GRID_ROWS), GRID_ROWS);
    occupied.add(row * GRID_COLUMNS + column);
  }
  const emptyGridRatio = 1 - occupied.size / (GRID_COLUMNS * GRID_ROWS);
  const denominator = Math.max(1, points.length);
  const centerOffset = Math.min(1, Math.hypot(sumX / denominator, sumY / denominator) / 0.5);
  const edgeCrowding = edgeCount / denominator;
  return {
    score:
      overlapPenalty * 0.4
      + emptyGridRatio * 0.25
      + centerOffset * 0.2
      + edgeCrowding * 0.15,
    overlapPenalty,
    emptyGridRatio,
    centerOffset,
    edgeCrowding,
  };
}

function hotspotOverlapPenalty(points: ProjectedPoint[]) {
  if (points.length < 2) return 0;
  let overlap = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const first = points[left];
      const second = points[right];
      const firstRadius = 0.008 + Math.min(0.026, first.displaySize / 1_080);
      const secondRadius = 0.008 + Math.min(0.026, second.displaySize / 1_080);
      const threshold = firstRadius + secondRadius;
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      if (distance < threshold) overlap += 1 - distance / Math.max(1e-9, threshold);
    }
  }
  return Math.min(1, overlap / Math.max(1, points.length * 0.45));
}

function fitDistance(
  points: GalaxyTheoryViewPoint[],
  center: [number, number, number],
  basis: Basis,
  horizontalTangent: number,
  verticalTangent: number,
) {
  let required = 0.01;
  for (const point of points) {
    const relative = subtractPoint(point, center);
    const alongCamera = dot(relative, basis.cameraDirection);
    const horizontal = Math.abs(dot(relative, basis.right));
    const vertical = Math.abs(dot(relative, basis.up));
    required = Math.max(
      required,
      alongCamera + horizontal / Math.max(1e-9, horizontalTangent * FIT_COVERAGE),
      alongCamera + vertical / Math.max(1e-9, verticalTangent * FIT_COVERAGE),
    );
  }
  return required * 1.015;
}

function projectPoints(
  points: GalaxyTheoryViewPoint[],
  center: [number, number, number],
  basis: Basis,
  distance: number,
  horizontalTangent: number,
  verticalTangent: number,
) {
  return points.map((point) => {
    const relative = subtractPoint(point, center);
    const viewDepth = Math.max(1e-9, distance - dot(relative, basis.cameraDirection));
    return {
      x: dot(relative, basis.right) / (viewDepth * horizontalTangent),
      y: dot(relative, basis.up) / (viewDepth * verticalTangent),
      viewDepth,
      displaySize: point.displaySize ?? 12,
    };
  });
}

function scoreDepthCompression(points: ProjectedPoint[], distance: number) {
  if (points.length < 2) return 1;
  const depths = points.map((point) => point.viewDepth).sort((left, right) => left - right);
  const spread = percentile(depths, 0.95) - percentile(depths, 0.05);
  const normalizedSpread = spread / Math.max(1e-9, distance);
  return 1 - clamp01(normalizedSpread / 0.34);
}

function scoreParallaxPotential(
  points: GalaxyTheoryViewPoint[],
  center: [number, number, number],
  azimuth: number,
  elevation: number,
  distance: number,
  horizontalTangent: number,
  verticalTangent: number,
) {
  if (points.length < 4) return 1;
  const base = projectPoints(
    points,
    center,
    viewBasis(azimuth, elevation),
    distance,
    horizontalTangent,
    verticalTangent,
  );
  const yawed = projectPoints(
    points,
    center,
    viewBasis(azimuth + 0.8 * DEG, elevation),
    distance,
    horizontalTangent,
    verticalTangent,
  );
  const ranked = base
    .map((point, index) => ({
      depth: point.viewDepth,
      displacement: Math.hypot(
        yawed[index].x - point.x,
        yawed[index].y - point.y,
      ),
    }))
    .sort((left, right) => left.depth - right.depth);
  const groupSize = Math.max(1, Math.floor(ranked.length / 3));
  const near = ranked.slice(0, groupSize).map((item) => item.displacement);
  const far = ranked.slice(-groupSize).map((item) => item.displacement);
  const separation = Math.abs(median(near.sort((a, b) => a - b)) - median(far.sort((a, b) => a - b)));
  return 1 - clamp01(separation / 0.0024);
}

function viewBasis(azimuth: number, elevation: number): Basis {
  const horizontal = Math.cos(elevation);
  const cameraDirection: [number, number, number] = [
    horizontal * Math.cos(azimuth),
    horizontal * Math.sin(azimuth),
    Math.sin(elevation),
  ];
  let right = normalize([
    cameraDirection[1],
    -cameraDirection[0],
    0,
  ]);
  if (length(right) < 1e-9) right = [1, 0, 0];
  const up = normalize(cross(cameraDirection, right));
  return { cameraDirection, right, up };
}

function stratifiedPaperSample(points: GalaxyTheoryViewPoint[], limit: number) {
  if (points.length <= limit) return points.slice();
  const groups = new Map<string, GalaxyTheoryViewPoint[]>();
  for (const point of points) {
    const key = point.topicKey ?? "";
    const rows = groups.get(key) ?? [];
    rows.push(point);
    groups.set(key, rows);
  }
  const keys = [...groups.keys()].sort();
  const output: GalaxyTheoryViewPoint[] = [];
  let round = 0;
  while (output.length < limit) {
    let added = false;
    for (const key of keys) {
      const group = groups.get(key) ?? [];
      if (round >= group.length) continue;
      output.push(group[round]);
      added = true;
      if (output.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return output;
}

function medianCenter(points: GalaxyTheoryViewPoint[]): [number, number, number] {
  const values = (axis: "x" | "y" | "z") => points.map((point) => point[axis]).sort((a, b) => a - b);
  return [median(values("x")), median(values("y")), median(values("z"))];
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) * 0.5
    : values[middle];
}

function percentile(values: number[], value: number) {
  if (values.length === 0) return 0;
  return values[Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(values.length * value) - 1),
  )];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function subtractPoint(
  point: GalaxyTheoryViewPoint,
  center: readonly [number, number, number],
): [number, number, number] {
  return [point.x - center[0], point.y - center[1], point.z - center[2]];
}

function dot(left: readonly number[], right: readonly number[]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function length(value: readonly number[]) {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: [number, number, number]): [number, number, number] {
  const magnitude = Math.max(1e-12, length(value));
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

function clampIndex(value: number, size: number) {
  return Math.max(0, Math.min(size - 1, value));
}

function candidateOrder(candidate: { azimuth: number; elevation: number }) {
  return candidate.elevation * 10 + candidate.azimuth;
}

function zeroScore(): GalaxyTheoryViewScore {
  return {
    score: 0,
    overlapPenalty: 0,
    emptyGridRatio: 0,
    centerOffset: 0,
    edgeCrowding: 0,
  };
}
