import type { GraphPoint } from './graph-camera';
import type { GraphNeighborhood } from './graph-neighborhoods';
import type { GraphDetailLevel } from './graph-semantic-zoom';
import { focusVisibility } from './graph-focus-transition';

export const GRAPH_NEIGHBORHOOD_TRANSITION_MS = 400;

/** Keep interrupted values continuous while exiting before the next reveal finishes. */
export function getGraphDisclosureVisibility(from:number,to:number,elapsed:number,duration:number) {
  if(duration<=0) return to;
  const entering=to>from;
  const delay=entering?Math.min(60,duration*.2):0;
  const ms=entering?duration-delay:Math.min(180,duration);
  return focusVisibility(from,to,(elapsed-delay)/ms);
}

export interface GraphDisclosureState {
  allNotes: boolean;
  expandedNeighborhood: string | null;
  detailLevel: GraphDetailLevel;
  context: boolean;
}

/** Navigation is presentation only; search, filters and real neighbors bypass collapse. */
export function isGraphNodeRevealed(groupId: string | undefined, state: GraphDisclosureState, hoverNeighbor = false) {
  if (state.context || hoverNeighbor) return true;
  if (state.expandedNeighborhood !== null) return groupId === state.expandedNeighborhood;
  return state.allNotes || !groupId || state.detailLevel !== 'overview';
}

export function getGraphNavigationGeometry(
  groups: readonly GraphNeighborhood[],
  getPosition: (slug: string) => GraphPoint | undefined,
  independent: readonly string[],
) {
  const anchors = groups.flatMap(group => {
    const points = group.members.flatMap(slug => {
      const point = getPosition(slug);
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? [point] : [];
    });
    return points.length ? [{id:group.id,
      x:points.reduce((sum,point)=>sum+point.x,0)/points.length,
      y:points.reduce((sum,point)=>sum+point.y,0)/points.length,
    }] : [];
  });
  const points: GraphPoint[] = anchors.length ? [{x:0,y:0}, ...anchors] : [];
  for (const slug of independent) {
    const point = getPosition(slug);
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
  }
  return {anchors,points};
}
