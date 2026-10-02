import { expect, it } from 'vitest';
import { layoutGraphNeighborhoods } from '../src/client/graph-neighborhood-layout';
import type { GraphLayoutRequest } from '../src/client/graph-overview-model';
import type { GraphNeighborhood } from '../src/client/graph-neighborhoods';
const groups: GraphNeighborhood[]=['a','b'].map(id=>({id,label:id,members:[id+'1',id+'2',id+'3'],hubs:[id+'1']}));
const request:GraphLayoutRequest={nodes:[...groups.flatMap(g=>g.members),'alone'].map((key,i)=>({key,x:i,y:i%3,size:8})),edges:groups.flatMap(g=>[
  {key:g.id+'12',source:g.members[0],target:g.members[1],weight:1},{key:g.id+'23',source:g.members[1],target:g.members[2],weight:1},
]),iterations:40};
it('packs connected communities without overlapping envelopes and keeps every node finite',()=>{
  const result=layoutGraphNeighborhoods(request,groups);
  expect(result.positions.map(p=>p.key).sort()).toEqual(request.nodes.map(n=>n.key).sort());
  expect(result.positions.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
  const envelope=(id:string)=>{const pts=result.positions.filter(p=>groups.find(group=>group.id===id)!.members.includes(p.key));return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};};
  const a=envelope('a'),b=envelope('b');
  expect(a.right+30<b.left || b.right+30<a.left || a.bottom+30<b.top || b.bottom+30<a.top).toBe(true);
  const connected=result.positions.filter(p=>p.key!=='alone');const alone=result.positions.find(p=>p.key==='alone')!;
  expect(Math.abs(alone.x)).toBeLessThan(Math.max(...connected.map(p=>Math.abs(p.x)))+250);
  expect(Math.abs(alone.y)).toBeLessThan(Math.max(...connected.map(p=>Math.abs(p.y)))+250);
});
it('is identical for reordered inputs, including worker fallback with zero iterations',()=>{
  for(const iterations of [0,40]) {
    const a=layoutGraphNeighborhoods({...request,iterations},groups);
    const b=layoutGraphNeighborhoods({...request,nodes:[...request.nodes].reverse(),edges:[...request.edges].reverse(),iterations},[...groups].reverse());
    expect(b).toEqual(a);
  }
});
it('handles empty, singleton, coincident and all-independent inputs',()=>{
  for(const nodes of [[],[{key:'one',x:0,y:0,size:8}],request.nodes.map(n=>({...n,x:0,y:0}))]) {
    const result=layoutGraphNeighborhoods({nodes,edges:[],iterations:0},[]);
    expect(result.positions).toHaveLength(nodes.length);
    expect(result.positions.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
    expect(new Set(result.positions.map(p=>`${p.x},${p.y}`)).size).toBe(nodes.length);
  }
});
it('leaves a clear center for the navigation hub instead of packing a neighborhood over it',()=>{
  const result=layoutGraphNeighborhoods(request,groups);
  const centers=groups.map(group=>{
    const points=result.positions.filter(point=>group.members.includes(point.key));
    return {x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
  });
  expect(centers.every(point=>Math.hypot(point.x,point.y)>200)).toBe(true);
  expect(Math.abs(Math.hypot(centers[0].x,centers[0].y)-Math.hypot(centers[1].x,centers[1].y))).toBeLessThan(1e-6);
  expect(result.positions.every(point=>Math.hypot(point.x,point.y)>100)).toBe(true);
});
