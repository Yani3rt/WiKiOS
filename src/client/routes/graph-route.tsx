import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, redirect, useLoaderData, useNavigate } from "react-router-dom";
import Graph from "graphology";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  House,
  ListTree,
  Minus,
  Plus,
  Scan,
  X,
} from "lucide-react";
import SigmaLib from "sigma";
import type { NodeLabelDrawingFunction } from "sigma/rendering";

import { useWikiConfig } from "@/client/wiki-config";
import {
  getCollisionAwareGraphLabelPlacements,
  getDeterministicGraphPositions,
  getGraphCameraCenterForViewportTarget,
  getGraphConnectionGroups,
  getGraphDetailHeightAnimation,
  getGraphDetailPanelToggleState,
  getGraphDisconnectedNodeTransition,
  getGraphEdgeSize,
  getGraphIndexNodes,
  getGraphIsolationFrameRefreshOptions,
  getGraphLayoutIterations,
  getGraphLinkedNodePulseScale,
  getGraphNodeClickSelection,
  getGraphNodeFocusViewportPoint,
  getGraphNodeSize,
  getGraphToolbarPanelOffset,
  getGraphViewportSettings,
  getNextGraphIndex,
  getPersistentLabelSlugs,
  GRAPH_INDEX_INITIAL_VISIBLE_COUNT,
  GRAPH_INDEX_LOAD_MORE_COUNT,
  GRAPH_MOVEMENT_RENDERING_SETTINGS,
  shouldCloseGraphNodeIndexAfterSelection,
  shouldCollapseGraphDetailPanelOnSearchInteraction,
  shouldResetGraphCameraAfterDetailClose,
  mixGraphColors,
  strengthenGraphColor,
  truncateGraphLabel,
  type GraphConnectionGroups,
  type GraphLayoutRequest,
  type GraphLayoutResult,
} from "@/client/graph-overview-model";
import { getTopicColor, type TopicAliasConfig } from "@/lib/wiki-config";
import type { GraphData, GraphNode } from "@/lib/wiki-shared";
import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

/* ── Graph theme ── */

