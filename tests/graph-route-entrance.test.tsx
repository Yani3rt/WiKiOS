// @vitest-environment jsdom
// Camera interpolation is covered against real Sigma in graph-motion-camera.test.ts.
vi.mock("../src/client/graph-motion-camera", () => ({ GraphMotionCamera: class {
  setReducedMotion() {} destroy() {} cancel = cancelMotion;
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
import { getGraphDisclosureVisibility } from "../src/client/graph-disclosure";
import { graphTopologyKey, graphViewCache } from "../src/client/graph-view-state";
import type { ColoredGraphData } from "../src/lib/wiki-shared";

type Settings = {
  edgeProgramClasses?: Record<string,unknown>;
  defaultDrawNodeLabel: NodeLabelDrawingFunction;
  edgeReducer(edge: string, attributes: Attributes): Attributes;
  nodeReducer(node: string, attributes: Attributes): Attributes;
};
type RefreshOptions = { partialGraph?: { nodes?: string[]; edges?: string[] }; skipIndexation?: boolean };
type Frame = {
  edges: Attributes[];
  nodes: Attributes[];
  clock: ReturnType<typeof getGraphNeuralRendererAnimationState>;
};
const { renderers, cancelMotion, rendererCapabilities } = vi.hoisted(() => ({ renderers: [] as Renderer[], cancelMotion: vi.fn(),rendererCapabilities:{neural:true} }));

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
    animatedUnzoom: async ({factor}:{factor:number}) => { await this.camera.animate({ratio:this.camera.state.ratio*factor}); },
    isAnimated: () => false,
    on: (_event: string, callback: () => void) => {this.cameraListeners.add(callback);},
    off: (_event: string, callback: () => void) => {this.cameraListeners.delete(callback);},
  };
  constructor(public graph: Graph, _container: HTMLElement, public settings: Settings) {
    if(!rendererCapabilities.neural && settings.edgeProgramClasses?.neural) throw new Error('Neural WebGL unavailable');
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
    this.emit('afterRender',undefined);
  }
  setSettings(settings: Partial<Settings>) { Object.assign(this.settings, settings); }
  getCamera() { return this.camera; }
  setCamera() {}
  getDimensions() { return this.dimensions; }
  getNodeDisplayData(node: string) { const attributes=this.nodes.get(node); return attributes && {...attributes,x:Number(attributes.x)/240+.5,y:Number(attributes.y)/240+.5}; }
  getEdgeDisplayData(edge: string) { return this.edges.get(edge); }
  framedGraphToViewport(point: {x:number;y:number}, override?: {cameraState:CameraState}) {
    const state=override?.cameraState ?? this.camera.state;
    return {x:600+(point.x-state.x)*600/state.ratio,y:400-(point.y-state.y)*600/state.ratio};
  }
  graphToViewport(point: {x:number;y:number}, override?: {cameraState:CameraState}) {
    return this.framedGraphToViewport({x:point.x/240+.5,y:point.y/240+.5},override);
  }
  viewportToFramedGraph(point: {x:number;y:number}, override?: {cameraState:CameraState}) {
    const state=override?.cameraState ?? this.camera.state;
    return {x:state.x+(point.x-600)*state.ratio/600,y:state.y-(point.y-400)*state.ratio/600};
  }
  scaleSize(size: number) {return size;}
  on(event: string, callback: (payload: unknown) => void) {this.listeners.set(event,callback);}
  emit(event: string, payload: unknown) {this.listeners.get(event)?.(payload);}
  off(event: string) {this.listeners.delete(event);}
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
let failLayout: () => void;
let reducedMotion: boolean;
let motionChange: () => void;
let resizeGraph: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  time = 0; nextFrame = 0; frames = new Map(); renderers.length = 0; reducedMotion = false; cancelMotion.mockClear();rendererCapabilities.neural=true;
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
      if (event === "error") failLayout = () => listener({ data: { positions: [] } });
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
  const pending = [...frames.keys()];
  await act(async () => {
    for (const id of pending) {
      const callback=frames.get(id);frames.delete(id);callback?.(time);
    }
  });
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
    allNotes:false, focusedSlug: "a", detailPanelCollapsed: true, activeGroup: null,
    search: { query: "", indexOpen: false, visibleResultCount: 10 }, layoutReady: true,
    detailLevel: "overview", expandedNeighborhood:null, positions: {}, camera: { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
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
  expect(host.querySelector('[role="tooltip"]:not([hidden])')).toBeNull();
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
  expect(host.querySelector('[role="tooltip"]:not([hidden])')).not.toBeNull();
  await act(async () => canvas.dispatchEvent(new MouseEvent("mouseleave")));
  expect(host.querySelector('[role="tooltip"]:not([hidden])')).toBeNull();
  expect(canvas.style.cursor).toBe("default");
  await act(async () => {move();canvas.dispatchEvent(new MouseEvent("mouseleave"));});
  await tick(200);
  expect(host.querySelector('[role="tooltip"]:not([hidden])')).toBeNull();
  expect(canvas.style.cursor).toBe("default");
});

function useNeighborhoodFixture() {
  data.edges=[{source:'a',target:'b',weight:1},{source:'b',target:'isolated',weight:1},{source:'isolated',target:'a',weight:1}];
  data.colorSources=Object.fromEntries(data.nodes.map(node=>[node.slug,{topics:['Research'],folder:null}]));
}
it('offers the same real neighborhood through keyboard browsing and fits it without selecting a note',async()=>{
  useNeighborhoodFixture(); reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);
  const input=host.querySelector<HTMLInputElement>('[aria-label="Find a concept"]')!;
  await act(async()=>input.focus());
  const button=host.querySelector<HTMLButtonElement>('.graph-search-neighborhoods button')!;
  expect(button.textContent).toBe('Research');
  latest().camera.animate.mockClear();
  await act(async()=>button.click());await tick(2);
  expect(latest().camera.animate).toHaveBeenCalled();
  expect(host.querySelector('#graph-node-details-title')).toBeNull();
  expect(host.querySelector('#graph-node-index')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('main'));
});
it('semantic camera changes leave positions and community membership fixed',async()=>{
  useNeighborhoodFixture();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);
  const positions=()=>latest().graph.nodes().map(slug=>{const node=latest().graph.getNodeAttributes(slug);return [slug,node.x,node.y,node.neighborhoodId];});
  const before=positions();
  latest().camera.setState({ratio:.2});await act(async()=>vi.advanceTimersByTime(100));await tick(2);
  expect(positions()).toEqual(before);
  expect([...latest().nodes.values()].every(node=>node.label===node.fullLabel)).toBe(true);
  latest().camera.setState({ratio:2});await act(async()=>vi.advanceTimersByTime(100));await tick(3);
  expect(positions()).toEqual(before);
});
it('frames the completed worker layout after StrictMode saved an unfinished fallback',async()=>{
  await mount(true); latest().camera.animate.mockClear();
  await act(async()=>completeLayout());await tick(1);
  expect(latest().camera.animate).toHaveBeenCalled();
});

it('preserves semantic hysteresis and full labels when returning at the same zoom',async()=>{
  data.nodes[0].title='A detailed research note with a sufficiently long title';
  reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  const overviewRatio=latest().camera.state.ratio;
  latest().camera.setState({ratio:overviewRatio/3});
  await act(async()=>vi.advanceTimersByTime(100));await tick(3);
  latest().camera.setState({ratio:overviewRatio/2.3});
  await act(async()=>vi.advanceTimersByTime(100));await tick(4);
  expect(latest().nodes.get('a')?.label).toBe(data.nodes[0].title);
  const camera={...latest().camera.state};
  await act(async()=>router.navigate('/'));
  await act(async()=>router.navigate('/graph'));await tick(5);
  expect(latest().camera.state).toEqual(camera);
  expect(latest().nodes.get('a')?.label).toBe(data.nodes[0].title);
});

