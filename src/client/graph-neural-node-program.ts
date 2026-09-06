import type { NodeCircleProgram as CircleProgram } from 'sigma/rendering';

export const NEURAL_NODE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
uniform float u_correctionRatio;
void main() {
  float radius = max(v_radius, 0.001);
  float d = length(v_diffVector) / radius;
  #ifdef PICKING_MODE
    if (d > 1.0) discard;
    gl_FragColor = v_color;
  #else
    float feather = min(0.18, u_correctionRatio / radius);
    float core = 1.0 - smoothstep(0.40 - feather, 0.40 + feather, d);
    float halo = (1.0 - smoothstep(0.35, 1.0, d)) * 0.20;
    float alpha = max(core, halo) * v_color.a;
    vec3 color = mix(v_color.rgb, vec3(1.0), (1.0 - smoothstep(0.0, 0.34, d)) * 0.22);
    gl_FragColor = vec4(color * alpha, alpha);
  #endif
}
`;

export function createNeuralNodeProgram(Base: typeof CircleProgram) {
  return class NeuralNodeProgram extends Base {
    getDefinition() {
      return { ...super.getDefinition(), FRAGMENT_SHADER_SOURCE: NEURAL_NODE_FRAGMENT_SHADER };
    }
  };
}
