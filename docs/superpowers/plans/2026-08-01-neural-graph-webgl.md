# Neural Graph WebGL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quiet-at-rest, direction-aware WebGL signal animations to the Knowledge Graph that activate only the hovered or selected node's direct connections.

**Architecture:** Keep Sigma's standard line renderer at rest and register one custom `neural` edge program for active links. Resolve the active direct-edge set once, drive it with a single non-React animation controller, feed per-edge progress into the Sigma reducer, and refresh only affected edges and nodes.

**Tech Stack:** React 19, TypeScript, Sigma 3, Graphology, WebGL 1-compatible GLSL, Vitest, Playwright CLI

## Global Constraints

- Keep the graph quiet at rest and run zero animation frames while idle.
- Animate direct connections only; do not add multi-hop propagation.
- Outgoing signals are blue and travel from source to target; incoming signals are amber and also respect source-to-target direction.
- Hover plays one signal cycle. Selection adds one softer echo and retains a static direct-network highlight.
- Selection takes precedence over hover until the detail panel is closed or a different node is selected.
- Use static color and thickness changes for `prefers-reduced-motion: reduce`.
- Keep straight edge geometry in this iteration.
- Add no production dependencies.
- Preserve search, labels, camera controls, focus isolation, detail panels, and mobile behavior.

---

### Task 1: Model direct neural activations and timing

**Files:**
- Modify: `src/client/graph-overview-model.ts`
- Test: `tests/graph-overview-model.test.ts`

**Interfaces:**
- Consumes: existing `GraphEdge` records and `${source}->${target}` edge keys used by `buildGraph`
- Produces: `GRAPH_NEURAL_TIMING`, `GraphNeuralActivationMode`, `GraphNeuralEdgeActivation`, `GraphNeuralSignalFrame`, `getGraphNeuralDirectEdges()`, and `getGraphNeuralSignalFrame()`

- [ ] **Step 1: Write failing direct-edge and timing tests**

Extend the model imports and add focused tests:

```ts
const edges = [
  { source: "active", target: "out", weight: 1 },
  { source: "in", target: "active", weight: 2 },
  { source: "elsewhere", target: "other", weight: 1 },
];

expect(getGraphNeuralDirectEdges("active", edges)).toEqual([
  expect.objectContaining({
    edgeKey: "active->out",
    direction: "outgoing",
    receivingNode: "out",
  }),
  expect.objectContaining({
    edgeKey: "in->active",
    direction: "incoming",
    receivingNode: "active",
  }),
]);

const first = getGraphNeuralDirectEdges("active", edges);
const second = getGraphNeuralDirectEdges("active", [...edges].reverse());
expect(first.map(({ edgeKey, delayMs }) => [edgeKey, delayMs]).sort()).toEqual(
  second.map(({ edgeKey, delayMs }) => [edgeKey, delayMs]).sort(),
);
expect(first.every(({ delayMs }) => delayMs >= 0 && delayMs <= 100)).toBe(true);

const beforeTravel = getGraphNeuralSignalFrame(180, 20, "hover", false);
expect(beforeTravel.primaryProgress).toBeNull();
expect(beforeTravel.phase).toBe("charging");

const transmitting = getGraphNeuralSignalFrame(500, 20, "hover", false);
expect(transmitting.primaryProgress).toBeGreaterThan(0);
expect(transmitting.primaryProgress).toBeLessThan(1);
expect(transmitting.echoProgress).toBeNull();

const selection = getGraphNeuralSignalFrame(850, 0, "selection", false);
expect(selection.echoProgress).not.toBeNull();

expect(getGraphNeuralSignalFrame(0, 0, "selection", true)).toMatchObject({
  phase: "selected",
  primaryProgress: null,
  echoProgress: null,
  edgeIntensity: 1,
  complete: true,
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/graph-overview-model.test.ts
```

Expected: FAIL because the neural activation exports do not exist.

- [ ] **Step 3: Add the activation types and deterministic direct-edge resolver**

Add these public contracts near the other graph interfaces:

```ts
export type GraphNeuralActivationMode = "hover" | "selection";
export type GraphNeuralDirection = "incoming" | "outgoing";

export interface GraphNeuralEdgeActivation {
  edgeKey: string;
  source: string;
  target: string;
  direction: GraphNeuralDirection;
  receivingNode: string;
  delayMs: number;
}

export interface GraphNeuralSignalFrame {
  phase: "charging" | "transmitting" | "selected";
  primaryProgress: number | null;
  echoProgress: number | null;
  edgeIntensity: number;
  arrivalScale: number;
  complete: boolean;
}

export const GRAPH_NEURAL_TIMING = {
  hoverIntentMs: 70,
  chargeMs: 100,
  ignitionMs: 120,
  hoverTravelMs: 520,
  selectionTravelMs: 620,
  echoDelayMs: 180,
  arrivalMs: 140,
  releaseMs: 180,
  maximumStaggerMs: 100,
} as const;
```

Implement `getGraphNeuralDirectEdges(activeSlug, edges)` so it filters edges touching `activeSlug`, sorts by `${source}->${target}`, classifies direction relative to the active node, and derives `delayMs` from a stable string hash modulo `maximumStaggerMs + 1`. Never use array position or `Math.random()` for staggering.

- [ ] **Step 4: Add the pure frame calculation**

Implement `getGraphNeuralSignalFrame(elapsedMs, delayMs, mode, reducedMotion)` with clamped progress. Travel begins after charge plus ignition plus the edge delay. Selection begins its echo `echoDelayMs` after the primary begins. Compute arrival as a sine pulse over the final `arrivalMs` and return `arrivalScale` between `1` and `1.12`.

Reduced motion returns the static selected-shaped result from the test immediately. A completed hover frame retains a subdued `edgeIntensity` without scheduling more frames; a completed selection frame returns `phase: "selected"` and full static intensity.

- [ ] **Step 5: Run focused verification and commit**

Run:

```bash
pnpm exec vitest run tests/graph-overview-model.test.ts
pnpm run typecheck
git diff --check
git add src/client/graph-overview-model.ts tests/graph-overview-model.test.ts
git commit -m "feat: model neural graph signals"
```

Expected: model tests and typecheck pass, and the commit contains only the pure activation model.

---

### Task 2: Add the custom Sigma neural edge program

**Files:**
- Create: `src/client/graph-neural-edge-program.ts`
- Create: `tests/graph-neural-edge-program.test.ts`

**Interfaces:**
- Consumes: Sigma `EdgeProgram`, `EdgeDisplayData`, `NodeDisplayData`, `RenderParams`, and `floatColor`
- Produces: `NeuralEdgeProgram`, `NEURAL_EDGE_VERTEX_SHADER`, `NEURAL_EDGE_FRAGMENT_SHADER`, and `NeuralEdgeDisplayData`

- [ ] **Step 1: Write a failing shader contract test**

Create `tests/graph-neural-edge-program.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
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
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/graph-neural-edge-program.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement a module-safe rectangle edge program**

Subclass `EdgeProgram` and follow Sigma's installed `EdgeRectangleProgram` layout: six triangle vertices, `a_positionStart`, `a_positionEnd`, `a_normal`, packed color and picking ID, plus three per-edge float attributes:

```ts
export interface NeuralEdgeDisplayData extends EdgeDisplayData {
  neuralPrimaryProgress?: number;
  neuralEchoProgress?: number;
  neuralIntensity?: number;
}

export class NeuralEdgeProgram extends EdgeProgram<
  | "u_matrix"
  | "u_zoomRatio"
  | "u_sizeRatio"
  | "u_pixelRatio"
  | "u_correctionRatio"
  | "u_minEdgeThickness"
  | "u_feather"