it('keeps every note and usable neighborhood framing when the layout worker errors',async()=>{
  useNeighborhoodFixture();await mount();
  const positions=latest().graph.nodes().map(slug=>latest().graph.getNodeAttributes(slug));
  expect(positions).toHaveLength(data.nodes.length);
  expect(positions.every(point=>Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  await act(async()=>failLayout());await tick(1);await tick(2000);
  expect(latest().camera.animate).toHaveBeenCalled();
  expect(frame().nodes.every(node=>node.hidden)).toBe(true);
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!.click());await tick(time+400);await tick(time+1);
  expect(frame().nodes.every(node=>!node.hidden && node.entranceLabelOpacity===1)).toBe(true);
  expect(latest().graph.order).toBe(data.nodes.length);
});

function useTwoNeighborhoods() {
  data.nodes=['a','b','c','d','e','f','alone'].map(slug=>({...data.nodes[0],slug,title:slug,neighbors:[]}));
  data.edges=[['a','b'],['b','c'],['c','a'],['d','e'],['e','f'],['f','d'],['c','d']].map(([source,target],i)=>({source,target,weight:i===6?.01:3}));
  data.colorSources=Object.fromEntries(data.nodes.map(node=>[node.slug,{topics:[node.slug<'d'?'Alpha':'Beta'],folder:null}]));
}
const visibleSlugs=()=>[...latest().nodes].filter(([,node])=>!node.hidden).map(([slug])=>slug).sort();
async function arrangeVisibleNeighborhood() {
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  for(const [index,slug] of ['a','b','c'].entries()) latest().graph.mergeNodeAttributes(slug,{x:index*20,y:index*10});
  latest().refresh();latest().camera.setState({x:.5,y:.5,ratio:1});
  latest().camera.animate.mockClear();
}
it('keeps the camera fixed while recalling already-visible notes and their neighbors',async()=>{
  await arrangeVisibleNeighborhood();const camera={...latest().camera.state};
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);
  expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
  await act(async()=>latest().emit('clickNode',{node:'b'}));await tick(time+1);
  expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
});
it('only pans when selection needs more room and keeps explicit Fit available',async()=>{
  await arrangeVisibleNeighborhood();latest().graph.mergeNodeAttributes('b',{x:300,y:10});latest().refresh();
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);
  expect(latest().camera.state.ratio).toBe(1);expect(latest().camera.state.x).not.toBe(.5);
  latest().camera.animate.mockClear();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalled();
});
it('cancels superseded camera motion even when the replacement note needs no reveal',async()=>{
  await arrangeVisibleNeighborhood();
  latest().camera.isAnimated=()=>true;
  latest().camera.animate.mockImplementation(async()=>{});
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalled();
  latest().camera.animate.mockClear();cancelMotion.mockClear();
  const camera={...latest().camera.state};
  await act(async()=>latest().emit('clickNode',{node:'b'}));await tick(time+1);
  expect(cancelMotion).toHaveBeenCalled();
  expect(latest().camera.animate).not.toHaveBeenCalled();
  expect(latest().camera.state).toEqual(camera);
});
it('preserves explicit neighborhood Fit when clearing a selection schedules reactive framing',async()=>{
  await arrangeVisibleNeighborhood();reducedMotion=false;
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);
  latest().camera.animate.mockClear();
  await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="Find a concept"]')!.focus());
  const button=host.querySelector<HTMLButtonElement>('#graph-node-index [aria-label="Explore Alpha neighborhood, 3 notes"]')!;
  await act(async()=>button.click());await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({duration:480}));
  expect(latest().camera.state.ratio).toBeLessThan(1);
});
it('keeps an explicit neighborhood Fit running through later viewport measurement updates',async()=>{
  await arrangeVisibleNeighborhood();reducedMotion=false;
  let completeFit!:()=>void;
  latest().camera.isAnimated=()=>true;
  latest().camera.animate.mockImplementation(()=>new Promise<void>(resolve=>{completeFit=resolve;}));
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor[aria-label="Explore Alpha neighborhood, 3 notes"]')!.click());
  await tick(time+1);cancelMotion.mockClear();latest().camera.animate.mockClear();
  // ResizeObserver/React can issue another reveal after the fit's first RAF.
  await act(async()=>resizeGraph());await tick(time+1);
  expect(cancelMotion).not.toHaveBeenCalled();
  expect(latest().camera.animate).not.toHaveBeenCalled();
  await act(async()=>completeFit());
});
it('does not queue a deferred reveal after leaving during a neighborhood Fit',async()=>{
  await arrangeVisibleNeighborhood();reducedMotion=false;
  let completeFit!:()=>void;
  latest().camera.animate.mockImplementation(()=>new Promise<void>(resolve=>{completeFit=resolve;}));
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor[aria-label="Explore Alpha neighborhood, 3 notes"]')!.click());
  await tick(time+1);await act(async()=>resizeGraph());
  await act(async()=>router.navigate('/'));
  expect(frames.size).toBe(0);
  await act(async()=>completeFit());
  expect(frames.size).toBe(0);
});
it('stops the linked-note preview clock after its single response',async()=>{
  await arrangeVisibleNeighborhood();reducedMotion=false;
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+2000);await tick(time+1);
  const linked=host.querySelector<HTMLButtonElement>('[aria-label="a links to b, 3 mentions"]')!;
  const start=time;
  await act(async()=>linked.focus());await tick(start+160);await tick(start+320);
  const refresh=vi.spyOn(latest(),'refresh');
  await tick(start+1320);
  expect(refresh).not.toHaveBeenCalled();
});
it('does not restart a neighborhood handoff when camera movement clears an empty hover',async()=>{
  useTwoNeighborhoods();await mount();await act(async()=>completeLayout());await tick(2000);await tick(2001);
  const start=time;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor[aria-label="Explore Alpha neighborhood, 3 notes"]')!.click());
  await tick(start+1);await tick(start+200);
  const visibility=getGraphDisclosureVisibility(0,1,200,400);
  expect(latest().nodes.get('a')?.entranceLabelOpacity).toBeCloseTo(Math.max(0,(visibility-.35)/.65));
  await tick(start+400);
  expect(latest().nodes.get('a')?.entranceLabelOpacity).toBe(1);
});
async function clickNeighborhood(label:string) {
  const button=host.querySelector<HTMLButtonElement>(`.graph-neighborhood-anchor[aria-label="Explore ${label} neighborhood, 3 notes"]`)!;
  await act(async()=>button.click());await tick(time+400);await tick(time+1);
}
it('starts with counted anchors instead of every grouped note, without synthetic graph records',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  expect(visibleSlugs()).toEqual(['alone']);
  expect(latest().graph.order).toBe(7);expect(latest().graph.size).toBe(7);
  expect(host.querySelectorAll('.graph-neighborhood-anchor')).toHaveLength(2);
  expect(host.querySelector('.graph-memory-hub')?.textContent).toContain('My Memory');
});
it('expands a neighborhood and shows all notes through the hub without selecting a note',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  await clickNeighborhood('Alpha');expect(visibleSlugs()).toEqual(['a','b','c']);
  expect(host.querySelector('#graph-node-details-title')).toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','alone','b','c','d','e','f']);
  expect(document.activeElement).toBe(host.querySelector('main'));
});
it('returns to the full memory overview when clicking empty neighborhood background',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  await clickNeighborhood('Alpha');await act(async()=>vi.advanceTimersByTime(100));
  latest().camera.animate.mockClear();
  await act(async()=>latest().emit('clickStage',{event:{x:0,y:0}}));await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(['alone']);
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe('Graph overview active.');
  expect(latest().camera.animate).toHaveBeenCalled();
  expect(host.querySelector('.graph-memory-hub')).not.toBeNull();
});
it.each(['background','escape','legend','close-details'] as const)('keeps other neighborhoods folded throughout the %s return camera flight',async action=>{
  await startMemoryOverview();
  if(action==='close-details') {await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);}
  else await clickNeighborhood('Alpha');
  // The real camera retains a close-up ratio while its return flight interpolates.
  latest().camera.setState({ratio:latest().camera.state.ratio*.05});await act(async()=>vi.advanceTimersByTime(100));await tick(time+1);
  reducedMotion=false;
  let destination:Partial<CameraState>|undefined,completeFlight!:()=>void;
  let flying=false;
  vi.spyOn(latest().camera,'isAnimated').mockImplementation(()=>flying);
  latest().camera.animate.mockImplementation(target=>{destination=target;flying=true;return new Promise<void>(resolve=>{completeFlight=resolve;});});
  if(action==='background') await act(async()=>latest().emit('clickStage',{event:{x:0,y:0}}));
  else if(action==='escape') await act(async()=>host.querySelector('main')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  else if(action==='close-details') await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());
  else await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent==='All')!.click());
  const start=time;
  for(const elapsed of [16,32,80,160,280,360,420]) {
    await tick(start+elapsed);
    for(const slug of ['d','e','f']) expect(latest().nodes.get(slug)!.hidden,`${slug} flashed at ${elapsed}ms`).toBe(true);
  }
  expect(destination).toBeDefined();
  await act(async()=>{flying=false;latest().camera.setState(destination!);completeFlight();vi.advanceTimersByTime(100);});
  await tick(start+500);await tick(start+800);
  expect(visibleSlugs()).toEqual(['alone']);
  expect(host.querySelectorAll('.graph-neighborhood-anchor:not([hidden])')).toHaveLength(2);
});
it('crossfades counted anchors with neighborhood disclosure instead of switching them instantly',async()=>{
  await startMemoryOverview();reducedMotion=false;
  const anchors=()=>[...host.querySelectorAll<HTMLButtonElement>('.graph-neighborhood-anchor')];
  await act(async()=>anchors()[0].click());const start=time;
  expect(anchors().every(anchor=>!anchor.hidden && anchor.inert)).toBe(true);
  await tick(start+90);
  expect(anchors().every(anchor=>Number(anchor.style.opacity)>0 && Number(anchor.style.opacity)<1)).toBe(true);
  await tick(start+400);await tick(start+401);await act(async()=>vi.advanceTimersByTime(100));
  expect(anchors().every(anchor=>anchor.hidden)).toBe(true);
  await act(async()=>latest().emit('clickStage',{event:{x:0,y:0}}));const back=time;
  expect(anchors().every(anchor=>anchor.hidden)).toBe(true);
  await tick(back+16);await tick(back+100);
  expect(anchors().some(anchor=>!anchor.hidden && Number(anchor.style.opacity)>0 && Number(anchor.style.opacity)<1)).toBe(true);
  await tick(back+350);await tick(back+351);
  expect(anchors().every(anchor=>!anchor.hidden && !anchor.inert && Number(anchor.style.opacity)===1)).toBe(true);
});
it('reverses neighborhood entry into a folded return from the current anchor opacity',async()=>{
  await startMemoryOverview();reducedMotion=false;
  const anchor=host.querySelector<HTMLButtonElement>('.graph-neighborhood-anchor')!;
  await act(async()=>anchor.click());await tick(time+90);
  const opacity=anchor.style.opacity;
  await act(async()=>host.querySelector('main')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(anchor.style.opacity).toBe(opacity);
  await tick(time+350);await tick(time+1);expect(visibleSlugs()).toEqual(['alone']);
  expect(anchor.hidden).toBe(false);expect(anchor.style.opacity).toBe('1');
});
it('settles both anchor and note disclosure when reduced motion interrupts a folded return',async()=>{
  await startMemoryOverview();await clickNeighborhood('Alpha');reducedMotion=false;
  await act(async()=>host.querySelector('main')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await tick(time+100);reducedMotion=true;await act(async()=>motionChange());await tick(time+1);
  expect(visibleSlugs()).toEqual(['alone']);
  for(const anchor of host.querySelectorAll<HTMLButtonElement>('.graph-neighborhood-anchor')) {
    expect(anchor.hidden).toBe(false);expect(anchor.inert).toBe(false);expect(anchor.style.opacity).toBe('1');
  }
});
it('clears a selected note and the expanded neighborhood with one background click',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);await clickNeighborhood('Alpha');
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await act(async()=>vi.advanceTimersByTime(100));
  await act(async()=>latest().emit('clickStage',{event:{x:0,y:0}}));await tick(time+1);await tick(time+1);
  expect(host.querySelector('#graph-node-details-title')).toBeNull();
  expect(visibleSlugs()).toEqual(['alone']);
});
it('keeps an expanded neighborhood when clicking a note label instead of the background',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);await clickNeighborhood('Alpha');
  await act(async()=>vi.advanceTimersByTime(100));
  const context={save(){},restore(){},measureText:()=>({width:100}),strokeText(){},fillText(){},globalAlpha:1} as unknown as CanvasRenderingContext2D;
  latest().settings.defaultDrawNodeLabel(context,{x:30,y:200,size:10,label:'a',color:'#abcdef',graphSlug:'a',labelPlacement:'right'},latest().settings as never);
  await act(async()=>latest().emit('clickStage',{event:{x:80,y:200}}));await tick(time+1);
  expect(host.querySelector('#graph-node-details-title')?.textContent).toBe('a');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);
});
it('does not exit a neighborhood on a background click while the camera is moving',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);await clickNeighborhood('Alpha');
  latest().camera.setState({x:latest().camera.state.x+.01});
  await act(async()=>latest().emit('clickStage',{event:{x:0,y:0}}));await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);
});
it('searches into a collapsed group and reveals real neighbors across group boundaries',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  const input=host.querySelector<HTMLInputElement>('[aria-label="Find a concept"]')!;
  await act(async()=>input.focus());
  const button=[...host.querySelectorAll<HTMLButtonElement>('#graph-node-index button')].find(button=>button.getAttribute('aria-label')==='d, 0 connections')!;
  await act(async()=>button.click());await tick(time+1);
  expect(visibleSlugs()).toEqual(['c','d','e','f']);
  expect(latest().edges.get('c->d')?.hidden).toBe(false);
});
it('reindexes focus transition edges instead of repainting potentially invalidated program slots',async()=>{
  useTwoNeighborhoods();await mount();await act(async()=>completeLayout());await tick(2000);
  const refresh=vi.spyOn(latest(),'refresh');
  await act(async()=>latest().emit('clickNode',{node:'d'}));await tick(time+100);
  const focusFrames=refresh.mock.calls.map(([options])=>options).filter(options=>options?.partialGraph?.edges?.length===data.edges.length);
  expect(focusFrames.length).toBeGreaterThan(0);
  // Sigma clears program indexes during scheduled full refreshes. Focus also
  // changes edge programs, so its frames must never take the repaint-only path.
  expect(focusFrames.every(options=>options?.skipIndexation!==true)).toBe(true);
  await tick(time+400);
  expect(visibleSlugs()).toEqual(['c','d','e','f']);
});
it('restores the expanded neighborhood and its camera after route return',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);await clickNeighborhood('Alpha');
  const camera={...latest().camera.state};await act(async()=>router.navigate('/'));await act(async()=>router.navigate('/graph'));await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);expect(latest().camera.state).toEqual(camera);
});

