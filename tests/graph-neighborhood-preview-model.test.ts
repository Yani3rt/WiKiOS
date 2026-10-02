import { expect, it } from 'vitest';
import type { GraphData } from '../src/lib/wiki-shared';
import type { GraphNeighborhood } from '../src/client/graph-neighborhoods';
import { buildGraphNeighborhoodPreviews, getGraphPreviewPlacement, limitGraphPreviewItems } from '../src/client/graph-neighborhood-preview-model';

function fixture() {
  const nodes=['a','b','c','d','e','f','alone'].map(slug=>({slug,title:slug.toUpperCase(),categories:[],wordCount:0,backlinkCount:0,summary:'',neighbors:[]}));
  const data:GraphData={nodes,edges:[['a','b'],['a','c'],['a','d'],['b','c'],['d','e'],['e','d'],['a','alone']].map(([source,target])=>({source,target,weight:1}))};
  const groups:GraphNeighborhood[]=[{id:'alpha',label:'Alpha',members:['a','b','c','d'],hubs:['a']},{id:'beta',label:'Beta',members:['e','f'],hubs:['e']}];
  return {data,groups};
}
it('previews the three most-connected actual members without counting external links as internal degree',()=>{
  const {data,groups}=fixture();
  const preview=buildGraphNeighborhoodPreviews(data,groups).get('alpha')!;
  expect(preview).toEqual({id:'alpha',title:'Alpha',noteCount:4,notes:[{slug:'a',title:'A'},{slug:'b',title:'B'},{slug:'c',title:'C'}],connections:[{id:'beta',label:'Beta',count:2}]});
});
it('deduplicates directed links and ignores self, invalid and nonpositive relationships',()=>{
  const {data,groups}=fixture();
  data.edges.push({source:'d',target:'e',weight:12},{source:'b',target:'a',weight:100},{source:'c',target:'c',weight:2},{source:'c',target:'missing',weight:1},{source:'c',target:'e',weight:0},{source:'b',target:'e',weight:NaN});
  groups[0].members.push('missing','a');
  const preview=buildGraphNeighborhoodPreviews(data,groups).get('alpha')!;
  expect(preview.noteCount).toBe(4);
  expect(preview.notes.map(n=>n.slug)).toEqual(['a','b','c']);
  expect(preview.connections).toEqual([{id:'beta',label:'Beta',count:2}]);
});
it('keeps output stable when input order changes and leaves sources untouched',()=>{
  const {data,groups}=fixture();const before=JSON.stringify({data,groups});
  const first=buildGraphNeighborhoodPreviews(data,groups);
  expect(JSON.stringify({data,groups})).toBe(before);
  const reverse=buildGraphNeighborhoodPreviews({...data,nodes:[...data.nodes].reverse(),edges:[...data.edges].reverse()},[...groups].reverse().map(g=>({...g,members:[...g.members].reverse()})));
  expect([...reverse]).toEqual([...first]);
});
it('bounds a thirty-note preview and does not invent group links for isolated notes',()=>{
  const {data}=fixture();data.nodes=Array.from({length:30},(_,i)=>({...data.nodes[0],slug:`n${i.toString().padStart(2,'0')}`,title:`Note ${i.toString().padStart(2,'0')}`}));data.edges=[];
  const preview=buildGraphNeighborhoodPreviews(data,[{id:'demo',label:'Graph Demo',members:data.nodes.map(n=>n.slug),hubs:[]}]).get('demo')!;
  expect(preview.noteCount).toBe(30);expect(preview.notes.map(n=>n.title)).toEqual(['Note 00','Note 01','Note 02']);expect(preview.connections).toEqual([]);
});
it('caps long directories at six but retains the current neighborhood',()=>{
  const items=Array.from({length:10},(_,i)=>({id:String(i)}));
  expect(limitGraphPreviewItems(items,'9')).toEqual({items:[{id:'0'},{id:'1'},{id:'2'},{id:'3'},{id:'4'},{id:'9'}],remaining:4});
  expect(limitGraphPreviewItems(items,'1').items.map(i=>i.id)).toEqual(['0','1','2','3','4','5']);
  expect(items).toHaveLength(10);expect(limitGraphPreviewItems([])).toEqual({items:[],remaining:0});
});
const bounds={left:20,top:80,right:620,bottom:500};
it('places beside an anchor without covering it and avoids obstructing controls',()=>{
  const anchor={left:250,top:180,right:330,bottom:240};
  expect(getGraphPreviewPlacement(anchor,{width:200,height:150},bounds,[])).toEqual({x:340,y:180});
  expect(getGraphPreviewPlacement(anchor,{width:200,height:150},bounds,[{left:340,top:80,right:620,bottom:500}])).toEqual({x:40,y:180});
});
it('keeps edge previews within usable bounds and gives up when no safe space exists',()=>{
  expect(getGraphPreviewPlacement({left:540,top:420,right:620,bottom:480},{width:200,height:150},bounds,[])).toEqual({x:330,y:350});
  expect(getGraphPreviewPlacement({left:250,top:180,right:330,bottom:240},{width:800,height:150},bounds,[])).toBeNull();
  expect(getGraphPreviewPlacement({left:250,top:180,right:330,bottom:240},{width:200,height:150},bounds,[bounds])).toBeNull();
  expect(getGraphPreviewPlacement({left:250,top:180,right:330,bottom:240},{width:NaN,height:150},bounds,[])).toBeNull();
});
it('can align a side preview upward to avoid another nearby anchor',()=>{
  expect(getGraphPreviewPlacement({left:374,top:142,right:466,bottom:208},{width:220,height:180},{left:20,top:60,right:580,bottom:480},[{left:236,top:262,right:364,bottom:334}])).toEqual({x:144,y:60});
});
it('moves past an adjacent anchor when all directly adjacent positions are obstructed',()=>{
  const obstacles=[{left:586,top:256,right:715,bottom:328},{left:584,top:426,right:718,bottom:492},{left:770,top:308,right:855,bottom:374},{left:497,top:118,right:604,bottom:184}];
  expect(getGraphPreviewPlacement({left:715,top:118,right:787,bottom:184},{width:288,height:280},{left:20,top:84,right:1260,bottom:496},obstacles)).toEqual({x:865,y:118});
});
