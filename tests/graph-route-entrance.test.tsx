// @vitest-environment jsdom
// Camera interpolation is covered against real Sigma in graph-motion-camera.test.ts.
vi.mock("../src/client/graph-motion-camera", () => ({ GraphMotionCamera: class {
  setReducedMotion() {} destroy() {}
} }));
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type Graph from "graphology";
import type { Attributes } from "graphology-types";
import type { CameraState } from "sigma/types";
import type { NodeLabelDrawingFunction } from "sigma/rendering";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppearanceProvider } from "../src/client/appearance-provider";
import { Component } from "../src/client/routes/graph-route";
import { getGraphNeuralRendererAnimationState } from "../src/client/graph-neural-edge-program";
import { graphTopologyKey, graphViewCache } from "../src/client/graph-view-state";
import type { ColoredGraphData } from "../src/lib/wiki-shared";

type Settings = {
  defaultDrawNodeLabel: NodeLabelDrawingFunction;
  edgeReducer(edge: string, attributes: Attributes): Attributes;
  nodeReducer(node: string, attributes: Attributes): Attributes;
};
type RefreshOptions = { partialGraph?: { nodes?: string[]; edges?: string[] } };
type Frame = {
  edges: Attributes[];
  nodes: Attributes[];
  clock: ReturnType<typeof getGraphNeuralRendererAnimationState>;
};
const { renderers } = vi.hoisted(() => ({ renderers: [] as Renderer[] }));

// WebGL is unavailable in jsdom. Record the real route's reducer output and
// shader clock at Sigma's synchronous first render and subsequent refreshes.
class Renderer {
  frames: Frame[] = [];
  edges = new Map<string, Attributes>();
  nodes = new Map<string, Attributes>();
  listeners = new Map<string, (payload: unknown) => void>();
  cameraListeners = new Set<() => void>();
  dimensions = { width: 1200, height: 800 };
  camera = {
    state: { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
    getState: (): CameraState => this.camera.state,
    setState: (state: Partial<CameraState>) => { Object.assign(this.camera.state, state); for (const cb of this.cameraListeners) cb(); },
    animate: vi.fn(async (state: Partial<CameraState>) => { this.camera.setState(state); }),
    isAnimated: () => false,
    on: (_event: string, callback: () => void) => {this.cameraListeners.add(callback);},
    off: (_event: string, callback: () => void) => {this.cameraListeners.delete(callback);},
  };
  constructor(public graph: Graph, _container: HTMLElement, public settings: Settings) {
    renderers.push(this);
    this.refresh();
  }
  refresh(options?: RefreshOptions) {
    for (const node of options?.partialGraph ? options.partialGraph.nodes ?? [] : this.graph.nodes()) {
      this.nodes.set(node, this.settings.nodeReducer(node, this.graph.getNodeAttributes(node)));
    }
    for (const edge of options?.partialGraph ? options.partialGraph.edges ?? [] : this.graph.edges()) {
      this.edges.set(edge, this.settings.edgeReducer(edge, this.graph.getEdgeAttributes(edge)));
    }
    this.frames.push({
      nodes: [...this.nodes.values()], edges: [...this.edges.values()],
      clock: getGraphNeuralRendererAnimationState(this),
    });
  }
  setSettings(settings: Partial<Settings>) { Object.assign(this.settings, settings); }
  getCamera() { return this.camera; }
  setCamera() {}
  getDimensions() { return this.dimensions; }
  getNodeDisplayData(node: string) { const attributes=this.nodes.get(node); return attributes && {...attributes,x:Number(attributes.x)/240+.5,y:Number(attributes.y)/240+.5}; }
  framedGraphToViewport(point: {x:number;y:number}, override?: {cameraState:CameraState}) {
    const state=override?.cameraState ?? this.camera.state;
    return {x:600+(point.x-state.x)*600/state.ratio,y:400-(point.y-state.y)*600/state.ratio};
  }
  viewportToFramedGraph(point: {x:number;y:number}, override?: {cameraState:CameraState}) {
    const state=override?.cameraState ?? this.camera.state;
    return {x:state.x+(point.x-600)*state.ratio/600,y:state.y-(point.y-400)*state.ratio/600};
  }
  scaleSize(size: number) {return size;}
  on(event: string, callback: (payload: unknown) => void) {this.listeners.set(event,callback);}
  emit(event: string, payload: unknown) {this.listeners.get(event)?.(payload);}
  kill() {}
}
vi.mock("sigma", () => ({ default: class {
  constructor(...args: ConstructorParameters<typeof Renderer>) { return new Renderer(...args); }
} }));
vi.mock("sigma/rendering", () => ({
  EdgeProgram: class {}, NodeCircleProgram: class {}, createEdgeCompoundProgram: () => class {},
}));

let root: Root;
let host: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;
let data: ColoredGraphData;
let time: number;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let completeLayout: () => void;
let reducedMotion: boolean;
let motionChange: () => void;
let resizeGraph: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  time = 0; nextFrame = 0; frames = new Map(); renderers.length = 0; reducedMotion = false;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => frames.delete(handle));
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reducedMotion; },
    addEventListener: (_event: string, listener: () => void) => { motionChange = listener; },
    removeEventListener: () => {},
  }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) {
      if (element.classList.contains("graph-canvas")) resizeGraph = () => this.callback([
        { contentRect: latest().dimensions } as ResizeObserverEntry,
      ], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#223344" }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("Worker", class {
    addEventListener(event: string, listener: (event: { data: { positions: [] } }) => void) {
      if (event === "message") completeLayout = () => listener({ data: { positions: [] } });
    }
    postMessage() {}
    terminate() {}
  });
  data = {
    vaultId: crypto.randomUUID(),
    nodes: ["a", "b", "isolated"].map(slug => ({
      slug, title: slug, categories: [], summary: "", wordCount: 10, backlinkCount: 0,
      neighbors: slug === "isolated" ? [] : [slug === "a" ? "b" : "a"],
    })),
    edges: [{ source: "a", target: "b", weight: 1 }], colorSources: {},
  };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose(); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function mount(strict = false) {
  router = createMemoryRouter([
    { path: "/", element: <h1>Home</h1> },
    { path: "/graph", loader: () => data, Component, HydrateFallback: () => null },
  ], { initialEntries: ["/graph"] });
  const app = <AppearanceProvider initialColorTheme="teal" initialModePreference="light" initialResolvedMode="light">
    <RouterProvider router={router} />
  </AppearanceProvider>;
  await act(async () => root.render(strict ? <StrictMode>{app}</StrictMode> : app));
}
async function tick(elapsed: number) {
  time = elapsed;
  const pending = [...frames.values()]; frames.clear();
  await act(async () => { for (const callback of pending) callback(time); });
}
const latest = () => renderers.at(-1)!;
const frame = () => latest().frames.at(-1)!;
const expectNoUnclockedEntranceEdges = (renderer: Renderer) => {
  for (const frame of renderer.frames) {
    const visible = frame.edges.filter(edge => edge.type === "neural" && !edge.hidden);
    if (visible.length) expect(frame.clock?.mode).toBe("entrance");
  }
};