it('reveals grouped notes on zoom and collapses them again on zoom out',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  const ratio=latest().camera.state.ratio;
  latest().camera.setState({ratio:ratio/3});await act(async()=>vi.advanceTimersByTime(100));await tick(3);await tick(4);
  expect(visibleSlugs()).toHaveLength(7);
  latest().camera.setState({ratio});await act(async()=>vi.advanceTimersByTime(100));await tick(5);await tick(6);
  expect(visibleSlugs()).toEqual(['alone']);
});
it('keeps an expanded neighborhood revealed when resized',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);await clickNeighborhood('Alpha');
  latest().dimensions={width:390,height:844};await act(async()=>resizeGraph());await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);
});
it('does not interpret the in-flight expansion camera as a user zoom-out',async()=>{
  useTwoNeighborhoods();await mount();await act(async()=>completeLayout());await tick(2000);await tick(2001);
  // A real camera animates over multiple render frames rather than jumping instantly.
  latest().camera.isAnimated=()=>true;
  latest().camera.animate.mockImplementation(async()=>{});
  await clickNeighborhood('Alpha');await tick(time+400);
  expect(visibleSlugs()).toEqual(['a','b','c']);
});
it('can zoom back to the hub after restoring an expanded neighborhood',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  const overviewRatio=latest().camera.state.ratio;await clickNeighborhood('Alpha');
  await act(async()=>router.navigate('/'));await act(async()=>router.navigate('/graph'));await tick(time+1);
  latest().camera.setState({ratio:overviewRatio*1.25});await act(async()=>vi.advanceTimersByTime(100));await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(['alone']);
});
it('recovers to a usable overview when same-vault revalidation removes the expanded group',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);await clickNeighborhood('Alpha');
  data={...data,edges:[]};await act(async()=>router.revalidate());
  await act(async()=>completeLayout());await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','alone','b','c','d','e','f']);
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe('Graph overview active.');
});
it('completes the deterministic fallback so a silent worker cannot disable expansion',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();
  await act(async()=>vi.advanceTimersByTime(1001));await tick(1001);await tick(1002);
  latest().camera.animate.mockClear();await clickNeighborhood('Alpha');
  expect(visibleSlugs()).toEqual(['a','b','c']);
  expect(latest().camera.animate).toHaveBeenCalled();
});
it('uses the deterministic fallback when the browser cannot construct a worker',async()=>{
  useTwoNeighborhoods();reducedMotion=true;
  vi.stubGlobal('Worker',class {constructor(){throw new Error('Worker unavailable');}});
  await mount();await tick(1);await tick(2);await clickNeighborhood('Alpha');
  expect(visibleSlugs()).toEqual(['a','b','c']);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('ignores a late worker response after falling back to the usable layout',async()=>{
  useTwoNeighborhoods();reducedMotion=true;await mount();
  await act(async()=>vi.advanceTimersByTime(1001));await tick(1001);await tick(1002);
  latest().camera.animate.mockClear();await act(async()=>completeLayout());await tick(1003);
  expect(latest().camera.animate).not.toHaveBeenCalled();
});


async function startMemoryOverview() {
  useTwoNeighborhoods();reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
}
async function clickMemory() {
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+601);await tick(time+1);
}
const allMemorySlugs=['a','alone','b','c','d','e','f'];
const notePositions=()=>Object.fromEntries(latest().graph.nodes().map(slug=>[slug,{x:latest().graph.getNodeAttribute(slug,'x'),y:latest().graph.getNodeAttribute(slug,'y')}]));
it.each([
  {input:'node',reduced:false,width:1200,height:800},
  {input:'label',reduced:true,width:1200,height:800},
  {input:'node',reduced:true,width:390,height:844},
])('fits a small selected cluster from open memory using neighborhood framing ($input, reduced: $reduced, width: $width)',async({input,reduced,width,height})=>{
  await startMemoryOverview();await clickMemory();
  latest().dimensions={width,height};
  for(const [i,slug] of ['a','b','c'].entries()) latest().graph.mergeNodeAttributes(slug,{x:300+i*10,y:20+i*5});
  for(const [i,slug] of ['d','e','f'].entries()) latest().graph.mergeNodeAttributes(slug,{x:2000+i*100,y:500});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const box=this.matches('aside[aria-labelledby="graph-node-details-title"]')
      ? width<1024 ? {left:12,right:378,top:500,bottom:744} : {left:900,right:1180,top:84,bottom:640}
      : {left:0,right:0,top:0,bottom:0};
    return {...box,x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top,toJSON(){}};
  });
  // Chrome only participates in framing when it has real layout dimensions.
  vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockImplementation(function(this:HTMLElement){return this.matches('aside[aria-labelledby="graph-node-details-title"]') ? width<1024?366:280 : 0;});
  vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockImplementation(function(this:HTMLElement){return this.matches('aside[aria-labelledby="graph-node-details-title"]') ? width<1024?244:556 : 0;});
  latest().refresh();latest().camera.setState({x:.5,y:.5,ratio:4});latest().camera.animate.mockClear();
  const positions=notePositions();reducedMotion=reduced;
  if(input==='label') {
    const context={save(){},restore(){},measureText:()=>({width:100}),strokeText(){},fillText(){},globalAlpha:1} as unknown as CanvasRenderingContext2D;
    latest().settings.defaultDrawNodeLabel(context,{x:30,y:200,size:10,label:'a',color:'#abcdef',graphSlug:'a',labelPlacement:'right'},latest().settings as never);
    await act(async()=>latest().emit('clickStage',{event:{x:80,y:200}}));
  } else await act(async()=>latest().emit('clickNode',{node:'a'}));
  await tick(time+1);await tick(time+600);await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({duration:reduced?0:480,easing:'quadraticInOut'}));
  expect(latest().camera.state.ratio).toBeLessThan(4);
  const points=['a','b','c'].map(slug=>latest().framedGraphToViewport(latest().getNodeDisplayData(slug)!));
  const bounds=width<1024 ? {left:20,right:370,top:84,bottom:480} : {left:20,right:880,top:84,bottom:780};
  for(const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(bounds.left);expect(point.x).toBeLessThanOrEqual(bounds.right);
    expect(point.y).toBeGreaterThanOrEqual(bounds.top);expect(point.y).toBeLessThanOrEqual(bounds.bottom);
  }
  expect((Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2).toBeCloseTo(width<1024?195:450);
  expect((Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2).toBeCloseTo(width<1024?282:432);
  expect(visibleSlugs()).toEqual(['a','b','c']);expect(notePositions()).toEqual(positions);
});

