import type { AgentGalaxyVector3 } from "./agentGalaxyFlowContract";
import {
  AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK,
  sampleAgentGalaxyFocusFieldOffset,
} from "./agentGalaxyFocusField";

export const AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_SAMPLE_COUNT = 256;
export const AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_TOLERANCE = 2e-4;
export const AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_SAMPLE_VERSION =
  "agent-galaxy-focus-field-gpu-parity-v1";

export type AgentGalaxyFocusFieldGpuParityResult = {
  status: "PASS" | "FAIL" | "UNVERIFIED";
  sampleVersion: typeof AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_SAMPLE_VERSION;
  sampleCount: number;
  toleranceWorldUnits:
    typeof AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_TOLERANCE;
  maximumErrorWorldUnits?: number;
  meanErrorWorldUnits?: number;
  maximumCpuMagnitude?: number;
  maximumGpuMagnitude?: number;
  nonZeroGpuSampleCount?: number;
  diagnosticSample?: {
    cpu: AgentGalaxyVector3;
    gpu: AgentGalaxyVector3;
  };
  reason?: string;
};

type FocusFieldParitySample = {
  semanticRelative: AgentGalaxyVector3;
  targetTangent: AgentGalaxyVector3;
  radius: number;
  fieldBlend: number;
  seed: number;
};

function createDeterministicSamples() {
  const samples: FocusFieldParitySample[] = [];
  let state = 0x6d2b79f5;
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296;
  };

  for (
    let index = 0;
    index < AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_SAMPLE_COUNT;
    index += 1
  ) {
    const radius = 5 + next() * 7;
    const distance = index % 17 === 0
      ? 0
      : radius * (0.04 + next() * 1.02);
    const azimuth = next() * Math.PI * 2;
    const elevation = (next() - 0.5) * Math.PI;
    const horizontal = Math.cos(elevation);
    const semanticRelative: AgentGalaxyVector3 = [
      Math.cos(azimuth) * horizontal * distance,
      Math.sin(elevation) * distance,
      Math.sin(azimuth) * horizontal * distance,
    ];
    const tangentAzimuth = next() * Math.PI * 2;
    const tangentElevation = (next() - 0.5) * Math.PI;
    const tangentHorizontal = Math.cos(tangentElevation);
    const targetTangent: AgentGalaxyVector3 = index % 23 === 0
      ? [0, 0, 0]
      : [
        Math.cos(tangentAzimuth) * tangentHorizontal,
        Math.sin(tangentElevation),
        Math.sin(tangentAzimuth) * tangentHorizontal,
      ];
    samples.push({
      semanticRelative,
      targetTangent,
      radius,
      fieldBlend: index % 19 === 0 ? 0 : next(),
      seed: next(),
    });
  }
  return samples;
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
    const reason = gl.getShaderInfoLog(shader)?.trim()
      || `${label}:compile-failed`;
    gl.deleteShader(shader);
    throw new Error(`${label}:${reason}`);
  }
  return shader;
}

function createAttributeBuffer(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  values: Float32Array,
  size: number,
) {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) throw new Error(`attribute-missing:${name}`);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error(`buffer-create-failed:${name}`);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  return buffer;
}

function flattenVectors(values: readonly AgentGalaxyVector3[]) {
  const result = new Float32Array(values.length * 3);
  values.forEach((value, index) => {
    result[index * 3] = value[0];
    result[index * 3 + 1] = value[1];
    result[index * 3 + 2] = value[2];
  });
  return result;
}

function flattenScalars(values: readonly number[]) {
  return new Float32Array(values);
}

function result(
  status: AgentGalaxyFocusFieldGpuParityResult["status"],
  reason?: string,
): AgentGalaxyFocusFieldGpuParityResult {
  return {
    status,
    sampleVersion: AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_SAMPLE_VERSION,
    sampleCount: 0,
    toleranceWorldUnits:
      AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_TOLERANCE,
    reason,
  };
}