it("does not flash edges in the synchronous first render or while waiting for layout", async () => {
  await mount();
  expectNoUnclockedEntranceEdges(latest());
  expect(frame().edges[0].hidden).toBe(true);
  await tick(500);
  expect(frame().edges[0].hidden).toBe(true);
  await act(async () => completeLayout());
  await tick(750);
  expect(frame().edges[0].hidden).toBe(false);
  expect(frame().clock).toMatchObject({ mode: "entrance", elapsedMs: 250 });
  expectNoUnclockedEntranceEdges(latest());
  await tick(2500);
  expect(frame().nodes[0].entranceLabelOpacity).toBe(1);
  expect(frame().edges[0].type).not.toBe("neural");
});

it("replays on every Home to Graph visit without losing the cached camera or layout", async () => {
  await mount();
  await act(async () => completeLayout());
  await tick(2000);
  const camera = { x: 0.3, y: 0.7, ratio: 0.8, angle: 0 };
  latest().camera.setState(camera);
  latest().graph.mergeNodeAttributes("a", { x: 12, y: 34 });
  for (let visit = 0; visit < 2; visit++) {
    await act(async () => { await router.navigate("/"); });
    await act(async () => { await router.navigate("/graph"); });
    expect(latest().camera.getState()).toEqual(camera);
    expect(latest().graph.getNodeAttributes("a")).toMatchObject({ x: 12, y: 34 });
    expect(frame().nodes[0].entranceLabelOpacity).toBe(0);
    expect(frame().clock).toMatchObject({ mode: "entrance", elapsedMs: 0 });
    await tick(time + 500);
    expect(frame().edges[0].hidden).toBe(false);
    expect(frame().clock?.elapsedMs).toBe(500);
    await tick(time + 1500);
    expect(frame().nodes[0].entranceLabelOpacity).toBe(1);
  }
});