it.each([
  {width:588,height:1292,reduced:false,memory:'open'},
  {width:390,height:844,reduced:true,memory:'neighborhood'},
  {width:768,height:1024,reduced:false,memory:'open'},
])('recenters the selected cluster after compact details finish folding (width: $width, reduced: $reduced, $memory)',async({width,height,reduced,memory})=>{
  await startMemoryOverview();if(memory==='open') await clickMemory();else await clickNeighborhood('Alpha');
  latest().dimensions={width,height};
  for(const [index,slug] of ['a','b','c'].entries()) latest().graph.mergeNodeAttributes(slug,{x:index*10,y:index*50});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const box=this.matches('aside[aria-labelledby="graph-node-details-title"]')
      ? {left:12,right:width-12,top:this.dataset.collapsed==='true'?height-132:height*.48,bottom:height-12}
      : {left:0,right:0,top:0,bottom:0};
    return {...box,x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top,toJSON(){}};
  });
  vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockImplementation(function(this:HTMLElement){return this.matches('aside')?width-24:0;});
  vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockImplementation(function(this:HTMLElement){return this.matches('aside')?this.getBoundingClientRect().height:0;});
  latest().refresh();await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  const positions=notePositions(),camera={...latest().camera.state};reducedMotion=reduced;latest().camera.animate.mockClear();
  let finishFold!:()=>void;
  const finished=new Promise<void>(resolve=>{finishFold=resolve;});
  const body=host.querySelector<HTMLElement>('#graph-node-details-body')!;
  body.getAnimations=()=>reduced?[]:[{finished} as unknown as Animation];
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Collapse node details"]')!.click());await tick(time+1);
  if(!reduced) {
    // The final viewport must be measured after the CSS height transition, not before it.
    expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
    await act(async()=>finishFold());await tick(time+1);
  }
  await tick(time+600);await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({duration:reduced?0:360,easing:'quadraticInOut'}));
  const points=['a','b','c'].map(slug=>latest().framedGraphToViewport(latest().getNodeDisplayData(slug)!));
  expect((Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2).toBeCloseTo(width/2);
  expect((Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2).toBeCloseTo((84+height-152)/2);
  for(const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(20);expect(point.x).toBeLessThanOrEqual(width-20);
    expect(point.y).toBeGreaterThanOrEqual(84);expect(point.y).toBeLessThanOrEqual(height-152);
  }
  expect(visibleSlugs()).toEqual(['a','b','c']);expect(notePositions()).toEqual(positions);
  expect(host.querySelector('#graph-node-details-title')?.textContent).toBe('a');
  expect(body.getAttribute('aria-hidden')).toBe('true');
  // Reopening keeps the same selection and restores the accessible panel body.
  body.getAnimations=()=>[];
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Expand node details"]')!.click());await tick(time+1);await tick(time+600);await tick(time+1);
  expect(body.getAttribute('aria-hidden')).toBe('false');
  expect(visibleSlugs()).toEqual(['a','b','c']);expect(notePositions()).toEqual(positions);
});
it('does not recenter desktop notes just because their details fold',async()=>{
  await startMemoryOverview();await clickMemory();await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  const camera={...latest().camera.state};latest().camera.animate.mockClear();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Collapse node details"]')!.click());await tick(time+1);await tick(time+600);
  expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
});
it('cancels the pending compact fold Fit when the selected note is dismissed',async()=>{
  await startMemoryOverview();await clickMemory();latest().dimensions={width:588,height:1292};
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  let finishFold!:()=>void;const finished=new Promise<void>(resolve=>{finishFold=resolve;});
  host.querySelector<HTMLElement>('#graph-node-details-body')!.getAnimations=()=>[{finished} as unknown as Animation];
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Collapse node details"]')!.click());await tick(time+1);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());await tick(time+1);await tick(time+1);
  latest().camera.animate.mockClear();await act(async()=>finishFold());await tick(time+1);
  expect(latest().camera.animate).not.toHaveBeenCalled();expect(host.querySelector('#graph-node-details-title')).toBeNull();
});

