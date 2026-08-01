import { describe, expect, it } from "vitest";

import {
  createGraphNeuralAnimationController,
  type GraphNeuralAnimationSnapshot,
} from "../src/client/graph-neural-animation";
import {
  getGraphNeuralSignalFrame,
  GRAPH_NEURAL_TIMING,
  type GraphNeuralEdgeActivation,
} from "../src/client/graph-overview-model";

const edges: GraphNeuralEdgeActivation[] = [
  {
    edgeKey: "active->out",
    source: "active",
    target: "out",
    direction: "outgoing",
    receivingNode: "out",
    delayMs: 0,
  },
  {
    edgeKey: "other->out",
    source: "other",
    target: "out",
    direction: "incoming",
    receivingNode: "out",
    delayMs: 60,
  },
];

function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { callback: () => void; dueAt: number }>();
  const cancelledFrames: number[] = [];
  const cancelledTimers: number[] = [];

  return {
    now: () => now,
    requestFrame(callback: FrameRequestCallback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id: number) {
      cancelledFrames.push(id);
      frames.delete(id);
    },
    setTimer(callback: () => void, delayMs: number) {
      const id = nextId++;
      timers.set(id, { callback, dueAt: now + delayMs });
      return id;
    },
    cancelTimer(id: number) {
      cancelledTimers.push(id);
      timers.delete(id);
    },
    advanceTimersBy(milliseconds: number) {
      const target = now + milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= target)
          .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        now = timer.dueAt;
        timer.callback();
      }
      now = target;
    },
    runNextFrame(at: number) {
      const next = frames.entries().next().value as
        | [number, FrameRequestCallback]
        | undefined;
      if (!next) throw new Error("No animation frame is scheduled");
      const [id, callback] = next;
      frames.delete(id);
      now = at;
      callback(at);
    },
    firstTimerCallback() {
      return timers.values().next().value?.callback as (() => void) | undefined;
    },
    firstFrameCallback() {
      return frames.values().next().value as FrameRequestCallback | undefined;
    },
    get frameCount() {
      return frames.size;
    },
    get timerCount() {
      return timers.size;
    },
    cancelledFrames,
    cancelledTimers,
  };
}

function setup() {
  const scheduler = createFakeScheduler();
  const snapshots: GraphNeuralAnimationSnapshot[] = [];
  const controller = createGraphNeuralAnimationController({
    now: scheduler.now,
    requestFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
    setTimer: scheduler.setTimer,
    cancelTimer: scheduler.cancelTimer,
    onFrame: (snapshot) => snapshots.push(snapshot),
  });
  return { controller, scheduler, snapshots };
}

