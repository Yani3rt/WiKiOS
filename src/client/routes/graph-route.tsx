import { getGraphNavigationGeometry, isGraphNodeRevealed, getGraphDisclosureVisibility, GRAPH_NEIGHBORHOOD_TRANSITION_MS } from "../graph-disclosure";
import { getGraphMemoryNodeFrame, getGraphMemoryEdgeProgress, GRAPH_MEMORY_OPEN_MS, GRAPH_MEMORY_CLOSE_MS, GRAPH_MEMORY_DELAY_MS, type GraphMemoryNodeFrame } from "../graph-memory-transition";
import { buildGraphNeighborhoods, type GraphNeighborhood } from "../graph-neighborhoods";
import { layoutGraphNeighborhoods } from "../graph-neighborhood-layout";
import { createGraphNeighborhoodLayer, getGraphMemoryHubBounds } from "../graph-neighborhood-layer";
import { buildGraphNeighborhoodPreviews } from "../graph-neighborhood-preview-model";
import { getGraphDetailLevel, isGraphLabelEligible, type GraphDetailLevel } from "../graph-semantic-zoom";
import { GraphMotionCamera } from "../graph-motion-camera";
import { GraphSearch } from "@/components/graph-search";
import { createGraphCameraSettler, findGraphPointerTarget, getGraphFitGeometry, getGraphRevealGeometry, getGraphUsableViewport, type GraphBounds, type GraphPoint } from "../graph-camera";
import { focusVisibility, focusColor } from "../graph-focus-transition";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, redirect, useLoaderData, useNavigate } from "react-router-dom";
import Graph from "graphology";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  House,
  Minus,
  Plus,
  Scan,
  X,
} from "lucide-react";
import SigmaLib from "sigma";
import type {
  EdgeProgramType,
  NodeHoverDrawingFunction,
  NodeLabelDrawingFunction,
} from "sigma/rendering";

import { buildEntranceDelays, entranceFrame, graphRevealEase, createEntranceController, GRAPH_ENTRANCE_MS, GRAPH_ENTRANCE_TIMING } from "@/client/graph-entrance";
import { createNeuralNodeProgram } from "@/client/graph-neural-node-program";
import { GraphColorControls } from "@/client/graph-color-controls";
import { buildGraphColorGroups, readGraphColorPreferences, writeGraphColorPreferences } from "@/client/graph-color-model";
import type { GraphColorGroup, GraphColorPreferences } from "@/client/graph-color-model";
import { useAppearance } from "@/client/appearance-provider";
import {
  createGraphNeuralAnimationController,
  type GraphNeuralAnimationController,
  type GraphNeuralAnimationSnapshot,
} from "@/client/graph-neural-animation";
import {
  clearGraphNeuralRendererAnimationState,
  getGraphNeuralRendererAnimationState,
  NeuralEdgeProgram,
  NeuralArrowEdgeProgram,
  setGraphNeuralRendererAnimationState,
  type NeuralEdgeDisplayData,
} from "@/client/graph-neural-edge-program";
import { graphTopologyKey, graphViewCache, type GraphViewState } from "@/client/graph-view-state";
import { useWikiConfig } from "@/client/wiki-config";
import {
  getCollisionAwareGraphLabelPlacements,
  getGraphLabelBounds,
  createGraphNeuralActivationIndex,
  getDeterministicGraphPositions,
  getGraphCameraCenterForViewportTarget,
  getGraphConnectionGroups,
  getGraphDetailHeightAnimation,
  getGraphDetailPanelToggleState,
  getGraphEdgeSize,
  getGraphLayoutIterations,
  getGraphLinkedNodePulseScale,
  getGraphNeuralIndexedDirectEdges,
  getGraphNodeClickSelection,
  getGraphNodeSize,
  getGraphToolbarPanelOffset,
  getGraphViewportSettings,
  getPersistentLabelSlugs,
  GRAPH_INDEX_INITIAL_VISIBLE_COUNT,
  GRAPH_LINKED_NODE_PULSE_MS,
  GRAPH_MOVEMENT_RENDERING_SETTINGS,
  shouldCollapseGraphDetailPanelOnSearchInteraction,
  mixGraphColors,
  adaptGraphCategoryColor,
  truncateGraphLabel,
  type GraphConnectionGroups,
  type GraphLayoutRequest,
  type GraphLayoutResult,
  type GraphNeuralSignalFrame,
} from "@/client/graph-overview-model";
import type { ResolvedThemeMode } from "@/client/theme-mode";
import { getTopicColor, type TopicAliasConfig } from "@/lib/wiki-config";
import type { GraphData, GraphNode, ColoredGraphData } from "@/lib/wiki-shared";
import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

const NodeCircleProgram = typeof document === "undefined" ? undefined : (await import("sigma/rendering")).NodeCircleProgram;
const neuralNodePrograms = NodeCircleProgram ? {
  light: { circle: createNeuralNodeProgram(NodeCircleProgram, "light") },
  dark: { circle: createNeuralNodeProgram(NodeCircleProgram, "dark") },
} : undefined;

/* ── Graph theme ── */

export interface GraphThemeColors {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  label: string;
  nodeDefault: string;
  nodeMuted: string;
  edgeDefault: string;
  edgeMuted: string;
  edgeOutgoing: string;
  edgeIncoming: string;
}

const GRAPH_THEME_TOKENS: Record<keyof GraphThemeColors, string> = {
  background: "--graph-background",
  surface: "--graph-surface",
  foreground: "--graph-foreground",
  muted: "--graph-muted",
  label: "--graph-label",
  nodeDefault: "--graph-node-default",
  nodeMuted: "--graph-node-muted",
  edgeDefault: "--graph-edge-default",
  edgeMuted: "--graph-edge-muted",
  edgeOutgoing: "--graph-edge-outgoing",
  edgeIncoming: "--graph-edge-incoming",
};

function getGraphThemeColors(element: HTMLElement): GraphThemeColors {
  const styles = getComputedStyle(element);
  return Object.fromEntries(
    Object.entries(GRAPH_THEME_TOKENS).map(([name, token]) => [
      name,
      styles.getPropertyValue(token).trim(),
    ]),
  ) as unknown as GraphThemeColors;
}

function getGraphMotionDuration(duration: number) {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}

function graphChromeBounds(selector: string): GraphBounds | undefined {
  const element = document.querySelector<HTMLElement>(`.graph-shell ${selector}`);
  if (!element || element.offsetWidth === 0 || element.offsetHeight === 0) return;
  const rect = element.getBoundingClientRect();
  return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
}

function graphUsableViewport(sigma: SigmaLib, overview = false) {
  const {width, height} = sigma.getDimensions();
  return getGraphUsableViewport({
    width, height,
    headerBottom: graphChromeBounds("header")?.bottom,
    searchBottom: graphChromeBounds("#graph-search-controls")?.bottom,
    details: overview ? undefined : graphChromeBounds("aside[aria-labelledby='graph-node-details-title']"),
    legend: graphChromeBounds(".graph-color-controls"),
    toolbar: graphChromeBounds(".graph-toolbar-stack"),
  });
}

/** Project at a known camera, fit the whole neighborhood, then offset for chrome. */
function getGraphFrameTarget(sigma: SigmaLib, slugs: string[], overview = false, navigationPoints?: GraphPoint[], minimumPadding?: GraphPoint) {
  const camera = sigma.getCamera();
  const reference = {...camera.getState(), x: .5, y: .5, ratio: 1};
  const points = navigationPoints ? navigationPoints.map(point=>sigma.graphToViewport(point,{cameraState:reference})) : slugs.flatMap(slug => {
    const node = sigma.getNodeDisplayData(slug);
    return node ? [sigma.framedGraphToViewport(node, {cameraState: reference})] : [];
  });
  const fit = getGraphFitGeometry(points, graphUsableViewport(sigma, overview), minimumPadding);
  if (!fit) return;
  const center = sigma.viewportToFramedGraph(fit.center, {cameraState: reference});
  const centered = {...reference, ...center, ratio: fit.ratio};
  const framedTarget = sigma.viewportToFramedGraph(fit.target, {cameraState: centered});
  const target = {...centered, ...getGraphCameraCenterForViewportTarget(center, framedTarget)};
  return target;
}

function animateGraphFrame(sigma: SigmaLib, slugs: string[], duration: number) {
  const target = getGraphFrameTarget(sigma, slugs);
  if (target) return sigma.getCamera().animate(target, {duration: getGraphMotionDuration(duration), easing: "quadraticInOut"});
}

function getGraphRevealTarget(sigma: SigmaLib, slugs: string[], overview = false, navigationPoints?: GraphPoint[]) {
  const current=sigma.getCamera().getState();
  const points=navigationPoints ? navigationPoints.map(point=>sigma.graphToViewport(point)) : slugs.flatMap(slug=>{
    const node=sigma.getNodeDisplayData(slug);
    return node?[sigma.framedGraphToViewport(node)]:[];
  });
  const reveal=getGraphRevealGeometry(points,graphUsableViewport(sigma,overview));
  if(!reveal) return;
  const anchor=sigma.viewportToFramedGraph(reveal.anchor);
  const zoomed={...current,ratio:current.ratio*reveal.scale};
  const destination=sigma.viewportToFramedGraph(reveal.target,{cameraState:zoomed});
  return {...zoomed,x:zoomed.x+anchor.x-destination.x,y:zoomed.y+anchor.y-destination.y};
}

function getCategoryColor(
  categories: string[],
  aliases: Record<string, TopicAliasConfig>,
  resolvedMode: ResolvedThemeMode,
  fallbackColor = "var(--graph-node-default)",
): string {
  for (const cat of categories) {
    return adaptGraphCategoryColor(getTopicColor(cat, aliases), resolvedMode);
  }
  return fallbackColor;
}

export function applyGraphThemeColors(
  graph: Graph,
  aliases: Record<string, TopicAliasConfig>,
  colors: GraphThemeColors,
  resolvedMode: ResolvedThemeMode,
) {
  graph.forEachNode((node, attributes) => {
    const categories = Array.isArray(attributes.categories)
      ? attributes.categories.filter(
          (category: unknown): category is string => typeof category === "string",
        )
      : [];
    const color = getCategoryColor(categories, aliases, resolvedMode, colors.nodeDefault);
    graph.mergeNodeAttributes(node, { color, originalColor: color });
  });
  graph.forEachEdge((edge) => graph.mergeEdgeAttributes(edge, { color: colors.edgeDefault }));
}

function createGraphLabelDrawer(colors: GraphThemeColors, hitAreas?: Map<string, GraphBounds>): NodeLabelDrawingFunction {
  return (context, data, settings) => {
    if (!data.label) return;

    const labelColor = "color" in settings.labelColor ? settings.labelColor.color : colors.label;

    context.save();
    context.globalAlpha *= typeof data.entranceLabelOpacity === "number" ? data.entranceLabelOpacity : 1;
    context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
    const bounds = getGraphLabelBounds({x:data.x,y:data.y,nodeSize:data.size,
      labelWidth:context.measureText(data.label).width+4,labelHeight:settings.labelSize+8}, data.labelPlacement ?? "right");
    const x = bounds.left + 2;
    const y = bounds.top + settings.labelSize + 1;
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = colors.background;
    context.strokeText(data.label, x, y);
    context.fillStyle = labelColor ?? colors.label;
    context.fillText(data.label, x, y);
    if (hitAreas && typeof data.graphSlug === "string" && context.globalAlpha > .2) {
      hitAreas.set(data.graphSlug, bounds);
    }
    context.restore();
  };
}

function createGraphHoverDrawer(colors: GraphThemeColors, hitAreas?: Map<string, GraphBounds>): NodeHoverDrawingFunction {
  // Sigma uses this layer for both hovered and highlighted (selected) nodes.
  // The node program owns the glow; an opaque canvas disk here masks it.
  return createGraphLabelDrawer(colors, hitAreas);
}

interface GraphThemeRenderer {
  setSettings(settings: Parameters<SigmaLib["setSettings"]>[0]): unknown;
  refresh(): unknown;
}

export function getGraphEdgeProgramClasses(
  neuralEnabled: boolean,
): Record<string, EdgeProgramType> {
  return neuralEnabled ? { neural: NeuralEdgeProgram, neuralArrow: NeuralArrowEdgeProgram } : {};
}