it('refits the current note in open memory after a manual zoom-out',async()=>{
  await startMemoryOverview();await clickMemory();
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  latest().camera.setState({ratio:8});latest().camera.animate.mockClear();
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalled();expect(latest().camera.state.ratio).toBeLessThan(8);
  expect(visibleSlugs()).toEqual(['a','b','c']);expect(frame().clock?.mode).toBe('selection');
});

it('keeps the open-memory note Fit running while viewport measurements update',async()=>{
  await startMemoryOverview();await clickMemory();reducedMotion=false;
  let completeFit!:()=>void;
  latest().camera.isAnimated=()=>true;
  latest().camera.animate.mockImplementation(()=>new Promise<void>(resolve=>{completeFit=resolve;}));
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({duration:480}));
  latest().camera.animate.mockClear();cancelMotion.mockClear();
  await act(async()=>resizeGraph());await tick(time+1);
  expect(cancelMotion).not.toHaveBeenCalled();expect(latest().camera.animate).not.toHaveBeenCalled();
  await act(async()=>completeFit());
});

it.each([['pointerdown',true],['keydown',true],['pointerdown',false],['keydown',false]] as const)('hands entrance appearance to memory continuously through %s capture (all notes: %s)',async(input,allNotes)=>{
  await startMemoryOverview();if(allNotes) await clickMemory();
  await act(async()=>router.navigate('/'));reducedMotion=false;
  await act(async()=>router.navigate('/graph'));await tick(time+400);
  expect(frame().clock?.mode).toBe('entrance');
  const before={...latest().nodes.get('alone')};
  const edge=[...latest().edges.values()].find(edge=>Number(edge.neuralDelayMs)<0)!;
  expect(edge).toBeDefined();
  const delay=-(Number(edge.neuralDelayMs)+1);
  const progress=1-Math.pow(1-Math.max(0,Math.min(1,(400-delay-120)/560)),3);
  const frameCount=latest().frames.length;
  const hub=host.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  await act(async()=>{
    hub.dispatchEvent(input==='keydown' ? new KeyboardEvent('keydown',{key:'Enter',bubbles:true}) : new Event('pointerdown',{bubbles:true}));
    hub.click();
  });
  expect(latest().nodes.get('alone')).toMatchObject({size:before.size,color:before.color,entranceLabelOpacity:before.entranceLabelOpacity});
  for(const next of latest().frames.slice(frameCount)) {
    const node=next.nodes.find(node=>node.graphSlug==='alone')!;
    expect(node).toMatchObject({size:before.size,color:before.color,entranceLabelOpacity:before.entranceLabelOpacity});
  }
  if(allNotes) expect([...latest().edges.values()].find(next=>next.neuralRevealReversed)).toMatchObject({neuralRevealProgress:progress,color:edge.color});
  else expect([...latest().edges.values()].every(next=>next.hidden)).toBe(true);
  expect(frame().clock?.mode).toBe('disclosure');
  await tick(time+(allNotes ? 350 : 600));expect(visibleSlugs()).toEqual(allNotes ? ['alone'] : allMemorySlugs);
  await tick(time+1000);expect(frame().clock).toBeNull();
});
it('does not apply isolation twice when reopening memory halfway through a selection fade',async()=>{
  await startMemoryOverview();await clickMemory();reducedMotion=false;
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+140);
  const before={...latest().nodes.get('alone')};
  expect(before.color).toMatch(/,0\.5\)$/);
  const frameCount=latest().frames.length;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());
  for(const next of latest().frames.slice(frameCount)) {
    const node=next.nodes.find(node=>node.graphSlug==='alone')!;
    expect(node).toMatchObject({size:before.size,color:before.color,entranceLabelOpacity:before.entranceLabelOpacity});
  }
  await tick(time+600);expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect(latest().nodes.get('alone')!.entranceLabelOpacity).toBe(1);
});
it('opens memory with notes before real-edge traces and labels, without replaying entrance',async()=>{
  await startMemoryOverview();reducedMotion=false;const positions=notePositions();
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());const start=time;
  expect(frame().clock?.mode).toBe('disclosure');expect([...latest().edges.values()].every(edge=>edge.hidden)).toBe(true);
  await tick(start+100);
  expect(visibleSlugs().length).toBeGreaterThan(1);
  expect([...latest().edges.values()].every(edge=>edge.hidden)).toBe(true);
  expect(latest().nodes.get('a')!.entranceLabelOpacity).toBe(0);
  await tick(start+300);
  expect([...latest().edges.values()].some(edge=>Number(edge.neuralRevealProgress)>0 && Number(edge.neuralRevealProgress)<1)).toBe(true);
  expect(latest().nodes.get('a')!.entranceLabelOpacity).toBe(0);
  await tick(start+600);
  expect(frame().clock?.mode).not.toBe('disclosure');expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect([...latest().nodes.values()].every(node=>node.entranceLabelOpacity===1)).toBe(true);
  expect(notePositions()).toEqual(positions);expect(latest().graph.order).toBe(7);expect(latest().graph.size).toBe(7);
});
it('closes real links before notes retract and leaves the independent note steady',async()=>{
  await startMemoryOverview();await clickMemory();reducedMotion=false;
  const alone={...latest().nodes.get('alone')};
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());const start=time;
  await tick(start+160);
  expect([...latest().edges.values()].every(edge=>edge.hidden)).toBe(true);
  expect(visibleSlugs().length).toBeGreaterThan(1);expect(latest().nodes.get('a')!.entranceLabelOpacity).toBe(0);
  expect(latest().nodes.get('alone')).toMatchObject({size:alone.size,color:alone.color,entranceLabelOpacity:alone.entranceLabelOpacity});
  await tick(start+350);expect(visibleSlugs()).toEqual(['alone']);expect(frame().clock?.mode).not.toBe('disclosure');
});
it('samples memory appearance from the original snapshot rather than compounding each frame',async()=>{
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());const start=time;
  const base=latest().graph.getNodeAttribute('c','size');
  await tick(start+100);expect(latest().nodes.get('c')!.size/base).toBeCloseTo(.62875,5);
  await tick(start+200);expect(latest().nodes.get('c')!.size/base).toBeCloseTo(.9466436,5);
});
it('fades real links on the static fallback without requiring the neural trace clock',async()=>{
  rendererCapabilities.neural=false;vi.spyOn(console,'warn').mockImplementation(()=>{});
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());const start=time;
  await tick(start+100);expect([...latest().edges.values()].every(edge=>edge.hidden)).toBe(true);
  await tick(start+300);expect([...latest().edges.values()].some(edge=>!edge.hidden)).toBe(true);
  expect([...latest().edges.values()].every(edge=>edge.type!=='neural')).toBe(true);expect(frame().clock).toBeNull();
  await tick(start+600);expect(visibleSlugs()).toEqual(allMemorySlugs);expect([...latest().edges.values()].filter(edge=>!edge.hidden)).toHaveLength(6);
});
it('reverses a memory trace from its current node and edge appearance',async()=>{
  await startMemoryOverview();reducedMotion=false;
  const hub=host.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  await act(async()=>hub.click());await tick(time+280);
  const appearance=()=>({nodes:[...latest().nodes.values()].map(({size,color,entranceLabelOpacity})=>({size,color,entranceLabelOpacity})),edges:[...latest().edges.values()].map(edge=>edge.hidden?0:edge.neuralRevealProgress)});
  const opening=appearance();await act(async()=>hub.click());expect(appearance()).toEqual(opening);
  await tick(time+90);const closing=appearance();await act(async()=>hub.click());expect(appearance()).toEqual(closing);
  await tick(time+600);expect(visibleSlugs()).toEqual(allMemorySlugs);expect(frame().clock?.mode).not.toBe('disclosure');
});
it('does not restart memory choreography for camera updates or allow hover to steal its shader clock',async()=>{
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());const start=time;
  await tick(start+280);await act(async()=>latest().emit('enterNode',{node:'a'}));
  expect(frame().clock?.mode).toBe('disclosure');
  latest().camera.setState({x:latest().camera.state.x+.01});await act(async()=>resizeGraph());
  await tick(start+600);expect(frame().clock?.mode).not.toBe('disclosure');
  expect([...latest().nodes.values()].every(node=>node.entranceLabelOpacity===1)).toBe(true);
});
it('gives a selected note ownership of the renderer when it interrupts memory opening',async()=>{
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+280);
  expect(frame().clock?.mode).toBe('disclosure');
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+300);
  expect(frame().clock?.mode).toBe('selection');expect(visibleSlugs()).toEqual(['a','b','c']);
  await tick(time+800);expect(frame().clock?.mode).toBe('selection');expect(visibleSlugs()).toEqual(['a','b','c']);
});
it('settles memory choreography immediately when reduced motion changes mid-flight',async()=>{
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+100);
  expect(frame().clock?.mode).toBe('disclosure');
  reducedMotion=true;await act(async()=>motionChange());
  expect(frame().clock?.mode).not.toBe('disclosure');expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect([...latest().nodes.values()].every(node=>node.entranceLabelOpacity===1)).toBe(true);
  await tick(time+800);expect(frame().clock?.mode).not.toBe('disclosure');
});
it('cancels the memory frame and shader clock on route teardown',async()=>{
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+180);
  const renderer=latest();expect(getGraphNeuralRendererAnimationState(renderer)?.mode).toBe('disclosure');
  await act(async()=>router.navigate('/'));const count=renderer.frames.length;
  await tick(time+800);expect(renderer.frames).toHaveLength(count);expect(getGraphNeuralRendererAnimationState(renderer)).toBeNull();
});
it.each(['filter','neighborhood'] as const)('lets %s exploration replace a memory trace without a late reveal',async destination=>{
  await startMemoryOverview();reducedMotion=false;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+280);
  expect(frame().clock?.mode).toBe('disclosure');
  if(destination==='filter') {
    await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent?.startsWith('Alpha'))!.click());
  } else {
    await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="Find a concept"]')!.focus());
    await act(async()=>host.querySelector<HTMLButtonElement>('#graph-node-index [aria-label="Explore Alpha neighborhood, 3 notes"]')!.click());
  }
  await tick(time+500);expect(frame().clock?.mode).not.toBe('disclosure');
  const visible=visibleSlugs();await tick(time+800);expect(visibleSlugs()).toEqual(visible);
  if(destination==='neighborhood') expect(visible).toEqual(['a','b','c']);
  else expect([...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent?.startsWith('Alpha'))?.getAttribute('aria-pressed')).toBe('true');
});
it.each([true,false])('reveals only the hovered note’s cross-neighborhood links in open memory (neural: %s)',async neural=>{
  useTwoNeighborhoods();
  data.edges.push({source:'a',target:'e',weight:.01});
  if(!neural) vi.spyOn(console,'warn').mockImplementation(()=>{});
  rendererCapabilities.neural=neural;reducedMotion=true;
  await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  const positions=notePositions();await clickMemory();await act(async()=>vi.advanceTimersByTime(100));
  const edge=(source:string,target:string)=>latest().edges.get(latest().graph.edge(source,target)!)!;
  expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect([...latest().edges.values()].filter(edge=>!edge.hidden)).toHaveLength(6);
  expect(edge('c','d').hidden).toBe(true);expect(edge('a','e').hidden).toBe(true);
  await act(async()=>latest().emit('enterNode',{node:'c'}));
  expect(edge('c','d').hidden).toBe(false);expect(edge('a','e').hidden).toBe(true);
  await act(async()=>latest().emit('enterNode',{node:'d'}));
  expect(edge('c','d').hidden).toBe(false);expect(edge('a','e').hidden).toBe(true);
  await act(async()=>latest().emit('enterNode',{node:'a'}));
  expect(edge('c','d').hidden).toBe(true);expect(edge('a','e').hidden).toBe(false);
  await act(async()=>latest().emit('leaveNode',{}));await tick(time+400);
  expect(edge('c','d').hidden).toBe(true);expect(edge('a','e').hidden).toBe(true);
  expect(edge('a','b').hidden).toBe(false);expect(edge('d','e').hidden).toBe(false);
  expect(visibleSlugs()).toEqual(allMemorySlugs);expect(notePositions()).toEqual(positions);
  await act(async()=>latest().emit('clickNode',{node:'c'}));await tick(time+400);
  expect(edge('c','d').hidden).toBe(false);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());await tick(time+400);
  expect(edge('c','d').hidden).toBe(true);
});
it.each([
  {neural:true,hover:false},{neural:true,hover:true},
  {neural:false,hover:false},{neural:false,hover:true},
])('does not flash hidden cross-neighborhood links while selecting from open memory (neural: $neural, hover: $hover)',async({neural,hover})=>{
  useTwoNeighborhoods();data.edges.push({source:'a',target:'e',weight:.01});
  rendererCapabilities.neural=neural;
  if(!neural) vi.spyOn(console,'warn').mockImplementation(()=>{});
  reducedMotion=true;await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  await clickMemory();await act(async()=>vi.advanceTimersByTime(100));reducedMotion=false;
  if(hover) await act(async()=>latest().emit('enterNode',{node:'c'}));
  const unrelated=latest().graph.edges().indexOf(latest().graph.edge('a','e')!);
  expect(frame().edges[unrelated].hidden).toBe(true);
  const startFrame=latest().frames.length;
  await act(async()=>latest().emit('clickNode',{node:'c'}));const start=time;
  for(const elapsed of [0,16,80,160,300,500]) {
    await tick(start+elapsed);
    expect(latest().frames.slice(startFrame).every(frame=>frame.edges[unrelated].hidden)).toBe(true);
  }
  expect(latest().edges.get(latest().graph.edge('c','d')!)?.hidden).toBe(false);
  expect(visibleSlugs()).toEqual(['a','b','c','d']);
});
it('keeps cross-neighborhood links hidden throughout memory opening and route restoration',async()=>{
  await startMemoryOverview();reducedMotion=false;
  const bridge=latest().graph.edge('c','d')!;
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());const start=time;
  for(const elapsed of [100,300,600]) {
    await tick(start+elapsed);expect(latest().edges.get(bridge)?.hidden).toBe(true);
  }
  expect([...latest().edges.values()].filter(edge=>!edge.hidden)).toHaveLength(6);
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());
  expect(latest().edges.get(bridge)?.hidden).toBe(true);
  await tick(time+601);await clickMemory();
  reducedMotion=true;await act(async()=>router.navigate('/'));await act(async()=>router.navigate('/graph'));await tick(time+1);await tick(time+1);
  expect(latest().edges.get(latest().graph.edge('c','d')!)?.hidden).toBe(true);
  expect(visibleSlugs()).toEqual(allMemorySlugs);
});
it('toggles all notes and intra-neighborhood links without adding records or moving the layout',async()=>{
  await startMemoryOverview();const positions=notePositions();
  await clickMemory();expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect([...latest().edges.values()].filter(edge=>!edge.hidden)).toHaveLength(6);
  expect(latest().graph.order).toBe(7);expect(latest().graph.size).toBe(7);expect(notePositions()).toEqual(positions);
  expect(host.querySelector('.graph-memory-hub')?.getAttribute('aria-label')).toBe('Show neighborhoods');
  expect([...host.querySelectorAll<HTMLButtonElement>('.graph-neighborhood-anchor')].every(button=>button.hidden)).toBe(true);
  await clickMemory();expect(visibleSlugs()).toEqual(['alone']);expect(notePositions()).toEqual(positions);
  expect(host.querySelector('.graph-memory-hub')?.getAttribute('aria-label')).toBe('Show all notes');
});
it('keeps all-notes mode through zoom-out, resize and route return without rerunning layout',async()=>{
  await startMemoryOverview();await clickMemory();
  latest().camera.setState({ratio:latest().camera.state.ratio*3});await act(async()=>vi.advanceTimersByTime(100));await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(allMemorySlugs);
  latest().dimensions={width:660,height:800};await act(async()=>resizeGraph());await tick(time+1);
  expect(visibleSlugs()).toEqual(allMemorySlugs);
  const camera={...latest().camera.state},positions=notePositions();
  await act(async()=>router.navigate('/'));await act(async()=>router.navigate('/graph'));await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(allMemorySlugs);expect(latest().camera.state).toEqual(camera);expect(notePositions()).toEqual(positions);
  expect(graphViewCache.read(data.vaultId,graphTopologyKey(data))?.allNotes).toBe(true);
  expect(latest().camera.animate).not.toHaveBeenCalled();
});
it('returns selection and filters to all notes rather than collapsing an already active all-notes mode',async()=>{
  await startMemoryOverview();await clickMemory();
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);
  await clickMemory();expect(visibleSlugs()).toEqual(allMemorySlugs);expect(host.querySelector('#graph-node-details-title')).toBeNull();
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent?.startsWith('Alpha'))!.click());await tick(time+1);
  await clickMemory();expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect([...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')].find(button=>button.textContent==='All')?.getAttribute('aria-pressed')).toBe('true');
});
it.each([
  {width:1200,height:800,reduced:false},
  {width:1200,height:800,reduced:true},
  {width:768,height:1024,reduced:true},
  {width:390,height:844,reduced:false},
])('recenters and fits open memory when returning from a selected note (width: $width, reduced: $reduced)',async({width,height,reduced})=>{
  await startMemoryOverview();await clickMemory();latest().dimensions={width,height};
  for(const [index,slug] of latest().graph.nodes().entries()) latest().graph.mergeNodeAttributes(slug,{x:30+index*10,y:10+index*5});
  latest().refresh();
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);
  // All notes already fit but are tiny and off-center: revealing them alone is insufficient.
  latest().camera.setState({x:.5,y:.5,ratio:8});latest().camera.animate.mockClear();
  const positions=notePositions();reducedMotion=reduced;
  await clickMemory();
  expect(latest().camera.animate).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({duration:reduced?0:480,easing:'quadraticInOut'}));
  expect(latest().camera.state.ratio).toBeLessThan(8);
  const points=[latest().graphToViewport({x:0,y:0}),...latest().graph.nodes().map(slug=>latest().framedGraphToViewport(latest().getNodeDisplayData(slug)!))];
  for(const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(20);expect(point.x).toBeLessThanOrEqual(width-20);
    expect(point.y).toBeGreaterThanOrEqual(84);expect(point.y).toBeLessThanOrEqual(height-20);
  }
  expect((Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2).toBeCloseTo(width/2);
  expect((Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2).toBeCloseTo((84+height-20)/2);
  expect(visibleSlugs()).toEqual(allMemorySlugs);expect(notePositions()).toEqual(positions);
  expect(host.querySelector('#graph-node-details-title')).toBeNull();
  expect(host.querySelector('.graph-memory-hub')?.getAttribute('aria-label')).toBe('Show neighborhoods');
  expect([...latest().edges.values()].filter(edge=>!edge.hidden)).toHaveLength(6);
});
it('keeps the return-to-open-memory Fit running through detail-panel viewport updates',async()=>{
  await startMemoryOverview();await clickMemory();
  await act(async()=>latest().emit('clickNode',{node:'a'}));await tick(time+1);await tick(time+1);
  reducedMotion=false;latest().camera.animate.mockClear();let completeFit!:()=>void;
  latest().camera.isAnimated=()=>true;
  latest().camera.animate.mockImplementation(()=>new Promise<void>(resolve=>{completeFit=resolve;}));
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+1);
  expect(latest().camera.animate).toHaveBeenCalledWith(expect.any(Object),expect.objectContaining({duration:480}));
  latest().camera.animate.mockClear();cancelMotion.mockClear();
  await act(async()=>resizeGraph());await tick(time+1);
  expect(cancelMotion).not.toHaveBeenCalled();expect(latest().camera.animate).not.toHaveBeenCalled();
  await act(async()=>completeFit());await tick(time+601);await tick(time+1);
  expect(visibleSlugs()).toEqual(allMemorySlugs);
});
it('closing note details or clicking empty background does not collapse all notes',async()=>{
  await startMemoryOverview();await clickMemory();
  await act(async()=>latest().emit('clickNode',{node:'d'}));await tick(time+1);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());await tick(time+1);
  expect(visibleSlugs()).toEqual(allMemorySlugs);
  await act(async()=>latest().emit('clickStage',{event:{x:0,y:0}}));await tick(time+1);expect(visibleSlugs()).toEqual(allMemorySlugs);
});
it('keeps the camera anchored when opening all notes already inside the usable viewport',async()=>{
  await startMemoryOverview();
  for(const [i,slug] of latest().graph.nodes().entries()) latest().graph.mergeNodeAttributes(slug,{x:i*10,y:i*5});
  latest().refresh();latest().camera.setState({x:.5,y:.5,ratio:1});latest().camera.animate.mockClear();
  const camera={...latest().camera.state};await clickMemory();
  expect(visibleSlugs()).toEqual(allMemorySlugs);expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
});
it('reveals offscreen notes and explicit Fit includes the outermost real notes',async()=>{
  await startMemoryOverview();latest().camera.setState({x:2,y:2,ratio:.2});
  await clickMemory();expect(visibleSlugs()).toEqual(allMemorySlugs);
  for(const slug of allMemorySlugs) {
    const p=latest().framedGraphToViewport(latest().getNodeDisplayData(slug)!);
    expect(p.x).toBeGreaterThanOrEqual(20);expect(p.x).toBeLessThanOrEqual(1180);
    expect(p.y).toBeGreaterThanOrEqual(84);expect(p.y).toBeLessThanOrEqual(780);
  }
  latest().graph.mergeNodeAttributes('a',{x:900,y:0});latest().refresh();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);
  const outer=latest().framedGraphToViewport(latest().getNodeDisplayData('a')!);
  expect(outer.x).toBeLessThanOrEqual(1180);expect(outer.x).toBeGreaterThanOrEqual(20);
});
it('settles rapid show-hide-show at the last choice without a recall pulse',async()=>{
  await startMemoryOverview();reducedMotion=false;
  const hub=host.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  await act(async()=>hub.click());await tick(time+80);
  await act(async()=>hub.click());await tick(time+80);
  await act(async()=>hub.click());await tick(time+400);await tick(time+1);
  expect(visibleSlugs()).toEqual(allMemorySlugs);expect(frame().clock?.mode).not.toBe('selection');
  expect(host.querySelector('.graph-memory-hub')?.getAttribute('aria-label')).toBe('Show neighborhoods');
});
it('applies the all-notes reveal immediately with reduced motion and ignores focus alone',async()=>{
  await startMemoryOverview();const hub=host.querySelector<HTMLButtonElement>('.graph-memory-hub')!;
  await act(async()=>hub.focus());expect(visibleSlugs()).toEqual(['alone']);
  await act(async()=>hub.click());expect(visibleSlugs()).toEqual(allMemorySlugs);
  expect([...latest().nodes.values()].every(node=>node.entranceLabelOpacity===1)).toBe(true);
  expect(frame().clock?.mode).not.toBe('selection');
});
it('lets a neighborhood selection leave explicit all-notes mode',async()=>{
  await startMemoryOverview();await clickMemory();
  await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="Find a concept"]')!.focus());
  await act(async()=>host.querySelector<HTMLButtonElement>('#graph-node-index [aria-label="Explore Alpha neighborhood, 3 notes"]')!.click());await tick(time+1);
  expect(visibleSlugs()).toEqual(['a','b','c']);
  await clickMemory();expect(visibleSlugs()).toEqual(allMemorySlugs);
});

