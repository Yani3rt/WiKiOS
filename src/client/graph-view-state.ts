import type { GraphDetailLevel } from './graph-semantic-zoom';

/** Route-return state lives only in this browser session, isolated by vault. */
export interface GraphViewState {
  allNotes: boolean;
  focusedSlug: string | null;
  detailPanelCollapsed: boolean;
  activeGroup: string | null;
  search: { query: string; indexOpen: boolean; visibleResultCount: number };
  layoutReady: boolean;
  detailLevel: GraphDetailLevel;
  expandedNeighborhood: string | null;
  camera: { x: number; y: number; ratio: number; angle: number };
  positions: Record<string, { x: number; y: number }>;
}

export function graphTopologyKey(data: {
  nodes: readonly { slug: string }[];
  edges: readonly { source: string; target: string; weight: number }[];
}) {
  return JSON.stringify([
    data.nodes.map(node => node.slug).sort(),
    data.edges.map(edge => JSON.stringify([edge.source, edge.target, Number.isFinite(edge.weight) && edge.weight > 0 ? edge.weight : 0])).sort(),
  ]);
}

export function createGraphViewCache() {
  const states = new Map<string, { topology: string; state: GraphViewState }>();
  return {
    read(vaultId: string, topology: string): GraphViewState | null {
      const saved = states.get(vaultId);
      return saved?.topology === topology ? saved.state : null;
    },
    save(vaultId: string, topology: string, state: GraphViewState) {
      states.set(vaultId, { topology, state });
    },
  };
}

export const graphViewCache = createGraphViewCache();