> {
  getDefinition() {
    return {
      VERTICES: 6,
      VERTEX_SHADER_SOURCE: NEURAL_EDGE_VERTEX_SHADER,
      FRAGMENT_SHADER_SOURCE: NEURAL_EDGE_FRAGMENT_SHADER,
      METHOD: 0x0004,
      UNIFORMS,
      ATTRIBUTES,
      CONSTANT_ATTRIBUTES,
      CONSTANT_DATA: [[0, 1], [0, -1], [1, 1], [1, 1], [0, -1], [1, -1]],
    };
  }
}
```

Use numeric WebGL constants (`0x0004` triangles, `0x1406` float, `0x1401` unsigned byte) rather than reading `WebGLRenderingContext` at module evaluation. This keeps the module importable in the existing Node-based Vitest environment.

`processVisibleItem()` must write source/target positions, the normalized thickness vector, `floatColor(data.color)`, picking ID, `neuralPrimaryProgress ?? -1`, `neuralEchoProgress ?? -1`, and `neuralIntensity ?? 0` into the interleaved array.

- [ ] **Step 4: Implement the signal shader**

Pass `a_positionCoef` as `v_pathPosition` and add the signal values as flat per-edge varyings. In the fragment shader, preserve the picking branch and use this normal-rendering calculation:

```glsl
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
```

Use `-1` for inactive progress so the Gaussian signal falls outside the visible path. Set uniforms using the same camera ratios and antialiasing values as Sigma's rectangle program.

- [ ] **Step 5: Verify shader contracts, build compilation, and commit**

Run:

```bash
pnpm exec vitest run tests/graph-neural-edge-program.test.ts
pnpm run typecheck
pnpm run build
git diff --check
git add src/client/graph-neural-edge-program.ts tests/graph-neural-edge-program.test.ts
git commit -m "feat: add neural WebGL edge program"
```

Expected: the Node test imports the module without a browser-global failure, TypeScript accepts the Sigma program class, and Vite compiles the GLSL strings.

---

### Task 3: Build the single-loop neural animation controller

**Files:**
- Create: `src/client/graph-neural-animation.ts`
- Create: `tests/graph-neural-animation.test.ts`

**Interfaces:**
- Consumes: `GraphNeuralActivationMode`, `GraphNeuralEdgeActivation`, and `getGraphNeuralSignalFrame()` from `graph-overview-model.ts`
- Produces: `createGraphNeuralAnimationController()`, `GraphNeuralAnimationController`, and `GraphNeuralAnimationSnapshot`

- [ ] **Step 1: Write failing controller lifecycle tests with a fake scheduler**

Use injected timing functions rather than fake browser globals:

```ts
let now = 0;
let nextFrame: FrameRequestCallback | null = null;
const snapshots: GraphNeuralAnimationSnapshot[] = [];
const controller = createGraphNeuralAnimationController({
  now: () => now,
  requestFrame: (callback) => {
    nextFrame = callback;
    return 1;
  },
  cancelFrame: () => {
    nextFrame = null;
  },
  onFrame: (snapshot) => snapshots.push(snapshot),
});

expect(nextFrame).toBeNull();
controller.activate({ activeSlug: "active", edges, mode: "hover", reducedMotion: false });
expect(nextFrame).not.toBeNull();
now = 500;
nextFrame?.(now);
expect(controller.getSnapshot().edges.get("active->out")?.primaryProgress).toBeGreaterThan(0);
```

Add cases proving that selection ignores subsequent hover activation, a new selection replaces the old one, `releaseHover()` affects hover but not selection, reduced motion schedules no frame, completed motion stops scheduling, and `destroy()` cancels pending work.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/graph-neural-animation.test.ts
```

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the controller contracts**

Use these public shapes:

```ts
export interface GraphNeuralAnimationSnapshot {
  activeSlug: string | null;
  mode: GraphNeuralActivationMode | null;
  edges: ReadonlyMap<string, GraphNeuralSignalFrame>;
  nodeScales: ReadonlyMap<string, number>;
}

export interface GraphNeuralAnimationController {
  activate(input: {
    activeSlug: string;
    edges: GraphNeuralEdgeActivation[];
    mode: GraphNeuralActivationMode;
    reducedMotion: boolean;
  }): boolean;
  releaseHover(): void;
  clearSelection(): void;
  getSnapshot(): GraphNeuralAnimationSnapshot;
  destroy(): void;
}
```

`activate()` resolves no graph data; it accepts the precomputed edge list. On each frame, calculate every active edge's pure signal frame and combine arrival scales by receiving node using the maximum value. Send one immutable snapshot to `onFrame`. Keep the controller's mutable maps private.

- [ ] **Step 4: Implement precedence, release, and cancellation**

- Ignore `mode: "hover"` activation when the current mode is `selection`.
- Re-entering the same hovered node must not restart its completed cycle.
- Replacing a selection cancels the prior frame before starting the next one.
- `releaseHover()` runs the approved 180ms intensity fade, then resets to the empty snapshot.
- `clearSelection()` clears the static selected network immediately; the existing route isolation animation already provides the visual stage transition.
- `destroy()` cancels both hover-intent timers and animation frames and makes later callbacks no-ops.

- [ ] **Step 5: Run focused verification and commit**

Run:

