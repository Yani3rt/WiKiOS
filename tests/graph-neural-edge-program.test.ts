import { describe, expect, it } from "vitest";
import {
  clearGraphNeuralRendererAnimationState,
  getGraphNeuralRendererAnimationState,
  NeuralEdgeProgram,
  NEURAL_EDGE_FRAGMENT_SHADER,
  NEURAL_EDGE_VERTEX_SHADER,
  NEURAL_ARROW_VERTEX_SHADER,
  NEURAL_ARROW_FRAGMENT_SHADER,
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
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("vec4(shimmerColor * alpha, alpha)");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).not.toContain(
      "gl_FragColor = vec4(v_color.rgb, alpha)",
    );
  });

  it("squares Gaussian deltas without WebGL 1-undefined negative-base pow", () => {
    expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain("primaryDelta * primaryDelta");
    expect(NEURAL_EDGE_FRAGMENT_SHADER).not.toContain("echoHead");
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

// Execute the actual trace branch's GLSL scalar math against path sample positions.
function sampleTrace(mode:number,signal:number,path:number,elapsed=0) {
  const body=NEURAL_EDGE_FRAGMENT_SHADER.split('if (u_mode > 1.5) {')[1].split('float alpha')[0];
  const evaluate=new Function('u_mode','v_delayMs','v_pathPosition','u_elapsedMs','clamp','smoothstep',
    body.replace(/\bfloat\b/g,'let')+'\nreturn trace;');
  return evaluate(mode,signal,path,elapsed,
    (n:number,a:number,b:number)=>Math.max(a,Math.min(b,n)),
    (a:number,b:number,n:number)=>{const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t);}) as number;
}
it('draws only the disclosed source-to-target portion without applying entrance easing twice',()=>{
  expect(sampleTrace(3,0,.01)).toBe(0);
  expect(sampleTrace(3,.5,.25)).toBe(1);
  expect(sampleTrace(3,.5,.75)).toBe(0);
  expect(sampleTrace(3,1,1)).toBe(1);
  expect(sampleTrace(2,0,.8,400)).toBe(1); // entrance still eases halfway travel to.875
  expect(sampleTrace(2,0,.9,400)).toBe(0);
});
it('packs normalized disclosure progress into the existing signal slot without adding attributes',()=>{
  const program=Object.create(NeuralEdgeProgram.prototype) as NeuralEdgeProgram;
  program.array=new Float32Array(9);
  const source={x:0,y:0},target={x:10,y:0};
  const draw=(data:Record<string,unknown>)=>program.processVisibleItem(1,0,
    source as Parameters<typeof program.processVisibleItem>[2],target as Parameters<typeof program.processVisibleItem>[3],
    {color:'#abcdef',size:1,...data} as Parameters<typeof program.processVisibleItem>[4]);
  draw({neuralDelayMs:160,neuralRevealProgress:.4});expect(program.array[8]).toBeCloseTo(.4);
  draw({neuralDelayMs:-161});expect(program.array[8]).toBe(-161);
  const definition=program.getDefinition();
  expect(definition.ATTRIBUTES.length+definition.CONSTANT_ATTRIBUTES.length).toBeLessThanOrEqual(8);
});

it('retains an in-flight entrance trace direction when disclosure takes ownership',()=>{
  const program=Object.create(NeuralEdgeProgram.prototype) as NeuralEdgeProgram;
  program.array=new Float32Array(9);
  program.processVisibleItem(1,0,
    {x:0,y:0} as Parameters<typeof program.processVisibleItem>[2],
    {x:10,y:0} as Parameters<typeof program.processVisibleItem>[3],
    {color:'#abcdef',size:1,neuralRevealProgress:.4,neuralRevealReversed:true} as Parameters<typeof program.processVisibleItem>[4]);
  expect(program.array[8]).toBeCloseTo(-1.4);
  expect(sampleTrace(3,program.array[8],.8)).toBe(1);
  expect(sampleTrace(3,program.array[8],.2)).toBe(0);
});

describe('traveling arrowheads', () => {
  it('shares the signal clock and interpolates source to target without looping', () => {
    expect(NEURAL_ARROW_VERTEX_SHADER).toContain('u_elapsedMs - travelStart');
    expect(NEURAL_ARROW_VERTEX_SHADER).toContain('mix(a_positionStart, a_positionEnd, progress)');
    expect(NEURAL_ARROW_VERTEX_SHADER).not.toContain('mod(');
  });
  it('preserves reduced-motion direction and leaves picking to the line', () => {
    expect(NEURAL_ARROW_VERTEX_SHADER).toContain('u_reducedMotion > 0.5');
    expect(NEURAL_ARROW_FRAGMENT_SHADER).toContain('discard;');
    expect(NEURAL_ARROW_FRAGMENT_SHADER).toContain('v_color.rgb * alpha');
  });
});


// Run the emitted GLSL clock arithmetic, not a second implementation of the timing.
function sampleArrow(elapsedMs: number, reducedMotion = false, delayMs = 0) {
  const clock = NEURAL_ARROW_VERTEX_SHADER.split('void main() {')[1].split('float normalLength')[0];
  const evaluate = new Function('u_elapsedMs', 'u_reducedMotion', 'a_delayMs', 'clamp', 'smoothstep', 'min', 'mix',
    clock.replace(/\bfloat\b/g, 'let') + '\nreturn {progress, opacity};');
  return evaluate(elapsedMs, reducedMotion ? 1 : 0, delayMs,
    (value: number, start: number, end: number) => Math.max(start, Math.min(end, value)),
    (start: number, end: number, value: number) => {
      const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
      return t * t * (3 - 2 * t);
    }, Math.min, (start: number, end: number, progress: number) => start + (end - start) * progress,
  ) as {progress: number; opacity: number};
}

it('moves one arrow toward its target and retains a static direction cue after arrival', () => {
  expect(sampleArrow(0).opacity).toBe(0);
  const early = sampleArrow(400);
  const later = sampleArrow(700);
  expect(early.opacity).toBeGreaterThan(0.5);
  expect(later.progress).toBeGreaterThan(early.progress);
  expect(sampleArrow(2000).progress).toBeCloseTo(0.90);
  expect(sampleArrow(2000).opacity).toBeGreaterThanOrEqual(0.6);
  expect(sampleArrow(20000)).toEqual(sampleArrow(2000));
  expect(sampleArrow(0, true)).toEqual(sampleArrow(2000));
});

it('keeps incoming arrow direction at its true target while the recall light travels outward',()=>{
  expect(sampleArrow(400,false,-21).progress).toBeCloseTo(.90);
  expect(sampleArrow(600,false,-21).progress).toBeCloseTo(.90);
  expect(NEURAL_EDGE_FRAGMENT_SHADER).toContain('(pathPosition - primaryProgress)');
});
