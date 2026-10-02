export const GRAPH_ENTRANCE_MS = 1100;
export const GRAPH_ENTRANCE_TIMING = {
  nodeRevealMs: 460,
  maximumDelayMs: 360,
  labelStartMs: 350,
  labelRevealMs: 550,
  edgeStartMs: 120,
  edgeTravelMs: 560,
} as const;

export const graphRevealEase = (value: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);

export function entranceFrame(elapsed: number, delay: number) {
  return {
    node: graphRevealEase((elapsed - delay) / GRAPH_ENTRANCE_TIMING.nodeRevealMs),
    label: graphRevealEase((elapsed - GRAPH_ENTRANCE_TIMING.labelStartMs) / GRAPH_ENTRANCE_TIMING.labelRevealMs),
  };
}

export function buildEntranceDelays(nodes: string[], edges: { source: string; target: string }[]) {
  const neighbors = new Map(nodes.map(node => [node, new Set<string>()]));
  for (const { source, target } of edges) {
    if (!neighbors.has(source) || !neighbors.has(target)) continue;
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
  }
  const ordered = [...nodes].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b));
  const distances = new Map<string, number>();
  let component = 0;
  for (const root of ordered) {
    if (distances.has(root)) continue;
    const queue = [root];
    distances.set(root, Math.min(component++, 3) * 0.3);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      for (const next of neighbors.get(current)!) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(current)! + 1);
        queue.push(next);
      }
    }
  }
  let max = 1;
  for (const distance of distances.values()) max = Math.max(max, distance);
  return new Map([...distances].map(([node, distance]) => [node, distance / max * GRAPH_ENTRANCE_TIMING.maximumDelayMs]));
}

export function createEntranceController({ onFrame, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, now = () => performance.now() }: {
  onFrame(elapsed: number): void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
}) {
  let handle: number | null = null;
  let started = false;
  let finished = false;
  let destroyed = false;
  let start = 0;
  const cancel = () => {
    if (handle !== null) cancelFrame(handle);
    handle = null;
  };
  const finish = () => {
    if (finished || destroyed) return;
    finished = true;
    cancel();
    onFrame(GRAPH_ENTRANCE_MS);
  };
  const tick: FrameRequestCallback = (timestamp) => {
    if (finished || destroyed) return;
    handle = null;
    const elapsed = Math.min(GRAPH_ENTRANCE_MS, Math.max(0, timestamp - start));
    if (elapsed >= GRAPH_ENTRANCE_MS) {
      finish();
      return;
    }
    onFrame(elapsed);
    if (!finished && !destroyed) handle = requestFrame(tick);
  };
  return {
    start(reducedMotion: boolean) {
      if (started || finished || destroyed) return;
      started = true;
      if (reducedMotion) {
        finish();
        return;
      }
      start = now();
      onFrame(0);
      if (!finished && !destroyed) handle = requestFrame(tick);
    },
    finish,
    setReducedMotion(reducedMotion: boolean) {
      if (reducedMotion) finish();
    },
    destroy() {
      destroyed = true;
      cancel();
    },
  };
}