export function hasGraphNeuralEdgeProgram(
  edgeProgramClasses: Record<string, EdgeProgramType>,
) {
  return Boolean(edgeProgramClasses.neural);
}

export function getGraphNeuralEdgeDisplayAttributes(
  _frame: GraphNeuralSignalFrame,
  color: string,
  neuralEnabled = true,
  delayMs = 0,
  directional = false,
): Pick<
  NeuralEdgeDisplayData,
  "type" | "color" | "neuralDelayMs"
> | null {
  if (!neuralEnabled) return null;
  return {
    type: directional ? "neuralArrow" : "neural",
    color,
    neuralDelayMs: delayMs,
  };
}

export function getGraphNeuralRefreshPartialGraph(
  previous: GraphNeuralAnimationSnapshot,
  next: GraphNeuralAnimationSnapshot,
) {
  return {
    edges: [...new Set([...previous.edges.keys(), ...next.edges.keys()])],
    nodes: [
      ...new Set(
        [
          previous.activeSlug,
          next.activeSlug,
          ...previous.nodeScales.keys(),
          ...next.nodeScales.keys(),
        ].filter((slug): slug is string => Boolean(slug)),
      ),
    ],
  };
}

function haveSameGraphNeuralEdgeMembership(
  previous: GraphNeuralAnimationSnapshot,
  next: GraphNeuralAnimationSnapshot,
) {
  if (previous.edges.size !== next.edges.size) return false;
  for (const edge of previous.edges.keys()) {
    if (!next.edges.has(edge)) return false;
  }
  return true;
}

export function getGraphNeuralFrameRefreshOptions(
  previous: GraphNeuralAnimationSnapshot,
  next: GraphNeuralAnimationSnapshot,
): Parameters<SigmaLib["refresh"]>[0] {
  const partialGraph = getGraphNeuralRefreshPartialGraph(previous, next);
  const edgeMembershipStable = haveSameGraphNeuralEdgeMembership(previous, next);
  const colorOwnerStable =
    next.edges.size === 0 || previous.activeSlug === next.activeSlug;

  if (edgeMembershipStable && colorOwnerStable) {
    return {
      partialGraph: { nodes: partialGraph.nodes },
      skipIndexation: true,
      schedule: true,
    };
  }

  return { partialGraph, schedule: true };
}

export function cleanupFailedGraphRendererContainer(container: HTMLElement) {
  for (const canvas of container.querySelectorAll("canvas")) {
    for (const contextId of ["webgl2", "webgl", "experimental-webgl"] as const) {
      try {
        const context = canvas.getContext(contextId as "webgl");
        if (!context) continue;
        context.getExtension("WEBGL_lose_context")?.loseContext();
        break;
      } catch {
        // The context was only partially constructed; continue to best-effort DOM cleanup.
      }
    }
  }
  container.replaceChildren();
}

interface GraphRendererConstruction<Renderer> {
  renderer: Renderer;
  neuralEnabled: boolean;
}

interface GraphRendererRuntimeOptions<Renderer, Controller> {
  createRenderer(neuralEnabled: boolean): GraphRendererConstruction<Renderer>;
  cleanupFailedConstruction(): void;
  createNeuralController(renderer: Renderer): Controller;
  onFallback(error: unknown): void;
}

export function createGraphRendererRuntime<Renderer, Controller>(
  options: GraphRendererRuntimeOptions<Renderer, Controller>,
) {
  let construction: GraphRendererConstruction<Renderer>;

  try {
    construction = options.createRenderer(true);
  } catch (error) {
    options.cleanupFailedConstruction();
    options.onFallback(error);
    try {
      construction = options.createRenderer(false);
    } catch (staticError) {
      options.cleanupFailedConstruction();
      throw staticError;
    }
  }

  const { renderer, neuralEnabled } = construction;

  return {
    renderer,
    neuralEnabled,
    neuralController: neuralEnabled
      ? options.createNeuralController(renderer)
      : null,
  };
}

/** Recolors the current graph and renderer without replacing graph lifecycle state. */
export function updateGraphThemeInPlace(
  graph: Graph,
  sigma: GraphThemeRenderer,
  aliases: Record<string, TopicAliasConfig>,
  colors: GraphThemeColors,
  resolvedMode: ResolvedThemeMode,
  hitAreas?: Map<string, GraphBounds>,
) {
  applyGraphThemeColors(graph, aliases, colors, resolvedMode);
  sigma.setSettings({
    defaultDrawNodeLabel: createGraphLabelDrawer(colors, hitAreas),
    defaultDrawNodeHover: createGraphHoverDrawer(colors, hitAreas),
    labelColor: { color: colors.label },
    defaultEdgeColor: colors.edgeDefault,
    defaultNodeColor: colors.nodeDefault,
    ...(neuralNodePrograms ? {nodeProgramClasses: neuralNodePrograms[resolvedMode]} : {}),
  });
  sigma.refresh();
}

/* ── Graph building ── */

function buildGraph(
  data: GraphData,
  aliases: Record<string, TopicAliasConfig>,
  colors: GraphThemeColors,
  resolvedMode: ResolvedThemeMode,
): Graph {
  const graph = new Graph();
  const positions = getDeterministicGraphPositions(data.nodes);
  const persistentLabels = getPersistentLabelSlugs(data.nodes);

  for (const node of data.nodes) {
    const position = positions.get(node.slug) ?? { x: 0, y: 0 };
    const size = getGraphNodeSize(node);
    graph.addNode(node.slug, {
      label: truncateGraphLabel(node.title),
      compactLabel: truncateGraphLabel(node.title, 24),
      fullLabel: node.title,
      size,
      color: getCategoryColor(node.categories, aliases, resolvedMode, colors.nodeDefault),
      originalColor: getCategoryColor(node.categories, aliases, resolvedMode, colors.nodeDefault),
      x: position.x,
      y: position.y,
      forceLabel: false,
      persistentLabel: persistentLabels.has(node.slug),
      labelPlacement: "right",
      categories: node.categories,
      backlinkCount: node.backlinkCount,
      connectionCount: node.neighbors.length,
      wordCount: node.wordCount,
    });
  }

  for (const edge of data.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      const key = `${edge.source}->${edge.target}`;
      if (!graph.hasEdge(key)) {
        graph.addEdgeWithKey(key, edge.source, edge.target, {
          weight: edge.weight,
          size: getGraphEdgeSize(edge.weight),
          color: colors.edgeDefault,
        });
      }
    }
  }

  return graph;
}

function getGraphLayoutRequest(graph: Graph, neighborhoods: GraphNeighborhood[]): GraphLayoutRequest {
  const nodes: GraphLayoutRequest["nodes"] = [];
  const edges: GraphLayoutRequest["edges"] = [];

  graph.forEachNode((key, attributes) => {
    nodes.push({
      key,
      x: attributes.x,
      y: attributes.y,
      size: attributes.size,
    });
  });
  graph.forEachEdge((key, attributes, source, target) => {
    edges.push({
      key,
      source,
      target,
      weight: attributes.weight ?? 1,
    });
  });

  return {nodes, edges, neighborhoods, iterations:getGraphLayoutIterations(graph.order)};
}

function startGraphLayoutWorker(graph: Graph, neighborhoods: GraphNeighborhood[], onComplete: () => void) {
  if (typeof Worker === "undefined") return null;
  let worker: Worker;
  try { worker = new Worker(new URL("../graph-layout-worker.ts", import.meta.url), {type:"module",name:"wikios-graph-layout"}); }
  catch { return null; }
  let stopped = false;
  const terminate=()=>{stopped=true;worker.terminate();};
  worker.addEventListener("message",({data}:MessageEvent<GraphLayoutResult>)=>{
    if(stopped) return;
    for(const position of data.positions) {
      if(graph.hasNode(position.key)) graph.mergeNodeAttributes(position.key,{x:position.x,y:position.y});
    }
    terminate();onComplete();
  },{once:true});
  worker.addEventListener("error",()=>{if(stopped)return;terminate();onComplete();},{once:true});
  try { worker.postMessage(getGraphLayoutRequest(graph,neighborhoods)); }
  catch { terminate();return null; }
  return {terminate};
}

function updateCollisionAwareGraphLabels(sigma: SigmaLib, graph: Graph, focused: string | null, activeGroup: string | null, assignments: Map<string, GraphColorGroup>, detailLevel: GraphDetailLevel = "neighborhood", titleObstacles: GraphBounds[] = []) {
  const dimensions = sigma.getDimensions();
  const viewportSettings = getGraphViewportSettings(dimensions.width, dimensions.height);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.font = `600 ${viewportSettings.labelSize}px "Urbanist", sans-serif`;

  const nodeObstacles: GraphBounds[] = [];
  graph.forEachNode(slug => {
    const node = sigma.getNodeDisplayData(slug);
    if (!node || node.hidden) return;
    const point = sigma.framedGraphToViewport(node);
    const radius = sigma.scaleSize(node.size) * .65;
    nodeObstacles.push({left:point.x-radius,right:point.x+radius,top:point.y-radius,bottom:point.y+radius});
  });
  const candidates: Parameters<typeof getCollisionAwareGraphLabelPlacements>[0] = [];
  graph.forEachNode((slug, attributes) => {
    if (!isGraphLabelEligible(detailLevel, {persistent:Boolean(attributes.persistentLabel),hub:Boolean(attributes.neighborhoodHub),independent:!attributes.neighborhoodId,context:Boolean(focused || activeGroup !== null)})) return;
    const displayData = sigma.getNodeDisplayData(slug);
    if (!displayData || displayData.hidden) return;
    if (focused && slug !== focused && !graph.areNeighbors(focused, slug)) return;
    if (!focused && activeGroup !== null && assignments.get(slug)?.id !== activeGroup) return;
    const point = sigma.framedGraphToViewport({ x: displayData.x, y: displayData.y });
    const label = String(
      displayData.label ?? "",
    );
    candidates.push({
      slug,
      x: point.x,
      y: point.y,
      nodeSize: sigma.scaleSize(displayData.size),
      labelWidth: context.measureText(label).width + 4,
      labelHeight: viewportSettings.labelSize + 8,
      priority:
        (slug === focused ? 1e12 : 0) + Number(attributes.connectionCount ?? 0) * 100_000 + Number(attributes.wordCount ?? 0),
    });
  });

  const placements = getCollisionAwareGraphLabelPlacements(candidates, {
    ...dimensions,
    padding: Math.min(24, viewportSettings.stagePadding / 2),
    gap: 5,
    obstacles: [...nodeObstacles, ...titleObstacles, ...["header", "#graph-search-controls", "aside[aria-labelledby='graph-node-details-title']", ".graph-color-controls", ".graph-toolbar-stack"]
      .flatMap(selector => {const bounds=graphChromeBounds(selector);return bounds ? [bounds] : [];})],
  });
  let changed = false;

  graph.forEachNode((slug, attributes) => {
    const nextForceLabel = placements.has(slug);
    const nextPlacement = placements.get(slug) ?? "right";
    if (
      attributes.forceLabel === nextForceLabel &&
      attributes.labelPlacement === nextPlacement
    ) {
      return;
    }
    graph.mergeNodeAttributes(slug, {
      forceLabel: nextForceLabel,
      labelPlacement: nextPlacement,
    });
    changed = true;
  });

  return changed;
}

function GraphViewportControls({
  sigmaRef,
  compactPanelOpen,
  detailPanelHeight,
  onCameraSettled,
  onFit,
}: {
  sigmaRef: React.RefObject<SigmaLib | null>;
  compactPanelOpen: boolean;
  detailPanelHeight: number;
  onCameraSettled: () => void;
  onFit: () => void;
}) {
  const zoomIn = () => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    void camera
      .animatedZoom({ factor: 1.5, duration: getGraphMotionDuration(180) })
      .then(onCameraSettled);
  };

  const zoomOut = () => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    void camera
      .animatedUnzoom({ factor: 1.5, duration: getGraphMotionDuration(180) })
      .then(onCameraSettled);
  };


  const controlClass =
    "grid h-11 w-11 place-items-center text-[var(--graph-muted)] transition-colors hover:bg-[var(--graph-control-hover)] hover:text-[var(--graph-foreground)]";
  const panelOffset = getGraphToolbarPanelOffset(detailPanelHeight, compactPanelOpen);

  return (
    <div
      className={`graph-toolbar-stack absolute left-4 z-10 flex flex-col items-center ${
        panelOffset === null ? "" : "graph-toolbar-stack--panel-open"
      }`}
      style={
        panelOffset === null
          ? undefined
          : ({ "--graph-toolbar-panel-offset": `${panelOffset}px` } as React.CSSProperties)
      }
      role="group"
      aria-label="Graph view controls"
    >
      <Link
        to="/"
        className={`graph-surface graph-toolbar-home -mb-px rounded-b-none rounded-t-lg ${controlClass}`}
        aria-label="Home"
      >
        <House aria-hidden="true" className="h-4 w-4" />
      </Link>
      <div className="graph-toolbar flex overflow-hidden rounded-lg">
        <button type="button" onClick={zoomOut} className={controlClass} aria-label="Zoom out">
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onFit} className={controlClass} aria-label="Fit graph">
          <Scan aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" onClick={zoomIn} className={controlClass} aria-label="Zoom in">
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Info panel (shown when a node is focused) ── */

