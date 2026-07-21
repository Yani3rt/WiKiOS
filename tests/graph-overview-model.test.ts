import { describe, expect, it, vi } from "vitest";
import Graph from "graphology";

vi.mock("sigma", () => ({ default: class Sigma {} }));

import type { GraphNode } from "../src/lib/wiki-shared";
import {
  applyGraphThemeColors,
  updateGraphThemeInPlace,
} from "../src/client/routes/graph-route";
import {
  GRAPH_INDEX_LIMIT,
  GRAPH_MOVEMENT_RENDERING_SETTINGS,
  getCollisionAwareGraphLabelPlacements,
  getDeterministicGraphPositions,
  getGraphConnectionGroups,
  getGraphEdgeSize,
  getGraphIndexNodes,
  getGraphLayoutIterations,
  getGraphLinkedNodePulseScale,
  getGraphCameraCenterForViewportTarget,
  getGraphDetailPanelToggleState,
  getGraphDisconnectedNodeTransition,
  getGraphIsolationFrameRefreshOptions,
  getGraphNodeClickSelection,
  getGraphNodeFocusViewportPoint,
  getGraphNodeSize,
  getGraphNodeVerticalBalance,
  getGraphToolbarPanelOffset,
  getGraphViewportSettings,
  getNextGraphIndex,
  getPersistentLabelSlugs,
  shouldCloseGraphNodeIndexAfterSelection,
  shouldCollapseGraphDetailPanelOnSearchInteraction,
  shouldResetGraphCameraAfterDetailClose,
  mixGraphColors,
  strengthenGraphColor,
  truncateGraphLabel,
} from "../src/client/graph-overview-model";

function node(overrides: Partial<GraphNode> & Pick<GraphNode, "slug">): GraphNode {
  return {
    slug: overrides.slug,
    title: overrides.title ?? overrides.slug,
    backlinkCount: overrides.backlinkCount ?? 0,
    wordCount: overrides.wordCount ?? 100,
    categories: overrides.categories ?? [],
    summary: overrides.summary ?? "",
    neighbors: overrides.neighbors ?? [],
  };
}