interface GraphThemeColors {
  background: string;
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

function animateGraphNodeFocus(sigma: SigmaLib, slug: string, duration: number) {
  const position = sigma.getNodeDisplayData(slug);
  if (!position) return;

  const camera = sigma.getCamera();
  const dimensions = sigma.getDimensions();
  const searchBottom =
    document.getElementById("graph-search-controls")?.getBoundingClientRect().bottom ?? 120;
  const detailPanelTop = document
    .querySelector<HTMLElement>("aside[aria-labelledby='graph-node-details-title']")
    ?.getBoundingClientRect().top;
  const viewportTarget = getGraphNodeFocusViewportPoint(
    dimensions.width,
    dimensions.height,
    searchBottom,
    detailPanelTop,
  );
  const centeredState = {
    x: position.x,
    y: position.y,
    ratio: 0.55,
    angle: camera.getState().angle,
  };
  const framedPositionAtTarget = sigma.viewportToFramedGraph(viewportTarget, {
    cameraState: centeredState,
  });
  const cameraCenter = getGraphCameraCenterForViewportTarget(
    position,
    framedPositionAtTarget,
  );

  void camera.animate(
    { ...cameraCenter, ratio: centeredState.ratio },
    { duration: getGraphMotionDuration(duration) },
  );
}

function getCategoryColor(
  categories: string[],
  aliases: Record<string, TopicAliasConfig>,
  fallbackColor = "var(--graph-node-default)",
): string {
  for (const cat of categories) {
    return strengthenGraphColor(getTopicColor(cat, aliases));
  }
  return fallbackColor;
}

function createGraphLabelDrawer(colors: GraphThemeColors): NodeLabelDrawingFunction {
  return (context, data, settings) => {
    if (!data.label) return;

    const labelColor = "color" in settings.labelColor ? settings.labelColor.color : colors.label;

    context.save();
    context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
    const labelWidth = context.measureText(data.label).width;
    const x =
      data.labelPlacement === "left"
        ? data.x - data.size - 5 - labelWidth
        : data.x + data.size + 5;
    const y = data.y + settings.labelSize / 3;
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = colors.background;
    context.strokeText(data.label, x, y);
    context.fillStyle = labelColor ?? colors.label;
    context.fillText(data.label, x, y);
    context.restore();
  };
}

/* ── Graph building ── */

function buildGraph(
  data: GraphData,
  aliases: Record<string, TopicAliasConfig>,
  colors: GraphThemeColors,
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
      color: getCategoryColor(node.categories, aliases, colors.nodeDefault),
      originalColor: getCategoryColor(node.categories, aliases, colors.nodeDefault),
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

function startGraphLayoutWorker(graph: Graph, onComplete: () => void) {
  if (typeof Worker === "undefined") return null;

  const worker = new Worker(new URL("../graph-layout-worker.ts", import.meta.url), {
    type: "module",
    name: "wikios-graph-layout",
  });
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

  worker.addEventListener(
    "message",
    ({ data }: MessageEvent<GraphLayoutResult>) => {
      for (const position of data.positions) {
        if (!graph.hasNode(position.key)) continue;
        graph.mergeNodeAttributes(position.key, { x: position.x, y: position.y });
      }
      worker.terminate();
      onComplete();
    },
    { once: true },
  );
  worker.addEventListener("error", () => worker.terminate(), { once: true });
  worker.postMessage({
    nodes,
    edges,
    iterations: getGraphLayoutIterations(graph.order),
  } satisfies GraphLayoutRequest);

  return worker;
}

function updateCollisionAwareGraphLabels(sigma: SigmaLib, graph: Graph) {
  const dimensions = sigma.getDimensions();
  const viewportSettings = getGraphViewportSettings(dimensions.width, dimensions.height);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.font = `600 ${viewportSettings.labelSize}px "Urbanist", sans-serif`;

  const candidates: Parameters<typeof getCollisionAwareGraphLabelPlacements>[0] = [];
  graph.forEachNode((slug, attributes) => {
    if (!attributes.persistentLabel) return;
    const displayData = sigma.getNodeDisplayData(slug);
    if (!displayData) return;
    const point = sigma.framedGraphToViewport({ x: displayData.x, y: displayData.y });
    const label = String(
      viewportSettings.compact ? attributes.compactLabel ?? attributes.label ?? "" : attributes.label ?? "",
    );
    candidates.push({
      slug,
      x: point.x,
      y: point.y,
      nodeSize: sigma.scaleSize(displayData.size),
      labelWidth: context.measureText(label).width + 4,
      labelHeight: viewportSettings.labelSize + 8,
      priority:
        Number(attributes.connectionCount ?? 0) * 100_000 + Number(attributes.wordCount ?? 0),
    });
  });

  const placements = getCollisionAwareGraphLabelPlacements(candidates, {
    ...dimensions,
    padding: Math.min(24, viewportSettings.stagePadding / 2),
    gap: 5,
  });
  let changed = false;

  graph.forEachNode((slug, attributes) => {
    if (!attributes.persistentLabel) return;
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
}: {
  sigmaRef: React.RefObject<SigmaLib | null>;
  compactPanelOpen: boolean;
  detailPanelHeight: number;
  onCameraSettled: () => void;
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

  const fitGraph = () => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    void camera
      .animatedReset({ duration: getGraphMotionDuration(180) })
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
        <button type="button" onClick={fitGraph} className={controlClass} aria-label="Fit graph">
          <Scan aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" onClick={zoomIn} className={controlClass} aria-label="Zoom in">
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Search ── */

function GraphSearch({
  nodes,
  onSelect,
  onCompactSearchInteraction,
  selectedSlug,
  browseButtonRef,
}: {
  nodes: GraphNode[];
  onSelect: (slug: string) => void;
  onCompactSearchInteraction: () => void;
  selectedSlug: string | null;
  browseButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [indexOpen, setIndexOpen] = useState(false);
  const [indexClosing, setIndexClosing] = useState(false);
  const [rovingSlug, setRovingSlug] = useState<string | null>(null);
  const [visibleResultCount, setVisibleResultCount] = useState(
    GRAPH_INDEX_INITIAL_VISIBLE_COUNT,
  );
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeTimerRef = useRef<number | null>(null);
  const results = useMemo(() => getGraphIndexNodes(nodes, query), [nodes, query]);
  const visibleResults = useMemo(
    () => results.slice(0, visibleResultCount),
    [results, visibleResultCount],
  );
  const panelOpen = indexOpen || query.trim().length > 0;

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (visibleResults.length === 0) {
      setRovingSlug(null);
    } else if (!rovingSlug || !visibleResults.some((node) => node.slug === rovingSlug)) {
      setRovingSlug(visibleResults[0].slug);
    }
  }, [visibleResults, rovingSlug]);

  const focusResult = (index: number) => {
    const result = visibleResults[index];
    if (!result) return;
    setRovingSlug(result.slug);
    requestAnimationFrame(() => itemRefs.current.get(result.slug)?.focus());
  };

  const handleResultKeyDown = (event: React.KeyboardEvent, currentIndex: number) => {
    const nextIndex = getNextGraphIndex(currentIndex, event.key, visibleResults.length);
    if (nextIndex === null) return;
    event.preventDefault();
    focusResult(nextIndex);
  };

  const cancelPendingClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIndexClosing(false);
  };

  const closeIndex = (returnFocus: boolean) => {
    cancelPendingClose();
    setQuery("");
    setVisibleResultCount(GRAPH_INDEX_INITIAL_VISIBLE_COUNT);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndexOpen(false);
      if (returnFocus) requestAnimationFrame(() => browseButtonRef.current?.focus());
      return;
    }

    setIndexOpen(true);
    setIndexClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIndexOpen(false);
      setIndexClosing(false);
      if (returnFocus) requestAnimationFrame(() => browseButtonRef.current?.focus());
    }, 160);
  };