function InfoPanel({
  node,
  connections,
  panelRef,
  collapsed,
  onCollapsedChange,
  onClose,
  onClickNeighbor,
  onHoverNeighbor,
  onNavigate,
  groups,
  explicitTopics,
  resolvedMode,
}: {
  node: GraphNode;
  connections: GraphConnectionGroups;
  panelRef: React.RefObject<HTMLElement | null>;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onClose: () => void;
  onClickNeighbor: (slug: string) => void;
  onHoverNeighbor: (slug: string | null) => void;
  onNavigate: (slug: string) => void;
  groups: Map<string, GraphColorGroup>;
  explicitTopics: string[];
  resolvedMode: ResolvedThemeMode;
}) {
  const previousPanelHeightRef = useRef<number | null>(null);
  const panelHeightAnimationRef = useRef<Animation | null>(null);
  const group = groups.get(node.slug);
  const catColor = adaptGraphCategoryColor(group?.color ?? '#9ba9b2', resolvedMode);
  const connectedSlugs = new Set([
    ...connections.outgoing.map(({ node: connectedNode }) => connectedNode.slug),
    ...connections.incoming.map(({ node: connectedNode }) => connectedNode.slug),
  ]);
  const connectionCount = connectedSlugs.size;
  const toggleState = getGraphDetailPanelToggleState(collapsed);

  useEffect(() => () => onHoverNeighbor(null), [node.slug, onHoverNeighbor]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const activeAnimation = panelHeightAnimationRef.current;
    const previousHeight = activeAnimation
      ? panel.getBoundingClientRect().height
      : previousPanelHeightRef.current;
    activeAnimation?.cancel();
    panelHeightAnimationRef.current = null;

    const nextHeight = panel.getBoundingClientRect().height;
    previousPanelHeightRef.current = nextHeight;
    const heightAnimation = getGraphDetailHeightAnimation({
      previousHeight,
      nextHeight,
      viewportWidth: window.innerWidth,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    if (!heightAnimation || typeof panel.animate !== "function") return;

    const animation = panel.animate(heightAnimation.keyframes, heightAnimation.options);
    panelHeightAnimationRef.current = animation;
    void animation.finished
      .then(() => {
        if (panelHeightAnimationRef.current !== animation) return;
        panelHeightAnimationRef.current = null;
        previousPanelHeightRef.current = panel.getBoundingClientRect().height;
      })
      .catch(() => undefined);
  }, [node.slug, panelRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const syncSettledHeight = () => {
      if (!panelHeightAnimationRef.current) {
        previousPanelHeightRef.current = panel.getBoundingClientRect().height;
      }
    };
    syncSettledHeight();

    const resizeObserver = new ResizeObserver(syncSettledHeight);
    resizeObserver.observe(panel);
    return () => {
      resizeObserver.disconnect();
      panelHeightAnimationRef.current?.cancel();
      panelHeightAnimationRef.current = null;
    };
  }, [panelRef]);

  return (
    <aside
      ref={panelRef}
      className="graph-surface-raised absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 top-auto z-20 flex max-h-[52dvh] flex-col overflow-hidden rounded-xl lg:bottom-auto lg:left-auto lg:right-4 lg:top-[calc(env(safe-area-inset-top)+4.75rem)] lg:max-h-[calc(100dvh-6rem)] lg:w-80"
      aria-labelledby="graph-node-details-title"
      data-collapsed={collapsed ? "true" : "false"}
    >
      {/* Header */}
      <div className="border-b border-[var(--graph-border)] px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="graph-node-details-title"
              className="line-clamp-2 text-[1.05rem] font-semibold text-[var(--graph-foreground)] sm:truncate"
            >
              {node.title}
            </h2>
            <div className="graph-note-topics">{explicitTopics.map(topic => <span key={topic}>{topic}</span>)}</div>
            <div className="mt-1.5 flex items-center gap-2" aria-label="Node color group">
              {group && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: catColor }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--graph-muted)]">
                    Color · {group?.label}
                  </span>
                </div>
              )}
              <span
                className="text-[10px] text-[var(--graph-muted)]"
                aria-label={`${connectionCount} ${
                  connectionCount === 1 ? "direct connection" : "direct connections"
                }, ${node.wordCount} words`}
              >
                {connectionCount} · {node.wordCount}w
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onCollapsedChange(toggleState.nextCollapsed)}
              className="grid h-11 w-11 place-items-center rounded-lg text-[var(--graph-muted)] transition-colors hover:bg-[var(--graph-control-hover)] hover:text-[var(--graph-foreground)]"
              aria-label={toggleState.label}
              aria-controls="graph-node-details-body"
              aria-expanded={toggleState.expanded}
            >
              {collapsed ? (
                <ChevronUp aria-hidden="true" className="h-4 w-4" />
              ) : (
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-lg text-[var(--graph-muted)] transition-colors hover:bg-[var(--graph-control-hover)] hover:text-[var(--graph-foreground)]"
              aria-label="Close node details"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        id="graph-node-details-body"
        className="graph-detail-panel-body min-h-0"
        aria-hidden={collapsed}
        inert={collapsed}
      >
        <div className="graph-detail-panel-body-inner flex min-h-0 flex-col overflow-hidden">
          {/* Summary */}
          {node.summary && (
            <div className="border-b border-[var(--graph-border)] px-5 py-3">
              <p className="line-clamp-3 text-[0.8rem] leading-relaxed text-[var(--graph-muted)]">
                {node.summary}
              </p>
            </div>
          )}


          {/* Open article button */}
          <div className="border-b border-[var(--graph-border)] px-5 py-3">
            <button
              type="button"
              onClick={() => onNavigate(node.slug)}
              className="app-primary-action min-h-11 w-full rounded-lg px-4 py-2 text-xs font-semibold"
            >
              Open article →
            </button>
          </div>

          {/* Directional connections */}
          <div className="graph-connection-list min-h-0 flex-1 overflow-y-auto py-2">
        {connections.outgoing.length > 0 && (
          <section aria-labelledby="graph-links-to-title">
            <h3
              id="graph-links-to-title"
              className="flex items-center gap-2 px-5 pb-1.5 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--graph-muted)]"
            >
              <ArrowUpRight
                aria-hidden="true"
                className="h-3.5 w-3.5 text-[var(--graph-edge-outgoing)]"
              />
              Links to ({connections.outgoing.length})
            </h3>
            {connections.outgoing.map(({ node: connectedNode, weight }) => (
              <button
                key={`outgoing-${connectedNode.slug}`}
                type="button"
                onClick={() => onClickNeighbor(connectedNode.slug)}
                onPointerEnter={() => onHoverNeighbor(connectedNode.slug)}
                onPointerLeave={() => onHoverNeighbor(null)}
                onFocus={() => onHoverNeighbor(connectedNode.slug)}
                onBlur={() => onHoverNeighbor(null)}
                aria-label={`${node.title} links to ${connectedNode.title}, ${weight} ${
                  weight === 1 ? "mention" : "mentions"
                }`}
                className="group flex min-h-11 w-full items-center gap-2.5 px-5 py-2 text-left transition-colors hover:bg-[var(--graph-control-hover)]"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: adaptGraphCategoryColor(groups.get(connectedNode.slug)?.color ?? '#9ba9b2', resolvedMode),
                  }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[0.85rem] font-medium text-[var(--graph-foreground)]">
                  {connectedNode.title}
                </span>
                {weight > 1 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--graph-muted)]">
                    ×{weight}
                  </span>
                )}
              </button>
            ))}
          </section>
        )}

        {connections.incoming.length > 0 && (
          <section aria-labelledby="graph-linked-from-title">
            <h3
              id="graph-linked-from-title"
              className="flex items-center gap-2 px-5 pb-1.5 pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--graph-muted)]"
            >
              <ArrowDownLeft
                aria-hidden="true"
                className="h-3.5 w-3.5 text-[var(--graph-edge-incoming)]"
              />
              Linked from ({connections.incoming.length})
            </h3>
            {connections.incoming.map(({ node: connectedNode, weight }) => (
              <button
                key={`incoming-${connectedNode.slug}`}
                type="button"
                onClick={() => onClickNeighbor(connectedNode.slug)}
                onPointerEnter={() => onHoverNeighbor(connectedNode.slug)}
                onPointerLeave={() => onHoverNeighbor(null)}
                onFocus={() => onHoverNeighbor(connectedNode.slug)}
                onBlur={() => onHoverNeighbor(null)}
                aria-label={`${connectedNode.title}, links to ${node.title}, ${weight} ${
                  weight === 1 ? "mention" : "mentions"
                }`}
                className="group flex min-h-11 w-full items-center gap-2.5 px-5 py-2 text-left transition-colors hover:bg-[var(--graph-control-hover)]"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: adaptGraphCategoryColor(groups.get(connectedNode.slug)?.color ?? '#9ba9b2', resolvedMode),
                  }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[0.85rem] font-medium text-[var(--graph-foreground)]">
                  {connectedNode.title}
                </span>
                {weight > 1 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--graph-muted)]">
                    ×{weight}
                  </span>
                )}
              </button>
            ))}
          </section>
        )}

        {connectionCount === 0 && (
          <p className="px-5 py-4 text-sm leading-relaxed text-[var(--graph-muted)]">
            This note has no direct links yet.
          </p>
        )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ── Tooltip ── */

export function NodeTooltip({
  node,
  position,
  resolvedMode,
}: {
  node: { label: string; color: string; categories: string[]; connectionCount: number; wordCount: number } | null;
  position: { x: number; y: number };
  resolvedMode: ResolvedThemeMode;
}) {
  if (!node) return null;
  const catColor = adaptGraphCategoryColor(node.color, resolvedMode);

  const placeLeft = typeof window !== "undefined" && position.x + 338 > window.innerWidth;
  const metadata = `${node.connectionCount} ${node.connectionCount === 1 ? "connection" : "connections"} · ${Math.max(1, Math.round(node.wordCount / 200))} min read`;
  return (
    <div
      role="tooltip"
      className="graph-surface-raised pointer-events-none absolute z-20 rounded-lg px-3 py-2.5"
      style={{
        width: "max-content",
        maxWidth: "min(320px, calc(100% - 24px))",
        left: placeLeft ? undefined : Math.max(12, position.x + 18),
        right: placeLeft ? `max(12px, calc(100% - ${position.x - 18}px))` : undefined,
        top: `clamp(76px, ${position.y - 24}px, max(76px, calc(100% - 80px)))`,
      }}
    >
      <p className="truncate text-sm font-semibold text-[var(--graph-foreground)]">{node.label}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] font-medium text-[var(--graph-muted)]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: catColor }} />
        <span className="min-w-0 truncate">{node.categories[0] ?? "Unassigned"}</span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{metadata}</span>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export async function loader() {
  try {
    return await fetchJson<ColoredGraphData>("/api/graph");
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const data = useLoaderData() as ColoredGraphData;
  return <GraphView key={`${data.vaultId}:${graphTopologyKey(data)}`} data={data} />;
}

function GraphView({ data }: { data: ColoredGraphData }) {
  const topology = useMemo(() => graphTopologyKey(data), [data]);
  const [savedView] = useState(() => graphViewCache.read(data.vaultId, topology));
  const restoringCameraRef = useRef(Boolean(savedView));
  const [allNotes,setAllNotes] = useState(savedView?.allNotes ?? false);
  const allNotesRef = useRef(allNotes);
  const [expandedNeighborhood,setExpandedNeighborhood] = useState<string | null>(savedView?.expandedNeighborhood ?? null);
  const expandedNeighborhoodRef = useRef(expandedNeighborhood);
  const [search, setSearch] = useState<GraphViewState["search"]>(() => savedView?.search ?? {query:"", indexOpen:false, visibleResultCount:GRAPH_INDEX_INITIAL_VISIBLE_COUNT});
  const topics = useMemo(() => [...new Set(Object.values(data.colorSources).flatMap(source => source.topics))].sort((a, b) => a.localeCompare(b)), [data.colorSources]);
  const [colorPreferences, setColorPreferences] = useState(() => readGraphColorPreferences(data.vaultId, topics));
  const [activeGroup, setActiveGroup] = useState<string | null>(savedView?.activeGroup ?? null);
  const colorGroups = useMemo(() => buildGraphColorGroups(data.colorSources, colorPreferences), [data.colorSources, colorPreferences]);
  const colorGroupsRef = useRef(colorGroups);
  const activeGroupRef = useRef(activeGroup);
  const changeColorPreferences = (value: GraphColorPreferences) => {
    setColorPreferences(value);
    writeGraphColorPreferences(data.vaultId, value);
    setActiveGroup(null);
  };
  const neighborhoods = useMemo(() => buildGraphNeighborhoods(data), [data]);
  const config = useWikiConfig();
  const { colorTheme, resolvedMode } = useAppearance();
  const resolvedModeRef = useRef(resolvedMode);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const finishEntranceRef = useRef<(() => void) | null>(null);
  const entranceShownRef = useRef(false);
  const sigmaRef = useRef<SigmaLib | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const graphThemeRef = useRef<GraphThemeColors | null>(null);
  const neuralControllerRef = useRef<GraphNeuralAnimationController | null>(null);
  const neuralSnapshotRef = useRef<GraphNeuralAnimationSnapshot | null>(null);
  const neuralSelectionCallbackRef = useRef<((slug: string) => void) | null>(null);
  const neuralFallbackWarningShownRef = useRef(false);
  const hoveredRef = useRef<string | null>(null);
  const cameraMovingRef = useRef(false);
  const focusedRef = useRef<string | null>(savedView?.focusedSlug ?? null);
  const linkedHoverRef = useRef<string | null>(null);
  const linkedPulseScaleRef = useRef(1);
  const linkedPulseFrameRef = useRef<number | null>(null);
  const linkedPulseGenerationRef = useRef(0);
  const focusIsolationCallbackRef = useRef<((slug: string | null) => void) | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const frameGraphCallbackRef = useRef<((duration?: number, forceFit?: boolean) => void) | null>(null);
  const overviewCallbackRef = useRef<((forceFit?:boolean) => void) | null>(null);
  const disclosureCallbackRef = useRef<(() => void) | null>(null);
  const frameNeighborhoodCallbackRef = useRef<((group:GraphNeighborhood) => void) | null>(null);
  const labelHitAreasRef = useRef(new Map<string, GraphBounds>());
  const pointerTargetRef = useRef<((point: {x:number;y:number}) => string | null) | null>(null);
  const hoverNodeCallbackRef = useRef<((slug:string|null) => void) | null>(null);
  const labelLayoutCallbackRef = useRef<(() => void) | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(savedView?.focusedSlug ?? null);
  const [detailPanelHeight, setDetailPanelHeight] = useState(0);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(savedView?.detailPanelCollapsed ?? false);
  const viewStateRef = useRef({focusedSlug, detailPanelCollapsed, activeGroup, search});
  useLayoutEffect(() => {
    viewStateRef.current = {focusedSlug, detailPanelCollapsed, activeGroup, search};
  }, [focusedSlug, detailPanelCollapsed, activeGroup, search]);
  const [tooltip, setTooltip] = useState<{
    node: { label: string; color: string; categories: string[]; connectionCount: number; wordCount: number };
    position: { x: number; y: number };
  } | null>(null);

  const nodeMap = useMemo(
    () => new Map(data.nodes.map((node) => [node.slug, node])),
    [data.nodes],
  );
  const focusedNode = focusedSlug ? nodeMap.get(focusedSlug) ?? null : null;
  const focusedConnections = useMemo(
    () =>
      focusedSlug
        ? getGraphConnectionGroups(focusedSlug, data.nodes, data.edges)
        : { outgoing: [], incoming: [] },
    [data.edges, data.nodes, focusedSlug],
  );

  useEffect(() => {
    const panel = detailPanelRef.current;
    if (!focusedNode || !panel) {
      setDetailPanelHeight(0);
      return;
    }

    const updateHeight = () => {
      setDetailPanelHeight(panel.getBoundingClientRect().height);
    };
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(panel);
    return () => resizeObserver.disconnect();
  }, [focusedNode]);

  useEffect(() => {
    if (!restoringCameraRef.current) frameGraphCallbackRef.current?.();
  }, [focusedSlug, activeGroup, detailPanelHeight, detailPanelCollapsed, colorGroups]);

  const handleSearchSelect = useCallback((slug: string) => {
    restoringCameraRef.current = false;
    neuralSelectionCallbackRef.current?.(slug);
    focusedRef.current = slug;
    focusIsolationCallbackRef.current?.(slug);
    setFocusedSlug(slug);
    setDetailPanelCollapsed(false);
    sigmaRef.current?.refresh();

  }, []);

  const handleCompactSearchInteraction = useCallback(() => {
    if (
      shouldCollapseGraphDetailPanelOnSearchInteraction(
        window.innerWidth,
        Boolean(focusedRef.current),
      )
    ) {
      setDetailPanelCollapsed(true);
    }
  }, []);

  const handleInfoClose = useCallback(() => {
    if (!allNotesRef.current && expandedNeighborhoodRef.current===null && activeGroupRef.current===null) {
      overviewCallbackRef.current?.(false);
      return;
    }
    const sigma = sigmaRef.current;
    neuralControllerRef.current?.clearSelection();
    focusedRef.current = null;
    focusIsolationCallbackRef.current?.(null);
    setFocusedSlug(null);
    setDetailPanelCollapsed(false);
    sigma?.refresh();
    restoringCameraRef.current = false;
    hoveredRef.current = null;
    setTooltip(null);
    shellRef.current?.focus({preventScroll:true});
  }, []);

  const handleInfoNeighborClick = useCallback((slug: string) => {
    restoringCameraRef.current = false;
    neuralSelectionCallbackRef.current?.(slug);
    focusedRef.current = slug;
    focusIsolationCallbackRef.current?.(slug);
    setFocusedSlug(slug);
    sigmaRef.current?.refresh();

  }, []);

  const handleInfoNeighborHover = useCallback((slug: string | null) => {
    const generation = ++linkedPulseGenerationRef.current;
    const previousSlug = linkedHoverRef.current;
    if (linkedPulseFrameRef.current !== null) {
      cancelAnimationFrame(linkedPulseFrameRef.current);
      linkedPulseFrameRef.current = null;
    }

    linkedHoverRef.current = slug;
    linkedPulseScaleRef.current = 1;
    const sigma = sigmaRef.current;
    const affectedNodes = [...new Set([previousSlug, slug].filter((value): value is string => Boolean(value)))];

    if (!slug) {
      if (sigma && affectedNodes.length > 0) {
        sigma.refresh({
          partialGraph: { nodes: affectedNodes },
          skipIndexation: true,
          schedule: true,
        });
      }
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      linkedPulseScaleRef.current = getGraphLinkedNodePulseScale(0, true);
      sigma?.refresh({
        partialGraph: { nodes: affectedNodes },
        skipIndexation: true,
        schedule: true,
      });
      return;
    }

    const startedAt = performance.now();
    const animatePulse = (timestamp: number) => {
      if (linkedHoverRef.current !== slug || generation !== linkedPulseGenerationRef.current) return;
      linkedPulseScaleRef.current = getGraphLinkedNodePulseScale(timestamp - startedAt, false);
      sigmaRef.current?.refresh({
        partialGraph: { nodes: [slug] },
        skipIndexation: true,
        schedule: true,
      });
      linkedPulseFrameRef.current = timestamp - startedAt < GRAPH_LINKED_NODE_PULSE_MS
        ? requestAnimationFrame(animatePulse) : null;
    };
    linkedPulseFrameRef.current = requestAnimationFrame(animatePulse);
  }, []);

  useEffect(
    () => () => {
      linkedPulseGenerationRef.current += 1;
      if (linkedPulseFrameRef.current !== null) {
        cancelAnimationFrame(linkedPulseFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!containerRef.current || data.nodes.length === 0) return;

    const graphTheme = getGraphThemeColors(containerRef.current);
    graphThemeRef.current = graphTheme;
    const graph = buildGraph(data, config.categories.aliases, graphTheme, resolvedMode);
    for (const group of neighborhoods.groups) for (const slug of group.members) {
      graph.mergeNodeAttributes(slug,{neighborhoodId:group.id,neighborhoodHub:group.hubs.includes(slug)});
    }
    const restored = graphViewCache.read(data.vaultId, topology);
    let layoutReady = restored?.layoutReady ?? false;
    if (restored) {
      for (const node of graph.nodes()) {
        const position = restored.positions[node];
        if (position) graph.mergeNodeAttributes(node, position);
      }
    }
    if (!restored?.layoutReady) {
      const fallback = layoutGraphNeighborhoods({...getGraphLayoutRequest(graph, neighborhoods.groups),iterations:0}, neighborhoods.groups);
      for (const point of fallback.positions) graph.mergeNodeAttributes(point.key,{x:point.x,y:point.y});
    }
    const neuralActivationIndex = createGraphNeuralActivationIndex(data.edges);
    const nodeVisibility = new Map(graph.nodes().map(node => [node, 1]));
    const edgeVisibility = new Map(graph.edges().map(edge => [edge, 1]));
    const isolationFrameRefreshOptions = {
      partialGraph: { nodes: graph.nodes(), edges: graph.edges() },
      // Disclosure and neural refreshes can invalidate program slots between
      // frames. Focus also changes edge types, so rebuild indexes before drawing.
      schedule: true,
    };
    const focusLinkColor = (slug: string) => {
      const colors = graphThemeRef.current ?? graphTheme;
      const assignment = colorGroupsRef.current.assignments.get(slug);
      const topic = assignment ? adaptGraphCategoryColor(assignment.color, resolvedModeRef.current) : colors.nodeDefault;
      return mixGraphColors(colors.edgeDefault, topic, 0.78);
    };
    graphRef.current = graph;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let entranceElapsed = motionQuery.matches || entranceShownRef.current ? GRAPH_ENTRANCE_MS : 0;
    const entranceDelays = buildEntranceDelays(data.nodes.map(node => node.slug), data.edges);
    let viewportSettings = getGraphViewportSettings(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
    );

    let detailLevel: GraphDetailLevel = restored?.detailLevel ?? "overview";
    let overviewRatio = 1;
    let expandedFitRatio: number | null = null;
    const disclosureTarget = (slug:string) => isGraphNodeRevealed(graph.getNodeAttribute(slug,"neighborhoodId"), {
      allNotes:allNotesRef.current,expandedNeighborhood:expandedNeighborhoodRef.current,detailLevel,
      context:Boolean(focusedRef.current || activeGroupRef.current !== null),
    },Boolean(hoveredRef.current && (slug===hoveredRef.current || graph.areNeighbors(hoveredRef.current,slug))));
    const isOverviewView=()=>!allNotesRef.current && !focusedRef.current && activeGroupRef.current===null && !expandedNeighborhoodRef.current && detailLevel==="overview";
    const disclosureVisibility = new Map(graph.nodes().map(slug=>[slug,Number(disclosureTarget(slug))]));
    let anchorVisibility=Number(isOverviewView());
    const memoryDelays=new Map([...entranceDelays].map(([slug,delay])=>[slug,delay/GRAPH_ENTRANCE_TIMING.maximumDelayMs*GRAPH_MEMORY_DELAY_MS]));
    let memoryTransition=false;
    let memoryNodes:Map<string,GraphMemoryNodeFrame>|null=null;
    type MemoryEdgeFrame = { progress:number; visibility:number; reversed:boolean };
    type MemoryReveal = { direction:"open"|"close"; nodes:Map<string,GraphMemoryNodeFrame>; edges:Map<string,MemoryEdgeFrame> };
    let memoryEdges:Map<string,MemoryEdgeFrame>|null=null;
    const createRenderer = (requestedNeuralEnabled: boolean) => {
      const edgeProgramClasses = getGraphEdgeProgramClasses(requestedNeuralEnabled);
      const rendererNeuralEnabled = hasGraphNeuralEdgeProgram(edgeProgramClasses);

      const renderer = new SigmaLib(graph, containerRef.current!, {
        allowInvalidContainer: true,
        ...GRAPH_MOVEMENT_RENDERING_SETTINGS,
        renderLabels: true,
        renderEdgeLabels: false,
        defaultDrawNodeLabel: createGraphLabelDrawer(graphTheme, labelHitAreasRef.current),
        defaultDrawNodeHover: createGraphHoverDrawer(graphTheme, labelHitAreasRef.current),
        labelColor: { color: graphTheme.label },
        labelFont: '"Urbanist", -apple-system, BlinkMacSystemFont, sans-serif',
        labelSize: viewportSettings.labelSize,
        labelWeight: "600",
        labelDensity: viewportSettings.labelDensity,
        labelGridCellSize: viewportSettings.labelGridCellSize,
        labelRenderedSizeThreshold: 1_000,
        defaultEdgeColor: graphTheme.edgeDefault,
        defaultEdgeType: "line",
        defaultNodeColor: graphTheme.nodeDefault,
        edgeProgramClasses,
        ...(neuralNodePrograms ? { nodeProgramClasses: neuralNodePrograms[resolvedMode] } : {}),
        minEdgeThickness: 0.65,
        stagePadding: viewportSettings.stagePadding,
        edgeReducer(edge, data) {
          const colors = graphThemeRef.current ?? graphTheme;
          const focused = focusedRef.current;
          const hovered = hoveredRef.current;
          const res = { ...data };
          const src = graph.source(edge);
          const tgt = graph.target(edge);

          if (focused && (src === focused || tgt === focused)) {
            res.color = src === focused ? colors.edgeOutgoing : colors.edgeIncoming;
            res.size = focused ? 1.45 : 1.15;
            res.type = "arrow";
          } else if (hovered && !focused) {
            if (src === hovered || tgt === hovered) {
              res.color = focusLinkColor(hovered);
              res.size = focused ? 1.45 : 1.15;
            }
          }

          const neuralSnapshot = neuralSnapshotRef.current;
          const neuralFrame = rendererNeuralEnabled
            ? neuralSnapshot?.edges.get(edge)
            : undefined;
          if (neuralFrame && neuralSnapshot?.activeSlug) {
            const neuralColor = focused
              ? (src === focused ? colors.edgeOutgoing : colors.edgeIncoming)
              : focusLinkColor(neuralSnapshot.activeSlug);
            const neuralAttributes = getGraphNeuralEdgeDisplayAttributes(
              neuralFrame,
              neuralColor,
              rendererNeuralEnabled,
              neuralSnapshot.edgeDelays.get(edge) ?? 0,
              Boolean(focused),
            );
            if (neuralAttributes) {
              Object.assign(res, neuralAttributes);
              res.size = focused ? 1.45 : 1.15;
            }
          }

          if (!focused && !hovered && activeGroupRef.current !== null) {
            const assignments = colorGroupsRef.current.assignments;
            if (assignments.get(src)?.id !== activeGroupRef.current || assignments.get(tgt)?.id !== activeGroupRef.current) {
              res.color = colors.edgeMuted;
            } else { res.color = colors.edgeOutgoing; }
          }
          if (entranceElapsed < GRAPH_ENTRANCE_MS && !memoryTransition) {
            const delay = Math.max(entranceDelays.get(src) ?? 0, entranceDelays.get(tgt) ?? 0);
            if (rendererNeuralEnabled) {
              res.type = "neural";
              res.neuralDelayMs = (entranceDelays.get(src) ?? 0) > (entranceDelays.get(tgt) ?? 0) ? -(delay + 1) : delay;
            } else {
              res.color = mixGraphColors(colors.background, res.color, Math.max(0, Math.min(1, (entranceElapsed - delay - GRAPH_ENTRANCE_TIMING.edgeStartMs) / GRAPH_ENTRANCE_TIMING.edgeTravelMs)));
            }
          }
          const memory=memoryEdges?.get(edge);
          if(memory) {
            if(rendererNeuralEnabled) {
              res.type="neural";res.neuralRevealProgress=memory.progress;res.neuralRevealReversed=memory.reversed;
            } else res.color=mixGraphColors(colors.background,res.color,memory.progress);
          }
          const visibility = memory?.visibility ?? (edgeVisibility.get(edge) ?? 1) * Math.min(disclosureVisibility.get(src) ?? 1,disclosureVisibility.get(tgt) ?? 1);
          res.color = mixGraphColors(colors.background, res.color, visibility);
          // Open memory shows local links; hovering reveals only that note's bridges.
          // Explicit selection, filters and neighborhood exploration keep their own visibility.
          const hiddenCrossNeighborhood = allNotesRef.current && !focused && activeGroupRef.current === null &&
            expandedNeighborhoodRef.current === null &&
            neighborhoods.membership.get(src) !== neighborhoods.membership.get(tgt) &&
            src !== hovered && tgt !== hovered;
          // Sigma renders synchronously before the entrance shader clock exists.
          // Keep edges hidden during that first render and the layout-worker wait.
          res.hidden = hiddenCrossNeighborhood || visibility <= 0 || (!memory && entranceElapsed === 0) || memory?.progress===0;
          return res;
        },
        nodeReducer(node, data) {
          const colors = graphThemeRef.current ?? graphTheme;
          const focused = focusedRef.current;
          const hovered = hoveredRef.current;
          const linkedHover = linkedHoverRef.current;
          const active = focused ?? hovered;
          const assignment = colorGroupsRef.current.assignments.get(node);
          const groupColor = assignment ? adaptGraphCategoryColor(assignment.color, resolvedModeRef.current) : colors.nodeDefault;
          const res = { ...data };
          res.graphSlug = node;
          res.color = groupColor;
          if (!active && activeGroupRef.current !== null && assignment?.id !== activeGroupRef.current) {
            res.color = colors.nodeMuted;
          }
          res.label = detailLevel === "detail" || expandedNeighborhoodRef.current !== null ? truncateGraphLabel(data.fullLabel, 60) : viewportSettings.compact ? data.compactLabel : data.label;
          res.forceLabel = Boolean(data.forceLabel);
          if (!active && activeGroupRef.current !== null && assignment?.id !== activeGroupRef.current) {
            res.label = "";
            res.forceLabel = false;
          }

          if (active) {
            const isActive = node === active;
            const isNeighbor = graph.hasEdge(active, node) || graph.hasEdge(node, active);

            if (isActive) {
              res.highlighted = true;
              res.zIndex = 2;
              if (focused) res.size = (res.size ?? 4) * 1.12;
            } else if (isNeighbor) {
              res.zIndex = 1;
              if (focused) {
                res.size = (res.size ?? 4) * 1.02;
              }
            } else {
              res.zIndex = 0;
              if (!focused) res.color = colors.nodeMuted;
            }
          }

          if (node === linkedHover) {
            res.highlighted = true;
            res.forceLabel = true;
            res.zIndex = 3;
            res.size = (res.size ?? 4) * linkedPulseScaleRef.current;
          }

          const neuralSnapshot = rendererNeuralEnabled
            ? neuralSnapshotRef.current
            : null;
          if (neuralSnapshot) {
            let neuralScale = neuralSnapshot.nodeScales.get(node) ?? 1;
            if (node === neuralSnapshot.activeSlug) {
              neuralScale = Math.max(neuralScale, neuralSnapshot.activeNodeScale);
            }
            res.size = (res.size ?? 4) * neuralScale;
          }

          const memory=memoryNodes?.get(node);
          if (memory) {
            res.size=(data.size ?? 4)*memory.scale;
            res.color=mixGraphColors(colors.background,res.color,memory.brightness ?? 1);
            res.entranceLabelOpacity=memory.label;
          } else if (entranceElapsed < GRAPH_ENTRANCE_MS) {
            const frame = entranceFrame(entranceElapsed, entranceDelays.get(node) ?? 0);
            res.size = Math.max(0.01, (res.size ?? 4) * (0.12 + frame.node * 0.88));
            res.color = mixGraphColors(colors.background, res.color, frame.node);
            res.entranceLabelOpacity = frame.label;
          }

          // Memory owns the composed opacity; do not apply its isolation source again.
          const visibility = memory?.visibility ?? (nodeVisibility.get(node) ?? 1) * (disclosureVisibility.get(node) ?? 1);
          res.color = focusColor(res.color, visibility);
          if (!memory) res.size = (res.size ?? 4) * (0.88 + visibility * 0.12);
          res.hidden = visibility <= 0;
          const labelVisibility = Math.max(0, (visibility - 0.35) / 0.65);
          if (!memory) res.entranceLabelOpacity = (res.entranceLabelOpacity ?? 1) * labelVisibility;
          return res;
        },
      });

      return { renderer, neuralEnabled: rendererNeuralEnabled };
    };

    const runtime = createGraphRendererRuntime({
      createRenderer,
      cleanupFailedConstruction: () =>
        cleanupFailedGraphRendererContainer(containerRef.current!),
      createNeuralController(renderer) {
        return createGraphNeuralAnimationController({
          onFrame(snapshot) {
            const previousSnapshot =
              neuralSnapshotRef.current ?? snapshot;
            // Sigma applies partial reducers synchronously. Expose the next snapshot and
            // renderer-local shader clock before scheduling either the membership reindex
            // or the steady render-only edge pass.
            neuralSnapshotRef.current = snapshot;
            // A full-memory trace owns this clock until completion or explicit exploration.
            if (!memoryTransition) {
              if (snapshot.mode) {
                setGraphNeuralRendererAnimationState(renderer, {
                  elapsedMs: snapshot.elapsedMs,
                  mode: snapshot.mode,
                  releaseOpacity: snapshot.releaseOpacity,
                  reducedMotion: snapshot.reducedMotion,
                });
              } else clearGraphNeuralRendererAnimationState(renderer);
            }
            renderer.refresh(
              getGraphNeuralFrameRefreshOptions(previousSnapshot, snapshot),
            );
          },
        });
      },
      onFallback(error) {
        if (neuralFallbackWarningShownRef.current) return;
        neuralFallbackWarningShownRef.current = true;
        console.warn(
          "Neural graph rendering is unavailable; using the static edge renderer.",
          error,
        );
      },
    });
    const sigma = runtime.renderer;
    const neuralEnabled = runtime.neuralEnabled;
    const neuralController = runtime.neuralController;
    const initialCamera = sigma.getCamera();
    const motionCamera = new GraphMotionCamera(initialCamera.getState());
    motionCamera.minRatio = initialCamera.minRatio;
    motionCamera.maxRatio = initialCamera.maxRatio;
    motionCamera.clean = initialCamera.clean;
    motionCamera.setReducedMotion(motionQuery.matches);
    sigma.setCamera(motionCamera);
    sigmaRef.current = sigma;
    if (restored) sigma.getCamera().setState(restored.camera);
    neuralControllerRef.current = neuralController;
    neuralSnapshotRef.current = neuralController?.getSnapshot() ?? null;
    const activateNeural = (slug: string, mode: "hover" | "selection") => {
      if(memoryTransition) {
        if(mode==="hover") return false;
        stopMemoryTransition();
      }
      if (!neuralEnabled || !neuralController) return false;
      return neuralController.activate({
        activeSlug: slug,
        edges: getGraphNeuralIndexedDirectEdges(slug, neuralActivationIndex),
        mode,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
    };
    neuralSelectionCallbackRef.current = (slug) => {
      activateNeural(slug, "selection");
    };

    let focusIsolationFrame: number | null = null;
    let disclosureFrame: number | null = null;
    let disclosureTargets: Map<string, number> | null = null;
    let anchorTarget=anchorVisibility;
    const clearMemoryTrace=()=>{
      memoryTransition=false;memoryNodes=null;memoryEdges=null;
      if(getGraphNeuralRendererAnimationState(sigma)?.mode==="disclosure") clearGraphNeuralRendererAnimationState(sigma);
    };
    const stopMemoryTransition=()=>{
      if(!memoryTransition) return;
      if(disclosureFrame!==null) cancelAnimationFrame(disclosureFrame);
      disclosureFrame=null;clearMemoryTrace();
    };
    // Capture before clearing exploration or finishing entrance: these values already
    // include every current opacity/size factor and become disclosure's sole input.
    const captureMemoryReveal = (direction:"open"|"close"):MemoryReveal => ({
      direction,
      nodes:new Map(graph.nodes().map(slug=>{
        const visibility=(disclosureVisibility.get(slug) ?? 0)*(nodeVisibility.get(slug) ?? 1);
        const entrance=entranceFrame(entranceElapsed,entranceDelays.get(slug) ?? 0);
        const display=sigma.getNodeDisplayData(slug);
        return [slug,memoryNodes?.get(slug) ?? {
          visibility,brightness:entrance.node,
          label:entrance.label*Math.max(0,(visibility-.35)/.65),
          scale:visibility && display ? display.size/(graph.getNodeAttribute(slug,"size") ?? 4) : .12,
        }];
      })),
      edges:new Map(graph.edges().map(edge=>{
        // Hidden bridges must not flash when closing or reversing the memory reveal.
        if(sigma.getEdgeDisplayData(edge)?.hidden) return [edge,{visibility:0,progress:0,reversed:false}];
        const src=graph.source(edge),tgt=graph.target(edge);
        const visibility=(edgeVisibility.get(edge) ?? 1)*Math.min(disclosureVisibility.get(src) ?? 0,disclosureVisibility.get(tgt) ?? 0);
        const delay=Math.max(entranceDelays.get(src) ?? 0,entranceDelays.get(tgt) ?? 0);
        const travel=Math.max(0,Math.min(1,(entranceElapsed-delay-GRAPH_ENTRANCE_TIMING.edgeStartMs)/GRAPH_ENTRANCE_TIMING.edgeTravelMs));
        return [edge,memoryEdges?.get(edge) ?? {
          visibility,progress:visibility ? (neuralEnabled ? graphRevealEase(travel) : travel) : 0,
          reversed:neuralEnabled && entranceElapsed<GRAPH_ENTRANCE_MS && visibility>0 && (entranceDelays.get(src) ?? 0)>(entranceDelays.get(tgt) ?? 0),
        }];
      })),
    });
    const updateDisclosure = (duration = 260, memory?:MemoryReveal) => {
      const memoryDirection=memory?.direction;
      if(memoryTransition && (focusedRef.current || activeGroupRef.current!==null || expandedNeighborhoodRef.current)) stopMemoryTransition();
      const targets=new Map(graph.nodes().map(slug=>[slug,Number(disclosureTarget(slug))]));
      const nextAnchorTarget=Number(isOverviewView());
      // Camera/label updates can ask for the same visibility during a handoff.
      // Keep its original clock instead of restarting the reveal delay.
      if (disclosureFrame !== null && duration > 0 && !motionQuery.matches && anchorTarget===nextAnchorTarget &&
        [...targets].every(([slug,value])=>disclosureTargets?.get(slug)===value)) return;
      if (disclosureFrame !== null) cancelAnimationFrame(disclosureFrame);
      disclosureFrame = null;
      disclosureTargets = targets;
      anchorTarget=nextAnchorTarget;
      const fromAnchors=anchorVisibility;
      const from=new Map(disclosureVisibility);
      if(!memoryDirection && !memoryTransition && fromAnchors===nextAnchorTarget && [...targets].every(([slug,value])=>from.get(slug)===value)) return;
      const fromMemoryNodes=memory?.nodes ?? memoryNodes;
      const fromMemoryEdges=memory?.edges ?? memoryEdges;
      const startedAt=performance.now();
      const ms=motionQuery.matches ? 0 : duration;
      clearMemoryTrace();
      memoryTransition=Boolean(memoryDirection && ms>0);
      if(!memoryTransition && fromAnchors===nextAnchorTarget && [...targets].every(([slug,value])=>from.get(slug)===value)) return;
      if(memoryTransition) {memoryNodes=new Map(fromMemoryNodes);memoryEdges=new Map(fromMemoryEdges);}
      const animate=(timestamp:number)=>{
        const progress=ms===0 ? 1 : Math.min(1,(timestamp-startedAt)/ms);
        const elapsed=timestamp-startedAt;
        anchorVisibility=getGraphDisclosureVisibility(fromAnchors,nextAnchorTarget,elapsed,ms);
        for (const [slug,target] of targets) {
          if(memoryTransition) {
            const frame=getGraphMemoryNodeFrame(fromMemoryNodes!.get(slug)!,target,elapsed,memoryDelays.get(slug) ?? 0,memoryDirection==="open");
            memoryNodes!.set(slug,frame);disclosureVisibility.set(slug,frame.visibility);
          } else disclosureVisibility.set(slug,getGraphDisclosureVisibility(from.get(slug) ?? 0,target,elapsed,ms));
        }
        if(memoryTransition) {
          for(const edge of graph.edges()) {
            const src=graph.source(edge),tgt=graph.target(edge);
            const target=Math.min(targets.get(src) ?? 0,targets.get(tgt) ?? 0);
            const previous=fromMemoryEdges!.get(edge)!;
            const delay=Math.max(memoryDelays.get(src) ?? 0,memoryDelays.get(tgt) ?? 0);
            memoryEdges!.set(edge,{
              progress:getGraphMemoryEdgeProgress(previous.progress,target,elapsed,delay,memoryDirection==="open"),
              visibility:getGraphMemoryEdgeProgress(previous.visibility,target,elapsed,delay,memoryDirection==="open"),
              reversed:previous.reversed,
            });
          }
          if(progress>=1) clearMemoryTrace();
          else if(neuralEnabled) setGraphNeuralRendererAnimationState(sigma,{mode:"disclosure",elapsedMs:elapsed,releaseOpacity:1,reducedMotion:false});
        }
        sigma.refresh();
        if(progress<1) disclosureFrame=requestAnimationFrame(animate);
        else {disclosureFrame=null;labelLayoutCallbackRef.current?.();}
      };
      animate(startedAt);
    };
    disclosureCallbackRef.current=updateDisclosure;
    const animateFocusIsolation = (nextSlug: string | null, disclosureDuration = 260, memory?:MemoryReveal) => {
      updateDisclosure(disclosureDuration,memory);
      if (focusIsolationFrame !== null) {
        cancelAnimationFrame(focusIsolationFrame);
        focusIsolationFrame = null;
      }

      if (memory) {
        // Disclosure has captured isolation; release its old factors and RAF.
        for (const node of nodeVisibility.keys()) nodeVisibility.set(node,1);
        for (const edge of edgeVisibility.keys()) edgeVisibility.set(edge,1);
        return;
      }
      const fromNodes = new Map(nodeVisibility);
      const fromEdges = new Map(edgeVisibility);
      const visibleNodes = nextSlug ? new Set([nextSlug, ...graph.neighbors(nextSlug)]) : null;
      const duration = getGraphMotionDuration(nextSlug ? 280 : 360);
      const startedAt = performance.now();
      const animate = (timestamp: number) => {
        const progress = duration === 0 ? 1 : Math.min(1, (timestamp - startedAt) / duration);
        for (const node of nodeVisibility.keys()) {
          const target = !visibleNodes || visibleNodes.has(node) ? 1 : 0;
          nodeVisibility.set(node, focusVisibility(fromNodes.get(node) ?? 1, target, progress));
        }
        for (const edge of edgeVisibility.keys()) {
          const target = !nextSlug || graph.source(edge) === nextSlug || graph.target(edge) === nextSlug ? 1 : 0;
          const from = fromEdges.get(edge) ?? 1;
          edgeVisibility.set(edge, focusVisibility(from, target, progress, target > from ? 0.16 : 0));
        }
        sigma.refresh(isolationFrameRefreshOptions);
        if (progress < 1) focusIsolationFrame = requestAnimationFrame(animate);
        else {
          focusIsolationFrame = null;
          sigma.refresh();
        }
      };
      animate(startedAt);
    };
    focusIsolationCallbackRef.current = animateFocusIsolation;
    if (focusedRef.current) {
      // Restore isolation now, but defer selection pulses until the entrance
      // finishes so the two animations never compete for the shader clock.
      const selected = focusedRef.current;
      const visible = new Set([selected, ...graph.neighbors(selected)]);
      for (const node of nodeVisibility.keys()) nodeVisibility.set(node, visible.has(node) ? 1 : 0);
      for (const edge of edgeVisibility.keys()) {
        edgeVisibility.set(edge, graph.source(edge) === selected || graph.target(edge) === selected ? 1 : 0);
      }
      sigma.refresh();
    }
    let neighborhoodLayer: ReturnType<typeof createGraphNeighborhoodLayer> | null = null;
    let navigationGeometry: ReturnType<typeof getGraphNavigationGeometry> | null = null;
    const getNavigationGeometry=()=>navigationGeometry ??= getGraphNavigationGeometry(neighborhoods.groups,
      slug=>graph.hasNode(slug) ? {x:graph.getNodeAttribute(slug,"x"),y:graph.getNodeAttribute(slug,"y")} : undefined,neighborhoods.independent);
    const getFullMemoryPoints=()=>[
      ...(neighborhoods.groups.length ? [{x:0,y:0}] : []),
      ...graph.nodes().map(slug=>({x:graph.getNodeAttribute(slug,"x"),y:graph.getNodeAttribute(slug,"y")})),
    ];
    const hubExtents=getGraphMemoryHubBounds({x:0,y:0});
    const fullMemoryPadding=neighborhoods.groups.length ? {
      x:Math.max(-hubExtents.left,hubExtents.right)+1,
      y:Math.max(-hubExtents.top,hubExtents.bottom)+1,
    } : undefined;
    const overviewTarget=()=>getGraphFrameTarget(sigma,graph.nodes(),true,getNavigationGeometry().points);
    let labelLayoutFrame: number | null = null;
    const schedulePersistentLabelLayout = () => {
      if (labelLayoutFrame !== null) cancelAnimationFrame(labelLayoutFrame);
      labelLayoutFrame = requestAnimationFrame(() => {
        labelLayoutFrame = null;
        overviewRatio = overviewTarget()?.ratio ?? 1;
        if (expandedNeighborhoodRef.current && !focusedRef.current && activeGroupRef.current===null && expandedFitRatio !== null && !sigma.getCamera().isAnimated() &&
          sigma.getCamera().getState().ratio >= Math.max(overviewRatio*.98,expandedFitRatio*1.2)) {
          returnToOverview();return;
        }
        // A framing flight passes through zoom thresholds; it must not replace
        // the navigation destination with a transient all-notes disclosure.
        const nextLevel = framingFrame !== null || sigma.getCamera().isAnimated()
          ? detailLevel : getGraphDetailLevel(overviewRatio / sigma.getCamera().getState().ratio, detailLevel);
        if (detailLevel !== nextLevel) {detailLevel=nextLevel;updateDisclosure();sigma.refresh();}
        neighborhoodLayer?.refresh();
        if (updateCollisionAwareGraphLabels(sigma, graph, focusedRef.current, activeGroupRef.current, colorGroupsRef.current.assignments, expandedNeighborhoodRef.current ? "detail" : detailLevel, neighborhoodLayer?.getTitleBounds() ?? [])) sigma.refresh();
      });
    };
    labelLayoutCallbackRef.current = schedulePersistentLabelLayout;
    let framingFrame: number | null = null;
    type FramingContext = {allNotes:boolean;focused:string|null;group:string|null;expanded:string|null;revealAfterFit?:boolean};
    let explicitFitContext: FramingContext | null = null;
    const scheduleGraphFrame = (duration = 360, forceFit = false) => {
      if (!layoutReady) return;
      const context:FramingContext={allNotes:allNotesRef.current,focused:focusedRef.current,group:activeGroupRef.current,expanded:expandedNeighborhoodRef.current};
      // React may request a reveal after navigation clears the details panel.
      // Do not let that downgrade an explicit Fit for the same destination.
      if (!forceFit && explicitFitContext && context.allNotes===explicitFitContext.allNotes && context.focused===explicitFitContext.focused &&
        context.group===explicitFitContext.group && context.expanded===explicitFitContext.expanded) {
        explicitFitContext.revealAfterFit=true;
        return;
      }
      explicitFitContext=forceFit ? context : null;
      if (framingFrame !== null) cancelAnimationFrame(framingFrame);
      framingFrame = requestAnimationFrame(() => {
        framingFrame = null;
        // A no-op reveal still replaces earlier motion: stop at the current view.
        motionCamera.cancel();
        const focused = focusedRef.current;
        const group = activeGroupRef.current;
        const expanded = neighborhoods.groups.find(item=>item.id===expandedNeighborhoodRef.current);
        let motion: Promise<void> | undefined;
        if (!focused && group===null && !expanded) {
          let target;
          if(allNotesRef.current) {
            const points=getFullMemoryPoints();
            target=forceFit ? getGraphFrameTarget(sigma,[],true,points,fullMemoryPadding) : getGraphRevealTarget(sigma,[],true,points);
            if(!forceFit && neighborhoods.groups.length) {
              const center=sigma.graphToViewport({x:0,y:0},{cameraState:target ?? sigma.getCamera().getState()});
              const hub=getGraphMemoryHubBounds(center),bounds=graphUsableViewport(sigma,true);
              // Minimum note padding is narrower than this fixed-size navigation control.
              if(hub.left<bounds.left || hub.right>bounds.right || hub.top<bounds.top || hub.bottom>bounds.bottom) {
                target=getGraphFrameTarget(sigma,[],true,points,fullMemoryPadding);
              }
            }
          } else {
            const overview=overviewTarget();
            const compact=getGraphDetailLevel((overview?.ratio ?? 1)/sigma.getCamera().getState().ratio,"overview")==="overview";
            // Point containment cannot detect fixed-size controls colliding after zoom-out.
            // Refresh their destination layout before deciding to preserve the camera.
            if(!forceFit && compact) neighborhoodLayer?.refresh();
            if(forceFit || !compact || neighborhoodLayer?.hasObstructedAnchors() || getGraphRevealTarget(sigma,[],true,getNavigationGeometry().points)) target=overview;
          }
          if(target) motion=sigma.getCamera().animate(target,{duration:getGraphMotionDuration(duration),easing:"quadraticInOut"});
        } else {
          const nodes=focused ? [focused,...graph.neighbors(focused)] : group!==null
            ? graph.nodes().filter(slug=>colorGroupsRef.current.assignments.get(slug)?.id===group) : expanded!.members;
          if(expanded && !focused && group===null) expandedFitRatio=getGraphFrameTarget(sigma,nodes)?.ratio ?? null;
          if (!forceFit && (focused || expanded)) {
            const target=getGraphRevealTarget(sigma,nodes);
            if(target) motion=sigma.getCamera().animate(target,{duration:getGraphMotionDuration(duration),easing:"quadraticInOut"});
          } else motion=animateGraphFrame(sigma,nodes,duration);
        }
        if(forceFit) void Promise.resolve(motion).then(()=>{
          if(explicitFitContext!==context) return;
          explicitFitContext=null;
          // Recheck changed chrome after fitting, without interrupting navigation.
          if(context.revealAfterFit) scheduleGraphFrame();
        });
        schedulePersistentLabelLayout();
      });
    };
    frameGraphCallbackRef.current = scheduleGraphFrame;
    const selectNeighborhood = (group:GraphNeighborhood) => {
      finishEntranceRef.current?.();
      restoringCameraRef.current=false;
      focusedRef.current=null;activeGroupRef.current=null;
      hoveredRef.current=null;setTooltip(null);
      allNotesRef.current=false;setAllNotes(false);
      expandedNeighborhoodRef.current=group.id;setExpandedNeighborhood(group.id);expandedFitRatio=null;
      neuralController?.clearSelection();animateFocusIsolation(null,GRAPH_NEIGHBORHOOD_TRANSITION_MS);
      setFocusedSlug(null);setActiveGroup(null);
      sigma.refresh();
      scheduleGraphFrame(480,true);
      shellRef.current?.focus({preventScroll:true});
    };
    frameNeighborhoodCallbackRef.current=selectNeighborhood;
    const setMemoryView=(showAll:boolean,forceFit=false)=>{
      const memory=captureMemoryReveal(showAll ? "open" : "close");
      restoringCameraRef.current=false;
      focusedRef.current=null;activeGroupRef.current=null;hoveredRef.current=null;
      expandedNeighborhoodRef.current=null;setExpandedNeighborhood(null);expandedFitRatio=null;
      allNotesRef.current=showAll;setAllNotes(showAll);
      if(!showAll) detailLevel="overview";
      animateFocusIsolation(null,showAll ? GRAPH_MEMORY_OPEN_MS : GRAPH_MEMORY_CLOSE_MS,memory);
      neuralController?.clearSelection();
      finishEntranceRef.current?.();
      setFocusedSlug(null);setActiveGroup(null);setTooltip(null);setDetailPanelCollapsed(false);
      setSearch(current=>({...current,query:"",indexOpen:false}));
      sigma.refresh();scheduleGraphFrame(480,forceFit);
      shellRef.current?.focus({preventScroll:true});
    };
    const returnToOverview=(forceFit=true)=>setMemoryView(false,forceFit);
    const hasMemoryContext=()=>Boolean(focusedRef.current || activeGroupRef.current!==null || expandedNeighborhoodRef.current);
    const toggleMemory=()=>setMemoryView(!allNotesRef.current || hasMemoryContext());
    overviewCallbackRef.current=returnToOverview;
    neighborhoodLayer=createGraphNeighborhoodLayer({
      container:shellRef.current!,sigma,groups:neighborhoods.groups,previews:buildGraphNeighborhoodPreviews(data,neighborhoods.groups),getGeometry:getNavigationGeometry,
      onSelect:selectNeighborhood,onMemory:toggleMemory,
      getState:()=>({
        hubCentered:!hasMemoryContext(),
        memoryAction:allNotesRef.current && !hasMemoryContext() ? "show-neighborhoods" : "show-all",
        overview:isOverviewView(),anchorOpacity:anchorVisibility,
        moving:cameraMovingRef.current || sigma.getCamera().isAnimated(),
        currentNeighborhood:focusedRef.current ? neighborhoods.membership.get(focusedRef.current) ?? null : expandedNeighborhoodRef.current,
        opacity:entranceFrame(entranceElapsed,0).node,
        bounds:graphUsableViewport(sigma),
        obstacles:["header","#graph-search-controls","#graph-node-index",".graph-color-controls",".graph-toolbar-stack"]
          .flatMap(selector=>{const box=graphChromeBounds(selector);return box?[box]:[];}),
        color:(graphThemeRef.current ?? graphTheme).label,
        anchorColor:id=>{
          const group=neighborhoods.groups.find(group=>group.id===id);
          const assignment=group && colorGroupsRef.current.assignments.get(group.hubs[0]);
          return assignment ? adaptGraphCategoryColor(assignment.color,resolvedModeRef.current) : (graphThemeRef.current ?? graphTheme).nodeDefault;
        },
      }),
    });
    const clearHover = () => {
      hoveredRef.current = null;
      neuralController?.releaseHover();
      updateDisclosure();
      setTooltip(null);
      containerRef.current!.style.cursor = "default";
    };
    const cameraSettler = createGraphCameraSettler(
      () => {cameraMovingRef.current=true;neighborhoodLayer?.dismissPreview();clearHover();},
      () => {cameraMovingRef.current=false;schedulePersistentLabelLayout();},
    );
    sigma.getCamera().on("updated", cameraSettler.updated);
    sigma.on("beforeRender", () => labelHitAreasRef.current.clear());
    pointerTargetRef.current = point => findGraphPointerTarget(point, graph.nodes().flatMap(slug => {
      const node = sigma.getNodeDisplayData(slug);
      if (!node || node.hidden) return [];
      return [{slug, ...sigma.framedGraphToViewport(node), radius:sigma.scaleSize(node.size), label:labelHitAreasRef.current.get(slug)}];
    }));
    hoverNodeCallbackRef.current = slug => {
      if(memoryTransition) return;
      if (slug === hoveredRef.current) return;
      hoveredRef.current = slug;
      updateDisclosure();
      if (slug && !focusedRef.current) {
        finishEntranceRef.current?.();
        activateNeural(slug, "hover");
      }
      else if (!slug) neuralController?.releaseHover();
      sigma.refresh();
      containerRef.current!.style.cursor = slug ? "pointer" : "default";
    };
    const entranceRefreshOptions = {
      partialGraph: { nodes: graph.nodes(), ...(neuralEnabled ? {} : { edges: graph.edges() }) },
      skipIndexation: true,
      schedule: true,
    };
    const entrance = createEntranceController({ onFrame(elapsed) {
      const previousElapsed = entranceElapsed;
      entranceElapsed = elapsed;
      if (elapsed < GRAPH_ENTRANCE_MS) {
        setGraphNeuralRendererAnimationState(sigma, { elapsedMs: elapsed, mode: "entrance", releaseOpacity: 1, reducedMotion: false });
        // Unhide/reindex edges once, then update only nodes and the shader clock.
        sigma.refresh(previousElapsed === 0 && elapsed > 0 ? { schedule: true } : entranceRefreshOptions);
        if (previousElapsed < GRAPH_ENTRANCE_TIMING.labelStartMs && elapsed >= GRAPH_ENTRANCE_TIMING.labelStartMs) schedulePersistentLabelLayout();
      } else {
        entranceShownRef.current = true;
        if (!memoryTransition) clearGraphNeuralRendererAnimationState(sigma);
        sigma.refresh();
        schedulePersistentLabelLayout();
        if (focusedRef.current) activateNeural(focusedRef.current, "selection");
      }
    }});
    finishEntranceRef.current = entrance.finish;
    const onMotionChange = () => {
      entrance.setReducedMotion(motionQuery.matches);
      neuralController?.setReducedMotion(motionQuery.matches);
      motionCamera.setReducedMotion(motionQuery.matches);
      if (!motionQuery.matches) return;
      window.clearTimeout(entranceFallback);
      linkedPulseGenerationRef.current += 1;
      if (linkedPulseFrameRef.current !== null) cancelAnimationFrame(linkedPulseFrameRef.current);
      linkedPulseFrameRef.current = null;
      linkedPulseScaleRef.current = linkedHoverRef.current ? getGraphLinkedNodePulseScale(0, true) : 1;
      animateFocusIsolation(focusedRef.current);
      updateDisclosure(0);
      for (const animation of detailPanelRef.current?.getAnimations?.() ?? []) animation.finish();
      sigma.refresh();
    };
    motionQuery.addEventListener("change", onMotionChange);
    // A silent worker must complete the fallback lifecycle, not only reveal it.
    let layoutWorker: ReturnType<typeof startGraphLayoutWorker> = null;
    const finishLayout=()=>{
      layoutReady=true;
      if(!restored?.layoutReady) scheduleGraphFrame(0,true);
      window.clearTimeout(entranceFallback);
      entrance.start(motionQuery.matches || entranceShownRef.current);
      navigationGeometry=null;
      sigma.refresh();neighborhoodLayer?.invalidate();schedulePersistentLabelLayout();
    };
    const entranceFallback=window.setTimeout(()=>{layoutWorker?.terminate();finishLayout();},1000);
    layoutWorker=layoutReady ? null : startGraphLayoutWorker(graph,neighborhoods.groups,finishLayout);
    if(!layoutWorker) finishLayout();
    const restoredNeighborhood=neighborhoods.groups.find(group=>group.id===restored?.expandedNeighborhood);
    if(restoredNeighborhood && restored?.layoutReady) expandedFitRatio=getGraphFrameTarget(sigma,restoredNeighborhood.members)?.ratio ?? null;
    schedulePersistentLabelLayout();

    let observedDimensions = sigma.getDimensions();
    const resizeObserver = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect;
      const resized = width !== observedDimensions.width || height !== observedDimensions.height;
      observedDimensions = {width, height};
      // Preserve a restored camera on the observer's initial delivery, not on
      // later resizes that can move the details card into the graph's bounds.
      if (resized) restoringCameraRef.current = false;
      viewportSettings = getGraphViewportSettings(
        width,
        height,
      );
      sigma.setSettings({
        labelSize: viewportSettings.labelSize,
        labelDensity: viewportSettings.labelDensity,
        labelGridCellSize: viewportSettings.labelGridCellSize,
        stagePadding: viewportSettings.stagePadding,
      });
      schedulePersistentLabelLayout();
      if (!restoringCameraRef.current) scheduleGraphFrame();
    });
    resizeObserver.observe(containerRef.current);

    sigma.on("enterNode", ({ node }) => {
      if (cameraMovingRef.current || memoryTransition) return;
      entrance.finish();
      hoveredRef.current = node;
      updateDisclosure();
      if (!focusedRef.current) activateNeural(node, "hover");
      sigma.refresh();
      containerRef.current!.style.cursor = "pointer";
    });

    sigma.on("leaveNode", () => {
      neuralController?.releaseHover();
      hoveredRef.current = null;
      updateDisclosure();
      sigma.refresh();
      setTooltip(null);
      containerRef.current!.style.cursor = "default";
    });

    const selectNode = (node: string) => {
      shellRef.current?.focus({preventScroll:true});
      const selection = getGraphNodeClickSelection(focusedRef.current, node);
      if (selection.shouldReplayNeural) neuralSelectionCallbackRef.current?.(node);
      if (!selection.shouldCenter) return;
      restoringCameraRef.current = false;
      focusedRef.current = node;
      focusIsolationCallbackRef.current?.(node);
      setFocusedSlug(node);
      setDetailPanelCollapsed(false);
      clearHover();
      sigma.refresh();
    };
    sigma.on("clickNode", ({node}) => selectNode(node));
    sigma.on("clickStage", ({event}) => {
      const node = pointerTargetRef.current?.(event);
      if (node) selectNode(node);
      else if (expandedNeighborhoodRef.current) {
        // A pan release must not act like an intentional background click.
        if (!cameraMovingRef.current && !sigma.getCamera().isAnimated()) returnToOverview();
      }
      else if (focusedRef.current) handleInfoClose();
    });

    return () => {
      graphViewCache.save(data.vaultId, topology, {
        ...viewStateRef.current,
        allNotes:allNotesRef.current,
        layoutReady,
        detailLevel,
        expandedNeighborhood: expandedNeighborhoodRef.current,
        camera: sigma.getCamera().getState(),
        positions: Object.fromEntries(graph.nodes().map(node => [node, {
          x: graph.getNodeAttribute(node, "x"), y: graph.getNodeAttribute(node, "y"),
        }])),
      });
      if (framingFrame !== null) cancelAnimationFrame(framingFrame);
      explicitFitContext = null;
      frameGraphCallbackRef.current = null;
      frameNeighborhoodCallbackRef.current = null;
      overviewCallbackRef.current=null;disclosureCallbackRef.current=null;
      if(disclosureFrame!==null) cancelAnimationFrame(disclosureFrame);
      neighborhoodLayer?.destroy();
      cameraSettler.destroy();
      motionCamera.destroy();
      sigma.getCamera().off("updated", cameraSettler.updated);
      pointerTargetRef.current = null;
      hoverNodeCallbackRef.current = null;
      labelHitAreasRef.current.clear();
      cameraMovingRef.current = false;
      entrance.destroy();
      finishEntranceRef.current = null;
      window.clearTimeout(entranceFallback);
      motionQuery.removeEventListener("change", onMotionChange);
      layoutWorker?.terminate();
      neuralSelectionCallbackRef.current = null;
      neuralController?.destroy();
      clearGraphNeuralRendererAnimationState(sigma);
      neuralControllerRef.current = null;
      neuralSnapshotRef.current = null;
      if (focusIsolationFrame !== null) cancelAnimationFrame(focusIsolationFrame);
      focusIsolationCallbackRef.current = null;
      if (labelLayoutFrame !== null) cancelAnimationFrame(labelLayoutFrame);
      labelLayoutCallbackRef.current = null;
      resizeObserver.disconnect();
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
      graphThemeRef.current = null;
    };
  }, [config.categories.aliases, data, topology, neighborhoods]);

  useEffect(() => {
    const container = containerRef.current;
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!container || !graph || !sigma) return;

    const colors = getGraphThemeColors(container);
    graphThemeRef.current = colors;
    updateGraphThemeInPlace(graph, sigma, config.categories.aliases, colors, resolvedMode, labelHitAreasRef.current);
  }, [colorTheme, resolvedMode, config.categories.aliases]);

  useEffect(() => {
    colorGroupsRef.current = colorGroups;
    activeGroupRef.current = activeGroup;
    resolvedModeRef.current = resolvedMode;
    disclosureCallbackRef.current?.();
    sigmaRef.current?.refresh();
  }, [colorGroups, activeGroup, resolvedMode]);

  // Tooltip tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let tooltipFrame: number | null = null;
    let pointerPosition = { x: 0, y: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      pointerPosition = { x: e.clientX, y: e.clientY };
      if (tooltipFrame !== null) return;

      tooltipFrame = requestAnimationFrame(() => {
        tooltipFrame = null;
        if (cameraMovingRef.current || sigmaRef.current?.getCamera().isAnimated()) return;
        const rect = container.getBoundingClientRect();
        const target = pointerTargetRef.current?.({x:pointerPosition.x-rect.left,y:pointerPosition.y-rect.top}) ?? null;
        hoverNodeCallbackRef.current?.(target);
        const hovered = hoveredRef.current;
        if (!hovered || !graphRef.current) {
          setTooltip(null);
          return;
        }
        const attrs = graphRef.current.getNodeAttributes(hovered);
        setTooltip({
          node: {
            label: attrs.fullLabel ?? attrs.label,
            color: colorGroupsRef.current.assignments.get(hovered)?.color ?? '#9ba9b2',
            categories: [colorGroupsRef.current.assignments.get(hovered)?.label ?? 'Unassigned'],
            connectionCount: attrs.connectionCount ?? 0,
            wordCount: attrs.wordCount ?? 0,
          },
          position: pointerPosition,
        });
      });
    };

    const handleMouseLeave = () => {
      if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame);
      tooltipFrame = null;
      hoverNodeCallbackRef.current?.(null);
      setTooltip(null);
    };
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame);
    };
  }, []);

  return (
    <main
      ref={shellRef}
      tabIndex={-1}
      onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (focusedRef.current) {event.preventDefault();handleInfoClose();}
        else if (activeGroupRef.current !== null || expandedNeighborhoodRef.current !== null) {event.preventDefault();overviewCallbackRef.current?.();}
      }}
      className="app-route-shell graph-shell fixed inset-0"
      aria-label="Knowledge graph"
      onPointerDownCapture={event => {
        restoringCameraRef.current=false;
        if (!(event.target instanceof Element && event.target.closest(".graph-memory-hub"))) finishEntranceRef.current?.();
      }}
      onKeyDownCapture={event => {
        restoringCameraRef.current=false;
        if (!(event.target instanceof Element && event.target.closest(".graph-memory-hub"))) finishEntranceRef.current?.();
      }}
      onWheelCapture={() => { restoringCameraRef.current = false; finishEntranceRef.current?.(); }}
      aria-describedby="graph-instructions"
    >
      <p id="graph-instructions" className="sr-only">
        Explore {data.nodes.length} notes and {data.edges.length} connections. Use Find a
        concept to browse or search notes with the keyboard. Selecting a note isolates its
        direct links and separates notes it links to from notes that link back to it.
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {focusedNode
          ? (() => {
              const connectionCount = focusedNode.neighbors.length;
              return `${focusedNode.title} selected. ${connectionCount} ${
                connectionCount === 1 ? "connection" : "connections"
              } and ${focusedNode.wordCount} words.`;
            })()
          : expandedNeighborhood ? `${neighborhoods.groups.find(group=>group.id===expandedNeighborhood)?.label ?? "Neighborhood"} expanded.` : allNotes ? `All ${data.nodes.length} notes visible.` : "Graph overview active."}
      </div>
      {/* Header */}
      <header className="app-route-header absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pb-[4.5rem] pt-[calc(env(safe-area-inset-top)+1.5rem)] lg:h-16 lg:px-4 lg:py-0 lg:px-5">
        <Link
          to="/"
          aria-label="Back to wiki home"
          className="app-route-header-brand hidden min-h-11 flex-col justify-center rounded-md px-1 py-1 text-left lg:flex"
        >
          <div className="mt-0.5 flex items-center gap-2">
            <House className="app-route-header-meta h-4 w-4" />
            <h1 className="text-base font-semibold">Graph</h1>
          </div>
        </Link>
        <div className="relative z-20 ml-auto flex items-center gap-1.5 lg:gap-2.5">
          <span className="app-route-header-meta hidden items-center gap-1.5 text-xs lg:flex">
            <span className="font-semibold tabular-nums">
              {data.nodes.length}
            </span>
            <span>{config.navigation.conceptsLabel}</span>
            <span>·</span>
            <span className="font-semibold tabular-nums">
              {data.edges.length}
            </span>
            <span>{config.navigation.connectionsLabel}</span>
          </span>
          <Link
            to="/"
            className="app-route-header-control hidden min-h-11 items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium lg:inline-flex lg:px-4"
          >
            {config.navigation.backToWikiLabel}
          </Link>
        </div>
        {data.nodes.length > 0 ? (
          <GraphSearch
            nodes={data.nodes}
            neighborhoods={neighborhoods.groups}
            onSelectNeighborhood={group => frameNeighborhoodCallbackRef.current?.(group)}
            search={search}
            setSearch={setSearch}
            onSelect={handleSearchSelect}
            onCompactSearchInteraction={handleCompactSearchInteraction}
            detailPanelCollapsed={detailPanelCollapsed}
            selectedSlug={focusedSlug}
            searchInputRef={searchInputRef}
          />
        ) : null}
      </header>

      {data.nodes.length > 0 ? (
        <>
          <GraphColorControls preferences={colorPreferences} topics={topics}
            groups={colorGroups.groups.map(group => ({ ...group, color: adaptGraphCategoryColor(group.color, resolvedMode) }))}
            activeGroup={activeGroup} onChange={changeColorPreferences}
            onHighlight={id => {
              if(id===null) {overviewCallbackRef.current?.();return;}
              expandedNeighborhoodRef.current=null;setExpandedNeighborhood(null);
              activeGroupRef.current=id;
              restoringCameraRef.current = false;
              neuralControllerRef.current?.clearSelection();
              focusedRef.current = null;
              focusIsolationCallbackRef.current?.(null);
              setFocusedSlug(null);
              setActiveGroup(id);
              // All is also an explicit recovery action after manual pan/zoom,
              // even if the overview state itself has not changed.
              frameGraphCallbackRef.current?.();
            }} />
          {/* Hover details remain available while exploring an isolated neighborhood. */}
            <NodeTooltip
              node={tooltip?.node ?? null}
              position={tooltip?.position ?? { x: 0, y: 0 }}
              resolvedMode={resolvedMode}
            />

          {/* Info panel (when focused) */}
          {focusedNode && (
            <InfoPanel
              node={focusedNode}
              connections={focusedConnections}
              panelRef={detailPanelRef}
              collapsed={detailPanelCollapsed}
              onCollapsedChange={setDetailPanelCollapsed}
              onClose={handleInfoClose}
              onClickNeighbor={handleInfoNeighborClick}
              onHoverNeighbor={handleInfoNeighborHover}
              onNavigate={(slug) => navigate(`/wiki/${slug}`)}
              groups={colorGroups.assignments}
              explicitTopics={data.colorSources[focusedNode.slug]?.topics ?? []}
              resolvedMode={resolvedMode}
            />
          )}

          <GraphViewportControls
            sigmaRef={sigmaRef}
            compactPanelOpen={Boolean(focusedNode)}
            detailPanelHeight={detailPanelHeight}
            onCameraSettled={() => labelLayoutCallbackRef.current?.()}
            onFit={() => { restoringCameraRef.current=false; frameGraphCallbackRef.current?.(360,true); }}
          />

          {/* Sigma canvas is a visual duplicate of the semantic node index. */}
          <div ref={containerRef} className="graph-canvas h-full w-full" aria-hidden="true" />
        </>
      ) : (
        <section className="absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-md">
            <h1 className="text-xl font-semibold text-[var(--graph-foreground)]">
              No notes to map yet
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--graph-muted)]">
              Add notes to the current vault or reindex it, then return to see their relationships.
            </p>
            <Link
              to="/"
              className="app-secondary-action mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold"
            >
              Back to wiki
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
