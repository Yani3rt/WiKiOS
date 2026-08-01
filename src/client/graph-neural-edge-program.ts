import type { EdgeProgram as SigmaEdgeProgram, ProgramInfo } from "sigma/rendering";
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";

import {
  GRAPH_NEURAL_TIMING,
  type GraphNeuralActivationMode,
} from "./graph-overview-model";

type EdgeProgramConstructor = typeof SigmaEdgeProgram;

const EdgeProgram = (
  typeof document === "undefined"
    ? class {}
    : (await import("sigma/rendering")).EdgeProgram
) as EdgeProgramConstructor;

const FLOAT = 0x1406;
const UNSIGNED_BYTE = 0x1401;

const UNIFORMS = [
  "u_matrix",
  "u_zoomRatio",
  "u_sizeRatio",
  "u_pixelRatio",
  "u_correctionRatio",
  "u_minEdgeThickness",
  "u_feather",
  "u_elapsedMs",
  "u_mode",
  "u_releaseOpacity",
  "u_reducedMotion",
] as const;

const ATTRIBUTES = [
  { name: "a_positionStart", size: 2, type: FLOAT },
  { name: "a_positionEnd", size: 2, type: FLOAT },
  { name: "a_normal", size: 2, type: FLOAT },
  { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
  { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
  { name: "a_delayMs", size: 1, type: FLOAT },
];

const CONSTANT_ATTRIBUTES = [
  { name: "a_positionCoef", size: 1, type: FLOAT },
  { name: "a_normalCoef", size: 1, type: FLOAT },
];

export const NEURAL_EDGE_VERTEX_SHADER = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;
attribute float a_delayMs;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
varying float v_pathPosition;
varying float v_delayMs;

const float bias = 255.0 / 254.0;

void main() {
  vec2 normal = a_normal * a_normalCoef;
  vec2 position = mix(a_positionStart, a_positionEnd, a_positionCoef);
  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;
  if (normalLength <= 0.0) unitNormal = normal;

  float pixelsThickness = max(normalLength, u_minEdgeThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  gl_Position = vec4(
    (u_matrix * vec3(position + unitNormal * webGLThickness, 1.0)).xy,
    0.0,
    1.0
  );

  v_thickness = webGLThickness / u_zoomRatio;
  v_normal = unitNormal;
  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;
  v_pathPosition = a_positionCoef;
  v_delayMs = a_delayMs;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

export const NEURAL_EDGE_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
varying float v_pathPosition;
varying float v_delayMs;

uniform float u_elapsedMs;
uniform float u_mode;
uniform float u_releaseOpacity;
uniform float u_reducedMotion;

void main(void) {
  #ifdef PICKING_MODE
  gl_FragColor = v_color;
  #else
  float crossDistance = length(v_normal) * v_thickness;
  float edgeMask = 1.0 - smoothstep(v_thickness - v_feather, v_thickness, crossDistance);
  float selectionMode = step(0.5, u_mode);
  float staticMode = step(0.5, u_reducedMotion);
  float travelMs = mix(
    ${GRAPH_NEURAL_TIMING.hoverTravelMs.toFixed(1)},
    ${GRAPH_NEURAL_TIMING.selectionTravelMs.toFixed(1)},
    selectionMode
  );
  float travelStart =
    ${GRAPH_NEURAL_TIMING.chargeMs.toFixed(1)} +
    ${GRAPH_NEURAL_TIMING.ignitionMs.toFixed(1)} +
    v_delayMs;
  float primaryRaw = (u_elapsedMs - travelStart) / travelMs;
  float primaryProgress = clamp(primaryRaw, 0.0, 1.0);
  float primaryActive =
    step(0.0, primaryRaw) *
    (1.0 - step(1.0, primaryRaw)) *
    (1.0 - staticMode);
  float primaryVisibility = 1.0 - smoothstep(0.9, 1.0, primaryProgress);
  float primaryDelta = (v_pathPosition - primaryProgress) / 0.045;
  float primaryHead =
    exp(-(primaryDelta * primaryDelta)) * primaryActive * primaryVisibility;
  float primaryTail =
    smoothstep(primaryProgress - 0.16, primaryProgress, v_pathPosition) *
    (1.0 - step(primaryProgress, v_pathPosition)) *
    primaryActive *
    primaryVisibility;
  float echoRaw =
    (u_elapsedMs - travelStart - ${GRAPH_NEURAL_TIMING.echoDelayMs.toFixed(1)}) /
    travelMs;
  float echoProgress = clamp(echoRaw, 0.0, 1.0);
  float echoActive =
    selectionMode *
    step(0.0, echoRaw) *
    (1.0 - step(1.0, echoRaw)) *
    (1.0 - staticMode);
  float echoVisibility = 1.0 - smoothstep(0.9, 1.0, echoProgress);
  float echoDelta = (v_pathPosition - echoProgress) / 0.055;
  float echoHead =
    exp(-(echoDelta * echoDelta)) * echoActive * echoVisibility * 0.55;
  float ignitionProgress = clamp(
    (u_elapsedMs - ${GRAPH_NEURAL_TIMING.chargeMs.toFixed(1)}) /
      ${GRAPH_NEURAL_TIMING.ignitionMs.toFixed(1)},
    0.0,
    1.0
  );
  float targetIntensity = mix(0.7, 1.0, selectionMode);
  float edgeIntensity = targetIntensity * ignitionProgress;
  float hoverSettle =
    (1.0 - selectionMode) *
    smoothstep(
      travelStart + travelMs - ${GRAPH_NEURAL_TIMING.arrivalMs.toFixed(1)},
      travelStart + travelMs,
      u_elapsedMs
    );
  edgeIntensity -= hoverSettle * 0.25;
  edgeIntensity = mix(edgeIntensity, 1.0, staticMode);
  ignitionProgress = mix(ignitionProgress, 1.0, staticMode);
  float filament = 0.28 * ignitionProgress + 0.32 * edgeIntensity;
  float energy = max(primaryHead, max(primaryTail * 0.62, echoHead));
  float alpha =
    edgeMask *
    clamp(filament + energy, 0.0, 1.0) *
    v_color.a *
    clamp(u_releaseOpacity, 0.0, 1.0);
  gl_FragColor = vec4(v_color.rgb * alpha, alpha);
  #endif
}
`;

export interface GraphNeuralRendererAnimationState {
  elapsedMs: number;
  mode: GraphNeuralActivationMode;
  releaseOpacity: number;
  reducedMotion: boolean;
}

const graphNeuralRendererAnimationStates = new WeakMap<
  object,
  Readonly<GraphNeuralRendererAnimationState>
>();

export function setGraphNeuralRendererAnimationState(
  renderer: object,
  state: GraphNeuralRendererAnimationState,
) {
  graphNeuralRendererAnimationStates.set(
    renderer,
    Object.freeze({
      ...state,
      elapsedMs: Math.max(0, state.elapsedMs),
      releaseOpacity: Math.max(0, Math.min(1, state.releaseOpacity)),
    }),
  );
}

export function getGraphNeuralRendererAnimationState(
  renderer: object,
): Readonly<GraphNeuralRendererAnimationState> | null {
  return graphNeuralRendererAnimationStates.get(renderer) ?? null;
}

export function clearGraphNeuralRendererAnimationState(renderer: object) {
  graphNeuralRendererAnimationStates.delete(renderer);
}

export interface NeuralEdgeDisplayData extends EdgeDisplayData {
  neuralDelayMs?: number;
}

type NeuralEdgeUniform = (typeof UNIFORMS)[number];

export class NeuralEdgeProgram extends EdgeProgram<NeuralEdgeUniform> {
  getDefinition() {
    return {
      VERTICES: 6,
      VERTEX_SHADER_SOURCE: NEURAL_EDGE_VERTEX_SHADER,
      FRAGMENT_SHADER_SOURCE: NEURAL_EDGE_FRAGMENT_SHADER,
      METHOD: 0x0004,
      UNIFORMS,
      ATTRIBUTES,
      CONSTANT_ATTRIBUTES,
      CONSTANT_DATA: [
        [0, 1],
        [0, -1],
        [1, 1],
        [1, 1],
        [0, -1],
        [1, -1],
      ],
    };
  }

  processVisibleItem(
    edgeIndex: number,
    startIndex: number,
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: NeuralEdgeDisplayData,
  ) {
    const thickness = data.size || 1;
    const dx = targetData.x - sourceData.x;
    const dy = targetData.y - sourceData.y;
    const squaredLength = dx * dx + dy * dy;
    let normalX = 0;
    let normalY = 0;

    if (squaredLength) {
      const inverseLength = 1 / Math.sqrt(squaredLength);
      normalX = -dy * inverseLength * thickness;
      normalY = dx * inverseLength * thickness;
    }

    const array = this.array;
    array[startIndex++] = sourceData.x;
    array[startIndex++] = sourceData.y;
    array[startIndex++] = targetData.x;
    array[startIndex++] = targetData.y;
    array[startIndex++] = normalX;
    array[startIndex++] = normalY;
    array[startIndex++] = floatColor(data.color);
    array[startIndex++] = edgeIndex;
    array[startIndex] = data.neuralDelayMs ?? 0;
  }

  setUniforms(params: RenderParams, programInfo: ProgramInfo<NeuralEdgeUniform>) {
    const { gl, uniformLocations, isPicking } = programInfo;
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    gl.uniform1f(uniformLocations.u_zoomRatio, params.zoomRatio);
    gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
    gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
    gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
    gl.uniform1f(uniformLocations.u_feather, params.antiAliasingFeather);
    gl.uniform1f(uniformLocations.u_minEdgeThickness, params.minEdgeThickness);
    if (isPicking) return;

    const animationState = getGraphNeuralRendererAnimationState(this.renderer);
    gl.uniform1f(uniformLocations.u_elapsedMs, animationState?.elapsedMs ?? 0);
    gl.uniform1f(
      uniformLocations.u_mode,
      animationState?.mode === "selection" ? 1 : 0,
    );
    gl.uniform1f(uniformLocations.u_releaseOpacity, animationState?.releaseOpacity ?? 0);
    gl.uniform1f(uniformLocations.u_reducedMotion, animationState?.reducedMotion ? 1 : 0);
  }
}