it.each([false,true])('keeps an already suitable camera when collapsing all notes back to neighborhoods (reduced motion: %s)',async motion=>{
  await startMemoryOverview();await clickMemory();reducedMotion=motion;const camera={...latest().camera.state};latest().camera.animate.mockClear();
  await act(async()=>host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.click());await tick(time+16);await tick(time+600);expect(visibleSlugs()).toEqual(['alone']);
  expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
});
it('does not let an earlier compact Fit capture the next all-notes reveal',async()=>{
  await startMemoryOverview();reducedMotion=false;
  let completeFit!:()=>void;
  latest().camera.animate.mockImplementation(()=>new Promise<void>(resolve=>{completeFit=resolve;}));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);
  const oldFit=completeFit;cancelMotion.mockClear();
  await clickMemory();expect(visibleSlugs()).toEqual(allMemorySlugs);expect(cancelMotion).toHaveBeenCalled();
  await act(async()=>oldFit());await tick(time+1);expect(visibleSlugs()).toEqual(allMemorySlugs);
});
it('keeps explicit all-notes Fit running through a reactive viewport measurement',async()=>{
  await startMemoryOverview();await clickMemory();reducedMotion=false;
  let completeFit!:()=>void;
  latest().camera.animate.mockImplementation(()=>new Promise<void>(resolve=>{completeFit=resolve;}));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);
  cancelMotion.mockClear();latest().camera.animate.mockClear();
  await act(async()=>resizeGraph());await tick(time+1);
  expect(cancelMotion).not.toHaveBeenCalled();expect(latest().camera.animate).not.toHaveBeenCalled();
  await act(async()=>completeFit());await tick(time+1);expect(visibleSlugs()).toEqual(allMemorySlugs);
});
it('keeps graphs with no neighborhoods fully visible without a synthetic hub record',async()=>{
  reducedMotion=true;data.edges=[];await mount();await act(async()=>completeLayout());await tick(1);await tick(2);
  expect(visibleSlugs()).toEqual(['a','b','isolated']);expect(latest().graph.order).toBe(3);expect(latest().graph.size).toBe(0);
  expect(host.querySelector<HTMLButtonElement>('.graph-memory-hub')!.hidden).toBe(true);
});
it('keeps an empty graph usable without a meaningless all-notes action',async()=>{
  data.nodes=[];data.edges=[];await mount();
  expect(host.textContent).toContain('No notes to map yet');expect(host.querySelector('.graph-memory-hub')).toBeNull();
});

