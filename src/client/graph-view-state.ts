/** Route-return state lives only in this browser session, isolated by vault. */
export interface GraphViewState {
  focusedSlug: string | null;
  detailPanelCollapsed: boolean;
  activeGroup: string | null;
  search: { query: string; indexOpen: boolean; visibleResultCount: number };
  layoutReady: boolean;
  camera: { x: number; y: number; ratio: number; angle: number };
  positions: Record<string, { x: number; y: number }>;
}

export function graphTopologyKey(data: {
  nodes: readonly { slug: string }[];
  edges: readonly { source: string; target: string }[];
}) {
  return JSON.stringify([
    data.nodes.map(node => node.slug).sort(),
    data.edges.map(edge => JSON.stringify([edge.source, edge.target])).sort(),
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
