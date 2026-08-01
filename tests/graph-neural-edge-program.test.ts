import { describe, expect, it } from "vitest";
import {
  NeuralEdgeProgram,
  NEURAL_EDGE_FRAGMENT_SHADER,
  NEURAL_EDGE_VERTEX_SHADER,
} from "../src/client/graph-neural-edge-program";

describe("neural edge WebGL program", () => {
  it("passes path position and signal data from vertices to fragments", () => {
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("a_primaryProgress");
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("a_echoProgress");
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("a_intensity");
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("v_pathPosition");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("v_primaryProgress");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("v_echoProgress");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("smoothstep");
  });

  it("keeps picking output independent from decorative glow", () => {
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("#ifdef PICKING_MODE");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("gl_FragColor = v_color");
  });

  it("packs neural signals within the WebGL 1 vertex attribute limit", () => {
    const definition = NeuralEdgeProgram.prototype.getDefinition();

    expect(definition.ATTRIBUTES).toContainEqual({
      name: "a_signal",
      size: 3,
      type: 0x1406,
    });
    expect(definition.ATTRIBUTES.length + definition.CONSTANT_ATTRIBUTES.length).toBeLessThanOrEqual(
      8,
    );
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("float a_primaryProgress = a_signal.x");
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("float a_echoProgress = a_signal.y");
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("float a_intensity = a_signal.z");
  });
});