it('restores usable neighborhood controls when collapsing from a far zoomed-out all-notes view',async()=>{
  await startMemoryOverview();
  expect(host.querySelectorAll('.graph-neighborhood-anchor:not([hidden])')).toHaveLength(2);
  await clickMemory();
  const zoomedOut=latest().camera.state.ratio*10;
  latest().camera.setState({ratio:zoomedOut});await act(async()=>vi.advanceTimersByTime(100));await tick(time+1);
  await clickMemory();
  expect(visibleSlugs()).toEqual(['alone']);
  expect(host.querySelectorAll('.graph-neighborhood-anchor:not([hidden])')).toHaveLength(2);
  expect(latest().camera.state.ratio).toBeLessThan(zoomedOut);
});
it('keeps zone dots available through repeated Zoom out button clicks and restores their captions on Fit',async()=>{
  await startMemoryOverview();
  const anchors=()=>[...host.querySelectorAll<HTMLButtonElement>('.graph-neighborhood-anchor')];
  for(let i=0;i<6;i++) {
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!.click());
    await act(async()=>vi.advanceTimersByTime(100));await tick(time+1);await tick(time+1);
    expect(anchors().every(button=>!button.hidden)).toBe(true);
  }
  expect(anchors().some(button=>button.querySelector<HTMLElement>('.graph-anchor-caption')!.hidden)).toBe(true);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);await tick(time+1);
  expect(anchors().every(button=>!button.hidden && !button.querySelector<HTMLElement>('.graph-anchor-caption')!.hidden)).toBe(true);
});

