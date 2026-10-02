import { expect, it } from 'vitest';
import { isGraphNodeRevealed, getGraphNavigationGeometry, getGraphDisclosureVisibility } from '../src/client/graph-disclosure';
const overview={allNotes:false,expandedNeighborhood:null,detailLevel:'overview' as const,context:false};
it('hands off neighborhoods with a faster exit and a softly delayed reveal',()=>{
  expect(getGraphDisclosureVisibility(0,1,40,400)).toBe(0);
  expect(getGraphDisclosureVisibility(1,0,180,400)).toBe(0);
  expect(getGraphDisclosureVisibility(0,1,180,400)).toBeGreaterThan(0);
  expect(getGraphDisclosureVisibility(0,1,180,400)).toBeLessThan(1);
  expect(getGraphDisclosureVisibility(0,1,400,400)).toBe(1);
  expect(getGraphDisclosureVisibility(.4,1,0,400)).toBe(.4);
  expect(getGraphDisclosureVisibility(.4,0,0,400)).toBe(.4);
  expect(getGraphDisclosureVisibility(0,1,0,0)).toBe(1);
});
it('collapses grouped notes but keeps independent notes discoverable in overview',()=>{
  expect(isGraphNodeRevealed('research',overview)).toBe(false);
  expect(isGraphNodeRevealed(undefined,overview)).toBe(true);
});
it('reveals the selected neighborhood without revealing other groups or independents',()=>{
  const state={...overview,expandedNeighborhood:'research'};
  expect(isGraphNodeRevealed('research',state)).toBe(true);
  expect(isGraphNodeRevealed('apps',state)).toBe(false);
  expect(isGraphNodeRevealed(undefined,state)).toBe(false);
});
it('reveals notes through semantic zoom, search/focus/filter context, and real hover neighbors',()=>{
  expect(isGraphNodeRevealed('research',{...overview,detailLevel:'neighborhood'})).toBe(true);
  expect(isGraphNodeRevealed('research',{...overview,context:true})).toBe(true);
  expect(isGraphNodeRevealed('apps',{...overview,expandedNeighborhood:'research'},true)).toBe(true);
});
it('represents thirty notes by one navigation point without inventing notes or relationships',()=>{
  const members=Array.from({length:30},(_,i)=>`note${i}`);
  const positions=new Map(members.map((key,i)=>[key,{x:100+i,y:200}]));positions.set('alone',{x:-100,y:0});
  const original=structuredClone(positions);
  const geometry=getGraphNavigationGeometry([{id:'research',label:'Research',members,hubs:[]}],key=>positions.get(key),['alone']);
  expect(geometry.anchors).toEqual([{id:'research',x:114.5,y:200}]);
  expect(geometry.points).toHaveLength(3); // hub, anchor, independent
  expect(geometry.points).toContainEqual({x:0,y:0});
  expect(positions).toEqual(original);
});
it('keeps empty/missing geometry finite and supports a graph without communities',()=>{
  expect(getGraphNavigationGeometry([],()=>undefined,[])).toEqual({anchors:[],points:[]});
  expect(getGraphNavigationGeometry([],()=>({x:20,y:30}),['a']).points).toEqual([{x:20,y:30}]);
});

it('reveals every group and independent note in explicit all-notes mode at overview zoom',()=>{
  const state={...overview,allNotes:true};
  expect(isGraphNodeRevealed('research',state)).toBe(true);
  expect(isGraphNodeRevealed('apps',state)).toBe(true);
  expect(isGraphNodeRevealed(undefined,state)).toBe(true);
  expect(isGraphNodeRevealed('research',{...state,allNotes:false})).toBe(false);
});
