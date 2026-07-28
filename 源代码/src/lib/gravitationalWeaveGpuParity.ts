import type {
  AgentGalaxyBackgroundPayloadV1,
} from "../types";
import type { AgentGalaxyVector3 } from "./agentGalaxyFlowContract";
import {
  GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
  GRAVITATIONAL_WEAVE_GLSL_CHUNK,
  createGravitationalWeaveField,
  createGravitationalWeaveUniformValues,
  fnv1a32,
  sampleGravitationalWeavePosition,
  type GravitationalWeaveParameters,
} from "./gravitationalWeaveFlow";

export const GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_COUNT = 256;
export const GRAVITATIONAL_WEAVE_GPU_PARITY_TOLERANCE = 2e-4;
export const GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_VERSION =
  "gravitational-weave-gpu-parity-samples-v1";

export type GravitationalWeaveGpuParityResult = {
  status: "PASS" | "FAIL" | "UNVERIFIED";
  sampleVersion: typeof GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_VERSION;
  sampleCount: number;
  hotspotSampleCount: number;
  paperSampleCount: number;
  timeSeconds: number;
  toleranceWorldUnits: typeof GRAVITATIONAL_WEAVE_GPU_PARITY_TOLERANCE;
  maximumErrorWorldUnits?: number;
  meanErrorWorldUnits?: number;
  reason?: string;
};

type ParitySample = {
  kind: "hotspot" | "paper";
  entityId: string;
  hotspotAnchor: AgentGalaxyVector3;
  semanticOffset: AgentGalaxyVector3;
};

function stableSamples<T extends { id: string }>(
  values: readonly T[],
  sourceSnapshotId: string,
  kind: ParitySample["kind"],
  count: number,
) {
  return [...values]
    .sort((left, right) => {
      const leftRank = fnv1a32([
        sourceSnapshotId,
        GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_VERSION,
        kind,
        left.id,
      ].join("\0"));
      const rightRank = fnv1a32([
        sourceSnapshotId,
        GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_VERSION,
        kind,
        right.id,
      ].join("\0"));
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.id.localeCompare(right.id);
    })
    .slice(0, count);
}

function createParitySamples(payload: AgentGalaxyBackgroundPayloadV1) {
  const targetPerKind = GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_COUNT / 2;
  const hotspotById = new Map(
    payload.hotspots.map((hotspot) => [hotspot.id, hotspot]),
  );
  const hotspotSamples: ParitySample[] = stableSamples(
    payload.hotspots,
    payload.sourceSnapshotId,
    "hotspot",
    targetPerKind,
  ).map((hotspot) => ({
    kind: "hotspot",
    entityId: hotspot.id,
    hotspotAnchor: [...hotspot.position],
    semanticOffset: [0, 0, 0],
  }));
  const paperSamples: ParitySample[] = stableSamples(
    payload.papers.filter((paper) => hotspotById.has(paper.hotspotId)),
    payload.sourceSnapshotId,
    "paper",
    GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_COUNT - hotspotSamples.length,
  ).flatMap((paper) => {
    const hotspot = hotspotById.get(paper.hotspotId);
    if (!hotspot) return [];
    return [{
      kind: "paper",
      entityId: paper.id,
      hotspotAnchor: [...hotspot.position] as AgentGalaxyVector3,
      semanticOffset: [...paper.offset] as AgentGalaxyVector3,
    }];
  });
  const remaining = GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_COUNT
    - hotspotSamples.length
    - paperSamples.length;
  const additionalHotspots = remaining > 0
    ? stableSamples(
      payload.hotspots.filter(
        (hotspot) => !hotspotSamples.some((sample) => sample.entityId === hotspot.id),
      ),
      payload.sourceSnapshotId,
      "hotspot",
      remaining,
    ).map((hotspot): ParitySample => ({
      kind: "hotspot",
      entityId: hotspot.id,
      hotspotAnchor: [...hotspot.position],
      semanticOffset: [0, 0, 0],
    }))
    : [];
  return [...hotspotSamples, ...paperSamples, ...additionalHotspots];
}

