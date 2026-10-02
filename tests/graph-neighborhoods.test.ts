import { describe, expect, it } from 'vitest';
import type { ColoredGraphData } from '../src/lib/wiki-shared';
import { buildGraphNeighborhoods } from '../src/client/graph-neighborhoods';

function fixture(slugs: string[], links: [string,string,number?][]): ColoredGraphData {
  return {vaultId:'test',nodes:slugs.map(slug=>({slug,title:slug,categories:[],summary:'',wordCount:0,backlinkCount:0,neighbors:[]})),
    edges:links.map(([source,target,weight=1])=>({source,target,weight})),colorSources:{}};
}
const triads = () => fixture(['a','b','c','d','e','f','alone'],[
  ['a','b',3],['b','c',3],['c','a',3],['d','e',3],['e','f',3],['f','d',3],['c','d',.2],
]);

describe('connection-based neighborhoods',()=>{
  it('keeps dense triads separate across a weak bridge and retains independent notes',()=>{
    const result=buildGraphNeighborhoods(triads());
    expect(result.groups.map(group=>group.members)).toEqual([['a','b','c'],['d','e','f']]);
    expect(result.independent).toEqual(['alone']);
    expect([...result.membership.keys()].sort()).toEqual(['a','b','c','d','e','f']);
  });
  it('is deterministic across input order and never changes the source links',()=>{
    const data=triads(); const original=structuredClone(data);
    const first=buildGraphNeighborhoods(data);
    const shuffled=buildGraphNeighborhoods({...data,nodes:[...data.nodes].reverse(),edges:[...data.edges].reverse()});
    expect(shuffled).toEqual(first); expect(data).toEqual(original);
  });
  it('combines reciprocal evidence, ignores self/dangling/invalid edges, and never merges disconnected components',()=>{
    const data=triads(); data.edges=data.edges.filter(e=>e.weight!==.2);
    const clean=buildGraphNeighborhoods(data);
    data.edges=data.edges.flatMap(e=>[{...e,weight:e.weight/2},{source:e.target,target:e.source,weight:e.weight/2}]);
    data.edges.push({source:'a',target:'a',weight:100},{source:'a',target:'missing',weight:100},{source:'a',target:'d',weight:NaN});
    expect(buildGraphNeighborhoods(data)).toEqual(clean);
  });
  it('names groups only from their sources, falling back to a representative note and disambiguating duplicate names',()=>{
    const data=triads();
    for(const node of data.nodes) data.colorSources[node.slug]={topics:['Research'],folder:null};
    const result=buildGraphNeighborhoods(data);
    expect(result.groups.every(group=>group.label.startsWith('Research'))).toBe(true);
    expect(new Set(result.groups.map(group=>group.label)).size).toBe(2);
    expect(result.groups.every(group=>group.hubs.length<=2 && group.hubs.every(slug=>group.members.includes(slug)))).toBe(true);
    const withoutTopics=buildGraphNeighborhoods({...data,colorSources:{}});
    expect(withoutTopics.groups.map(group=>group.members)).toEqual(result.groups.map(group=>group.members));
    expect(withoutTopics.groups.every(group=>data.nodes.some(node=>node.title===group.label))).toBe(true);
  });
  it('handles empty, singleton, isolated and two-note graphs without inventing domains',()=>{
    for(const data of [fixture([],[]),fixture(['a'],[]),fixture(['a','b','c'],[]),fixture(['a','b'],[['a','b']])]) {
      const result=buildGraphNeighborhoods(data);
      expect(result.groups).toEqual([]); expect(result.independent).toEqual(data.nodes.map(n=>n.slug));
    }
  });
  it('partitions a thousand-node fixture completely within the bounded pass budget',()=>{
    const slugs=Array.from({length:1000},(_,i)=>`n${String(i).padStart(4,'0')}`);
    const edges: [string,string,number?][]=[];
    for(let i=0;i<999;i++) if(i%10!==9) edges.push([slugs[i],slugs[i+1]]);
    const result=buildGraphNeighborhoods(fixture(slugs,edges));
    const all=[...result.independent,...result.groups.flatMap(group=>group.members)].sort();
    expect(all).toEqual(slugs); expect(result.passes).toBeLessThanOrEqual(20);
  });
});
