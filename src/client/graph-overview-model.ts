import type { GraphEdge, GraphNode } from "@/lib/wiki-shared";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GRAPH_COLOR_MIX = 0.42;
const GRAPH_INK_RGB = [37, 49, 67] as const;

export interface GraphPosition {
  x: number;
  y: number;
}

export interface GraphConnectionItem {
  node: GraphNode;
  weight: number;
}

export interface GraphConnectionGroups {
  outgoing: GraphConnectionItem[];
  incoming: GraphConnectionItem[];
}

export interface GraphLayoutNodeInput {
  key: string;
  x: number;
  y: number;
  size: number;
}

export interface GraphLayoutEdgeInput {
  key: string;
  source: string;
  target: string;
  weight: number;
}

export interface GraphLayoutRequest {
  nodes: GraphLayoutNodeInput[];
  edges: GraphLayoutEdgeInput[];
  iterations: number;
}

export interface GraphLayoutResult {
  positions: Array<{ key: string; x: number; y: number }>;
}

export interface GraphViewportSettings {
  compact: boolean;
  stagePadding: number;
  labelDensity: number;
  labelGridCellSize: number;
  labelSize: number;
  maxLabelCharacters: number;
}

export type GraphLabelPlacement = "left" | "right";

export interface GraphLabelCandidate {
  slug: string;
  x: number;
  y: number;
  nodeSize: number;
  labelWidth: number;
  labelHeight: number;
  priority: number;
}

export const GRAPH_LAYOUT_SETTINGS = {
  gravity: 1,
  scalingRatio: 3.5,
  barnesHutOptimize: true,
  strongGravityMode: true,
  slowDown: 5,
  outboundAttractionDistribution: false,
  linLogMode: false,
} as const;

export const GRAPH_MOVEMENT_RENDERING_SETTINGS = {
  hideEdgesOnMove: false,
  hideLabelsOnMove: true,
} as const;

export const GRAPH_INDEX_LIMIT = 200;

export function truncateGraphLabel(value: string, maxCharacters = 42) {
  const characters = Array.from(value.trim());
  if (characters.length <= maxCharacters) return characters.join("");
  return `${characters.slice(0, Math.max(1, maxCharacters - 1)).join("").trimEnd()}…`;
}

export function getGraphIndexNodes(nodes: GraphNode[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...nodes]
    .filter((node) => {
      if (!normalizedQuery) return true;
      return [node.title, node.slug, ...node.categories].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
    })
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, GRAPH_INDEX_LIMIT);
}

export function getNextGraphIndex(currentIndex: number, key: string, itemCount: number) {
  if (itemCount <= 0) return null;
  if (key === "ArrowDown") return (currentIndex + 1 + itemCount) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}