describe("graph neural animation controller", () => {
  it("owns hover intent and publishes one snapshot with maximum receiving-node scale", () => {
    const { controller, scheduler, snapshots } = setup();

    expect(controller.activate({
      activeSlug: "active",
      edges,
      mode: "hover",
      reducedMotion: false,
    })).toBe(true);
    expect(scheduler.timerCount).toBe(1);
    expect(scheduler.frameCount).toBe(0);

    scheduler.advanceTimersBy(GRAPH_NEURAL_TIMING.hoverIntentMs);
    expect(scheduler.frameCount).toBe(1);
    scheduler.runNextFrame(GRAPH_NEURAL_TIMING.hoverIntentMs + 650);

    const snapshot = controller.getSnapshot();
    expect(snapshot.edges.get("active->out")?.primaryProgress).toBeGreaterThan(0);
    expect(snapshot.nodeScales.get("out")).toBe(
      Math.max(
        getGraphNeuralSignalFrame(650, 0, "hover", false).arrivalScale,
        getGraphNeuralSignalFrame(650, 60, "hover", false).arrivalScale,
      ),
    );
    expect(snapshots.at(-1)).toBe(snapshot);
  });

  it("keeps selection precedence while allowing a new selection to replace it", () => {
    const { controller, scheduler } = setup();
    controller.activate({
      activeSlug: "selected",
      edges,
      mode: "selection",
      reducedMotion: false,
    });
    expect(scheduler.frameCount).toBe(1);

    expect(controller.activate({
      activeSlug: "hovered",
      edges,
      mode: "hover",
      reducedMotion: false,
    })).toBe(false);
    expect(scheduler.timerCount).toBe(0);
    expect(controller.getSnapshot().activeSlug).toBe("selected");

    expect(controller.activate({
      activeSlug: "replacement",
      edges,
      mode: "selection",
      reducedMotion: false,
    })).toBe(true);
    expect(scheduler.cancelledFrames).toHaveLength(1);
    expect(scheduler.frameCount).toBe(1);
    expect(controller.getSnapshot().activeSlug).toBe("replacement");
  });

  it("fades a released hover for 180ms but does not release a selection", () => {
    const { controller, scheduler } = setup();
    controller.activate({ activeSlug: "active", edges, mode: "hover", reducedMotion: false });
    scheduler.advanceTimersBy(GRAPH_NEURAL_TIMING.hoverIntentMs);
    scheduler.runNextFrame(GRAPH_NEURAL_TIMING.hoverIntentMs + 500);
    const initialIntensity = controller
      .getSnapshot()
      .edges.get("active->out")?.edgeIntensity;

    controller.releaseHover();
    scheduler.runNextFrame(
      GRAPH_NEURAL_TIMING.hoverIntentMs + 500 + GRAPH_NEURAL_TIMING.releaseMs / 2,
    );
    expect(controller.getSnapshot().edges.get("active->out")?.edgeIntensity).toBeCloseTo(
      (initialIntensity ?? 0) / 2,
    );
    scheduler.runNextFrame(
      GRAPH_NEURAL_TIMING.hoverIntentMs + 500 + GRAPH_NEURAL_TIMING.releaseMs,
    );
    expect(controller.getSnapshot()).toMatchObject({ activeSlug: null, mode: null });
    expect(controller.getSnapshot().edges.size).toBe(0);
    expect(scheduler.frameCount).toBe(0);

    controller.activate({
      activeSlug: "selected",
      edges,
      mode: "selection",
      reducedMotion: false,
    });
    controller.releaseHover();
    expect(controller.getSnapshot().activeSlug).toBe("selected");
    expect(scheduler.frameCount).toBe(1);
  });

  it("publishes reduced motion immediately without scheduling work", () => {
    const { controller, scheduler, snapshots } = setup();

    controller.activate({
      activeSlug: "selected",
      edges,
      mode: "selection",
      reducedMotion: true,
    });

    expect(scheduler.frameCount).toBe(0);
    expect(snapshots).toHaveLength(1);
    expect(controller.getSnapshot().edges.get("active->out")).toMatchObject({
      phase: "selected",
      edgeIntensity: 1,
      complete: true,
    });
  });

  it("stops scheduling after every edge completes", () => {
    const { controller, scheduler } = setup();
    controller.activate({
      activeSlug: "selected",
      edges,
      mode: "selection",
      reducedMotion: false,
    });

    scheduler.runNextFrame(2_000);

    expect([...controller.getSnapshot().edges.values()].every((frame) => frame.complete)).toBe(
      true,
    );
    expect(scheduler.frameCount).toBe(0);
  });

  it("does not restart a completed hover cycle for the same node", () => {
    const { controller, scheduler } = setup();
    controller.activate({ activeSlug: "active", edges, mode: "hover", reducedMotion: false });
    scheduler.advanceTimersBy(GRAPH_NEURAL_TIMING.hoverIntentMs);
    scheduler.runNextFrame(GRAPH_NEURAL_TIMING.hoverIntentMs + 2_000);

    expect(controller.activate({
      activeSlug: "active",
      edges,
      mode: "hover",
      reducedMotion: false,
    })).toBe(false);
    expect(scheduler.timerCount).toBe(0);
    expect(scheduler.frameCount).toBe(0);
  });

  it("clears a selected network immediately", () => {
    const { controller, scheduler, snapshots } = setup();
    controller.activate({
      activeSlug: "selected",
      edges,
      mode: "selection",
      reducedMotion: false,
    });

    controller.clearSelection();

    expect(scheduler.cancelledFrames).toHaveLength(1);
    expect(controller.getSnapshot()).toMatchObject({ activeSlug: null, mode: null });
    expect(controller.getSnapshot().edges.size).toBe(0);
    expect(snapshots.at(-1)).toBe(controller.getSnapshot());
  });

  it("cancels hover-intent timers and animation frames on destroy and rejects stale callbacks", () => {
    const pending = setup();
    pending.controller.activate({
      activeSlug: "active",
      edges,
      mode: "hover",
      reducedMotion: false,
    });
    const staleTimer = pending.scheduler.firstTimerCallback();
    pending.controller.destroy();
    staleTimer?.();
    expect(pending.scheduler.cancelledTimers).toHaveLength(1);
    expect(pending.scheduler.frameCount).toBe(0);
    expect(pending.snapshots).toHaveLength(0);

    const running = setup();
    running.controller.activate({
      activeSlug: "selected",
      edges,
      mode: "selection",
      reducedMotion: false,
    });
    const staleFrame = running.scheduler.firstFrameCallback();
    const snapshotCount = running.snapshots.length;
    running.controller.destroy();
    staleFrame?.(2_000);
    expect(running.scheduler.cancelledFrames).toHaveLength(1);
    expect(running.snapshots).toHaveLength(snapshotCount);
  });
});