describe("graph overview model", () => {
  it("recolors neutral graph data while preserving category encodings", () => {
    const graph = new Graph();
    graph.addNode("neutral", { categories: [], color: "#000000", originalColor: "#000000" });
    graph.addNode("topic", {
      categories: ["design"],
      color: "#123456",
      originalColor: "#123456",
    });
    graph.addEdge("neutral", "topic", { color: "#000000" });
    const colors = {
      background: "#eef4fb",
      foreground: "#15202d",
      muted: "#4d5969",
      nodeDefault: "#234566",
      nodeMuted: "#8494a8",
      edgeDefault: "#667d94",
      edgeMuted: "#93a0ae",
      edgeOutgoing: "#00628d",
      edgeIncoming: "#875800",
      label: "#15202d",
    };

    applyGraphThemeColors(graph, { design: { color: "#85b9c9" } }, colors);

    expect(graph.getNodeAttribute("neutral", "color")).toBe("#234566");
    expect(graph.getNodeAttribute("neutral", "originalColor")).toBe("#234566");
    expect(graph.getNodeAttribute("topic", "color")).toBe("#5d8091");
    expect(graph.getNodeAttribute("topic", "originalColor")).toBe("#5d8091");
    expect(graph.getEdgeAttribute(graph.edges()[0], "color")).toBe("#667d94");
  });

  it("ignores non-string runtime categories before resolving aliases", () => {
    const graph = new Graph();
    graph.addNode("mixed", {
      categories: [
        null,
        {
          trim: () => {
            throw new Error("invalid category reached lookup");
          },
        },
        "Design",
        42,
      ],
      color: "#000000",
      originalColor: "#000000",
    });
    const colors = {
      background: "#eef4fb",
      foreground: "#15202d",
      muted: "#4d5969",
      nodeDefault: "#234566",
      nodeMuted: "#8494a8",
      edgeDefault: "#667d94",
      edgeMuted: "#93a0ae",
      edgeOutgoing: "#00628d",
      edgeIncoming: "#875800",
      label: "#15202d",
    };

    expect(() =>
      applyGraphThemeColors(graph, { design: { color: "#85b9c9" } }, colors),
    ).not.toThrow();
    expect(graph.getNodeAttribute("mixed", "color")).toBe("#5d8091");
  });

  it("reapplies provider theme colors in place without touching layout or camera state", () => {
    const graph = new Graph();
    graph.addNode("note", {
      categories: [],
      color: "#000000",
      originalColor: "#000000",
      x: 0.25,
      y: 0.75,
    });
    const camera = { marker: "same-camera" };
    const sigma = {
      setSettings: vi.fn(),
      refresh: vi.fn(),
      getCamera: vi.fn(() => camera),
      kill: vi.fn(),
    };
    const initialColors = {
      background: "#eef4fb",
      foreground: "#15202d",
      muted: "#4d5969",
      nodeDefault: "#234566",
      nodeMuted: "#8494a8",
      edgeDefault: "#667d94",
      edgeMuted: "#93a0ae",
      edgeOutgoing: "#00628d",
      edgeIncoming: "#875800",
      label: "#15202d",
    };
    const colors = {
      background: "#f4f2fb",
      foreground: "#251f34",
      muted: "#635b73",
      nodeDefault: "#433567",
      nodeMuted: "#928aa1",
      edgeDefault: "#796d91",
      edgeMuted: "#aaa3b5",
      edgeOutgoing: "#5a4789",
      edgeIncoming: "#875800",
      label: "#251f34",
    };

    updateGraphThemeInPlace(graph, sigma, {}, initialColors);
    sigma.setSettings.mockClear();
    sigma.refresh.mockClear();

    updateGraphThemeInPlace(graph, sigma, {}, colors);

    expect(graph.getNodeAttributes("note")).toMatchObject({
      color: "#433567",
      originalColor: "#433567",
      x: 0.25,
      y: 0.75,
    });
    expect(sigma.setSettings).toHaveBeenCalledOnce();
    expect(sigma.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        labelColor: { color: "#251f34" },
        defaultEdgeColor: "#796d91",
        defaultNodeColor: "#433567",
      }),
    );
    expect(sigma.refresh).toHaveBeenCalledOnce();
    expect(sigma.getCamera).not.toHaveBeenCalled();
    expect(sigma.kill).not.toHaveBeenCalled();
    expect(camera).toEqual({ marker: "same-camera" });
  });

  it("keeps sparse notes large enough to identify and connected notes more prominent", () => {
    const isolated = getGraphNodeSize(node({ slug: "isolated", wordCount: 20 }));
    const connected = getGraphNodeSize(
      node({ slug: "connected", backlinkCount: 9, neighbors: ["a", "b"] }),
    );

    expect(isolated).toBeGreaterThanOrEqual(7);
    expect(connected).toBeGreaterThan(isolated);
    expect(connected).toBeLessThanOrEqual(22);
    expect(getGraphEdgeSize(1)).toBeGreaterThanOrEqual(1.1);
  });

  it("labels personal-sized graphs and budgets labels for large vaults", () => {
    const small = Array.from({ length: 28 }, (_, index) => node({ slug: `small-${index}` }));
    const large = Array.from({ length: 1_000 }, (_, index) =>
      node({ slug: `large-${index}`, backlinkCount: index % 12, wordCount: index }),
    );

    expect(getPersistentLabelSlugs(small).size).toBe(28);
    expect(getPersistentLabelSlugs(large).size).toBe(80);
  });

  it("places priority labels on the clearest side without allowing collisions", () => {
    const placements = getCollisionAwareGraphLabelPlacements(
      [
        {
          slug: "primary",
          x: 100,
          y: 80,
          nodeSize: 8,
          labelWidth: 80,
          labelHeight: 16,
          priority: 3,
        },
        {
          slug: "crowded",
          x: 150,
          y: 80,
          nodeSize: 8,
          labelWidth: 80,
          labelHeight: 16,
          priority: 2,
        },
        {
          slug: "right-edge",
          x: 300,
          y: 140,
          nodeSize: 8,
          labelWidth: 90,
          labelHeight: 16,
          priority: 1,
        },
      ],
      { width: 360, height: 220 },
    );

    expect(placements.get("primary")).toBe("right");
    expect(placements.has("crowded")).toBe(false);
    expect(placements.get("right-edge")).toBe("left");
  });

  it("produces stable positions regardless of API ordering", () => {
    const nodes = [node({ slug: "beta" }), node({ slug: "alpha" }), node({ slug: "gamma" })];
    const first = getDeterministicGraphPositions(nodes);
    const second = getDeterministicGraphPositions([...nodes].reverse());

    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.get("alpha")).not.toEqual(first.get("beta"));
  });

  it("deepens pastel category colors while preserving custom non-hex values", () => {
    expect(strengthenGraphColor("#85b9c9")).toBe("#5d8091");
    expect(strengthenGraphColor("oklch(60% 0.2 200)")).toBe("oklch(60% 0.2 200)");
  });

  it("keeps full titles searchable while truncating only their canvas presentation", () => {
    const longTitle = "A very long knowledge note title with emoji 🧭 and additional context";
    const nodes = [node({ slug: "long", title: longTitle, categories: ["Research"] })];

    expect(truncateGraphLabel(longTitle, 24)).toBe("A very long knowledge n…");
    expect(getGraphIndexNodes(nodes, "additional context")[0]?.title).toBe(longTitle);
    expect(getGraphIndexNodes(nodes, "research")[0]?.slug).toBe("long");
  });

  it("limits large semantic indexes and supports roving keyboard movement", () => {
    const nodes = Array.from({ length: 500 }, (_, index) =>
      node({ slug: `note-${index}`, title: `Note ${index.toString().padStart(3, "0")}` }),
    );

    expect(getGraphIndexNodes(nodes, "")).toHaveLength(GRAPH_INDEX_LIMIT);
    expect(getNextGraphIndex(0, "ArrowUp", 4)).toBe(3);
    expect(getNextGraphIndex(3, "ArrowDown", 4)).toBe(0);
    expect(getNextGraphIndex(2, "Home", 4)).toBe(0);
    expect(getNextGraphIndex(0, "End", 4)).toBe(3);
    expect(getNextGraphIndex(0, "Enter", 4)).toBeNull();
  });

  it("groups real note links by direction and ranks repeated mentions first", () => {
    const nodes = [
      node({ slug: "focus", title: "Focus" }),
      node({ slug: "out-a", title: "Alpha" }),
      node({ slug: "out-b", title: "Beta" }),
      node({ slug: "in", title: "Incoming" }),
    ];
    const connections = getGraphConnectionGroups("focus", nodes, [
      { source: "focus", target: "out-a", weight: 1 },
      { source: "focus", target: "out-b", weight: 3 },
      { source: "in", target: "focus", weight: 2 },
      { source: "missing", target: "focus", weight: 9 },
      { source: "focus", target: "focus", weight: 4 },
    ]);

    expect(connections.outgoing.map(({ node, weight }) => [node.slug, weight])).toEqual([
      ["out-b", 3],
      ["out-a", 1],
    ]);
    expect(connections.incoming.map(({ node, weight }) => [node.slug, weight])).toEqual([
      ["in", 2],
    ]);
  });

  it("keeps full layout quality for personal graphs and caps work for larger vaults", () => {
    expect(getGraphLayoutIterations(30)).toBe(500);
    expect(getGraphLayoutIterations(100)).toBe(500);
    expect(getGraphLayoutIterations(500)).toBe(280);
    expect(getGraphLayoutIterations(501)).toBe(180);
    expect(getGraphLayoutIterations(5_000)).toBe(180);
  });

  it("uses compact canvas spacing and shorter labels without shrinking touch targets", () => {
    expect(getGraphViewportSettings(320)).toMatchObject({
      compact: true,
      stagePadding: 32,
      labelSize: 12,
      maxLabelCharacters: 24,
    });
    expect(getGraphViewportSettings(390).stagePadding).toBe(39);
    expect(getGraphViewportSettings(719).stagePadding).toBe(48);
    expect(getGraphViewportSettings(844, 390)).toMatchObject({
      compact: true,
      stagePadding: 39,
      maxLabelCharacters: 24,
    });
    expect(getGraphViewportSettings(720)).toMatchObject({
      compact: false,
      stagePadding: 96,
      labelSize: 13,
      maxLabelCharacters: 42,
    });
  });

  it("keeps connection lines visible while the graph camera moves", () => {
    expect(GRAPH_MOVEMENT_RENDERING_SETTINGS).toEqual({
      hideEdgesOnMove: false,
      hideLabelsOnMove: true,
    });
  });

  it("keeps repeat node clicks inside the graph instead of opening the article", () => {
    expect(getGraphNodeClickSelection("building-ai-agents", "building-ai-agents")).toEqual({
      focusedSlug: "building-ai-agents",
      shouldCenter: false,
    });
    expect(getGraphNodeClickSelection("building-ai-agents", "hermes")).toEqual({
      focusedSlug: "hermes",
      shouldCenter: true,
    });
  });

  it("provides a restrained linked-node pulse with a static reduced-motion state", () => {
    expect(getGraphLinkedNodePulseScale(0, false)).toBeCloseTo(1.13);
    expect(getGraphLinkedNodePulseScale(120, false)).toBeCloseTo(1.18);
    expect(getGraphLinkedNodePulseScale(360, false)).toBeCloseTo(1.08);
    expect(getGraphLinkedNodePulseScale(0, true)).toBe(1.16);
    expect(getGraphLinkedNodePulseScale(360, true)).toBe(1.16);
  });

  it("fades and then hides disconnected nodes without a jarring size collapse", () => {
    expect(getGraphDisconnectedNodeTransition(0)).toEqual({
      colorMix: 0,
      hidden: false,
      sizeScale: 1,
    });
    expect(getGraphDisconnectedNodeTransition(0.5)).toEqual({
      colorMix: 0.5,
      hidden: false,
      sizeScale: 0.86,
    });
    expect(getGraphDisconnectedNodeTransition(1)).toEqual({
      colorMix: 1,
      hidden: true,
      sizeScale: 0.72,
    });
  });

  it("blends disconnected node colors into the graph background", () => {
    expect(mixGraphColors("#112233", "#ffffff", 0.5)).toBe("#889199");
    expect(mixGraphColors("#112233", "#ffffff", 0)).toBe("#112233");
    expect(mixGraphColors("#112233", "#ffffff", 1)).toBe("#ffffff");
  });

  it("keeps animated isolation refreshes partial so node coordinates stay normalized", () => {
    const nodeSlugs = ["selected", "neighbor", "unrelated"];

    const options = getGraphIsolationFrameRefreshOptions(nodeSlugs);

    expect(options).toEqual({
      partialGraph: { nodes: nodeSlugs },
      skipIndexation: true,
      schedule: true,
    });
    expect(options.partialGraph.nodes).toBe(nodeSlugs);
  });

  it("closes the node index after mobile selections but preserves the desktop browsing flow", () => {
    expect(shouldCloseGraphNodeIndexAfterSelection(390)).toBe(true);
    expect(shouldCloseGraphNodeIndexAfterSelection(639)).toBe(true);
    expect(shouldCloseGraphNodeIndexAfterSelection(640)).toBe(false);
    expect(shouldCloseGraphNodeIndexAfterSelection(1_243)).toBe(false);
  });

  it("folds an active detail card for mobile search interactions only", () => {
    expect(shouldCollapseGraphDetailPanelOnSearchInteraction(390, true)).toBe(true);
    expect(shouldCollapseGraphDetailPanelOnSearchInteraction(639, true)).toBe(true);
    expect(shouldCollapseGraphDetailPanelOnSearchInteraction(640, true)).toBe(false);
    expect(shouldCollapseGraphDetailPanelOnSearchInteraction(390, false)).toBe(false);
  });

  it("recenters the graph after closing mobile details only", () => {
    expect(shouldResetGraphCameraAfterDetailClose(390)).toBe(true);
    expect(shouldResetGraphCameraAfterDetailClose(639)).toBe(true);
    expect(shouldResetGraphCameraAfterDetailClose(640)).toBe(false);
    expect(shouldResetGraphCameraAfterDetailClose(1_243)).toBe(false);
  });

  it("places mobile selections below search while keeping desktop selections centered", () => {
    expect(getGraphNodeFocusViewportPoint(470, 1_494, 168)).toEqual({ x: 235, y: 272 });
    expect(getGraphNodeFocusViewportPoint(390, 844, 120)).toEqual({ x: 195, y: 192 });
    expect(getGraphNodeFocusViewportPoint(844, 390, 120)).toEqual({ x: 422, y: 195 });
  });

  it("centers mobile selections between the search controls and detail card", () => {
    expect(getGraphNodeFocusViewportPoint(470, 1_494, 168, 953)).toEqual({
      x: 235,
      y: 560.5,
    });
    expect(getGraphNodeFocusViewportPoint(390, 844, 120, 630)).toEqual({
      x: 195,
      y: 375,
    });
    expect(getGraphNodeFocusViewportPoint(844, 390, 120, 300)).toEqual({
      x: 422,
      y: 195,
    });
  });

  it("reports whether a viewport node has more nodes above or below it", () => {
    const positions = [
      { slug: "top", y: 80 },
      { slug: "selected", y: 200 },
      { slug: "aligned", y: 200.5 },
      { slug: "lower-one", y: 340 },
      { slug: "lower-two", y: 480 },
    ];

    expect(getGraphNodeVerticalBalance(positions, "selected")).toEqual({
      aboveCount: 1,
      belowCount: 2,
      alignedCount: 1,
      majority: "below",
    });
    expect(getGraphNodeVerticalBalance(positions, "missing")).toBeNull();
  });

  it("treats equal vertical populations as balanced", () => {
    expect(
      getGraphNodeVerticalBalance(
        [
          { slug: "top", y: 100 },
          { slug: "selected", y: 200 },
          { slug: "bottom", y: 300 },
        ],
        "selected",
      ),
    ).toEqual({
      aboveCount: 1,
      belowCount: 1,
      alignedCount: 0,
      majority: "balanced",
    });
  });

  it("translates the camera so the selected node lands at the requested viewport point", () => {
    expect(
      getGraphCameraCenterForViewportTarget(
        { x: 0.75, y: 0.5 },
        { x: 0.5, y: 0.75 },
      ),
    ).toEqual({ x: 1, y: 0.25 });
  });

  it("keeps mobile graph controls 12px above the detail card as its height changes", () => {
    expect(getGraphToolbarPanelOffset(402, true)).toBe(414);
    expect(getGraphToolbarPanelOffset(248, true)).toBe(260);
    expect(getGraphToolbarPanelOffset(-10, true)).toBe(12);
    expect(getGraphToolbarPanelOffset(402, false)).toBeNull();
  });

  it("describes accessible fold and unfold actions for the detail card", () => {
    expect(getGraphDetailPanelToggleState(false)).toEqual({
      expanded: true,
      label: "Collapse node details",
      nextCollapsed: true,
    });
    expect(getGraphDetailPanelToggleState(true)).toEqual({
      expanded: false,
      label: "Expand node details",
      nextCollapsed: false,
    });
  });

  it("animates mobile detail-card height changes while respecting reduced motion", async () => {
    const model = await import("../src/client/graph-overview-model");
    expect("getGraphDetailHeightAnimation" in model).toBe(true);
    const getGraphDetailHeightAnimation = (
      model as unknown as {
        getGraphDetailHeightAnimation: (input: {
          previousHeight: number | null;
          nextHeight: number;
          viewportWidth: number;
          reducedMotion: boolean;
        }) => unknown;
      }
    ).getGraphDetailHeightAnimation;

    expect(
      getGraphDetailHeightAnimation({
        previousHeight: 240,
        nextHeight: 420,
        viewportWidth: 390,
        reducedMotion: false,
      }),
    ).toEqual({
      keyframes: [{ height: "240px" }, { height: "420px" }],
      options: {
        duration: 220,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
      },
    });
    expect(
      getGraphDetailHeightAnimation({
        previousHeight: 240,
        nextHeight: 420,
        viewportWidth: 640,
        reducedMotion: false,
      }),
    ).toBeNull();
    expect(
      getGraphDetailHeightAnimation({
        previousHeight: 240,
        nextHeight: 420,
        viewportWidth: 390,
        reducedMotion: true,
      }),
    ).toBeNull();
  });
});