function resolveParameters(
  parameters: Partial<GravitationalWeaveParameters>,
): GravitationalWeaveParameters {
  return {
    ...GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS,
    ...parameters,
    calmCenter: [
      ...(parameters.calmCenter
        ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmCenter),
    ],
    calmForward: [
      ...(parameters.calmForward
        ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmForward),
    ],
    calmUp: [
      ...(parameters.calmUp
        ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmUp),
    ],
    calmRadii: [
      ...(parameters.calmRadii
        ?? GRAVITATIONAL_WEAVE_DEFAULT_PARAMETERS.calmRadii),
    ],
  };
}

function shaderLog(
  gl: WebGL2RenderingContext,
  shader: WebGLShader,
  label: string,
) {
  const log = gl.getShaderInfoLog(shader)?.trim();
  return log ? `${label}:${log}` : `${label}:compile-failed`;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`${label}:create-failed`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = shaderLog(gl, shader, label);
    gl.deleteShader(shader);
    throw new Error(reason);
  }
  return shader;
}

function uniformLocation(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
) {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`uniform-missing:${name}`);
  return location;
}

function assertNoGlError(
  gl: WebGL2RenderingContext,
  stage: string,
) {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`webgl-error:${stage}:0x${error.toString(16)}`);
  }
}

function flattenVectors(values: readonly AgentGalaxyVector3[]) {
  const flattened = new Float32Array(values.length * 3);
  values.forEach((value, index) => {
    flattened[index * 3] = value[0];
    flattened[index * 3 + 1] = value[1];
    flattened[index * 3 + 2] = value[2];
  });
  return flattened;
}

function createInputBuffer(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  attributeName: string,
  values: Float32Array,
) {
  const location = gl.getAttribLocation(program, attributeName);
  if (location < 0) throw new Error(`attribute-missing:${attributeName}`);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error(`buffer-create-failed:${attributeName}`);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  return buffer;
}

function setWeaveUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  payload: AgentGalaxyBackgroundPayloadV1,
  parameters: GravitationalWeaveParameters,
  timeSeconds: number,
) {
  const values = createGravitationalWeaveUniformValues(
    payload.sourceSnapshotId,
    parameters,
    timeSeconds,
  );
  gl.uniform1f(
    uniformLocation(gl, program, "uWeaveTime"),
    values.uWeaveTime,
  );
  gl.uniform1f(
    uniformLocation(gl, program, "uWeaveGravity"),
    values.uWeaveGravity,
  );
  gl.uniform1f(
    uniformLocation(gl, program, "uWeaveShear"),
    values.uWeaveShear,
  );
  gl.uniform1f(
    uniformLocation(gl, program, "uWeaveTwist"),
    values.uWeaveTwist,
  );
  gl.uniform1f(
    uniformLocation(gl, program, "uWeaveCalmStrength"),
    values.uWeaveCalmStrength,
  );
  gl.uniform3fv(
    uniformLocation(gl, program, "uWeaveNodePosition[0]"),
    flattenVectors(values.uWeaveNodePosition),
  );
  gl.uniform3fv(
    uniformLocation(gl, program, "uWeaveNodeAxis[0]"),
    flattenVectors(values.uWeaveNodeAxis),
  );
  gl.uniform1fv(
    uniformLocation(gl, program, "uWeaveNodeRadius[0]"),
    new Float32Array(values.uWeaveNodeRadius),
  );
  gl.uniform1fv(
    uniformLocation(gl, program, "uWeaveNodePeriod[0]"),
    new Float32Array(values.uWeaveNodePeriod),
  );
  gl.uniform1fv(
    uniformLocation(gl, program, "uWeaveNodePhase[0]"),
    new Float32Array(values.uWeaveNodePhase),
  );
  gl.uniform3fv(
    uniformLocation(gl, program, "uWeaveCalmCenter"),
    new Float32Array(values.uWeaveCalmCenter),
  );
  gl.uniform3fv(
    uniformLocation(gl, program, "uWeaveCalmForward"),
    new Float32Array(values.uWeaveCalmForward),
  );
  gl.uniform3fv(
    uniformLocation(gl, program, "uWeaveCalmUp"),
    new Float32Array(values.uWeaveCalmUp),
  );
  gl.uniform3fv(
    uniformLocation(gl, program, "uWeaveCalmRadii"),
    new Float32Array(values.uWeaveCalmRadii),
  );
}

