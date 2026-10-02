import { expect, it } from 'vitest';
import { getGraphMemoryNodeFrame, getGraphMemoryEdgeProgress } from '../src/client/graph-memory-transition';

const hidden={visibility:0,label:0,scale:.12};
const visible={visibility:1,label:1,scale:1};
it('reveals notes before their actual links and settles labels last within600ms',()=>{
  expect(getGraphMemoryNodeFrame(hidden,1,30,0,true)).toEqual(hidden);
  expect(getGraphMemoryNodeFrame(hidden,1,100,0,true).visibility).toBeGreaterThan(0);
  expect(getGraphMemoryNodeFrame(hidden,1,100,90,true).visibility).toBe(0);
  expect(getGraphMemoryEdgeProgress(0,1,140,0,true)).toBe(0);
  expect(getGraphMemoryEdgeProgress(0,1,300,90,true)).toBeGreaterThan(0);
  expect(getGraphMemoryNodeFrame(hidden,1,300,0,true).label).toBe(0);
  expect(getGraphMemoryEdgeProgress(0,1,510,90,true)).toBe(1);
  expect(getGraphMemoryNodeFrame(hidden,1,510,90,true).label).toBeLessThan(1);
  expect(getGraphMemoryNodeFrame(hidden,1,600,90,true)).toEqual(visible);
});
it('removes links and labels before notes finish retracting at350ms',()=>{
  expect(getGraphMemoryNodeFrame(visible,0,80,90,false).visibility).toBe(1);
  expect(getGraphMemoryNodeFrame(visible,0,100,0,false).label).toBe(0);
  expect(getGraphMemoryEdgeProgress(1,0,150,0,false)).toBe(0);
  expect(getGraphMemoryNodeFrame(visible,0,150,0,false).visibility).toBeGreaterThan(0);
  expect(getGraphMemoryNodeFrame(visible,0,350,0,false)).toEqual(hidden);
});
it('reverses from the current appearance and trace rather than jumping to an endpoint',()=>{
  const partial=getGraphMemoryNodeFrame(hidden,1,260,30,true);
  expect(getGraphMemoryNodeFrame(partial,0,0,30,false)).toEqual(partial);
  const closing=getGraphMemoryNodeFrame(partial,0,160,30,false);
  expect(getGraphMemoryNodeFrame(closing,1,0,30,true)).toEqual(closing);
  const edge=getGraphMemoryEdgeProgress(0,1,260,30,true);
  expect(getGraphMemoryEdgeProgress(edge,0,0,30,false)).toBe(edge);
  expect(getGraphMemoryEdgeProgress(edge,0,160,30,false)).toBe(0);
});
it('leaves already-visible independent notes and relationships unchanged',()=>{
  for(const opening of [true,false]) for(const elapsed of [-1,0,100,300,1000]) {
    expect(getGraphMemoryNodeFrame(visible,1,elapsed,90,opening)).toEqual(visible);
    expect(getGraphMemoryEdgeProgress(1,1,elapsed,90,opening)).toBe(1);
  }
});
