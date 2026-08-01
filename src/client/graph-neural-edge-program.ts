import type { EdgeProgram as SigmaEdgeProgram, ProgramInfo } from "sigma/rendering";
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";

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
] as const;

const ATTRIBUTES = [
  { name: "a_positionStart", size: 2, type: FLOAT },
  { name: "a_positionEnd", size: 2, type: FLOAT },
  { name: "a_normal", size: 2, type: FLOAT },
  { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
  { name: "a_id", size: 4, type: UNSIGNED_BYTE, normalized: true },
  { name: "a_primaryProgress", size: 1, type: FLOAT },
  { name: "a_echoProgress", size: 1, type: FLOAT },
  { name: "a_intensity", size: 1, type: FLOAT },
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
attribute float a_primaryProgress;
attribute float a_echoProgress;
attribute float a_intensity;

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
varying float v_primaryProgress;
varying float v_echoProgress;
varying float v_intensity;

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
  v_primaryProgress = a_primaryProgress;
  v_echoProgress = a_echoProgress;
  v_intensity = a_intensity;

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
varying float v_primaryProgress;
varying float v_echoProgress;
varying float v_intensity;

void main(void) {
  #ifdef PICKING_MODE
  gl_FragColor = v_color;
  #else
  float crossDistance = length(v_normal) * v_thickness;
  float edgeMask = 1.0 - smoothstep(v_thickness - v_feather, v_thickness, crossDistance);
  float primaryHead = exp(-pow((v_pathPosition - v_primaryProgress) / 0.045, 2.0));
  float primaryTail =
    smoothstep(v_primaryProgress - 0.16, v_primaryProgress, v_pathPosition) *
    (1.0 - step(v_primaryProgress, v_pathPosition));
  float echoHead = exp(-pow((v_pathPosition - v_echoProgress) / 0.055, 2.0)) * 0.55;
  float filament = 0.28 + 0.32 * v_intensity;
  float energy = max(primaryHead, max(primaryTail * 0.62, echoHead));
  float alpha = edgeMask * clamp(filament + energy, 0.0, 1.0) * v_color.a;
  gl_FragColor = vec4(v_color.rgb, alpha);
  #endif
}
`;

export interface NeuralEdgeDisplayData extends EdgeDisplayData {
  neuralPrimaryProgress?: number;
  neuralEchoProgress?: number;
  neuralIntensity?: number;
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
    array[startIndex++] = data.neuralPrimaryProgress ?? -1;
    array[startIndex++] = data.neuralEchoProgress ?? -1;
    array[startIndex] = data.neuralIntensity ?? 0;
  }

  setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo<NeuralEdgeUniform>) {
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
    gl.uniform1f(uniformLocations.u_zoomRatio, params.zoomRatio);
    gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
    gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
    gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
    gl.uniform1f(uniformLocations.u_feather, params.antiAliasingFeather);
    gl.uniform1f(uniformLocations.u_minEdgeThickness, params.minEdgeThickness);
  }
}
