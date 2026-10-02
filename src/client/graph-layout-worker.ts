import type { GraphLayoutRequest, GraphLayoutResult } from "./graph-overview-model";
import { layoutGraphNeighborhoods } from "./graph-neighborhood-layout";

interface GraphLayoutWorkerScope {
  onmessage: ((event: MessageEvent<GraphLayoutRequest>) => void) | null;
  postMessage(message: GraphLayoutResult): void;
}
const workerScope = globalThis as unknown as GraphLayoutWorkerScope;
workerScope.onmessage = ({data}) => {
  workerScope.postMessage(layoutGraphNeighborhoods(data, data.neighborhoods ?? []));
};
