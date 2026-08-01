import {
  getGraphNeuralSignalFrame,
  GRAPH_NEURAL_TIMING,
  type GraphNeuralActivationMode,
  type GraphNeuralEdgeActivation,
  type GraphNeuralSignalFrame,
} from "./graph-overview-model";

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

interface GraphNeuralAnimationControllerOptions {
  onFrame(snapshot: GraphNeuralAnimationSnapshot): void;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  setTimer?: (callback: () => void, delayMs: number) => number;
  cancelTimer?: (handle: number) => void;
}

type GraphNeuralActivationInput = Parameters<GraphNeuralAnimationController["activate"]>[0];

const createEmptySnapshot = (): GraphNeuralAnimationSnapshot =>
  Object.freeze({
    activeSlug: null,
    mode: null,
    edges: new Map<string, GraphNeuralSignalFrame>(),
    nodeScales: new Map<string, number>(),
  });

function createSnapshot(
  input: GraphNeuralActivationInput,
  elapsedMs: number,
): GraphNeuralAnimationSnapshot {
  const edgeFrames = new Map<string, GraphNeuralSignalFrame>();
  const nodeScales = new Map<string, number>();

  for (const edge of input.edges) {
    const frame = getGraphNeuralSignalFrame(
      elapsedMs,
      edge.delayMs,
      input.mode,
      input.reducedMotion,
    );
    edgeFrames.set(edge.edgeKey, frame);
    nodeScales.set(
      edge.receivingNode,
      Math.max(nodeScales.get(edge.receivingNode) ?? 1, frame.arrivalScale),
    );
  }

  return Object.freeze({
    activeSlug: input.activeSlug,
    mode: input.mode,
    edges: edgeFrames,
    nodeScales,
  });
}