```bash
pnpm exec vitest run tests/graph-neural-animation.test.ts tests/graph-overview-model.test.ts
pnpm run typecheck
git diff --check
git add src/client/graph-neural-animation.ts tests/graph-neural-animation.test.ts
git commit -m "feat: control neural graph animation"
```

Expected: controller lifecycle tests pass with no real timers or animation frames.

---

### Task 4: Integrate neural rendering with the graph route

**Files:**
- Modify: `src/client/routes/graph-route.tsx:1-210` (imports, theme renderer contracts, graph construction helpers)
- Modify: `src/client/routes/graph-route.tsx:1060-1510` (refs, reducers, Sigma setup, node events, cleanup)
- Modify: `tests/graph-overview-model.test.ts` (route-safe fallback and renderer settings assertions)

**Interfaces:**
- Consumes: `NeuralEdgeProgram`, `createGraphNeuralAnimationController()`, `getGraphNeuralDirectEdges()`, and current Sigma reducers/events
- Produces: active neural edge display attributes and lifecycle integration for search, graph click, stage click, detail navigation, hover, theme updates, and unmount

- [ ] **Step 1: Write failing integration-contract tests**

Export a small settings helper from the route and test it without constructing WebGL:

```ts
expect(getGraphEdgeProgramClasses(true)).toEqual({ neural: NeuralEdgeProgram });
expect(getGraphEdgeProgramClasses(false)).toEqual({});
```

Add a pure reducer-attribute test using an outgoing frame:

```ts
expect(
  getGraphNeuralEdgeDisplayAttributes(
    {
      phase: "transmitting",
      primaryProgress: 0.4,
      echoProgress: null,
      edgeIntensity: 0.8,
      arrivalScale: 1,
      complete: false,
    },
    "#00628d",
  ),
).toMatchObject({
  type: "neural",
  color: "#00628d",
  neuralPrimaryProgress: 0.4,
  neuralEchoProgress: -1,
  neuralIntensity: 0.8,
});
```

Keep the existing `vi.mock("sigma", ...)` import-safe. Import `NeuralEdgeProgram` directly in the test to prove that the new renderer module still works in Node.

- [ ] **Step 2: Run the focused route/model test and confirm it fails**

Run:

```bash
pnpm exec vitest run tests/graph-overview-model.test.ts
```

Expected: FAIL because the settings and display-attribute helpers do not exist.

- [ ] **Step 3: Register the renderer with a static fallback**

Add `getGraphEdgeProgramClasses(neuralEnabled)` and register it in Sigma settings:

```ts
edgeProgramClasses: getGraphEdgeProgramClasses(neuralEnabled),
```

Create Sigma through a local `createRenderer(neuralEnabled)` function. Attempt the neural renderer first. If shader/program construction throws, clear the partially created container children, create Sigma again with `neuralEnabled = false`, and preserve the existing line/arrow reducer treatment. Emit at most one `console.warn` describing the disabled enhancement; do not throw into the route.

- [ ] **Step 4: Wire the controller to partial Sigma refreshes**

Create `neuralControllerRef` beside the existing hover, focus, pulse, and isolation refs. The controller `onFrame` callback must call:

```ts
sigmaRef.current?.refresh({
  partialGraph: {
    edges: [...snapshot.edges.keys()],
    nodes: [...new Set([snapshot.activeSlug, ...snapshot.nodeScales.keys()].filter(Boolean))],
  },
  schedule: true,
});
```

Do not use React state in this callback. Store the latest snapshot in a ref consumed by `edgeReducer` and `nodeReducer`.

In `edgeReducer`, apply the existing focus/hover visibility rules first. When an active neural frame exists and fallback is not active, set `type: "neural"`, a size large enough for the 4-6px shader band, semantic incoming/outgoing color, and the three neural display attributes. A selected direct edge with completed motion keeps the neural program with `primaryProgress` and `echoProgress` at `-1` and `neuralIntensity: 1`.

In `nodeReducer`, multiply the existing size result by the controller's active charge scale or receiving-node arrival scale. Preserve current isolation, neighbor emphasis, linked-list pulse, label, z-index, and theme behavior.

- [ ] **Step 5: Connect every activation path**

