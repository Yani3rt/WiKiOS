import { describe, expect, it } from "vitest";
import {
  clearGraphNeuralRendererAnimationState,
  getGraphNeuralRendererAnimationState,
  NeuralEdgeProgram,
  NEURAL_EDGE_FRAGMENT_SHADER,
  NEURAL_EDGE_VERTEX_SHADER,
  setGraphNeuralRendererAnimationState,
} from "../src/client/graph-neural-edge-program";

describe("neural edge WebGL program", () => {
  it("passes path position and signal data from vertices to fragments", () => {
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("a_delayMs");
    expect(NEURAL_EDGE_VERTEX_SHADER).toContain("v_pathPosition");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("u_elapsedMs");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("u_mode");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("u_releaseOpacity");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("smoothstep");
  });

  it("keeps picking output independent from decorative glow", () => {
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("#ifdef PICKING_MODE");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("gl_FragColor = v_color");
  });

  it("premultiplies normal output for Sigma's ONE blend function", () => {
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain(
      "gl_FragColor = vec4(v_color.rgb * alpha, alpha)",
    );
    expect(NEURAL_EDGE_FRAGMENT_SHADER).not.toContain(
      "gl_FragColor = vec4(v_color.rgb, alpha)",
    );
  });

  it("squares Gaussian deltas without WebGL 1-undefined negative-base pow", () => {
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("primaryDelta * primaryDelta");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("echoDelta * echoDelta");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).not.toContain("pow(");
  });

  it("packs neural signals within the WebGL 1 vertex attribute limit", () => {
    const definition = NeuralEdgeProgram.prototype.getDefinition();

    expect(definition.ATTRIBUTES).toContainEqual({
      name: "a_delayMs",
      size: 1,
      type: 0x1406,
    });
    expect(definition.ATTRIBUTES.length + definition.CONSTANT_ATTRIBUTES.length).toBeLessThanOrEqual(
      8,
    );
  });

  it("isolates shader clocks per renderer and clears them during teardown", () => {
    const firstRenderer = {};
    const secondRenderer = {};

    setGraphNeuralRendererAnimationState(firstRenderer, {
      elapsedMs: 180,
      mode: "hover",
      releaseOpacity: 0.75,
      reducedMotion: false,
    });
    setGraphNeuralRendererAnimationState(secondRenderer, {
      elapsedMs: 640,
      mode: "selection",
      releaseOpacity: 1,
      reducedMotion: true,
    });

    expect(getGraphNeuralRendererAnimationState(firstRenderer)).toMatchObject({
      elapsedMs: 180,
      mode: "hover",
    });
    expect(getGraphNeuralRendererAnimationState(secondRenderer)).toMatchObject({
      elapsedMs: 640,
      mode: "selection",
    });

    clearGraphNeuralRendererAnimationState(firstRenderer);
    expect(getGraphNeuralRendererAnimationState(firstRenderer)).toBeNull();
    expect(getGraphNeuralRendererAnimationState(secondRenderer)?.elapsedMs).toBe(640);
  });
});
