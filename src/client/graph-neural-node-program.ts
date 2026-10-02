import type { NodeCircleProgram as CircleProgram } from 'sigma/rendering';

function createNodeFragmentShader(mode: "light" | "dark") {
  return /* glsl */ `
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
    float feather = min(0.08, u_correctionRatio / radius);
    float core = 1.0 - smoothstep(0.60 - feather, 0.60 + feather, d);
    float halo = ${mode === "dark" ? "(1.0 - smoothstep(0.52, 1.0, d)) * 0.10" : "0.0"};
    float alpha = max(core, halo) * v_color.a;
    gl_FragColor = vec4(v_color.rgb * alpha, alpha);
  #endif
}
`;
}

export function createNeuralNodeProgram(Base: typeof CircleProgram, mode: "light" | "dark") {
  const fragmentShader = createNodeFragmentShader(mode);
  return class NeuralNodeProgram extends Base {
    getDefinition() {
      return { ...super.getDefinition(), FRAGMENT_SHADER_SOURCE: fragmentShader };
    }
  };
}