- `enterNode`: after `hoverIntentMs`, activate hover only when no focused selection exists.
- `leaveNode`: cancel hover intent and call `releaseHover()`.
- `clickNode`: activate selection before the existing focus isolation and camera movement.
- `clickStage` and detail close: call `clearSelection()`.
- Search selection and detail-neighbor click: invoke the same selection activation callback used by graph clicks.
- Detail-list neighbor hover: keep its current node pulse and do not replace the selected neural network.
- Touch selection: reuse click activation; add no hover-only touch path.
- Cleanup: destroy the controller before `sigma.kill()` and clear its refs.

- [ ] **Step 6: Run focused and full automated verification**

Run:

```bash
pnpm exec vitest run tests/graph-overview-model.test.ts tests/graph-neural-animation.test.ts tests/graph-neural-edge-program.test.ts
pnpm run typecheck
pnpm run lint
git diff --check
mkdir -p /private/tmp/wiki-os-test-neural-graph
HOME=/private/tmp/wiki-os-test-neural-graph pnpm test
pnpm run build
```

Expected: focused tests, typecheck, lint, full tests, and production build pass without adding a package.

- [ ] **Step 7: Commit the route integration**

```bash
git add src/client/routes/graph-route.tsx tests/graph-overview-model.test.ts
git commit -m "feat: animate direct graph connections"
```

---

### Task 5: Verify motion, fallback, themes, and idle cost in a real browser

**Files:**
- Modify only if verification finds a defect: the file responsible for that defect and its focused test
- Artifacts: `output/playwright/neural-graph-*.png` (ignored; do not commit)

**Interfaces:**
- Consumes: the completed `/graph` experience running through `pnpm dev`
- Produces: verified cross-interaction behavior with no idle animation loop or console errors

- [ ] **Step 1: Start the app and open the graph**

Run:

```bash
pnpm dev
```

Open `http://localhost:5211/graph` with Playwright CLI, capture a snapshot, and verify the page reports the expected concept and connection counts.

- [ ] **Step 2: Verify quiet-at-rest and hover transmission**

In browser devtools or a temporary Playwright evaluation, count `requestAnimationFrame` callbacks attributable to the controller for one second before interaction; the controller must schedule none. Hover a connected node and verify:

- only direct edges brighten,
- outgoing signals travel source-to-target in blue,
- incoming signals travel source-to-target in amber,
- one cycle plays without looping,
- receiving nodes pulse once,
- leaving fades the network to rest,
- no labels disappear while moving the camera.

Capture `output/playwright/neural-graph-hover.png`.

- [ ] **Step 3: Verify selection and precedence**

Click the same node and verify a primary signal plus softer echo, followed by a static direct-network highlight. Hover another graph node and confirm it does not replace the selection. Click a connected neighbor and confirm the activation transfers cleanly. Close the detail panel and confirm the graph returns to idle.

Capture `output/playwright/neural-graph-selected.png`.

- [ ] **Step 4: Verify camera, mobile, themes, and reduced motion**

- Pan and zoom during transmission; the signal must remain attached to its link.
- At a mobile viewport, tap a node and confirm selection activation without hover dependence.
- Switch through all supported color themes and confirm semantic colors remain readable.
- Emulate `prefers-reduced-motion: reduce`; confirm static highlights appear with no traveling signal, pulse, or RAF loop.
- Confirm the browser console contains no shader compilation or runtime errors.

- [ ] **Step 5: Exercise the static fallback**

Temporarily force `getGraphEdgeProgramClasses(false)` in the local working copy, reload `/graph`, and verify search, selection, line/arrow highlighting, navigation, labels, and detail panels remain functional. Revert the temporary edit immediately and confirm `git diff` contains no fallback-test modification.

- [ ] **Step 6: Run final verification and inspect the diff**

Run:

```bash
pnpm run lint
pnpm run typecheck
mkdir -p /private/tmp/wiki-os-test-neural-graph-final
HOME=/private/tmp/wiki-os-test-neural-graph-final pnpm test
pnpm run build
git diff --check
git status --short
```

Expected: every command passes; only intentionally ignored Playwright artifacts remain outside Git status; committed source contains no dependency or lockfile change.

If verification required a fix, add a regression test, rerun the focused and final commands, then commit only that fix:

```bash
git add src/client/graph-overview-model.ts src/client/graph-neural-edge-program.ts src/client/graph-neural-animation.ts src/client/routes/graph-route.tsx tests/graph-overview-model.test.ts tests/graph-neural-edge-program.test.ts tests/graph-neural-animation.test.ts
git commit -m "fix: harden neural graph rendering"
```