it.each([
  {name:'horizontal desktop',width:1200,height:800,x:900,y:0},
  {name:'vertical desktop',width:1200,height:800,x:0,y:900},
  {name:'horizontal narrow',width:390,height:844,x:900,y:0},
])('keeps the complete hub and off-center notes in view during reveal and Fit ($name)',async({width,height,x,y})=>{
  await startMemoryOverview();
  latest().dimensions={width,height};
  for(const [i,slug] of latest().graph.nodes().entries()) latest().graph.mergeNodeAttributes(slug,{x:x+i*2,y:y+i*3});
  latest().refresh();const positions=notePositions();
  await clickMemory();
  const assertFullMemory=()=>{
    const hub=latest().graphToViewport({x:0,y:0});
    expect(hub.x).toBeGreaterThanOrEqual(84);expect(hub.x).toBeLessThanOrEqual(width-84);
    expect(hub.y).toBeGreaterThanOrEqual(102);expect(hub.y).toBeLessThanOrEqual(height-74);
    for(const slug of allMemorySlugs) {
      const node=latest().framedGraphToViewport(latest().getNodeDisplayData(slug)!);
      expect(node.x).toBeGreaterThanOrEqual(20);expect(node.x).toBeLessThanOrEqual(width-20);
      expect(node.y).toBeGreaterThanOrEqual(84);expect(node.y).toBeLessThanOrEqual(height-20);
    }
    expect(host.querySelector('.graph-memory-hub')?.classList.contains('is-docked')).toBe(false);
    expect(notePositions()).toEqual(positions);expect(latest().graph.order).toBe(7);expect(latest().graph.size).toBe(7);
  };
  assertFullMemory();
  latest().camera.setState({x:2,y:2,ratio:.3});
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Fit graph"]')!.click());await tick(time+1);await tick(time+1);
  assertFullMemory();
});

it('preserves a suitable overview camera when closing an independent note opened from folded mode',async()=>{
  await startMemoryOverview();
  latest().camera.setState({x:latest().camera.state.x+.005,y:latest().camera.state.y+.005,ratio:latest().camera.state.ratio*1.04});latest().refresh();
  await act(async()=>latest().emit('clickNode',{node:'alone'}));await tick(time+1);await tick(time+1);
  const camera={...latest().camera.state};latest().camera.animate.mockClear();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Close node details"]')!.click());await tick(time+1);await tick(time+1);
  expect(latest().camera.state).toEqual(camera);expect(latest().camera.animate).not.toHaveBeenCalled();
  expect(visibleSlugs()).toEqual(['alone']);
});