  const handleSelect = (slug: string, returnFocusAfterClose = false) => {
    onSelect(slug);
    setRovingSlug(slug);

    if (shouldCloseGraphNodeIndexAfterSelection(window.innerWidth)) {
      closeIndex(returnFocusAfterClose);
    } else {
      cancelPendingClose();
      setQuery("");
      setVisibleResultCount(GRAPH_INDEX_INITIAL_VISIBLE_COUNT);
      setIndexOpen(true);
    }
  };

  return (
    <div className="graph-search absolute left-4 right-4 z-10 sm:left-6 sm:right-auto sm:w-80">
      <div id="graph-search-controls" className="flex gap-2">
        <input
          type="search"
          value={query}
          onFocus={onCompactSearchInteraction}
          onChange={(event) => {
            cancelPendingClose();
            setQuery(event.target.value);
            setVisibleResultCount(GRAPH_INDEX_INITIAL_VISIBLE_COUNT);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && panelOpen && visibleResults.length > 0) {
              event.preventDefault();
              focusResult(0);
            }
          }}
          placeholder="Find a concept..."
          aria-label="Find a concept"
          aria-controls="graph-node-index"
          aria-expanded={panelOpen}
          className="graph-surface min-w-0 flex-1 rounded-lg px-4 py-2.5 text-sm text-[var(--graph-foreground)] outline-none placeholder:text-[var(--graph-muted)]"
        />
        <button
          ref={browseButtonRef}
          type="button"
          onClick={() => {
            if (panelOpen) {
              closeIndex(true);
            } else {
              cancelPendingClose();
              onCompactSearchInteraction();
              setVisibleResultCount(GRAPH_INDEX_INITIAL_VISIBLE_COUNT);
              setIndexOpen(true);
            }
          }}
          className="graph-surface order-last grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--graph-muted)] transition-colors hover:bg-[var(--graph-control-hover)] hover:text-[var(--graph-foreground)]"
          aria-label={panelOpen ? "Close node index" : "Browse nodes"}
          aria-controls="graph-node-index"
          aria-expanded={panelOpen}
        >
          <ListTree aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {panelOpen && (
        <section
          id="graph-node-index"
          className={`graph-node-index-panel graph-surface-raised mt-2 overflow-hidden rounded-xl ${
            indexClosing ? "graph-node-index-panel--closing" : ""
          }`}
          data-state={indexClosing ? "closing" : "open"}
          aria-labelledby="graph-node-index-title"
        >
          <div className="flex min-h-11 items-center justify-between border-b border-[var(--graph-border)] px-3 py-2">
            <div className="min-w-0">
              <h2 id="graph-node-index-title" className="text-sm font-semibold text-[var(--graph-foreground)]">
                {query.trim() ? "Matching notes" : "All notes"}
              </h2>
              <p className="text-xs text-[var(--graph-muted)]">
                {results.length} {results.length === 1 ? "result" : "results"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => closeIndex(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--graph-muted)] transition-colors hover:bg-[var(--graph-control-hover)] hover:text-[var(--graph-foreground)]"
              aria-label="Close node index"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <p className="sr-only">Use the arrow keys to move between notes and Enter to select.</p>
          {results.length > 0 ? (
            <ul className="graph-node-index-list max-h-[14.25rem] sm:max-h-[min(62vh,34rem)] overflow-y-auto py-1">
              {visibleResults.map((node, index) => {
                const connectionCount = node.neighbors.length;
                return (
                  <li key={node.slug}>
                    <button
                      ref={(element) => {
                        if (element) itemRefs.current.set(node.slug, element);
                        else itemRefs.current.delete(node.slug);
                      }}
                      type="button"
                      tabIndex={rovingSlug === node.slug ? 0 : -1}
                      onFocus={() => setRovingSlug(node.slug)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelect(node.slug, true);
                          return;
                        }
                        handleResultKeyDown(event, index);
                      }}
                      onClick={() => handleSelect(node.slug)}
                      aria-current={selectedSlug === node.slug ? "true" : undefined}
                      aria-label={`${node.title}, ${connectionCount} ${
                        connectionCount === 1 ? "connection" : "connections"
                      }`}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--graph-control-hover)] focus-visible:bg-[var(--graph-control-hover)] aria-[current=true]:bg-[var(--graph-control-hover)]"
                    >
                      <span className="min-w-0 break-words text-sm font-medium text-[var(--graph-foreground)]">
                        {node.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--graph-muted)]">
                        {connectionCount}
                      </span>
                    </button>
                  </li>
                );
              })}
              {visibleResults.length < results.length && (
                <li className="border-t border-[var(--graph-border)]">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleResultCount((count) =>
                        Math.min(results.length, count + GRAPH_INDEX_LOAD_MORE_COUNT),
                      )
                    }
                    className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-sm font-semibold text-[var(--graph-foreground)] transition-colors hover:bg-[var(--graph-control-hover)] focus-visible:bg-[var(--graph-control-hover)]"
                    aria-label={`Load ${Math.min(
                      GRAPH_INDEX_LOAD_MORE_COUNT,
                      results.length - visibleResults.length,
                    )} more notes`}
                  >
                    <span>Load more</span>
                    <span className="text-xs font-normal tabular-nums text-[var(--graph-muted)]">
                      {visibleResults.length} of {results.length}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="px-4 py-5 text-sm text-[var(--graph-muted)]">
              No notes match “{query.trim()}”. Try a title, path, or category.
            </p>
          )}

          {!query.trim() && nodes.length > results.length && (
            <p className="border-t border-[var(--graph-border)] px-3 py-2 text-xs text-[var(--graph-muted)]">
              Showing the first {results.length} notes. Search to narrow the full vault.
            </p>
          )}
        </section>
      )}
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
  aliases,
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
  aliases: Record<string, TopicAliasConfig>;
}) {
  const previousPanelHeightRef = useRef<number | null>(null);
  const panelHeightAnimationRef = useRef<Animation | null>(null);
  const catColor = getCategoryColor(node.categories, aliases);
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
      className="graph-surface-raised absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 top-auto z-20 flex max-h-[52dvh] flex-col overflow-hidden rounded-xl sm:bottom-auto sm:left-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:max-h-[calc(100dvh-6rem)] sm:w-80"
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
            <div className="mt-1.5 flex items-center gap-2">
              {node.categories.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: catColor }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--graph-muted)]">
                    {node.categories[0]}
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

          <div className="border-b border-[var(--graph-border)] px-5 py-3">
            <p className="text-xs leading-relaxed text-[var(--graph-muted)]">
              Direct links only. Blue arrows leave this note; amber arrows point to it. Select a
              linked note to continue tracing.
            </p>
          </div>

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
                  style={{ backgroundColor: getCategoryColor(connectedNode.categories, aliases) }}
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
                  style={{ backgroundColor: getCategoryColor(connectedNode.categories, aliases) }}
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