it("keeps restored selection pulses from replacing the entrance clock", async () => {
  graphViewCache.save(data.vaultId, graphTopologyKey(data), {
    focusedSlug: "a", detailPanelCollapsed: true, activeGroup: null,
    search: { query: "", indexOpen: false, visibleResultCount: 10 }, layoutReady: true,
    positions: {}, camera: { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
  });
  await mount();
  expect(frame().clock?.mode).toBe("entrance");
  await tick(500);
  await tick(1000);
  expectNoUnclockedEntranceEdges(latest());
  expect(frame().nodes[2].hidden).toBe(true);
  await tick(2000);
  expect(frame().nodes[0].entranceLabelOpacity).toBe(1);
  expect(frame().clock?.mode).toBe("selection");
});

it("preserves a cached camera on initial observation but reframes after a real resize", async () => {
  reducedMotion = true;
  await mount();
  await act(async () => completeLayout());
  await tick(1);
  await act(async () => latest().emit("clickNode", {node:"a"}));
  await tick(2);
  await act(async () => { await router.navigate("/"); });
  await act(async () => { await router.navigate("/graph"); });
  latest().camera.animate.mockClear();
  await act(async () => resizeGraph());
  await tick(3);
  expect(latest().camera.animate).not.toHaveBeenCalled();
  latest().dimensions = {width:660,height:800};
  await act(async () => resizeGraph());
  await tick(4);
  expect(latest().camera.animate).toHaveBeenCalledOnce();
});

it("All recovers the overview after manual camera movement even when it is already active", async () => {
  reducedMotion = true;
  await mount();
  await act(async () => completeLayout());
  await tick(1);
  latest().camera.setState({x:4, y:4, ratio:.2});
  latest().camera.animate.mockClear();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')]
    .find(button => button.textContent === 'All')!.click());
  await tick(2);
  expect(latest().camera.animate).toHaveBeenCalledOnce();
  expect(latest().camera.getState().x).not.toBe(4);
});

it("starts cleanly after StrictMode's setup and cleanup replay", async () => {
  await mount(true);
  for (const renderer of renderers) expectNoUnclockedEntranceEdges(renderer);
  await act(async () => completeLayout());
  await tick(500);
  expect(frame().clock?.mode).toBe("entrance");
  expect(frame().edges[0].hidden).toBe(false);
});

it("shows the graph immediately for reduced motion", async () => {
  reducedMotion = true;
  await mount();
  expect(frame().edges[0].hidden).toBe(false);
  expect(frame().nodes[0].entranceLabelOpacity).toBe(1);
  expect(frame().clock).toBeNull();
});

