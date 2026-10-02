export const GRAPH_COMPACT_WIDTH = 1024;
export interface GraphPoint { x: number; y: number; }
export interface GraphBounds { left: number; top: number; right: number; bottom: number; }

/** Coordinates are relative to the full-screen canvas; chrome never owns its center. */
export function getGraphUsableViewport({width, height, headerBottom = 64, searchBottom = 0, details, legend, toolbar}: {
  width: number; height: number; headerBottom?: number; searchBottom?: number;
  details?: GraphBounds; legend?: GraphBounds; toolbar?: GraphBounds;
}): GraphBounds {
  const compact = width < GRAPH_COMPACT_WIDTH;
  const left = Math.min(20, width * .08);
  const top = Math.min(Math.max(headerBottom, searchBottom) + 20, height * .6);
  let right = width - left;
  let bottom = height - 20;
  if (details) {
    if (compact) bottom = Math.min(bottom, details.top - 20);
    else right = Math.min(right, details.left - 20);
  }
  if (legend) bottom = Math.min(bottom, legend.top - 20);
  if (compact && toolbar && toolbar.top < bottom) right = Math.min(right, toolbar.left - 14);
  return { left, top, right: Math.max(left + 1, right), bottom: Math.min(height, Math.max(top + 1, bottom)) };
}

/** Fit points projected at camera ratio 1, leaving room for node cores and labels. */
export function getGraphFitGeometry(points: GraphPoint[], bounds: GraphBounds) {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!valid.length) return null;
  let left=Infinity, right=-Infinity, top=Infinity, bottom=-Infinity;
  for (const point of valid) {
    left=Math.min(left,point.x); right=Math.max(right,point.x);
    top=Math.min(top,point.y); bottom=Math.max(bottom,point.y);
  }
  const width=Math.max(1,bounds.right-bounds.left), height=Math.max(1,bounds.bottom-bounds.top);
  const paddingX=Math.min(92,width*.14), paddingY=Math.min(32,height*.14);
  return {
    center:{x:(left+right)/2,y:(top+bottom)/2},
    target:{x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2},
    ratio:Math.max(.55,(right-left)/(width-2*paddingX),(bottom-top)/(height-2*paddingY)),
  };
}

export interface GraphPointerTarget extends GraphPoint { slug: string; radius: number; label?: GraphBounds; }
export function findGraphPointerTarget(point: GraphPoint, nodes: GraphPointerTarget[]) {
  let nearest: string | null=null, distance=Infinity;
  for (const node of nodes) {
    const d=Math.hypot(point.x-node.x,point.y-node.y);
    if(d<=Math.max(18,node.radius) && d<distance) {nearest=node.slug;distance=d;}
  }
  if(nearest) return nearest;
  return nodes.find(({label}) => label && point.x>=label.left && point.x<=label.right && point.y>=label.top && point.y<=label.bottom)?.slug ?? null;
}

/** All camera inputs share this settling path; no collision work on every animation frame. */
export function createGraphCameraSettler(onMove: () => void, onSettled: () => void) {
  let timer: ReturnType<typeof setTimeout> | null=null;
  return {
    updated() {
      if(timer===null) onMove(); else clearTimeout(timer);
      timer=setTimeout(()=>{timer=null;onSettled();},90);
    },
    destroy() {if(timer!==null) clearTimeout(timer);timer=null;},
  };
}
