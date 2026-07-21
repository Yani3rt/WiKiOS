import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

import {
  GRAPH_LAYOUT_SETTINGS,
  type GraphLayoutRequest,
  type GraphLayoutResult,
} from "./graph-overview-model";

interface GraphLayoutWorkerScope {
  onmessage: ((event: MessageEvent<GraphLayoutRequest>) => void) | null;
  postMessage(message: GraphLayoutResult): void;
}

const workerScope = globalThis as unknown as GraphLayoutWorkerScope;

workerScope.onmessage = ({ data }) => {
  const graph = new Graph();

  for (const node of data.nodes) {
    graph.addNode(node.key, {
      x: node.x,
      y: node.y,
      size: node.size,
    });
  }

  for (const edge of data.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    graph.addEdgeWithKey(edge.key, edge.source, edge.target, { weight: edge.weight });
  }

  forceAtlas2.assign(graph, {
    iterations: data.iterations,
    settings: GRAPH_LAYOUT_SETTINGS,
  });

  const positions: GraphLayoutResult["positions"] = [];
  graph.forEachNode((key, attributes) => {
    positions.push({ key, x: attributes.x, y: attributes.y });
  });

  workerScope.postMessage({ positions });
};