function failure(
  status: "FAIL" | "UNVERIFIED",
  timeSeconds: number,
  reason: string,
): GravitationalWeaveGpuParityResult {
  return {
    status,
    sampleVersion: GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_VERSION,
    sampleCount: 0,
    hotspotSampleCount: 0,
    paperSampleCount: 0,
    timeSeconds,
    toleranceWorldUnits: GRAVITATIONAL_WEAVE_GPU_PARITY_TOLERANCE,
    reason,
  };
}

export function runGravitationalWeaveGpuParityAudit(
  payload: AgentGalaxyBackgroundPayloadV1,
  parameters: Partial<GravitationalWeaveParameters> = {},
  timeSeconds = 8,
): GravitationalWeaveGpuParityResult {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  });
  if (!gl) {
    return failure("UNVERIFIED", timeSeconds, "webgl2-unavailable");
  }

  const samples = createParitySamples(payload);
  if (samples.length !== GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_COUNT) {
    return failure(
      "UNVERIFIED",
      timeSeconds,
      `insufficient-semantic-samples:${samples.length}`,
    );
  }

  const vertexSource = `#version 300 es
    precision highp float;
    in vec3 aHotspotAnchor;
    in vec3 aSemanticOffset;
    ${GRAVITATIONAL_WEAVE_GLSL_CHUNK}
    out vec3 vAuditPosition;

    void main() {
      vAuditPosition = agentWeaveSemantic(
        aHotspotAnchor,
        aSemanticOffset
      );
      gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
      gl_PointSize = 1.0;
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    out vec4 outputColor;
    void main() {
      outputColor = vec4(0.0);
    }
  `;
  let vertexShader: WebGLShader | undefined;
  let fragmentShader: WebGLShader | undefined;
  let program: WebGLProgram | undefined;
  let vertexArray: WebGLVertexArrayObject | undefined;
  let hotspotBuffer: WebGLBuffer | undefined;
  let semanticBuffer: WebGLBuffer | undefined;
  let outputBuffer: WebGLBuffer | undefined;
  let transformFeedback: WebGLTransformFeedback | undefined;

  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, "vertex");
    fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource,
      "fragment",
    );
    program = gl.createProgram() ?? undefined;
    if (!program) throw new Error("program-create-failed");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.transformFeedbackVaryings(
      program,
      ["vAuditPosition"],
      gl.SEPARATE_ATTRIBS,
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `program-link:${gl.getProgramInfoLog(program)?.trim() || "failed"}`,
      );
    }
    const varyingCount = gl.getProgramParameter(
      program,
      gl.TRANSFORM_FEEDBACK_VARYINGS,
    ) as number;
    const varying = varyingCount === 1
      ? gl.getTransformFeedbackVarying(program, 0)
      : null;
    if (
      varyingCount !== 1
      || !varying
      || varying.name !== "vAuditPosition"
      || varying.type !== gl.FLOAT_VEC3
      || varying.size !== 1
    ) {
      throw new Error(
        `transform-feedback-layout:${varyingCount}:`
        + `${varying?.name ?? "missing"}:${varying?.type ?? 0}:`
        + `${varying?.size ?? 0}`,
      );
    }

    vertexArray = gl.createVertexArray() ?? undefined;
    if (!vertexArray) throw new Error("vertex-array-create-failed");
    gl.bindVertexArray(vertexArray);
    hotspotBuffer = createInputBuffer(
      gl,
      program,
      "aHotspotAnchor",
      flattenVectors(samples.map((sample) => sample.hotspotAnchor)),
    );
    semanticBuffer = createInputBuffer(
      gl,
      program,
      "aSemanticOffset",
      flattenVectors(samples.map((sample) => sample.semanticOffset)),
    );
    outputBuffer = gl.createBuffer() ?? undefined;
    if (!outputBuffer) throw new Error("output-buffer-create-failed");
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, outputBuffer);
    gl.bufferData(
      gl.TRANSFORM_FEEDBACK_BUFFER,
      samples.length * 3 * Float32Array.BYTES_PER_ELEMENT,
      gl.DYNAMIC_COPY,
    );
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    transformFeedback = gl.createTransformFeedback() ?? undefined;
    if (!transformFeedback) {
      throw new Error("transform-feedback-create-failed");
    }

    gl.useProgram(program);
    const resolvedParameters = resolveParameters(parameters);
    setWeaveUniforms(
      gl,
      program,
      payload,
      resolvedParameters,
      timeSeconds,
    );
    assertNoGlError(gl, "uniform-upload");
    gl.bindVertexArray(vertexArray);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transformFeedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, outputBuffer);
    assertNoGlError(gl, "transform-feedback-bind");
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, samples.length);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    assertNoGlError(gl, "transform-feedback-draw");
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, outputBuffer);
    const gpuPositions = new Float32Array(samples.length * 3);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, gpuPositions);
    assertNoGlError(gl, "transform-feedback-readback");

    const field = createGravitationalWeaveField(payload.sourceSnapshotId);
    let maximumErrorWorldUnits = 0;
    let errorSum = 0;
    samples.forEach((sample, index) => {
      const cpuPosition = sampleGravitationalWeavePosition(
        sample.hotspotAnchor,
        sample.semanticOffset,
        timeSeconds,
        field,
        resolvedParameters,
      );
      const offset = index * 3;
      const error = Math.hypot(
        cpuPosition[0] - gpuPositions[offset],
        cpuPosition[1] - gpuPositions[offset + 1],
        cpuPosition[2] - gpuPositions[offset + 2],
      );
      maximumErrorWorldUnits = Math.max(maximumErrorWorldUnits, error);
      errorSum += error;
    });
    const meanErrorWorldUnits = errorSum / samples.length;
    const status = maximumErrorWorldUnits
      <= GRAVITATIONAL_WEAVE_GPU_PARITY_TOLERANCE
      ? "PASS"
      : "FAIL";
    return {
      status,
      sampleVersion: GRAVITATIONAL_WEAVE_GPU_PARITY_SAMPLE_VERSION,
      sampleCount: samples.length,
      hotspotSampleCount: samples.filter((sample) => sample.kind === "hotspot").length,
      paperSampleCount: samples.filter((sample) => sample.kind === "paper").length,
      timeSeconds,
      toleranceWorldUnits: GRAVITATIONAL_WEAVE_GPU_PARITY_TOLERANCE,
      maximumErrorWorldUnits,
      meanErrorWorldUnits,
      reason: status === "FAIL" ? "cpu-gpu-error-exceeds-tolerance" : undefined,
    };
  } catch (reason) {
    return failure(
      "FAIL",
      timeSeconds,
      reason instanceof Error ? reason.message : String(reason),
    );
  } finally {
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    if (transformFeedback) gl.deleteTransformFeedback(transformFeedback);
    if (outputBuffer) gl.deleteBuffer(outputBuffer);
    if (semanticBuffer) gl.deleteBuffer(semanticBuffer);
    if (hotspotBuffer) gl.deleteBuffer(hotspotBuffer);
    if (program) gl.deleteProgram(program);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    if (vertexShader) gl.deleteShader(vertexShader);
    const loseContext = gl.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
  }
}