export function createGraphNeuralAnimationController(
  options: GraphNeuralAnimationControllerOptions,
): GraphNeuralAnimationController {
  const now = options.now ?? (() => performance.now());
  const requestFrame =
    options.requestFrame ?? ((callback: FrameRequestCallback) => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle));
  const setTimer =
    options.setTimer ??
    ((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs) as unknown as number);
  const cancelTimer =
    options.cancelTimer ??
    ((handle: number) => globalThis.clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));

  let snapshot = createEmptySnapshot();
  let activeInput: GraphNeuralActivationInput | null = null;
  let animationStart = 0;
  let animationFrame: number | null = null;
  let hoverIntentTimer: number | null = null;
  let pendingHover: GraphNeuralActivationInput | null = null;
  let frameGeneration = 0;
  let hoverIntentGeneration = 0;
  let destroyed = false;
  let releasingHover = false;

  const publish = (nextSnapshot: GraphNeuralAnimationSnapshot) => {
    if (destroyed) return;
    snapshot = nextSnapshot;
    options.onFrame(nextSnapshot);
  };

  const cancelScheduledFrame = () => {
    if (animationFrame === null) return;
    const handle = animationFrame;
    animationFrame = null;
    cancelFrame(handle);
  };

  const cancelHoverIntent = () => {
    hoverIntentGeneration += 1;
    pendingHover = null;
    if (hoverIntentTimer === null) return;
    const handle = hoverIntentTimer;
    hoverIntentTimer = null;
    cancelTimer(handle);
  };

  const scheduleActivationFrame = (generation: number) => {
    animationFrame = requestFrame(() => {
      animationFrame = null;
      if (destroyed || generation !== frameGeneration || !activeInput) return;

      const nextSnapshot = createSnapshot(activeInput, now() - animationStart);
      publish(nextSnapshot);
      if ([...nextSnapshot.edges.values()].every((frame) => frame.complete)) return;
      scheduleActivationFrame(generation);
    });
  };

  const startActivation = (input: GraphNeuralActivationInput) => {
    cancelScheduledFrame();
    frameGeneration += 1;
    releasingHover = false;
    activeInput = input;
    animationStart = now();

    const initialSnapshot = createSnapshot(input, 0);
    publish(initialSnapshot);
    if (
      input.reducedMotion ||
      [...initialSnapshot.edges.values()].every((frame) => frame.complete)
    ) {
      return;
    }
    scheduleActivationFrame(frameGeneration);
  };

  const reset = (notify: boolean) => {
    cancelScheduledFrame();
    frameGeneration += 1;
    activeInput = null;
    releasingHover = false;
    const emptySnapshot = createEmptySnapshot();
    if (notify) publish(emptySnapshot);
    else snapshot = emptySnapshot;
  };

  const scheduleReleaseFrame = (
    generation: number,
    releaseStart: number,
    releaseSnapshot: GraphNeuralAnimationSnapshot,
    releaseInput: GraphNeuralActivationInput,
  ) => {
    animationFrame = requestFrame(() => {
      animationFrame = null;
      if (destroyed || generation !== frameGeneration || !releasingHover) return;

      const progress = Math.max(
        0,
        Math.min(1, (now() - releaseStart) / GRAPH_NEURAL_TIMING.releaseMs),
      );
      if (progress >= 1) {
        reset(true);
        return;
      }

      const remaining = 1 - progress;
      const edgeFrames = new Map<string, GraphNeuralSignalFrame>();
      const nodeScales = new Map<string, number>();
      for (const edge of releaseInput.edges) {
        const frame = releaseSnapshot.edges.get(edge.edgeKey);
        if (!frame) continue;
        const fadedFrame = {
          ...frame,
          edgeIntensity: frame.edgeIntensity * remaining,
          arrivalScale: 1 + (frame.arrivalScale - 1) * remaining,
          complete: false,
        };
        edgeFrames.set(edge.edgeKey, fadedFrame);
        nodeScales.set(
          edge.receivingNode,
          Math.max(nodeScales.get(edge.receivingNode) ?? 1, fadedFrame.arrivalScale),
        );
      }
      publish(
        Object.freeze({
          activeSlug: releaseInput.activeSlug,
          mode: releaseInput.mode,
          edges: edgeFrames,
          nodeScales,
        }),
      );
      scheduleReleaseFrame(generation, releaseStart, releaseSnapshot, releaseInput);
    });
  };

  return {
    activate(input) {
      if (destroyed) return false;
      if (input.mode === "hover") {
        if (activeInput?.mode === "selection") return false;
        if (
          !releasingHover &&
          (activeInput?.activeSlug === input.activeSlug ||
            pendingHover?.activeSlug === input.activeSlug)
        ) {
          return false;
        }

        cancelHoverIntent();
        pendingHover = input;
        const generation = hoverIntentGeneration;
        hoverIntentTimer = setTimer(() => {
          hoverIntentTimer = null;
          if (destroyed || generation !== hoverIntentGeneration || pendingHover !== input) return;
          pendingHover = null;
          startActivation(input);
        }, GRAPH_NEURAL_TIMING.hoverIntentMs);
        return true;
      }

      cancelHoverIntent();
      startActivation(input);
      return true;
    },

    releaseHover() {
      if (destroyed) return;
      cancelHoverIntent();
      if (activeInput?.mode !== "hover") return;
      if (activeInput.reducedMotion) {
        reset(true);
        return;
      }

      cancelScheduledFrame();
      frameGeneration += 1;
      releasingHover = true;
      const generation = frameGeneration;
      scheduleReleaseFrame(generation, now(), snapshot, activeInput);
    },

    clearSelection() {
      if (destroyed || activeInput?.mode !== "selection") return;
      reset(true);
    },

    getSnapshot() {
      return snapshot;
    },

    destroy() {
      if (destroyed) return;
      cancelHoverIntent();
      cancelScheduledFrame();
      frameGeneration += 1;
      destroyed = true;
      activeInput = null;
      releasingHover = false;
      snapshot = createEmptySnapshot();
    },
  };
}