function NodeTooltip({
  node,
  position,
  aliases,
}: {
  node: { label: string; categories: string[]; connectionCount: number; wordCount: number } | null;
  position: { x: number; y: number };
  aliases: Record<string, TopicAliasConfig>;
}) {
  if (!node) return null;
  const catColor = getCategoryColor(node.categories, aliases);

  return (
    <div
      className="graph-surface-raised pointer-events-none absolute z-20 max-w-xs rounded-lg px-4 py-2.5"
      style={{ left: position.x + 14, top: position.y - 12 }}
    >
      <p className="text-[0.95rem] font-semibold text-[var(--graph-foreground)]">{node.label}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] font-medium text-[var(--graph-muted)]">
        <span>
          {node.connectionCount} {node.connectionCount === 1 ? "connection" : "connections"}
        </span>
        <span>·</span>
        <span>{node.wordCount} words</span>
      </div>
      {node.categories.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: catColor }}
          />
          <span className="text-[0.7rem] font-semibold text-[var(--graph-muted)]">
            {node.categories.join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */

export async function loader() {
  try {
    return await fetchJson<GraphData>("/api/graph");
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const data = useLoaderData() as GraphData;
  const config = useWikiConfig();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<SigmaLib | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const linkedHoverRef = useRef<string | null>(null);
  const linkedPulseScaleRef = useRef(1);
  const linkedPulseFrameRef = useRef<number | null>(null);
  const isolatedFocusRef = useRef<string | null>(null);
  const isolationProgressRef = useRef(0);
  const focusIsolationCallbackRef = useRef<((slug: string | null) => void) | null>(null);
  const mobileFocusTimerRef = useRef<number | null>(null);
  const labelLayoutCallbackRef = useRef<(() => void) | null>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [detailPanelHeight, setDetailPanelHeight] = useState(0);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState<{
    node: { label: string; categories: string[]; connectionCount: number; wordCount: number };
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
    if (!focusedSlug || detailPanelHeight <= 0 || window.innerWidth >= 640) return;

    if (mobileFocusTimerRef.current !== null) {
      window.clearTimeout(mobileFocusTimerRef.current);
    }
    mobileFocusTimerRef.current = window.setTimeout(() => {
      mobileFocusTimerRef.current = null;
      const sigma = sigmaRef.current;
      if (sigma && focusedRef.current === focusedSlug) {
        animateGraphNodeFocus(sigma, focusedSlug, 240);
      }
    }, 64);

    return () => {
      if (mobileFocusTimerRef.current !== null) {
        window.clearTimeout(mobileFocusTimerRef.current);
        mobileFocusTimerRef.current = null;
      }
    };
  }, [detailPanelHeight, focusedSlug]);

  const handleSearchSelect = useCallback((slug: string) => {
    focusedRef.current = slug;
    focusIsolationCallbackRef.current?.(slug);
    setFocusedSlug(slug);
    setDetailPanelCollapsed(false);
    sigmaRef.current?.refresh();
    if (sigmaRef.current && window.innerWidth >= 640) {
      animateGraphNodeFocus(sigmaRef.current, slug, 280);
    }
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
    const sigma = sigmaRef.current;
    focusedRef.current = null;
    focusIsolationCallbackRef.current?.(null);
    setFocusedSlug(null);
    setDetailPanelCollapsed(false);
    sigma?.refresh();
    if (sigma && shouldResetGraphCameraAfterDetailClose(window.innerWidth)) {
      void sigma
        .getCamera()
        .animatedReset({ duration: getGraphMotionDuration(220) })
        .then(() => labelLayoutCallbackRef.current?.());
    }
    requestAnimationFrame(() => browseButtonRef.current?.focus());
  }, []);

  const handleInfoNeighborClick = useCallback((slug: string) => {
    focusedRef.current = slug;
    focusIsolationCallbackRef.current?.(slug);
    setFocusedSlug(slug);
    sigmaRef.current?.refresh();
    if (sigmaRef.current && window.innerWidth >= 640) {
      animateGraphNodeFocus(sigmaRef.current, slug, 240);
    }
  }, []);

  const handleInfoNeighborHover = useCallback((slug: string | null) => {
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
      if (linkedHoverRef.current !== slug) return;
      linkedPulseScaleRef.current = getGraphLinkedNodePulseScale(timestamp - startedAt, false);
      sigmaRef.current?.refresh({
        partialGraph: { nodes: [slug] },
        skipIndexation: true,
        schedule: true,
      });
      linkedPulseFrameRef.current = requestAnimationFrame(animatePulse);
    };
    linkedPulseFrameRef.current = requestAnimationFrame(animatePulse);
  }, []);

  useEffect(
    () => () => {
      if (linkedPulseFrameRef.current !== null) {
        cancelAnimationFrame(linkedPulseFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!containerRef.current || data.nodes.length === 0) return;

    const graphTheme = getGraphThemeColors(containerRef.current);
    const graph = buildGraph(data, config.categories.aliases, graphTheme);
    const isolationFrameRefreshOptions = getGraphIsolationFrameRefreshOptions(graph.nodes());
    graphRef.current = graph;
    let viewportSettings = getGraphViewportSettings(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
    );

    const sigma = new SigmaLib(graph, containerRef.current, {
      allowInvalidContainer: true,
      ...GRAPH_MOVEMENT_RENDERING_SETTINGS,
      renderLabels: true,
      renderEdgeLabels: false,
      defaultDrawNodeLabel: createGraphLabelDrawer(graphTheme),
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
      minEdgeThickness: 1,
      stagePadding: viewportSettings.stagePadding,
      edgeReducer(edge, data) {
        const focused = focusedRef.current;
        const hovered = hoveredRef.current;
        const res = { ...data };
        const src = graph.source(edge);
        const tgt = graph.target(edge);

        if (focused) {
          if (src === focused) {
            res.color = graphTheme.edgeOutgoing;
            res.size = Math.max(2.1, res.size ?? 1);
            res.type = "arrow";
          } else if (tgt === focused) {
            res.color = graphTheme.edgeIncoming;
            res.size = Math.max(2.1, res.size ?? 1);
            res.type = "arrow";
          } else {
            res.hidden = true;
          }
        } else if (hovered) {
          if (src === hovered || tgt === hovered) {
            res.color = graphTheme.edgeOutgoing;
            res.size = Math.max(1.8, res.size ?? 1);
          } else {
            res.color = graphTheme.edgeMuted;
            res.size = Math.max(0.8, (res.size ?? 1) * 0.7);
          }
        }
        return res;
      },
      nodeReducer(node, data) {
        const focused = isolatedFocusRef.current;
        const hovered = hoveredRef.current;
        const linkedHover = linkedHoverRef.current;
        const active = focused ?? hovered;
        const res = { ...data };
        res.label = viewportSettings.compact ? data.compactLabel : data.label;
        res.forceLabel = Boolean(data.forceLabel);

        if (active) {
          const isActive = node === active;
          const isNeighbor = graph.hasEdge(active, node) || graph.hasEdge(node, active);

          if (isActive) {
            res.highlighted = true;
            res.zIndex = 2;
            res.size = (res.size ?? 4) * 1.3;
          } else if (isNeighbor) {
            res.zIndex = 1;
            if (focused) {
              res.forceLabel = true;
              res.size = (res.size ?? 4) * 1.08;
            }
          } else {
            res.zIndex = 0;
            if (focused) {
              const transition = getGraphDisconnectedNodeTransition(
                isolationProgressRef.current,
              );
              res.color = mixGraphColors(
                String(data.originalColor ?? data.color ?? graphTheme.nodeDefault),
                graphTheme.background,
                transition.colorMix,
              );
              res.size = (res.size ?? 4) * transition.sizeScale;
              res.hidden = transition.hidden;
              res.label = "";
              res.forceLabel = false;
            } else {
              res.color = graphTheme.nodeMuted;
            }
          }
        }

        if (node === linkedHover) {
          res.highlighted = true;
          res.forceLabel = true;
          res.zIndex = 3;
          res.size = (res.size ?? 4) * linkedPulseScaleRef.current;
        }

        return res;
      },
    });

    sigmaRef.current = sigma;
    let focusIsolationFrame: number | null = null;
    const animateFocusIsolation = (nextSlug: string | null) => {
      if (focusIsolationFrame !== null) {
        cancelAnimationFrame(focusIsolationFrame);
        focusIsolationFrame = null;
      }

      const previousSlug = isolatedFocusRef.current;
      if (!nextSlug && !previousSlug) return;
      if (nextSlug && nextSlug === previousSlug) return;

      if (nextSlug && previousSlug) {
        isolatedFocusRef.current = nextSlug;
        isolationProgressRef.current = 1;
        sigma.refresh();
        return;
      }

      const startProgress = nextSlug ? 0 : isolationProgressRef.current;
      const targetProgress = nextSlug ? 1 : 0;
      const duration = getGraphMotionDuration(nextSlug ? 180 : 220);
      if (nextSlug) isolatedFocusRef.current = nextSlug;

      if (duration === 0) {
        isolationProgressRef.current = targetProgress;
        if (!nextSlug) isolatedFocusRef.current = null;
        sigma.refresh();
        return;
      }

      isolationProgressRef.current = startProgress;
      sigma.refresh(isolationFrameRefreshOptions);
      const startedAt = performance.now();
      const animate = (timestamp: number) => {
        const elapsed = Math.min(1, (timestamp - startedAt) / duration);
        const eased = 1 - Math.pow(1 - elapsed, 4);
        isolationProgressRef.current =
          startProgress + (targetProgress - startProgress) * eased;

        if (elapsed >= 1) {
          focusIsolationFrame = null;
          isolationProgressRef.current = targetProgress;
          if (!nextSlug) isolatedFocusRef.current = null;
          sigma.refresh();
          return;
        }

        sigma.refresh(isolationFrameRefreshOptions);
        focusIsolationFrame = requestAnimationFrame(animate);
      };
      focusIsolationFrame = requestAnimationFrame(animate);
    };
    focusIsolationCallbackRef.current = animateFocusIsolation;
    if (focusedRef.current) {
      isolatedFocusRef.current = focusedRef.current;
      isolationProgressRef.current = 1;
    }
    let labelLayoutFrame: number | null = null;
    const schedulePersistentLabelLayout = () => {
      if (labelLayoutFrame !== null) cancelAnimationFrame(labelLayoutFrame);
      labelLayoutFrame = requestAnimationFrame(() => {
        labelLayoutFrame = null;
        if (updateCollisionAwareGraphLabels(sigma, graph)) sigma.refresh();
      });
    };
    labelLayoutCallbackRef.current = schedulePersistentLabelLayout;
    const layoutWorker = startGraphLayoutWorker(graph, () => {
      sigma.refresh();
      if (!focusedRef.current) {
        void sigma.getCamera()
          .animatedReset({ duration: getGraphMotionDuration(180) })
          .then(schedulePersistentLabelLayout);
      } else {
        schedulePersistentLabelLayout();
      }
    });
    schedulePersistentLabelLayout();

    const resizeObserver = new ResizeObserver(([entry]) => {
      viewportSettings = getGraphViewportSettings(
        entry.contentRect.width,
        entry.contentRect.height,
      );
      sigma.setSettings({
        labelSize: viewportSettings.labelSize,
        labelDensity: viewportSettings.labelDensity,
        labelGridCellSize: viewportSettings.labelGridCellSize,
        stagePadding: viewportSettings.stagePadding,
      });
      schedulePersistentLabelLayout();
    });
    resizeObserver.observe(containerRef.current);

    sigma.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      sigma.refresh();
      containerRef.current!.style.cursor = "pointer";
    });

    sigma.on("leaveNode", () => {
      hoveredRef.current = null;
      sigma.refresh();
      setTooltip(null);
      containerRef.current!.style.cursor = "default";
    });

    sigma.on("clickNode", ({ node }) => {
      const selection = getGraphNodeClickSelection(focusedRef.current, node);
      if (!selection.shouldCenter) return;

      focusedRef.current = selection.focusedSlug;
      focusIsolationCallbackRef.current?.(selection.focusedSlug);
      setFocusedSlug(selection.focusedSlug);
      sigma.refresh();

      if (window.innerWidth >= 640) animateGraphNodeFocus(sigma, node, 240);
    });

    sigma.on("clickStage", () => {
      if (focusedRef.current) {
        focusedRef.current = null;
        focusIsolationCallbackRef.current?.(null);
        setFocusedSlug(null);
        setDetailPanelCollapsed(false);
        sigma.refresh();
      }
    });

    return () => {
      layoutWorker?.terminate();
      if (focusIsolationFrame !== null) cancelAnimationFrame(focusIsolationFrame);
      focusIsolationCallbackRef.current = null;
      isolatedFocusRef.current = null;
      isolationProgressRef.current = 0;
      if (labelLayoutFrame !== null) cancelAnimationFrame(labelLayoutFrame);
      labelLayoutCallbackRef.current = null;
      resizeObserver.disconnect();
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [config.categories.aliases, data]);

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
        const hovered = hoveredRef.current;
        if (!hovered || !graphRef.current || focusedRef.current) {
          if (!focusedRef.current) setTooltip(null);
          return;
        }
        const attrs = graphRef.current.getNodeAttributes(hovered);
        setTooltip({
          node: {
            label: attrs.fullLabel ?? attrs.label,
            categories: attrs.categories ?? [],
            connectionCount: attrs.connectionCount ?? 0,
            wordCount: attrs.wordCount ?? 0,
          },
          position: pointerPosition,
        });
      });
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame);
    };
  }, []);

  return (
    <main
      className="app-route-shell graph-shell fixed inset-0"
      aria-label="Knowledge graph"
      aria-describedby="graph-instructions"
    >
      <p id="graph-instructions" className="sr-only">
        Explore {data.nodes.length} notes and {data.edges.length} connections. Use Find a
        concept or Browse nodes for keyboard-accessible navigation. Selecting a note isolates its
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
          : "Graph overview active."}
      </div>
      {/* Header */}
      <header className="app-route-header absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pb-[4.5rem] pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:h-16 sm:px-4 sm:py-0 md:px-5">
        <Link
          to="/"
          aria-label="Back to wiki home"
          className="app-route-header-brand hidden min-h-11 flex-col justify-center rounded-md px-1 py-1 text-left sm:flex"
        >
          <p className="app-route-header-meta text-xs font-medium">
            {config.siteTitle}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <House className="app-route-header-meta h-4 w-4" />
            <h1 className="text-base font-semibold">Knowledge Graph</h1>
          </div>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span className="app-route-header-control hidden items-center gap-2 rounded-md px-3.5 py-2 text-xs sm:flex">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--graph-stat-accent)]"
              aria-hidden="true"
            />
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
            className="app-route-header-control hidden min-h-11 items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium sm:inline-flex sm:px-4"
          >
            {config.navigation.backToWikiLabel}
          </Link>
        </div>
        {data.nodes.length > 0 ? (
          <GraphSearch
            nodes={data.nodes}
            onSelect={handleSearchSelect}
            onCompactSearchInteraction={handleCompactSearchInteraction}
            selectedSlug={focusedSlug}
            browseButtonRef={browseButtonRef}
          />
        ) : null}
      </header>

      {data.nodes.length > 0 ? (
        <>
          {/* Tooltip (only when not focused) */}
          {!focusedSlug && (
            <NodeTooltip
              node={tooltip?.node ?? null}
              position={tooltip?.position ?? { x: 0, y: 0 }}
              aliases={config.categories.aliases}
            />
          )}

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
              aliases={config.categories.aliases}
            />
          )}

          <GraphViewportControls
            sigmaRef={sigmaRef}
            compactPanelOpen={Boolean(focusedNode)}
            detailPanelHeight={detailPanelHeight}
            onCameraSettled={() => labelLayoutCallbackRef.current?.()}
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