export function runAgentGalaxyFocusFieldGpuParityAudit():
AgentGalaxyFocusFieldGpuParityResult {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  });
  if (!gl) return result("UNVERIFIED", "webgl2-unavailable");

  const samples = createDeterministicSamples();
  const vertexSource = `#version 300 es
    precision highp float;
    in vec3 aSemanticRelative;
    in vec3 aTargetTangent;
    in float aRadius;
    in float aFieldBlend;
    in float aSeed;
    ${AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK}
    out vec3 vAuditOffset;

    void main() {
      vAuditOffset = agentGalaxyFocusFieldOffset(
        aSemanticRelative,
        aTargetTangent,
        aRadius,
        aFieldBlend,
        aSeed
      ).xyz;
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

  const resources: Array<
    WebGLShader
    | WebGLProgram
    | WebGLBuffer
    | WebGLVertexArrayObject
    | WebGLTransformFeedback
  > = [];
  try {
    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      vertexSource,
      "focus-field-vertex",
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource,
      "focus-field-fragment",
    );
    resources.push(vertexShader, fragmentShader);
    const program = gl.createProgram();
    if (!program) throw new Error("program-create-failed");
    resources.push(program);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.transformFeedbackVaryings(
      program,
      ["vAuditOffset"],
      gl.SEPARATE_ATTRIBS,
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        gl.getProgramInfoLog(program)?.trim() || "program-link-failed",
      );
    }
    const varying = gl.getTransformFeedbackVarying(program, 0);
    if (
      gl.getProgramParameter(program, gl.TRANSFORM_FEEDBACK_VARYINGS) !== 1
      || !varying
      || varying.name !== "vAuditOffset"
      || varying.type !== gl.FLOAT_VEC3
      || varying.size !== 1
    ) {
      throw new Error("transform-feedback-layout-invalid");
    }
    gl.useProgram(program);

    const vertexArray = gl.createVertexArray();
    if (!vertexArray) throw new Error("vertex-array-create-failed");
    resources.push(vertexArray);
    gl.bindVertexArray(vertexArray);
    resources.push(
      createAttributeBuffer(
        gl,
        program,
        "aSemanticRelative",
        flattenVectors(samples.map((sample) => sample.semanticRelative)),
        3,
      ),
      createAttributeBuffer(
        gl,
        program,
        "aTargetTangent",
        flattenVectors(samples.map((sample) => sample.targetTangent)),
        3,
      ),
      createAttributeBuffer(
        gl,
        program,
        "aRadius",
        flattenScalars(samples.map((sample) => sample.radius)),
        1,
      ),
      createAttributeBuffer(
        gl,
        program,
        "aFieldBlend",
        flattenScalars(samples.map((sample) => sample.fieldBlend)),
        1,
      ),
      createAttributeBuffer(
        gl,
        program,
        "aSeed",
        flattenScalars(samples.map((sample) => sample.seed)),
        1,
      ),
    );

    const outputBuffer = gl.createBuffer();
    const transformFeedback = gl.createTransformFeedback();
    if (!outputBuffer || !transformFeedback) {
      throw new Error("transform-feedback-create-failed");
    }
    resources.push(outputBuffer, transformFeedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, outputBuffer);
    gl.bufferData(
      gl.TRANSFORM_FEEDBACK_BUFFER,
      samples.length * 3 * Float32Array.BYTES_PER_ELEMENT,
      gl.DYNAMIC_COPY,
    );
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transformFeedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, outputBuffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, samples.length);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    const gpu = new Float32Array(samples.length * 3);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, outputBuffer);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, gpu);

    let maximumError = 0;
    let totalError = 0;
    let maximumCpuMagnitude = 0;
    let maximumGpuMagnitude = 0;
    let nonZeroGpuSampleCount = 0;
    let diagnosticSample:
      AgentGalaxyFocusFieldGpuParityResult["diagnosticSample"];
    samples.forEach((sample, index) => {
      const cpu = sampleAgentGalaxyFocusFieldOffset(
        sample.semanticRelative,
        sample.targetTangent,
        sample.radius,
        sample.fieldBlend,
        sample.seed,
      );
      const offset = index * 3;
      const gpuOffset: AgentGalaxyVector3 = [
        gpu[offset],
        gpu[offset + 1],
        gpu[offset + 2],
      ];
      const cpuMagnitude = Math.hypot(...cpu.offset);
      const gpuMagnitude = Math.hypot(...gpuOffset);
      const error = Math.hypot(
        gpuOffset[0] - cpu.offset[0],
        gpuOffset[1] - cpu.offset[1],
        gpuOffset[2] - cpu.offset[2],
      );
      maximumCpuMagnitude = Math.max(maximumCpuMagnitude, cpuMagnitude);
      maximumGpuMagnitude = Math.max(maximumGpuMagnitude, gpuMagnitude);
      if (gpuMagnitude > 1e-8) nonZeroGpuSampleCount += 1;
      if (!diagnosticSample && error > 1e-3) {
        diagnosticSample = {
          cpu: [...cpu.offset],
          gpu: gpuOffset,
        };
      }
      maximumError = Math.max(maximumError, error);
      totalError += error;
    });

    return {
      status: maximumError
        <= AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_TOLERANCE
        ? "PASS"
        : "FAIL",
      sampleVersion: AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_SAMPLE_VERSION,
      sampleCount: samples.length,
      toleranceWorldUnits:
        AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_TOLERANCE,
      maximumErrorWorldUnits: maximumError,
      meanErrorWorldUnits: totalError / samples.length,
      maximumCpuMagnitude,
      maximumGpuMagnitude,
      nonZeroGpuSampleCount,
      diagnosticSample,
      reason: maximumError
        <= AGENT_GALAXY_FOCUS_FIELD_GPU_PARITY_TOLERANCE
        ? undefined
        : `maximum-error:${maximumError}`,
    };
  } catch (reasonValue) {
    return result(
      "FAIL",
      reasonValue instanceof Error ? reasonValue.message : String(reasonValue),
    );
  } finally {
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    for (const resource of resources.reverse()) {
      if (resource instanceof WebGLShader) gl.deleteShader(resource);
      else if (resource instanceof WebGLProgram) gl.deleteProgram(resource);
      else if (resource instanceof WebGLBuffer) gl.deleteBuffer(resource);
      else if (resource instanceof WebGLVertexArrayObject) {
        gl.deleteVertexArray(resource);
      } else if (resource instanceof WebGLTransformFeedback) {
        gl.deleteTransformFeedback(resource);
      }
    }
  }
}
