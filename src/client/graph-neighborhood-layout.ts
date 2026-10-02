import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { GRAPH_LAYOUT_SETTINGS, type GraphLayoutRequest, type GraphLayoutResult } from './graph-overview-model';
import type { GraphNeighborhood } from './graph-neighborhoods';

/** Static radial neighborhoods around an empty navigation center; zoom never moves notes. */
export function layoutGraphNeighborhoods(request: GraphLayoutRequest, neighborhoods: readonly GraphNeighborhood[]): GraphLayoutResult {
  const inputs = new Map(request.nodes.map(node=>[node.key,node]));
  const claimed = new Set<string>();
  const blocks = [...neighborhoods].sort((a,b)=>a.id.localeCompare(b.id)).map(group=>{
    const members = [...group.members].filter(key=>inputs.has(key) && !claimed.has(key)).sort();
    members.forEach(key=>claimed.add(key));
    const radius = 38+Math.sqrt(members.length)*22;
    return {members,radius,independent:false,width:radius*2+64,height:radius*2+86};
  }).filter(block=>block.members.length);
  const independent = [...inputs.keys()].filter(key=>!claimed.has(key)).sort();
  if (independent.length) {
    const columns = Math.ceil(Math.sqrt(independent.length));
    blocks.push({members:independent,radius:0,independent:true,width:columns*46+32,height:Math.ceil(independent.length/columns)*46+32});
  }
  const maxRadius = Math.max(0,...blocks.map(block=>block.independent ? Math.hypot(block.width,block.height)/2 : block.radius));
  const orbit = Math.max(240,maxRadius+160,(2*maxRadius+120)/(2*Math.sin(Math.PI/Math.max(2,blocks.length))));
  const positions: GraphLayoutResult['positions'] = [];
  for(const [index,block] of blocks.entries()) {
    const angle=-Math.PI/2+index*Math.PI*2/blocks.length;
    const center=neighborhoods.length ? {x:Math.cos(angle)*orbit,y:Math.sin(angle)*orbit} : {x:0,y:0};
    if(block.independent) {
      const columns=Math.ceil(Math.sqrt(block.members.length));
      block.members.forEach((key,i)=>positions.push({key,x:center.x+((i%columns)-(columns-1)/2)*46,y:center.y+(Math.floor(i/columns)-(Math.ceil(block.members.length/columns)-1)/2)*46}));
    } else {
      const graph = new Graph();
      block.members.forEach((key,index)=>{
        const angle=index*Math.PI*(3-Math.sqrt(5));
        const radius=Math.sqrt(index+1)*20;
        graph.addNode(key,{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,size:inputs.get(key)!.size});
      });
      for(const edge of [...request.edges].sort((a,b)=>a.key.localeCompare(b.key))) {
        if(edge.source!==edge.target && graph.hasNode(edge.source) && graph.hasNode(edge.target) && !graph.hasEdge(edge.key))
          graph.addEdgeWithKey(edge.key,edge.source,edge.target,{weight:Number.isFinite(edge.weight)&&edge.weight>0?edge.weight:1});
      }
      if(graph.order>1 && graph.size && request.iterations>0) forceAtlas2.assign(graph,{iterations:request.iterations,settings:GRAPH_LAYOUT_SETTINGS});
      const values=graph.nodes().map(key=>({key,x:Number(graph.getNodeAttribute(key,'x')),y:Number(graph.getNodeAttribute(key,'y'))}));
      const finite=values.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
      // Pathological force input must still leave a usable, finite map.
      if(!finite) values.forEach((point,i)=>{point.x=Math.cos(i*2.4)*Math.sqrt(i+1);point.y=Math.sin(i*2.4)*Math.sqrt(i+1);});
      const cx=values.reduce((sum,p)=>sum+p.x,0)/values.length,cy=values.reduce((sum,p)=>sum+p.y,0)/values.length;
      const extent=Math.max(1,...values.map(p=>Math.hypot(p.x-cx,p.y-cy)));
      values.forEach(point=>positions.push({key:point.key,x:center.x+(point.x-cx)/extent*block.radius,y:center.y+(point.y-cy)/extent*block.radius}));
    }
  }
  return {positions:positions.sort((a,b)=>a.key.localeCompare(b.key))};
}