it("finishes on interaction before layout and does not restart when layout completes", async () => {
  await mount();
  await act(async () => host.querySelector("main")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  expect(frame().edges[0].hidden).toBe(false);
  expect(frame().nodes[0].entranceLabelOpacity).toBe(1);
  await act(async () => completeLayout());
  await tick(500);
  expect(frame().clock).toBeNull();
});

it("finishes when reduced motion is enabled mid-animation", async () => {
  await mount();
  await act(async () => completeLayout());
  await tick(500);
  reducedMotion = true;
  await act(async () => motionChange());
  expect(frame().clock).toBeNull();
  expect(frame().nodes[0].entranceLabelOpacity).toBe(1);
});

it("starts after the timeout if the layout worker is slow", async () => {
  await mount();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(frame().clock?.mode).toBe("entrance");
  await tick(500);
  expect(frame().edges[0].hidden).toBe(false);
});


it("closes details without opening search and restores a non-input focus target", async () => {
  reducedMotion=true; await mount(); await act(async()=>completeLayout());
  await act(async()=>latest().emit("clickNode",{node:"a"})); await tick(time+1);
  expect(host.querySelector("#graph-node-details-title")).not.toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());
  await tick(time+1);
  expect(host.querySelector("#graph-node-index")).toBeNull();
  expect(document.activeElement).toBe(host.querySelector("main"));
});
it("Escape clears selection after closing any active search panel", async()=>{
  reducedMotion=true; await mount(); await act(async()=>completeLayout());
  await act(async()=>latest().emit("clickNode",{node:"a"})); await tick(time+1);
  await act(async()=>host.querySelector("main")!.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  expect(host.querySelector("#graph-node-details-title")).toBeNull();
});
it("canvas selection focuses the graph so Escape works without first opening search", async () => {
  reducedMotion = true;
  await mount();
  await act(async () => completeLayout());
  expect(document.activeElement).toBe(document.body);
  await act(async () => latest().emit("clickNode", {node:"a"}));
  expect(document.activeElement).toBe(host.querySelector("main"));
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true})));
  expect(host.querySelector("#graph-node-details-title")).toBeNull();
});
it("frames a filtered off-screen note, then All returns to the full overview", async()=>{
  reducedMotion=true;
  data.colorSources={a:{topics:["Alpha"],folder:null},b:{topics:["Alpha"],folder:null},isolated:{topics:["Excalidraw"],folder:null}};
  await mount(); await act(async()=>completeLayout()); await tick(time+1);
  await act(async()=>latest().emit("clickNode",{node:"a"})); await tick(time+1);
  latest().camera.animate.mockClear();
  const filter=[...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent?.includes('Excalidraw'))!;
  await act(async()=>filter.click()); await tick(time+1);
  expect(host.querySelector("#graph-node-details-title")).toBeNull();
  expect(latest().camera.animate).toHaveBeenCalled();
  const filtered={...latest().camera.state};
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent==='All')!.click());
  await tick(time+1);
  expect(latest().camera.state).not.toEqual(filtered);
});


it("clicks a rendered label without needing to hit the small node dot",async()=>{
  reducedMotion=true; await mount(); await act(async()=>completeLayout()); await tick(time+1);
  const context={save(){},restore(){},measureText:()=>({width:100}),strokeText(){},fillText(){},globalAlpha:1} as unknown as CanvasRenderingContext2D;
  latest().settings.defaultDrawNodeLabel(context,{x:30,y:200,size:10,label:"a",color:"#abcdef",graphSlug:"a",labelPlacement:"right"},latest().settings as never);
  await act(async()=>latest().emit("clickStage",{event:{x:80,y:200}}));
  expect(host.querySelector("#graph-node-details-title")?.textContent).toBe("a");
});
it("keeps a dragging camera from recreating a stale hover tooltip",async()=>{
  reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(time+1);
  latest().camera.setState({x:.4});
  const node=latest().getNodeDisplayData("a")!;
  const point=latest().framedGraphToViewport(node);
  await act(async()=>host.querySelector(".graph-canvas")!.dispatchEvent(new MouseEvent("mousemove",{clientX:point.x,clientY:point.y,bubbles:true})));
  await tick(time+1);
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
});
it("fallback pointer hover finishes entrance before starting a neural signal",async()=>{
  await mount();
  // Pointer interaction can happen before the worker responds (no camera move yet).
  const point=latest().framedGraphToViewport(latest().getNodeDisplayData("a")!);
  await act(async()=>host.querySelector(".graph-canvas")!.dispatchEvent(new MouseEvent("mousemove",{clientX:point.x+12,clientY:point.y,bubbles:true})));
  await tick(100);
  await act(async()=>vi.advanceTimersByTime(80));
  expect(frame().nodes.every(node=>node.entranceLabelOpacity===1)).toBe(true);
  expect(frame().clock?.mode).toBe("hover");
});

it("clears custom label hover when leaving the canvas, including queued pointer work", async () => {
  await mount();
  const canvas = host.querySelector<HTMLElement>(".graph-canvas")!;
  const point = latest().framedGraphToViewport(latest().getNodeDisplayData("a")!);
  const move = () => canvas.dispatchEvent(new MouseEvent("mousemove", {clientX:point.x+12,clientY:point.y,bubbles:true}));
  await act(async () => {move();});
  await tick(100);
  expect(host.querySelector('[role="tooltip"]')).not.toBeNull();
  await act(async () => canvas.dispatchEvent(new MouseEvent("mouseleave")));
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  expect(canvas.style.cursor).toBe("default");
  await act(async () => {move();canvas.dispatchEvent(new MouseEvent("mouseleave"));});
  await tick(200);
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  expect(canvas.style.cursor).toBe("default");
});