export function getGraphConnectionGroups(
  nodeSlug: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphConnectionGroups {
  const nodesBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const outgoing: GraphConnectionItem[] = [];
  const incoming: GraphConnectionItem[] = [];

  for (const edge of edges) {
    if (edge.source === nodeSlug && edge.target !== nodeSlug) {
      const target = nodesBySlug.get(edge.target);
      if (target) outgoing.push({ node: target, weight: edge.weight });
    } else if (edge.target === nodeSlug && edge.source !== nodeSlug) {
      const source = nodesBySlug.get(edge.source);
      if (source) incoming.push({ node: source, weight: edge.weight });
    }
  }

  const sortConnections = (left: GraphConnectionItem, right: GraphConnectionItem) =>
    right.weight - left.weight || left.node.title.localeCompare(right.node.title);

  outgoing.sort(sortConnections);
  incoming.sort(sortConnections);

  return { outgoing, incoming };
}

export function getGraphLayoutIterations(nodeCount: number) {
  if (nodeCount <= 100) return 500;
  if (nodeCount <= 500) return 280;
  return 180;
}

export function getGraphViewportSettings(
  width: number,
  height = Number.POSITIVE_INFINITY,
): GraphViewportSettings {
  const shortestSide = Math.min(width, height);
  const compact = width < 720 || height < 560;
  if (!compact) {
    return {
      compact,
      stagePadding: 96,
      labelDensity: 1.4,
      labelGridCellSize: 88,
      labelSize: 13,
      maxLabelCharacters: 42,
    };
  }

  return {
    compact,
    stagePadding: Math.max(32, Math.min(48, shortestSide * 0.1)),
    labelDensity: 0.6,
    labelGridCellSize: 120,
    labelSize: 12,
    maxLabelCharacters: 24,
  };
}

export function getGraphNodeClickSelection(
  currentFocusedSlug: string | null,
  clickedSlug: string,
) {
  return {
    focusedSlug: clickedSlug,
    shouldCenter: currentFocusedSlug !== clickedSlug,
  };
}

export function shouldCloseGraphNodeIndexAfterSelection(viewportWidth: number) {
  return viewportWidth < 640;
}

export function shouldCollapseGraphDetailPanelOnSearchInteraction(
  viewportWidth: number,
  hasFocusedNode: boolean,
) {
  return hasFocusedNode && viewportWidth < 640;
}

export function getGraphNodeVerticalBalance(
  nodes: Array<{ slug: string; y: number }>,
  selectedSlug: string,
  alignmentTolerance = 1,
) {
  const selectedNode = nodes.find(
    (node) => node.slug === selectedSlug && Number.isFinite(node.y),
  );
  if (!selectedNode) return null;

  const tolerance = Math.max(0, alignmentTolerance);
  let aboveCount = 0;
  let belowCount = 0;
  let alignedCount = 0;

  for (const node of nodes) {
    if (node.slug === selectedSlug || !Number.isFinite(node.y)) continue;
    const verticalDelta = node.y - selectedNode.y;

    if (Math.abs(verticalDelta) <= tolerance) alignedCount += 1;
    else if (verticalDelta < 0) aboveCount += 1;
    else belowCount += 1;
  }

  return {
    aboveCount,
    belowCount,
    alignedCount,
    majority:
      belowCount > aboveCount
        ? ("below" as const)
        : aboveCount > belowCount
          ? ("above" as const)
          : ("balanced" as const),
  };
}

export function getGraphNodeFocusViewportPoint(
  viewportWidth: number,
  viewportHeight: number,
  searchBottom: number,
  detailPanelTop?: number,
) {
  if (viewportWidth >= 640) {
    return { x: viewportWidth / 2, y: viewportHeight / 2 };
  }

  if (
    Number.isFinite(detailPanelTop) &&
    detailPanelTop !== undefined &&
    detailPanelTop > searchBottom
  ) {
    return {
      x: viewportWidth / 2,
      y: searchBottom + (Math.min(detailPanelTop, viewportHeight) - searchBottom) / 2,
    };
  }

  const searchGap = Math.max(72, Math.min(104, viewportHeight * 0.08));
  return {
    x: viewportWidth / 2,
    y: Math.min(searchBottom + searchGap, viewportHeight * 0.42),
  };
}

export function getGraphCameraCenterForViewportTarget(
  nodePosition: GraphPosition,
  framedPositionAtTarget: GraphPosition,
) {
  return {
    x: nodePosition.x + (nodePosition.x - framedPositionAtTarget.x),
    y: nodePosition.y + (nodePosition.y - framedPositionAtTarget.y),
  };
}

export function getGraphToolbarPanelOffset(panelHeight: number, panelOpen: boolean) {
  return panelOpen ? Math.max(0, panelHeight) + 50 : null;
}

export function getGraphDetailPanelToggleState(collapsed: boolean) {
  return {
    expanded: !collapsed,
    label: collapsed ? "Expand node details" : "Collapse node details",
    nextCollapsed: !collapsed,
  };
}

export function getGraphLinkedNodePulseScale(elapsedMs: number, reducedMotion: boolean) {
  if (reducedMotion) return 1.16;
  const phase = ((Math.max(0, elapsedMs) % 480) / 480) * Math.PI * 2;
  return 1.13 + Math.sin(phase) * 0.05;
}

export function getGraphDisconnectedNodeTransition(progress: number) {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return {
    colorMix: normalizedProgress,
    hidden: normalizedProgress >= 1,
    sizeScale: 1 - normalizedProgress * 0.28,
  };
}

export function mixGraphColors(startColor: string, endColor: string, amount: number) {
  const startMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(startColor.trim());
  const endMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(endColor.trim());
  const normalizedAmount = Math.max(0, Math.min(1, amount));
  if (!startMatch || !endMatch) return normalizedAmount < 1 ? startColor : endColor;

  const channels = startMatch.slice(1).map((channel, index) => {
    const start = Number.parseInt(channel, 16);
    const end = Number.parseInt(endMatch[index + 1], 16);
    return Math.round(start + (end - start) * normalizedAmount);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getGraphNodeSize(node: Pick<GraphNode, "backlinkCount" | "neighbors" | "wordCount">) {
  const connectionCount = Math.max(node.backlinkCount, node.neighbors.length);
  const connectionScale = Math.sqrt(connectionCount) * 3.1;
  const contentScale = Math.min(2.5, Math.log10(Math.max(10, node.wordCount)) * 0.55);
  return Math.max(7, Math.min(22, 7 + connectionScale + contentScale));
}

export function getGraphEdgeSize(weight: number) {
  return Math.max(1.1, Math.min(3, 1.1 + Math.log2(Math.max(1, weight)) * 0.45));
}

export function getPersistentLabelSlugs(nodes: GraphNode[]) {
  if (nodes.length <= 80) {
    return new Set(nodes.map((node) => node.slug));
  }

  const budget = nodes.length <= 250 ? 48 : nodes.length <= 750 ? 64 : 80;
  const ranked = [...nodes].sort((left, right) => {
    const leftConnections = Math.max(left.backlinkCount, left.neighbors.length);
    const rightConnections = Math.max(right.backlinkCount, right.neighbors.length);
    return (
      rightConnections - leftConnections ||
      right.wordCount - left.wordCount ||
      left.title.localeCompare(right.title)
    );
  });

  return new Set(ranked.slice(0, budget).map((node) => node.slug));
}

export function getCollisionAwareGraphLabelPlacements(
  candidates: GraphLabelCandidate[],
  viewport: { width: number; height: number; padding?: number; gap?: number },
) {
  const padding = viewport.padding ?? 8;
  const gap = viewport.gap ?? 4;
  const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const placements = new Map<string, GraphLabelPlacement>();
  const ranked = [...candidates].sort(
    (left, right) => right.priority - left.priority || left.slug.localeCompare(right.slug),
  );

  const overlaps = (box: { left: number; right: number; top: number; bottom: number }) =>
    occupied.some(
      (other) =>
        box.left < other.right + gap &&
        box.right > other.left - gap &&
        box.top < other.bottom + gap &&
        box.bottom > other.top - gap,
    );

  for (const candidate of ranked) {
    const preferred: GraphLabelPlacement =
      candidate.x > viewport.width / 2 ? "left" : "right";
    const options: GraphLabelPlacement[] = [preferred, preferred === "right" ? "left" : "right"];

    for (const placement of options) {
      const left =
        placement === "right"
          ? candidate.x + candidate.nodeSize + 5
          : candidate.x - candidate.nodeSize - 5 - candidate.labelWidth;
      const top = candidate.y - candidate.labelHeight / 2;
      const box = {
        left,
        right: left + candidate.labelWidth,
        top,
        bottom: top + candidate.labelHeight,
      };
      const insideViewport =
        box.left >= padding &&
        box.right <= viewport.width - padding &&
        box.top >= padding &&
        box.bottom <= viewport.height - padding;

      if (!insideViewport || overlaps(box)) continue;
      occupied.push(box);
      placements.set(candidate.slug, placement);
      break;
    }
  }

  return placements;
}

export function getDeterministicGraphPositions(nodes: GraphNode[]) {
  const ordered = [...nodes].sort((left, right) => left.slug.localeCompare(right.slug));
  const positions = new Map<string, GraphPosition>();
  const total = Math.max(ordered.length, 1);

  ordered.forEach((node, index) => {
    const phase = (hashString(node.slug) % 997) / 997;
    const angle = index * GOLDEN_ANGLE + phase * 0.35;
    const radius = Math.sqrt((index + 0.75) / total) * 120;
    positions.set(node.slug, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  return positions;
}

export function strengthenGraphColor(color: string) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color.trim());
  if (!match) return color;

  const source = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  const mixed = source.map((channel, index) =>
    Math.round(channel * (1 - GRAPH_COLOR_MIX) + GRAPH_INK_RGB[index] * GRAPH_COLOR_MIX),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
