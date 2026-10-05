import type { GraphData } from '@/lib/wiki-shared';
import type { GraphBounds, GraphPoint } from './graph-camera';
import type { GraphNeighborhood } from './graph-neighborhoods';

export interface GraphNeighborhoodPreview {
  id: string;
  title: string;
  noteCount: number;
  notes: {slug:string;title:string}[];
  connections: {id:string;label:string;count:number}[];
}
const compare = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;

/** Preview only recorded notes and relationships; never infer topic similarity. */
export function buildGraphNeighborhoodPreviews(data:GraphData, groups:readonly GraphNeighborhood[]) {
  const nodes=new Map(data.nodes.map(node=>[node.slug,node]));
  const members=new Map(groups.map(group=>[group.id,[...new Set(group.members)].filter(slug=>nodes.has(slug))]));
  const membership=new Map([...members].flatMap(([id,slugs])=>slugs.map(slug=>[slug,id] as const)));
  const neighbors=new Map(data.nodes.map(node=>[node.slug,new Set<string>()]));
  const connections=new Map(groups.map(group=>[group.id,new Map<string,number>()]));
  const seen=new Set<string>();
  for(const edge of data.edges) {
    if(edge.source===edge.target || !nodes.has(edge.source) || !nodes.has(edge.target) || !Number.isFinite(edge.weight) || edge.weight<=0) continue;
    const key=JSON.stringify([edge.source,edge.target]);
    if(seen.has(key)) continue;
    seen.add(key);
    const source=membership.get(edge.source),target=membership.get(edge.target);
    if(source===undefined || target===undefined) continue;
    if(source===target) {
      neighbors.get(edge.source)!.add(edge.target);
      neighbors.get(edge.target)!.add(edge.source);
    } else {
      for(const [from,to] of [[source,target],[target,source]]) {
        const linked=connections.get(from)!;
        linked.set(to,(linked.get(to) ?? 0)+1);
      }
    }
  }
  const labels=new Map(groups.map(group=>[group.id,group.label]));
  return new Map([...groups].sort((a,b)=>compare(a.label,b.label)||compare(a.id,b.id)).map(group=>{
    const slugs=members.get(group.id)!;
    const notes=[...slugs].sort((a,b)=>neighbors.get(b)!.size-neighbors.get(a)!.size || compare(nodes.get(a)!.title,nodes.get(b)!.title) || compare(a,b))
      .slice(0,3).map(slug=>({slug,title:nodes.get(slug)!.title}));
    return [group.id,{id:group.id,title:group.label,noteCount:slugs.length,notes,
      connections:[...connections.get(group.id)!].map(([id,count])=>({id,label:labels.get(id)!,count}))
        .sort((a,b)=>b.count-a.count || compare(a.label,b.label) || compare(a.id,b.id)),
    } satisfies GraphNeighborhoodPreview];
  }));
}

export function limitGraphPreviewItems<T extends {id:string}>(items:readonly T[], currentId:string|null=null) {
  const visible=items.slice(0,6);
  const current=items.find(item=>item.id===currentId);
  if(current && !visible.includes(current)) visible[visible.length-1]=current;
  return {items:visible,remaining:items.length-visible.length};
}

/** Try adjacent positions, preserving an unobstructed pointer path from the anchor. */
export function getGraphPreviewPlacement(anchor:GraphBounds, size:{width:number;height:number}, bounds:GraphBounds, obstacles:readonly GraphBounds[]):GraphPoint|null {
  const {width,height}=size;
  if(!Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0 || width>bounds.right-bounds.left || height>bounds.bottom-bounds.top) return null;
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
  const x=clamp((anchor.left+anchor.right-width)/2,bounds.left,bounds.right-width);
  const y=clamp(anchor.top,bounds.top,bounds.bottom-height);
  const candidates=[{x:anchor.right+10,y},{x:anchor.left-width-10,y},{x,y:anchor.bottom+10},{x,y:anchor.top-height-10}];
  for(const alternativeY of [anchor.bottom-height,(anchor.top+anchor.bottom-height)/2]) {
    const alignedY=clamp(alternativeY,bounds.top,bounds.bottom-height);
    candidates.push({x:anchor.right+10,y:alignedY},{x:anchor.left-width-10,y:alignedY});
  }
  for(const obstacle of obstacles) {
    candidates.push({x:obstacle.right+10,y},{x:obstacle.left-width-10,y},
      {x,y:obstacle.bottom+10},{x,y:obstacle.top-height-10});
  }
  return candidates.find(point=>{
    const box={left:point.x,right:point.x+width,top:point.y,bottom:point.y+height};
    return box.left>=bounds.left && box.top>=bounds.top && box.right<=bounds.right && box.bottom<=bounds.bottom &&
      ![anchor,...obstacles].some(other=>box.left<other.right+6 && box.right>other.left-6 && box.top<other.bottom+6 && box.bottom>other.top-6);
  }) ?? null;
}

/** One bottom-centered reading slot shared by every compact-screen preview. */
export function getGraphCompactPreviewPlacement(size:{width:number;height:number},bounds:GraphBounds,obstacles:readonly GraphBounds[]):GraphPoint|null {
  const {width,height}=size;
  if(!Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0 || width>bounds.right-bounds.left || height>bounds.bottom-bounds.top) return null;
  const x=(bounds.left+bounds.right-width)/2;
  let y=bounds.bottom-height;
  for(const other of [...obstacles].sort((a,b)=>b.top-a.top)) {
    if(x<other.right+6 && x+width>other.left-6 && y<other.bottom+6 && y+height>other.top-6) y=other.top-height-10;
  }
  return y>=bounds.top ? {x,y} : null;
}
